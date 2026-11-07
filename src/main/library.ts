import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type {
  DocClass,
  DocEntry,
  DocStatus,
  FolderLink,
  LibrarySnapshot,
  ProjectGroup,
  PullRequest,
  ScanProgress,
  SearchHit
} from '../shared/types'
import { hasLabel } from '../shared/labels'
import { analyzeFile, type FileAnalyzer } from './analysis'
import type { LabelChoice } from './autoLabel'
import { analyzeDocument, classify, classifyByPath, type Classification, type HtmlFeatures } from './classify'
import { mapLimit, startQueue } from './concurrency'
import type { AppConfig } from './config'
import type { GitRunner, RepoInfo } from './git'
import { positionAt, readRepo, readRepoFromFiles } from './git'
import { LabelStore } from './labelStore'
import { MetaStore, type DocMeta } from './metaStore'
import { type FoundFile, docIdFor, folderName, formatOf, isInside, normalizePath, stableId, walkRoots } from './scanner'
import { type DocText, SearchIndex } from './searchIndex'

const MAX_FILE_BYTES = 32 * 1024 * 1024
const ARCHIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000
const REPO_CACHE_MS = 30_000
const PR_CACHE_MS = 15 * 60 * 1000
const MAX_PR_LOOKUPS = 20
const READ_CONCURRENCY = 16
const MAX_LABEL_EXAMPLES = 3
const INDEX_OPEN_ATTEMPTS = 30
const INDEX_RETRY_MS = 100
/** Tyle czasu skan szuka plików, zanim zacznie je czytać, żeby najnowsze weszły jako pierwsze. */
const WALK_HEAD_START_MS = 250
const PREVIEW_MIN_GAP_MS = 120
const PREVIEW_MAX_GAP_MS = 1000
const PREVIEW_GAP_GROWTH = 1.4
const PROGRESS_EVERY_MS = 100
/** Tyle dokumentów naraz trafia do indeksu, a między porcjami wątek obsługuje wiadomości. */
const FTS_BATCH = 24
const CACHE_FILE = 'library-v1.json'

export type LibraryConfig = Pick<AppConfig, 'roots' | 'folderLinks'> &
  Partial<Pick<AppConfig, 'hiddenFolders' | 'folderNames' | 'labelStarters' | 'labelColors' | 'ticketUrl'>>

export interface LibraryOptions {
  dataDir: string
  git: GitRunner
  gh: GitRunner
  getConfig: () => LibraryConfig
  /** `json` to migawka w gotowej postaci, żeby odbiorca nie musiał jej liczyć drugi raz. */
  onChange: (snapshot: LibrarySnapshot, json: string) => void
  onProgress?: (progress: ScanProgress) => void
  /** Analiza pliku, którą można przenieść na inne wątki. Domyślnie działa w tym samym. */
  analyze?: FileAnalyzer
  /** Dokumenty, które dopiero powstały. Nie obejmuje plików zastanych przy dodaniu folderu. */
  onNewDocs?: (docIds: string[]) => void
  now?: () => Date
}

interface AnalyzedFile extends FoundFile, Omit<HtmlFeatures, 'text'> {
  sha: string
  /** Tekst jest dostępny tylko dla plików odczytanych w tym skanie. */
  text: string | null
}

interface Placement {
  projectKey: string
  projectPath: string
  projectName: string
  isRepo: boolean
  defaultBranch: string | null
  relPath: string
  repo: RepoInfo | null
}

interface PlacedFile {
  file: AnalyzedFile
  placement: Placement
  verdict: Classification
  meta: DocMeta | undefined
}

/** Dokument pokazany w bibliotece wraz z miejscem, do którego należy. */
interface LibraryItem {
  entry: DocEntry
  placement: Placement
}

interface SearchableDoc {
  id: string
  file: AnalyzedFile
  placement: Placement
}

/** Dorobek jednego przejścia po folderach. */
interface ScanRun {
  startedAt: number
  /** Plik zmieniony od tej chwili i nieznany bibliotece to nowy dokument. */
  newSince: number | null
  links: FolderLink[]
  files: AnalyzedFile[]
  seenPaths: Set<string>
  unavailableRoots: string[]
  /** Pliki odrzucone bez czytania. */
  ignored: number
  /** Treści już pokazane, żeby identyczne kopie nie migały przed scaleniem. */
  shown: Set<string>
}

type SnapshotBase = Pick<
  LibrarySnapshot,
  'roots' | 'unavailableRoots' | 'folderLinks' | 'hiddenFolders' | 'folderNames' | 'labelColors' | 'ticketUrl' | 'ignoredCount'
>

const emptySnapshot = (): LibrarySnapshot => ({
  roots: [],
  unavailableRoots: [],
  folderLinks: [],
  hiddenFolders: [],
  folderNames: {},
  labelColors: {},
  ticketUrl: '',
  projects: [],
  review: [],
  ignoredCount: 0
})

/** Część ustawień, od której zależy zawartość biblioteki. */
const scopeOf = ({ roots, folderLinks, hiddenFolders = [], folderNames = {} }: LibraryConfig): string =>
  JSON.stringify([roots, folderLinks, hiddenFolders, folderNames])

const toPosix = (path: string): string => path.split(sep).join('/')

const newestFirst = (a: DocEntry, b: DocEntry): number =>
  b.mtimeMs - a.mtimeMs || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

const relativeToProject = (file: FoundFile): string => toPosix(relative(file.repoDir ?? file.root, file.path))

