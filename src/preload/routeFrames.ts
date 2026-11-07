import type { Anchor, FractionBox, OverlayEvent } from '../shared/annotations'
import type { PickKind, RouteFrame, StepCamera, StepRest } from '../shared/presentation'
import { blockOf, createAnchor, resolveAnchor, resolvePlace } from './anchor'

/*
 * Kadry trasy w dokumencie. Gdy formularz trasy jest otwarty, przerywana ramka pokazuje, co
 * kamera weźmie w wybranym kroku, a warstwa sprawdza, czy kadry wszystkich kroków wciąż mają
 * swoje elementy. Ramka leży na stronie, więc przewija się z nią i rośnie pod zoomem kamery.
 *
 * Wskazywanie kadru: Miejsce to kliknięcie, a ramka przed kliknięciem obejmuje element pod
 * kursorem, bo kamera weźmie cały element. Obszar to przeciągnięcie, jak przy kształcie.
 *
 * W prezentacji ta sama warstwa kładzie maskę: jeden prostokąt wokół kadru, którego cień
 * przykrywa resztę strony. Przygaszenie i ukrycie różnią się tylko kryciem cienia. Maska nie ma
 * przejścia, bo zmienia się między zrzutami kamery i przenika razem z jej przelotem.
 */

/** Krótsze przeciągnięcie to tylko kliknięcie, a z kliknięcia nie powstaje obszar. */
const MIN_AREA = 12
/** Maska odsuwa się od kadru o tyle pikseli strony, żeby nie cięła treści przy samej krawędzi. */
const MASK_ROOM = 10

export const ROUTE_STYLE = `
  .route { position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none; }
  .frame {
    position: absolute; box-sizing: border-box; border-radius: calc(6px * var(--unzoom, 1));
    border: calc(1.5px * var(--unzoom, 1)) dashed rgb(24 24 27 / .72);
    box-shadow: 0 0 0 calc(1px * var(--unzoom, 1)) rgb(255 255 255 / .75), inset 0 0 0 calc(1px * var(--unzoom, 1)) rgb(255 255 255 / .75);
    transition: left .34s cubic-bezier(.2, 1, .3, 1), top .34s cubic-bezier(.2, 1, .3, 1),
      width .34s cubic-bezier(.2, 1, .3, 1), height .34s cubic-bezier(.2, 1, .3, 1), opacity .2s;
  }
  .frame.hidden { opacity: 0; }
  .frame.aim { background: rgb(24 24 27 / .05); transition: none; }
  .frame .tag {
    position: absolute; left: calc(-1.5px * var(--unzoom, 1)); bottom: 100%; margin-bottom: calc(5px * var(--unzoom, 1));
    padding: 2px 7px; color: #fff; font: 500 11px/1.45 system-ui, sans-serif; white-space: nowrap;
    background: rgb(24 24 27 / .84); border-radius: 6px; transform-origin: 0 100%; scale: var(--unzoom, 1);
  }
  .frame .tag:empty { display: none; }
  .mask {
    position: absolute; border-radius: calc(8px * var(--unzoom, 1));
    box-shadow: 0 0 0 200000px rgb(14 14 17 / .62);
  }
  .mask.hide { box-shadow: 0 0 0 200000px rgb(14 14 17); }
  .mask.hidden { display: none; }
`

interface Point {
  x: number
  y: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface RouteMask {
  camera: StepCamera | null
  rest: StepRest
}

export interface RouteFrames {
  element: HTMLDivElement
  /** Maska leży osobno, pod kształtami i karteczkami, bo to, co krok pokazuje, ma być widać w całości. */
  mask: HTMLDivElement
  setRoute(route: { frames: RouteFrame[]; selected: string | null } | null): void
  /** Maska prezentacji wokół kadru. `null` ją zdejmuje. */
  setMask(mask: RouteMask | null): void
  /** Element kadru i jego prostokąt w układzie okna strony. `null`, gdy kadru nie ma albo go nie widać. */
  spot(camera: StepCamera | null): { element: Element; rect: Rect } | null
  setPick(kind: PickKind | null): void
  picking(): boolean
  press(event: PointerEvent): void
  move(x: number, y: number, held: boolean): void
  cancel(): void
  layout(): void
}

/** Prostokąt elementu na stronie, a `null`, gdy elementu nie widać. */
function pageRect(element: Element): Rect | null {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height }
}

