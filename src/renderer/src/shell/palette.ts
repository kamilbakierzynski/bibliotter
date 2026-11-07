import type { Annotation } from '../../../shared/annotations'
import { cleanLabel, hasLabel, isTicket, sameLabel } from '../../../shared/labels'
import { DOC_FORMATS, DOC_STATUSES, type DocEntry, type DocFormat, type DocStatus, FORMAT_LABELS, type SearchHit } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { rectIn } from '../motion/pill'
import { clamp } from '../motion/spring'
import { goHome, toggleHomeView } from './home'
import { hideCard } from './hoverCard'
import { hideCaps, hideFly, hideTip, jumpToPair, stepNotes, togglePop } from './keys'
import { autoLabelDoc, closeLabelPop, toggleLabel, toggleLabelPop } from './labels'
import { inLayer } from './layer'
import { actPill, cmdPill, growFrom, mH, mW, setNav, setView } from './layout'
import { aimAt, cover, uncover } from './native'
import { toggleDrawings } from './drawings'
import { setTool, toggleNotesView, togglePanel } from './notes'
import { toggleMinimap } from './outline'
import { openOptions } from './options'
import { openFind } from './find'
import { clearPocket, togglePocket } from './pocket'
import { startPresentation } from './present'
import { copyReference } from './reference'
import { openSearch } from './search'
import { closeSheet, openDoc, openNote, peekDoc, splitKey } from './sheets'
import { canAnnotate, data, focusedDoc, labelCatalog, libraryDocs, MOD, noteText, notify, plural, STATUS, ticketHref, ui } from './state'
import { displayName, relativeTime } from '../tree'
import { classifyDoc, rescan, setDocStatus } from './library'
import { toggleMode } from './theme'

/*
 * Paleta rośnie z doku i jest z nim jednym obiektem. Szukanie to Żetony: `status:`, `projekt:`,
 * `gałąź:`, `format:`, `etykieta:` i `rodzaj:` zamieniają się w żeton po wyborze wartości. Panel akcji jest wspólny
 * dla każdego wyniku, jak w Raycast.
 */

export type FilterKey = 'project' | 'status' | 'branch' | 'format' | 'label' | 'kind'
type Kind = 'doc' | 'note' | 'action'

export interface PaletteAction {
  id: string
  title: string
  sub: string
  icon: string
  keys: string[]
  run: () => void
}

export type Row =
  | { type: 'group'; label: string }
  | { type: 'more'; left: number }
  | { type: 'value'; key: FilterKey; v: string; count: number }
  /** `file`: zapytanie pasuje do nazwy pliku albo folderu, a nie do tytułu. */
  | { type: 'doc'; doc: DocEntry; hit: SearchHit | null; file?: boolean }
  | { type: 'note'; note: Annotation }
  | { type: 'action'; action: PaletteAction }

export type Item = Exclude<Row, { type: 'group' }>

export interface ItemAction {
  title?: string
  group?: string
  icon?: string
  dot?: string
  keys?: string[]
  check?: boolean
  run?: () => void
}

const SEARCH_DELAY_MS = 150
/** Tyle dokumentów paleta pokazuje od razu, żeby uwagi i akcje nie uciekały pod listę. */
export const DOC_PAGE = 30
export const DOC_MORE = 100
const FLASH_MS = 1800
const DIA: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }
export const norm = (text: string): string => text.toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => DIA[c] ?? c)

const unique = (list: string[]): string[] => [...new Set(list)]

interface Filter {
  label: string
  op: string
  /** Nazwy operatora w każdym języku, bo nawyk nie idzie za ustawieniem. */
  names: string[]
  name: (value: string) => string
  values: () => string[]
}

export const filters = (): Record<FilterKey, Filter> => ({
  project: {
    label: t('Projekt'),
    op: t('projekt'),
    names: ['projekt', 'project'],
    name: (v) => v,
    values: () => unique(libraryDocs().map((doc) => doc.projectName))
  },
  status: {
    label: 'Status',
    op: 'status',
    names: ['status'],
    name: (v) => STATUS[v as DocStatus].label,
    values: () => [...DOC_STATUSES]
  },
  branch: {
    label: t('Gałąź'),
    op: t('gałąź'),
    names: ['gałąź', 'branch'],
    name: (v) => v,
    values: () => unique(libraryDocs().flatMap((doc) => doc.branch ?? []))
  },
  format: {
    label: 'Format',
    op: 'format',
    names: ['format'],
    name: (v) => FORMAT_LABELS[v as DocFormat],
    values: () => [...DOC_FORMATS]
  },
  label: {
    label: t('Etykieta'),
    op: t('etykieta'),
    names: ['etykieta', 'label'],
    name: (v) => v,
    values: () => labelCatalog().map(({ name }) => name)
  },
  kind: {
    label: t('Rodzaj'),
    op: t('rodzaj'),
    names: ['rodzaj', 'kind'],
    name: (v) => ({ doc: t('Dokumenty'), note: t('Uwagi'), action: t('Akcje') })[v as Kind],
    values: () => ['doc', 'note', 'action']
  }
})

