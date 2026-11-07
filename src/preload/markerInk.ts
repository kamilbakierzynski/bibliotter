import type { OverlayEvent, OverlayItem, StickyColor } from '../shared/annotations'
import { clean, createAnchor, findRange } from './anchor'
import { chiselPath, decodeLine, encodeLine, type Line, lineOf, nearLine, textBands } from './markerStroke'
import { Trail } from './presenterTrail'

/*
 * Tusz zakreślacza. Mnożenie musi widzieć dokument, więc warstwa nie może tworzyć kontekstu
 * nakładania jak pinezki: jej host nie ma `z-index`, a linie stają w kontekście strony.
 *
 * Linie położone jednym ciągiem są jednym zakreśleniem. Trafiają na dysk dopiero po chwili
 * bez rysowania, a do czasu odpowiedzi apki zostają na arkuszu jako szkic.
 *
 * Odręczna linia pasuje do dokumentu tylko przy szerokości, w której powstała. W innej tekst
 * przelewa się inaczej, więc zakreślenie kładzie się po wierszach swojego tekstu.
 */

const SVG = 'http://www.w3.org/2000/svg'
const INK_LAYER = 2147483646
/** Tyle czeka zakreślenie na kolejną linię, np. następny wiersz akapitu. */
const GROUP_MS = 900
/** Dalej od zakreślenia zaczyna się nowe. */
const GROUP_REACH = 170
/** Krótsza linia to tylko kliknięcie. */
const MIN_LENGTH = 12
const ERASE_REACH = 14
const MAX_GROUP_NUMBERS = 12_000
/** Tyle punktów linii wystarcza, żeby rozpoznać element i tekst pod nią. */
const MAX_SAMPLES = 48
/** Więcej nie przyjmie zapis. */
const MAX_QUOTE = 2000
/** Tło jaśniejsze od tej luminancji to papier, na którym tusz się mnoży. */
const PAPER_LUMINANCE = 0.42

export const INK_STYLE = `
  * { box-sizing: border-box; }
  .yellow { --ink: #ffe83a; }
  .green { --ink: #86f06a; }
  .pink { --ink: #ff8ac6; }
  .blue { --ink: #74d3ff; }
  .ink, .sheen {
    position: absolute; top: 0; left: 0; width: 1px; height: 1px;
    overflow: visible; z-index: ${INK_LAYER}; pointer-events: none;
  }
  .ink { mix-blend-mode: multiply; }
  .ink.hidden { display: none; }
  .ink path {
    fill: var(--ink); stroke: var(--ink); stroke-width: 5px; stroke-linejoin: round;
    opacity: .78; transition: opacity .34s ease-out;
  }
  .ink.wet path, .ink.picked path { opacity: 1; }
  .ink.wet path { transition: none; }
  /* Na ciemnym tle tusz nie ma czego mnożyć, więc świeci. */
  .ink.night { mix-blend-mode: screen; }
  .ink.night path { opacity: .3; }
  .ink.night.wet path, .ink.night.picked path { opacity: .46; }
  .sheen path {
    fill: none; stroke: #fff; stroke-width: 15px; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: .1 3; opacity: .58; filter: blur(4px);
    animation: sheen .82s cubic-bezier(.3, .1, .3, 1) both;
  }
  @keyframes sheen { from { stroke-dashoffset: .1; } to { stroke-dashoffset: -1.1; } }
  @media (prefers-reduced-motion: reduce) {
    .sheen { display: none; }
    .ink path { transition: none; }
  }
`

interface Group {
  color: StickyColor
  lines: Line[]
  element: SVGSVGElement
  path: SVGPathElement
  /** Pole skończonych linii. Rysowana dochodzi w każdej klatce, bo ślad układa także starsze punkty. */
  d: string
}

interface Mark {
  item: OverlayItem
  element: SVGSVGElement
  path: SVGPathElement
  /** Linie w pikselach względem elementu kotwicy. */
  lines: Line[]
  width: number
  height: number
  left: number
  top: number
}

export interface Ink {
  host: HTMLElement
  setColor(color: StickyColor): void
  begin(x: number, y: number, time: number): void
  extend(x: number, y: number, time: number): void
  /** Rysuje to, co przyszło od ostatniej klatki. Ścieżkę parsuje się w całości, więc nie przy każdym ruchu. */
  paint(): void
  end(): void
  /** Zapisuje zakreślenie, nie czekając na następną linię. */
  flush(): void
  show(items: OverlayItem[]): void
  /** Układa linie i zwraca koniec ostatniej, bo tam stoi znacznik zakreślenia. */
  place(id: string, target: Element | null): { x: number; y: number } | null
  /** Po ułożeniu zapisanych linii chowa ich szkice, żeby nie było klatki bez tuszu. */
  settle(): void
  select(id: string | null): void
  /** Tło dokumentu mogło się zmienić razem z motywem. */
  retone(): void
  eraseAt(x: number, y: number): void
}

