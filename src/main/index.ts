import { rmSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  shell
} from 'electron'
import {
  DOC_STATUSES,
  type DocEntry,
  type DocStatus,
  type LibrarySnapshot,
  type ThemeMode,
  type ViewerBounds,
  type ViewerPlacement,
  type ViewerWheel
} from '../shared/types'
import type { Audience, NewAnnotation, OverlayEvent, OverlayMode, SelectionAction } from '../shared/annotations'
import { currentDocumentPath, writeCurrentDocument } from './agentApi'
import { AnnotationStore, parseAnchor, parseStickyColor, toOverlayItems, watchAnnotations } from './annotationStore'
import { type AppConfig, dataDir, loadConfig, saveConfig } from './config'
import { isExternalUrl } from './docPolicy'
import { DockLayer } from './dockLayer'
import { DocViewer, registerDocScheme } from './docViewer'
import { FolderWatcher } from './folderWatcher'
import { commandRunner, readRepo } from './git'
import { Library } from './library'
import { Thumbnailer } from './thumbnails'

const RESCAN_ON_FOCUS_AFTER_MS = 60_000
/** Kolor ściany, żeby okno nie błysnęło innym tłem przed pierwszą klatką powłoki. */
const WALL_COLORS: Record<ThemeMode, string> = { light: '#e7e7e9', dark: '#08080a' }
const CAPTION_SYMBOLS: Record<ThemeMode, string> = { light: '#63636b', dark: '#a4a4ac' }
const TITLE_BAR_HEIGHT = 32

registerDocScheme()

const git = commandRunner('git')
const gh = commandRunner('gh')

let mainWindow: BrowserWindow | null = null
let viewer: DocViewer | null = null
let dockLayer: DockLayer | null = null
let thumbnails: Thumbnailer | null = null
let library: Library | null = null
let config: AppConfig = { roots: [], allowedHosts: [], folderLinks: [] }
let lastScanAt = 0
let stopWatchingAnnotations: (() => void) | null = null

const annotations = new AnnotationStore(join(dataDir(), 'library'))
const watcher = new FolderWatcher(() => void scanLibrary())

/** Wysyła uwagi do panelu i do warstw otwartych dokumentów. Działa też po zmianach agenta. */
async function pushAnnotations(): Promise<void> {
  const all = await annotations.listAll()
  sendToShell('annotations:changed', all)
  for (const docId of viewer?.openDocIds() ?? []) {
    viewer?.setOverlayItems(docId, toOverlayItems(all.filter((item) => item.docId === docId)))
  }
}

function sendToShell(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function forwardOverlayEvent(docId: string, event: OverlayEvent): void {
  sendToShell('viewer:overlay-event', { docId, event })
  // Klawiatura została w dokumencie, a tekst uwagi pisze się w powłoce.
  if (event.type === 'place') mainWindow?.webContents.focus()
}

async function openDocument(doc: DocEntry): Promise<void> {
  viewer?.open(doc.id)
  await requireLibrary().markOpened(doc.id)
}

/** Agent widzi jako bieżący dokument z fokusem w powłoce. */
async function setCurrentDocument(doc: DocEntry | null): Promise<void> {
  await writeCurrentDocument(
    dataDir(),
    doc && {
      docId: doc.id,
      title: doc.title,
      path: doc.path,
      project: doc.projectName,
      branch: doc.branch,
      openedAt: new Date().toISOString()
    }
  )
}

function titleBarFor(mode: ThemeMode): Electron.TitleBarOverlay {
  return { color: '#00000000', symbolColor: CAPTION_SYMBOLS[mode], height: TITLE_BAR_HEIGHT }
}

/** Motyw obejmuje też dokumenty, które reagują na `prefers-color-scheme`, w tym arkusze Markdownu. */
function applyTheme(mode: ThemeMode): void {
  nativeTheme.themeSource = mode
  viewer?.syncTheme()
  thumbnails?.syncTheme()
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setTitleBarOverlay(titleBarFor(mode))
  mainWindow.setBackgroundColor(WALL_COLORS[mode])
}

function parseNewAnnotation(value: unknown): NewAnnotation {
  const { kind, audience, color, anchor, text } = (value ?? {}) as Record<string, unknown>
  if (kind !== 'comment' && kind !== 'sticky') throw new Error('Nieznany rodzaj uwagi')
  return {
    kind,
    audience: parseAudience(audience),
    color: parseStickyColor(color),
    anchor: parseAnchor(anchor),
    text: typeof text === 'string' ? text : ''
  }
}

function parseAudience(value: unknown): Audience {
  if (value !== 'agent' && value !== 'me') throw new Error('Nieznany odbiorca uwagi')
  return value
}

function requireLibrary(): Library {
  if (!library) throw new Error('Biblioteka nie jest gotowa')
  return library
}

function scanLibrary(refreshGit = false): Promise<LibrarySnapshot> {
  lastScanAt = Date.now()
  return requireLibrary().scan({ refreshGit })
}

async function updateConfig(change: Partial<AppConfig>): Promise<LibrarySnapshot> {
  config = { ...config, ...change }
  await saveConfig(config)
  watcher.watch(config.roots)
  return scanLibrary(true)
}

async function chooseFolders(title: string, multiple: boolean): Promise<string[]> {
  if (!mainWindow) return []
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: multiple ? ['openDirectory', 'multiSelections'] : ['openDirectory']
  })
  return canceled ? [] : filePaths
}

