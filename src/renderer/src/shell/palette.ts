import type { Annotation } from '../../../shared/annotations'
import { DOC_FORMATS, DOC_STATUSES, type DocEntry, type DocFormat, type DocStatus, FORMAT_LABELS, type SearchHit } from '../../../shared/types'
import { rectIn } from '../motion/pill'
import { clamp } from '../motion/spring'
import { goHome, toggleHomeView } from './home'
import { hideCaps, hideFly, hideTip, togglePop } from './keys'
import { inLayer } from './layer'
import { actPill, cmdPill, mH, mW, setNav } from './layout'
import { cover, uncover } from './native'
import { setInsp, setTool, toggleNotesView } from './notes'
import { closeSheet, openDoc, openNote, peekDoc, splitKey } from './sheets'
import { data, focusedDoc, libraryDocs, MOD, notify, plural, STATUS, ui } from './state'
import { displayName, relativeTime } from '../tree'
import { classifyDoc, rescan, setDocStatus } from './library'
import { toggleMode } from './theme'

/*
 * Paleta rośnie z doku i jest z nim jednym obiektem. Szukanie to Żetony: `status:`, `projekt:`,
 * `gałąź:`, `format:` i `rodzaj:` zamieniają się w żeton po wyborze wartości. Panel akcji jest wspólny
 * dla każdego wyniku, jak w Raycast.
 */

export type FilterKey = 'project' | 'status' | 'branch' | 'format' | 'kind'
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
  | { type: 'doc'; doc: DocEntry; hit: SearchHit | null }
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
  name: (value: string) => string
  values: () => string[]
}

export const FILTERS: Record<FilterKey, Filter> = {
  project: {
    label: 'Projekt',
    op: 'projekt',
    name: (v) => v,
    values: () => unique(libraryDocs().map((doc) => doc.projectName))
  },
  status: {
    label: 'Status',
    op: 'status',
    name: (v) => STATUS[v as DocStatus].label,
    values: () => [...DOC_STATUSES]
  },
  branch: {
    label: 'Gałąź',
    op: 'gałąź',
    name: (v) => v,
    values: () => unique(libraryDocs().flatMap((doc) => doc.branch ?? []))
  },
  format: {
    label: 'Format',
    op: 'format',
    name: (v) => FORMAT_LABELS[v as DocFormat],
    values: () => [...DOC_FORMATS]
  },
  kind: {
    label: 'Rodzaj',
    op: 'rodzaj',
    name: (v) => ({ doc: 'Dokumenty', note: 'Uwagi', action: 'Akcje' })[v as Kind],
    values: () => ['doc', 'note', 'action']
  }
}