function inkLayer(color: StickyColor | null): { element: SVGSVGElement; path: SVGPathElement } {
  const element = document.createElementNS(SVG, 'svg')
  const path = document.createElementNS(SVG, 'path')
  element.setAttribute('class', `ink ${color ?? 'yellow'}`)
  element.setAttribute('aria-hidden', 'true')
  element.append(path)
  return { element, path }
}

/** Czy tusz leży na ciemnym tle. Dokument bez tła to biała kartka. */
export function onDarkBackground(element: Element | null): boolean {
  for (let node = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor
    if (!color.startsWith('rgb')) continue
    const [red = 0, green = 0, blue = 0, alpha = 1] = (color.match(/[\d.]+/g) ?? []).map(Number)
    if (alpha < 0.5) continue
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 < PAPER_LUMINANCE
  }
  return false
}

function sharedAncestor(first: Element, second: Element): Element {
  let element = first
  while (!element.contains(second) && element.parentElement) element = element.parentElement
  return element
}

/** Punkty linii w układzie okna, nie więcej niż `MAX_SAMPLES`. */
function samplesOf(lines: Line[]): [number, number][] {
  const points = lines.flatMap((line) => {
    const list: [number, number][] = []
    for (let i = 0; i + 1 < line.length; i += 2) {
      list.push([(line[i] as number) - scrollX, (line[i + 1] as number) - scrollY])
    }
    return list
  })
  const every = Math.max(1, Math.ceil(points.length / MAX_SAMPLES))
  return points.filter((_, index) => index % every === 0 || index === points.length - 1)
}

function caretAt(x: number, y: number, hit: Element | null): Range | null {
  const caret = document.caretRangeFromPoint(x, y)
  // Poza tekstem przeglądarka podaje najbliższe słowo, a to nie jest to, co leży pod linią.
  return caret?.startContainer.nodeType === Node.TEXT_NODE && hit?.contains(caret.startContainer) ? caret : null
}

/** Tekst pod zakreśleniem, od pierwszego do ostatniego dotkniętego słowa. */
function textUnder(samples: [number, number][], elementAt: (x: number, y: number) => Element | null): string {
  let first: Range | null = null
  let last: Range | null = null
  for (const [x, y] of samples) {
    const caret = caretAt(x, y, elementAt(x, y))
    if (!caret) continue
    if (!first || caret.compareBoundaryPoints(Range.START_TO_START, first) < 0) first = caret
    if (!last || caret.compareBoundaryPoints(Range.START_TO_START, last) > 0) last = caret
  }
  if (!first || !last) return ''
  const range = document.createRange()
  const start = first.startContainer as Text
  const end = last.startContainer as Text
  const before = start.data.slice(0, first.startOffset).search(/\S*$/)
  const after = end.data.slice(last.startOffset).search(/\s|$/)
  range.setStart(start, before)
  range.setEnd(end, last.startOffset + after)
  return range.toString()
}

