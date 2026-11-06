import type {
  Annotation,
  AnnotationStatus,
  Audience,
  NewAnnotation,
  OverlayEvent,
  OverlayMode,
  SelectionAction
} from './annotations'

export const DOC_STATUSES = ['to-read', 'read', 'to-decide', 'decided', 'archived'] as const
export type DocStatus = (typeof DOC_STATUSES)[number]

export type DocClass = 'document' | 'review' | 'ignored'

export const DOC_FORMATS = ['html', 'markdown'] as const
export type DocFormat = (typeof DOC_FORMATS)[number]

export const FORMAT_LABELS: Record<DocFormat, string> = { html: 'HTML', markdown: 'Markdown' }

export interface DocEntry {
  id: string
  path: string
  name: string
  format: DocFormat
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
  /** Skrót bieżącej treści. Pozwala oznaczyć uwagi do starszej wersji. */
  sha: string | null
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

/** Gdzie ma stać widok dokumentu. Widok nieżywy czeka poza oknem, ale ma już docelowy rozmiar. */
/** Obrót kółka nad dokiem. Pozycja liczy się od rogu dokumentu. */
export interface ViewerWheel {
  x: number
  y: number
  deltaX: number
  deltaY: number
}

export interface ViewerPlacement {
  docId: string
  bounds: ViewerBounds
  live: boolean
}

export type ViewerStatus = 'loading' | 'ready' | 'error'

export interface ViewerState {
  docId: string
  status: ViewerStatus
  /** Liczba zablokowanych żądań sieciowych tego dokumentu. */
  blockedRequests: number
  blockedHosts: string[]
}

/** Zrzut widoku dokumentu: surowe piksele BGRA, bez utraty jakości. */
export interface ViewerFrame {
  width: number
  height: number
  data: Uint8Array
}

/** Klawisz naciśnięty w dokumencie, który należy do apki. */
export interface ViewerKey {
  type: 'down' | 'up'
  key: string
  code: string
  ctrl: boolean
  shift: boolean
  alt: boolean
}

export interface DocThumb {
  docId: string
  url: string
  /** Trzy kolory dokumentu do nocnej poświaty. */
  glow: [string, string, string]
}

export type ThemeMode = 'light' | 'dark'

export interface ShellApi {
  getLibrary(): Promise<LibrarySnapshot>
  rescan(): Promise<LibrarySnapshot>
  addRoot(): Promise<LibrarySnapshot>
  /** Dodaje foldery upuszczone na ścianę. */
  addPaths(paths: string[]): Promise<LibrarySnapshot>
  pathForFile(file: File): string
  removeRoot(path: string): Promise<LibrarySnapshot>
  linkFolder(): Promise<LibrarySnapshot>
  unlinkFolder(folder: string): Promise<LibrarySnapshot>
  search(query: string): Promise<SearchHit[]>
  setStatus(docId: string, status: DocStatus): Promise<LibrarySnapshot>
  setClassification(docId: string, classification: 'document' | 'ignored'): Promise<LibrarySnapshot>
  openDoc(docId: string): Promise<void>
  closeDoc(docId: string): Promise<void>
  reloadDoc(docId: string): Promise<void>
  setViewerLayout(placements: ViewerPlacement[]): Promise<void>
  captureDoc(docId: string): Promise<ViewerFrame | null>
  /** Dokument, który agent widzi jako bieżący. */
  setCurrentDoc(docId: string | null): Promise<void>
  /** Oddaje klawiaturę dokumentowi. Bez dokumentu wraca ona do powłoki. */
  focusDoc(docId: string | null): void
  wheelDoc(docId: string, wheel: ViewerWheel): void
  /** Ustawia wycięcie, przez które widać dok. */
  placeLayer(bounds: ViewerBounds): void
  /** Klawiatura trafia do doku, np. do pola palety. */
  focusLayer(): void
  revealDoc(docId: string): Promise<void>
  openExternal(url: string): Promise<void>
  listAnnotations(): Promise<Annotation[]>
  createAnnotation(docId: string, input: NewAnnotation): Promise<void>
  replyAnnotation(id: string, text: string): Promise<void>
  setAnnotationStatus(id: string, status: AnnotationStatus): Promise<void>
  setAnnotationAudience(id: string, audience: Audience): Promise<void>
  deleteAnnotation(id: string): Promise<void>
  setOverlayMode(docId: string, mode: OverlayMode): void
  focusAnnotation(docId: string, id: string | null): void
  /** Włącza zgłaszanie pozycji pinezek, potrzebne wątkom wiszącym na ścianie. */
  trackOverlay(docId: string, on: boolean): void
  selectionAction(docId: string, action: SelectionAction): void
  setTheme(mode: ThemeMode): void
  requestThumbs(docIds: string[]): void
  onViewerState(listener: (state: ViewerState) => void): () => void
  onLibraryChanged(listener: (snapshot: LibrarySnapshot) => void): () => void
  onAnnotationsChanged(listener: (annotations: Annotation[]) => void): () => void
  onOverlayEvent(listener: (docId: string, event: OverlayEvent) => void): () => void
  onViewerKey(listener: (key: ViewerKey) => void): () => void
  onViewerFocus(listener: (docId: string) => void): () => void
  onThumb(listener: (thumb: DocThumb) => void): () => void
}

declare global {
  interface Window {
    api: ShellApi
  }
}
