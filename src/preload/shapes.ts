import type { Anchor, OverlayEvent, OverlayItem, Shape, ShapeTool, StickyColor } from '../shared/annotations'
import { createAnchor, resolveAnchor } from './anchor'
import { onDarkBackground } from './markerInk'
import { constrain, inkLength, type InkStroke, inkPath, nearInk, partialStrokes, type Point, shapeStrokes } from './shapeInk'

/*
 * Kształty w dokumencie: strzałki, prostokąty, elipsy i linie. Należą do dokumentu jak
 * karteczki, więc leżą na stronie i przewijają się z nią, a pod zoomem kamery rosną razem z treścią.
 *
 * Przeciągnięcie pokazuje od razu równy kształt. Po puszczeniu kształt dostaje kotwice: prostokąt
 * i elipsa w elemencie pod swoim środkiem, a linia i strzałka na obu końcach. Do czasu odpowiedzi
 * apki szkic zostaje na stronie, żeby nie było klatki bez tuszu.
 *
 * W prezentacji kształt kroku czeka schowany, aż kamera stanie, a potem rysuje się wzdłuż swojej
 * linii, w tempie pióra. Kto woli mniej ruchu w systemie, dostaje gotowy kształt od razu.
 */

const SVG = 'http://www.w3.org/2000/svg'
/** Tak blisko linii musi trafić prawy przycisk, żeby usunąć kształt. */
const ERASE_REACH = 10
/** Pióro w prezentacji jedzie z tą prędkością w pikselach strony na milisekundę. */
const PEN_SPEED = 2
const PEN_MIN_MS = 240
const PEN_MAX_MS = 600

export const SHAPE_STYLE = `
  .shapes { position: absolute; top: 0; left: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  .shapes.off { display: none; }
  .shape { fill: var(--shape); }
  .shape.hidden, .shape.pending { display: none; }
  .shape.wet { opacity: .88; }
  /* Te same nazwy co karteczki, w ciemniejszym tuszu, żeby linia była czytelna na papierze. */
  .shape.yellow { --shape: #b07012; }
  .shape.blue { --shape: #1d5fa6; }
  .shape.green { --shape: #2c7a3a; }
  .shape.pink { --shape: #b5306a; }
  .shape.night.yellow { --shape: #f1c35a; }
  .shape.night.blue { --shape: #86b9f2; }
  .shape.night.green { --shape: #8fd486; }
  .shape.night.pink { --shape: #f293bd; }
`

interface Placed {
  item: OverlayItem
  path: SVGPathElement
  target: Element | null
  end: Element | null
  strokes: InkStroke[]
  key: string
}

interface Draft {
  tool: ShapeTool
  path: SVGPathElement
  /** Początek w pikselach strony, bo dokument może się przewinąć w trakcie. */
  start: Point
  /** Kotwica początku linii i strzałki, wzięta w chwili wciśnięcia. */
  startAnchor: Anchor | null
  current: Point
  shift: boolean
}

export interface Shapes {
  element: SVGSVGElement
  setTool(tool: ShapeTool | null): void
  setVisible(on: boolean): void
  begin(x: number, y: number, shift: boolean): void
  /** `held` mówi, czy lewy przycisk jest wciśnięty, bo puszczenie mogło umknąć dokumentowi. */
  move(x: number, y: number, held: boolean, shift: boolean): void
  end(x: number, y: number, shift: boolean): void
  cancel(): void
  eraseAt(x: number, y: number): void
  show(items: OverlayItem[]): void
  /** Kształty prezentacji, które czekają na narysowanie. */
  setPending(ids: readonly string[]): void
  /** Rysuje kształty na oczach widzów. */
  drawOn(ids: readonly string[]): void
  layout(): void
  /** Po ułożeniu zapisanych kształtów chowa ich szkice. */
  settle(): void
}

const pageOf = (x: number, y: number): Point => ({ x: x + scrollX, y: y + scrollY })

/** Pióro przyspiesza na starcie i zwalnia przed końcem kształtu. */
const easePen = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const calm = matchMedia('(prefers-reduced-motion: reduce)')

function pathOf(color: StickyColor | null): SVGPathElement {
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('class', `shape ${color ?? 'yellow'}`)
  return path
}

