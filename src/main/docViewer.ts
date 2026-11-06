import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  type BaseWindow,
  ipcMain,
  protocol,
  type Session,
  session,
  shell,
  type WebContents,
  WebContentsView
} from 'electron'
import {
  OVERLAY_KEYS,
  type OverlayEvent,
  type OverlayItem,
  type OverlayKey,
  type OverlayMode,
  type OverlayRect,
  type SelectionAction
} from '../shared/annotations'
import type { ViewerBounds, ViewerFrame, ViewerKey, ViewerPlacement, ViewerState, ViewerWheel } from '../shared/types'
import { parseAnchor } from './annotationStore'
import {
  assetContentType,
  DOC_SCHEME,
  docUrl,
  isExternalUrl,
  isRequestAllowed,
  MARKDOWN_CSP,
  resolveAssetPath
} from './docPolicy'
import { markdownPage } from './markdownPage'
import { formatOf } from './scanner'

const DOC_PARTITION = 'persist:documents'
const ERR_ABORTED = -3
/** Promień arkusza. Cień i krawędź rysuje powłoka pod widokiem. */
const SHEET_RADIUS = 16
/** Dokument dostaje cichy pasek przewijania, a własny styl dokumentu i tak wygrywa. */
const QUIET_SCROLLBAR = 'html { scrollbar-width: thin; scrollbar-color: rgb(128 128 128 / .4) transparent; }'

/** Musi zostać wywołane przed `app.ready`. */
export function registerDocScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: DOC_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

interface DocViewerOptions {
  window: BaseWindow
  allowedHosts: readonly string[]
  /** Plik do wyświetlenia: oryginał albo zachowana kopia. */
  lookupDocPath: (docId: string) => string | undefined
  onState: (state: ViewerState) => void
  onOverlayEvent: (docId: string, event: OverlayEvent) => void
  /** Warstwa w dokumencie jest gotowa na przyjęcie uwag. */
  onOverlayReady: (docId: string) => void
  onKey: (key: ViewerKey) => void
  onFocus: (docId: string) => void
  /** Kolejność widoków się zmieniła, więc to, co ma leżeć nad nimi, wraca na wierzch. */
  onStacked: () => void
}

interface OpenView {
  docId: string
  view: WebContentsView
  state: ViewerState
}

/** Strona działająca w sesji dokumentów. Tylko ona dostaje treść swojego dokumentu. */
interface Guest {
  docId: string
  onBlocked?: (url: string) => void
}

function parseRect(value: unknown): OverlayRect | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y, width, height } = value as Record<string, unknown>
  if (![x, y, width, height].every((part) => Number.isFinite(part))) return null
  return { x: x as number, y: y as number, width: width as number, height: height as number }
}

/** Zdarzenie przychodzi z procesu dokumentu, więc sprawdzamy jego kształt. */
function parseOverlayEvent(value: unknown): OverlayEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const event = value as Record<string, unknown>
  switch (event.type) {
    case 'place': {
      const anchor = parseAnchor(event.anchor)
      const kind = event.kind
      const rect = parseRect(event.rect)
      if (!anchor || !rect || (kind !== 'comment' && kind !== 'sticky')) return null
      return { type: 'place', kind, anchor, rect }
    }
    case 'select':
      return typeof event.id === 'string'
        ? { type: 'select', id: event.id, rect: parseRect(event.rect) }
        : null
    case 'focused':
      return typeof event.id === 'string'
        ? { type: 'focused', id: event.id, rect: parseRect(event.rect) }
        : null
    case 'orphans':
      return Array.isArray(event.ids)
        ? { type: 'orphans', ids: event.ids.filter((id): id is string => typeof id === 'string') }
        : null
    case 'shortcut':
      return OVERLAY_KEYS.includes(event.key as OverlayKey)
        ? { type: 'shortcut', key: event.key as OverlayKey, shift: event.shift === true, ctrl: event.ctrl === true }
        : null
    case 'selection':
      return { type: 'selection', active: event.active === true }
    case 'positions': {
      if (!Array.isArray(event.items)) return null
      const items = event.items.flatMap((item: unknown) => {
        const { id, rect } = (item ?? {}) as Record<string, unknown>
        const parsed = parseRect(rect)
        return typeof id === 'string' && parsed ? [{ id, rect: parsed }] : []
      })
      return { type: 'positions', items }
    }
    default:
      return null
  }
}

