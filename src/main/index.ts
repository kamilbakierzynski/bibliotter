import { rmSync } from 'node:fs'
import { join } from 'node:path'
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
import { DOC_STATUSES, type DocEntry, type DocStatus, type LibrarySnapshot, type ViewerBounds } from '../shared/types'
import type { Audience, NewAnnotation, OverlayEvent, OverlayMode } from '../shared/annotations'
import { currentDocumentPath, writeCurrentDocument } from './agentApi'
import { AnnotationStore, parseAnchor, parseStickyColor, toOverlayItems, watchAnnotations } from './annotationStore'
import { type AppConfig, dataDir, loadConfig, saveConfig } from './config'
import { isExternalUrl } from './docPolicy'
import { DocViewer, registerDocScheme } from './docViewer'
import { FolderWatcher } from './folderWatcher'
import { commandRunner, readRepo } from './git'
import { Library } from './library'

const RESCAN_ON_FOCUS_AFTER_MS = 60_000

registerDocScheme()

const git = commandRunner('git')
const gh = commandRunner('gh')

let mainWindow: BrowserWindow | null = null
let viewer: DocViewer | null = null
let library: Library | null = null
let config: AppConfig = { roots: [], allowedHosts: [], folderLinks: [] }
let lastScanAt = 0
let openDocId: string | null = null
let stopWatchingAnnotations: (() => void) | null = null

const annotations = new AnnotationStore(join(dataDir(), 'library'))
const watcher = new FolderWatcher(() => void scanLibrary())

/** Wysyła uwagi do panelu i do warstwy otwartego dokumentu. Działa też po zmianach agenta. */
async function pushAnnotations(): Promise<void> {
  const all = await annotations.listAll()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('annotations:changed', all)
  if (openDocId) viewer?.setOverlayItems(toOverlayItems(all.filter((item) => item.docId === openDocId)))
}

function forwardOverlayEvent(event: OverlayEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('viewer:overlay-event', event)
  // Klawiatura została w dokumencie, a tekst uwagi pisze się w panelu apki.
  if (event.type === 'place') mainWindow.webContents.focus()
}

async function openDocument(doc: DocEntry): Promise<void> {
  openDocId = doc.id
  viewer?.open(doc.id)
  await writeCurrentDocument(dataDir(), {
    docId: doc.id,
    title: doc.title,
    path: doc.path,
    project: doc.projectName,
    branch: doc.branch,
    openedAt: new Date().toISOString()
  })
  await requireLibrary().markOpened(doc.id)
}

async function closeDocument(): Promise<void> {
  openDocId = null
  viewer?.close()
  await writeCurrentDocument(dataDir(), null)
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
  return [x, y, width, height].every((part) => Number.isFinite(part))
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
  handle('viewer:close', () => closeDocument())
  handle('viewer:reload', () => viewer?.reload())

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

  ipcMain.on('viewer:set-bounds', (event, bounds: unknown) => {
    assertShell(event)
    viewer?.setBounds(isValidBounds(bounds) ? bounds : null)
  })
  ipcMain.on('viewer:set-mode', (event, mode: unknown) => {
    assertShell(event)
    const next: OverlayMode = mode === 'comment' || mode === 'sticky' ? mode : null
    viewer?.setOverlayMode(next)
    if (next) viewer?.focusDocument()
  })
  ipcMain.on('viewer:focus-annotation', (event, id: unknown) => {
    assertShell(event)
    viewer?.focusOverlayItem(typeof id === 'string' ? id : null)
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'HTML Docs',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f6f6f4',
    webPreferences: {
      preload: join(__dirname, '../preload/shell.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('focus', () => {
    if (Date.now() - lastScanAt > RESCAN_ON_FOCUS_AFTER_MS) void scanLibrary(true)
  })

  viewer = new DocViewer({
    window,
    allowedHosts: config.allowedHosts,
    lookupDocPath: (docId) => library?.getServedPath(docId),
    onState: (state) => {
      if (!window.isDestroyed()) window.webContents.send('viewer:state', state)
    },
    onOverlayEvent: forwardOverlayEvent,
    onOverlayReady: () => void pushAnnotations()
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void window.loadURL(devServer)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  window.on('closed', () => {
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
