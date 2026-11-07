import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type BaseWindow,
  ipcMain,
  nativeTheme,
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
  type SelectionAction,
  type ShapeTool,
  type StickyColor
} from '../shared/annotations'
import type { CameraMove, CameraShot } from '../shared/camera'
import { type PickKind, parseStepCamera, type PresentState, type RouteFrame } from '../shared/presentation'
import { type Language, language, t } from '../shared/i18n'
import type { LinkOutcome, LinkPreview } from '../shared/links'
import { type OutlineCommand, parseOutline } from '../shared/outline'
import { type FindCommand, parseTextQuery, type TextQuery, type TextSpan } from '../shared/textSearch'
import type { ViewerBounds, ViewerFrame, ViewerKey, ViewerPlacement, ViewerState, ViewerWheel } from '../shared/types'
import { MAX_HIGHLIGHT_QUOTE, parseAnchor, parseShape, parseStickyColor, parseStrokes } from './annotationStore'
import { DocCamera } from './docCamera'
import {
  assetContentType,
  DOC_SCHEME,
  docUrl,
  isExternalUrl,
  isRequestAllowed,
  MARKDOWN_CSP,
  resolveAssetPath
} from './docPolicy'
import { MARKDOWN_BACKGROUND } from './markdownPage'
import { formatOf } from './scanner'

const DOC_PARTITION = 'persist:documents'
const ERR_ABORTED = -3
/** Promień arkusza. Cień i krawędź rysuje powłoka pod widokiem. */
const SHEET_RADIUS = 16
/** Dokument dostaje cichy pasek przewijania, a własny styl dokumentu i tak wygrywa. */
const QUIET_SCROLLBAR = 'html { scrollbar-width: thin; scrollbar-color: rgb(128 128 128 / .4) transparent; }'
/** Dokument HTML to biała kartka, póki sam nie ustawi tła. */
const HTML_BACKGROUND = '#ffffff'
/** Tyle dostaje dokument na zdjęcie wskaźnika, zanim powstanie zrzut. */
const POINTER_WITHDRAW_MS = 40
/** Pusta strona nie zgłasza pierwszego rysowania, więc po wczytaniu czeka tylko tyle. */
const PAINT_FALLBACK_MS = 120
/** Zapasowy widok powstaje chwilę po otwarciu, a przy starcie ustępuje miejsca powłoce. */
const SPARE_DELAY_MS = 100
const SPARE_START_DELAY_MS = 1000
/** Pusta strona nie przypisuje procesu do żadnego adresu, więc dokument może w nim zamieszkać. */
const SPARE_URL = 'about:blank#zapas'

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
  /** Składanie Markdownu to czysty procesor, więc nie może działać w tym wątku. */
  renderMarkdown: (docPath: string) => Promise<string>
  onState: (state: ViewerState) => void
  onOverlayEvent: (docId: string, event: OverlayEvent) => void
  /** Warstwa w dokumencie jest gotowa na przyjęcie uwag. */
  onOverlayReady: (docId: string) => void
  onKey: (key: ViewerKey) => void
  onFocus: (docId: string) => void
  /** Kolejność widoków się zmieniła, więc to, co ma leżeć nad nimi, wraca na wierzch. */
  onStacked: () => void
  /** Prawdziwie kliknięty link do pliku w dokumencie. */
  openLink: (docId: string, href: string, peek: boolean) => Promise<LinkOutcome>
  previewLink: (docId: string, href: string) => Promise<LinkPreview | null>
  /** Liczy wyrażenie regularne poza stroną dokumentu. */
  matchPage: (text: string, query: TextQuery) => Promise<TextSpan[] | 'pattern' | 'slow'>
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

