import './legacyNames'
import { rmSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  session,
  shell
} from 'electron'
import {
  DOC_STATUSES,
  type DocEntry,
  type DocStatus,
  type ThemeChoice,
  type ThemeMode,
  type ViewerBounds,
  type ViewerPlacement,
  type ViewerWheel
} from '../shared/types'
import type { Audience, NewAnnotation, OverlayEvent, OverlayMode } from '../shared/annotations'
import type { AutoLabelOptions, AutoLabelState } from '../shared/autoLabel'
import { parseCameraLeg, parseCameraShot } from '../shared/camera'
import { MAX_STEPS, parsePresentState, parseStepCamera, type RouteFrame, STEP_ID } from '../shared/presentation'
import { cleanLabel, hasLabel, isLabelTone, moveLabelColor, parseLabels, sameLabel, ticketTemplate, withLabelColor } from '../shared/labels'
import {
  type FollowLink,
  type LinkOutcome,
  type LinkPreview,
  type LinkShotRequest,
  type OpenMode,
  parseLinkShot,
  parseOpenMode
} from '../shared/links'
import { parseOutlineCommand } from '../shared/outline'
import { DEFAULT_LANGUAGE, isLanguage, setLanguage, t } from '../shared/i18n'
import { type AppInfo, cleanHosts } from '../shared/options'
import { parseFindCommand, parseTextQuery } from '../shared/textSearch'
import { currentDocumentPath, writeCurrentDocument } from './agentApi'
import { readAgentSetup } from './agentSetup'
import { AnalysisPool } from './analysisPool'
import { AnnotationHistory } from './annotationHistory'
import {
  AnnotationStore,
  MAX_HIGHLIGHT_QUOTE,
  parseAnchor,
  parseShape,
  parseShapeType,
  parseStickyColor,
  parseStrokes,
  toOverlayItems,
  watchAnnotations
} from './annotationStore'
import { AutoLabeler, claudeRunner } from './autoLabel'
import { ContentSearcher } from './contentSearch'
import { type AppConfig, dataDir, DEFAULT_LABEL_STARTERS, loadConfig, saveConfig } from './config'
import { LinkGraph } from './docLinks'
import { isExternalUrl } from './docPolicy'
import { DockLayer } from './dockLayer'
import { DocViewer, registerDocScheme } from './docViewer'
import { commandRunner, readRepo } from './git'
import { HitPreviewer } from './hitPreview'
import type { LibraryConfig } from './library'
import { LibraryClient } from './libraryClient'
import { isInside } from './scanner'
import { FileSheets } from './fileSheets'
import { fileFragment, lineSuffix, parseFileFragment } from '../shared/fileView'
import { PresentationStore, readPresentation, watchPresentation } from './presentationStore'
import { watchSignal } from './signals'
import { Thumbnailer } from './thumbnails'
import { terminalDir, Terminals } from './terminals'
// Windows bierze z ICO ramkę narysowaną dla danego rozmiaru, a nie zmniejszony wzorzec.
import iconIco from '../../resources/icon.ico?asset'
import iconPng from '../../resources/icon.png?asset'

const RESCAN_ON_FOCUS_AFTER_MS = 60_000
/** Kolor ściany, żeby okno nie błysnęło innym tłem przed pierwszą klatką powłoki. */
const WALL_COLORS: Record<ThemeMode, string> = { light: '#e7e7e9', dark: '#08080a' }
const CAPTION_SYMBOLS: Record<ThemeMode, string> = { light: '#63636b', dark: '#a4a4ac' }
const TITLE_BAR_HEIGHT = 32

registerDocScheme()

const git = commandRunner('git')
const claude = commandRunner('claude')
const locate = commandRunner(process.platform === 'win32' ? 'where' : 'which')

let mainWindow: BrowserWindow | null = null
let viewer: DocViewer | null = null
let dockLayer: DockLayer | null = null
/** Warstwa kart linków nad dokumentami. */
let cardLayer: DockLayer | null = null
/** Ostatnie najechanie na link. Starsza odpowiedź nie może zasłonić nowszej. */
let linkHoverTurn = 0
let thumbnails: Thumbnailer | null = null
let hitPreviews: HitPreviewer | null = null
let library: LibraryClient | null = null
let labeler: AutoLabeler | null = null
let config: AppConfig = {
  roots: [],
  allowedHosts: [],
  folderLinks: [],
  hiddenFolders: [],
  folderNames: {},
  autoLabelNew: false,
  autoLabelTickets: true,
  labelStarters: DEFAULT_LABEL_STARTERS,
  labelColors: {},
  ticketUrl: '',
  language: DEFAULT_LANGUAGE
}
let lastScanAt = 0
let stopWatchingAnnotations: (() => void) | null = null
let stopWatchingLabels: (() => void) | null = null
let stopWatchingPresentation: (() => void) | null = null

const ignore = (): void => {}