export function createInk(
  send: (event: OverlayEvent) => void,
  elementAt: (x: number, y: number) => Element | null
): Ink {
  const host = document.createElement('bibliotter-ink')
  host.style.cssText = 'all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none;'
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = INK_STYLE
  root.append(style)

  const marks = new Map<string, Mark>()
  let known = new Set<string>()
  let color: StickyColor = 'yellow'
  let open: Group | null = null
  let line: Trail | null = null
  let dirty = false
  let timer = 0
  let picked: string | null = null
  /** Szkice czekające na zapis, w kolejności wysłania. */
  const saving: SVGSVGElement[] = []
  const retiring: SVGSVGElement[] = []

  const startGroup = (x: number, y: number): Group => {
    const { element, path } = inkLayer(color)
    element.classList.toggle('night', onDarkBackground(elementAt(x, y)))
    root.append(element)
    return { color, lines: [], element, path, d: '' }
  }

  const reaches = (group: Group, x: number, y: number): boolean =>
    group.color === color && group.lines.some((points) => nearLine(points, x, y, GROUP_REACH))

  const flush = (): void => {
    clearTimeout(timer)
    const group = open
    open = null
    if (!group) return
    if (group.lines.length === 0) {
      group.element.remove()
      return
    }
    const samples = samplesOf(group.lines)
    const hits = samples.flatMap(([x, y]) => elementAt(x, y) ?? [])
    const common = hits.reduce<Element | null>((all, hit) => (all ? sharedAncestor(all, hit) : hit), null)
    const scope = common && common !== document.documentElement ? common : document.body
    const rect = scope.getBoundingClientRect()
    const element = rect.width > 0 && rect.height > 0 ? scope : document.documentElement
    const box = element.getBoundingClientRect()
    const [endX, endY] = samples.at(-1) as [number, number]
    const strokes = group.lines.map((points) =>
      encodeLine(points, box.left + scrollX, box.top + scrollY, Math.max(box.width, 1), Math.max(box.height, 1))
    )
    // Pusty cytat znaczy, że pod linią nie ma tekstu, np. wykres. Taka linia zawsze skaluje się z elementem.
    const quote = clean(textUnder(samples, elementAt)).slice(0, MAX_QUOTE)
    saving.push(group.element)
    send({
      type: 'highlight',
      color: group.color,
      anchor: { ...createAnchor(element, endX, endY), quote },
      strokes,
      anchorWidth: box.width
    })
  }

  /** Błysk biegnie raz po świeżej linii, jak światło po mokrym tuszu. */
  const glint = (trail: Trail): void => {
    const element = document.createElementNS(SVG, 'svg')
    const path = document.createElementNS(SVG, 'path')
    element.setAttribute('class', 'sheen')
    element.setAttribute('aria-hidden', 'true')
    path.setAttribute('pathLength', '1')
    path.setAttribute('d', trail.d)
    path.addEventListener('animationend', () => element.remove())
    element.append(path)
    root.append(element)
  }

  const linesOf = ({ anchor, anchorWidth, strokes }: OverlayItem, target: Element, rect: DOMRect): Line[] => {
    const reflowed = anchorWidth !== undefined && Math.abs(rect.width - anchorWidth) >= 1
    const range = reflowed && anchor.quote ? findRange(target, anchor.quote) : null
    if (!range) return (strokes ?? []).map((stroke) => decodeLine(stroke, rect.width, rect.height))
    return textBands(range.getClientRects()).map((band) =>
      band.map((value, i) => value - (i % 2 === 0 ? rect.left : rect.top))
    )
  }

  return {
    host,
    setColor(next) {
      if (next !== color) flush()
      color = next
    },
    begin(x, y, time) {
      clearTimeout(timer)
      const pageX = x + scrollX
      const pageY = y + scrollY
      if (open && !reaches(open, pageX, pageY)) flush()
      open ??= startGroup(x, y)
      open.element.classList.add('wet')
      line = new Trail(pageX, pageY, time)
      dirty = true
    },
    extend(x, y, time) {
      line?.add(x + scrollX, y + scrollY, time)
      dirty = true
    },
    paint() {
      if (!dirty || !open || !line) return
      dirty = false
      open.path.setAttribute('d', open.d + chiselPath(lineOf(line)))
    },
    end() {
      if (!line || !open) return
      const finished = line
      line = null
      dirty = false
      finished.finish()
      if (finished.length >= MIN_LENGTH) {
        const points = lineOf(finished)
        open.lines.push(points)
        open.d += chiselPath(points)
        glint(finished)
      }
      open.path.setAttribute('d', open.d)
      open.element.classList.remove('wet')
      const numbers = open.lines.reduce((sum, points) => sum + points.length, 0)
      if (numbers > MAX_GROUP_NUMBERS) flush()
      else timer = window.setTimeout(flush, GROUP_MS)
    },
    flush,
    show(items) {
      const highlights = items.filter((item) => item.kind === 'highlight')
      const fresh = highlights.filter((item) => !known.has(item.id)).length
      retiring.push(...saving.splice(0, fresh))
      known = new Set(highlights.map((item) => item.id))
      for (const mark of marks.values()) mark.element.remove()
      marks.clear()
      for (const item of highlights) {
        const { element, path } = inkLayer(item.color)
        element.classList.toggle('picked', item.id === picked)
        root.append(element)
        marks.set(item.id, { item, element, path, lines: [], width: 0, height: 0, left: 0, top: 0 })
      }
    },
    place(id, target) {
      const mark = marks.get(id)
      if (!mark) return null
      const rect = target?.getBoundingClientRect()
      const visible = target && rect !== undefined && (rect.width > 0 || rect.height > 0)
      mark.element.classList.toggle('hidden', !visible)
      if (!visible) return null
      if (rect.width !== mark.width || rect.height !== mark.height) {
        mark.width = rect.width
        mark.height = rect.height
        mark.lines = linesOf(mark.item, target, rect)
        mark.path.setAttribute('d', mark.lines.map(chiselPath).join(''))
        mark.element.classList.toggle('night', onDarkBackground(target))
      }
      mark.left = rect.left + scrollX
      mark.top = rect.top + scrollY
      mark.element.style.translate = `${mark.left}px ${mark.top}px`
      const end = mark.lines.at(-1) ?? []
      return end.length < 2 ? null : { x: mark.left + (end.at(-2) as number), y: mark.top + (end.at(-1) as number) }
    },
    settle() {
      for (const element of retiring.splice(0)) element.remove()
    },
    select(id) {
      picked = id
      for (const [itemId, mark] of marks) mark.element.classList.toggle('picked', itemId === id)
    },
    retone() {
      for (const mark of marks.values()) mark.width = 0
    },
    eraseAt(x, y) {
      const pageX = x + scrollX
      const pageY = y + scrollY
      if (open?.lines.some((points) => nearLine(points, pageX, pageY, ERASE_REACH))) {
        clearTimeout(timer)
        open.element.remove()
        open = null
        return
      }
      for (const { item, element, lines, left, top } of [...marks.values()].reverse()) {
        if (element.classList.contains('hidden')) continue
        if (!lines.some((points) => nearLine(points, pageX - left, pageY - top, ERASE_REACH))) continue
        // Notatka to czyjaś praca, więc zakreślenie z notatką usuwa się w jego wątku.
        if (!item.label) send({ type: 'erase', id: item.id })
        return
      }
    }
  }
}