/** Skróty apki, które dokument ma oddać, zanim je zobaczą jego skrypty. */
function isAppChord(key: string, ctrl: boolean): boolean {
  return ctrl && ['k', 'b', '\\'].includes(key.toLowerCase())
}

/** Odstawiony widok ma jeden piksel w rogu okna, a tam arkusz jest zaokrąglony i niewidoczny. */
function parked({ width, height }: ViewerBounds): ViewerBounds {
  return { x: 1 - width, y: 1 - height, width, height }
}

/**
 * Wyświetla dokumenty w osobnych WebContentsView. Każdy dokument ma własny origin
 * `htmldoc://<id>/`, więc dokumenty nie współdzielą stanu ani procesu, a ich `localStorage`
 * działa normalnie.
 *
 * Widok leży nad całą powłoką, więc wszystko, co się rusza albo na niego nachodzi, rysuje
 * powłoka na zrzucie. W tym czasie widok czeka odstawiony: dalej działa i przelicza układ,
 * dzięki czemu po zatrzymaniu ruchu dokument ma już właściwą szerokość.
 */
export class DocViewer {
  private readonly documents: Session
  private readonly views = new Map<string, OpenView>()
  private readonly guests = new Map<number, Guest>()
  /** Widoki na ekranie, od spodu. Pozwala nie przekładać ich bez potrzeby. */
  private stack: string[] = []

  constructor(private readonly options: DocViewerOptions) {
    this.documents = session.fromPartition(DOC_PARTITION)
    this.configureSession()
    ipcMain.on('doc:open-external', (event, url: unknown) => {
      if (this.viewOf(event.sender) && typeof url === 'string' && isExternalUrl(url)) {
        void shell.openExternal(url)
      }
    })
    ipcMain.on('overlay:event', (event, payload: unknown) => {
      const open = this.viewOf(event.sender)
      if (!open) return
      const parsed = parseOverlayEvent(payload)
      if (parsed) this.options.onOverlayEvent(open.docId, parsed)
    })
    ipcMain.on('overlay:ready', (event) => {
      const open = this.viewOf(event.sender)
      if (open) this.options.onOverlayReady(open.docId)
    })
  }

  get session(): Session {
    return this.documents
  }

  /** Wpuszcza stronę do sesji dokumentów, np. ukryte okno robiące miniaturę. */
  admit(contents: WebContents, docId: string): void {
    const known = this.guests.has(contents.id)
    this.guests.set(contents.id, { docId })
    if (known) return
    contents.once('destroyed', () => this.guests.delete(contents.id))
    this.confine(contents)
  }

