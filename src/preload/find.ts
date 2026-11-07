import type { OverlayEvent } from '../shared/annotations'
import {
  closestSpan,
  createMatcher,
  type FindCommand,
  type FindState,
  MAX_MATCHES,
  needsPatternThread,
  NO_FIND,
  type SearchFailure,
  type TextQuery,
  type TextSnippet,
  type TextSpan
} from '../shared/textSearch'
import { normalizeText } from '../shared/textNormalize'
import { locateEnd, locateStart, type PageText, readPage } from './findText'
import { DOC_FOOT } from './overlay'

const ALL_MATCHES = 'bibliotter-find'
const CURRENT_MATCH = 'bibliotter-find-current'
/** Dokument potrafi przebudowywać się ciągle, a czytanie strony zajmuje chwilę. */
const REREAD_MS = 300
const EDGE = 16
/** Trafienie staje nieco nad środkiem, bo dół arkusza zajmuje dok. */
const LANDING = 0.4
const MAX_SEED = 200

/**
 * Podświetlenia nie dotykają DOM, więc dokument ich nie zauważa, a jego skrypty dalej działają.
 * Bursztyn, a nie pomarańcz, bo pomarańcz w apce znaczy tylko „czeka na Ciebie”. Tekst ma stały
 * kolor, żeby dokument o ciemnym tle nie położył jasnych liter na żółci.
 */
export const FIND_STYLE = `
  ::highlight(${ALL_MATCHES}) { color: #131316; background-color: rgb(255 226 120 / .78); }
  ::highlight(${CURRENT_MATCH}) { color: #131316; background-color: #ffb224; }
`

export interface FindBridge {
  send(event: OverlayEvent): void
  onCommand(listener: (command: FindCommand) => void): void
  /** Wyrażenie liczy się poza stroną, bo tu nie dałoby się go przerwać. */
  matchPattern(text: string, query: TextQuery): Promise<TextSpan[] | 'pattern' | 'slow'>
}

function scrollers(element: Element): HTMLElement[] {
  const list: HTMLElement[] = []
  for (let current = element.parentElement; current; current = current.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(current)
    const scrolls = (value: string): boolean => value === 'auto' || value === 'scroll'
    const tall = scrolls(overflowY) && current.scrollHeight > current.clientHeight
    const wide = scrolls(overflowX) && current.scrollWidth > current.clientWidth
    if (tall || wide) list.push(current)
  }
  return list
}

/** Trafienie może leżeć w przewijanej tabeli albo bloku kodu, a te mają własne przewijanie. */
function bringIntoBox(box: HTMLElement, range: Range): void {
  const area = box.getBoundingClientRect()
  const { top, bottom, left, right } = range.getBoundingClientRect()
  if (top < area.top || bottom > area.bottom) box.scrollTop += top - area.top - area.height * LANDING
  if (left < area.left || right > area.right) box.scrollLeft += left - area.left - area.width * LANDING
}

function reveal(range: Range): void {
  const start = range.startContainer.parentElement
  if (!start) return
  for (let current: Element | null = start; current; current = current.parentElement) {
    if (current instanceof HTMLDetailsElement) current.open = true
  }
  for (const box of scrollers(start)) bringIntoBox(box, range)
  const { top, bottom } = range.getBoundingClientRect()
  const roomy = innerHeight - DOC_FOOT
  if (top < EDGE || bottom > roomy - EDGE) {
    window.scrollBy({ top: top - roomy * LANDING, behavior: 'instant' })
  }
}

/** Numer pierwszego trafienia od góry ekranu, żeby pisanie nie zabierało czytanego miejsca. */
function firstOnScreen(count: number, rangeOf: (index: number) => Range): number {
  let low = 0
  let high = count
  while (low < high) {
    const middle = (low + high) >> 1
    if (rangeOf(middle).getBoundingClientRect().bottom < 0) low = middle + 1
    else high = middle
  }
  return low % count
}

function nearest(spans: TextSpan[], position: number): number {
  const at = spans.findIndex(({ start }) => start >= position)
  return at < 0 ? spans.length - 1 : at
}