function parseFindEvent(value: unknown): OverlayEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const { count, active, capped, failure } = value as Record<string, unknown>
  if (!Number.isInteger(count) || !Number.isInteger(active)) return null
  const known = failure === 'pattern' || failure === 'slow' || failure === 'index'
  return { type: 'find', state: { count: count as number, active: active as number, capped: capped === true, failure: known ? failure : null } }
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
    case 'highlight': {
      const anchor = parseAnchor(event.anchor, MAX_HIGHLIGHT_QUOTE)
      const color = parseStickyColor(event.color)
      const strokes = parseStrokes(event.strokes)
      const anchorWidth = Number(event.anchorWidth)
      return anchor && color && strokes ? { type: 'highlight', color, anchor, strokes, anchorWidth } : null
    }
    case 'shape': {
      const anchor = parseAnchor(event.anchor)
      const color = parseStickyColor(event.color)
      const shape = parseShape(event.shape)
      return anchor && color && shape ? { type: 'shape', color, anchor, shape } : null
    }
    case 'erase':
      return typeof event.id === 'string' ? { type: 'erase', id: event.id } : null
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
    case 'route-pick': {
      const camera = parseStepCamera(event.camera, (value) => parseAnchor(value))
      return camera && camera.kind !== 'hold' ? { type: 'route-pick', camera } : null
    }
    case 'route-missing':
      return Array.isArray(event.ids)
        ? { type: 'route-missing', ids: event.ids.filter((id): id is string => typeof id === 'string') }
        : null
    case 'shortcut':
      return OVERLAY_KEYS.includes(event.key as OverlayKey)
        ? { type: 'shortcut', key: event.key as OverlayKey, shift: event.shift === true, ctrl: event.ctrl === true }
        : null
    case 'selection':
      return { type: 'selection', active: event.active === true }
    case 'find':
      return parseFindEvent(event.state)
    case 'find-seed':
      return typeof event.text === 'string' ? { type: 'find-seed', text: event.text } : null
    case 'positions': {
      if (!Array.isArray(event.items)) return null
      const items = event.items.flatMap((item: unknown) => {
        const { id, rect } = (item ?? {}) as Record<string, unknown>
        const parsed = parseRect(rect)
        return typeof id === 'string' && parsed ? [{ id, rect: parsed }] : []
      })
      return { type: 'positions', items }
    }
    case 'outline': {
      const headings = parseOutline(event.headings)
      return headings ? { type: 'outline', headings } : null
    }
    case 'outline-at':
      return Number.isInteger(event.index) ? { type: 'outline-at', index: Math.max(-1, event.index as number) } : null
    default:
      return null
  }
}

