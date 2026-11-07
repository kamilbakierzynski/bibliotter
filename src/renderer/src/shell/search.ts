import type { ContentDoc, SearchFailure, TextSnippet } from '../../../shared/textSearch'
import type { DocEntry } from '../../../shared/types'
import { laneIn, Pill } from '../motion/pill'
import { askSeed, closeFind, emptyQuery, find, openFind, presentFind, type QueryOption, stepFind } from './find'
import type { KeyLike } from './keys'
import { els, setView } from './layout'
import { focusLive } from './native'
import { openDoc, peekDoc } from './sheets'
import { data, focusedId, memo, notify, ui } from './state'

/*
 * Panel na szynie szuka w treści wszystkich dokumentów, jak widok wyszukiwania w VS Code: wyniki
 * idą dokumentami, a każde trafienie to wiersz. Wybrany wiersz otwiera dokument z tym samym
 * zapytaniem w pasku nad arkuszem, więc dalej przeskakuje się już po całym dokumencie.
 */

const TYPING_MS = 180
/** Jeden znak pasuje prawie wszędzie, a wyniki nic by nie powiedziały. */
const MIN_LENGTH = 2
export const DOC_ROW = 32
export const HIT_ROW = 28

export const search = {
  query: emptyQuery(),
  docs: [] as ContentDoc[],
  /** Zapytanie, na które odpowiadają wyniki. Pole może już mówić coś nowego. */
  answeredQuery: emptyQuery(),
  busy: false,
  /** Lista dotyczy tego, co stoi w polu. */
  answered: false,
  failure: null as SearchFailure | null,
  closed: new Set<string>(),
  /** Rośnie przy każdej zmianie zwinięć. */
  folds: 0,
  /** Wiersz wybrany strzałkami. */
  active: -1,
  /** Wiersz ostatnio otwarty. Enter przy nim idzie do następnego. */
  shown: -1,
  /** Pole ma przejąć klawiaturę. */
  focus: false
}

export const hitPill = new Pill()

interface HitItem {
  doc: DocEntry
  hit: TextSnippet
}

interface RowBase {
  key: string
  y: number
  doc: DocEntry
}

export type SearchRow =
  | (RowBase & { type: 'doc'; count: number; closed: boolean })
  | (RowBase & { type: 'hit'; hit: TextSnippet; at: number })
  | (RowBase & { type: 'more'; left: number })

export interface SearchModel {
  rows: SearchRow[]
  height: number
  /** Trafienia po kolei, także z zwiniętych dokumentów. */
  hits: HitItem[]
  docs: number
  total: number
}

/** Bieżące wyżej. Archiwum to większość biblioteki, więc nie może ich przykryć. */
function ordered(docs: ContentDoc[]): { doc: DocEntry; found: ContentDoc }[] {
  return docs
    .flatMap((found) => {
      const doc = data.entries.get(found.docId)
      return doc ? [{ doc, found }] : []
    })
    .sort(
      (a, b) =>
        Number(a.doc.status === 'archived') - Number(b.doc.status === 'archived') || b.doc.mtimeMs - a.doc.mtimeMs
    )
}

const model = memo(
  () => [search.docs, data.entries, search.folds] as const,
  (docs): SearchModel => {
    const rows: SearchRow[] = []
    const hits: HitItem[] = []
    let y = 0
    let total = 0
    const list = ordered(docs)
    for (const { doc, found } of list) {
      const closed = search.closed.has(doc.id)
      total += found.count
      rows.push({ key: doc.id, y, type: 'doc', doc, count: found.count, closed })
      y += DOC_ROW
      found.hits.forEach((hit, index) => {
        const at = hits.push({ doc, hit }) - 1
        if (closed) return
        rows.push({ key: `${doc.id}:${index}`, y, type: 'hit', doc, hit, at })
        y += HIT_ROW
      })
      const left = found.count - found.hits.length
      if (!closed && left > 0) {
        rows.push({ key: `${doc.id}:more`, y, type: 'more', doc, left })
        y += HIT_ROW
      }
    }
    return { rows, height: y, hits, docs: list.length, total }
  }
)

export const searchModel = (): SearchModel => model()

let typing = 0
let ticket = 0

