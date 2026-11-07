import { MAX_HEADING_TEXT, MAX_OUTLINE, type OutlineHeading } from '../shared/outline'
import { HEADING_SELECTOR } from './pageSketch'

/*
 * Spis treści to nagłówki, które widać. Element zostaje tutaj, a do powłoki idzie tylko poziom
 * i tekst, więc skok po spisie nie potrzebuje kotwic ani identyfikatorów w dokumencie.
 */

export interface Heading extends OutlineHeading {
  element: Element
  /** Góra nagłówka w układzie strony. */
  top: number
}

/** Znak kotwicy, który generatory doklejają do nagłówka, nie jest jego treścią. */
const PERMALINK = /^[#¶§🔗]\s*|\s*[#¶§🔗]$/gu

/**
 * Tekst nagłówka bez gubienia spacji między częściami. Numer rozdziału w osobnym `span`
 * dałby w `textContent` „1Biała kartka”, więc między elementami wstawiamy odstęp.
 */
function textOf(element: Element): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let text = ''
  let lastParent: Element | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    if (parent && (parent.closest('script, style, template') || parent.getClientRects().length === 0)) continue
    const data = (node as Text).data
    if (lastParent && parent !== lastParent && !/\s$/.test(text) && !/^\s/.test(data)) text += ' '
    text += data
    lastParent = parent
  }
  return text.replace(/\s+/g, ' ').replace(PERMALINK, '').trim().slice(0, MAX_HEADING_TEXT)
}

function levelOf(element: Element): number {
  const tag = /^h([1-6])$/i.exec(element.tagName)
  if (tag) return Number(tag[1])
  const aria = Number(element.getAttribute('aria-level'))
  return Number.isInteger(aria) && aria >= 1 && aria <= 6 ? aria : 2
}

export function collectHeadings(): Heading[] {
  const root = document.body ?? document.documentElement
  const list: Heading[] = []
  for (const element of root.querySelectorAll(HEADING_SELECTOR)) {
    if (list.length >= MAX_OUTLINE) break
    // Nagłówek w nagłówku, np. `h2` z `role="heading"` w środku, liczy się raz.
    if (element.parentElement?.closest(HEADING_SELECTOR)) continue
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    const text = textOf(element)
    if (!text) continue
    list.push({ element, level: levelOf(element), text, top: rect.top + scrollY })
  }
  // Dokument z własnym układem może ustawić nagłówki w innej kolejności niż w kodzie.
  return list.sort((a, b) => a.top - b.top)
}

/** Ostatni nagłówek nad linią czytania. Linia stoi w górnej części okna, tam gdzie zaczyna się czytanie. */
export function headingAt(headings: readonly Heading[], y: number): number {
  let low = 0
  let high = headings.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if ((headings[middle]?.top ?? 0) <= y) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

export const sameOutline = (a: readonly OutlineHeading[], b: readonly OutlineHeading[]): boolean =>
  a.length === b.length && a.every((heading, i) => heading.level === b[i]?.level && heading.text === b[i]?.text)
