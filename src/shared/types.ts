import type {
  Anchor,
  Annotation,
  AnnotationStatus,
  Audience,
  NewAnnotation,
  OverlayEvent,
  OverlayMode,
  ShapeTool,
  StickyColor
} from './annotations'
import type { AutoLabelOptions, AutoLabelResult, AutoLabelState } from './autoLabel'
import type { TerminalApi } from './terminal'
import type { CameraLeg, CameraMove, CameraPlan, CameraShot } from './camera'
import type { LabelColors, LabelTone } from './labels'
import type { DocLinks, DocPair, FollowLink, LinkHoverCard, LinkOutcome, LinkShotRequest, OpenMode } from './links'
import type { OutlineCommand } from './outline'
import type { PickKind, Presentation, PresentState, RouteFrame } from './presentation'
import type { ContentSearch, FindCommand, TextQuery, TextSnippet } from './textSearch'
import type { FileMode, FileSheetInfo } from './fileView'
import type { Language } from './i18n'
import type { AgentSetup, AppInfo } from './options'

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
  /** Nazwa nadana w apce. Plik na dysku zachowuje swoją. */
  alias: string | null
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
  /** Ta kopia. Tylko dla dokumentów, których oryginał zniknął. */
  copyPath?: string
  /** Inne ścieżki z identyczną treścią, np. kopie w worktree. */
  otherPaths: string[]
  /** Skrót bieżącej treści. Pozwala oznaczyć uwagi do starszej wersji. */
  sha: string | null
  /** Etykiety w kolejności nadania. */
  labels: string[]
  /** Arkusz pliku otwarty z linku. Dokument z biblioteki go nie ma. */
  file?: FileSheetInfo
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
  /** Foldery pomijane przy skanowaniu, na życzenie użytkownika. */
  hiddenFolders: string[]
  /** Nazwy folderów i projektów nadane w apce, według ścieżki. */
  folderNames: Record<string, string>
  labelColors?: LabelColors
  ticketUrl?: string
  projects: ProjectGroup[]
  /** Pliki, których apka nie umie zaliczyć do dokumentów ani ich pominąć. */
  review: DocEntry[]
  ignoredCount: number
}

