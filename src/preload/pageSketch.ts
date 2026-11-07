/*
 * Szkic strony dla minimapy. Zamiast zrzutu bierzemy układ: każdą linię tekstu jako pasek,
 * nagłówki, bloki kodu i obrazy jako prostokąty. Szkic nie zależy od kolorów dokumentu, więc
 * minimapa mówi językiem apki, a skrypty dokumentu niczego nie widzą, bo to tylko odczyt układu.
 *
 * Długi dokument ma dziesiątki tysięcy węzłów tekstu, więc praca idzie porcjami między klatkami.
 */

export const TEXT = 0
export const HEAD = 1
export const CODE = 2

export const MEDIA = 0
export const CODE_BLOCK = 1
export const RULE = 2

/** Po pięć liczb na element: x, y, szerokość, wysokość i rodzaj, w układzie strony. */
export interface Sketch {
  lines: number[]
  blocks: number[]
  /** Lewa i prawa krawędź treści. Minimapa pokazuje tylko ten pas, więc wąska kolumna nie ginie. */
  left: number
  right: number
}

export const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]'
const MEDIA_SELECTOR = 'img,svg,canvas,video,iframe,embed,object'
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'OPTION', 'TITLE'])
const SLICE_MS = 6
const MAX_NODES = 60000
const MAX_BLOCKS = 3000
/** Ikona w tekście to nie obraz, a na minimapie byłaby tylko szumem. */
const MIN_MEDIA = 14

const idle = (): Promise<void> =>
  new Promise((done) => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => done(), { timeout: 120 })
    else setTimeout(done, 16)
  })

function kindOf(element: Element | null, cache: Map<Element, number>): number {
  if (!element) return TEXT
  const known = cache.get(element)
  if (known !== undefined) return known
  const kind = element.closest(HEADING_SELECTOR) ? HEAD : element.closest('pre') ? CODE : TEXT
  cache.set(element, kind)
  return kind
}

/** Prostokąt w układzie strony: lewa, górna, prawa i dolna krawędź. */
export interface Box {
  l: number
  t: number
  r: number
  b: number
}

const EVERYWHERE: Box = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity }

/**
 * To, co z elementu naprawdę widać. Długa linia kodu w przewijanym bloku ma prostokąt daleko
 * za blokiem, a niewidoczny dymek przypisu nadal ma układ. Bez przycięcia jedno i drugie
 * udawałoby treść pod minimapą. `null` znaczy, że elementu nie widać wcale. Elementy ze `skip`
 * i wszystko w nich też nie liczą się do szkicu, np. przyklejony pasek nawigacji.
 */
export function makeClipper(skip?: ReadonlySet<Element>): (element: Element | null) => Box | null {
  const clips = new Map<Element, Box | null>()
  const clipOf = (element: Element | null): Box | null => {
    if (!element || element === document.body || element === document.documentElement) return EVERYWHERE
    const known = clips.get(element)
    if (known !== undefined) return known
    let box = skip?.has(element) ? null : clipOf(element.parentElement)
    if (box) {
      const style = getComputedStyle(element)
      if (style.visibility !== 'visible' || style.opacity === '0') {
        box = null
      } else if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        const rect = element.getBoundingClientRect()
        box = intersect(box, { l: rect.left + scrollX, t: rect.top + scrollY, r: rect.right + scrollX, b: rect.bottom + scrollY })
      }
    }
    clips.set(element, box)
    return box
  }
  return clipOf
}

function intersect(a: Box, b: Box): Box | null {
  const box = { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) }
  return box.r - box.l > 0.5 && box.b - box.t > 0.5 ? box : null
}

/** Prostokąt z okna strony przycięty do tego, co widać, w układzie strony. */
export function visiblePart(rect: DOMRect, clip: Box | null): Box | null {
  return clip ? intersect(clip, { l: rect.left + scrollX, t: rect.top + scrollY, r: rect.right + scrollX, b: rect.bottom + scrollY }) : null
}

function collectBlocks(root: Element, out: number[], clipOf: (element: Element | null) => Box | null): void {
  const push = (element: Element, kind: number): void => {
    if (out.length >= MAX_BLOCKS * 5) return
    const box = visiblePart(element.getBoundingClientRect(), clipOf(element))
    if (!box || box.r - box.l < 1 || box.b - box.t < 1) return
    out.push(box.l, box.t, box.r - box.l, box.b - box.t, kind)
  }
  for (const element of root.querySelectorAll('pre')) push(element, CODE_BLOCK)
  for (const element of root.querySelectorAll('hr')) push(element, RULE)
  for (const element of root.querySelectorAll(MEDIA_SELECTOR)) {
    // Rysunek z wielu kształtów to jeden obraz, a nie sto.
    if (element.parentElement?.closest('svg')) continue
    const rect = element.getBoundingClientRect()
    if (rect.width < MIN_MEDIA || rect.height < MIN_MEDIA) continue
    push(element, MEDIA)
  }
}

/** Zwraca `null`, gdy w trakcie zaczął się nowszy szkic. */
export async function sketchPage(stale: () => boolean, skip?: ReadonlySet<Element>): Promise<Sketch | null> {
  const root = document.body ?? document.documentElement
  const lines: number[] = []
  const blocks: number[] = []
  const kinds = new Map<Element, number>()
  const clipOf = makeClipper(skip)
  const range = document.createRange()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      // Własne warstwy apki są w zamkniętym Shadow DOM, więc tutaj ich nie ma.
      if (!parent || SKIP.has(parent.tagName)) return NodeFilter.FILTER_REJECT
      return (node as Text).data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })

  let count = 0
  let sliceStart = performance.now()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (++count > MAX_NODES) break
    const clip = clipOf(node.parentElement)
    if (!clip) continue
    const kind = kindOf(node.parentElement, kinds)
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) {
      const box = visiblePart(rect, clip)
      if (!box) continue
      const x = box.l
      const y = box.t
      const width = box.r - box.l
      const height = box.b - box.t
      // Tekst złożony z kilku węzłów, np. z linkiem w środku, to jedna linia.
      const at = lines.length - 5
      if (
        at >= 0 &&
        lines[at + 4] === kind &&
        Math.abs((lines[at + 1] ?? 0) - y) < 2 &&
        Math.abs((lines[at + 3] ?? 0) - height) < 3 &&
        x - ((lines[at] ?? 0) + (lines[at + 2] ?? 0)) < 8 &&
        x >= (lines[at] ?? 0)
      ) {
        lines[at + 2] = x + width - (lines[at] ?? 0)
        continue
      }
      lines.push(x, y, width, height, kind)
    }
    if (performance.now() - sliceStart > SLICE_MS) {
      await idle()
      if (stale()) return null
      sliceStart = performance.now()
    }
  }
  if (stale()) return null
  collectBlocks(root, blocks, clipOf)

  let left = Infinity
  let right = -Infinity
  for (const list of [lines, blocks]) {
    for (let i = 0; i < list.length; i += 5) {
      left = Math.min(left, list[i] ?? 0)
      right = Math.max(right, (list[i] ?? 0) + (list[i + 2] ?? 0))
    }
  }
  if (!Number.isFinite(left)) return { lines, blocks, left: 0, right: document.documentElement.clientWidth }
  return { lines, blocks, left: Math.max(0, left), right }
}