async function addRoots(): Promise<LibrarySnapshot> {
  const folders = await chooseFolders('Wybierz foldery z dokumentami', true)
  if (folders.length === 0) return requireLibrary().getSnapshot()
  return updateConfig({ roots: [...new Set([...config.roots, ...folders])] })
}

async function isFolder(path: string): Promise<boolean> {
  return stat(path).then(
    (info) => info.isDirectory(),
    () => false
  )
}

/** Foldery upuszczone na ścianę. Ścieżki pochodzą z powłoki, więc sprawdzamy, że to katalogi. */
async function addDroppedFolders(paths: unknown): Promise<LibrarySnapshot> {
  const dropped = Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string' && isAbsolute(path)) : []
  const checked = await Promise.all(dropped.map(async (path) => ((await isFolder(path)) ? [path] : [])))
  const folders = checked.flat()
  if (folders.length === 0) return requireLibrary().getSnapshot()
  return updateConfig({ roots: [...new Set([...config.roots, ...folders])] })
}

async function linkFolder(): Promise<LibrarySnapshot> {
  const snapshot = requireLibrary().getSnapshot()
  const [folder] = await chooseFolders('Wybierz folder z dokumentami', false)
  if (!folder) return snapshot
  const [repo] = await chooseFolders('Wybierz repozytorium, do którego należy ten folder', false)
  if (!repo) return snapshot

  if (!(await readRepo(repo, git))) {
    await dialog.showMessageBox({
      type: 'warning',
      message: 'Wybrany folder nie jest repozytorium git.',
      buttons: ['OK']
    })
    return snapshot
  }
  const others = config.folderLinks.filter((link) => link.folder !== folder)
  return updateConfig({ folderLinks: [...others, { folder, repo }] })
}

function isValidBounds(value: unknown): value is ViewerBounds {
  if (typeof value !== 'object' || value === null) return false
  const { x, y, width, height } = value as Record<string, unknown>
  return [x, y, width, height].every((part) => Number.isInteger(part)) && Number(width) > 0 && Number(height) > 0
}

function isWheel(value: unknown): value is ViewerWheel {
  if (typeof value !== 'object' || value === null) return false
  const { x, y, deltaX, deltaY } = value as Record<string, unknown>
  return [x, y, deltaX, deltaY].every((part) => Number.isFinite(part))
}

function parsePlacements(value: unknown): ViewerPlacement[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown) => {
    const { docId, bounds, live } = (item ?? {}) as Record<string, unknown>
    return typeof docId === 'string' && isValidBounds(bounds) ? [{ docId, bounds, live: live === true }] : []
  })
}

function isSelectionAction(value: unknown): value is SelectionAction {
  return value === 'comment' || value === 'sticky' || value === 'copy'
}

function assertShell(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (event.sender !== mainWindow?.webContents) throw new Error('Niedozwolony nadawca IPC')
}