/** Skróty apki, które dokument ma oddać, zanim je zobaczą jego skrypty. */
function isAppChord(key: string, ctrl: boolean): boolean {
  return (ctrl && ['k', 'b', 'f', ',', '\\'].includes(key.toLowerCase())) || key === 'F3' || key === 'F4'
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
  private pointer = false
  private marker: StickyColor | null = null
  private shaper: ShapeTool | null = null
  /** Dokumenty, w których użytkownik schował rysunki. */
  private hiddenDrawings = new Set<string>()
  /** Kadry trasy pokazywane w dokumencie, gdy formularz trasy jest otwarty. */
  private readonly routes = new Map<string, { frames: RouteFrame[]; selected: string | null }>()
  /** Dokument, w którym formularz czeka na wskazanie kadru. */
  private readonly pickers = new Map<string, PickKind>()
  /** Krok prezentacji, który dokument pokazuje. */
  private readonly presents = new Map<string, PresentState>()
  private minimap = false
  /** Ostatnie szukanie w dokumencie. Wraca, gdy strona wczyta się od nowa. */
  private readonly finds = new Map<string, FindCommand>()
  /** Kotwice z linków do dokumentów, które dopiero się otworzą. */
  private readonly aims = new Map<string, string>()
  /** Pusty widok z gotowym procesem. Start procesu to największa część otwarcia dokumentu. */
  private spare: WebContentsView | null = null
  private spareTimer: NodeJS.Timeout | null = null
  /** Rozmiar, z jakim rodzi się nowy widok. Układ strony od razu jest prawie właściwy. */
  private restingSize: ViewerBounds = { x: 0, y: 0, width: 800, height: 600 }
  private readonly camera = new DocCamera()

  constructor(private readonly options: DocViewerOptions) {
    this.documents = session.fromPartition(DOC_PARTITION)
    this.configureSession()
    this.scheduleSpare(SPARE_START_DELAY_MS)
    ipcMain.on('doc:open-external', (event, url: unknown) => {
      if (this.viewOf(event.sender) && typeof url === 'string' && isExternalUrl(url)) {
        void shell.openExternal(url)
      }
    })
    this.handleDoc('doc:open-link', (docId, href, peek) => this.options.openLink(docId, href, peek === true), 'none')
    this.handleSheet('doc:link-preview', (docId, href) => this.options.previewLink(docId, href), null)
    this.handleDoc<TextSpan[] | 'pattern' | 'slow'>(
      'doc:find-pattern',
      async (_docId, text, query) => {
        const parsed = parseTextQuery(query)
        return parsed ? this.options.matchPage(text, parsed) : 'pattern'
      },
      'pattern'
    )
    // Widok powstaje, zanim wiadomo, co w nim zamieszka, więc strona pyta o to po wczytaniu.
    ipcMain.removeHandler('doc:is-sheet')
    ipcMain.handle('doc:is-sheet', (event) => {
      const docId = this.viewOf(event.sender)?.docId
      return docId !== undefined && this.isSheet(docId)
    })
    ipcMain.on('overlay:event', (event, payload: unknown) => {
      const open = this.viewOf(event.sender)
      if (!open) return
      const parsed = parseOverlayEvent(payload)
      if (parsed) this.options.onOverlayEvent(open.docId, parsed)
    })
    ipcMain.on('camera:reply', (event, id: unknown, result: unknown) => {
      if (this.viewOf(event.sender)) this.camera.reply(event.sender, id, result)
    })
    ipcMain.on('doc:painted', (event) => {
      const open = this.viewOf(event.sender)
      if (open) this.markReady(open)
    })
    ipcMain.on('overlay:ready', (event) => {
      const open = this.viewOf(event.sender)
      if (!open) return
      this.options.onOverlayReady(open.docId)
      this.send(open.docId, 'overlay:language', language())
      // Dokument otwarty albo przeładowany w trakcie prezentacji też ma pokazać rękę.
      if (this.pointer) this.send(open.docId, 'overlay:pointer', true)
      if (this.marker) this.send(open.docId, 'overlay:marker', this.marker)
      if (this.shaper) this.send(open.docId, 'overlay:shaper', this.shaper)
      if (this.hiddenDrawings.has(open.docId)) this.send(open.docId, 'overlay:drawings', false)
      const route = this.routes.get(open.docId)
      if (route) this.send(open.docId, 'overlay:route', route)
      const picker = this.pickers.get(open.docId)
      if (picker) this.send(open.docId, 'overlay:pick', picker)
      const present = this.presents.get(open.docId)
      // Przeładowany dokument nie ma już czego rysować, więc kształty stają od razu.
      if (present) this.send(open.docId, 'overlay:present', { ...present, pending: [] })
      if (this.minimap) this.send(open.docId, 'minimap:show', true)
      const find = this.finds.get(open.docId)
      if (find) this.send(open.docId, 'find:command', find)
    })
  }

  get session(): Session {
    return this.documents
  }

  /** Kanał tylko dla żywego widoku. Odpowiedź trafia do odizolowanego świata, a nie do skryptów dokumentu. */
  private handleDoc<Result>(
    channel: string,
    listener: (docId: string, href: string, flag: unknown) => Promise<Result>,
    refused: Result
  ): void {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (event, href: unknown, flag: unknown) => {
      const docId = this.viewOf(event.sender)?.docId
      if (docId === undefined || typeof href !== 'string') return refused
      return listener(docId, href, flag)
    })
  }

  /** Dane innych dokumentów dostaje tylko arkusz Markdownu. Nie ma skryptów, które mogłyby je czytać. */
  private handleSheet<Result>(
    channel: string,
    listener: (docId: string, href: string, flag: unknown) => Promise<Result>,
    refused: Result
  ): void {
    this.handleDoc(channel, async (docId, href, flag) => (this.isSheet(docId) ? listener(docId, href, flag) : refused), refused)
  }

  private isSheet(docId: string): boolean {
    const docPath = this.options.lookupDocPath(docId)
    return docPath !== undefined && formatOf(docPath) === 'markdown'
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
      // Dokument ma jedną stronę, `/`. Każdy inny adres to 404 albo goły plik, a stamtąd nie ma powrotu.
      const { hostname, pathname } = new URL(event.url)
      if (hostname !== this.guests.get(contents.id)?.docId || pathname !== '/') event.preventDefault()
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

  setLanguage(next: Language): void {
    for (const docId of this.views.keys()) this.send(docId, 'overlay:language', next)
  }

  setPointer(on: boolean): void {
    this.pointer = on
    for (const docId of this.views.keys()) this.send(docId, 'overlay:pointer', on)
  }

  /** Kształt też działa na wszystkich arkuszach. `null` wyłącza narzędzie. */
  setShaper(tool: ShapeTool | null): void {
    this.shaper = tool
    for (const docId of this.views.keys()) this.send(docId, 'overlay:shaper', tool)
  }

  /** Pełna lista dokumentów ze schowanymi rysunkami. Powłoka pamięta ją między uruchomieniami. */
  setHiddenDrawings(docIds: string[]): void {
    const next = new Set(docIds)
    for (const docId of this.views.keys()) {
      if (next.has(docId) !== this.hiddenDrawings.has(docId)) this.send(docId, 'overlay:drawings', !next.has(docId))
    }
    this.hiddenDrawings = next
  }

  /** Kadry kroków do pokazania w dokumencie. `null` je chowa. */
  setRoute(docId: string, route: { frames: RouteFrame[]; selected: string | null } | null): void {
    if (route) this.routes.set(docId, route)
    else this.routes.delete(docId)
    this.send(docId, 'overlay:route', route)
  }

  /** Dokument czeka na kliknięcie albo przeciągnięcie, które wskaże kadr. `null` kończy czekanie. */
  setPicker(docId: string, kind: PickKind | null): void {
    if (kind) this.pickers.set(docId, kind)
    else this.pickers.delete(docId)
    this.send(docId, 'overlay:pick', kind)
  }

  /** Krok prezentacji: maska wokół kadru i uwagi, które widać. `null` kończy prezentację. */
  setPresent(docId: string, state: PresentState | null): void {
    if (state) this.presents.set(docId, state)
    else this.presents.delete(docId)
    this.send(docId, 'overlay:present', state)
  }

  /** Szkic nowej uwagi w prezentacji, przy kadrze kroku. */
  placeNote(docId: string, kind: 'comment' | 'sticky', color: StickyColor): void {
    this.send(docId, 'overlay:place', { kind, color })
  }

  setMarker(color: StickyColor | null): void {
    this.marker = color
    for (const docId of this.views.keys()) this.send(docId, 'overlay:marker', color)
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

  /** Minimapa przy krawędzi arkusza, wspólna dla wszystkich dokumentów. */
  setMinimap(on: boolean): void {
    this.minimap = on
    for (const docId of this.views.keys()) this.send(docId, 'minimap:show', on)
  }

  outline(docId: string, command: OutlineCommand): void {
    this.send(docId, 'outline:command', command)
  }

  /** Dokument, który jeszcze się ładuje, dostanie zapytanie po starcie swojej warstwy. */
  find(docId: string, command: FindCommand): void {
    if (command.type === 'set') this.finds.set(docId, command)
    if (command.type === 'clear') this.finds.delete(docId)
    this.send(docId, 'find:command', command)
  }

  /** Przekazuje fokus do dokumentu, żeby skróty klawiszowe i Escape działały od razu. */
  focus(docId: string): void {
    this.views.get(docId)?.view.webContents.focus()
  }

  /** Ustawia kamerę dokumentu na kadrze, a `null` wraca do całej strony. */
  aimCamera(docId: string, shot: CameraShot | null): Promise<CameraMove | null> {
    const open = this.views.get(docId)
    return open ? this.camera.aim(open.view.webContents, shot) : Promise.resolve(null)
  }

  /** Dok leży nad dokumentem, więc kółko nad nim trafia tu z powłoki. */
  wheel(docId: string, { x, y, deltaX, deltaY }: ViewerWheel): void {
    this.views.get(docId)?.view.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX, deltaY, canScroll: true })
  }

  private createView(): WebContentsView {
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
    view.setBorderRadius(SHEET_RADIUS)
    view.setBounds(parked(this.restingSize))
    this.options.window.contentView.addChildView(view)
    this.options.onStacked()
    return view
  }

  /** Ładowanie pustej strony uruchamia proces, a dokument wchodzi potem do niego. */
  private scheduleSpare(delay = SPARE_DELAY_MS): void {
    if (this.spareTimer) clearTimeout(this.spareTimer)
    this.spareTimer = setTimeout(() => {
      this.spareTimer = null
      if (this.spare) return
      this.spare = this.createView()
      void this.spare.webContents.loadURL(SPARE_URL).catch(() => {
        // Bez zapasu dokument otworzy się tak samo, tylko chwilę dłużej.
      })
    }, delay)
  }

  /** Okno zniknęło, więc zapasowy widok nie ma już gdzie stanąć. */
  dispose(): void {
    if (this.spareTimer) clearTimeout(this.spareTimer)
    this.spareTimer = null
    if (this.spare && !this.spare.webContents.isDestroyed()) this.spare.webContents.close()
    this.spare = null
  }

  open(docId: string): void {
    if (this.views.has(docId)) return

    const view = this.spare ?? this.createView()
    this.spare = null
    this.scheduleSpare()
    view.setBackgroundColor(this.backgroundOf(docId))

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
      setTimeout(() => {
        if (isCurrent() && !contents.isDestroyed()) this.markReady(open)
      }, PAINT_FALLBACK_MS)
    })
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isCurrent() && isMainFrame && code !== ERR_ABORTED) {
        this.setState(open, { ...open.state, status: 'error' })
      }
    })
    // Nowa strona zaczyna bez powiększenia, więc kamera oddaje debugger.
    contents.on('did-navigate', () => this.camera.forget(contents))
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

    const aim = this.aims.get(docId)
    this.aims.delete(docId)
    void contents.loadURL(aim ? `${docUrl(docId)}#${aim}` : docUrl(docId)).catch(() => {
      // Błąd ładowania zgłasza `did-fail-load`.
    })
  }

  /** Przewija dokument do kotwicy z linku. Zamknięty dostanie ją przy otwarciu. */
  aim(docId: string, fragment: string): void {
    const open = this.views.get(docId)
    if (!open) {
      this.aims.set(docId, fragment)
      return
    }
    void open.view.webContents.loadURL(`${docUrl(docId)}#${fragment}`).catch(() => {
      // Kotwica, której nie ma, po prostu niczego nie przewija.
    })
  }

  private backgroundOf(docId: string): string {
    const docPath = this.options.lookupDocPath(docId)
    if (!docPath || formatOf(docPath) !== 'markdown') return HTML_BACKGROUND
    return MARKDOWN_BACKGROUND[nativeTheme.shouldUseDarkColors ? 'dark' : 'light']
  }

  /** Arkusz Markdownu zmienia tło razem z motywem, żeby przeładowanie nie błysnęło starym kolorem. */
  syncTheme(): void {
    for (const { docId, view } of this.views.values()) view.setBackgroundColor(this.backgroundOf(docId))
  }

  close(docId: string): void {
    const open = this.views.get(docId)
    if (!open) return
    this.views.delete(docId)
    this.stack = this.stack.filter((id) => id !== docId)
    this.finds.delete(docId)
    this.routes.delete(docId)
    this.pickers.delete(docId)
    this.presents.delete(docId)
    this.guests.delete(open.view.webContents.id)
    this.camera.forget(open.view.webContents)
    this.options.window.contentView.removeChildView(open.view)
    open.view.webContents.close()
  }

  closeAll(): void {
    for (const docId of this.openDocIds()) this.close(docId)
  }

  /** Przeładowana powłoka nie pamięta widoków ani narzędzia, więc dokumenty zaczynają od nowa. */
  reset(): void {
    this.closeAll()
    this.aims.clear()
    this.finds.clear()
    this.pointer = false
    this.marker = null
    this.shaper = null
    this.routes.clear()
    this.pickers.clear()
    this.presents.clear()
  }

  reload(docId: string): void {
    const open = this.views.get(docId)
    if (!open) return
    this.setState(open, { ...open.state, status: 'loading', blockedRequests: 0, blockedHosts: [] })
    open.view.webContents.reloadIgnoringCache()
  }

  /** Ustawia widoki od spodu do góry. Widok nieżywy zostaje odstawiony i tylko zmienia rozmiar. */
  setLayout(placements: ViewerPlacement[]): void {
    const resting = placements.at(-1)?.bounds
    if (resting) this.restingSize = resting
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
      // Ręka nie jest częścią dokumentu, więc nie może zostać na zrzucie.
      if (this.pointer || this.marker) {
        this.send(docId, 'overlay:pointer-withdraw', null)
        await new Promise((done) => setTimeout(done, POINTER_WITHDRAW_MS))
      }
      const image = await open.view.webContents.capturePage()
      if (image.isEmpty()) return null
      const { width, height } = image.getSize()
      return { width, height, data: image.toBitmap() }
    } catch {
      // Strona jeszcze niczego nie narysowała, więc nie ma czego pokazać.
      return null
    }
  }

  private markReady(open: OpenView): void {
    if (open.state.status === 'loading') this.setState(open, { ...open.state, status: 'ready' })
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
    if (!docPath) return new Response(t('Nie znaleziono dokumentu'), { status: 404 })

    try {
      if (pathname === '/' && formatOf(docPath) === 'markdown') {
        return new Response(await this.options.renderMarkdown(docPath), {
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
      if (!assetPath || !contentType) return new Response(t('Nie znaleziono'), { status: 404 })
      return new Response(await readFile(assetPath), { headers: { 'Content-Type': contentType } })
    } catch {
      return new Response(t('Nie można odczytać pliku'), { status: 500 })
    }
  }
}
