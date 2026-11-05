import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type BaseWindow,
  ipcMain,
  protocol,
  type Session,
  session,
  shell,
  WebContentsView
} from 'electron'
import type { ViewerBounds, ViewerState } from '../shared/types'
import {
  assetContentType,
  DOC_SCHEME,
  docUrl,
  isExternalUrl,
  isRequestAllowed,
  resolveAssetPath
} from './docPolicy'

const DOC_PARTITION = 'persist:documents'
const ERR_ABORTED = -3

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
}

/**
 * Wyświetla dokument w osobnym WebContentsView. Każde otwarcie tworzy nowy widok,
 * a każdy dokument ma własny origin `htmldoc://<id>/`, więc dokumenty nie współdzielą
 * stanu ani procesu, a ich `localStorage` działa normalnie.
 */
export class DocViewer {
  private readonly documents: Session
  private view: WebContentsView | null = null
  private bounds: ViewerBounds | null = null
  private state: ViewerState = { docId: null, status: 'idle', blockedRequests: 0, blockedHosts: [] }

  constructor(private readonly options: DocViewerOptions) {
    this.documents = session.fromPartition(DOC_PARTITION)
    this.configureSession()
    ipcMain.on('doc:open-external', (event, url: unknown) => {
      const fromCurrentDoc = event.sender === this.view?.webContents
      if (fromCurrentDoc && typeof url === 'string' && isExternalUrl(url)) {
        void shell.openExternal(url)
      }
    })
  }

  open(docId: string): void {
    this.destroyView()
    this.setState({ docId, status: 'loading', blockedRequests: 0, blockedHosts: [] })

    const view = new WebContentsView({
      webPreferences: {
        session: this.documents,
        preload: join(__dirname, '../preload/doc.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        navigateOnDragDrop: false,
        spellcheck: false
      }
    })
    view.setBackgroundColor('#ffffff')
    this.view = view
    this.options.window.contentView.addChildView(view)
    this.applyBounds()

    const contents = view.webContents
    const isCurrent = (): boolean => this.view === view

    contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event) => {
      if (new URL(event.url).hostname !== docId) event.preventDefault()
    })
    contents.on('did-finish-load', () => {
      if (isCurrent()) this.setState({ ...this.state, status: 'ready' })
    })
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isCurrent() && isMainFrame && code !== ERR_ABORTED) {
        this.setState({ ...this.state, status: 'error' })
      }
    })
    contents.on('render-process-gone', () => {
      if (isCurrent()) this.setState({ ...this.state, status: 'error' })
    })

    void contents.loadURL(docUrl(docId)).catch(() => {
      // Błąd ładowania zgłasza `did-fail-load`.
    })
  }

  close(): void {
    this.destroyView()
    this.setState({ docId: null, status: 'idle', blockedRequests: 0, blockedHosts: [] })
  }

  reload(): void {
    if (!this.view) return
    this.setState({ ...this.state, status: 'loading', blockedRequests: 0, blockedHosts: [] })
    this.view.webContents.reloadIgnoringCache()
  }

  setBounds(bounds: ViewerBounds | null): void {
    this.bounds = bounds
    this.applyBounds()
  }

  private applyBounds(): void {
    if (!this.view) return
    this.view.setVisible(this.bounds !== null)
    if (this.bounds) this.view.setBounds(this.bounds)
  }

  private destroyView(): void {
    if (!this.view) return
    const view = this.view
    this.view = null
    this.options.window.contentView.removeChildView(view)
    view.webContents.close()
  }

  private setState(state: ViewerState): void {
    this.state = state
    this.options.onState(state)
  }

  private recordBlocked(url: string): void {
    let host = url
    try {
      host = new URL(url).host || url
    } catch {
      // Niepoprawny adres pokazujemy w całości.
    }
    this.setState({
      ...this.state,
      blockedRequests: this.state.blockedRequests + 1,
      blockedHosts: [...new Set([...this.state.blockedHosts, host])]
    })
  }

  private configureSession(): void {
    const { documents } = this

    documents.protocol.handle(DOC_SCHEME, (request) => this.serve(request))

    documents.webRequest.onBeforeRequest((details, respond) => {
      const fromCurrentView = details.webContentsId === this.view?.webContents.id
      const allowed = isRequestAllowed({
        url: details.url,
        documentHost: fromCurrentView ? this.state.docId : null,
        allowedHosts: this.options.allowedHosts
      })
      if (!allowed && fromCurrentView) this.recordBlocked(details.url)
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

  private async serve(request: Request): Promise<Response> {
    const { hostname, pathname } = new URL(request.url)
    const docPath = hostname === this.state.docId ? this.options.lookupDocPath(hostname) : undefined
    if (!docPath) return new Response('Nie znaleziono dokumentu', { status: 404 })

    try {
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
