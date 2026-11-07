/*
 * Tekst strony tak, jak go widać: bez znaczników i ze zwiniętymi białymi znakami. Fraza może
 * przechodzić przez kilka węzłów, np. `<b>`, więc szukamy w jednym ciągu, a pozycje wracają
 * do węzłów przez listę odcinków.
 */

export interface TextRun<Node> {
  /** Gdzie odcinek zaczyna się w ciągu. */
  at: number
  node: Node
  /** Gdzie zaczyna się w węźle. */
  offset: number
  length: number
}

export interface PageText<Node> {
  text: string
  runs: TextRun<Node>[]
}

export class TextBuilder<Node> {
  private readonly parts: string[] = []
  private readonly runs: TextRun<Node>[] = []
  private length = 0
  /** Ciąg nie może zacząć się spacją ani mieć dwóch pod rząd. */
  private spaced = true

  add(node: Node, data: string): void {
    for (const { 0: piece, index } of data.matchAll(/\s+|\S+/g)) {
      const blank = /\s/.test(piece.charAt(0))
      if (blank && this.spaced) continue
      const size = blank ? 1 : piece.length
      this.runs.push({ at: this.length, node, offset: index, length: size })
      this.parts.push(blank ? ' ' : piece)
      this.length += size
      this.spaced = blank
    }
  }

  /** Granica bloku to spacja, której nie ma w żadnym węźle. */
  gap(): void {
    if (this.spaced) return
    this.parts.push(' ')
    this.length += 1
    this.spaced = true
  }

  finish(): PageText<Node> {
    return { text: this.parts.join(''), runs: this.runs }
  }
}

function runIndex<Node>(runs: TextRun<Node>[], position: number): number {
  let low = 0
  let high = runs.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if ((runs[middle] as TextRun<Node>).at <= position) low = middle
    else high = middle - 1
  }
  return low
}

/** Znak na początku trafienia. Na spacji między blokami to początek następnego odcinka. */
export function locateStart<Node>(runs: TextRun<Node>[], position: number): { node: Node; offset: number } | null {
  const index = runIndex(runs, position)
  const run = runs[index]
  if (!run) return null
  if (position < run.at + run.length) return { node: run.node, offset: run.offset + position - run.at }
  const next = runs[index + 1]
  return next ? { node: next.node, offset: next.offset } : { node: run.node, offset: run.offset + run.length }
}

/** Miejsce tuż za ostatnim znakiem trafienia. */
export function locateEnd<Node>(runs: TextRun<Node>[], position: number): { node: Node; offset: number } | null {
  const run = runs[runIndex(runs, position - 1)]
  if (!run) return null
  return { node: run.node, offset: run.offset + Math.min(position - run.at, run.length) }
}

/** Wzór ma ukrytą kopię dla czytników ekranu, a pól formularza nie da się podświetlić. */
const UNREADABLE = 'script, style, noscript, template, textarea, select, .katex-mathml'

/** Przeglądarka chowa treść zwiniętego `<details>`, ale znajdzie ją i rozwinie, tak samo jak my. */
function isReadable(element: Element): boolean {
  if (element.closest(UNREADABLE)) return false
  if (element.checkVisibility({ visibilityProperty: true })) return true
  const closed = element.closest('details:not([open])')
  return closed?.parentElement ? isReadable(closed.parentElement) : false
}

function blockOf(element: Element, blocks: Map<Element, Element>): Element {
  const known = blocks.get(element)
  if (known) return known
  const { display } = getComputedStyle(element)
  const parent = element.parentElement
  const flows = (display.startsWith('inline') || display === 'contents') && parent
  const block = flows ? blockOf(parent, blocks) : element
  blocks.set(element, block)
  return block
}

export function readPage(root: Element): PageText<Text> {
  const builder = new TextBuilder<Text>()
  const readable = new Map<Element, boolean>()
  const blocks = new Map<Element, Element>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let block: Element | null = null
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement
    if (!parent || !node.data) continue
    let shown = readable.get(parent)
    if (shown === undefined) {
      shown = isReadable(parent)
      readable.set(parent, shown)
    }
    if (!shown) continue
    const owner = blockOf(parent, blocks)
    if (owner !== block) builder.gap()
    block = owner
    builder.add(node, node.data)
  }
  return builder.finish()
}