function requireDoc(docId: unknown): DocEntry {
  const doc = typeof docId === 'string' ? requireLibrary().getEntry(docId) : undefined
  if (!doc) throw new Error('Nieznany dokument')
  return doc
}

function isDocStatus(value: unknown): value is DocStatus {
  return DOC_STATUSES.includes(value as DocStatus)
}

function registerIpc(): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    listener: (...args: Args) => Result
  ): void => {
    ipcMain.handle(channel, (event, ...args) => {
      assertShell(event)
      return listener(...(args as Args))
    })
  }

  handle('library:get', () => scanLibrary())
  handle('library:rescan', () => scanLibrary(true))
  handle('library:add-root', () => addRoots())
  handle('library:add-paths', (paths: unknown) => addDroppedFolders(paths))
  handle('library:remove-root', (path: unknown) =>
    updateConfig({ roots: config.roots.filter((root) => root !== path) })
  )
  handle('library:link-folder', () => linkFolder())
  handle('library:unlink-folder', (folder: unknown) =>
    updateConfig({ folderLinks: config.folderLinks.filter((link) => link.folder !== folder) })
  )
  handle('library:search', (query: unknown) =>
    typeof query === 'string' ? requireLibrary().search(query) : []
  )
  handle('doc:set-status', (docId: unknown, status: unknown) => {
    if (!isDocStatus(status)) throw new Error('Nieznany status')
    return requireLibrary().setStatus(requireDoc(docId).id, status)
  })
  handle('doc:set-classification', (docId: unknown, classification: unknown) => {
    if (classification !== 'document' && classification !== 'ignored') {
      throw new Error('Nieznana klasyfikacja')
    }
    return requireLibrary().setClassification(requireDoc(docId).id, classification)
  })
  handle('doc:reveal', (docId: unknown) => shell.showItemInFolder(requireDoc(docId).path))
  handle('app:open-external', (url: unknown) => {
    if (typeof url === 'string' && isExternalUrl(url)) void shell.openExternal(url)
  })
  handle('viewer:open', (docId: unknown) => openDocument(requireDoc(docId)))
  handle('viewer:close', (docId: unknown) => viewer?.close(String(docId)))
  handle('viewer:reload', (docId: unknown) => viewer?.reload(String(docId)))
  handle('viewer:layout', (placements: unknown) => viewer?.setLayout(parsePlacements(placements)))
  handle('viewer:capture', (docId: unknown) => viewer?.capture(String(docId)) ?? null)
  handle('viewer:set-current', (docId: unknown) => setCurrentDocument(docId === null ? null : requireDoc(docId)))

  handle('annotations:list', () => annotations.listAll())
  handle('annotations:create', async (docId: unknown, input: unknown) => {
    const doc = requireDoc(docId)
    const sha = requireLibrary().getDocSha(doc.id)
    if (!sha) throw new Error('Uwagi można dodawać tylko do dokumentów z biblioteki')
    await annotations.create(doc.id, sha, parseNewAnnotation(input))
    await pushAnnotations()
  })
  handle('annotations:reply', async (id: unknown, text: unknown) => {
    await annotations.addMessage(String(id), 'user', String(text))
    await pushAnnotations()
  })
  handle('annotations:set-status', async (id: unknown, status: unknown) => {
    if (status !== 'open' && status !== 'resolved') throw new Error('Nieznany status uwagi')
    await annotations.setStatus(String(id), status)
    await pushAnnotations()
  })
  handle('annotations:set-audience', async (id: unknown, audience: unknown) => {
    await annotations.setAudience(String(id), parseAudience(audience))
    await pushAnnotations()
  })
  handle('annotations:delete', async (id: unknown) => {
    await annotations.delete(String(id))
    await pushAnnotations()
  })

  ipcMain.on('viewer:focus', (event, docId: unknown) => {
    assertShell(event)
    if (typeof docId === 'string') viewer?.focus(docId)
    else mainWindow?.webContents.focus()
  })
  ipcMain.on('viewer:wheel', (event, docId: unknown, wheel: unknown) => {
    assertShell(event)
    if (typeof docId === 'string' && isWheel(wheel)) viewer?.wheel(docId, wheel)
  })
  ipcMain.on('layer:place', (event, bounds: unknown) => {
    assertShell(event)
    if (isValidBounds(bounds)) dockLayer?.place(bounds)
  })
  ipcMain.on('layer:focus', (event) => {
    assertShell(event)
    dockLayer?.focus()
  })
  ipcMain.on('viewer:set-mode', (event, docId: unknown, mode: unknown) => {
    assertShell(event)
    const next: OverlayMode = mode === 'comment' || mode === 'sticky' ? mode : null
    viewer?.setOverlayMode(String(docId), next)
    if (next) viewer?.focus(String(docId))
  })
  ipcMain.on('viewer:focus-annotation', (event, docId: unknown, id: unknown) => {
    assertShell(event)
    viewer?.focusOverlayItem(String(docId), typeof id === 'string' ? id : null)
  })
  ipcMain.on('viewer:track', (event, docId: unknown, on: unknown) => {
    assertShell(event)
    viewer?.trackOverlay(String(docId), on === true)
  })
  ipcMain.on('viewer:selection', (event, docId: unknown, action: unknown) => {
    assertShell(event)
    if (isSelectionAction(action)) viewer?.runSelectionAction(String(docId), action)
  })
  ipcMain.on('thumbs:request', (event, docIds: unknown) => {
    assertShell(event)
    if (Array.isArray(docIds)) thumbnails?.request(docIds.filter((id): id is string => typeof id === 'string'))
  })
  ipcMain.on('window:set-theme', (event, mode: unknown) => {
    assertShell(event)
    if (mode === 'light' || mode === 'dark') applyTheme(mode)
  })
}