function loosePlacement(projectPath: string, projectName: string, relPath: string): Placement {
  return {
    projectKey: normalizePath(projectPath),
    projectPath,
    projectName,
    isRepo: false,
    defaultBranch: null,
    relPath,
    repo: null
  }
}

function parseCache(json: string): LibrarySnapshot | null {
  try {
    return JSON.parse(json) as LibrarySnapshot
  } catch {
    return null // Pamięć podręczna jest odtwarzalna, więc uszkodzoną po prostu pomijamy.
  }
}

/** Ogłasza pierwszą zmianę od razu, a kolejne coraz rzadziej, bo każdą trzeba przesłać i narysować. */
class PreviewPacer {
  private gap = PREVIEW_MIN_GAP_MS
  private nextAt = 0
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly publish: () => void) {}

  request(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.publish()
      this.nextAt = Date.now() + this.gap
      this.gap = Math.min(PREVIEW_MAX_GAP_MS, this.gap * PREVIEW_GAP_GROWTH)
    }, Math.max(0, this.nextAt - Date.now()))
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

function isGitHubRemote(url: string | null): boolean {
  return url?.includes('github.com') ?? false
}

/** Zbiera dokumenty z wybranych folderów i utrzymuje ich trwałe dane. */
export class Library {
  private readonly metas: MetaStore
  private readonly labels: LabelStore
  private readonly index: SearchIndex
  private readonly repoCache = new Map<string, { readAt: number; repo: Promise<RepoInfo | null> }>()
  /** Stan pokazywany w tej chwili. W trakcie skanu rośnie, a koniec skanu ustala go na nowo. */
  private items = new Map<string, LibraryItem>()
  /** Status nadany dokumentowi, który skan pokazał, ale jeszcze nie zapisał. */
  private readonly earlyStatus = new Map<string, DocStatus>()
  private snapshot: LibrarySnapshot = emptySnapshot()
  private running: Promise<LibrarySnapshot> | null = null
  private pending = false
  private forceGitRefresh = false
  /** Ostatnio ogłoszona treść biblioteki. Skan bez zmian nikogo nie budzi. */
  private published = ''
  private cached = ''
  private cacheWrites = 0
  private progress: ScanProgress = { active: false, found: 0, done: 0 }
  private progressAt = 0
  private githubUnavailable = false
  private closed = false
  /** Nazwy projektów nadane w apce, według znormalizowanej ścieżki. */
  private projectNames = new Map<string, string>()
  /** Poprzedni skan. Plik nowszy od jego początku powstał, gdy apka już tu patrzyła. */
  private lastScan: { startedAt: number; roots: Set<string> } | null = null

  private constructor(private readonly options: LibraryOptions) {
    this.metas = new MetaStore(join(options.dataDir, 'library'))
    this.labels = new LabelStore(join(options.dataDir, 'library'))
    this.index = new SearchIndex(join(options.dataDir, 'cache', 'index.sqlite'))
  }

  static async open(options: LibraryOptions): Promise<Library> {
    await mkdir(join(options.dataDir, 'cache'), { recursive: true })
    // Indeks jest odtwarzalny, więc nie powinien trafiać do prywatnego gita z danymi.
    await Library.ensureGitignore(options.dataDir)
    const library = await Library.create(options)
    // Najpierw to, co okno może pokazać od razu. Wczytanie danych dokumentów trwa dłużej.
    await library.restore()
    await Promise.all([library.metas.load(), library.labels.load()])
    return library
  }

  /** Zabity proces jeszcze chwilę trzyma pliki indeksu, np. przy restarcie w trybie dev. */
  private static async create(options: LibraryOptions): Promise<Library> {
    for (let attempt = 1; ; attempt++) {
      try {
        return new Library(options)
      } catch (error) {
        if (attempt === INDEX_OPEN_ATTEMPTS) throw error
        await new Promise((done) => setTimeout(done, INDEX_RETRY_MS))
      }
    }
  }

  private get cachePath(): string {
    return join(this.options.dataDir, 'cache', CACHE_FILE)
  }

  /** Ostatni stan biblioteki, bo przy starcie prawie nic się nie zmienia. */
  private async restore(): Promise<void> {
    const { roots, folderLinks, hiddenFolders = [], folderNames = {}, labelColors = {}, ticketUrl = '' } = this.options.getConfig()
    const json = await readFile(this.cachePath, 'utf8').catch(() => null)
    const cached = json ? parseCache(json) : null
    if (!json || !cached || JSON.stringify(cached.roots) !== JSON.stringify(roots)) {
      this.publish({ ...emptySnapshot(), roots, folderLinks, hiddenFolders, folderNames, labelColors, ticketUrl })
      return
    }
    for (const project of cached.projects) {
      const { path, name, isRepo, defaultBranch } = project
      const placement = { ...loosePlacement(path, name, ''), isRepo, defaultBranch }
      for (const entry of project.docs) this.items.set(entry.id, { entry, placement })
    }
    for (const entry of cached.review) {
      const folder = dirname(entry.path)
      this.items.set(entry.id, { entry, placement: loosePlacement(folder, entry.projectName, entry.relPath) })
    }
    this.snapshot = cached
    this.published = json
    this.cached = json
    this.options.onChange(cached, json)
  }