const emptyFilters = (): Record<FilterKey, Set<string>> => ({
  project: new Set(),
  status: new Set(),
  branch: new Set(),
  format: new Set(),
  label: new Set(),
  kind: new Set()
})

export const cmd = {
  query: '',
  filters: emptyFilters(),
  order: [] as [FilterKey, string][],
  pick: null as { key: FilterKey; q: string } | null,
  rows: [] as Row[],
  items: [] as Item[],
  idx: 0,
  docLimit: DOC_PAGE,
  /** Wszystkie wyniki, także te, które czekają pod „Pokaż kolejne”. */
  total: 0,
  hits: [] as SearchHit[],
  /** Szukanie w treści jeszcze nie odpowiedziało, więc pusta lista niczego nie przesądza. */
  pending: false,
  flash: '',
  /** Wyniki się zmieniły, więc znacznik wyboru nie ma skąd jechać. */
  instant: true,
  actQuery: '',
  actRows: [] as ItemAction[],
  actIdx: 0
}

let searchTimer = 0
let searchToken = 0
let flashTimer = 0

const inputEl = (): HTMLInputElement | null => inLayer<HTMLInputElement>('cmdInput')
const actInputEl = (): HTMLInputElement | null => inLayer<HTMLInputElement>('actInput')

export const actions = (): PaletteAction[] => [
  { id: 'a-split', title: t('Podziel lub złóż widok'), sub: t('Przypina zerknięcie, a kilka arkuszy składa do jednego.'), icon: 'split', keys: [MOD, '\\'], run: () => splitKey() },
  { id: 'a-close', title: t('Zamknij arkusz'), sub: t('Pozostałe arkusze przejmują jego miejsce.'), icon: 'x', keys: ['X'], run: () => closeSheet(ui.focus) },
  { id: 'a-nav', title: t('Zwiń lub rozwiń nawigację'), sub: t('Zostawia sam pasek ikon.'), icon: 'left', keys: [MOD, 'B'], run: () => setNav(!ui.nav) },
  { id: 'a-comment', title: t('Dodaj komentarz'), sub: t('Kliknij miejsce w dokumencie.'), icon: 'comment', keys: ['C'], run: () => setTool('comment') },
  { id: 'a-sticky', title: t('Dodaj karteczkę'), sub: t('Przypnij notatkę do dokumentu.'), icon: 'sticky', keys: ['N'], run: () => setTool('sticky') },
  { id: 'a-labels', title: t('Etykiety dokumentu'), sub: t('Nadaje, zdejmuje i tworzy etykiety otwartego dokumentu.'), icon: 'tag', keys: ['L'], run: () => toggleLabelPop() },
  { id: 'a-auto-label', title: t('Etykietuj automatycznie'), sub: t('Haiku czyta otwarty dokument i wybiera z Twoich etykiet.'), icon: 'tag', keys: [], run: () => { const doc = focusedDoc(); if (doc) void autoLabelDoc(doc) } },
  { id: 'a-highlight', title: t('Zakreślacz'), sub: t('Przeciągnij po dokumencie. Zakreślenie zostaje, a prawy przycisk je usuwa.'), icon: 'marker', keys: ['M'], run: () => { if (focusedDoc()) setTool('highlight') } },
  { id: 'a-shape', title: t('Kształt'), sub: t('Strzałka, prostokąt, elipsa albo linia. Przeciągnij po dokumencie, Shift wyrównuje, a prawy przycisk usuwa.'), icon: 'shape', keys: ['A'], run: () => { if (canAnnotate(focusedDoc())) setTool('shape') } },
  { id: 'a-drawings', title: t('Pokaż lub schowaj rysunki'), sub: t('Kształty i strzałki tego dokumentu. Apka pamięta wybór.'), icon: 'eye-off', keys: ['D'], run: () => toggleDrawings() },
  { id: 'a-undo', title: t('Cofnij zmianę uwag'), sub: t('Dodanie, usunięcie, zamknięcie albo odpowiedź w otwartym dokumencie.'), icon: 'undo', keys: [MOD, 'Z'], run: () => stepNotes(false) },
  { id: 'a-redo', title: t('Przywróć zmianę uwag'), sub: t('Wraca do tego, co właśnie cofnięto.'), icon: 'redo', keys: [MOD, 'Shift', 'Z'], run: () => stepNotes(true) },
  { id: 'a-pointer', title: t('Wskaźnik prezentera'), sub: t('Kliknięcie stuka w ekran, przytrzymanie rysuje, a prawy przycisk kasuje linie.'), icon: 'point', keys: ['P'], run: () => { if (focusedDoc()) setTool('pointer') } },
  { id: 'a-notes', title: t('Pokaż lub ukryj uwagi'), sub: t('Wątki zawisną obok dokumentu.'), icon: 'bubble', keys: ['I'], run: () => togglePanel('notes') },
  { id: 'a-links', title: t('Pokaż lub ukryj linki'), sub: t('Linki z dokumentu i do niego.'), icon: 'link', keys: ['O'], run: () => togglePanel('links') },
  { id: 'a-pair', title: t('Plan lub jego objaśnienie'), sub: t('Przeskakuje między planem w Markdownie a objaśnieniem zrobionym przez explain-plan.'), icon: 'file', keys: ['Shift', 'O'], run: () => { const doc = focusedDoc(); if (doc) jumpToPair(doc.id) } },
  { id: 'a-outline', title: t('Pokaż lub ukryj spis treści'), sub: t('Nagłówki dokumentu. Kliknięcie przenosi do rozdziału.'), icon: 'toc', keys: ['G'], run: () => togglePanel('outline') },
  { id: 'a-route', title: t('Trasa prezentacji'), sub: t('Kroki prezentacji dokumentu: kadr kamery, reszta strony i uwagi do pokazania.'), icon: 'route', keys: ['Shift', 'P'], run: () => togglePanel('route') },
  { id: 'a-present', title: t('Prezentuj'), sub: t('Prowadzi przez trasę dokumentu krok po kroku. Strzałki i spacja zmieniają krok, a Esc kończy.'), icon: 'play', keys: ['F5'], run: () => void startPresentation() },
  { id: 'a-minimap', title: t('Pokaż lub ukryj minimapę'), sub: t('Szkic całego dokumentu przy prawej krawędzi arkusza.'), icon: 'toc', keys: ['Shift', 'G'], run: () => toggleMinimap() },
  { id: 'a-notes-view', title: t('Uwagi przy cytatach albo w panelu'), sub: t('Przełącza układ otwartych uwag.'), icon: 'right', keys: ['Shift', 'I'], run: () => toggleNotesView() },
  { id: 'a-home', title: t('Ekran startowy'), sub: t('Wraca na ścianę dokumentów.'), icon: 'gallery', keys: ['H'], run: () => goHome() },
  { id: 'a-home-view', title: t('Ściana lub spis'), sub: t('Przełącza widok ekranu startowego.'), icon: 'index', keys: ['Shift', 'H'], run: () => toggleHomeView() },
  { id: 'a-keys', title: t('Pokaż skróty'), sub: t('Wszystkie skróty w jednym miejscu.'), icon: 'keyboard', keys: ['?'], run: () => openMap() },
  { id: 'a-options', title: t('Opcje'), sub: t('Motyw, język, start apki i dozwolone adresy.'), icon: 'gear', keys: [MOD, ','], run: () => openOptions() },
  { id: 'a-agent', title: t('Połącz z agentem'), sub: t('Instalacja pluginu, CLI i serwera MCP.'), icon: 'term', keys: [], run: () => openOptions('agent') },
  { id: 'a-find', title: t('Szukaj w dokumencie'), sub: t('Podświetla frazę i przeskakuje po trafieniach.'), icon: 'textsearch', keys: [MOD, 'F'], run: () => openFind() },
  { id: 'a-search', title: t('Szukaj we wszystkich dokumentach'), sub: t('Przeszukuje treść całej biblioteki.'), icon: 'textsearch', keys: [MOD, 'Shift', 'F'], run: () => openSearch() },
  { id: 'a-theme', title: t('Przełącz motyw'), sub: t('Jasny albo ciemny.'), icon: 'moon', keys: ['T'], run: () => toggleMode() },
  { id: 'a-pocket', title: t('Włóż do kieszeni lub wyjmij'), sub: t('Otwarty dokument trafia do kieszeni, a Ctrl z cyfrą otwiera go jednym skrótem.'), icon: 'pocket', keys: ['K'], run: () => { const doc = focusedDoc(); if (doc) togglePocket(doc.id) } },
  { id: 'a-pocket-show', title: t('Pokaż kieszeń'), sub: t('Dokumenty, które masz pod ręką.'), icon: 'pocket', keys: [], run: () => setView('pocket') },
  { id: 'a-pocket-clear', title: t('Opróżnij kieszeń'), sub: t('Wyjmuje wszystkie dokumenty z kieszeni. Same dokumenty zostają w bibliotece.'), icon: 'pocket', keys: [], run: () => clearPocket() },
  { id: 'a-read', title: t('Oznacz jako przeczytane'), sub: t('Zmienia status otwartego dokumentu.'), icon: 'check', keys: [], run: () => { const doc = focusedDoc(); if (doc) setDocStatus(doc.id, 'read') } },
  { id: 'a-scan', title: t('Skanuj foldery'), sub: t('Szuka nowych dokumentów.'), icon: 'refresh', keys: [], run: () => rescan() },
  { id: 'a-folder', title: t('Pokaż w folderze'), sub: t('Otwiera lokalizację pliku.'), icon: 'reveal', keys: [], run: () => { const doc = focusedDoc(); if (doc) void window.api.revealDoc(doc.id) } },
  { id: 'a-skip', title: t('Pomiń dokument'), sub: t('Usuwa otwarty dokument z biblioteki.'), icon: 'x', keys: [], run: () => { const doc = focusedDoc(); if (doc) classifyDoc(doc.id, 'ignored') } }
]

