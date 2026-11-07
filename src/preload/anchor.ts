import type { Anchor } from '../shared/annotations'

const QUOTE_LENGTH = 160
const MATCH_LENGTH = 48
/** Dłuższych elementów nie przeszukujemy przy każdym rysowaniu cytatu. */
const MAX_QUOTE_SCOPE = 20_000

export const clean = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Zaznaczenie dokleja spacje na granicach części wzoru, których nie ma w tekście strony. */
const compact = (text: string): string => text.replace(/\s+/g, '')

/** Buduje selektor od najbliższego elementu z unikalnym `id`. */
export function cssPath(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element

  while (current && current !== document.documentElement) {
    if (current.id && document.querySelectorAll(`#${CSS.escape(current.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(current.id)}`)
      break
    }
    const tag = current.tagName.toLowerCase()
    const sameTag = current.parentElement
      ? [...current.parentElement.children].filter((sibling) => sibling.tagName === current?.tagName)
      : []
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})` : tag)
    current = current.parentElement
  }
  return parts.join(' > ') || 'html'
}

function precedingHeading(element: Element): string | null {
  let found: Element | null = null
  for (const heading of document.querySelectorAll('h1, h2, h3')) {
    const position = heading.compareDocumentPosition(element)
    const before = (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    const contains = (position & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0
    if (before || contains) found = heading
    else break
  }
  return found ? clean(found.textContent ?? '') || null : null
}

const elementText = (element: Element): string =>
  clean((element as HTMLElement).innerText ?? element.textContent ?? '')

export function createAnchor(element: Element, clientX: number, clientY: number, selected = ''): Anchor {
  const rect = element.getBoundingClientRect()
  return {
    selector: cssPath(element),
    offsetX: rect.width ? (clientX - rect.left) / rect.width : 0,
    offsetY: rect.height ? (clientY - rect.top) / rect.height : 0,
    quote: (clean(selected) || elementText(element)).slice(0, QUOTE_LENGTH),
    heading: precedingHeading(element)
  }
}

function matchesQuote(element: Element, quote: string): boolean {
  return compact(element.textContent ?? '').includes(compact(quote.slice(0, MATCH_LENGTH)))
}

function findByQuote(quote: string): Element | null {
  const needle = quote.slice(0, MATCH_LENGTH)
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (clean(node.textContent ?? '').includes(needle)) return node.parentElement
  }
  // Tekst może być podzielony na kilka węzłów, więc szukamy też w najmniejszym elemencie blokowym.
  const blocks = document.body.querySelectorAll('p, li, td, th, h1, h2, h3, h4, blockquote, figcaption')
  for (const block of blocks) {
    if (matchesQuote(block, needle)) return block
  }
  return null
}

/** Znajduje cytat w tekście elementu, pomijając różnice w białych znakach. */
export function findRange(root: Element, quote: string): Range | null {
  if ((root.textContent?.length ?? 0) > MAX_QUOTE_SCOPE) return null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const positions: [Text, number][] = []
  let text = ''
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (let index = 0; index < node.data.length; index++) {
      const char = node.data.charAt(index)
      if (/\s/.test(char)) continue
      text += char
      positions.push([node, index])
    }
  }
  const needle = compact(quote)
  const at = text.indexOf(needle)
  const start = positions[at]
  const end = positions[at + needle.length - 1]
  if (at < 0 || !start || !end) return null
  const range = document.createRange()
  range.setStart(start[0], start[1])
  range.setEnd(end[0], end[1] + 1)
  return range
}

/** Odnajduje miejsce uwagi. Zwraca null, gdy treści nie ma już w dokumencie. */
export function resolveAnchor(anchor: Anchor): Element | null {
  let element: Element | null = null
  try {
    element = document.querySelector(anchor.selector)
  } catch {
    // Selektor ze starszej wersji dokumentu może być niepoprawny.
  }
  if (!anchor.quote) return element
  if (element && matchesQuote(element, anchor.quote)) return element
  return findByQuote(anchor.quote)
}
