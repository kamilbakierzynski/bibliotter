import { useSyncExternalStore } from 'react'
import type { SortMode, Tone } from '../tree'
import type {
  Anchor,
  Annotation,
  AnnotationKind,
  Audience,
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
  ThemeMode,
  ViewerState
} from '../../../shared/types'

/*
 * Stan powłoki. Trzymamy go poza Reactem, bo ruch czyta go w każdej klatce, a większość zmian
 * dotyczy kilku elementów naraz. React tylko rysuje treść po `notify()`.
 */

export type PanelView = 'library' | 'inbox' | 'notes' | 'review' | 'folders'
export type Tool = 'move' | AnnotationKind
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
  kind: AnnotationKind
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
const OPENED_KEY = 'openedNodes'

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

function readTheme(): ThemeMode {
  const stored = readStored(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readFormat(): FormatFilter {
  const stored = readStored(FORMAT_KEY)
  return stored === 'html' || stored === 'markdown' ? stored : 'all'
}

export function saveSort(sort: SortMode): void {
  writeStored(SORT_KEY, sort)
}

export function saveFormat(format: FormatFilter): void {
  writeStored(FORMAT_KEY, format)
}

export function saveTheme(mode: ThemeMode): void {
  writeStored(THEME_KEY, mode)
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
  view: 'library' as PanelView,
  nav: false,
  /** Węzły zwinięte przez użytkownika. */
  closed: readKeys(COLLAPSED_KEY),
  /** Węzły rozwinięte przez użytkownika, choć same z siebie są zwinięte. */
  opened: readKeys(OPENED_KEY),
  /** Foldery, których wiersze właśnie znikają pod rodzicem. */
  closing: new Set<string>(),
  /** Właśnie rozwinięty folder, z którego wyrastają nowe wiersze. */
  unfolded: null as string | null,
  /** Rośnie przy każdej zmianie zwinięć. */
  folds: 0,
  sort: (readStored(SORT_KEY) === 'name' ? 'name' : 'recent') as SortMode,
  notesAud: 'me' as Audience,
  /** Który format pokazują biblioteka i ściana. */
  format: readFormat(),

  panes: Array.from({ length: MAX_SHEETS }, (): string | null => null),
  order: [0],
  focus: 0,
  back: 0,
  peek: null as number | null,
  stash: null as SavedLayout | null,
  last: null as SavedLayout | null,

  tool: 'move' as Tool,
  color: 'yellow' as StickyColor,
  aud: 'agent' as Audience,
  sel: false,
  insp: false,
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
  /** Liczba dokumentów w scenie pierwszego skanowania. */
  scanned: null as number | null
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
  scanning: true
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

export const STATUS: Record<DocStatus, { label: string; tone: string }> = {
  'to-read': { label: 'Do przeczytania', tone: 'read' },
  read: { label: 'Przeczytane', tone: '' },
  'to-decide': { label: 'Do decyzji', tone: 'decide' },
  decided: { label: 'Zdecydowane', tone: 'done' },
  archived: { label: 'Archiwum', tone: '' }
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

export const replied = (note: Annotation): boolean => note.messages.at(-1)?.author === 'agent'
const answeredDocs = memo(
  () => [data.annotations] as const,
  (notes) => new Set(notes.filter((note) => note.status === 'open' && replied(note)).map((note) => note.docId))
)
export const answered = (doc: DocEntry): boolean => answeredDocs().has(doc.id)
/** Jedyne znaczenie Sygnału: to czeka na użytkownika. */
export const waiting = (doc: DocEntry): boolean => doc.status === 'to-decide' || answered(doc)
export const toneOf = (doc: DocEntry): Tone => (waiting(doc) ? 'decide' : doc.status === 'to-read' ? 'read' : 'none')

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const a = n % 10
  const b = n % 100
  return a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
export const countDocs = (n: number): string => `${n} ${plural(n, 'dokument', 'dokumenty', 'dokumentów')}`
export const countWait = (n: number): string => (n ? ` · ${n} ${plural(n, 'czeka', 'czekają', 'czeka')}` : '')

export const isClosed = (key: string, byDefault: boolean): boolean =>
  ui.closed.has(key) || (byDefault && !ui.opened.has(key))

/** Wynik jest współdzielony, więc nie sortuj go ani nie zmieniaj w miejscu. */
export const libraryDocs = memo(
  () => [data.library] as const,
  (library): DocEntry[] => library?.projects.flatMap((project) => project.docs) ?? []
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