/** Skróty: jedna tabela dla ściągi. */
export const keymap = (): { group: string; items: { keys: string[]; title: string; icon: string }[] }[] => [
  { group: t('Ogólne'), items: [
    { keys: [MOD, 'K'], title: t('Paleta poleceń'), icon: 'search' },
    { keys: [MOD, 'F'], title: t('Szukaj w dokumencie'), icon: 'textsearch' },
    { keys: [MOD, 'Shift', 'F'], title: t('Szukaj we wszystkich dokumentach'), icon: 'textsearch' },
    { keys: ['F3'], title: t('Następne trafienie w dokumencie'), icon: 'chev' },
    { keys: ['Shift', 'F3'], title: t('Poprzednie trafienie w dokumencie'), icon: 'prev' },
    { keys: ['F4'], title: t('Następne trafienie w bibliotece'), icon: 'chev' },
    { keys: ['Shift', 'F4'], title: t('Poprzednie trafienie w bibliotece'), icon: 'prev' },
    { keys: [MOD, 'B'], title: t('Zwiń nawigację'), icon: 'left' },
    { keys: ['H'], title: t('Ekran startowy'), icon: 'gallery' },
    { keys: ['Shift', 'H'], title: t('Ściana lub spis'), icon: 'index' },
    { keys: ['T'], title: t('Motyw'), icon: 'moon' },
    { keys: [MOD, ','], title: t('Opcje'), icon: 'gear' },
    { keys: ['?'], title: t('Mapa skrótów'), icon: 'keyboard' },
    { keys: ['Esc'], title: t('Cofnij krok'), icon: 'x' }
  ] },
  { group: t('Praca'), items: [
    { keys: ['V'], title: t('Interakcja'), icon: 'cursor' },
    { keys: ['C'], title: t('Komentarz'), icon: 'comment' },
    { keys: ['N'], title: t('Karteczka'), icon: 'sticky' },
    { keys: ['M'], title: t('Zakreślacz'), icon: 'marker' },
    { keys: ['A'], title: t('Kształt'), icon: 'shape' },
    { keys: ['D'], title: t('Pokaż lub schowaj rysunki'), icon: 'eye-off' },
    { keys: ['P'], title: t('Wskaźnik'), icon: 'point' },
    { keys: [MOD, 'Z'], title: t('Cofnij zmianę uwag'), icon: 'undo' },
    { keys: [MOD, 'Shift', 'Z'], title: t('Przywróć zmianę uwag'), icon: 'redo' },
    { keys: ['S'], title: t('Status dokumentu'), icon: 'check' },
    { keys: ['L'], title: t('Etykiety dokumentu'), icon: 'tag' },
    { keys: ['R'], title: t('Kopiuj odnośnik dla agenta'), icon: 'link' },
    { keys: ['I'], title: t('Uwagi'), icon: 'bubble' },
    { keys: ['O'], title: t('Linki z dokumentu i do niego'), icon: 'link' },
    { keys: ['Shift', 'O'], title: t('Plan lub jego objaśnienie'), icon: 'file' },
    { keys: ['G'], title: t('Spis treści'), icon: 'toc' },
    { keys: ['Shift', 'P'], title: t('Trasa prezentacji'), icon: 'route' },
    { keys: ['Shift', 'G'], title: t('Minimapa'), icon: 'toc' },
    { keys: ['Shift', 'I'], title: t('Uwagi przy cytatach lub w panelu'), icon: 'wall' }
  ] },
  { group: t('Arkusze'), items: [
    { keys: [MOD, t('klik')], title: t('Zerknij na dokument'), icon: 'file' },
    { keys: [MOD, '\\'], title: t('Przypnij, złóż lub rozłóż'), icon: 'split' },
    { keys: [MOD, '←'], title: t('Poprzedni arkusz'), icon: 'prev' },
    { keys: [MOD, '→'], title: t('Następny arkusz'), icon: 'chev' },
    { keys: ['X'], title: t('Zamknij arkusz'), icon: 'x' },
    { keys: ['K'], title: t('Włóż do kieszeni lub wyjmij'), icon: 'pocket' },
    { keys: [MOD, '1–9'], title: t('Otwórz dokument z kieszeni'), icon: 'pocket' }
  ] },
  { group: t('Prezentacja'), items: [
    { keys: ['F5'], title: t('Prezentuj od pierwszego kroku'), icon: 'play' },
    { keys: ['Shift', 'F5'], title: t('Prezentuj od wybranego kroku'), icon: 'play' },
    { keys: ['→'], title: t('Następny krok, także spacja i PgDn'), icon: 'chev' },
    { keys: ['←'], title: t('Poprzedni krok, także PgUp'), icon: 'prev' },
    { keys: ['D'], title: t('Pokaż wszystkie uwagi dokumentu'), icon: 'eye' },
    { keys: ['C', 'N'], title: t('Komentarz albo karteczka przy kroku'), icon: 'comment' },
    { keys: ['Esc'], title: t('Zakończ prezentację'), icon: 'x' }
  ] },
  { group: t('W palecie'), items: [
    { keys: [MOD, '↵'], title: t('Zerknij na wynik'), icon: 'file' },
    { keys: [MOD, 'K'], title: t('Akcje wyniku'), icon: 'layers' },
    { keys: [MOD, 'Shift', 'F'], title: t('Pokaż w Eksploratorze'), icon: 'reveal' },
    { keys: [MOD, 'Shift', 'C'], title: t('Kopiuj ścieżkę'), icon: 'file' },
    { keys: [MOD, 'Shift', 'R'], title: t('Kopiuj odnośnik dla agenta'), icon: 'link' },
    { keys: ['Tab'], title: t('Uzupełnij filtr'), icon: 'chev' },
    { keys: ['Backspace'], title: t('Usuń ostatni żeton'), icon: 'x' }
  ] }
]