/** Szukanie w dokumencie. Wynik wraca do powłoki jako zdarzenie warstwy. */
export function startFind({ send, onCommand, matchPattern }: FindBridge): void {
  let query: TextQuery | null = null
  /** Trafienie z panelu czeka na swój tekst, bo dokument może go dopiero zbudować. */
  let target: TextSnippet | null = null
  let page: PageText<Text> = { text: '', runs: [] }
  /** Czytanie strony jest najdroższe, a każda litera zapytania trafia na ten sam tekst. */
  let latest = page
  let stale = true
  let spans: TextSpan[] = []
  let active = -1
  let failure: SearchFailure | null = null
  let ticket = 0
  let timer = 0
  let reported = ''
  /** Obrazki rozpychają stronę, więc trafienie sprzed `load` przewijamy jeszcze raz. */
  let settling = false

  const rangeOf = (index: number): Range => {
    const range = document.createRange()
    const span = spans[index]
    const start = span && locateStart(page.runs, span.start)
    const end = span && locateEnd(page.runs, span.end)
    if (start && end) {
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
    }
    return range
  }

  const report = (): void => {
    const state: FindState = {
      count: spans.length,
      active: active + 1,
      capped: spans.length >= MAX_MATCHES,
      failure
    }
    const key = JSON.stringify(state)
    if (key === reported) return
    reported = key
    send({ type: 'find', state })
  }

  const paintCurrent = (): void => {
    if (active < 0) CSS.highlights.delete(CURRENT_MATCH)
    else {
      const current = new Highlight(rangeOf(active))
      current.priority = 1
      CSS.highlights.set(CURRENT_MATCH, current)
    }
  }

  const paint = (): void => {
    if (spans.length === 0) CSS.highlights.delete(ALL_MATCHES)
    else CSS.highlights.set(ALL_MATCHES, new Highlight(...spans.map((_, index) => rangeOf(index))))
    paintCurrent()
  }

  const present = (): void => {
    if (active < 0) return
    reveal(rangeOf(active))
    settling = document.readyState !== 'complete'
  }

  const search = async (text: string, wanted: TextQuery): Promise<TextSpan[] | SearchFailure> => {
    if (needsPatternThread(wanted)) {
      if (!wanted.text.trim()) return []
      return matchPattern(text, wanted)
    }
    try {
      const matcher = createMatcher(wanted)
      return matcher?.find(matcher.folded ? normalizeText(text) : text) ?? []
    } catch {
      return 'pattern'
    }
  }

  /** `moved` mówi, że użytkownik zmienił zapytanie, a nie że dokument zmienił się sam. */
  const run = async (moved: boolean): Promise<void> => {
    if (!query) return
    const own = (ticket += 1)
    if (stale) latest = readPage(document.body)
    stale = false
    const read = latest
    const found = await search(read.text, query)
    if (own !== ticket) return
    const before = spans[active]?.start ?? 0
    page = read
    failure = typeof found === 'string' ? found : null
    spans = typeof found === 'string' ? [] : found

    if (spans.length === 0) active = -1
    else if (target) active = closestSpan(page.text, spans, target)
    else if (moved) active = firstOnScreen(spans.length, rangeOf)
    else active = nearest(spans, before)

    paint()
    if ((moved || target) && spans.length > 0) present()
    if (spans.length > 0) target = null
    report()
  }

  const reread = (): void => {
    stale = true
    clearTimeout(timer)
    timer = window.setTimeout(() => void run(false), REREAD_MS)
  }

  const watcher = new MutationObserver(reread)

  const clear = (): void => {
    query = null
    target = null
    ticket += 1
    clearTimeout(timer)
    watcher.disconnect()
    spans = []
    active = -1
    failure = null
    page = { text: '', runs: [] }
    latest = page
    stale = true
    CSS.highlights.delete(ALL_MATCHES)
    CSS.highlights.delete(CURRENT_MATCH)
    reported = JSON.stringify(NO_FIND)
  }

  const watch = (): void => {
    watcher.disconnect()
    watcher.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'open']
    })
  }

  const step = (forward: boolean): void => {
    if (spans.length === 0) return
    active = (active + (forward ? 1 : -1) + spans.length) % spans.length
    paintCurrent()
    present()
    report()
  }

  onCommand((command) => {
    switch (command.type) {
      case 'set':
        query = command.query
        target = command.target ?? null
        watch()
        void run(true)
        break
      case 'step':
        step(command.forward)
        break
      case 'clear':
        clear()
        break
      case 'seed': {
        const text = (window.getSelection()?.toString() ?? '').replace(/\s+/g, ' ').trim()
        send({ type: 'find-seed', text: text.length > MAX_SEED ? '' : text })
      }
    }
  })

  window.addEventListener('load', () => {
    if (settling) present()
    settling = false
  })
}