/** Postęp skanu. Liczby dotyczą plików HTML i Markdown w wybranych folderach. */
export interface ScanProgress {
  active: boolean
  found: number
  done: number
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
/** Co wybrał użytkownik. `ThemeMode` to wynik tego wyboru. */
export type ThemeChoice = ThemeMode | 'system'

export interface ShellApi extends TerminalApi {
  /** Migawka biblioteki jako JSON. Zmiany i ich efekty przychodzą przez `onLibraryChanged`. */
  getLibrary(): Promise<string>
  rescan(): Promise<void>
  addRoot(): Promise<void>
  /** Dodaje foldery upuszczone na ścianę. */
  addPaths(paths: string[]): Promise<void>
  pathForFile(file: File): string
  removeRoot(path: string): Promise<void>
  linkFolder(): Promise<void>
  unlinkFolder(folder: string): Promise<void>
  hideFolders(paths: string[]): Promise<void>
  showFolder(path: string): Promise<void>
  /** Pusta nazwa przywraca oryginalną. Foldery na dysku zostają nietknięte. */
  renameFolder(paths: string[], name: string): Promise<void>
  /** Pusta nazwa przywraca oryginalną. Plik na dysku zostaje nietknięty. */
  renameDoc(docId: string, name: string): Promise<void>
  revealFolder(path: string): Promise<void>
  copyText(text: string): void
  search(query: string): Promise<SearchHit[]>
  /** Przeszukuje treść wszystkich dokumentów. Nowe zapytanie unieważnia poprzednie. */
  searchContent(query: TextQuery): Promise<ContentSearch>
  /**
   * Zrzut miejsca trafienia z podświetleniem, jako adres `data:`. `null` znaczy, że strona go nie dała,
   * a `later`, że nowsze zamówienie wyprzedziło to w kolejce.
   */
  previewHit(docId: string, query: TextQuery, target: TextSnippet): Promise<string | null | 'later'>
  /** Wynik wraca jako zdarzenie warstwy dokumentu. */
  findInDoc(docId: string, command: FindCommand): void
  setStatus(docId: string, status: DocStatus): Promise<void>
  /** Zmienia status wielu dokumentów jedną migawką biblioteki. */
  setStatuses(docIds: string[], status: DocStatus): Promise<void>
  setClassification(docId: string, classification: 'document' | 'ignored'): Promise<void>
  /** Wynik przychodzi przez `onLibraryChanged`, tak samo jak zmiany agenta. */
  setDocLabels(docId: string, labels: string[]): Promise<void>
  renameLabel(from: string, to: string): Promise<void>
  deleteLabel(name: string): Promise<void>
  getAutoLabelState(): Promise<AutoLabelState>
  /** Haiku czyta dokumenty i dopisuje pasujące etykiety. Wynik dotyczy całej listy. */
  autoLabel(docIds: string[]): Promise<AutoLabelResult>
  stopAutoLabel(): Promise<void>
  setAutoLabelOptions(change: Partial<AutoLabelOptions>): Promise<void>
  /** Wynik przychodzi przez `onLibraryChanged`. */
  setLabelColor(name: string, tone: LabelTone): Promise<void>
  setTicketUrl(value: string): Promise<void>
  openDoc(docId: string): Promise<void>
  /** Ładuje dokument w tle, zanim użytkownik go otworzy. Nie oznacza go jako przeczytany. */
  warmDoc(docId: string): Promise<void>
  closeDoc(docId: string): Promise<void>
  reloadDoc(docId: string): Promise<void>
  setViewerLayout(placements: ViewerPlacement[]): Promise<void>
  captureDoc(docId: string): Promise<ViewerFrame | null>
  /** Ustawia kamerę dokumentu na kadrze, a `null` wraca do całej strony. `null` w wyniku znaczy, że kamera nie ruszyła. */
  aimCamera(docId: string, shot: CameraShot | null): Promise<CameraMove | null>
  /** Widok teraz i w kadrze, bez ruszania kamery. `null`, gdy kadru nie ma w dokumencie. */
  planCamera(docId: string, shot: CameraShot): Promise<CameraPlan | null>
  /** Odcinek podróży między odległymi kadrami. Wynik to widok przed odcinkiem i po nim. */
  steerCamera(docId: string, leg: CameraLeg): Promise<CameraMove | null>
  /** Dokument, który agent widzi jako bieżący. */
  setCurrentDoc(docId: string | null): Promise<void>
  /** Oddaje klawiaturę dokumentowi. Bez dokumentu wraca ona do powłoki. */
  focusDoc(docId: string | null): void
  wheelDoc(docId: string, wheel: ViewerWheel): void
  /** Ustawia wycięcie, przez które widać dok. */
  placeLayer(bounds: ViewerBounds): void
  /** Ustawia wycięcie warstwy kart linków. `null` je chowa. */
  placeCardLayer(bounds: ViewerBounds | null): void
  /** Klawiatura trafia do doku, np. do pola palety. */
  focusLayer(): void
  revealDoc(docId: string): Promise<void>
  openExternal(url: string): Promise<void>
  docLinks(docId: string): Promise<DocLinks>
  /** Plan albo objaśnienie, z którym dokument tworzy parę. */
  docPair(docId: string): Promise<DocPair | null>
  followLink(docId: string, href: string, mode: OpenMode): Promise<LinkOutcome>
  /** Przełącza arkusz pliku między plikiem a zmianami. Zwraca jego nowy opis. */
  setFileMode(docId: string, mode: FileMode): Promise<DocEntry | null>
  /** Zrzut miejsca linku do karty w panelu Linki. `later` znaczy, że nowsze zamówienie je wyprzedziło. */
  linkShot(request: LinkShotRequest): Promise<string | null | 'later'>
  onFollowLink(listener: (link: FollowLink) => void): () => void
  listAnnotations(): Promise<Annotation[]>
  createAnnotation(docId: string, input: NewAnnotation): Promise<void>
  replyAnnotation(id: string, text: string): Promise<void>
  setAnnotationStatus(id: string, status: AnnotationStatus): Promise<void>
  setAnnotationAudience(id: string, audience: Audience): Promise<void>
  deleteAnnotation(id: string): Promise<void>
  /** Nowe miejsce komentarza albo karteczki. Cofa się jak każda zmiana uwag. */
  moveAnnotation(id: string, anchor: Anchor): Promise<void>
  /** Odkleja uwagę, która potem idzie za kursorem do kliknięcia. `null` odkłada ją z powrotem. */
  carryAnnotation(docId: string, id: string | null): void
  /** Zwraca komunikat dla użytkownika, a `null`, gdy nie ma czego cofnąć. */
  undoAnnotation(docId: string): Promise<string | null>
  redoAnnotation(docId: string): Promise<string | null>
  setOverlayMode(docId: string, mode: OverlayMode): void
  /** Wskaźnik działa na wszystkich arkuszach, także tych otwartych później. */
  setPointer(on: boolean): void
  /** Zakreślacz też. Kolor go włącza, a `null` wyłącza. */
  setMarker(color: StickyColor | null): void
  /** Kształt też działa na wszystkich arkuszach. `null` go wyłącza. */
  setShaper(tool: ShapeTool | null): void
  /** Pełna lista dokumentów, w których rysunki są schowane. */
  setHiddenDrawings(docIds: string[]): void
  getPresentation(docId: string): Promise<Presentation>
  /** Zwraca trasę po sprawdzeniu, czyli to, co leży w pliku. */
  savePresentation(docId: string, presentation: Presentation): Promise<Presentation>
  /** Kadry kroków pokazywane w dokumencie przy otwartym formularzu. `null` je chowa. */
  setRouteFrames(docId: string, route: { frames: RouteFrame[]; selected: string | null } | null): void
  /** Dokument czeka na kliknięcie albo przeciągnięcie, które wskaże kadr kroku. */
  setRoutePicker(docId: string, kind: PickKind | null): void
  /** Krok prezentacji w dokumencie. `null` wraca do zwykłego widoku. */
  setPresent(docId: string, state: PresentState | null): void
  /** Szkic nowej uwagi w prezentacji. Dokument stawia go przy kadrze kroku i czeka na kliknięcie. */
  placeNote(docId: string, kind: 'comment' | 'sticky', color: StickyColor): void
  /** Minimapa przy prawej krawędzi każdego arkusza. */
  setMinimap(on: boolean): void
  outlineDoc(docId: string, command: OutlineCommand): void
  focusAnnotation(docId: string, id: string | null): void
  /** Włącza zgłaszanie pozycji pinezek, potrzebne wątkom wiszącym na ścianie. */
  trackOverlay(docId: string, on: boolean): void
  setTheme(choice: ThemeChoice): void
  appInfo(): Promise<AppInfo>
  /** Sprawdza plugin i CLI, więc trwa około sekundy. */
  agentSetup(): Promise<AgentSetup>
  /** Zwraca stan odczytany z systemu, bo system może odmówić. */
  setOpenAtLogin(on: boolean): Promise<boolean>
  /** Zwraca listę po sprawdzeniu adresów. */
  setAllowedHosts(hosts: string[]): Promise<string[]>
  getLanguage(): Promise<Language>
  setLanguage(language: Language): Promise<void>
  requestThumbs(docIds: string[]): void
  onViewerState(listener: (state: ViewerState) => void): () => void
  onLibraryChanged(listener: (json: string) => void): () => void
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
  onAutoLabelState(listener: (state: AutoLabelState) => void): () => void
  onAnnotationsChanged(listener: (annotations: Annotation[]) => void): () => void
  /** Któraś trasa zmieniła się na dysku, np. zapisana przez agenta. */
  onPresentationChanged(listener: () => void): () => void
  /** Wskaźnik stoi nad linkiem w dokumencie albo z niego zszedł (`null`). */
  onLinkHover(listener: (card: LinkHoverCard | null) => void): () => void
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