function filterCount(key: FilterKey, value: string): number {
  if (key === 'project') return libraryDocs().filter((doc) => doc.projectName === value).length
  if (key === 'branch') return libraryDocs().filter((doc) => doc.branch === value).length
  if (key === 'status') return libraryDocs().filter((doc) => doc.status === value).length
  if (key === 'format') return libraryDocs().filter((doc) => doc.format === value).length
  if (key === 'label') return labelCatalog().find(({ name }) => name === value)?.count ?? 0
  if (value === 'doc') return libraryDocs().length
  if (value === 'note') return data.annotations.filter((note) => note.status === 'open').length
  return actions().length
}

export function filterKey(op: string | undefined): FilterKey | undefined {
  if (!op) return undefined
  const typed = norm(op)
  const all = filters()
  return (Object.keys(all) as FilterKey[]).find((key) => all[key].names.some((name) => norm(name).startsWith(typed)))
}

function fuzzy(q: string, text: string): number {
  if (!q) return 0
  const target = norm(text)
  const at = target.indexOf(q)
  if (at >= 0) return at
  let p = 0
  for (const c of target) if (c === q[p]) p++
  return p === q.length ? 500 : -1
}

/** Dopasowanie w nazwie wygrywa z dopasowaniem luźnym, a to z trafieniem w treści. */
const matchTier = (score: number): number => (score === 0 ? 0 : score < 500 ? 1 : score < 700 ? 2 : 3)
/** Nazwa pliku to tak samo mocny trop jak fragment tytułu, bo zwykle wpisuje się ją z pamięci. */
const FILE_SCORE = 450

