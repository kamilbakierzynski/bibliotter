import { locale, plural, t } from '../../shared/i18n'
import type { DocEntry, DocStatus, ProjectGroup, PullRequest } from '../../shared/types'

export type SortMode = 'recent' | 'name'
export type Tone = 'decide' | 'read' | 'none'

export interface FolderNode {
  kind: 'folder'
  key: string
  name: string
  children: TreeNode[]
  /** Foldery na dysku. Zwykle jeden, ale dokumenty z worktree trafiają do wspólnego wiersza. */
  paths: string[]
  /** Nazwa nadana w apce. */
  renamed: boolean
  /** Ustawione, gdy węzeł to branch, a nie folder. */
  branch?: { pullRequest: PullRequest | undefined; latestMtime: number }
  /** Grupa zarchiwizowanych dokumentów na końcu projektu. */
  archive?: boolean
  /** Dane całego poddrzewa: zwinięty folder dalej mówi, co w nim czeka. */
  count: number
  latest: number
  tone: Tone
}

export interface DocNode {
  kind: 'doc'
  key: string
  doc: DocEntry
}

export type TreeNode = FolderNode | DocNode

/** Ręczna kolejność: klucze dzieci według klucza rodzica. Projekty mają rodzica `PROJECTS_KEY`. */
export type ManualOrder = Record<string, string[]>
export const PROJECTS_KEY = ':projects'

export interface TreeOptions {
  sort?: SortMode
  toneOf?: (doc: DocEntry) => Tone
  /** Nazwy folderów nadane w apce, według ścieżki. */
  names?: Record<string, string>
  /** Kolejność ułożona ręcznie. Czego w niej nie ma, stoi przed ułożonymi, według `sort`. */
  order?: ManualOrder
}

const collator = new Intl.Collator('pl', { numeric: true })
const TONE_ORDER: Tone[] = ['none', 'read', 'decide']
const stronger = (a: Tone, b: Tone): Tone => (TONE_ORDER.indexOf(a) > TONE_ORDER.indexOf(b) ? a : b)
const latestOf = (node: TreeNode): number => (node.kind === 'folder' ? node.latest : node.doc.mtimeMs)

/** Segment ścieżki względnej, który nie jest folderem w projekcie: kopia spoza niego albo inny dysk. */
const OUTSIDE = /^(?:\.\.|[a-z]:)$/i

/** Folder `up` poziomów nad plikiem. Renderer nie ma `path`, a ścieżka niesie ukośniki systemu. */
function parentPath(path: string, up: number): string {
  let end = path.length
  for (let i = 0; i < up; i++) end = Math.max(path.lastIndexOf('/', end - 1), path.lastIndexOf('\\', end - 1))
  return path.slice(0, end)
}

export const lastSegment = (path: string): string => path.split(/[\\/]/).at(-1) ?? path

/** Foldery, z których pochodzą dokumenty projektu: repozytorium, jego worktree albo przypięty folder. */
export function projectFolders(project: ProjectGroup): string[] {
  const live = project.docs.filter((doc) => !doc.missing)
  if (live.length === 0) return [project.path]
  return [...new Set(live.map((doc) => parentPath(doc.path, doc.relPath.split('/').length)))]
}

/** Branche, foldery i dokumenty stoją w osobnych grupach, a ręczna kolejność działa w obrębie grupy. */
export const nodeGroup = (node: TreeNode): number => (node.kind === 'doc' ? 2 : node.branch ? 0 : 1)

/**
 * Układa listę według ręcznej kolejności. Lista musi już stać w kolejności sortowania, bo węzły
 * spoza zapisanej kolejności, czyli zwykle nowe, zachowują ją i stają przed ułożonymi.
 */
export function arrange<T>(items: T[], keyOf: (item: T) => string, groupOf: (item: T) => number, saved: string[] | undefined): T[] {
  if (!saved || saved.length === 0) return items
  const place = new Map(saved.map((key, i) => [key, i]))
  const base = new Map(items.map((item, i) => [item, i]))
  const rank = (item: T): number => place.get(keyOf(item)) ?? -1
  return items.sort((a, b) => {
    const group = groupOf(a) - groupOf(b)
    if (group !== 0) return group
    const ra = rank(a)
    const rb = rank(b)
    if (ra < 0 || rb < 0) return ra < 0 && rb < 0 ? (base.get(a) as number) - (base.get(b) as number) : ra < 0 ? -1 : 1
    return ra - rb
  })
}