const annotations = new AnnotationStore(join(dataDir(), 'library'))
const presentations = new PresentationStore(join(dataDir(), 'library'))
const searcher = new ContentSearcher(join(__dirname, 'searchWorker.js'), join(dataDir(), 'cache', 'index.sqlite'))
/** Linki zwrotne wymagają złożenia każdego dokumentu, a ten wątek ma obsługiwać okno. */
const linkReaders = new AnalysisPool(join(__dirname, 'analysisWorker.js'))
const links = new LinkGraph(() => library?.getSnapshot() ?? null, linkReaders.readLinks)
const files = new FileSheets()
const terminals = new Terminals((channel, payload) => sendToShell(channel, payload))

/** Wysyła uwagi do panelu i do warstw otwartych dokumentów. Działa też po zmianach agenta. */
async function pushAnnotations(): Promise<void> {
  const all = await annotations.listAll()
  sendToShell('annotations:changed', all)
  for (const docId of viewer?.openDocIds() ?? []) {
    viewer?.setOverlayItems(docId, toOverlayItems(all.filter((item) => item.docId === docId)))
  }
}

/** Świeżo wczytany dokument potrzebuje tylko swoich uwag, a pełna lista czyta foldery wszystkich. */
async function pushDocAnnotations(docId: string): Promise<void> {
  viewer?.setOverlayItems(docId, toOverlayItems(await annotations.listForDoc(docId)))
}