/** Punkt kotwicy na stronie. */
function anchorPoint(element: Element, anchor: Anchor): Point | null {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { x: rect.left + scrollX + anchor.offsetX * rect.width, y: rect.top + scrollY + anchor.offsetY * rect.height }
}

/** Końce kształtu na stronie albo `null`, gdy jego elementów nie widać. */
function endsOf(shape: Shape, anchor: Anchor, target: Element, end: Element | null): [Point, Point] | null {
  if (!('box' in shape)) {
    const from = anchorPoint(target, anchor)
    const to = end ? anchorPoint(end, shape.end) : null
    return from && to ? [from, to] : null
  }
  const rect = target.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  const x = rect.left + scrollX + shape.box.x * rect.width
  const y = rect.top + scrollY + shape.box.y * rect.height
  return [
    { x, y },
    { x: x + shape.box.width * rect.width, y: y + shape.box.height * rect.height }
  ]
}

export function createShapes(
  send: (event: OverlayEvent) => void,
  elementAt: (x: number, y: number) => Element | null
): Shapes {
  const element = document.createElementNS(SVG, 'svg')
  element.setAttribute('class', 'shapes')
  element.setAttribute('aria-hidden', 'true')

  let tool: ShapeTool | null = null
  let draft: Draft | null = null
  const placed = new Map<string, Placed>()
  let known = new Set<string>()
  /** Szkice czekające na zapis, w kolejności wysłania. */
  const saving: SVGPathElement[] = []
  const retiring: SVGPathElement[] = []
  let pending = new Set<string>()
  /** Kształty w trakcie rysowania i chwila, w której pióro ruszyło. `null` czeka na geometrię. */
  const drawing = new Map<string, { start: number | null; duration: number }>()
  let pen = 0

  const tick = (now: number): void => {
    pen = 0
    for (const [id, run] of drawing) {
      const shape = placed.get(id)
      if (!shape) {
        drawing.delete(id)
        continue
      }
      // Kształt bez ułożonych końców czeka, aż warstwa go zmierzy.
      if (shape.strokes.length === 0) continue
      if (run.start === null) {
        run.start = now
        run.duration = Math.min(PEN_MAX_MS, Math.max(PEN_MIN_MS, inkLength(shape.strokes) / PEN_SPEED))
      }
      const t = Math.min(1, (now - run.start) / run.duration)
      shape.path.setAttribute('d', inkPath(partialStrokes(shape.strokes, easePen(t))))
      if (t >= 1) drawing.delete(id)
    }
    if (drawing.size > 0) pen = requestAnimationFrame(tick)
  }

  const target = (draft: Draft): Point => (draft.shift ? constrain(draft.tool.type, draft.start, draft.current) : draft.current)

  const drawDraft = (): void => {
    if (!draft) return
    draft.path.setAttribute('d', inkPath(shapeStrokes(draft.tool.type, draft.start, target(draft))))
  }

  const cancel = (): void => {
    draft?.path.remove()
    draft = null
  }

  /** Kotwica pudełka: element pod środkiem kształtu i pudełko w ułamkach tego elementu. */
  const boxAnchor = (type: 'rect' | 'ellipse', from: Point, to: Point): { anchor: Anchor; shape: Shape } | null => {
    const centerX = (from.x + to.x) / 2 - scrollX
    const centerY = (from.y + to.y) / 2 - scrollY
    const hit = elementAt(centerX, centerY) ?? document.body
    const box = hit.getBoundingClientRect()
    const host = box.width > 0 && box.height > 0 ? hit : document.documentElement
    const rect = host.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const left = Math.min(from.x, to.x) - scrollX
    const top = Math.min(from.y, to.y) - scrollY
    return {
      anchor: createAnchor(host, centerX, centerY),
      shape: {
        type,
        box: {
          x: (left - rect.left) / rect.width,
          y: (top - rect.top) / rect.height,
          width: Math.abs(to.x - from.x) / rect.width,
          height: Math.abs(to.y - from.y) / rect.height
        }
      }
    }
  }

  const finish = (): void => {
    const current = draft
    draft = null
    if (!current) return
    const to = target(current)
    const strokes = shapeStrokes(current.tool.type, current.start, to)
    if (strokes.length === 0) {
      current.path.remove()
      return
    }
    current.path.classList.remove('wet')
    const type = current.tool.type
    let event: { anchor: Anchor; shape: Shape } | null = null
    if (type === 'arrow' || type === 'line') {
      const endHit = elementAt(to.x - scrollX, to.y - scrollY)
      if (current.startAnchor && endHit) {
        event = {
          anchor: current.startAnchor,
          shape: { type, end: createAnchor(endHit, to.x - scrollX, to.y - scrollY) }
        }
      }
    } else {
      event = boxAnchor(type, current.start, to)
    }
    if (!event) {
      current.path.remove()
      return
    }
    saving.push(current.path)
    send({ type: 'shape', color: current.tool.color, anchor: event.anchor, shape: event.shape })
  }

  return {
    element,
    setTool(next) {
      tool = next
      if (!next) cancel()
    },
    setVisible(on) {
      element.classList.toggle('off', !on)
    },
    begin(x, y, shift) {
      if (!tool) return
      cancel()
      const start = pageOf(x, y)
      const hit = elementAt(x, y)
      const path = pathOf(tool.color)
      path.classList.add('wet', ...(onDarkBackground(hit) ? ['night'] : []))
      element.append(path)
      draft = { tool, path, start, startAnchor: hit ? createAnchor(hit, x, y) : null, current: start, shift }
    },
    move(x, y, held, shift) {
      if (!draft) return
      draft.current = pageOf(x, y)
      draft.shift = shift
      if (!held) finish()
      else drawDraft()
    },
    end(x, y, shift) {
      if (!draft) return
      draft.current = pageOf(x, y)
      draft.shift = shift
      finish()
    },
    cancel,
    eraseAt(x, y) {
      const { x: pageX, y: pageY } = pageOf(x, y)
      for (const { item, path, strokes } of [...placed.values()].reverse()) {
        if (path.classList.contains('hidden') || !nearInk(strokes, pageX, pageY, ERASE_REACH)) continue
        send({ type: 'erase', id: item.id })
        return
      }
    },
    show(items) {
      const shapes = items.filter((item) => item.kind === 'shape' && item.shape)
      const fresh = shapes.filter((item) => !known.has(item.id)).length
      retiring.push(...saving.splice(0, fresh))
      known = new Set(shapes.map((item) => item.id))
      for (const shape of placed.values()) shape.path.remove()
      placed.clear()
      for (const item of shapes) {
        const path = pathOf(item.color)
        path.classList.toggle('pending', pending.has(item.id))
        // Szkic leży na wierzchu, więc zapisane kształty wchodzą pod niego.
        element.insertBefore(path, draft?.path ?? null)
        placed.set(item.id, { item, path, target: null, end: null, strokes: [], key: '' })
      }
    },
    setPending(ids) {
      pending = new Set(ids)
      for (const [id, shape] of placed) shape.path.classList.toggle('pending', pending.has(id))
    },
    drawOn(ids) {
      for (const id of ids) {
        pending.delete(id)
        const shape = placed.get(id)
        if (!shape) continue
        shape.path.classList.remove('pending')
        if (calm.matches) continue
        drawing.set(id, { start: null, duration: PEN_MIN_MS })
        // Do pierwszej klatki pióra kształt jest pusty, żeby nie mignął gotowy.
        shape.path.setAttribute('d', '')
        shape.key = ''
      }
      if (drawing.size > 0 && pen === 0) pen = requestAnimationFrame(tick)
    },
    layout() {
      for (const shape of placed.values()) {
        const { item } = shape
        const geometry = item.shape as Shape
        if (!shape.target?.isConnected) shape.target = resolveAnchor(item.anchor)
        if ('end' in geometry && !shape.end?.isConnected) {
          shape.end = resolveAnchor(geometry.end)
        }
        const ends = shape.target ? endsOf(geometry, item.anchor, shape.target, shape.end) : null
        shape.path.classList.toggle('hidden', ends === null)
        if (!ends) continue
        const [from, to] = ends
        const key = `${from.x.toFixed(1)} ${from.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`
        if (key === shape.key) continue
        shape.key = key
        shape.strokes = shapeStrokes(geometry.type, from, to)
        // Rysowany kształt dostaje tusz od pióra, a nie cały naraz.
        if (!drawing.has(item.id)) shape.path.setAttribute('d', inkPath(shape.strokes))
        shape.path.classList.toggle('night', onDarkBackground(shape.target))
      }
    },
    settle() {
      for (const path of retiring.splice(0)) path.remove()
    }
  }
}