function sortNodes(nodes: TreeNode[], sort: SortMode, parent: string, order: ManualOrder | undefined): TreeNode[] {
  const label = (node: TreeNode): string => (node.kind === 'folder' ? node.name : displayName(node.doc))
  nodes.sort((a, b) => {
    const group = nodeGroup(a) - nodeGroup(b)
    if (group !== 0) return group
    if (sort === 'recent' && latestOf(a) !== latestOf(b)) return latestOf(b) - latestOf(a)
    return collator.compare(label(a), label(b))
  })
  if (order) arrange(nodes, (node) => node.key, nodeGroup, order[parent])
  for (const node of nodes) {
    if (node.kind === 'folder') sortNodes(node.children, sort, node.key, order)
  }
  return nodes
}

/** Liczy dane poddrzew. Działa po uproszczeniu drzewa, bo scalanie podmienia węzły. */
function summarize(nodes: TreeNode[], toneOf: (doc: DocEntry) => Tone): void {
  for (const node of nodes) {
    if (node.kind === 'doc') continue
    summarize(node.children, toneOf)
    node.count = 0
    node.latest = 0
    node.tone = 'none'
    for (const child of node.children) {
      node.count += child.kind === 'folder' ? child.count : 1
      node.latest = Math.max(node.latest, latestOf(child))
      node.tone = stronger(node.tone, child.kind === 'folder' ? child.tone : toneOf(child.doc))
    }
  }
}

/**
 * Upraszcza drzewo. Folder z jednym dokumentem znika, a łańcuch pojedynczych folderów
 * staje się jednym wierszem `a/b`. Branche zostają, bo niosą informację o kontekście pracy.
 */
function compactNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (node.kind === 'doc') return node
    const children = compactNodes(node.children)
    const [only] = children
    if (node.branch || children.length !== 1 || !only) return { ...node, children }
    if (only.kind === 'doc' || only.renamed) return only
    return only.branch ? { ...node, children } : { ...only, name: `${node.name}/${only.name}` }
  })
}

function insertDoc(
  root: TreeNode[],
  folders: Map<string, FolderNode>,
  parentKey: string,
  doc: DocEntry,
  names: Record<string, string>
): void {
  const segments = doc.relPath.split('/')
  segments.pop()

  let siblings = root
  let key = parentKey
  segments.forEach((segment, depth) => {
    key = `${key}/${segment}`
    let folder = folders.get(key)
    if (!folder) {
      folder = { kind: 'folder', key, name: segment, children: [], paths: [], renamed: false, count: 0, latest: 0, tone: 'none' }
      folders.set(key, folder)
      siblings.push(folder)
    }
    const path = OUTSIDE.test(segment) ? null : parentPath(doc.path, segments.length - depth)
    if (path && !folder.paths.includes(path)) {
      folder.paths.push(path)
      const alias = names[path]
      if (alias) {
        folder.name = alias
        folder.renamed = true
      }
    }
    siblings = folder.children
  })
  siblings.push({ kind: 'doc', key: doc.id, doc })
}

/** Buduje drzewo: branche inne niż domyślny, a w nich foldery i dokumenty. */
export function buildTree(project: ProjectGroup, options: TreeOptions = {}): TreeNode[] {
  const root: TreeNode[] = []
  const folders = new Map<string, FolderNode>()
  const names = options.names ?? {}

  for (const doc of project.docs) {
    const onSideBranch = doc.branch !== null && doc.branch !== project.defaultBranch
    if (!onSideBranch || doc.branch === null) {
      insertDoc(root, folders, project.id, doc, names)
      continue
    }
    const branchKey = `${project.id}#${doc.branch}`
    let branchNode = folders.get(branchKey)
    if (!branchNode) {
      branchNode = {
        kind: 'folder',
        key: branchKey,
        name: doc.branch,
        children: [],
        paths: [],
        renamed: false,
        branch: { pullRequest: project.pullRequests[doc.branch], latestMtime: 0 },
        count: 0,
        latest: 0,
        tone: 'none'
      }
      folders.set(branchKey, branchNode)
      root.push(branchNode)
    }
    if (branchNode.branch) {
      branchNode.branch.latestMtime = Math.max(branchNode.branch.latestMtime, doc.mtimeMs)
    }
    insertDoc(branchNode.children, folders, branchKey, doc, names)
  }

  const nodes = compactNodes(root)
  summarize(nodes, options.toneOf ?? (() => 'none'))
  return sortNodes(nodes, options.sort ?? 'name', project.id, options.order)
}