function createWindow(): BrowserWindow {
  const theme: ThemeMode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'HTML Docs',
    show: false,
    backgroundColor: WALL_COLORS[theme],
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarFor(theme),
    webPreferences: {
      preload: join(__dirname, '../preload/shell.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => window.show())
  const layer = new DockLayer(window)
  dockLayer = layer
  window.webContents.setWindowOpenHandler((details) => layer.open(details))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('focus', () => {
    if (Date.now() - lastScanAt > RESCAN_ON_FOCUS_AFTER_MS) void scanLibrary(true)
  })

  viewer = new DocViewer({
    window,
    allowedHosts: config.allowedHosts,
    lookupDocPath: (docId) => library?.getServedPath(docId),
    onState: (state) => sendToShell('viewer:state', state),
    onOverlayEvent: forwardOverlayEvent,
    onOverlayReady: () => void pushAnnotations(),
    onKey: (key) => sendToShell('viewer:key', key),
    onFocus: (docId) => sendToShell('viewer:focus', docId),
    onStacked: () => layer.raise()
  })

  thumbnails = new Thumbnailer({
    dir: join(dataDir(), 'cache', 'thumbs'),
    viewer: () => viewer,
    shaOf: (docId) => library?.getEntry(docId)?.sha ?? null,
    themed: (docId) => library?.getEntry(docId)?.format === 'markdown',
    send: (thumb) => sendToShell('thumbs:ready', thumb)
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void window.loadURL(devServer)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  window.on('closed', () => {
    thumbnails?.close()
    thumbnails = null
    dockLayer?.close()
    dockLayer = null
    mainWindow = null
    viewer = null
  })
  return window
}

async function start(): Promise<void> {
  await app.whenReady()
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, respond) => respond(false))
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)

  config = await loadConfig()
  library = await Library.open({
    dataDir: dataDir(),
    git,
    gh,
    getConfig: () => config,
    onChange: (snapshot) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('library:changed', snapshot)
      }
    }
  })
  registerIpc()
  watcher.watch(config.roots)
  stopWatchingAnnotations = watchAnnotations(join(dataDir(), 'library'), () => void pushAnnotations())
  mainWindow = createWindow()

  app.on('activate', () => {
    if (!mainWindow) mainWindow = createWindow()
  })
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('will-quit', () => {
    watcher.close()
    stopWatchingAnnotations?.()
    library?.close()
    // Po zamknięciu apki żaden dokument nie jest już otwarty, więc agent nie powinien go wskazywać.
    rmSync(currentDocumentPath(dataDir()), { force: true })
  })
  void start()
} else {
  app.quit()
}