function within(rect: Rect, box: FractionBox): Rect {
  return {
    x: rect.x + box.x * rect.width,
    y: rect.y + box.y * rect.height,
    width: Math.max(box.width * rect.width, 1),
    height: Math.max(box.height * rect.height, 1)
  }
}

function setBox(node: HTMLElement, rect: Rect): void {
  node.style.left = `${rect.x}px`
  node.style.top = `${rect.y}px`
  node.style.width = `${rect.width}px`
  node.style.height = `${rect.height}px`
}

const anchorOf = (camera: StepCamera): Anchor | null => (camera.kind === 'hold' ? null : camera.anchor)

/** Element kadru. Obszar liczy się w ułamkach swojego elementu, a Miejsce bierze cały blok. */
const frameElement = (camera: StepCamera): Element | null =>
  camera.kind === 'hold' ? null : camera.kind === 'place' ? resolvePlace(camera.anchor) : resolveAnchor(camera.anchor)

export function createRouteFrames(
  send: (event: OverlayEvent) => void,
  elementAt: (x: number, y: number) => Element | null
): RouteFrames {
  const element = document.createElement('div')
  element.className = 'route'
  const shown = document.createElement('div')
  shown.className = 'frame hidden'
  const tag = document.createElement('span')
  tag.className = 'tag'
  shown.append(tag)
  const aim = document.createElement('div')
  aim.className = 'frame aim hidden'
  const cover = document.createElement('div')
  cover.className = 'mask hidden'
  element.append(shown, aim)

  let route: { frames: RouteFrame[]; selected: string | null } | null = null
  const targets = new Map<string, Element | null>()
  /** Świeża warstwa, np. po przeładowaniu, zgłasza stan od razu, także pusty. */
  let lastMissing: string | null = null
  let pick: PickKind | null = null
  /** Początek przeciągania obszaru w pikselach strony. */
  let start: Point | null = null
  let mask: RouteMask | null = null
  let maskTarget: { key: string; element: Element | null } | null = null

  const hideAim = (): void => {
    aim.classList.add('hidden')
    start = null
  }

  const targetOf = (frame: RouteFrame): Element | null => {
    if (frame.camera.kind === 'hold') return null
    let target = targets.get(frame.id) ?? null
    if (!target?.isConnected) {
      target = frameElement(frame.camera)
      targets.set(frame.id, target)
    }
    return target
  }

  /** Obszar w kotwicy elementu pod jego środkiem, w ułamkach tego elementu. */
  const areaCamera = (from: Point, to: Point): StepCamera | null => {
    const left = Math.min(from.x, to.x) - scrollX
    const top = Math.min(from.y, to.y) - scrollY
    const width = Math.abs(to.x - from.x)
    const height = Math.abs(to.y - from.y)
    if (width < MIN_AREA || height < MIN_AREA) return null
    const centerX = left + width / 2
    const centerY = top + height / 2
    const hit = elementAt(centerX, centerY) ?? document.body
    const box = hit.getBoundingClientRect()
    const host = box.width > 0 && box.height > 0 ? hit : document.documentElement
    const rect = host.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      kind: 'area',
      anchor: createAnchor(host, centerX, centerY),
      box: {
        x: (left - rect.left) / rect.width,
        y: (top - rect.top) / rect.height,
        width: width / rect.width,
        height: height / rect.height
      }
    }
  }

  const layoutMask = (): void => {
    const camera = mask && mask.rest !== 'normal' ? mask.camera : null
    const anchor = camera ? anchorOf(camera) : null
    let rect: Rect | null = null
    if (camera && anchor) {
      const key = JSON.stringify(anchor)
      if (maskTarget?.key !== key || !maskTarget.element?.isConnected) {
        maskTarget = { key, element: frameElement(camera) }
      }
      const box = maskTarget.element ? pageRect(maskTarget.element) : null
      rect = box && camera.kind === 'area' ? within(box, camera.box) : box
    }
    // Kadr, którego nie ma w dokumencie, nie zasłania niczego, bo widzowie zobaczyliby pustą ciemność.
    cover.classList.toggle('hidden', rect === null)
    cover.classList.toggle('hide', mask?.rest === 'hide')
    if (rect) {
      setBox(cover, {
        x: rect.x - MASK_ROOM,
        y: rect.y - MASK_ROOM,
        width: rect.width + 2 * MASK_ROOM,
        height: rect.height + 2 * MASK_ROOM
      })
    }
  }

  const layout = (): void => {
    layoutMask()
    const missing: string[] = []
    let selectedRect: Rect | null = null
    let selectedLabel = ''
    for (const frame of route?.frames ?? []) {
      if (frame.camera.kind === 'hold') continue
      const target = targetOf(frame)
      const rect = target ? pageRect(target) : null
      if (!target) missing.push(frame.id)
      if (frame.id !== route?.selected || !rect) continue
      selectedRect = frame.camera.kind === 'area' ? within(rect, frame.camera.box) : rect
      selectedLabel = frame.label
    }
    shown.classList.toggle('hidden', selectedRect === null)
    if (selectedRect) setBox(shown, selectedRect)
    tag.textContent = selectedLabel
    const key = missing.join(' ')
    if (route && key !== lastMissing) {
      lastMissing = key
      send({ type: 'route-missing', ids: missing })
    }
  }

  return {
    element,
    mask: cover,
    setRoute(next) {
      const known = new Map((route?.frames ?? []).map((frame) => [frame.id, JSON.stringify(frame.camera)]))
      route = next
      // Kotwica kroku mogła się zmienić, więc jego element trzeba znaleźć od nowa.
      for (const frame of next?.frames ?? []) {
        if (known.get(frame.id) !== JSON.stringify(frame.camera)) targets.delete(frame.id)
      }
      if (!next) {
        targets.clear()
        lastMissing = null
      }
      layout()
    },
    setMask(next) {
      mask = next
      if (!next) maskTarget = null
      layoutMask()
    },
    spot(camera) {
      const element = camera ? frameElement(camera) : null
      const box = element?.getBoundingClientRect()
      if (!camera || !element || !box || (box.width === 0 && box.height === 0)) return null
      const rect = { x: box.left, y: box.top, width: box.width, height: box.height }
      return { element, rect: camera.kind === 'area' ? within(rect, camera.box) : rect }
    },
    setPick(kind) {
      pick = kind
      hideAim()
    },
    picking: () => pick !== null,
    press(event) {
      if (!pick || event.button !== 0) return
      const down = event.type === 'pointerdown'
      if (pick === 'place') {
        if (down) return
        const hit = elementAt(event.clientX, event.clientY)
        if (!hit) return
        hideAim()
        const place = blockOf(hit)
        send({ type: 'route-pick', camera: { kind: 'place', anchor: createAnchor(place, event.clientX, event.clientY) } })
        return
      }
      if (down) {
        start = { x: event.clientX + scrollX, y: event.clientY + scrollY }
        return
      }
      if (!start) return
      const camera = areaCamera(start, { x: event.clientX + scrollX, y: event.clientY + scrollY })
      hideAim()
      if (camera) send({ type: 'route-pick', camera })
    },
    move(x, y, held) {
      if (pick === 'place') {
        const hit = elementAt(x, y)
        const rect = hit ? pageRect(blockOf(hit)) : null
        aim.classList.toggle('hidden', rect === null)
        if (rect) setBox(aim, rect)
        return
      }
      if (pick !== 'area' || !start) return
      if (!held) {
        hideAim()
        return
      }
      const now = { x: x + scrollX, y: y + scrollY }
      aim.classList.remove('hidden')
      setBox(aim, {
        x: Math.min(start.x, now.x),
        y: Math.min(start.y, now.y),
        width: Math.abs(now.x - start.x),
        height: Math.abs(now.y - start.y)
      })
    },
    cancel: hideAim,
    layout
  }
}