/** Większy folder startuje zwinięty i pokazuje tylko licznik. */
export const BIG_FOLDER = 12
export const ROW_H = 32
/** Zwijany folder odprowadza tyle wierszy, reszta i tak jest poza ekranem. */
const GHOST_LIMIT = 40
/** Wcięcia drzewa: folder w projekcie, linia pod nim i treść za linią. */
const TOP_X = 8
const TREE_STEP = 15

export interface ProjectModel {
  project: ProjectGroup
  nodes: TreeNode[]
  count: number
  latest: number
  tone: Tone
  /** Same dokumenty z archiwum, więc projekt nie musi niczego pokazywać od razu. */
  stale: boolean
}

export interface LibraryModel {
  projects: ProjectModel[]
  /** Węzły zwinięte, dopóki użytkownik ich nie rozwinie. */
  defaults: Set<string>
  /** Węzły nad każdym dokumentem, od projektu w dół. */
  chains: Map<string, string[]>
}

/**
 * Układa bibliotekę. Archiwum to zwykle większość plików, więc nie miesza się z bieżącą pracą:
 * ląduje na końcu projektu w jednej grupie, a projekt z samym archiwum po prostu jest zwinięty.
 */
export function buildLibrary(projects: ProjectGroup[], options: Required<Pick<TreeOptions, 'sort' | 'toneOf'>> & TreeOptions): LibraryModel {
  const defaults = new Set<string>()
  const chains = new Map<string, string[]>()

  const models = projects.map((project): ProjectModel => {
    const active = project.docs.filter((doc) => doc.status !== 'archived')
    const archived = project.docs.filter((doc) => doc.status === 'archived')
    const stale = active.length === 0
    const nodes = buildTree({ ...project, docs: stale ? archived : active }, options)
    if (!stale && archived.length > 0) {
      const key = `${project.id}#:archive`
      const children = buildTree({ ...project, id: key, docs: archived }, options)
      const archive: FolderNode = { kind: 'folder', key, name: t('Archiwum'), children, paths: [], renamed: false, archive: true, count: 0, latest: 0, tone: 'none' }
      summarize([archive], options.toneOf)
      nodes.push(archive)
    }

    const visit = (list: TreeNode[], chain: string[]): void => {
      for (const node of list) {
        if (node.kind === 'doc') {
          chains.set(node.doc.id, chain)
          continue
        }
        if (node.archive || node.count > BIG_FOLDER) defaults.add(node.key)
        visit(node.children, [...chain, node.key])
      }
    }
    visit(nodes, [project.id])
    if (stale) defaults.add(project.id)

    return {
      project,
      nodes,
      count: project.docs.length,
      latest: project.docs.reduce((newest, doc) => Math.max(newest, doc.mtimeMs), 0),
      tone: project.docs.reduce<Tone>((tone, doc) => stronger(tone, options.toneOf(doc)), 'none'),
      stale
    }
  })

  const order =
    options.sort === 'name'
      ? (a: ProjectModel, b: ProjectModel): number => collator.compare(a.project.name, b.project.name)
      : (a: ProjectModel, b: ProjectModel): number => Number(a.stale) - Number(b.stale) || b.latest - a.latest
  const sorted = models.sort(order)
  if (options.order) arrange(sorted, (model) => model.project.id, () => 0, options.order[PROJECTS_KEY])
  return { projects: sorted, defaults, chains }
}

interface RowPlace {
  key: string
  y: number
  /** Skąd wyjeżdża wiersz świeżo rozwinięty: miejsce rodzica. */
  from: number
  indent: number
  /** Pionowe linie drzewa biegnące przez ten wiersz. */
  guides: number[]
  /** Łuk od linii do wiersza. */
  elbow: number | null
  /** Węzły nad wierszem. */
  chain: string[]
  /** Wiersz zwijanego folderu, który właśnie znika pod rodzicem. */
  ghost: boolean
}

export type LibraryRow = RowPlace &
  (
    | { type: 'project'; model: ProjectModel; closed: boolean }
    | { type: 'folder'; node: FolderNode; closed: boolean }
    | { type: 'doc'; doc: DocEntry }
  )

export interface LibraryRows {
  rows: LibraryRow[]
  height: number
}