/**
 * Gdzie w tekście stoją słowa zapytania: całe zapytanie w jednym kawałku albo każde słowo osobno,
 * jak w indeksie treści. Pusta lista znaczy, że tekst nie pasuje.
 */
export function wordMarks(text: string, q: string): [number, number][] {
  if (!q) return []
  const target = norm(text)
  const whole = target.indexOf(q)
  if (whole >= 0) return [[whole, whole + q.length]]
  const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.length < 2) return []
  const marks: [number, number][] = []
  for (const word of words) {
    const at = target.indexOf(word)
    if (at < 0) return []
    marks.push([at, at + word.length])
  }
  return marks.sort((a, b) => a[0] - b[0])
}

/** Plik na pierwszym miejscu, bo to w nim zwykle jest trafienie, a długi folder i tak się utnie. */
export function fileLine(doc: DocEntry): string {
  const dir = doc.relPath.split('/').slice(0, -1).join('/')
  return [doc.name, dir, doc.projectName].filter(Boolean).join(' · ')
}

function buildRows(): Row[] {
  if (cmd.pick) {
    const { key, q } = cmd.pick
    const filter = filters()[key]
    const needle = norm(q)
    const rows = filter
      .values()
      .filter((v) => norm(filter.name(v)).includes(needle))
      .map((v): Row => ({ type: 'value', key, v, count: filterCount(key, v) }))
    return rows.length > 0 ? [{ type: 'group', label: filter.label }, ...rows] : []
  }
  const f = cmd.filters
  const q = norm(cmd.query.trim())
  const out: Row[] = []
  const docFilter = f.project.size > 0 || f.status.size > 0 || f.branch.size > 0 || f.format.size > 0 || f.label.size > 0
  const narrowed = q !== '' || docFilter || f.kind.size > 0
  const want = (kind: Kind): boolean => f.kind.size === 0 || f.kind.has(kind)
  const pass = (doc: DocEntry): boolean =>
    (f.project.size === 0 || f.project.has(doc.projectName)) &&
    (f.status.size === 0 || f.status.has(doc.status)) &&
    (f.format.size === 0 || f.format.has(doc.format)) &&
    (f.label.size === 0 || doc.labels.some((label) => f.label.has(label))) &&
    (f.branch.size === 0 || (doc.branch !== null && f.branch.has(doc.branch)))

  if (want('doc')) {
    const hits = new Map(cmd.hits.map((hit) => [hit.doc.id, hit]))
    const list = libraryDocs()
      .filter(pass)
      .map((doc) => {
        const score = fuzzy(q, `${displayName(doc)} ${doc.projectName} ${doc.branch ?? ''} ${doc.labels.join(' ')}`)
        const named = score >= 0 && score < 500
        // Indeks treści zna też ścieżkę, więc bez tego trafienie po nazwie pliku pokazywało przypadkowy fragment tekstu.
        const file = q !== '' && !named && wordMarks(doc.relPath, q).length > 0
        const hit = q.length >= 3 && score < 0 && !file ? (hits.get(doc.id) ?? null) : null
        return { doc, hit, file, score: named ? score : file ? FILE_SCORE : score >= 0 ? score : hit ? 700 : -1 }
      })
      .filter((row) => row.score >= 0)
      .sort(
        (a, b) =>
          matchTier(a.score) - matchTier(b.score) ||
          Number(a.doc.status === 'archived') - Number(b.doc.status === 'archived') ||
          b.doc.mtimeMs - a.doc.mtimeMs
      )
    const limit = narrowed ? cmd.docLimit : 4
    if (list.length > 0) {
      out.push({ type: 'group', label: narrowed ? t('Dokumenty') : t('Ostatnie') })
      out.push(...list.slice(0, limit).map(({ doc, hit, file }): Row => ({ type: 'doc', doc, hit, file })))
      if (narrowed && list.length > limit) out.push({ type: 'more', left: list.length - limit })
    }
  }
  if (want('note')) {
    let list = data.annotations
      .filter((note) => {
        const doc = data.entries.get(note.docId)
        return note.status === 'open' && doc !== undefined && pass(doc)
      })
      .filter((note) => fuzzy(q, [noteText(note), ...note.messages.map((message) => message.text)].join(' ')) >= 0)
    if (!narrowed) list = list.slice(0, 2)
    if (list.length > 0) {
      out.push({ type: 'group', label: t('Uwagi') })
      out.push(...list.map((note): Row => ({ type: 'note', note })))
    }
  }
  if (want('action') && !docFilter) {
    let list = actions().map((action) => ({ action, score: fuzzy(q, `${action.title} ${action.sub}`) }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => a.score - b.score)
    if (!narrowed) list = list.slice(0, 5)
    if (list.length > 0) {
      out.push({ type: 'group', label: t('Akcje') })
      out.push(...list.map(({ action }): Row => ({ type: 'action', action })))
    }
  }
  return out
}

/** Przebudowuje wyniki. Znacznik wyboru ustawia się po narysowaniu, w `syncCmdPill`. */
export function renderCmd(): void {
  if (ui.map) return
  cmd.rows = buildRows()
  cmd.items = cmd.rows.filter((row): row is Item => row.type !== 'group')
  cmd.total = cmd.items.reduce((sum, item) => sum + (item.type === 'more' ? item.left : 1), 0)
  cmd.idx = clamp(cmd.idx, 0, Math.max(0, cmd.items.length - 1))
  cmd.instant = true
  notify()
}

export function syncCmdPill(instant = false): void {
  if (!ui.cmd || ui.map) return
  const list = inLayer('cmdList')
  const row = list?.querySelector<HTMLElement>(`.cr[data-i="${cmd.idx}"]`)
  if (!list || !row) {
    cmdPill.hide()
    return
  }
  const r = rectIn(row, list)
  if (r.y < list.scrollTop + 4) list.scrollTop = Math.max(0, r.y - 30)
  else if (r.y + r.h > list.scrollTop + list.clientHeight - 4) list.scrollTop = r.y + r.h - list.clientHeight + 6
  cmdPill.to(rectIn(row, list), instant)
}

export function cmdSelect(i: number): void {
  if (cmd.items.length === 0) return
  const next = clamp(i, 0, cmd.items.length - 1)
  if (next === cmd.idx) return
  cmd.idx = next
  const item = cmd.items[next]
  if (item?.type === 'doc') {
    window.api.requestThumbs([item.doc.id])
    aimAt(item.doc.id)
  }
  notify()
}

function searchBodies(query: string): void {
  clearTimeout(searchTimer)
  const token = ++searchToken
  cmd.pending = query.trim().length >= 3
  if (!cmd.pending) {
    cmd.hits = []
    return
  }
  const answer = (hits: SearchHit[]): void => {
    if (token !== searchToken) return
    cmd.hits = hits
    cmd.pending = false
    renderCmd()
  }
  searchTimer = window.setTimeout(() => {
    void window.api.search(query).then(answer, () => answer([]))
  }, SEARCH_DELAY_MS)
}

function setQuery(value: string): void {
  const input = inputEl()
  if (input) input.value = value
}

function resetSearch(): void {
  cmd.filters = emptyFilters()
  cmd.order = []
  cmd.pick = null
  cmd.query = ''
  cmd.hits = []
  cmd.pending = false
  cmd.idx = 0
  cmd.docLimit = DOC_PAGE
  setQuery('')
}

export function onCmdInput(value: string): void {
  if (ui.map) {
    cmd.query = value
    notify()
    return
  }
  if (value === '?') {
    setMap(true)
    return
  }
  cmd.query = value
  const match = /^([^\s:]+):(.*)$/.exec(value)
  const key = match ? filterKey(match[1]) : undefined
  cmd.pick = key ? { key, q: match?.[2] ?? '' } : null
  cmd.idx = 0
  cmd.docLimit = DOC_PAGE
  searchBodies(cmd.pick ? '' : value)
  renderCmd()
}

export function addFilter(key: FilterKey, value: string): void {
  cmd.filters[key].add(value)
  cmd.order.push([key, value])
  cmd.pick = null
  cmd.query = ''
  cmd.idx = 0
  cmd.docLimit = DOC_PAGE
  setQuery('')
  renderCmd()
}

export function dropFilter(key: FilterKey, value: string): void {
  cmd.filters[key].delete(value)
  cmd.order = cmd.order.filter(([k, v]) => !(k === key && v === value))
  cmd.docLimit = DOC_PAGE
  renderCmd()
}

export function startFilter(key: FilterKey): void {
  const value = `${filters()[key].op}:`
  setQuery(value)
  onCmdInput(value)
  inputEl()?.focus()
}

export function runCmd(beside: boolean): void {
  const item = cmd.items[cmd.idx]
  if (!item) return
  if (item.type === 'value') {
    addFilter(item.key, item.v)
    return
  }
  if (item.type === 'more') {
    cmd.docLimit += DOC_MORE
    renderCmd()
    return
  }
  closeCmd()
  if (item.type === 'doc') {
    if (beside) peekDoc(item.doc.id)
    else openDoc(item.doc.id)
  } else if (item.type === 'note') {
    openNote(item.note.id)
  } else {
    item.action.run()
  }
}

export function flash(text: string): void {
  cmd.flash = text
  clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    cmd.flash = ''
    notify()
  }, FLASH_MS)
  notify()
}

