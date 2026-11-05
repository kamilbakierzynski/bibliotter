import type { DocEntry, DocStatus, ProjectGroup, PullRequest } from '../../shared/types'

export interface FolderNode {
  kind: 'folder'
  key: string
  name: string
  children: TreeNode[]
  /** Ustawione, gdy węzeł to branch, a nie folder. */
  branch?: { pullRequest: PullRequest | undefined; latestMtime: number }
}

export interface DocNode {
  kind: 'doc'
  key: string
  doc: DocEntry
}

export type TreeNode = FolderNode | DocNode

export const STATUS_LABELS: Record<DocStatus, string> = {
  'to-read': 'Do przeczytania',
  read: 'Przeczytane',
  'to-decide': 'Do decyzji',
  decided: 'Zdecydowane',
  archived: 'Archiwum'
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  const label = (node: TreeNode): string => (node.kind === 'folder' ? node.name : displayName(node.doc))
  nodes.sort((a, b) => {
    const aBranch = a.kind === 'folder' && a.branch ? 0 : 1
    const bBranch = b.kind === 'folder' && b.branch ? 0 : 1
    if (aBranch !== bBranch) return aBranch - bBranch
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return label(a).localeCompare(label(b), 'pl', { numeric: true })
  })
  for (const node of nodes) {
    if (node.kind === 'folder') sortNodes(node.children)
  }
  return nodes
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
    if (only.kind === 'doc') return only
    return only.branch ? { ...node, children } : { ...only, name: `${node.name}/${only.name}` }
  })
}

function insertDoc(root: TreeNode[], folders: Map<string, FolderNode>, parentKey: string, doc: DocEntry): void {
  const segments = doc.relPath.split('/')
  segments.pop()

  let siblings = root
  let key = parentKey
  for (const segment of segments) {
    key = `${key}/${segment}`
    let folder = folders.get(key)
    if (!folder) {
      folder = { kind: 'folder', key, name: segment, children: [] }
      folders.set(key, folder)
      siblings.push(folder)
    }
    siblings = folder.children
  }
  siblings.push({ kind: 'doc', key: doc.id, doc })
}

/** Buduje drzewo: branche inne niż domyślny, a w nich foldery i dokumenty. */
export function buildTree(project: ProjectGroup): TreeNode[] {
  const root: TreeNode[] = []
  const folders = new Map<string, FolderNode>()

  for (const doc of project.docs) {
    const onSideBranch = doc.branch !== null && doc.branch !== project.defaultBranch
    if (!onSideBranch || doc.branch === null) {
      insertDoc(root, folders, project.id, doc)
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
        branch: { pullRequest: project.pullRequests[doc.branch], latestMtime: 0 }
      }
      folders.set(branchKey, branchNode)
      root.push(branchNode)
    }
    if (branchNode.branch) {
      branchNode.branch.latestMtime = Math.max(branchNode.branch.latestMtime, doc.mtimeMs)
    }
    insertDoc(branchNode.children, folders, branchKey, doc)
  }

  return sortNodes(compactNodes(root))
}

export function inboxDocs(projects: ProjectGroup[]): DocEntry[] {
  return projects
    .flatMap((project) => project.docs)
    .filter((doc) => doc.status === 'to-read' || doc.status === 'to-decide')
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export function blockedLabel(count: number): string {
  const lastTwo = count % 100
  const last = count % 10
  if (count === 1) return 'Zablokowano 1 żądanie'
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `Zablokowano ${count} żądania`
  return `Zablokowano ${count} żądań`
}

/** Tytuł dokumentu mówi więcej niż nazwa pliku, szczególnie przy `index.html`. */
export function displayName(doc: DocEntry): string {
  if (doc.title) return doc.title
  const name = doc.name.replace(/\.html?$/i, '')
  return name.toLowerCase() === 'index' ? (doc.relPath.split('/').at(-2) ?? name) : name
}

export function relativeTime(mtimeMs: number, now = Date.now()): string {
  const minutes = Math.round((now - mtimeMs) / 60_000)
  if (minutes < 1) return 'przed chwilą'
  if (minutes < 60) return `${minutes} min temu`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} godz. temu`
  const days = Math.round(hours / 24)
  if (days < 30) return days === 1 ? 'wczoraj' : `${days} dni temu`
  return new Date(mtimeMs).toLocaleDateString('pl-PL')
}