interface WalkContext {
  /** Wcięcie treści i linia na tym poziomie. Poziom główny układa foldery bez linii. */
  x: number
  top: boolean
  guides: number[]
  chain: string[]
  parentY: number
  /** Miejsce rodzica, pod którym znikają wiersze zwijanego folderu. */
  ghostY: number | null
}

/** Rozkłada drzewo na wiersze. Zwinięte gałęzie w ogóle nie trafiają na listę. */
export function flattenLibrary(
  library: LibraryModel,
  isClosed: (key: string, byDefault: boolean) => boolean,
  closing: ReadonlySet<string>,
  /** Wiersze ukryte przed chwilą. Skan dużej biblioteki chwilę trwa, a one mają zniknąć od razu. */
  leaving: ReadonlySet<string> = new Set()
): LibraryRows {
  const rows: LibraryRow[] = []
  let line = 0
  let ghosts = 0

  /** Duch stoi na miejscu rodzica i nie zajmuje własnego. */
  const place = (ghostY: number | null): number => {
    if (ghostY === null) return line++ * ROW_H
    ghosts += 1
    return ghostY
  }
  const full = (context: WalkContext): boolean => context.ghostY !== null && ghosts >= GHOST_LIMIT

  const walk = (nodes: TreeNode[], context: WalkContext): void => {
    const { top, guides, chain, parentY, ghostY } = context
    nodes.forEach((node, index) => {
      if (full(context) || leaving.has(node.key)) return
      const next = nodes[index + 1]
      const bare = top && node.kind === 'folder'
      const indent = top ? (bare ? TOP_X : TOP_X + TREE_STEP) : context.x
      const elbow = bare ? null : indent - TREE_STEP
      const continues = !bare && next !== undefined && (!top || next.kind === 'doc')
      const lines = continues ? [...guides, elbow as number] : guides
      const shared = { indent, guides: lines, elbow, chain, from: parentY, ghost: ghostY !== null }

      if (node.kind === 'doc') {
        rows.push({ ...shared, key: node.doc.id, y: place(ghostY), type: 'doc', doc: node.doc })
        return
      }
      const closed = isClosed(node.key, library.defaults.has(node.key))
      const y = place(ghostY)
      rows.push({ ...shared, key: node.key, y, type: 'folder', node, closed })
      if (closed && !closing.has(node.key)) return
      walk(node.children, {
        x: indent + TREE_STEP * 2,
        top: false,
        guides: lines,
        chain: [...chain, node.key],
        parentY: y,
        ghostY: ghostY ?? (closed ? y : null)
      })
    })
  }

  for (const model of library.projects) {
    const { id } = model.project
    if (leaving.has(id)) continue
    const closed = isClosed(id, library.defaults.has(id))
    const y = place(null)
    rows.push({ key: id, y, from: y, indent: 0, guides: [], elbow: null, chain: [], ghost: false, type: 'project', model, closed })
    if (closed && !closing.has(id)) continue
    ghosts = 0
    walk(model.nodes, { x: 0, top: true, guides: [], chain: [id], parentY: y, ghostY: closed ? y : null })
  }
  return { rows, height: line * ROW_H }
}

export function inboxDocs(projects: ProjectGroup[]): DocEntry[] {
  return projects
    .flatMap((project) => project.docs)
    .filter((doc) => doc.status === 'to-read' || doc.status === 'to-decide')
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export function blockedLabel(count: number): string {
  return t('Zablokowano {count} {requests}', { count, requests: plural(count, 'żądanie', 'żądania', 'żądań') })
}

/** Tytuł dokumentu mówi więcej niż nazwa pliku, szczególnie przy `index.html`. */
export function displayName(doc: DocEntry): string {
  if (doc.alias) return doc.alias
  if (doc.title) return doc.title
  const name = doc.name.replace(/\.(?:html?|md|markdown)$/i, '')
  return name.toLowerCase() === 'index' ? (doc.relPath.split('/').at(-2) ?? name) : name
}

export function relativeTime(mtimeMs: number, now = Date.now()): string {
  const minutes = Math.round((now - mtimeMs) / 60_000)
  if (minutes < 1) return t('przed chwilą')
  if (minutes < 60) return t('{n} min temu', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('{n} godz. temu', { n: hours })
  const days = Math.round(hours / 24)
  if (days < 30) return days === 1 ? t('wczoraj') : t('{n} dni temu', { n: days })
  return new Date(mtimeMs).toLocaleDateString(locale())
}