  /** Indeks i stan okna są odtwarzalne, więc nie powinny trafiać do prywatnego gita z danymi. */
  private static async ensureGitignore(directory: string): Promise<void> {
    const path = join(directory, '.gitignore')
    const existing = await readFile(path, 'utf8').catch(() => '')
    const lines = new Set(existing.split('\n').map((line) => line.trim()).filter(Boolean))
    const missing = ['cache/', 'state/'].filter((line) => !lines.has(line))
    if (missing.length === 0) return
    const prefix = existing && !existing.endsWith('\n') ? `${existing}\n` : existing
    await writeFile(path, `${prefix}${missing.join('\n')}\n`, 'utf8')
  }

  close(): void {
    this.closed = true
    this.index.close()
  }

  /** Czeka, aż skan i jego zapisy dobiegną końca. */
  async idle(): Promise<void> {
    await this.running
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  getSnapshot(): LibrarySnapshot {
    return this.snapshot
  }

  getEntry(docId: string): DocEntry | undefined {
    return this.items.get(docId)?.entry
  }

  /** Plik do wyświetlenia: oryginał albo ostatnia kopia, gdy oryginał zniknął. */
  getServedPath(docId: string): string | undefined {
    const entry = this.getEntry(docId)
    return entry?.copyPath ?? entry?.path
  }

  /** Skanuje foldery. Skan zgłoszony w trakcie innego wykona się raz, zaraz po nim. */
  scan({ refreshGit = false }: { refreshGit?: boolean } = {}): Promise<LibrarySnapshot> {
    this.forceGitRefresh ||= refreshGit
    // Postęp idzie pierwszy, żeby pusta ściana nie zdążyła powiedzieć, że nic tu nie ma.
    if (!this.running) this.beginProgress()
    this.applyConfig()
    if (this.running) {
      this.pending = true
      return this.running
    }
    this.running = this.runScans().finally(() => {
      this.running = null
    })
    return this.running
  }

  /** Czy plik należy do biblioteki według obecnych ustawień, a nie tych z początku skanu. */
  private inScope(path: string): boolean {
    const { roots, hiddenFolders = [] } = this.options.getConfig()
    return roots.some((root) => isInside(path, root)) && !hiddenFolders.some((folder) => isInside(path, folder))
  }

  /** Dodany, usunięty lub ukryty folder, nową nazwę, kolor etykiety i adres Jira widać od razu, a nie dopiero po skanie. */
  applyConfig(): void {
    const config = this.options.getConfig()
    const { roots, folderLinks, hiddenFolders = [], folderNames = {}, labelColors = {}, ticketUrl = '' } = config
    this.projectNames = new Map(Object.entries(folderNames).map(([folder, name]) => [normalizePath(folder), name]))
    const sameLabels =
      ticketUrl === (this.snapshot.ticketUrl ?? '') &&
      JSON.stringify(labelColors) === JSON.stringify(this.snapshot.labelColors ?? {})
    if (sameLabels && scopeOf(config) === scopeOf(this.snapshot)) return
    for (const [id, item] of this.items) {
      if (!this.inScope(item.entry.path)) {
        this.items.delete(id)
        continue
      }
      const projectName = this.projectName(item.placement.projectPath, item.placement.repo)
      item.placement = { ...item.placement, projectName }
      item.entry.projectName = projectName
    }
    this.publishItems({ roots, folderLinks, hiddenFolders, folderNames, labelColors, ticketUrl })
  }

  /** Nazwa nadana w apce ma pierwszeństwo przed nazwą repozytorium i folderu. */
  private projectName(projectPath: string, repo: RepoInfo | null): string {
    return this.projectNames.get(normalizePath(projectPath)) ?? repo?.name ?? folderName(projectPath)
  }

  private async runScans(): Promise<LibrarySnapshot> {
    do {
      this.pending = false
      await this.scanOnce()
    } while (this.pending)
    // Lista PR-ów to dodatek, więc jej błąd nie powinien nikogo obchodzić.
    void this.refreshPullRequests().catch(() => {})
    return this.snapshot
  }

  private publish(snapshot: LibrarySnapshot): void {
    this.snapshot = snapshot
    const content = JSON.stringify(snapshot)
    if (content === this.published) return
    this.published = content
    this.options.onChange(snapshot, content)
  }

  private publishItems(change: Partial<SnapshotBase> = {}): void {
    const { roots, unavailableRoots, folderLinks, hiddenFolders, folderNames, labelColors, ticketUrl, ignoredCount } = this.snapshot
    const base = { roots, unavailableRoots, folderLinks, hiddenFolders, folderNames, labelColors, ticketUrl, ignoredCount }
    this.publish(this.assemble({ ...base, ...change }))
  }

  private beginProgress(): void {
    this.progress = { active: true, found: 0, done: 0 }
    this.reportProgress(true)
  }

  private reportProgress(force = false): void {
    const now = Date.now()
    if (!force && now - this.progressAt < PROGRESS_EVERY_MS) return
    this.progressAt = now
    this.options.onProgress?.({ ...this.progress })
  }

  /** Ostatnie odkrycie dokumentu. Pusta biblioteka nie ma punktu odniesienia, więc nic nie jest nowe. */
  private latestDiscovery(): number | null {
    const times = this.metas.all().map((meta) => Date.parse(meta.firstSeenAt))
    return times.length > 0 ? Math.max(...times) : null
  }

  private async scanOnce(): Promise<void> {
    if (this.forceGitRefresh) this.repoCache.clear()
    this.forceGitRefresh = false

    const config = this.options.getConfig()
    this.beginProgress()
    let searchable: SearchableDoc[] = []
    try {
      searchable = await this.settle(await this.collect(config), config)
    } finally {
      // Także po błędzie, bo inaczej ściana czekałaby na dokumenty, które już nie przyjdą.
      this.progress = { ...this.progress, active: false }
      this.reportProgress(true)
    }
    await this.persist(searchable)
  }

  /** Czy plik odpada bez czytania. Decyzja użytkownika ma pierwszeństwo przed regułami. */
  private rejectedByPath(file: FoundFile, meta: DocMeta | undefined): boolean {
    const override = meta?.classificationOverride
    if (override) return override === 'ignored'
    return classifyByPath({ relPath: relativeToProject(file), siblings: file.siblings, format: file.format }) !== null
  }

  /**
   * Szuka plików i czyta je od najnowszych. Co przeczytane, od razu trafia na ekran,
   * ale niczego jeszcze nie zapisuje, bo komplet zna dopiero `settle`.
   */
  private async collect({ roots, folderLinks, hiddenFolders = [] }: LibraryConfig): Promise<ScanRun> {
    const metaByPath = new Map(this.metas.all().map((meta) => [normalizePath(meta.path), meta]))
    const run: ScanRun = {
      startedAt: this.now().getTime(),
      newSince: this.lastScan?.startedAt ?? this.latestDiscovery(),
      links: folderLinks,
      files: [],
      seenPaths: new Set(),
      unavailableRoots: [],
      ignored: 0,
      shown: new Set()
    }
    const pacer = new PreviewPacer(() => this.publishItems())
    const waiting: FoundFile[] = []
    let sorted = true
    let walked = false
    let reading = false

    const take = (): FoundFile | undefined => {
      if (!sorted) waiting.sort((a, b) => a.mtimeMs - b.mtimeMs)
      sorted = true
      return waiting.pop()
    }
    const read = async (file: FoundFile): Promise<void> => {
      const analyzed = await this.analyze(file)
      this.progress.done += 1
      this.reportProgress()
      if (!analyzed) return
      run.files.push(analyzed)
      await this.preview(analyzed, metaByPath.get(normalizePath(file.path)), run, pacer)
    }

    await new Promise<void>((finished) => {
      const pump = startQueue(READ_CONCURRENCY, take, read, () => {
        if (walked) finished()
      })
      const startReading = (): void => {
        reading = true
        pump()
      }
      const headStart = setTimeout(startReading, WALK_HEAD_START_MS)

      const found = (file: FoundFile): void => {
        const key = normalizePath(file.path)
        run.seenPaths.add(key)
        this.progress.found += 1
        this.reportProgress()
        if (this.rejectedByPath(file, metaByPath.get(key))) {
          run.ignored += 1
          this.progress.done += 1
          return
        }
        waiting.push(file)
        sorted = false
        if (reading) pump()
      }

      void walkRoots(roots, hiddenFolders, found).then(({ unavailableRoots }) => {
        clearTimeout(headStart)
        run.unavailableRoots = unavailableRoots
        walked = true
        startReading()
      })
    })
    pacer.cancel()
    return run
  }

  private async analyze(file: FoundFile): Promise<AnalyzedFile | null> {
    const cached = this.index.getFile(file.path)
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
      return { ...file, ...cached.features, sha: cached.sha, text: null }
    }
    if (file.size > MAX_FILE_BYTES) return null
    const analysis = await this.analyzeContent(file.path, file.format)
    return analysis && { ...file, ...analysis }
  }