function run(): void {
  clearTimeout(typing)
  const own = (ticket += 1)
  const { query } = search
  if (query.text.trim().length < MIN_LENGTH) {
    search.docs = []
    search.busy = false
    search.answered = false
    search.failure = null
    search.active = -1
    search.shown = -1
    notify()
    return
  }
  search.busy = true
  notify()
  typing = window.setTimeout(() => {
    void window.api.searchContent(query).then(({ docs, failure }) => {
      if (own !== ticket) return
      search.docs = docs
      search.answeredQuery = query
      search.failure = failure ?? null
      search.busy = false
      search.answered = true
      search.closed.clear()
      search.active = docs.length > 0 ? 0 : -1
      search.shown = -1
      notify()
    })
  }, TYPING_MS)
}

export function setSearchText(text: string): void {
  search.query = { ...search.query, text }
  run()
}

export function toggleSearchOption(option: QueryOption): void {
  search.query = { ...search.query, [option]: !search.query[option] }
  run()
}

export function openSearch(): void {
  if (ui.view !== 'search' || !ui.nav) setView('search')
  search.focus = true
  window.api.focusDoc(null)
  if (!search.answered) run()
  const docId = focusedId()
  if (docId) {
    const before = search.query.text
    askSeed(docId, (text) => {
      if (search.query.text === before) {
        search.focus = true
        setSearchText(text)
      }
    })
  }
  notify()
}

export function leaveSearch(): void {
  document.getElementById('searchInput')?.blur()
  focusLive()
}

export function syncHitPill(): void {
  const row = els.scroll.querySelector('.row.hit.now')
  if (row) hitPill.to(laneIn(row, els.scroll))
  else hitPill.hide()
}

function revealRow(): void {
  const row = model().rows.find((item) => item.type === 'hit' && item.at === search.active)
  const list = els.scroll.querySelector('.vl')
  if (!row || !list) return
  const { scroll } = els
  const y = list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop + row.y
  if (y < scroll.scrollTop + DOC_ROW) scroll.scrollTop = y - DOC_ROW
  else if (y + HIT_ROW > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = y + HIT_ROW - scroll.clientHeight
}

function select(at: number): void {
  const doc = model().hits[at]?.doc
  search.active = at
  // Skok do zwiniętego dokumentu rozwija go, bo inaczej wiersza nie byłoby widać.
  if (doc && search.closed.delete(doc.id)) search.folds += 1
  notify()
  requestAnimationFrame(revealRow)
}

/** Strzałki w polu wybierają wiersz, ale dokumentu jeszcze nie ruszają. */
export function moveHit(delta: number): void {
  const count = model().hits.length
  if (count > 0) select((Math.max(search.active, 0) + delta + count) % count)
}

export function openHit(at: number, peek = false): void {
  const item = model().hits[at]
  if (!item) return
  select(at)
  search.shown = at
  if (peek) peekDoc(item.doc.id)
  else openDoc(item.doc.id)
  presentFind(item.doc.id, search.query, item.hit)
}

/** Otwiera dokument na początku trafień, gdy panel nie pokazuje już kolejnych. */
export function openFound(doc: DocEntry, peek: boolean): void {
  if (peek) peekDoc(doc.id)
  else openDoc(doc.id)
  presentFind(doc.id, search.query)
}

/** Enter albo F4: najpierw wybrany wiersz, potem kolejne trafienia, także w następnych dokumentach. */
export function stepHit(forward: boolean): void {
  const count = model().hits.length
  if (count === 0) return
  const from = Math.max(search.active, 0)
  openHit(search.active === search.shown ? (from + (forward ? 1 : -1) + count) % count : from)
}

export function toggleDocFold(docId: string): void {
  if (!search.closed.delete(docId)) search.closed.add(docId)
  search.folds += 1
  notify()
}

export const allFolded = (): boolean => search.closed.size > 0 && search.closed.size >= model().docs

export function toggleAllFolds(): void {
  if (allFolded()) search.closed.clear()
  else for (const { type, doc } of model().rows) if (type === 'doc') search.closed.add(doc.id)
  search.folds += 1
  notify()
}

/** Skróty szukania. Działają też z dokumentu, który ma klawiaturę. */
export function searchKey(e: KeyLike): boolean {
  if (ui.setup || e.altKey) return false
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    if (e.shiftKey || !focusedId()) openSearch()
    else openFind()
    return true
  }
  if (mod) return false
  if (e.key === 'F3') {
    e.preventDefault()
    if (find.open) stepFind(!e.shiftKey)
    else openFind()
    return true
  }
  if (e.key === 'F4') {
    e.preventDefault()
    stepHit(!e.shiftKey)
    return true
  }
  return false
}

/** Esc najpierw zamyka pasek, a dopiero następny cofa kolejny krok. */
export function escapeFind(): boolean {
  if (!find.open) return false
  closeFind()
  return true
}