function sendToShell(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

const noteHistory = new AnnotationHistory(annotations, pushAnnotations)

function forwardOverlayEvent(docId: string, event: OverlayEvent): void {
  sendToShell('viewer:overlay-event', { docId, event })
  // Klawiatura została w dokumencie, a tekst uwagi pisze się w powłoce.
  if (event.type === 'place') mainWindow?.webContents.focus()
}

function openDocument(doc: DocEntry): void {
  warmDocument(doc)
  requireLibrary().markOpened(doc.id).catch(ignore)
}

/** Widok powstaje tak samo jak przy otwarciu, ale nikt jeszcze dokumentu nie przeczytał. */
function warmDocument(doc: DocEntry): void {
  thumbnails?.pause()
  viewer?.open(doc.id)
}

/**
 * Plik tekstowy staje w arkuszu obok dokumentu, bo link zwykle pokazuje kod, o którym dokument mówi.
 * Zwykłe kliknięcie od razu dzieli widok, a `Ctrl` + klik zerka. Reszta plików idzie do Eksploratora.
 */
async function openFile(from: DocEntry, path: string, href: string, fragment: string, mode: OpenMode): Promise<LinkOutcome> {
  if (!(await files.viewable(path))) {
    shell.showItemInFolder(path)
    return 'revealed'
  }
  const target = parseFileFragment(fragment)
  const lines = target.lines ?? lineSuffix(href)
  const entry = await files.open(path, target.mode, lines)
  viewer?.aim(entry.id, fileFragment(entry.file?.mode ?? 'file', lines))
  const split: OpenMode = mode === 'open' ? 'split' : mode
  sendToShell('viewer:follow-link', { from: from.id, docId: entry.id, mode: split, file: entry } satisfies FollowLink)
  return 'opened'
}

/** Link prowadzi tam, gdzie wskazuje: dokument otwiera się w apce, a inny plik w Eksploratorze. */
async function followLink(from: DocEntry, href: string, mode: OpenMode): Promise<LinkOutcome> {
  const link = await links.resolve(from, href)
  if (!link) return 'none'
  if (link.kind === 'external') {
    void shell.openExternal(href)
    return 'opened'
  }
  if (link.kind === 'missing' || !link.path) return 'missing'
  if (!link.docId) return openFile(from, link.path, href, link.fragment, mode)
  if (link.fragment) viewer?.aim(link.docId, link.fragment)
  if (link.docId !== from.id) {
    links.noteFollow(from, link.docId)
    sendToShell('viewer:follow-link', { from: from.id, docId: link.docId, mode } satisfies FollowLink)
  }
  return 'opened'
}

const PLAIN_QUERY = { matchCase: false, wholeWord: false, regex: false }

/** Zrzut do karty wiersza w panelu Linki. `null` to brak zrzutu, a `later` zamówienie wyprzedzone przez nowsze. */
async function linkShot(request: LinkShotRequest | null): Promise<string | null | 'later'> {
  const previews = hitPreviews
  if (!request || !previews) return null
  const doc = requireDoc(request.docId)
  if (request.kind === 'outgoing') {
    const link = await links.resolve(doc, request.href)
    return link?.kind === 'doc' && link.docId && link.docId !== doc.id ? previews.place(link.docId, link.fragment) : null
  }
  const source = requireDoc(request.from)
  const snippet = await links.linkSnippet(source, doc)
  const shot = snippet ? await previews.preview(source.id, { text: snippet.match, ...PLAIN_QUERY }, snippet) : null
  // Gdy miejsca nie widać, np. link dorysował skrypt strony, zostaje początek dokumentu.
  return shot ?? previews.place(source.id, '')
}

async function followLinkFrom(docId: string, href: string, mode: OpenMode): Promise<LinkOutcome> {
  const doc = library?.getEntry(docId)
  return doc ? followLink(doc, href, mode) : 'none'
}

async function previewLink(docId: string, href: string): Promise<LinkPreview | null> {
  const doc = library?.getEntry(docId)
  return doc ? links.preview(doc, href, (target) => thumbnails?.stored(target) ?? Promise.resolve(null)) : null
}

/** Kartę dostaje powłoka, nie dokument, więc działa ona też w dokumentach HTML ze skryptami. */
function hoverLink(hover: { docId: string; href: string; rect: ViewerBounds } | null): void {
  const turn = ++linkHoverTurn
  if (!hover) {
    sendToShell('link-hover:card', null)
    return
  }
  previewLink(hover.docId, hover.href)
    .catch(() => null)
    .then((preview) => {
      if (turn === linkHoverTurn) sendToShell('link-hover:card', preview && { preview, link: hover.rect })
    })
    .catch(ignore)
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
function applyTheme(choice: ThemeChoice): void {
  nativeTheme.themeSource = choice
  const mode: ThemeMode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  viewer?.syncTheme()
  thumbnails?.syncTheme()
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setTitleBarOverlay(titleBarFor(mode))
  mainWindow.setBackgroundColor(WALL_COLORS[mode])
}

function parseNewAnnotation(value: unknown): NewAnnotation {
  const { kind, audience, color, anchor, text, strokes, anchorWidth, shape } = (value ?? {}) as Record<string, unknown>
  if (kind === 'shape') {
    const place = parseAnchor(anchor)
    const geometry = parseShape(shape)
    if (!place || !geometry) throw new Error('Niepoprawny kształt')
    // Rysunek należy do użytkownika, więc agent domyślnie go nie widzi.
    return { kind, audience: 'me', color: parseStickyColor(color), anchor: place, text: '', shape: geometry }
  }
  if (kind === 'highlight') {
    const place = parseAnchor(anchor, MAX_HIGHLIGHT_QUOTE)
    const lines = parseStrokes(strokes)
    if (!place || !lines) throw new Error('Niepoprawne zakreślenie')
    return {
      kind,
      audience: 'me',
      color: parseStickyColor(color),
      anchor: place,
      text: '',
      strokes: lines,
      anchorWidth: Number(anchorWidth) || 0
    }
  }
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

function requireLibrary(): LibraryClient {
  if (!library) throw new Error('Biblioteka nie jest gotowa')
  return library
}

function requireLabeler(): AutoLabeler {
  if (!labeler) throw new Error('Biblioteka nie jest gotowa')
  return labeler
}

function autoLabelState(): AutoLabelState {
  return {
    pending: [],
    done: 0,
    total: 0,
    error: null,
    ...labeler?.state(),
    newFiles: config.autoLabelNew,
    tickets: config.autoLabelTickets,
    starters: config.labelStarters
  }
}

function parseAutoLabelChange(value: unknown): Partial<AppConfig> {
  const { newFiles, tickets, starters } = (value ?? {}) as Partial<AutoLabelOptions>
  return {
    ...(typeof newFiles === 'boolean' && { autoLabelNew: newFiles }),
    ...(typeof tickets === 'boolean' && { autoLabelTickets: tickets }),
    ...(Array.isArray(starters) && { labelStarters: parseLabels(starters) })
  }
}

/** Usunięta etykieta nie może wrócić od Haiku, a przemianowana zachowuje swój kolor i miejsce na liście. */
async function followLabel(name: string, next: string | null): Promise<void> {
  const others = config.labelStarters.filter((starter) => !sameLabel(starter, name))
  const wasStarter = hasLabel(config.labelStarters, name)
  await storeConfig({
    labelStarters: wasStarter && next ? [...others, next] : others,
    labelColors: moveLabelColor(config.labelColors, name, next)
  })
}

function scanLibrary(refreshGit = false): Promise<void> {
  lastScanAt = Date.now()
  return requireLibrary().scan(refreshGit)
}

function libraryConfig(): LibraryConfig {
  const { roots, folderLinks, hiddenFolders, folderNames, labelStarters, labelColors, ticketUrl } = config
  return { roots, folderLinks, hiddenFolders, folderNames, labelStarters, labelColors, ticketUrl }
}

async function storeConfig(change: Partial<AppConfig>): Promise<void> {
  config = { ...config, ...change }
  library?.settings(libraryConfig()).catch(ignore)
  await saveConfig(config)
}

/** Skan rusza od razu, a zapis konfiguracji idzie obok, żeby wybór folderu miał natychmiastowy skutek. */
async function updateConfig(change: Partial<AppConfig>, refreshGit = true): Promise<void> {
  lastScanAt = Date.now()
  const saved = storeConfig(change)
  await Promise.all([requireLibrary().configure(libraryConfig(), refreshGit), saved])
}

/** Ukrycie i nazwy nie zmieniają obserwowanych folderów ani repozytoriów, więc wystarczy zwykły skan. */
function updateFolders(change: Pick<Partial<AppConfig>, 'hiddenFolders' | 'folderNames'>): Promise<void> {
  return updateConfig(change, false)
}

const absolutePaths = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string' && isAbsolute(path)) : []

/** Folder, który obejmuje cały wybrany folder, opróżniłby bibliotekę. Od tego jest lista folderów. */
function hideFolders(paths: unknown): Promise<void> {
  const folders = absolutePaths(paths).filter((path) => !config.roots.some((root) => isInside(root, path)))
  return updateFolders({ hiddenFolders: [...new Set([...config.hiddenFolders, ...folders])] })
}

/** Jeden wiersz może zbierać kilka folderów, np. z worktree, więc nazwa zastępuje wszystkie poprzednie. */
function renameFolder(paths: unknown, name: unknown): Promise<void> {
  const folders = absolutePaths(paths)
  const names = Object.entries(config.folderNames).filter(([folder]) => !folders.includes(folder))
  const [first] = folders
  const alias = typeof name === 'string' ? name.trim() : ''
  return updateFolders({ folderNames: Object.fromEntries(first && alias ? [...names, [first, alias]] : names) })
}

async function chooseFolders(title: string, multiple: boolean): Promise<string[]> {
  if (!mainWindow) return []
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: multiple ? ['openDirectory', 'multiSelections'] : ['openDirectory']
  })
  return canceled ? [] : filePaths
}

async function addRoots(): Promise<void> {
  const folders = await chooseFolders(t('Wybierz foldery z dokumentami'), true)
  if (folders.length > 0) await updateConfig({ roots: [...new Set([...config.roots, ...folders])] })
}

async function isFolder(path: string): Promise<boolean> {
  return stat(path).then(
    (info) => info.isDirectory(),
    () => false
  )
}

/** Foldery upuszczone na ścianę. Ścieżki pochodzą z powłoki, więc sprawdzamy, że to katalogi. */
async function addDroppedFolders(paths: unknown): Promise<void> {
  const checked = await Promise.all(absolutePaths(paths).map(async (path) => ((await isFolder(path)) ? [path] : [])))
  const folders = checked.flat()
  if (folders.length > 0) await updateConfig({ roots: [...new Set([...config.roots, ...folders])] })
}

async function linkFolder(): Promise<void> {
  const [folder] = await chooseFolders(t('Wybierz folder z dokumentami'), false)
  if (!folder) return
  const [repo] = await chooseFolders(t('Wybierz repozytorium, do którego należy ten folder'), false)
  if (!repo) return

  if (!(await readRepo(repo, git))) {
    await dialog.showMessageBox({
      type: 'warning',
      message: t('Wybrany folder nie jest repozytorium git.'),
      buttons: ['OK']
    })
    return
  }
  const others = config.folderLinks.filter((link) => link.folder !== folder)
  await updateConfig({ folderLinks: [...others, { folder, repo }] })
}

/** Apka bez instalatora startuje jako Electron z folderem projektu, więc wpis musi go wskazać. */
const loginItem = (): Electron.Settings => (app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] })

