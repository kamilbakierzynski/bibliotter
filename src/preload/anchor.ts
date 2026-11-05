import type { Anchor } from '../shared/annotations'

const QUOTE_LENGTH = 160
const MATCH_LENGTH = 48

const clean = (text: string): string => text.replace(/\s+/g, ' ').trim()

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
  return parts.join(' > ')
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
  return clean(element.textContent ?? '').includes(quote.slice(0, MATCH_LENGTH))
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