  private get analyzeContent(): FileAnalyzer {
    return this.options.analyze ?? analyzeFile
  }

  /** Pokazuje dokument, zanim skan się skończy. Znanego i niezmienionego nie trzeba ruszać. */
  private async preview(
    file: AnalyzedFile,
    meta: DocMeta | undefined,
    run: ScanRun,
    pacer: PreviewPacer
  ): Promise<void> {
    const id = meta?.id ?? docIdFor(file.path)
    if ((file.text === null && this.items.has(id)) || !this.inScope(file.path)) return
    const verdict = this.verdictFor(file, relativeToProject(file), meta)
    if (verdict.classification === 'ignored') return
    const placement = await this.place(file, run.links)
    const twin = `${placement.projectKey}|${file.sha}`
    if (run.shown.has(twin)) return
    run.shown.add(twin)
    this.items.set(id, { entry: this.entryOf({ file, placement, verdict, meta }, id, meta, []), placement })
    pacer.request()
  }

  /** Ustala stan końcowy. Część od `placeFiles` do publikacji nie czeka, więc nic jej nie przerwie. */
  private async settle(run: ScanRun, config: LibraryConfig): Promise<SearchableDoc[]> {
    const { roots, folderLinks, hiddenFolders = [], folderNames = {}, labelColors = {}, ticketUrl = '' } = config
    const isHidden = (path: string): boolean => hiddenFolders.some((folder) => isInside(path, folder))
    const { files, seenPaths } = run
    this.index.transaction(() => {
      this.index.retainFiles(new Set(files.map((file) => file.path)))
      for (const file of files) {
        if (file.text === null) continue
        this.index.putFile(file.path, file.mtimeMs, file.size, file.sha, { ...file, text: file.text })
      }
    })

    const metaByPath = new Map(this.metas.all().map((meta) => [normalizePath(meta.path), meta]))
    const placed = await this.placeFiles(files, metaByPath, folderLinks)
    // Foldery zmieniły się w trakcie, więc ten wynik byłby nieaktualny, a następny przebieg już czeka.
    if (scopeOf(this.options.getConfig()) !== scopeOf(config)) return []

    // W trakcie czekania użytkownik mógł zmienić status, więc liczą się dane najświeższe.
    const current = placed.map((item) => ({ ...item, meta: item.meta && (this.metas.get(item.meta.id) ?? item.meta) }))
    const kept = current.filter((item) => item.verdict.classification !== 'ignored')
    const { primary, otherPaths } = this.deduplicate(kept)

    const items = new Map<string, LibraryItem>()
    const searchable: SearchableDoc[] = []
    const newDocs: string[] = []
    for (const item of this.claimMovedMetas(primary, seenPaths, isHidden)) {
      const { file, placement, verdict } = item
      const isNew = this.isNewDoc(item, run.newSince)
      const meta = verdict.classification === 'document' ? this.recordDocument(file, placement, item.meta) : item.meta
      const id = meta?.id ?? docIdFor(file.path)
      const entry = this.entryOf(item, id, meta, otherPaths.get(file.path) ?? [])
      items.set(id, { entry, placement })
      searchable.push({ id, file, placement })
      if (isNew && entry.status !== 'archived') newDocs.push(id)
    }
    for (const missing of this.collectMissing(roots, seenPaths, items, isHidden)) items.set(missing.entry.id, missing)

    this.items = items
    this.earlyStatus.clear()
    this.publishItems({
      roots,
      folderLinks,
      hiddenFolders,
      folderNames,
      labelColors,
      ticketUrl,
      unavailableRoots: run.unavailableRoots,
      ignoredCount: run.ignored + current.length - kept.length
    })
    this.lastScan = { startedAt: run.startedAt, roots: new Set(roots) }
    if (newDocs.length > 0) this.options.onNewDocs?.(newDocs)
    return searchable
  }

