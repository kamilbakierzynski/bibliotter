import { useSyncExternalStore } from 'react'
import type { AutoLabelState } from '../../../shared/autoLabel'
import { plural, t } from '../../../shared/i18n'
import { countLabels, hasLabel, isTicket, type LabelCount, labelTone, type LabelTone, ticketLink, type TicketRow, ticketRows } from '../../../shared/labels'
import { displayName, type ManualOrder, type SortMode, type Tone } from '../tree'
import type {
  Anchor,
  Annotation,
  AnnotationKind,
  Audience,
  NoteKind,
  OverlayRect,
  StickyColor
} from '../../../shared/annotations'
import type {
  DocEntry,
  DocFormat,
  DocStatus,
  DocThumb,
  LibrarySnapshot,
  ProjectGroup,
  ScanProgress,
  ThemeChoice,
  ThemeMode,
  ViewerState
} from '../../../shared/types'

/*
 * Stan powłoki. Trzymamy go poza Reactem, bo ruch czyta go w każdej klatce, a większość zmian
 * dotyczy kilku elementów naraz. React tylko rysuje treść po `notify()`.
 */

export type PanelView = 'library' | 'search' | 'inbox' | 'pocket' | 'notes' | 'labels' | 'review' | 'folders' | 'options'
export type StartView = 'home' | 'last'
export type Tool = 'move' | 'pointer' | AnnotationKind
export type InspView = 'notes' | 'links' | 'outline' | 'route'
export type FormatFilter = DocFormat | 'all'

/** Liczba miejsc na arkusze. Każde miejsce ma własny element i sprężyny. */
export const MAX_SHEETS = 8
export const MOD = 'Ctrl'

export interface SavedLayout {
  order: number[]
  docs: (string | null)[]
  focus: number
}

export interface Draft {
  docId: string
  kind: NoteKind
  anchor: Anchor | null
  /** Miejsce w widoku dokumentu. Uwaga do całego dokumentu go nie ma. */
  rect: OverlayRect | null
  audience: Audience
  color: StickyColor
}

const COLLAPSED_KEY = 'collapsedNodes'
const THEME_KEY = 'theme'
const LAST_LAYOUT_KEY = 'lastLayout'
const FORMAT_KEY = 'docFormat'
const SORT_KEY = 'docSort'
const SORT_BASE_KEY = 'docSortBase'
const MANUAL_KEY = 'manualOrder'
const OPENED_KEY = 'openedNodes'
const START_KEY = 'startView'
const AUDIENCE_KEY = 'noteAudience'

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Zapamiętany widok to tylko wygoda, więc jego utrata niczego nie psuje.
  }
}