const readOpenAtLogin = (): boolean => app.getLoginItemSettings(loginItem()).openAtLogin

function appInfo(): AppInfo {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    dataDir: dataDir(),
    openAtLogin: readOpenAtLogin(),
    allowedHosts: config.allowedHosts
  }
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

function assertShell(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (event.sender !== mainWindow?.webContents) throw new Error('Niedozwolony nadawca IPC')
}

function requireDoc(docId: unknown): DocEntry {
  const doc = typeof docId === 'string' ? requireLibrary().getEntry(docId) : undefined
  if (!doc) throw new Error('Nieznany dokument')
  return doc
}

/** Kadry trasy idą z powłoki do dokumentu, więc sprawdzamy je jak trasę z pliku. */
function parseRoute(value: unknown): { frames: RouteFrame[]; selected: string | null } | null {
  if (typeof value !== 'object' || value === null) return null
  const { frames, selected } = value as Record<string, unknown>
  if (!Array.isArray(frames)) return null
  const parsed = frames.slice(0, MAX_STEPS).flatMap((frame): RouteFrame[] => {
    const { id, camera, label } = (frame ?? {}) as Record<string, unknown>
    const step = parseStepCamera(camera, (anchor) => parseAnchor(anchor))
    if (typeof id !== 'string' || !STEP_ID.test(id) || !step) return []
    return [{ id, camera: step, label: typeof label === 'string' ? label.slice(0, 160) : '' }]
  })
  return { frames: parsed, selected: typeof selected === 'string' ? selected : null }
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

  handle('library:get', () => requireLibrary().snapshotJson())
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
  handle('library:hide-folders', (paths: unknown) => hideFolders(paths))
  handle('library:show-folder', (path: unknown) =>
    updateFolders({ hiddenFolders: config.hiddenFolders.filter((folder) => folder !== path) })
  )
  handle('library:rename-folder', (paths: unknown, name: unknown) => renameFolder(paths, name))
  handle('library:reveal-folder', (path: unknown) => {
    if (typeof path === 'string' && isAbsolute(path)) shell.showItemInFolder(path)
  })
  handle('library:search-content', (query: unknown) => {
    const parsed = parseTextQuery(query)
    return parsed ? searcher.search(parsed) : { docs: [] }
  })
  handle('library:preview-hit', (docId: unknown, query: unknown, target: unknown) => {
    const command = parseFindCommand({ type: 'set', query, target })
    if (typeof docId !== 'string' || command?.type !== 'set' || !command.target || !library?.getEntry(docId)) return null
    return hitPreviews?.preview(docId, command.query, command.target) ?? null
  })
  handle('library:search', (query: unknown) =>
    typeof query === 'string' ? requireLibrary().search(query) : []
  )
  handle('doc:set-status', (docId: unknown, status: unknown) => {
    if (!isDocStatus(status)) throw new Error('Nieznany status')
    return requireLibrary().setStatus(requireDoc(docId).id, status)
  })
  handle('doc:set-statuses', (docIds: unknown, status: unknown) => {
    if (!isDocStatus(status)) throw new Error('Nieznany status')
    if (!Array.isArray(docIds)) throw new Error('Oczekiwano listy dokumentów')
    const library = requireLibrary()
    // Ukryty folder nie oddaje dokumentów nawet po identyfikatorze, tak jak przy pojedynczej zmianie.
    const known = docIds.filter((id): id is string => typeof id === 'string' && library.getEntry(id) !== undefined)
    return library.setStatuses(known, status)
  })
  handle('doc:set-classification', (docId: unknown, classification: unknown) => {
    if (classification !== 'document' && classification !== 'ignored') {
      throw new Error('Nieznana klasyfikacja')
    }
    return requireLibrary().setClassification(requireDoc(docId).id, classification)
  })
  handle('doc:set-labels', (docId: unknown, labels: unknown) =>
    requireLibrary().setLabels(requireDoc(docId).id, labels)
  )
  handle('labels:rename', async (from: unknown, to: unknown) => {
    await requireLibrary().renameLabel(String(from), to)
    await followLabel(String(from), cleanLabel(to))
  })
  handle('labels:delete', async (name: unknown) => {
    await requireLibrary().deleteLabel(String(name))
    await followLabel(String(name), null)
  })
  handle('labels:auto-state', () => autoLabelState())
  handle('labels:auto-run', (docIds: unknown) =>
    requireLabeler().labelAll(Array.isArray(docIds) ? docIds.map(String) : [])
  )
  handle('labels:auto-stop', () => requireLabeler().stop())
  handle('labels:auto-options', async (change: unknown) => {
    await storeConfig(parseAutoLabelChange(change))
    sendToShell('labels:auto-state', autoLabelState())
  })
  handle('labels:set-color', async (name: unknown, tone: unknown) => {
    if (!isLabelTone(tone)) throw new Error('Nieznany kolor etykiety')
    await storeConfig({ labelColors: withLabelColor(config.labelColors, String(name), tone) })
  })
  handle('labels:set-ticket-url', async (value: unknown) => {
    const ticketUrl = ticketTemplate(value)
    if (ticketUrl === null) throw new Error('To nie jest adres strony')
    await storeConfig({ ticketUrl })
  })
  handle('doc:rename', (docId: unknown, name: unknown) => requireLibrary().renameDoc(requireDoc(docId).id, String(name)))
  handle('doc:reveal', (docId: unknown) => shell.showItemInFolder(requireDoc(docId).path))
  handle('app:open-external', (url: unknown) => {
    if (typeof url === 'string' && isExternalUrl(url)) void shell.openExternal(url)
  })
  handle('options:info', () => appInfo())
  handle('options:agent', () => readAgentSetup(__dirname, { claude, locate }))
  handle('options:set-login', (on: unknown) => {
    app.setLoginItemSettings({ ...loginItem(), openAtLogin: on === true })
    return readOpenAtLogin()
  })
  handle('options:set-hosts', async (hosts: unknown) => {
    await storeConfig({ allowedHosts: cleanHosts(hosts) })
    return config.allowedHosts
  })
  handle('options:language', () => config.language)
  handle('options:set-language', async (value: unknown) => {
    if (!isLanguage(value)) throw new Error('Nieznany język')
    await storeConfig({ language: value })
    setLanguage(value)
    viewer?.setLanguage(value)
  })
  handle('viewer:open', (docId: unknown) => (files.has(String(docId)) ? viewer?.open(String(docId)) : openDocument(requireDoc(docId))))
  handle('viewer:warm', (docId: unknown) => (files.has(String(docId)) ? viewer?.open(String(docId)) : warmDocument(requireDoc(docId))))
  handle('links:list', (docId: unknown) => links.links(requireDoc(docId)))
  handle('links:pair', (docId: unknown) => links.pair(requireDoc(docId)))
  handle('links:follow', (docId: unknown, href: unknown, mode: unknown) =>
    followLink(requireDoc(docId), String(href), parseOpenMode(mode))
  )
  handle('links:shot', (request: unknown) => linkShot(parseLinkShot(request)))
  handle('files:mode', (docId: unknown, mode: unknown) => {
    const id = String(docId)
    const entry = files.setMode(id, mode === 'diff' ? 'diff' : 'file')
    if (entry?.file) viewer?.aim(id, entry.file.mode)
    return entry ?? null
  })
  handle('viewer:close', (docId: unknown) => viewer?.close(String(docId)))
  handle('viewer:reload', async (docId: unknown) => {
    // Arkusz pliku czyta plik i HEAD od nowa, zanim strona przeładuje się z nowymi danymi.
    if (files.has(String(docId))) await files.refresh(String(docId))
    viewer?.reload(String(docId))
  })
  handle('viewer:layout', (placements: unknown) => viewer?.setLayout(parsePlacements(placements)))
  handle('viewer:capture', (docId: unknown) => viewer?.capture(String(docId)) ?? null)
  handle('viewer:camera', (docId: unknown, shot: unknown) =>
    viewer?.aimCamera(String(docId), shot === null ? null : parseCameraShot(shot, (value) => parseAnchor(value))) ?? null
  )
  handle('viewer:camera-plan', (docId: unknown, shot: unknown) => {
    const parsed = parseCameraShot(shot, (value) => parseAnchor(value))
    return parsed ? (viewer?.planCamera(String(docId), parsed) ?? null) : null
  })
  handle('viewer:camera-leg', (docId: unknown, leg: unknown) => {
    const parsed = parseCameraLeg(leg)
    return parsed ? (viewer?.steerCamera(String(docId), parsed) ?? null) : null
  })
  handle('viewer:set-current', (docId: unknown) =>
    setCurrentDocument(docId === null || files.has(String(docId)) ? null : requireDoc(docId))
  )

  handle('presentation:get', (docId: unknown) => presentations.read(requireDoc(docId).id))
  handle('presentation:save', (docId: unknown, value: unknown) => {
    const doc = requireDoc(docId)
    const presentation = readPresentation(value)
    if (!presentation) throw new Error('Niepoprawna trasa')
    return presentations.write(doc.id, presentation)
  })
  handle('annotations:list', () => annotations.listAll())
  handle('annotations:create', async (docId: unknown, input: unknown) => {
    const doc = requireDoc(docId)
    if (doc.classification !== 'document' || !doc.sha) {
      throw new Error('Uwagi można dodawać tylko do dokumentów z biblioteki')
    }
    await noteHistory.create(doc.id, doc.sha, parseNewAnnotation(input))
  })
  handle('annotations:reply', async (id: unknown, text: unknown) => {
    await noteHistory.reply(String(id), String(text))
  })
  handle('annotations:set-status', async (id: unknown, status: unknown) => {
    if (status !== 'open' && status !== 'resolved') throw new Error('Nieznany status uwagi')
    await noteHistory.setStatus(String(id), status)
  })
  handle('annotations:set-audience', async (id: unknown, audience: unknown) => {
    await noteHistory.setAudience(String(id), parseAudience(audience))
  })
  handle('annotations:delete', (id: unknown) => noteHistory.delete(String(id)))
  handle('annotations:move', async (id: unknown, anchor: unknown) => {
    const place = parseAnchor(anchor)
    if (!place) throw new Error('Niepoprawne miejsce uwagi')
    await noteHistory.setAnchor(String(id), place)
  })
  handle('annotations:undo', (docId: unknown) => noteHistory.undo(String(docId)))
  handle('annotations:redo', (docId: unknown) => noteHistory.redo(String(docId)))

  ipcMain.on('app:copy-text', (event, text: unknown) => {
    assertShell(event)
    if (typeof text === 'string') clipboard.writeText(text)
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
  ipcMain.on('card-layer:place', (event, bounds: unknown) => {
    assertShell(event)
    if (isValidBounds(bounds)) cardLayer?.place(bounds)
    else cardLayer?.hide()
  })
  ipcMain.on('layer:focus', (event) => {
    assertShell(event)
    dockLayer?.focus()
  })
  ipcMain.on('viewer:find', (event, docId: unknown, command: unknown) => {
    assertShell(event)
    const parsed = parseFindCommand(command)
    if (parsed) viewer?.find(String(docId), parsed)
  })
  ipcMain.on('viewer:set-mode', (event, docId: unknown, mode: unknown) => {
    assertShell(event)
    const next: OverlayMode = mode === 'comment' || mode === 'sticky' ? mode : null
    viewer?.setOverlayMode(String(docId), next)
    if (next) viewer?.focus(String(docId))
  })
  ipcMain.on('viewer:set-pointer', (event, on: unknown) => {
    assertShell(event)
    viewer?.setPointer(on === true)
  })
  ipcMain.on('viewer:set-minimap', (event, on: unknown) => {
    assertShell(event)
    viewer?.setMinimap(on === true)
  })
  ipcMain.on('viewer:outline', (event, docId: unknown, command: unknown) => {
    assertShell(event)
    const parsed = parseOutlineCommand(command)
    if (parsed) viewer?.outline(String(docId), parsed)
  })
  ipcMain.on('viewer:set-marker', (event, color: unknown) => {
    assertShell(event)
    viewer?.setMarker(parseStickyColor(color))
  })
  ipcMain.on('viewer:set-shaper', (event, tool: unknown) => {
    assertShell(event)
    const { type, color } = (tool ?? {}) as Record<string, unknown>
    const shapeType = parseShapeType(type)
    const shapeColor = parseStickyColor(color)
    viewer?.setShaper(shapeType && shapeColor ? { type: shapeType, color: shapeColor } : null)
  })
  ipcMain.on('viewer:hide-drawings', (event, docIds: unknown) => {
    assertShell(event)
    viewer?.setHiddenDrawings(Array.isArray(docIds) ? docIds.filter((id): id is string => typeof id === 'string') : [])
  })
  ipcMain.on('viewer:route', (event, docId: unknown, route: unknown) => {
    assertShell(event)
    viewer?.setRoute(String(docId), parseRoute(route))
  })
  ipcMain.on('viewer:present', (event, docId: unknown, state: unknown) => {
    assertShell(event)
    viewer?.setPresent(String(docId), state === null ? null : parsePresentState(state, (value) => parseAnchor(value)))
  })
  ipcMain.on('viewer:place-note', (event, docId: unknown, kind: unknown, color: unknown) => {
    assertShell(event)
    if (kind !== 'comment' && kind !== 'sticky') return
    viewer?.placeNote(String(docId), kind, parseStickyColor(color) ?? 'yellow')
  })
  ipcMain.on('viewer:carry', (event, docId: unknown, id: unknown) => {
    assertShell(event)
    const carried = typeof id === 'string' ? id : null
    viewer?.carryNote(String(docId), carried)
    // Esc ma trafić do dokumentu, w którym uwaga wisi przy kursorze.
    if (carried) viewer?.focus(String(docId))
  })
  ipcMain.on('viewer:pick', (event, docId: unknown, kind: unknown) => {
    assertShell(event)
    viewer?.setPicker(String(docId), kind === 'place' || kind === 'area' ? kind : null)
  })
  ipcMain.on('viewer:focus-annotation', (event, docId: unknown, id: unknown) => {
    assertShell(event)
    viewer?.focusOverlayItem(String(docId), typeof id === 'string' ? id : null)
  })
  ipcMain.on('viewer:track', (event, docId: unknown, on: unknown) => {
    assertShell(event)
    viewer?.trackOverlay(String(docId), on === true)
  })
  ipcMain.on('thumbs:request', (event, docIds: unknown) => {
    assertShell(event)
    if (Array.isArray(docIds)) thumbnails?.request(docIds.filter((id): id is string => typeof id === 'string'))
  })
  ipcMain.on('window:set-theme', (event, mode: unknown) => {
    assertShell(event)
    if (mode === 'light' || mode === 'dark' || mode === 'system') applyTheme(mode)
  })
  handle('terminal:start', (docId: unknown, cols: unknown, rows: unknown) => {
    const doc = typeof docId === 'string' ? library?.getEntry(docId) : undefined
    return terminals.start(terminalDir(doc && !doc.missing ? doc.path : null), cols, rows)
  })
  handle('terminal:attach', (id: unknown) => terminals.attach(id))
  ipcMain.on('terminal:input', (event, id: unknown, data: unknown) => {
    assertShell(event)
    terminals.write(id, data)
  })
  ipcMain.on('terminal:resize', (event, id: unknown, cols: unknown, rows: unknown) => {
    assertShell(event)
    terminals.resize(id, cols, rows)
  })
  ipcMain.on('terminal:kill', (event, id: unknown) => {
    assertShell(event)
    terminals.kill(id)
  })
}

function createWindow(): BrowserWindow {
  const theme: ThemeMode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Bibliotter',
    icon: process.platform === 'win32' ? iconIco : iconPng,
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

  window.once('ready-to-show', () => {
    window.show()
    viewer?.warmUp()
  })
  const layer = new DockLayer(window)
  dockLayer = layer
  const cards = new DockLayer(window, 'card-layer')
  cards.hide()
  cardLayer = cards
  window.webContents.setWindowOpenHandler((details) => {
    const dock = layer.open(details)
    return dock.action === 'allow' ? dock : cards.open(details)
  })
  window.on('blur', () => hoverLink(null))
  // Boczne przyciski myszy i klawisze multimedialne cofają po historii dokumentów w powłoce.
  window.on('app-command', (_event, command) => {
    const key = command === 'browser-backward' ? 'BrowserBack' : command === 'browser-forward' ? 'BrowserForward' : null
    if (key) sendToShell('viewer:key', { type: 'down', key, code: key, ctrl: false, shift: false, alt: false })
  })
  // Vite przeładowuje stronę pod tym samym adresem. Każda inna nawigacja opuściłaby powłokę.
  window.webContents.on('will-navigate', (event) => {
    if (event.url !== window.webContents.getURL()) event.preventDefault()
  })
  window.webContents.on('did-navigate', () => {
    viewer?.reset()
    thumbnails?.forgetSent()
  })
  window.on('focus', () => {
    if (Date.now() - lastScanAt > RESCAN_ON_FOCUS_AFTER_MS) scanLibrary(true).catch(ignore)
  })

  viewer = new DocViewer({
    window,
    get allowedHosts() {
      return config.allowedHosts
    },
    lookupDocPath: (docId) => library?.getServedPath(docId) ?? files.pathOf(docId),
    fileSheets: files,
    renderMarkdown: (docPath) => requireLibrary().renderMarkdown(docPath),
    onState: (state) => sendToShell('viewer:state', state),
    onOverlayEvent: forwardOverlayEvent,
    onOverlayReady: (docId) => void pushDocAnnotations(docId),
    onKey: (key) => sendToShell('viewer:key', key),
    onFocus: (docId) => sendToShell('viewer:focus', docId),
    onStacked: () => {
      layer.raise()
      cards.raise()
    },
    openLink: followLinkFrom,
    onLinkHover: hoverLink,
    matchPage: (text, query) => searcher.matchPage(text, query)
  })

  thumbnails = new Thumbnailer({
    dir: join(dataDir(), 'cache', 'thumbs'),
    viewer: () => viewer,
    shaOf: (docId) => library?.getEntry(docId)?.sha ?? null,
    themed: (docId) => library?.getEntry(docId)?.format === 'markdown',
    send: (thumb) => sendToShell('thumbs:ready', thumb)
  })
  hitPreviews = new HitPreviewer({
    viewer: () => viewer,
    shaOf: (docId) => library?.getEntry(docId)?.sha ?? null,
    isStatic: (docId) => library?.getEntry(docId)?.format === 'markdown',
    scale: () => (window.isDestroyed() ? 1 : screen.getDisplayMatching(window.getBounds()).scaleFactor)
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
    hitPreviews?.close()
    hitPreviews = null
    dockLayer?.close()
    dockLayer = null
    cardLayer?.close()
    cardLayer = null
    mainWindow = null
    viewer?.dispose()
    viewer = null
  })
  return window
}

async function start(): Promise<void> {
  // Biblioteka nie potrzebuje okna, więc wczytuje ostatnią migawkę, zanim Electron skończy start.
  config = await loadConfig()
  setLanguage(config.language)
  lastScanAt = Date.now()
  library = new LibraryClient({
    script: join(__dirname, 'libraryWorker.js'),
    init: () => ({ dataDir: dataDir(), config: libraryConfig() }),
    onChange: (json) => {
      sendToShell('library:changed', json)
      links.warmSoon()
    },
    onProgress: (progress) => sendToShell('library:progress', progress),
    onNewDocs: (docIds) => {
      if (config.autoLabelNew) labeler?.enqueue(docIds)
    }
  })
  labeler = new AutoLabeler(
    library,
    claudeRunner(dataDir()),
    () => sendToShell('labels:auto-state', autoLabelState()),
    () => config.autoLabelTickets
  )
  await app.whenReady()
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, respond) => respond(false))
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  registerIpc()
  stopWatchingAnnotations = watchAnnotations(join(dataDir(), 'library'), () => void pushAnnotations())
  stopWatchingLabels = watchSignal(join(dataDir(), 'library'), 'labels', () => library?.reloadLabels().catch(ignore))
  stopWatchingPresentation = watchPresentation(join(dataDir(), 'library'), () => sendToShell('presentation:changed', null))
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
  app.on('will-quit', (event) => {
    searcher.close()
    linkReaders.close()
    terminals.killAll()
    const closing = library?.close()
    if (!closing) return
    library = null
    stopWatchingAnnotations?.()
    stopWatchingLabels?.()
    stopWatchingPresentation?.()
    labeler?.stop()
    // Po zamknięciu apki żaden dokument nie jest już otwarty, więc agent nie powinien go wskazywać.
    rmSync(currentDocumentPath(dataDir()), { force: true })
    event.preventDefault()
    void closing.finally(() => app.quit())
  })
  void start()
} else {
  app.quit()
}