  private isNewDoc({ meta, verdict, file }: PlacedFile, newSince: number | null): boolean {
    return (
      !meta &&
      verdict.classification === 'document' &&
      newSince !== null &&
      file.mtimeMs >= newSince &&
      // Świeżo dodany folder to zastane pliki, nawet jeśli ktoś niedawno je zmienił.
      (this.lastScan?.roots.has(file.root) ?? true)
    )
  }

  /** Zapisy na końcu skanu idą porcjami, żeby w tym czasie działało szukanie i zmiana statusu. */
  private async persist(docs: SearchableDoc[]): Promise<void> {
    await this.writeCache()
    await this.metas.flush()
    if (this.closed) return
    const stale = docs.filter(({ id, file }) => !this.index.hasDocText(id, file.sha))
    for (let start = 0; start < stale.length; start += FTS_BATCH) {
      const batch = stale.slice(start, start + FTS_BATCH)
      const texts = await mapLimit(batch, READ_CONCURRENCY, (doc) => this.searchTextFor(doc))
      if (this.closed) return
      this.index.transaction(() => {
        for (const text of texts) {
          if (text) this.index.putDocText(text)
        }
      })
      await new Promise((resume) => setImmediate(resume))
    }
  }

  private async writeCache(): Promise<void> {
    const content = this.published
    if (content === this.cached) return
    this.cacheWrites += 1
    const temp = `${this.cachePath}.${this.cacheWrites}.tmp`
    await writeFile(temp, content, 'utf8')
    await rename(temp, this.cachePath)
    this.cached = content
  }

  /** Pamiętamy obietnicę, bo pliki jednego repozytorium pytają o nie równolegle. */
  private repoFor(directory: string): Promise<RepoInfo | null> {
    const key = normalizePath(directory)
    const cached = this.repoCache.get(key)
    const now = this.now().getTime()
    if (cached && now - cached.readAt < REPO_CACHE_MS) return cached.repo
    const repo = readRepoFromFiles(directory)
      .catch(() => null)
      .then((found) => found ?? readRepo(directory, this.options.git))
    this.repoCache.set(key, { readAt: now, repo })
    return repo
  }

  private async place(file: AnalyzedFile, links: FolderLink[]): Promise<Placement> {
    const link = links
      .filter(({ folder }) => isInside(file.path, folder))
      .sort((a, b) => b.folder.length - a.folder.length)[0]
    const repoDirectory = link?.repo ?? file.repoDir
    const repo = repoDirectory ? await this.repoFor(repoDirectory) : null
    const base = link?.folder ?? repo?.worktreePath ?? file.repoDir ?? file.root
    const projectPath = repo?.mainPath ?? file.repoDir ?? file.root
    return {
      projectKey: normalizePath(projectPath),
      projectPath,
      projectName: this.projectName(projectPath, repo),
      isRepo: repo !== null || file.repoDir !== null,
      defaultBranch: repo?.defaultBranch ?? null,
      relPath: toPosix(relative(base, file.path)),
      repo
    }
  }

  private async placeFiles(
    files: AnalyzedFile[],
    metaByPath: Map<string, DocMeta>,
    links: FolderLink[]
  ): Promise<PlacedFile[]> {
    return mapLimit(files, READ_CONCURRENCY, async (file) => {
      // Klasyfikacja nie potrzebuje gita, więc pliki pomijane nie uruchamiają żadnych poleceń.
      const provisional = relativeToProject(file)
      const meta = metaByPath.get(normalizePath(file.path))
      const verdict = this.verdictFor(file, provisional, meta)
      const placement =
        verdict.classification === 'ignored'
          ? this.ignoredPlacement(file, provisional)
          : await this.place(file, links)
      return { file, placement, verdict, meta }
    })
  }