function readKeys(key: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readStored(key) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function readThemeChoice(): ThemeChoice {
  const stored = readStored(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export const SYSTEM_DARK = '(prefers-color-scheme: dark)'

function readTheme(): ThemeMode {
  const choice = readThemeChoice()
  if (choice !== 'system') return choice
  return matchMedia(SYSTEM_DARK).matches ? 'dark' : 'light'
}

function readFormat(): FormatFilter {
  const stored = readStored(FORMAT_KEY)
  return stored === 'html' || stored === 'markdown' ? stored : 'all'
}

/** Ręcznie to ułożona kolejność nad zwykłym sortowaniem, które rządzi resztą. */
export type ShellSort = SortMode | 'manual'

export function saveSort(sort: ShellSort): void {
  writeStored(SORT_KEY, sort)
  writeStored(SORT_BASE_KEY, ui.sortBase)
}

function readSort(): ShellSort {
  const stored = readStored(SORT_KEY)
  return stored === 'name' || stored === 'manual' ? stored : 'recent'
}

function readManual(): ManualOrder {
  try {
    const parsed: unknown = JSON.parse(readStored(MANUAL_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const order: ManualOrder = {}
    for (const [key, keys] of Object.entries(parsed)) {
      if (Array.isArray(keys)) order[key] = keys.filter((item): item is string => typeof item === 'string')
    }
    return order
  } catch {
    return {}
  }
}

export function saveManual(): void {
  writeStored(MANUAL_KEY, JSON.stringify(ui.manual))
}

export function saveFormat(format: FormatFilter): void {
  writeStored(FORMAT_KEY, format)
}

export function saveTheme(choice: ThemeChoice): void {
  writeStored(THEME_KEY, choice)
}

export function saveStartView(start: StartView): void {
  writeStored(START_KEY, start)
}

export function saveAudience(audience: Audience): void {
  writeStored(AUDIENCE_KEY, audience)
}

export function saveCollapsed(): void {
  writeStored(COLLAPSED_KEY, JSON.stringify([...ui.closed]))
  writeStored(OPENED_KEY, JSON.stringify([...ui.opened]))
}

/** Dokumenty z ostatniego układu, żeby `H` po uruchomieniu wracało do pracy. */
export function readLastDocs(): string[] {
  try {
    const parsed: unknown = JSON.parse(readStored(LAST_LAYOUT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function saveLastDocs(docs: string[]): void {
  writeStored(LAST_LAYOUT_KEY, JSON.stringify(docs))
}

export const ui = {
  /** Powłoka wystartowała, więc można już mierzyć elementy. */
  ready: false,
  mode: readTheme(),
  /** Wybór użytkownika. `mode` mówi, co z niego teraz wynika. */
  theme: readThemeChoice(),
  /** Co pokazać po uruchomieniu, gdy poprzednia sesja zostawiła otwarte dokumenty. */
  start: (readStored(START_KEY) === 'last' ? 'last' : 'home') as StartView,
  view: 'library' as PanelView,
  nav: false,
  /** Węzły zwinięte przez użytkownika. */
  closed: readKeys(COLLAPSED_KEY),
  /** Węzły rozwinięte przez użytkownika, choć same z siebie są zwinięte. */
  opened: readKeys(OPENED_KEY),
  /** Foldery, których wiersze właśnie znikają pod rodzicem. */
  closing: new Set<string>(),
  /** Foldery właśnie ukryte. Ich wiersze znikają, zanim skan to potwierdzi. */
  leaving: new Set<string>(),
  /** Właśnie rozwinięty folder, z którego wyrastają nowe wiersze. */
  unfolded: null as string | null,
  /** Rośnie przy każdej zmianie zwinięć. */
  folds: 0,
  sort: readSort(),
  /** Sortowanie tego, czego nie ułożono ręcznie. */
  sortBase: (readStored(SORT_BASE_KEY) === 'name' ? 'name' : 'recent') as SortMode,
  /** Kolejność z przeciągania. Zmiana podmienia obiekt, bo model biblioteki porównuje zależności. */
  manual: readManual(),
  notesAud: 'me' as Audience,
  /** Który format pokazują biblioteka i ściana. */
  format: readFormat(),
  /** Etykieta, której dokumenty pokazuje panel. */
  label: null as string | null,
  /** Panel etykiet pokazuje spis kodów zgłoszeń zamiast zwykłych etykiet. */
  tickets: false,
  ticketQuery: '',
  labelPop: false,
  autoLabel: { newFiles: false, tickets: true, starters: [], pending: [], done: 0, total: 0, error: null } as AutoLabelState,
  /** Przycisk odnośnika chwilę potwierdza skopiowanie. */
  refCopied: false,

  panes: Array.from({ length: MAX_SHEETS }, (): string | null => null),
  order: [0],
  focus: 0,
  back: 0,
  peek: null as number | null,
  stash: null as SavedLayout | null,
  last: null as SavedLayout | null,

  tool: 'move' as Tool,
  color: 'yellow' as StickyColor,
  aud: (readStored(AUDIENCE_KEY) === 'me' ? 'me' : 'agent') as Audience,
  sel: false,
  insp: false,
  /** Dokument, który właśnie jest prezentacją. Dok staje się wtedy pilotem. */
  presenting: null as string | null,
  /** Panel obok arkusza pokazuje uwagi albo linki dokumentu. */
  inspView: 'notes' as InspView,
  notesView: 'wall' as 'wall' | 'list',
  selNote: null as string | null,
  /** Prostokąt pinezki, spod której wyrasta wątek. */
  threadRect: null as OverlayRect | null,
  draft: null as Draft | null,
  showResolved: false,

  cmd: false,
  map: false,
  acts: false,

  home: true,
  homeView: 'wall' as 'wall' | 'list',
  kbd: false,
  setup: null as 'first' | 'empty' | null,
  /** Skan nowego folderu właśnie wiesza dokumenty na ścianie. */
  streaming: false
}

export const data = {
  library: null as LibrarySnapshot | null,
  entries: new Map<string, DocEntry>(),
  annotations: [] as Annotation[],
  viewers: new Map<string, ViewerState>(),
  /** Czas modyfikacji pliku w chwili otwarcia. Różnica oznacza nową wersję na dysku. */
  opened: new Map<string, number>(),
  thumbs: new Map<string, DocThumb>(),
  orphans: new Map<string, Set<string>>(),
  /** Pozycje pinezek w widoku dokumentu, potrzebne wątkom na ścianie. */
  positions: new Map<string, Map<string, OverlayRect>>(),
  /** Przed pierwszą wiadomością z biblioteki skan już trwa, więc ściana nie mówi, że jest pusta. */
  scan: { active: true, found: 0, done: 0 } as ScanProgress
}

/** Pamięta wynik, dopóki zależności są tymi samymi obiektami. Biblioteka zmienia się rzadko, a powłoka rysuje się często. */
export function memo<Deps extends readonly unknown[], Value>(deps: () => Deps, compute: (...deps: [...Deps]) => Value): () => Value {
  let last: Deps | null = null
  let value: Value
  return () => {
    const next = deps()
    if (last === null || next.some((dep, i) => dep !== (last as Deps)[i])) {
      value = compute(...next)
      last = next
    }
    return value
  }
}

let version = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Prosi Reacta o przerysowanie treści. Ruch tego nie potrzebuje. */
export function notify(): void {
  version++
  for (const listener of listeners) listener()
}

export function useShell(): void {
  useSyncExternalStore(subscribe, () => version)
}

/** Dla wierszy, które nie rysują się przy każdej zmianie powłoki. */
export function useShellValue<Value>(read: () => Value): Value {
  return useSyncExternalStore(subscribe, read)
}

export const STATUS: Record<DocStatus, { label: string; tone: string }> = {
  'to-read': { get label() { return t('Do przeczytania') }, tone: 'read' },
  read: { get label() { return t('Przeczytane') }, tone: '' },
  'to-decide': { get label() { return t('Do decyzji') }, tone: 'decide' },
  decided: { get label() { return t('Zdecydowane') }, tone: 'done' },
  archived: { get label() { return t('Archiwum') }, tone: '' }
}

export const pinned = (): number => ui.order.length
export const isOpen = (i: number): boolean => ui.peek === i || (!ui.home && ui.order.includes(i))
export const openPane = (id: string): number => ui.panes.findIndex((doc, i) => doc === id && isOpen(i))
export const focusedId = (): string | null => (isOpen(ui.focus) ? (ui.panes[ui.focus] ?? null) : null)
export const focusedDoc = (): DocEntry | null => {
  const id = focusedId()
  return id ? (data.entries.get(id) ?? null) : null
}
export const canAnnotate = (doc: DocEntry | null): boolean => doc?.classification === 'document'
export const openNotes = (docId: string): Annotation[] =>
  data.annotations.filter((note) => note.docId === docId && note.status === 'open')
export const findNote = (id: string | null): Annotation | undefined =>
  data.annotations.find((note) => note.id === id)

/** Zakreślenie nie musi mieć wiadomości, więc mówi za nie zakreślony tekst. */
export const noteText = (note: Annotation): string =>
  note.messages[0]?.text ?? (note.anchor?.quote || t('Zakreślony obszar'))

export const replied = (note: Annotation): boolean => note.messages.at(-1)?.author === 'agent'
const answeredDocs = memo(
  () => [data.annotations] as const,
  (notes) => new Set(notes.filter((note) => note.status === 'open' && replied(note)).map((note) => note.docId))
)
export const answered = (doc: DocEntry): boolean => answeredDocs().has(doc.id)
/** Jedyne znaczenie Sygnału: to czeka na użytkownika. */
export const waiting = (doc: DocEntry): boolean => doc.status === 'to-decide' || answered(doc)
export const toneOf = (doc: DocEntry): Tone => (waiting(doc) ? 'decide' : doc.status === 'to-read' ? 'read' : 'none')

export { plural }
export const countDocs = (n: number): string => `${n} ${plural(n, 'dokument', 'dokumenty', 'dokumentów')}`
export const countWait = (n: number): string => (n ? ` · ${n} ${plural(n, 'czeka', 'czekają', 'czeka')}` : '')

export const isClosed = (key: string, byDefault: boolean): boolean =>
  ui.closed.has(key) || (byDefault && !ui.opened.has(key))

/** Wynik jest współdzielony, więc nie sortuj go ani nie zmieniaj w miejscu. */
export const libraryDocs = memo(
  () => [data.library] as const,
  (library): DocEntry[] => library?.projects.flatMap((project) => project.docs) ?? []
)

export const labelCatalog = memo(
  () => [libraryDocs()] as const,
  (docs): LabelCount[] => countLabels(docs.map((doc) => doc.labels))
)

export const kindCatalog = memo(
  () => [labelCatalog()] as const,
  (labels): LabelCount[] => labels.filter(({ name }) => !isTicket(name))
)

export const ticketCatalog = memo(
  () => [libraryDocs()] as const,
  (docs): TicketRow[] => ticketRows(docs, displayName)
)

/** Bez ustawionego adresu kod jest zwykłą etykietą. */
export const ticketHref = (name: string): string | null => ticketLink(data.library?.ticketUrl, name)

/** Etykieta przecina projekty i archiwum, więc to płaska lista, od najnowszych. */
export const labelDocs = (docs: DocEntry[], name: string): DocEntry[] =>
  docs.filter((doc) => hasLabel(doc.labels, name)).sort((a, b) => b.mtimeMs - a.mtimeMs)

export const labelToneOf = (name: string): LabelTone => labelTone(name, data.library?.labelColors)

/** Wartość atrybutu `data-color`. Znacznik bez koloru nie ma go wcale. */
export const colorAttr = (name: string): string | undefined => {
  const tone = labelToneOf(name)
  return tone === 'none' ? undefined : tone
}

/** Dokumenty dla Haiku na żądanie: widoczne, czyli bez archiwum, i jeszcze bez etykiet. */
export const unlabeledDocs = memo(
  () => [libraryDocs()] as const,
  (docs): DocEntry[] => docs.filter((doc) => !doc.missing && doc.status !== 'archived' && doc.labels.length === 0)
)

/** Filtr ma sens tylko przy obu formatach, więc inaczej nie może ukryć całej biblioteki. */
export const hasBothFormats = memo(
  () => [libraryDocs()] as const,
  (docs) => new Set(docs.map((doc) => doc.format)).size > 1
)

export const visibleDocs = memo(
  () => [libraryDocs(), ui.format] as const,
  (docs, format): DocEntry[] =>
    format === 'all' || !hasBothFormats() ? docs : docs.filter((doc) => doc.format === format)
)

export const visibleProjects = memo(
  () => [data.library, ui.format] as const,
  (library, format): ProjectGroup[] => {
    const projects = library?.projects ?? []
    if (format === 'all' || !hasBothFormats()) return projects
    return projects
      .map((project) => ({ ...project, docs: project.docs.filter((doc) => doc.format === format) }))
      .filter((project) => project.docs.length > 0)
  }
)
