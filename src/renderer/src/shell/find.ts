import type { OverlayEvent } from '../../../shared/annotations'
import { t } from '../../../shared/i18n'
import { type FindState, NO_FIND, type TextQuery, type TextSnippet } from '../../../shared/textSearch'
import { focusLive, refreshFrame } from './native'
import { focusedId, notify, ui } from './state'

/*
 * Szukanie w dokumencie steruje widokiem, więc stoi nad arkuszem, obok podziału i uwag. Pasek jest
 * jeden i należy do bieżącego arkusza, a przy zmianie arkusza zapytanie idzie razem z nim.
 */

export type QueryOption = 'matchCase' | 'wholeWord' | 'regex'
type FindEvent = Extract<OverlayEvent, { type: 'find' | 'find-seed' }>

/** Pisanie daje serię znaków, a strona ma liczyć tylko ostatni. */
const TYPING_MS = 70

export const emptyQuery = (): TextQuery => ({ text: '', matchCase: false, wholeWord: false, regex: false })

export const find = {
  open: false,
  docId: null as string | null,
  query: emptyQuery(),
  state: NO_FIND as FindState,
  /** Pole ma przejąć klawiaturę. Skok z panelu otwiera pasek, ale klawiatura zostaje w panelu. */
  focus: false
}

let typing = 0
let seedTo: ((text: string) => void) | null = null

function sendQuery(target?: TextSnippet): void {
  clearTimeout(typing)
  typing = 0
  const { docId, query } = find
  if (!docId) return
  if (query.text.trim()) {
    window.api.findInDoc(docId, { type: 'set', query, ...(target ? { target } : {}) })
  } else {
    window.api.findInDoc(docId, { type: 'clear' })
    find.state = NO_FIND
  }
}

/** Zaznaczony w dokumencie tekst staje się zapytaniem, jak w VS Code. */
export function askSeed(docId: string, apply: (text: string) => void): void {
  seedTo = apply
  window.api.findInDoc(docId, { type: 'seed' })
}

export function setFindText(text: string): void {
  find.query = { ...find.query, text }
  clearTimeout(typing)
  typing = window.setTimeout(() => {
    sendQuery()
    notify()
  }, TYPING_MS)
  notify()
}

export function openFind(): void {
  const docId = focusedId()
  if (!docId) return
  if (find.docId && find.docId !== docId) window.api.findInDoc(find.docId, { type: 'clear' })
  find.open = true
  find.docId = docId
  find.focus = true
  window.api.focusDoc(null)
  sendQuery()
  const before = find.query.text
  askSeed(docId, (text) => {
    if (!find.open || find.docId !== docId || find.query.text !== before) return
    find.query = { ...find.query, text }
    find.focus = true
    sendQuery()
    notify()
  })
  notify()
}

/** Klawiatura wraca do dokumentu, a zapytanie zostaje na następne otwarcie. */
export function closeFind(): void {
  if (!find.open) return
  clearTimeout(typing)
  if (find.docId) window.api.findInDoc(find.docId, { type: 'clear' })
  find.open = false
  find.docId = null
  find.state = NO_FIND
  notify()
  document.getElementById('findInput')?.blur()
  focusLive()
}

export function toggleFind(): void {
  if (find.open) closeFind()
  else openFind()
}

export function stepFind(forward: boolean): void {
  if (!find.docId) return
  if (typing) sendQuery()
  window.api.findInDoc(find.docId, { type: 'step', forward })
}

export function toggleFindOption(option: QueryOption): void {
  find.query = { ...find.query, [option]: !find.query[option] }
  sendQuery()
  notify()
}

/** Pokazuje w dokumencie zapytanie z panelu, a `target` wskazuje wybrane trafienie. */
export function presentFind(docId: string, query: TextQuery, target?: TextSnippet): void {
  if (find.docId && find.docId !== docId) window.api.findInDoc(find.docId, { type: 'clear' })
  if (find.docId !== docId) find.state = NO_FIND
  find.open = true
  find.docId = docId
  find.query = query
  sendQuery(target)
  notify()
}

/** Pasek idzie za bieżącym arkuszem, a bez arkusza znika. */
export function syncFind(): void {
  if (!find.open) return
  const docId = focusedId()
  if (docId === find.docId) return
  if (find.docId) window.api.findInDoc(find.docId, { type: 'clear' })
  find.docId = docId
  find.state = NO_FIND
  if (docId) sendQuery()
  else find.open = false
}

export function handleFindEvent(docId: string, event: FindEvent): void {
  if (event.type === 'find-seed') {
    const apply = seedTo
    seedTo = null
    if (event.text) apply?.(event.text)
    return
  }
  if (docId !== find.docId) return
  find.state = event.state
  notify()
  // Arkusz pod zrzutem też się przewinął.
  const slot = ui.panes.indexOf(docId)
  if (slot >= 0) refreshFrame(slot)
}

export function findLabel(): string {
  const { count, active, capped, failure } = find.state
  if (failure === 'pattern') return t('Błędne wyrażenie')
  if (failure === 'slow') return t('Zbyt wolne wyrażenie')
  if (!find.query.text.trim()) return ''
  if (count === 0) return t('Brak wyników')
  return t('{done} z {total}', { done: active, total: capped ? `${count}+` : count })
}