  private ignoredPlacement(file: AnalyzedFile, relPath: string): Placement {
    const projectPath = file.repoDir ?? file.root
    return {
      projectKey: normalizePath(projectPath),
      projectPath,
      projectName: folderName(projectPath),
      isRepo: file.repoDir !== null,
      defaultBranch: null,
      relPath,
      repo: null
    }
  }

  private verdictFor(file: AnalyzedFile, relPath: string, meta: DocMeta | undefined): Classification {
    const override = meta?.classificationOverride
    if (override) return { classification: override, reason: 'Twoja decyzja' }
    return classify(file, { relPath, siblings: file.siblings, format: file.format })
  }

  /** Identyczne kopie w jednym projekcie, np. w worktree, pokazujemy jako jeden dokument. */
  private deduplicate(items: PlacedFile[]): { primary: PlacedFile[]; otherPaths: Map<string, string[]> } {
    const groups = new Map<string, PlacedFile[]>()
    for (const item of items) {
      const key = `${item.placement.projectKey}|${item.file.sha}`
      groups.set(key, [...(groups.get(key) ?? []), item])
    }

    const rank = (item: PlacedFile): number[] => [
      item.meta ? 0 : 1,
      isInside(item.file.path, item.placement.projectPath) ? 0 : 1,
      item.file.path.length
    ]
    const compare = (a: PlacedFile, b: PlacedFile): number => {
      const [left, right] = [rank(a), rank(b)]
      for (let index = 0; index < left.length; index += 1) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0)
        if (difference !== 0) return difference
      }
      return a.file.path < b.file.path ? -1 : 1
    }

    const primary: PlacedFile[] = []
    const otherPaths = new Map<string, string[]>()
    for (const group of groups.values()) {
      const [first, ...rest] = [...group].sort(compare)
      if (!first) continue
      primary.push(first)
      otherPaths.set(first.file.path, rest.map((item) => item.file.path))
    }
    return { primary, otherPaths }
  }

  /**
   * Plik przeniesiony lub przemianowany przejmuje historię zaginionego dokumentu. Dokument
   * z ukrytego folderu nie zaginął, więc po przywróceniu folderu ma wrócić ze swoją historią.
   */
  private claimMovedMetas(items: PlacedFile[], seenPaths: Set<string>, isHidden: (path: string) => boolean): PlacedFile[] {
    const orphans = new Map<string, DocMeta>()
    for (const meta of this.metas.all()) {
      if (!seenPaths.has(normalizePath(meta.path)) && !orphans.has(meta.sha) && !isHidden(meta.path)) {
        orphans.set(meta.sha, meta)
      }
    }
    return items.map((item) => {
      if (item.meta) return item
      const meta = orphans.get(item.file.sha)
      orphans.delete(item.file.sha)
      return { ...item, meta }
    })
  }

  private newDocId(path: string): string {
    const base = docIdFor(path)
    // Adres zwolniony przez przeniesiony dokument nie może przejąć jego historii.
    return this.metas.get(base) ? stableId('d', `${path}#${this.now().getTime()}`) : base
  }

  private entryOf(
    { file, placement, verdict }: PlacedFile,
    id: string,
    meta: DocMeta | undefined,
    otherPaths: string[]
  ): DocEntry {
    const position = placement.repo ? positionAt(placement.repo, file.mtimeMs) : null
    return {
      id,
      path: file.path,
      name: file.name,
      format: file.format,
      relPath: placement.relPath,
      title: file.title,
      alias: meta?.alias ?? null,
      mtimeMs: file.mtimeMs,
      size: file.size,
      projectName: placement.projectName,
      classification: verdict.classification,
      reason: verdict.reason,
      status: meta?.status ?? this.initialStatus(file.mtimeMs),
      branch: meta?.branch ?? position?.branch ?? null,
      commit: meta?.commit ?? position?.commit ?? null,
      missing: false,
      otherPaths,
      sha: file.sha,
      labels: []
    }
  }

  private initialStatus(mtimeMs: number): DocStatus {
    return this.now().getTime() - mtimeMs > ARCHIVE_AFTER_MS ? 'archived' : 'to-read'
  }

  private recordDocument(file: AnalyzedFile, placement: Placement, existing: DocMeta | undefined): DocMeta {
    const now = this.now()
    const position = placement.repo ? positionAt(placement.repo, file.mtimeMs) : null
    const changed = existing?.sha !== file.sha

    const base: DocMeta = existing ?? {
      id: this.newDocId(file.path),
      path: file.path,
      title: file.title,
      firstSeenAt: now.toISOString(),
      status: this.earlyStatus.get(docIdFor(file.path)) ?? this.initialStatus(file.mtimeMs),
      sha: file.sha,
      mtimeMs: file.mtimeMs,
      projectPath: placement.projectPath,
      branch: position?.branch ?? null,
      commit: position?.commit ?? null,
      versions: []
    }

    const updated: DocMeta = {
      ...base,
      path: file.path,
      title: file.title,
      sha: file.sha,
      mtimeMs: file.mtimeMs,
      projectPath: placement.projectPath,
      // Branch przypisujemy przy powstaniu i przy zmianie treści, nie przy każdym skanie.
      branch: changed ? (position?.branch ?? base.branch) : base.branch,
      commit: changed ? (position?.commit ?? base.commit) : base.commit,
      status: existing && changed && base.status === 'read' ? 'to-read' : base.status
    }

    const versioned = this.metas.planVersion(updated, file.path, file.sha, now)
    if (JSON.stringify(versioned) !== JSON.stringify(existing)) this.metas.stage(versioned)
    return versioned
  }

  private async searchTextFor({ id, file, placement }: SearchableDoc): Promise<DocText | null> {
    const text = file.text ?? (await this.analyzeContent(file.path, file.format))?.text
    if (text === undefined) return null
    return {
      docId: id,
      sha: file.sha,
      title: file.title ?? file.name,
      path: `${placement.projectName} ${placement.relPath}`,
      text
    }
  }

  private collectMissing(
    roots: string[],
    seenPaths: Set<string>,
    known: Map<string, LibraryItem>,
    isHidden: (path: string) => boolean
  ): LibraryItem[] {
    const result: LibraryItem[] = []
    for (const meta of this.metas.all()) {
      if (known.has(meta.id) || seenPaths.has(normalizePath(meta.path))) continue
      if (meta.classificationOverride === 'ignored' || isHidden(meta.path)) continue
      if (!roots.some((root) => isInside(meta.path, root))) continue
      const copy = this.metas.latestCopyPath(meta)
      if (!copy) continue

      const projectPath = meta.projectPath ?? dirname(meta.path)
      const projectName = this.projectName(projectPath, null)
      const relPath = toPosix(relative(projectPath, meta.path))
      result.push({
        placement: loosePlacement(projectPath, projectName, relPath),
        entry: {
          id: meta.id,
          path: meta.path,
          copyPath: copy,
          name: folderName(meta.path),
          format: formatOf(meta.path) ?? 'html',
          relPath,
          title: meta.title,
          alias: meta.alias ?? null,
          mtimeMs: meta.mtimeMs,
          size: 0,
          projectName,
          classification: 'document',
          reason: 'Oryginał zniknął',
          status: meta.status,
          branch: meta.branch,
          commit: meta.commit,
          missing: true,
          otherPaths: [],
          sha: meta.sha,
          labels: []
        }
      })
    }
    return result
  }

  private assemble(base: SnapshotBase): LibrarySnapshot {
    const projects = new Map<string, ProjectGroup>()
    const review: DocEntry[] = []
    for (const { entry, placement } of this.items.values()) {
      // Czytane przy każdej publikacji, więc skan nie cofnie etykiety nadanej w jego trakcie.
      entry.labels = this.labels.get(entry.id)
      if (entry.classification === 'review') {
        review.push(entry)
        continue
      }
      let project = projects.get(placement.projectKey)
      if (!project) {
        project = {
          id: stableId('p', placement.projectPath),
          name: placement.projectName,
          path: placement.projectPath,
          isRepo: placement.isRepo,
          defaultBranch: placement.defaultBranch,
          docs: [],
          pullRequests: {}
        }
        projects.set(placement.projectKey, project)
      }
      project.docs.push(entry)
    }

    for (const project of projects.values()) {
      project.docs.sort(newestFirst)
      for (const branch of new Set(project.docs.map((doc) => doc.branch))) {
        const pullRequest = branch ? this.index.getPullRequest(normalizePath(project.path), branch) : null
        if (branch && pullRequest?.pullRequest) project.pullRequests[branch] = pullRequest.pullRequest
      }
    }

    return {
      ...base,
      projects: [...projects.values()].sort(
        (a, b) => newestFirst(a.docs[0] as DocEntry, b.docs[0] as DocEntry)
      ),
      review: review.sort(newestFirst)
    }
  }

  /** Dopasowuje PR po nazwie brancha. Działa w tle i wymaga zainstalowanego `gh`. */
  private async refreshPullRequests(): Promise<void> {
    if (this.githubUnavailable) return
    const now = this.now().getTime()
    const lookups: { project: ProjectGroup; branch: string; key: string }[] = []

    for (const project of this.snapshot.projects) {
      const repo = await this.repoCache.get(normalizePath(project.path))?.repo
      if (!isGitHubRemote(repo?.remoteUrl ?? null)) continue
      const key = normalizePath(project.path)
      for (const branch of new Set(project.docs.map((doc) => doc.branch))) {
        if (!branch || branch === project.defaultBranch) continue
        const cached = this.index.getPullRequest(key, branch)
        if (!cached || now - cached.fetchedAt > PR_CACHE_MS) lookups.push({ project, branch, key })
      }
    }

    let changed = false
    for (const { project, branch, key } of lookups.slice(0, MAX_PR_LOOKUPS)) {
      const found = await this.fetchPullRequest(project.path, branch)
      if (this.closed) return
      if (found === 'unavailable') {
        this.githubUnavailable = true
        break
      }
      this.index.putPullRequest(key, branch, now, found)
      changed ||= found !== null
    }
    if (changed) this.publishItems()
  }

  private async fetchPullRequest(
    repoPath: string,
    branch: string
  ): Promise<PullRequest | null | 'unavailable'> {
    try {
      const output = await this.options.gh(
        ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,title,url,state'],
        repoPath
      )
      const parsed = JSON.parse(output || '[]') as PullRequest[]
      return parsed[0] ?? null
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'unavailable' : null
    }
  }

  async search(query: string): Promise<SearchHit[]> {
    const hits: SearchHit[] = []
    for (const { docId, ...snippet } of this.index.search(query)) {
      const doc = this.getEntry(docId)
      if (doc) hits.push({ doc, ...snippet })
    }
    return hits
  }

  async setStatus(docId: string, status: DocStatus): Promise<LibrarySnapshot> {
    if (!this.stageStatus(docId, status)) throw new Error('Nieznany dokument')
    return this.commitStatuses()
  }

  /** Jedna migawka i jeden zapis na całą grupę. Dokument, który zniknął w międzyczasie, jest pomijany. */
  async setStatuses(docIds: string[], status: DocStatus): Promise<LibrarySnapshot> {
    let changed = false
    for (const docId of docIds) changed = this.stageStatus(docId, status) || changed
    return changed ? this.commitStatuses() : this.snapshot
  }

  private stageStatus(docId: string, status: DocStatus): boolean {
    const item = this.items.get(docId)
    const meta = this.metas.get(docId)
    if (meta) this.metas.stage({ ...meta, status })
    else if (item?.entry.classification === 'document') this.earlyStatus.set(docId, status)
    else return false
    if (item) item.entry.status = status
    return true
  }

  private async commitStatuses(): Promise<LibrarySnapshot> {
    this.publishItems()
    await this.metas.flush()
    if (!this.running) await this.writeCache()
    return this.snapshot
  }

  /** Nazwa żyje tylko w apce, więc plik na dysku zostaje nietknięty. Pusta przywraca oryginalną. */
  async renameDoc(docId: string, name: string): Promise<LibrarySnapshot> {
    const meta = await this.settledMeta(docId)
    if (!meta) throw new Error('Nieznany dokument')
    const alias = name.trim() || undefined
    this.metas.stage({ ...meta, alias })
    const item = this.items.get(docId)
    if (item) item.entry.alias = alias ?? null
    this.publishItems()
    await this.metas.flush()
    if (!this.running) await this.writeCache()
    return this.snapshot
  }

  /** Dokument pokazany w trakcie skanu dostaje swoje dane dopiero na jego końcu. */
  private async settledMeta(docId: string): Promise<DocMeta | undefined> {
    if (!this.metas.get(docId)) await this.running?.catch(() => null)
    return this.metas.get(docId)
  }

  /** Pierwsze otwarcie oznacza dokument jako przeczytany. */
  async markOpened(docId: string): Promise<void> {
    const entry = this.getEntry(docId)
    if (entry?.status === 'to-read' && entry.classification === 'document') await this.setStatus(docId, 'read')
  }

  /** Etykiety niczego nie zmieniają w folderach użytkownika, więc nie potrzebują skanu. */
  async setLabels(docId: string, labels: unknown): Promise<void> {
    if (!(await this.settledMeta(docId))) throw new Error('Etykiety można nadawać tylko dokumentom z biblioteki')
    await this.labels.set(docId, labels)
    this.publishItems()
  }

  /** Dopisuje etykiety do obecnych i zwraca te, których dokument jeszcze nie miał. */
  async addLabels(docId: string, names: string[]): Promise<string[]> {
    const current = this.labels.get(docId)
    const added = names.filter((name) => !hasLabel(current, name))
    if (added.length > 0) await this.setLabels(docId, [...current, ...added])
    return added
  }

  /** Czysty tekst dokumentu, także gdy oryginał zniknął i została tylko kopia. */
  async documentText(docId: string): Promise<string> {
    const entry = this.getEntry(docId)
    const path = this.getServedPath(docId)
    if (!entry || !path) throw new Error('Nieznany dokument')
    return analyzeDocument(entry.format, await readFile(path, 'utf8')).text
  }

  /** Etykiety użytkownika z przykładami i rodzaje startowe, których jeszcze nie ma. */
  labelChoices(): LabelChoice[] {
    const examples = new Map<string, string[]>()
    for (const { entry } of this.items.values()) {
      for (const name of entry.labels) {
        const titles = examples.get(name) ?? []
        if (titles.length < MAX_LABEL_EXAMPLES) titles.push(entry.alias ?? entry.title ?? entry.name)
        examples.set(name, titles)
      }
    }
    const known = this.labels.all().map(({ name }) => name)
    const starters = (this.options.getConfig().labelStarters ?? []).filter((name) => !hasLabel(known, name))
    return [...known, ...starters].map((name) => ({ name, examples: examples.get(name) ?? [] }))
  }

  async renameLabel(from: string, to: unknown): Promise<void> {
    await this.labels.rename(from, to)
    this.publishItems()
  }

  async deleteLabel(name: string): Promise<void> {
    await this.labels.remove(name)
    this.publishItems()
  }

  /** Agent zapisał etykiety w innym procesie. */
  async reloadLabels(): Promise<void> {
    await this.labels.load()
    this.publishItems()
  }

  async setClassification(docId: string, classification: Exclude<DocClass, 'review'>): Promise<LibrarySnapshot> {
    const item = this.items.get(docId)
    if (!item?.entry.sha) throw new Error('Nieznany dokument')
    const { entry } = item
    const meta: DocMeta = this.metas.get(docId) ?? {
      id: docId,
      path: entry.path,
      title: entry.title,
      firstSeenAt: this.now().toISOString(),
      status: entry.status,
      sha: entry.sha as string,
      mtimeMs: entry.mtimeMs,
      projectPath: null,
      branch: entry.branch,
      commit: entry.commit,
      versions: []
    }
    this.metas.stage({ ...meta, classificationOverride: classification })

    // Decyzję widać od razu, a resztę, czyli historię i duplikaty, porządkuje skan.
    if (classification === 'ignored') this.items.delete(docId)
    else Object.assign(entry, { classification, reason: 'Twoja decyzja' })
    this.publishItems()
    await this.metas.flush()
    return this.scan()
  }
}
