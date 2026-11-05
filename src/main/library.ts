import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type {
  DocClass,
  DocEntry,
  DocStatus,
  FolderLink,
  LibrarySnapshot,
  ProjectGroup,
  PullRequest,
  SearchHit
} from '../shared/types'
import { analyzeHtml, classify, type Classification, type HtmlFeatures } from './classify'
import type { GitRunner, RepoInfo } from './git'
import { positionAt, readRepo } from './git'
import { MetaStore, type DocMeta } from './metaStore'
import { type FoundFile, docIdFor, folderName, isInside, normalizePath, stableId, walkRoots } from './scanner'
import { SearchIndex } from './searchIndex'

const MAX_FILE_BYTES = 32 * 1024 * 1024
const ARCHIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000
const REPO_CACHE_MS = 30_000
const PR_CACHE_MS = 15 * 60 * 1000
const MAX_PR_LOOKUPS = 20
const READ_CONCURRENCY = 16

export interface LibraryOptions {
  dataDir: string
  git: GitRunner
  gh: GitRunner
  getConfig: () => { roots: string[]; folderLinks: FolderLink[] }
  onChange: (snapshot: LibrarySnapshot) => void
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

const emptySnapshot = (): LibrarySnapshot => ({
  roots: [],
  unavailableRoots: [],
  folderLinks: [],
  projects: [],
  review: [],
  ignoredCount: 0
})

const toPosix = (path: string): string => path.split(sep).join('/')

async function mapLimit<Item, Result>(
  items: Item[],
  limit: number,
  run: (item: Item) => Promise<Result>
): Promise<Result[]> {
  const results = new Array<Result>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await run(items[index] as Item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function isGitHubRemote(url: string | null): boolean {
  return url?.includes('github.com') ?? false
}

/** Zbiera dokumenty z wybranych folderów i utrzymuje ich trwałe dane. */
export class Library {
  private readonly metas: MetaStore
  private readonly index: SearchIndex
  private readonly repoCache = new Map<string, { readAt: number; repo: RepoInfo | null }>()
  private readonly servedPaths = new Map<string, string>()
  private readonly entries = new Map<string, DocEntry>()
  private snapshot: LibrarySnapshot = emptySnapshot()
  private running: Promise<LibrarySnapshot> | null = null
  private pending = false
  private forceGitRefresh = false
  private githubUnavailable = false

  private constructor(private readonly options: LibraryOptions) {
    this.metas = new MetaStore(join(options.dataDir, 'library'))
    this.index = new SearchIndex(join(options.dataDir, 'cache', 'index.sqlite'))
  }

  static async open(options: LibraryOptions): Promise<Library> {
    await mkdir(join(options.dataDir, 'cache'), { recursive: true })
    // Indeks jest odtwarzalny, więc nie powinien trafiać do prywatnego gita z danymi.
    await Library.ensureGitignore(options.dataDir)
    const library = new Library(options)
    await library.metas.load()
    return library
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
    this.index.close()
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  getSnapshot(): LibrarySnapshot {
    return this.snapshot
  }

  getEntry(docId: string): DocEntry | undefined {
    return this.entries.get(docId)
  }

  /** Skrót treści dokumentu. Uwagi zapamiętują go jako swoją wersję. */
  getDocSha(docId: string): string | undefined {
    return this.metas.get(docId)?.sha
  }

  /** Plik do wyświetlenia: oryginał albo ostatnia kopia, gdy oryginał zniknął. */
  getServedPath(docId: string): string | undefined {
    return this.servedPaths.get(docId)
  }

  /** Skanuje foldery. Skan zgłoszony w trakcie innego wykona się raz, zaraz po nim. */
  scan({ refreshGit = false }: { refreshGit?: boolean } = {}): Promise<LibrarySnapshot> {
    this.forceGitRefresh ||= refreshGit
    if (this.running) {
      this.pending = true
      return this.running
    }
    this.running = this.runScans().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async runScans(): Promise<LibrarySnapshot> {
    let snapshot: LibrarySnapshot
    do {
      this.pending = false
      snapshot = await this.scanOnce()
      this.options.onChange(snapshot)
    } while (this.pending)
    void this.refreshPullRequests()
    return snapshot
  }

  private async scanOnce(): Promise<LibrarySnapshot> {
    if (this.forceGitRefresh) this.repoCache.clear()
    this.forceGitRefresh = false

    const { roots, folderLinks } = this.options.getConfig()
    const { files, unavailableRoots } = await walkRoots(roots)
    const analyzed = await mapLimit(files, READ_CONCURRENCY, (file) => this.analyze(file))
    const present = analyzed.filter((file): file is AnalyzedFile => file !== null)

    this.index.transaction(() => {
      this.index.retainFiles(new Set(present.map((file) => file.path)))
    })

    const metaByPath = new Map(this.metas.all().map((meta) => [normalizePath(meta.path), meta]))
    const placed = await this.placeFiles(present, metaByPath, folderLinks)
    const kept = placed.filter((item) => item.verdict.classification !== 'ignored')
    const ignoredCount = placed.length - kept.length

    const { primary, otherPaths } = this.deduplicate(kept)
    const seenPaths = new Set(present.map((file) => normalizePath(file.path)))
    const entries: DocEntry[] = []
    const groups = new Map<string, Placement>()

    for (const item of primary) {
      const adopted = this.findMovedMeta(item, seenPaths)
      const entry = await this.buildEntry({ ...item, meta: item.meta ?? adopted }, otherPaths)
      entries.push(entry)
      groups.set(item.placement.projectKey, item.placement)
    }

    const missing = await this.collectMissing(roots, seenPaths, new Set(entries.map((entry) => entry.id)))
    for (const { entry, placement } of missing) {
      entries.push(entry)
      if (!groups.has(placement.projectKey)) groups.set(placement.projectKey, placement)
    }

    this.entries.clear()
    for (const entry of entries) this.entries.set(entry.id, entry)

    const snapshot = this.assemble(entries, groups, primary, missing, {
      roots,
      unavailableRoots,
      folderLinks,
      ignoredCount
    })
    this.snapshot = snapshot
    return snapshot
  }

  private async analyze(file: FoundFile): Promise<AnalyzedFile | null> {
    const cached = this.index.getFile(file.path)
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
      return { ...file, ...cached.features, sha: cached.sha, text: null }
    }
    if (file.size > MAX_FILE_BYTES) return null
    try {
      const buffer = await readFile(file.path)
      const features = analyzeHtml(buffer.toString('utf8'))
      const sha = createHash('sha256').update(buffer).digest('hex')
      this.index.putFile(file.path, file.mtimeMs, file.size, sha, features)
      return { ...file, ...features, sha }
    } catch {
      return null // Plik mógł zniknąć albo być zablokowany przez inny program.
    }
  }

  private async repoFor(directory: string): Promise<RepoInfo | null> {
    const key = normalizePath(directory)
    const cached = this.repoCache.get(key)
    const now = this.now().getTime()
    if (cached && now - cached.readAt < REPO_CACHE_MS) return cached.repo
    const repo = await readRepo(directory, this.options.git)
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
      projectName: repo?.name ?? folderName(projectPath),
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
      const provisional = toPosix(relative(file.repoDir ?? file.root, file.path))
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
    return classify(file, { relPath, siblings: file.siblings })
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
      return 0
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

  /** Plik przeniesiony lub przemianowany przejmuje historię zaginionego dokumentu. */
  private findMovedMeta(item: PlacedFile, seenPaths: Set<string>): DocMeta | undefined {
    if (item.meta) return undefined
    return this.metas
      .all()
      .find((meta) => meta.sha === item.file.sha && !seenPaths.has(normalizePath(meta.path)))
  }

  private newDocId(path: string): string {
    const base = docIdFor(path)
    // Adres zwolniony przez przeniesiony dokument nie może przejąć jego historii.
    return this.metas.get(base) ? stableId('d', `${path}#${this.now().getTime()}`) : base
  }

  private async buildEntry(item: PlacedFile, otherPaths: Map<string, string[]>): Promise<DocEntry> {
    const { file, placement, verdict } = item
    const classification = verdict.classification
    let meta = item.meta

    if (classification === 'document') {
      meta = await this.recordDocument(file, placement, meta)
    }

    const id = meta?.id ?? docIdFor(file.path)
    await this.ensureSearchText(id, file, placement)
    this.servedPaths.set(id, file.path)

    const position = placement.repo ? positionAt(placement.repo, file.mtimeMs) : null
    return {
      id,
      path: file.path,
      name: file.name,
      relPath: placement.relPath,
      title: file.title,
      mtimeMs: file.mtimeMs,
      size: file.size,
      projectName: placement.projectName,
      classification,
      reason: verdict.reason,
      status: meta?.status ?? this.initialStatus(file.mtimeMs),
      branch: meta?.branch ?? position?.branch ?? null,
      commit: meta?.commit ?? position?.commit ?? null,
      missing: false,
      otherPaths: otherPaths.get(file.path) ?? [],
      sha: file.sha
    }
  }

  private initialStatus(mtimeMs: number): DocStatus {
    return this.now().getTime() - mtimeMs > ARCHIVE_AFTER_MS ? 'archived' : 'to-read'
  }

  private async recordDocument(
    file: AnalyzedFile,
    placement: Placement,
    existing: DocMeta | undefined
  ): Promise<DocMeta> {
    const now = this.now()
    const position = placement.repo ? positionAt(placement.repo, file.mtimeMs) : null
    const changed = existing?.sha !== file.sha

    const base: DocMeta = existing ?? {
      id: this.newDocId(file.path),
      path: file.path,
      title: file.title,
      firstSeenAt: now.toISOString(),
      status: this.initialStatus(file.mtimeMs),
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

    const versioned = await this.metas.addVersion(updated, file.path, file.sha, now)
    if (JSON.stringify(versioned) !== JSON.stringify(existing)) await this.metas.save(versioned)
    return versioned
  }

  private async ensureSearchText(id: string, file: AnalyzedFile, placement: Placement): Promise<void> {
    if (this.index.hasDocText(id, file.sha)) return
    let text = file.text
    if (text === null) {
      try {
        text = analyzeHtml(await readFile(file.path, 'utf8')).text
      } catch {
        return
      }
    }
    this.index.putDocText(
      id,
      file.sha,
      file.title ?? file.name,
      `${placement.projectName} ${placement.relPath}`,
      text
    )
  }

  private async collectMissing(
    roots: string[],
    seenPaths: Set<string>,
    knownIds: Set<string>
  ): Promise<{ entry: DocEntry; placement: Placement }[]> {
    const result: { entry: DocEntry; placement: Placement }[] = []
    for (const meta of this.metas.all()) {
      if (knownIds.has(meta.id) || seenPaths.has(normalizePath(meta.path))) continue
      if (meta.classificationOverride === 'ignored') continue
      if (!roots.some((root) => isInside(meta.path, root))) continue
      const copy = this.metas.latestCopyPath(meta)
      if (!copy) continue

      this.servedPaths.set(meta.id, copy)
      const projectPath = meta.projectPath ?? dirname(meta.path)
      const projectName = folderName(projectPath)
      const relPath = toPosix(relative(projectPath, meta.path))
      const placement: Placement = {
        projectKey: normalizePath(projectPath),
        projectPath,
        projectName,
        isRepo: false,
        defaultBranch: null,
        relPath,
        repo: null
      }
      result.push({
        placement,
        entry: {
          id: meta.id,
          path: meta.path,
          name: folderName(meta.path),
          relPath,
          title: meta.title,
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
          sha: meta.sha
        }
      })
    }
    return result
  }

  private assemble(
    entries: DocEntry[],
    groups: Map<string, Placement>,
    primary: PlacedFile[],
    missing: { entry: DocEntry; placement: Placement }[],
    base: Pick<LibrarySnapshot, 'roots' | 'unavailableRoots' | 'folderLinks' | 'ignoredCount'>
  ): LibrarySnapshot {
    const keyByEntry = new Map<string, string>()
    for (const { file, placement } of primary) {
      const entry = entries.find((candidate) => candidate.path === file.path)
      if (entry) keyByEntry.set(entry.id, placement.projectKey)
    }
    for (const { entry, placement } of missing) keyByEntry.set(entry.id, placement.projectKey)

    const projects = new Map<string, ProjectGroup>()
    const review: DocEntry[] = []
    for (const entry of entries) {
      if (entry.classification === 'review') {
        review.push(entry)
        continue
      }
      const key = keyByEntry.get(entry.id)
      const placement = key ? groups.get(key) : undefined
      if (!key || !placement) continue
      let project = projects.get(key)
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
        projects.set(key, project)
      }
      project.docs.push(entry)
    }

    for (const project of projects.values()) {
      for (const branch of new Set(project.docs.map((doc) => doc.branch))) {
        const pullRequest = branch ? this.index.getPullRequest(normalizePath(project.path), branch) : null
        if (branch && pullRequest?.pullRequest) project.pullRequests[branch] = pullRequest.pullRequest
      }
    }

    const latest = (project: ProjectGroup): number =>
      project.docs.reduce((newest, doc) => Math.max(newest, doc.mtimeMs), 0)

    return {
      ...base,
      projects: [...projects.values()].sort((a, b) => latest(b) - latest(a)),
      review: review.sort((a, b) => b.mtimeMs - a.mtimeMs)
    }
  }

  /** Dopasowuje PR po nazwie brancha. Działa w tle i wymaga zainstalowanego `gh`. */
  private async refreshPullRequests(): Promise<void> {
    if (this.githubUnavailable) return
    const now = this.now().getTime()
    const lookups: { project: ProjectGroup; branch: string; key: string }[] = []

    for (const project of this.snapshot.projects) {
      const repo = this.repoCache.get(normalizePath(project.path))?.repo
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
      if (found === 'unavailable') {
        this.githubUnavailable = true
        break
      }
      this.index.putPullRequest(key, branch, now, found)
      if (found) {
        project.pullRequests[branch] = found
        changed = true
      }
    }
    if (changed) this.options.onChange(this.snapshot)
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
      const doc = this.entries.get(docId)
      if (doc) hits.push({ doc, ...snippet })
    }
    return hits
  }

  private metaFor(docId: string): DocMeta | undefined {
    return this.metas.get(docId)
  }

  async setStatus(docId: string, status: DocStatus): Promise<LibrarySnapshot> {
    const meta = this.metaFor(docId)
    if (!meta) throw new Error('Nieznany dokument')
    await this.metas.save({ ...meta, status })
    return this.scan()
  }

  /** Pierwsze otwarcie oznacza dokument jako przeczytany. */
  async markOpened(docId: string): Promise<void> {
    const meta = this.metaFor(docId)
    if (meta?.status === 'to-read') await this.setStatus(docId, 'read')
  }

  async setClassification(docId: string, classification: Exclude<DocClass, 'review'>): Promise<LibrarySnapshot> {
    const entry = this.entries.get(docId)
    if (!entry) throw new Error('Nieznany dokument')
    const meta = this.metaFor(docId)
    const buffer = await readFile(entry.path)
    const sha = createHash('sha256').update(buffer).digest('hex')
    const next: DocMeta = meta ?? {
      id: docId,
      path: entry.path,
      title: entry.title,
      firstSeenAt: this.now().toISOString(),
      status: entry.status,
      sha,
      mtimeMs: entry.mtimeMs,
      projectPath: null,
      branch: entry.branch,
      commit: entry.commit,
      versions: []
    }
    await this.metas.save({ ...next, classificationOverride: classification })
    return this.scan()
  }
}