const emptyFilters = (): Record<FilterKey, Set<string>> => ({
  project: new Set(),
  status: new Set(),
  branch: new Set(),
  format: new Set(),
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

export const ACTIONS: PaletteAction[] = [
  { id: 'a-split', title: 'Podziel lub złóż widok', sub: 'Przypina zerknięcie, a kilka arkuszy składa do jednego.', icon: 'split', keys: [MOD, '\\'], run: () => splitKey() },
  { id: 'a-close', title: 'Zamknij arkusz', sub: 'Pozostałe arkusze przejmują jego miejsce.', icon: 'x', keys: ['X'], run: () => closeSheet(ui.focus) },
  { id: 'a-nav', title: 'Zwiń lub rozwiń nawigację', sub: 'Zostawia sam pasek ikon.', icon: 'left', keys: [MOD, 'B'], run: () => setNav(!ui.nav) },
  { id: 'a-comment', title: 'Dodaj komentarz', sub: 'Kliknij miejsce w dokumencie.', icon: 'comment', keys: ['C'], run: () => setTool('comment') },
  { id: 'a-sticky', title: 'Dodaj karteczkę', sub: 'Przypnij notatkę do dokumentu.', icon: 'sticky', keys: ['N'], run: () => setTool('sticky') },
  { id: 'a-notes', title: 'Pokaż lub ukryj uwagi', sub: 'Wątki zawisną obok dokumentu.', icon: 'bubble', keys: ['I'], run: () => setInsp(!ui.insp) },
  { id: 'a-notes-view', title: 'Uwagi przy cytatach albo w panelu', sub: 'Przełącza układ otwartych uwag.', icon: 'right', keys: ['Shift', 'I'], run: () => toggleNotesView() },
  { id: 'a-home', title: 'Ekran startowy', sub: 'Wraca na ścianę dokumentów.', icon: 'gallery', keys: ['H'], run: () => goHome() },
  { id: 'a-home-view', title: 'Ściana lub spis', sub: 'Przełącza widok ekranu startowego.', icon: 'index', keys: ['Shift', 'H'], run: () => toggleHomeView() },
  { id: 'a-keys', title: 'Pokaż skróty', sub: 'Wszystkie skróty w jednym miejscu.', icon: 'keyboard', keys: ['?'], run: () => openMap() },
  { id: 'a-theme', title: 'Przełącz motyw', sub: 'Jasny albo ciemny.', icon: 'moon', keys: ['T'], run: () => toggleMode() },
  { id: 'a-read', title: 'Oznacz jako przeczytane', sub: 'Zmienia status otwartego dokumentu.', icon: 'check', keys: [], run: () => { const doc = focusedDoc(); if (doc) setDocStatus(doc.id, 'read') } },
  { id: 'a-scan', title: 'Skanuj foldery', sub: 'Szuka nowych dokumentów.', icon: 'refresh', keys: [], run: () => rescan() },
  { id: 'a-folder', title: 'Pokaż w folderze', sub: 'Otwiera lokalizację pliku.', icon: 'reveal', keys: [], run: () => { const doc = focusedDoc(); if (doc) void window.api.revealDoc(doc.id) } },
  { id: 'a-skip', title: 'Pomiń dokument', sub: 'Usuwa otwarty dokument z biblioteki.', icon: 'x', keys: [], run: () => { const doc = focusedDoc(); if (doc) classifyDoc(doc.id, 'ignored') } }
]

/** Skróty: jedna tabela dla ściągi. */
export const KEYMAP: { group: string; items: { keys: string[]; title: string; icon: string }[] }[] = [
  { group: 'Ogólne', items: [
    { keys: [MOD, 'K'], title: 'Paleta poleceń', icon: 'search' },
    { keys: [MOD, 'B'], title: 'Zwiń nawigację', icon: 'left' },
    { keys: ['H'], title: 'Ekran startowy', icon: 'gallery' },
    { keys: ['Shift', 'H'], title: 'Ściana lub spis', icon: 'index' },
    { keys: ['T'], title: 'Motyw', icon: 'moon' },
    { keys: ['?'], title: 'Mapa skrótów', icon: 'keyboard' },
    { keys: ['Esc'], title: 'Cofnij krok', icon: 'x' }
  ] },
  { group: 'Praca', items: [
    { keys: ['V'], title: 'Interakcja', icon: 'cursor' },
    { keys: ['C'], title: 'Komentarz', icon: 'comment' },
    { keys: ['N'], title: 'Karteczka', icon: 'sticky' },
    { keys: ['S'], title: 'Status dokumentu', icon: 'check' },
    { keys: ['I'], title: 'Uwagi', icon: 'bubble' },
    { keys: ['Shift', 'I'], title: 'Uwagi przy cytatach lub w panelu', icon: 'wall' }
  ] },
  { group: 'Arkusze', items: [
    { keys: [MOD, 'klik'], title: 'Zerknij na dokument', icon: 'file' },
    { keys: [MOD, '\\'], title: 'Przypnij, złóż lub rozłóż', icon: 'split' },
    { keys: [MOD, '←'], title: 'Poprzedni arkusz', icon: 'prev' },
    { keys: [MOD, '→'], title: 'Następny arkusz', icon: 'chev' },
    { keys: ['X'], title: 'Zamknij arkusz', icon: 'x' }
  ] },
  { group: 'W palecie', items: [
    { keys: [MOD, '↵'], title: 'Zerknij na wynik', icon: 'file' },
    { keys: [MOD, 'K'], title: 'Akcje wyniku', icon: 'layers' },
    { keys: [MOD, 'Shift', 'F'], title: 'Pokaż w Eksploratorze', icon: 'reveal' },
    { keys: [MOD, 'Shift', 'C'], title: 'Kopiuj ścieżkę', icon: 'file' },
    { keys: ['Tab'], title: 'Uzupełnij filtr', icon: 'chev' },
    { keys: ['Backspace'], title: 'Usuń ostatni żeton', icon: 'x' }
  ] }
]

function filterCount(key: FilterKey, value: string): number {
  if (key === 'project') return libraryDocs().filter((doc) => doc.projectName === value).length
  if (key === 'branch') return libraryDocs().filter((doc) => doc.branch === value).length
  if (key === 'status') return libraryDocs().filter((doc) => doc.status === value).length
  if (key === 'format') return libraryDocs().filter((doc) => doc.format === value).length
  if (value === 'doc') return libraryDocs().length
  if (value === 'note') return data.annotations.filter((note) => note.status === 'open').length
  return ACTIONS.length
}

export function filterKey(op: string | undefined): FilterKey | undefined {
  if (!op) return undefined
  return (Object.keys(FILTERS) as FilterKey[]).find((key) => norm(FILTERS[key].op).startsWith(norm(op)))
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

function buildRows(): Row[] {
  if (cmd.pick) {
    const { key, q } = cmd.pick
    const filter = FILTERS[key]
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
  const docFilter = f.project.size > 0 || f.status.size > 0 || f.branch.size > 0 || f.format.size > 0
  const narrowed = q !== '' || docFilter || f.kind.size > 0
  const want = (kind: Kind): boolean => f.kind.size === 0 || f.kind.has(kind)
  const pass = (doc: DocEntry): boolean =>
    (f.project.size === 0 || f.project.has(doc.projectName)) &&
    (f.status.size === 0 || f.status.has(doc.status)) &&
    (f.format.size === 0 || f.format.has(doc.format)) &&
    (f.branch.size === 0 || (doc.branch !== null && f.branch.has(doc.branch)))

  if (want('doc')) {
    const hits = new Map(cmd.hits.map((hit) => [hit.doc.id, hit]))
    const list = libraryDocs()
      .filter(pass)
      .map((doc) => {
        const score = fuzzy(q, `${displayName(doc)} ${doc.projectName} ${doc.branch ?? ''}`)
        const hit = q.length >= 3 && score < 0 ? (hits.get(doc.id) ?? null) : null
        return { doc, hit, score: score >= 0 ? score : hit ? 700 : -1 }
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
      out.push({ type: 'group', label: narrowed ? 'Dokumenty' : 'Ostatnie' })
      out.push(...list.slice(0, limit).map(({ doc, hit }): Row => ({ type: 'doc', doc, hit })))
      if (narrowed && list.length > limit) out.push({ type: 'more', left: list.length - limit })
    }
  }
  if (want('note')) {
    let list = data.annotations
      .filter((note) => {
        const doc = data.entries.get(note.docId)
        return note.status === 'open' && doc !== undefined && pass(doc)
      })
      .filter((note) => fuzzy(q, note.messages.map((message) => message.text).join(' ')) >= 0)
    if (!narrowed) list = list.slice(0, 2)
    if (list.length > 0) {
      out.push({ type: 'group', label: 'Uwagi' })
      out.push(...list.map((note): Row => ({ type: 'note', note })))
    }
  }
  if (want('action') && !docFilter) {
    let list = ACTIONS.map((action) => ({ action, score: fuzzy(q, `${action.title} ${action.sub}`) }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => a.score - b.score)
    if (!narrowed) list = list.slice(0, 5)
    if (list.length > 0) {
      out.push({ type: 'group', label: 'Akcje' })
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
  if (item?.type === 'doc') window.api.requestThumbs([item.doc.id])
  notify()
}

function searchBodies(query: string): void {
  clearTimeout(searchTimer)
  const token = ++searchToken
  if (query.trim().length < 3) {
    cmd.hits = []
    return
  }
  searchTimer = window.setTimeout(() => {
    void window.api.search(query).then((hits) => {
      if (token !== searchToken) return
      cmd.hits = hits
      renderCmd()
    })
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
  const value = `${FILTERS[key].op}:`
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

function itemActions(item: Item | undefined): ItemAction[] {
  if (!item) return []
  if (item.type === 'doc') {
    const { doc } = item
    return [
      { icon: 'file', title: 'Otwórz', keys: ['↵'], run: () => runCmd(false) },
      { icon: 'split', title: 'Otwórz obok', keys: [MOD, '↵'], run: () => runCmd(true) },
      {
        icon: 'reveal',
        title: 'Pokaż w Eksploratorze',
        keys: [MOD, 'Shift', 'F'],
        run: () => {
          void window.api.revealDoc(doc.id)
          closeActs()
          flash('Otwarto w Eksploratorze')
        }
      },
      {
        icon: 'file',
        title: 'Kopiuj ścieżkę',
        keys: [MOD, 'Shift', 'C'],
        run: () => {
          void navigator.clipboard.writeText(doc.path).catch(() => {})
          closeActs()
          flash('Skopiowano ścieżkę')
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
      }))
    ]
  }
  if (item.type === 'note') {
    const { note } = item
    return [
      { icon: 'bubble', title: 'Pokaż w dokumencie', keys: ['↵'], run: () => runCmd(false) },
      {
        icon: 'check',
        title: 'Zamknij uwagę',
        run: () => {
          void window.api.setAnnotationStatus(note.id, 'resolved')
          closeActs()
        }
      }
    ]
  }
  if (item.type === 'action') return [{ icon: item.action.icon, title: 'Uruchom', keys: ['↵'], run: () => runCmd(false) }]
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

export function openCmd(): void {
  if (ui.cmd) return
  ui.cmd = true
  hideTip()
  togglePop(false)
  hideFly()
  hideCaps()
  ui.map = false
  resetSearch()
  renderCmd()
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