/** Etykiety działają na dokument z wyniku, także nieotwarty. Pole akcji tworzy nową, gdy takiej nie ma. */
function labelActions(doc: DocEntry): ItemAction[] {
  if (!canAnnotate(doc)) return []
  const known = labelCatalog()
  const typed = cleanLabel(cmd.actQuery)
  const toggle = (name: string) => (): void => {
    toggleLabel(doc, name)
    closeActs()
    flash(hasLabel(doc.labels, name) ? t('Dodano etykietę {name}', { name }) : t('Zdjęto etykietę {name}', { name }))
  }
  const offered = known.filter(({ name }) => typed || !isTicket(name) || hasLabel(doc.labels, name))
  const tickets = doc.labels.flatMap((name) => {
    const href = ticketHref(name)
    if (!href) return []
    const run = (): void => {
      closeActs()
      void window.api.openExternal(href)
    }
    return [{ icon: 'reveal', title: t('Otwórz {code} w Jira', { code: name }), run }]
  })
  return [
    { group: t('Etykiety') },
    { icon: 'tag', title: t('Etykietuj automatycznie'), run: () => { closeActs(); void autoLabelDoc(doc) } },
    ...tickets,
    ...offered.map(({ name }) => ({ icon: 'tag', title: name, check: hasLabel(doc.labels, name), run: toggle(name) })),
    ...(typed && !known.some(({ name }) => sameLabel(name, typed))
      ? [{ icon: 'tag', title: t('Utwórz etykietę „{name}”', { name: typed }), run: toggle(typed) }]
      : [])
  ]
}

