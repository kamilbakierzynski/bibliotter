export const DOC_STATUSES = ['to-read', 'read', 'to-decide', 'decided', 'archived'] as const
export type DocStatus = (typeof DOC_STATUSES)[number]

export type DocClass = 'document' | 'review' | 'ignored'

export interface DocEntry {
  id: string
  path: string
  name: string
  /** Ścieżka względem katalogu projektu, zawsze z ukośnikami `/`. */
  relPath: string
  title: string | null
  mtimeMs: number
  size: number
  projectName: string
  classification: DocClass
  /** Powód klasyfikacji pokazywany przy niepewnych plikach. */
  reason: string
  status: DocStatus
  branch: string | null
  commit: string | null
  /** Oryginał zniknął, a apka pokazuje ostatnią zachowaną kopię. */
  missing: boolean
  /** Inne ścieżki z identyczną treścią, np. kopie w worktree. */
  otherPaths: string[]
}

export interface PullRequest {
  number: number
  title: string
  url: string
  state: string
}

export interface ProjectGroup {
  id: string
  name: string
  path: string
  isRepo: boolean
  defaultBranch: string | null
  docs: DocEntry[]
  pullRequests: Record<string, PullRequest>
}

export interface FolderLink {
  folder: string
  repo: string
}

export interface LibrarySnapshot {
  roots: string[]
  /** Foldery, których nie udało się odczytać, np. usunięte lub odłączone. */
  unavailableRoots: string[]
  folderLinks: FolderLink[]
  projects: ProjectGroup[]
  /** Pliki, których apka nie umie zaliczyć do dokumentów ani ich pominąć. */
  review: DocEntry[]
  ignoredCount: number
}

export interface SearchHit {
  doc: DocEntry
  before: string
  match: string
  after: string
}

export interface ViewerBounds {
  x: number
  y: number
  width: number
  height: number
}

export type ViewerStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ViewerState {
  docId: string | null
  status: ViewerStatus
  /** Liczba zablokowanych żądań sieciowych bieżącego dokumentu. */
  blockedRequests: number
  blockedHosts: string[]
}

export interface ShellApi {
  getLibrary(): Promise<LibrarySnapshot>
  rescan(): Promise<LibrarySnapshot>
  addRoot(): Promise<LibrarySnapshot>
  removeRoot(path: string): Promise<LibrarySnapshot>
  linkFolder(): Promise<LibrarySnapshot>
  unlinkFolder(folder: string): Promise<LibrarySnapshot>
  search(query: string): Promise<SearchHit[]>
  setStatus(docId: string, status: DocStatus): Promise<LibrarySnapshot>
  setClassification(docId: string, classification: 'document' | 'ignored'): Promise<LibrarySnapshot>
  openDoc(docId: string): Promise<void>
  closeDoc(): Promise<void>
  setViewerBounds(bounds: ViewerBounds | null): void
  reloadDoc(): Promise<void>
  revealDoc(docId: string): Promise<void>
  openExternal(url: string): Promise<void>
  onViewerState(listener: (state: ViewerState) => void): () => void
  onLibraryChanged(listener: (snapshot: LibrarySnapshot) => void): () => void
}

declare global {
  interface Window {
    api: ShellApi
  }
}