  /** Strona zostaje przy swoim dokumencie: bez nowych okien, nawigacji i bezpośrednich połączeń. */
  private confine(contents: WebContents): void {
    contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event) => {
      if (new URL(event.url).hostname !== this.guests.get(contents.id)?.docId) event.preventDefault()
    })
  }

  openDocIds(): string[] {
    return [...this.views.keys()]
  }

  private viewOf(sender: WebContents): OpenView | undefined {
    const docId = this.guests.get(sender.id)?.docId
    const open = docId === undefined ? undefined : this.views.get(docId)
    return open?.view.webContents === sender ? open : undefined
  }

  private send(docId: string, channel: string, payload: unknown): void {
    this.views.get(docId)?.view.webContents.send(channel, payload)
  }

  setOverlayMode(docId: string, mode: OverlayMode): void {
    this.send(docId, 'overlay:mode', mode)
  }

  setOverlayItems(docId: string, items: OverlayItem[]): void {
    this.send(docId, 'overlay:items', items)
  }

  focusOverlayItem(docId: string, id: string | null): void {
    this.send(docId, 'overlay:focus', id)
  }

  trackOverlay(docId: string, on: boolean): void {
    this.send(docId, 'overlay:track', on)
  }

  runSelectionAction(docId: string, action: SelectionAction): void {
    if (action === 'copy') this.views.get(docId)?.view.webContents.copy()
    this.send(docId, 'overlay:selection', action)
  }

  /** Przekazuje fokus do dokumentu, żeby skróty klawiszowe i Escape działały od razu. */
  focus(docId: string): void {
    this.views.get(docId)?.view.webContents.focus()
  }

  /** Dok leży nad dokumentem, więc kółko nad nim trafia tu z powłoki. */
  wheel(docId: string, { x, y, deltaX, deltaY }: ViewerWheel): void {
    this.views.get(docId)?.view.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX, deltaY, canScroll: true })
  }

  open(docId: string): void {
    if (this.views.has(docId)) return

    const view = new WebContentsView({
      webPreferences: {
        session: this.documents,
        preload: join(__dirname, '../preload/doc.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        navigateOnDragDrop: false,
        spellcheck: false,
        // Dokument nie zauważa, że powłoka podmieniła go na zrzut.
        backgroundThrottling: false
      }
    })
    view.setBackgroundColor('#ffffff')
    view.setBorderRadius(SHEET_RADIUS)
    view.setBounds(parked({ x: 0, y: 0, width: 800, height: 600 }))
    this.options.window.contentView.addChildView(view)
    this.options.onStacked()

    const open: OpenView = {
      docId,
      view,
      state: { docId, status: 'loading', blockedRequests: 0, blockedHosts: [] }
    }
    this.views.set(docId, open)
    this.stack.push(docId)
    this.options.onState(open.state)

    const contents = view.webContents
    const isCurrent = (): boolean => this.views.get(docId) === open
    this.guests.set(contents.id, { docId, onBlocked: (url) => this.recordBlocked(open, url) })

    this.confine(contents)
    contents.on('dom-ready', () => {
      void contents.insertCSS(QUIET_SCROLLBAR, { cssOrigin: 'user' }).catch(() => {
        // Domyślny pasek przewijania też działa.
      })
    })
    contents.on('did-finish-load', () => {
      if (isCurrent()) this.setState(open, { ...open.state, status: 'ready' })
    })
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isCurrent() && isMainFrame && code !== ERR_ABORTED) {
        this.setState(open, { ...open.state, status: 'error' })
      }
    })
    contents.on('render-process-gone', () => {
      if (isCurrent()) this.setState(open, { ...open.state, status: 'error' })
    })
    contents.on('focus', () => {
      if (isCurrent()) this.options.onFocus(docId)
    })
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' && input.type !== 'keyUp') return
      const type = input.type === 'keyDown' ? 'down' : 'up'
      const ctrl = input.control || input.meta
      const alone = input.key === 'Control' || input.key === 'Meta'
      const chord = isAppChord(input.key, ctrl)
      if (chord) event.preventDefault()
      if (input.isAutoRepeat) return
      if (alone || chord || (ctrl && type === 'down')) {
        this.options.onKey({ type, key: input.key, code: input.code, ctrl, shift: input.shift, alt: input.alt })
      }
    })

    void contents.loadURL(docUrl(docId)).catch(() => {
      // Błąd ładowania zgłasza `did-fail-load`.
    })
  }

  close(docId: string): void {
    const open = this.views.get(docId)
    if (!open) return
    this.views.delete(docId)
    this.stack = this.stack.filter((id) => id !== docId)
    this.guests.delete(open.view.webContents.id)
    this.options.window.contentView.removeChildView(open.view)
    open.view.webContents.close()
  }

  closeAll(): void {
    for (const docId of this.openDocIds()) this.close(docId)
  }

  reload(docId: string): void {
    const open = this.views.get(docId)
    if (!open) return
    this.setState(open, { ...open.state, status: 'loading', blockedRequests: 0, blockedHosts: [] })
    open.view.webContents.reloadIgnoringCache()
  }

  /** Ustawia widoki od spodu do góry. Widok nieżywy zostaje odstawiony i tylko zmienia rozmiar. */
  setLayout(placements: ViewerPlacement[]): void {
    for (const { docId, bounds, live } of placements) {
      this.views.get(docId)?.view.setBounds(live ? bounds : parked(bounds))
    }
    const order = placements.filter(({ live }) => live).map(({ docId }) => docId)
    const stacked = this.stack.filter((docId) => order.includes(docId))
    if (order.every((docId, index) => stacked[index] === docId)) return
    for (const docId of order) {
      const open = this.views.get(docId)
      if (open) this.options.window.contentView.addChildView(open.view)
    }
    this.stack = [...this.stack.filter((docId) => !order.includes(docId)), ...order]
    this.options.onStacked()
  }

  async capture(docId: string): Promise<ViewerFrame | null> {
    const open = this.views.get(docId)
    if (!open) return null
    try {
      const image = await open.view.webContents.capturePage()
      if (image.isEmpty()) return null
      const { width, height } = image.getSize()
      return { width, height, data: image.toBitmap() }
    } catch {
      // Strona jeszcze niczego nie narysowała, więc nie ma czego pokazać.
      return null
    }
  }

  private setState(open: OpenView, state: ViewerState): void {
    open.state = state
    this.options.onState(state)
  }

  private recordBlocked(open: OpenView, url: string): void {
    let host = url
    try {
      host = new URL(url).host || url
    } catch {
      // Niepoprawny adres pokazujemy w całości.
    }
    this.setState(open, {
      ...open.state,
      blockedRequests: open.state.blockedRequests + 1,
      blockedHosts: [...new Set([...open.state.blockedHosts, host])]
    })
  }

  private configureSession(): void {
    const { documents } = this

    documents.protocol.handle(DOC_SCHEME, (request) => this.serve(request))

    documents.webRequest.onBeforeRequest((details, respond) => {
      const guest = details.webContentsId === undefined ? undefined : this.guests.get(details.webContentsId)
      const allowed = isRequestAllowed({
        url: details.url,
        documentHost: guest?.docId ?? null,
        allowedHosts: this.options.allowedHosts
      })
      if (!allowed) guest?.onBlocked?.(details.url)
      respond({ cancel: !allowed })
    })

    documents.setPermissionRequestHandler((_contents, permission, respond) => {
      respond(permission === 'clipboard-sanitized-write')
    })
    documents.setPermissionCheckHandler((_contents, permission) => {
      return permission === 'clipboard-sanitized-write'
    })
    documents.on('will-download', (event) => event.preventDefault())
  }

  private isServed(docId: string): boolean {
    return [...this.guests.values()].some((guest) => guest.docId === docId)
  }

  private async serve(request: Request): Promise<Response> {
    const { hostname, pathname } = new URL(request.url)
    const docPath = this.isServed(hostname) ? this.options.lookupDocPath(hostname) : undefined
    if (!docPath) return new Response('Nie znaleziono dokumentu', { status: 404 })

    try {
      if (pathname === '/' && formatOf(docPath) === 'markdown') {
        const page = markdownPage(await readFile(docPath, 'utf8'), basename(docPath))
        return new Response(page, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': MARKDOWN_CSP,
            'Cache-Control': 'no-store'
          }
        })
      }
      if (pathname === '/') {
        return new Response(await readFile(docPath), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
        })
      }
      const assetPath = await resolveAssetPath(docPath, pathname)
      const contentType = assetPath && assetContentType(assetPath)
      if (!assetPath || !contentType) return new Response('Nie znaleziono', { status: 404 })
      return new Response(await readFile(assetPath), { headers: { 'Content-Type': contentType } })
    } catch {
      return new Response('Nie można odczytać pliku', { status: 500 })
    }
  }
}