function itemActions(item: Item | undefined): ItemAction[] {
  if (!item) return []
  if (item.type === 'doc') {
    const { doc } = item
    return [
      { icon: 'file', title: t('Otwórz'), keys: ['↵'], run: () => runCmd(false) },
      { icon: 'split', title: t('Otwórz obok'), keys: [MOD, '↵'], run: () => runCmd(true) },
      {
        icon: 'reveal',
        title: t('Pokaż w Eksploratorze'),
        keys: [MOD, 'Shift', 'F'],
        run: () => {
          void window.api.revealDoc(doc.id)
          closeActs()
          flash(t('Otwarto w Eksploratorze'))
        }
      },
      {
        icon: 'file',
        title: t('Kopiuj ścieżkę'),
        keys: [MOD, 'Shift', 'C'],
        run: () => {
          window.api.copyText(doc.path)
          closeActs()
          flash(t('Skopiowano ścieżkę'))
        }
      },
      {
        icon: 'link',
        title: t('Kopiuj odnośnik dla agenta'),
        keys: [MOD, 'Shift', 'R'],
        run: () => {
          copyReference(doc)
          closeActs()
          flash(t('Skopiowano odnośnik'))
        }
      },
      { group: 'Status' },
      ...(Object.entries(STATUS) as [DocStatus, { label: string; tone: string }][]).map(([id, status]) => ({
        dot: status.tone,
        title: status.label,
        check: doc.status === id,
        run: () => {
          setDocStatus(doc.id, id)
          closeActs()
        }
      })),
      ...labelActions(doc)
    ]
  }
  if (item.type === 'note') {
    const { note } = item
    return [
      { icon: 'bubble', title: t('Pokaż w dokumencie'), keys: ['↵'], run: () => runCmd(false) },
      {
        icon: 'check',
        title: t('Zamknij uwagę'),
        run: () => {
          void window.api.setAnnotationStatus(note.id, 'resolved')
          closeActs()
        }
      }
    ]
  }
  if (item.type === 'action') return [{ icon: item.action.icon, title: t('Uruchom'), keys: ['↵'], run: () => runCmd(false) }]
  return []
}

/** Skrót akcji działa także wtedy, gdy panel jest zamknięty. */
export function runChord(e: KeyboardEvent): boolean {
  const chord = [e.ctrlKey || e.metaKey ? MOD : '', e.shiftKey ? 'Shift' : '', e.key === 'Enter' ? '↵' : e.key.toUpperCase()]
    .filter(Boolean)
    .join(' ')
  const hit = itemActions(cmd.items[cmd.idx]).find((action) => action.keys && action.keys.length > 1 && action.keys.join(' ') === chord)
  if (!hit?.run) return false
  e.preventDefault()
  hit.run()
  return true
}

export function renderActs(): void {
  const all = itemActions(cmd.items[cmd.idx])
  const q = norm(cmd.actQuery.trim())
  const matches = (action: ItemAction): boolean => norm(action.title ?? '').includes(q)
  cmd.actRows = all.filter((action, i) => (action.group ? all.slice(i + 1).some((next) => !next.group && matches(next)) : matches(action)))
  cmd.actIdx = 0
  notify()
}

export const actionRows = (): ItemAction[] => cmd.actRows.filter((action) => !action.group)

export function syncActPill(instant = false): void {
  const box = inLayer('actBox')
  const row = box?.querySelector<HTMLElement>(`.ar[data-a="${cmd.actIdx}"]`)
  if (!box || !row) {
    actPill.hide()
    return
  }
  const r = { x: row.offsetLeft, y: row.offsetTop, w: row.offsetWidth, h: row.offsetHeight }
  if (r.y < box.scrollTop) box.scrollTop = r.y
  else if (r.y + r.h > box.scrollTop + box.clientHeight) box.scrollTop = r.y + r.h - box.clientHeight
  actPill.to(r, instant)
}

export function actSelect(i: number): void {
  const count = actionRows().length
  if (count === 0) return
  cmd.actIdx = clamp(i, 0, count - 1)
  notify()
}

export function openActs(): void {
  const item = cmd.items[cmd.idx]
  if (!item || item.type === 'value' || item.type === 'more') return
  ui.acts = true
  cmd.actQuery = ''
  const input = actInputEl()
  if (input) input.value = ''
  renderActs()
  input?.focus()
}

export function closeActs(): void {
  if (!ui.acts) return
  ui.acts = false
  notify()
  if (ui.cmd) inputEl()?.focus()
}

/** Na ekranie startowym paleta wyrasta z paska pod logo, a nie z doku. */
function heroBox(): { x: number; y: number; w: number; h: number } | null {
  if (!ui.home || ui.peek !== null || ui.setup !== null) return null
  const box = document.getElementById('homeAsk')?.getBoundingClientRect()
  return box && box.width > 0 ? { x: box.left, y: box.top, w: box.width, h: box.height } : null
}

export function openCmd(): void {
  if (ui.cmd) return
  ui.cmd = true
  hideTip()
  hideCard()
  togglePop(false)
  closeLabelPop()
  hideFly()
  hideCaps()
  ui.map = false
  resetSearch()
  renderCmd()
  growFrom(heroBox())
  mW.to(1, { k: 250, z: 0.8 })
  mH.to(1, { k: 190, z: 0.74 })
  cover('palette')
  window.api.focusLayer()
  inputEl()?.focus()
  requestAnimationFrame(() => {
    inputEl()?.focus()
    syncCmdPill(true)
  })
}

export function closeCmd(): void {
  if (!ui.cmd) return
  closeActs()
  ui.cmd = false
  ui.map = false
  mW.to(0, { k: 300, z: 0.88 })
  mH.to(0, { k: 280, z: 0.9 })
  inputEl()?.blur()
  uncover('palette')
  notify()
}

export function openMap(): void {
  openCmd()
  setMap(true)
}

/** Ściąga: wiersze zostają na miejscu, a filtr przygasza resztę, żeby nie burzyć pamięci przestrzennej. */
export function setMap(on: boolean): void {
  ui.map = on
  closeActs()
  cmd.flash = ''
  cmd.query = ''
  cmd.pick = null
  setQuery('')
  if (!on) renderCmd()
  notify()
  inputEl()?.focus()
}

export const docSub = (doc: DocEntry): string =>
  `${doc.projectName}${doc.branch ? ` · ${doc.branch}` : ''} · ${relativeTime(doc.mtimeMs)}`

export const countLabel = (n: number): string => `${n} ${plural(n, 'wynik', 'wyniki', 'wyników')}`
