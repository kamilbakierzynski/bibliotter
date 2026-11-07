import {
  type Anchor,
  type NoteKind,
  OVERLAY_KEYS,
  STEP_KEYS,
  type OverlayEvent,
  type OverlayItem,
  type OverlayKey,
  type OverlayMode,
  type OverlayRect,
  type ShapeTool,
  type StickyColor
} from '../shared/annotations'
import type { PickKind, PresentState, RouteFrame } from '../shared/presentation'
import { blockOf, createAnchor, findRange, resolveAnchor } from './anchor'
import { createMarker, MARKER_STYLE } from './marker'
import { createInk } from './markerInk'
import { createNoteLift, type Point } from './noteLift'
import { createPresenter, PRESENTER_STYLE } from './presenter'
import { createRouteFrames, ROUTE_STYLE } from './routeFrames'
import { createSelectionMenu, SELECTION_MENU_STYLE } from './selectionMenu'
import { createShapes, SHAPE_STYLE } from './shapes'
import { onScreen, onZoom, zoom } from './zoom'

export const MAX_Z_INDEX = '2147483647'
/** Wysokość doku nad dołem arkusza i oddech nad nim. */
export const DOC_FOOT = 84
const FOOT_WAIT_MS = 150
/** Arkusz Markdownu zmienia tło płynnie, więc ton tuszu czytamy po przejściu. */
const THEME_SETTLE_MS = 480
/** Odstęp szkicu nowej uwagi od kadru i od brzegu ekranu, w pikselach ekranu. */
const DRAFT_ROOM = 14
/** Rozmiary pinezki i karteczki na ekranie, z `.pin` i `.note` niżej. */
const PIN_SIZE = 24
const NOTE_W = 148
const NOTE_H = 40
/** Tytuł kroku z zaznaczenia to początek cytatu. */
const STEP_TITLE = 60

/*
 * Pinezki i karteczki należą do języka apki, a nie dokumentu. Dokument ma własne fonty,
 * więc warstwa używa kroju systemowego, a resztę bierze z makiety.
 *
 * Kamera powiększa całą stronę, a znaczniki mają zostać w swoim rozmiarze. Dlatego każdy skaluje
 * się o `--unzoom` wokół punktu, którym wskazuje miejsce w dokumencie.
 */
const STYLE = `
  * { box-sizing: border-box; }
  .pin, .note, .draft, .ghost {
    position: absolute; top: 0; left: 0; scale: var(--unzoom, 1);
    font: 500 12px/1.35 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
    pointer-events: auto; cursor: pointer; user-select: none;
  }
  .pin, .draft {
    display: grid; place-items: center;
    width: 24px; height: 24px; margin: -24px 0 0 -1px; transform-origin: 1px 24px;
    color: #fff; font-size: 11px; font-weight: 600;
    background: #131316; border-radius: 50% 50% 50% 4px;
    box-shadow: 0 0 0 1.5px #fff, 0 4px 10px rgb(0 0 0 / 24%);
    transition: scale .36s cubic-bezier(.2, 1.3, .3, 1), background-color .3s;
  }
  .pin.waiting { background: #f0480a; }
  .pin.me { color: #131316; background: #fff; box-shadow: 0 0 0 1px rgb(0 0 0 / 16%), 0 4px 10px rgb(0 0 0 / 16%); }
  .pin:hover { scale: calc(var(--unzoom, 1) * 1.12); }
  .pin.selected { scale: calc(var(--unzoom, 1) * 1.2); }
  .still > * { transition: none !important; }
  .draft { pointer-events: none; visibility: hidden; }
  .draft.shown { visibility: visible; animation: drop .32s cubic-bezier(.2, 1.3, .3, 1); }
  .draft.sticky {
    display: block; width: 148px; height: 40px; margin: 0; transform-origin: 0 0; rotate: 1.3deg;
    background: #f7e7a0; border-radius: 3px 3px 14px 3px;
    box-shadow: 0 1px 1px rgb(0 0 0 / 5%), 0 12px 18px -8px rgb(0 0 0 / 24%);
  }
  .draft.sticky.blue { background: #cfe3f7; }
  .draft.sticky.green { background: #d4ebcc; }
  .draft.sticky.pink { background: #f7d5df; }
  @media (prefers-reduced-motion: reduce) { .draft.shown { animation: none; } }
  @keyframes drop { from { opacity: 0; transform: translateY(-14px) scale(.7); } to { opacity: 1; transform: none; } }
  .note {
    width: 148px; min-height: 40px; max-height: 108px; padding: 10px 12px 14px;
    overflow: hidden; color: #3a3312; overflow-wrap: anywhere; white-space: pre-line; text-align: left;
    border-radius: 3px 3px 14px 3px; rotate: 1.3deg; transform-origin: 0 0;
    box-shadow: 0 1px 1px rgb(0 0 0 / 5%), 0 12px 18px -8px rgb(0 0 0 / 24%);
    transition: rotate .42s cubic-bezier(.2, 1.3, .3, 1), scale .42s cubic-bezier(.2, 1.3, .3, 1);
    background: linear-gradient(315deg, transparent calc(var(--curl, 0px) * .7071),
      var(--paper) calc(var(--curl, 0px) * .7071 + .6px));
  }
  .note.yellow { --paper: #f7e7a0; }
  .note.blue { --paper: #cfe3f7; }
  .note.green { --paper: #d4ebcc; }
  .note.pink { --paper: #f7d5df; }
  .note:hover, .note.selected { rotate: 0deg; scale: calc(var(--unzoom, 1) * 1.02); }
  /*
   * Odklejony róg zawija się nad kartkę. Za linią zgięcia papier jest przezroczysty (gradient tła wyżej,
   * pod kątem 45°), więc widać tam stronę, a na nią pada cień uniesionej kartki i klapki. Ten cień
   * oddziela zgięcie od strony; przycięcie zabierało go razem z rogiem i na białej stronie zgięcie
   * znikało, a róg czytał się jak jaśniejszy kwadrat. Klapka to odwrotna strona papieru: jaśniejsza
   * na czubku i ciemniejsza tam, gdzie papier zawija się w zgięcie. Jej cień pada w dół, jak cień
   * kartki, bo w górę i w lewo obrysowywał boki rogu. Wielkość daje --curl z modułu ruchu,
   * a --peel rozjaśnia dół kartki, który odszedł od strony.
   */
  .note::before {
    content: ''; position: absolute; right: 0; bottom: 0; pointer-events: none;
    width: var(--curl, 0px); height: var(--curl, 0px); border-top-left-radius: 3px;
    background: linear-gradient(135deg, color-mix(in oklab, var(--paper, #f7e7a0), #fff 24%) 0%,
      color-mix(in oklab, var(--paper, #f7e7a0), #000 3%) 30%, color-mix(in oklab, var(--paper, #f7e7a0), #000 13%) 45%,
      color-mix(in oklab, var(--paper, #f7e7a0), #000 24%) calc(50% - .6px), transparent 50%);
    filter: drop-shadow(.5px 1.5px 1.5px rgb(0 0 0 / 26%));
  }
  .note::after {
    content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    opacity: var(--peel, 0);
    background: linear-gradient(180deg, transparent 45%, rgb(0 0 0 / 4%) 70%, rgb(255 255 255 / 26%) 100%);
    mask: linear-gradient(315deg, transparent calc(var(--curl, 0px) * .7071), #000 calc(var(--curl, 0px) * .7071 + .6px));
  }
  .lifted { z-index: 1; }
  .lifted.held { cursor: grabbing; }
  .lifted.carried { pointer-events: none; }
  .hidden { display: none; }
  .quote {
    position: absolute; top: 0; left: 0; pointer-events: none;
    background: linear-gradient(0deg, rgb(238 186 80 / 36%), rgb(238 186 80 / 36%)) no-repeat 0 92% / 100% 42%;
    transition: background-size .52s cubic-bezier(.2, .9, .25, 1);
  }
  .quote.selected { background-size: 100% 92%; }
  .catcher {
    position: fixed; inset: 0; display: none;
    pointer-events: auto; cursor: crosshair; background: transparent;
  }
  .catcher.active { display: block; }
  .highlight {
    position: fixed; display: none; pointer-events: none;
    background: rgb(128 128 128 / 7%); border-radius: 3px;
    box-shadow: 0 0 0 1px rgb(128 128 128 / 28%);
  }
  .ghost { display: none; position: fixed; pointer-events: none; }
  .ghost.on { display: block; }
  .ghost.comment {
    width: 24px; height: 24px; margin: -24px 0 0 -1px; transform-origin: 1px 24px; opacity: .92;
    background: #131316; border-radius: 50% 50% 50% 4px;
    box-shadow: 0 0 0 1.5px #fff, 0 4px 10px rgb(0 0 0 / 24%);
  }
  .ghost.sticky {
    width: 34px; height: 34px; margin: -30px 0 0 6px; transform-origin: -6px 30px; rotate: -4deg;
    background: #f7e7a0; border-radius: 3px 3px 12px 3px;
    box-shadow: 0 8px 14px -6px rgb(0 0 0 / 30%);
  }
`

const POINTER_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu'
] as const

export interface PointerGuard {
  /** Gdy jest ustawione, wszystkie kliknięcia trafiają tutaj zamiast do dokumentu. */
  onClick: ((event: MouseEvent) => void) | null
  /** Wciśnięcie i puszczenie przycisku, gdy dokument nie dostaje kliknięć. */
  onPress: ((event: PointerEvent) => void) | null
  /** Element warstwy. Kliknięcia pinezek też nie dochodzą do dokumentu. */
  overlay: Element | null
  onOverlayClick: ((event: MouseEvent) => void) | null
  /** Wciśnięcie i puszczenie na znaczniku, gdy dokument dostaje kliknięcia. */
  onOverlayPress: ((event: PointerEvent) => void) | null
}

/**
 * Trzeba wywołać przed skryptami dokumentu. Tylko nasłuch na `window` w fazie przechwytywania,
 * dodany jako pierwszy, zatrzyma też delegowane obsługi kliknięć na `document` i `window`.
 */
export function guardPointerEvents(): PointerGuard {
  const guard: PointerGuard = { onClick: null, onPress: null, overlay: null, onOverlayClick: null, onOverlayPress: null }
  for (const type of POINTER_EVENTS) {
    window.addEventListener(
      type,
      (event) => {
        const handler = guard.onClick ?? (event.target === guard.overlay ? guard.onOverlayClick : null)
        if (!handler || !event.isTrusted) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (event.type === 'click') handler(event as MouseEvent)
        else if (event.type === 'pointerdown' || event.type === 'pointerup') {
          ;(guard.onClick ? guard.onPress : guard.onOverlayPress)?.(event as PointerEvent)
        }
      },
      true
    )
  }
  return guard
}

export interface OverlayBridge {
  send(event: OverlayEvent): void
  /** Arkusz pliku nie ma gdzie zapisać uwag, więc menu zaznaczenia ich nie proponuje. */
  takesNotes?: () => boolean
  onMode(listener: (mode: OverlayMode) => void): void
  onItems(listener: (items: OverlayItem[]) => void): void
  onFocus(listener: (id: string | null) => void): void
  onTrack(listener: (on: boolean) => void): void
  onPointer(listener: (on: boolean) => void): void
  /** Kolor włącza zakreślacz, a `null` go wyłącza. */
  onMarker(listener: (color: StickyColor | null) => void): void
  onPointerWithdraw(listener: () => void): void
  /** Narzędzie kształtu włącza rysowanie, a `null` je wyłącza. */
  onShaper(listener: (tool: ShapeTool | null) => void): void
  /** Przełącznik rysunków nad arkuszem. */
  onDrawings(listener: (visible: boolean) => void): void
  /** Kadry trasy przy otwartym formularzu. `null` je chowa. */
  onRoute(listener: (route: { frames: RouteFrame[]; selected: string | null } | null) => void): void
  /** Formularz trasy czeka na wskazanie kadru. */
  onPick(listener: (kind: PickKind | null) => void): void
  /** Krok prezentacji. `null` wraca do zwykłego widoku. */
  onPresent(listener: (state: PresentState | null) => void): void
  /** Szkic nowej uwagi w prezentacji, który staje przy kadrze kroku. */
  onPlace(listener: (request: { kind: 'comment' | 'sticky'; color: StickyColor }) => void): void
  /** Uwaga odkleja się i idzie za kursorem do kliknięcia. `null` odkłada ją na miejsce. */
  onCarry(listener: (id: string | null) => void): void
  /** Chowa kursor systemowy na czas prezentacji. */
  setPresenting(on: boolean): void
  /** Celownik zamiast kursora, gdy przeciągnięcie rysuje kształt. */
  setDrawing(on: boolean): void
}

function openAncestors(element: Element): void {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current instanceof HTMLDetailsElement) current.open = true
  }
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/** Prostokąty idą do powłoki, a ta widzi ekran widoku, także pod powiększeniem. */
const toRect = ({ x, y, width, height }: DOMRect): OverlayRect => onScreen({ x, y, width, height })

/** Ta sama kotwica po drodze przez proces główny, który przycina i sprawdza jej pola. */
function sameSpot(a: Anchor, b: Anchor): boolean {
  const near = (x: number, y: number): boolean => Math.abs(Math.min(1, Math.max(0, x)) - y) < 0.001
  return a.selector === b.selector && near(a.offsetX, b.offsetX) && near(a.offsetY, b.offsetY)
}

const isMovable = (item: OverlayItem | undefined): item is OverlayItem & { kind: 'comment' | 'sticky' } =>
  item !== undefined && (item.kind === 'comment' || item.kind === 'sticky')

const contains = (rect: DOMRect, { x, y }: Point): boolean =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

/** Cytat to zaznaczony tekst. Kliknięcie zapisuje początek elementu, a tego nie podkreślamy. */
function isSelectedQuote(element: Element, quote: string): boolean {
  if (!quote) return false
  const text = (element as HTMLElement).innerText ?? element.textContent ?? ''
  return !text.replace(/\s+/g, ' ').trim().startsWith(quote)
}

/**
 * Warstwa z pinezkami. Działa w odizolowanym świecie i w zamkniętym Shadow DOM, więc skrypty
 * dokumentu nie widzą treści uwag. Tekst trafia tu tylko przez `textContent`.
 */
/** Wiersze menu zaznaczenia, które tworzą uwagę albo krok prezentacji. */
const NOTE_ACTIONS = new Set(['comment', 'sticky', 'highlight', 'step'])

export function startOverlay(bridge: OverlayBridge, guard: PointerGuard): void {
  const host = document.createElement('bibliotter-overlay')
  host.style.cssText = `all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: ${MAX_Z_INDEX}; pointer-events: none;`
  const root = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = STYLE + SHAPE_STYLE + ROUTE_STYLE + MARKER_STYLE + PRESENTER_STYLE + SELECTION_MENU_STYLE
  const quotes = document.createElement('div')
  const layer = document.createElement('div')
  const highlight = document.createElement('div')
  highlight.className = 'highlight'
  const catcher = document.createElement('div')
  catcher.className = 'catcher'
  const ghost = document.createElement('div')
  ghost.className = 'ghost'
  const presenter = createPresenter()
  const ink = createInk(bridge.send, (x, y) => elementAt(x, y))
  const marker = createMarker(ink)
  const shapes = createShapes(bridge.send, (x, y) => elementAt(x, y))
  const route = createRouteFrames(bridge.send, (x, y) => elementAt(x, y))
  // Kształty leżą pod pinezkami, żeby nie zasłaniały wejścia do wątku. Kadr trasy leży nad nimi,
  // a maska prezentacji pod nimi, żeby to, co krok pokazuje, nie znikało za jej krawędzią.
  root.append(
    style,
    quotes,
    route.mask,
    shapes.element,
    route.element,
    layer,
    highlight,
    catcher,
    ghost,
    presenter.ink,
    presenter.element,
    marker.element
  )
  document.documentElement.append(host, ink.host)

  // Dok pływa nad dołem arkusza, więc dokument dostaje zapas, żeby koniec treści wyszedł spod niego.
  const foot = document.createElement('bibliotter-foot')
  foot.style.cssText = `all: initial; position: absolute; left: 0; width: 1px; height: ${DOC_FOOT}px; visibility: hidden; pointer-events: none;`
  document.documentElement.append(foot)
  let footTimer = 0
  const placeFoot = (): void => {
    footTimer = 0
    foot.style.display = 'none'
    const end = document.documentElement.scrollHeight
    foot.style.display = 'block'
    foot.style.top = `${end}px`
  }
  const scheduleFoot = (): void => {
    if (footTimer === 0) footTimer = window.setTimeout(placeFoot, FOOT_WAIT_MS)
  }
  placeFoot()

  let items: OverlayItem[] = []
  let mode: OverlayMode = null
  let selectedId: string | null = null
  let pendingFocus: string | null = null
  let reportFocus: string | null = null
  let draft: { element: Element; anchor: Anchor; node: HTMLElement } | null = null
  let lastOrphans = ''
  let frame = 0
  let tracking = false
  let lastPositions = ''
  let pointing = false
  let marking = false
  let shaping = false
  let picking = false
  /** Krok prezentacji. Dokument pokazuje wtedy tylko uwagi, które krok wskazał. */
  let present: PresentState | null = null
  /**
   * Uwagi, które przyszły w trakcie prezentacji. Powłoka dopisze je do kroku, ale jej stan przychodzi
   * chwilę po nich, a do tego czasu nowa pinezka zgasłaby na oczach widzów.
   */
  const fresh = new Set<string>()
  /** Kolor karteczki, którą szkic prezentacji pokazuje od razu. */
  let draftColor: StickyColor = 'yellow'
  let drawingsOn = true
  /** Ostatnia pozycja myszy, bo Shift może zmienić kształt, gdy mysz stoi. */
  let lastPointer = { x: 0, y: 0, held: false }
  let unzoom = 1
  /** Pierwsza lista uwag po wczytaniu to stan dokumentu, a nie nowe uwagi do przyklejenia. */
  let seeded = false

  const nodes = new Map<string, HTMLElement>()
  const targets = new Map<string, Element | null>()
  const ranges = new Map<string, Range | null>()
  const bars = new Map<string, HTMLElement[]>()

  const itemOf = (id: string): OverlayItem | undefined => items.find((item) => item.id === id)

  const targetOf = (item: OverlayItem): Element | null => {
    let target = targets.get(item.id) ?? null
    if (!target?.isConnected) {
      target = resolveAnchor(item.anchor)
      targets.set(item.id, target)
    }
    return target
  }

  const anchorPoint = (item: OverlayItem, target: Element | null | undefined): Point | null => {
    if (!target?.isConnected) return null
    const rect = target.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return null
    return { x: rect.left + item.anchor.offsetX * rect.width, y: rect.top + item.anchor.offsetY * rect.height }
  }

  /** Obrys elementu, na który trafi uwaga, jak przy stawianiu nowej. */
  const outline = (element: Element | null): void => {
    if (!element) {
      highlight.style.display = 'none'
      return
    }
    const rect = element.getBoundingClientRect()
    Object.assign(highlight.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    })
  }

  /**
   * Nowa kotwica w miejscu, w którym uwaga spadła. Komentarz do zaznaczonego tekstu przesunięty
   * w obrębie swojego akapitu dalej mówi o tym samym tekście, więc zachowuje cytat.
   */
  const moveTo = (id: string, at: Point): void => {
    const item = itemOf(id)
    if (!isMovable(item)) return
    const element = elementAt(at.x, at.y) ?? document.body
    const before = targets.get(id) ?? null
    const keep =
      item.kind === 'comment' &&
      before !== null &&
      before.isConnected &&
      before !== document.body &&
      before !== document.documentElement &&
      before.contains(element) &&
      isSelectedQuote(before, item.anchor.quote) &&
      contains(before.getBoundingClientRect(), at)
    const base = keep && before ? before : element
    const placed = createAnchor(base, at.x, at.y)
    const anchor = keep ? { ...placed, quote: item.anchor.quote, heading: item.anchor.heading } : placed
    item.anchor = anchor
    targets.set(id, base)
    if (!keep) ranges.delete(id)
    bridge.send({ type: 'move', id, anchor })
    scheduleLayout()
  }

  const lift = createNoteLift({
    node: (id) => nodes.get(id),
    kind: (id) => {
      const item = itemOf(id)
      return isMovable(item) ? item.kind : null
    },
    anchorAt: (id) => {
      const item = itemOf(id)
      return item ? anchorPoint(item, targetOf(item)) : null
    },
    unzoom: () => unzoom,
    outline: (at) => outline(at ? elementAt(at.x, at.y) : null),
    drop: moveTo,
    carrying: (id) => {
      syncCursorTool()
      bridge.send({ type: 'carrying', id })
    },
    painted: () => reportPositions(),
    released: () => scheduleLayout(),
    foot: DOC_FOOT
  })

  const place = (node: HTMLElement, element: Element, anchor: Anchor): void => {
    const rect = element.getBoundingClientRect()
    const visible = rect.width > 0 || rect.height > 0
    node.classList.toggle('hidden', !visible)
    if (!visible) return
    const x = rect.left + window.scrollX + anchor.offsetX * rect.width
    const y = rect.top + window.scrollY + anchor.offsetY * rect.height
    node.style.translate = `${Math.round(x)}px ${Math.round(y)}px`
  }

  const drawQuote = (item: OverlayItem, target: Element | null): void => {
    let range = ranges.get(item.id)
    if (range === undefined || (target && !range?.startContainer.isConnected)) {
      range = target && item.kind === 'comment' && isSelectedQuote(target, item.anchor.quote)
        ? findRange(target, item.anchor.quote)
        : null
      ranges.set(item.id, range)
    }
    const rects = range ? [...range.getClientRects()].filter(({ width }) => width > 0) : []
    const own = bars.get(item.id) ?? []
    while (own.length > rects.length) own.pop()?.remove()
    while (own.length < rects.length) {
      const bar = document.createElement('div')
      bar.className = 'quote'
      quotes.append(bar)
      own.push(bar)
    }
    bars.set(item.id, own)
    rects.forEach((rect, index) => {
      const bar = own[index]
      if (!bar) return
      bar.style.translate = `${rect.left + window.scrollX}px ${rect.top + window.scrollY}px`
      bar.style.width = `${rect.width}px`
      bar.style.height = `${rect.height}px`
      bar.classList.toggle('selected', item.id === selectedId)
    })
  }

  const rectOf = (id: string): OverlayRect | null => {
    const node = nodes.get(id)
    return node && !node.classList.contains('hidden') ? toRect(node.getBoundingClientRect()) : null
  }

  const reportPositions = (): void => {
    if (!tracking) return
    const list = items.flatMap(({ id }) => {
      const rect = rectOf(id)
      return rect ? [{ id, rect }] : []
    })
    const key = JSON.stringify(list)
    if (key === lastPositions) return
    lastPositions = key
    bridge.send({ type: 'positions', items: list })
  }

  /** Zmiana skali nie animuje znaczników, bo zrzut końcowy kamery złapałby je w pół drogi. */
  const syncZoom = (): void => {
    const next = 1 / zoom().scale
    if (next === unzoom) return
    unzoom = next
    layer.classList.add('still')
    for (const node of [layer, ghost, route.element, route.mask]) node.style.setProperty('--unzoom', String(next))
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.remove('still')))
  }

  const layout = (): void => {
    frame = 0
    syncZoom()
    const orphans: string[] = []
    for (const item of items) {
      const node = nodes.get(item.id)
      if (!node) continue
      const target = targetOf(item)
      // Uwagę w ręce albo w locie układa moduł ruchu.
      const owned = lift.owns(item.id)
      if (target) {
        if (!owned) place(node, target, item.anchor)
      } else {
        if (!owned) node.classList.add('hidden')
        orphans.push(item.id)
      }
      drawQuote(item, target)
      const end = ink.place(item.id, target)
      if (end) node.style.translate = `${Math.round(end.x)}px ${Math.round(end.y)}px`
    }
    ink.settle()
    shapes.layout()
    shapes.settle()
    route.layout()
    lift.paint()
    selectionMenu.layout()
    if (draft) place(draft.node, draft.element, draft.anchor)

    // Uwaga wybrana z listy może przyjść przed swoją pinezką, więc przewijamy dopiero po jej ułożeniu.
    const focused = pendingFocus ? targets.get(pendingFocus) : null
    if (focused) {
      // W elemencie dłuższym niż okno środek nic nie mówi, więc celem jest sam znacznik.
      const pin = focused.getBoundingClientRect().height > innerHeight ? nodes.get(pendingFocus ?? '') : null
      reportFocus = pendingFocus
      pendingFocus = null
      openAncestors(focused)
      ;(pin ?? focused).scrollIntoView({ block: 'center' })
      scheduleLayout()
    } else if (reportFocus) {
      bridge.send({ type: 'focused', id: reportFocus, rect: rectOf(reportFocus) })
      reportFocus = null
    }

    const key = orphans.join(',')
    if (key !== lastOrphans) {
      lastOrphans = key
      bridge.send({ type: 'orphans', ids: orphans })
    }
    reportPositions()
  }

  const scheduleLayout = (): void => {
    if (frame === 0) frame = requestAnimationFrame(layout)
  }

  const clearDraft = (): void => {
    draft?.node.remove()
    draft = null
  }

  const placeAt = (event: MouseEvent): void => {
    if (mode === null) return
    const element = elementAt(event.clientX, event.clientY)
    if (element) showDraft(mode, element, createAnchor(element, event.clientX, event.clientY))
  }

  const swallowClick = (): void => {}

  const carryClick = (event: MouseEvent): void => lift.place(event.clientX, event.clientY)

  const syncGuard = (): void => {
    guard.onClick =
      pointing || marking || shaping || picking ? swallowClick : lift.carried ? carryClick : mode === null ? null : placeAt
  }

  const press = (event: PointerEvent): void => {
    const down = event.type === 'pointerdown'
    if (picking) {
      route.press(event)
      return
    }
    if (shaping) {
      if (event.button === 2 && down) shapes.eraseAt(event.clientX, event.clientY)
      if (event.button !== 0) return
      if (down) shapes.begin(event.clientX, event.clientY, event.shiftKey)
      else shapes.end(event.clientX, event.clientY, event.shiftKey)
      return
    }
    if (marking) {
      if (event.button === 2 && down) ink.eraseAt(event.clientX, event.clientY)
      if (event.button !== 0) return
      marker.move(event.clientX, event.clientY, true, event.timeStamp)
      marker.press(down)
      return
    }
    if (event.button === 2 && down) presenter.erase()
    if (event.button !== 0) return
    presenter.move(event.clientX, event.clientY, true, event.timeStamp)
    presenter.press(down)
  }

  const syncCursorTool = (): void => {
    const on = pointing || marking
    syncGuard()
    guard.onPress = on || shaping || picking ? press : null
    layer.classList.toggle('pointing', on || shaping || picking)
    bridge.setPresenting(on)
    // Uwaga niesiona za kursorem też celuje celownikiem, a ramki dokumentu przepuszczają do niej mysz.
    bridge.setDrawing((shaping || picking || lift.carried) && !on)
  }

  const setPicking = (kind: PickKind | null): void => {
    if (kind !== null) lift.cancel()
    picking = kind !== null
    route.setPick(kind)
    syncCursorTool()
  }

  const setShaping = (tool: ShapeTool | null): void => {
    if (tool !== null) lift.cancel()
    shaping = tool !== null
    shapes.setTool(tool)
    syncCursorTool()
  }

  const setPointing = (on: boolean): void => {
    if (on) lift.cancel()
    pointing = on
    syncCursorTool()
    presenter.setActive(on)
  }

  const setMarking = (color: StickyColor | null): void => {
    if (color !== null) lift.cancel()
    marking = color !== null
    syncCursorTool()
    marker.setColor(color)
  }

  const setMode = (next: OverlayMode): void => {
    // Nowa uwaga zabiera kliknięcie, więc niesiona wraca na swoje miejsce.
    if (next !== null) lift.cancel()
    mode = next
    syncGuard()
    catcher.classList.toggle('active', next !== null)
    highlight.style.display = 'none'
    ghost.className = next === null ? 'ghost' : `ghost ${next}`
    if (next === null) clearDraft()
  }

  const showDraft = (kind: NoteKind, element: Element, anchor: Anchor): void => {
    clearDraft()
    const node = document.createElement('div')
    // W prezentacji pole wpisu stoi nad dokiem, więc szkic widać w dokumencie, a kolejne kliknięcie
    // go przestawia. Poza nią szkic tylko mierzy miejsce dla dymka powłoki.
    const keep = present !== null && !present.edit && mode !== null
    node.className = keep ? (kind === 'sticky' ? `draft shown sticky ${draftColor}` : 'draft shown') : 'draft'
    if (!keep || kind !== 'sticky') node.textContent = '+'
    layer.append(node)
    draft = { element, anchor, node }
    place(node, element, anchor)
    if (keep) {
      bridge.send({ type: 'place', kind, anchor, rect: toRect(node.getBoundingClientRect()) })
      return
    }
    catcher.classList.remove('active')
    highlight.style.display = 'none'
    ghost.className = 'ghost'
    mode = null
    syncGuard()
    bridge.send({ type: 'place', kind, anchor, rect: toRect(node.getBoundingClientRect()) })
  }

  const elementAt = (x: number, y: number): Element | null =>
    document.elementsFromPoint(x, y).find((element) => element !== host) ?? null

  /**
   * Szkic nowej uwagi w prezentacji staje obok kadru kroku, na wysokości jego górnej krawędzi.
   * Gdy obok nie ma miejsca na ekranie, wchodzi w kadr. Bez kadru staje na środku widoku.
   */
  const placeDefault = (kind: 'comment' | 'sticky', color: StickyColor): void => {
    if (!present) return
    draftColor = color
    setMode(kind)
    const view = zoom()
    const width = window.visualViewport?.width ?? innerWidth
    const height = window.visualViewport?.height ?? innerHeight
    const room = DRAFT_ROOM * unzoom
    const wide = (kind === 'sticky' ? NOTE_W : PIN_SIZE) * unzoom
    const tall = (kind === 'sticky' ? NOTE_H : PIN_SIZE) * unzoom
    // Pinezka stoi nad swoim punktem, a karteczka zwisa z niego w dół.
    const above = kind === 'comment' ? tall : 0
    const below = kind === 'sticky' ? tall : 0
    const spot = route.spot(present.camera)
    const x = spot ? spot.rect.x + spot.rect.width + room : view.left + width / 2
    const y = spot ? Math.max(spot.rect.y, view.top) + room + above : view.top + height / 2
    const at = {
      x: Math.max(view.left + room, Math.min(x, view.left + width - room - wide)),
      y: Math.max(view.top + room + above, Math.min(y, view.top + height - room - below))
    }
    const element = spot?.element ?? elementAt(at.x, at.y) ?? document.body
    showDraft(kind, element, createAnchor(element, at.x, at.y))
  }

  const select = (id: string | null): void => {
    selectedId = id
    ink.select(id)
    for (const [itemId, node] of nodes) node.classList.toggle('selected', itemId === id)
    for (const [itemId, list] of bars) {
      for (const bar of list) bar.classList.toggle('selected', itemId === id)
    }
  }

  const render = (): void => {
    for (const node of nodes.values()) node.remove()
    for (const list of bars.values()) for (const bar of list) bar.remove()
    nodes.clear()
    targets.clear()
    ranges.clear()
    bars.clear()
    const shown = present
      ? items.filter(
          (item) => (present as PresentState).reveal || (present as PresentState).show.includes(item.id) || fresh.has(item.id)
        )
      : items
    ink.show(shown)
    shapes.show(shown)

    for (const item of shown) {
      // Kształt nie ma pinezki. Usuwa go gumka narzędzia albo cofnięcie.
      if (item.kind === 'shape') continue
      const node = document.createElement('div')
      const audience = item.audience === 'me' ? ' me' : ''
      const waiting = item.waiting ? ' waiting' : ''
      const color = item.color ?? 'yellow'
      if (item.kind === 'highlight') node.className = `dab ${color}`
      else node.className = item.kind === 'sticky' ? `note ${color}` : `pin${audience}${waiting}`
      node.classList.toggle('selected', item.id === selectedId)
      if (item.kind !== 'highlight') node.textContent = item.label
      layer.append(node)
      nodes.set(item.id, node)
    }
    lift.keep(new Set(nodes.keys()))
    scheduleLayout()
  }

  const placeFromSelection = (kind: NoteKind): boolean => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false
    const range = selection.getRangeAt(0)
    const container = range.commonAncestorContainer
    const element = container instanceof Element ? container : container.parentElement
    if (!element) return false
    const rect = range.getBoundingClientRect()
    showDraft(kind, element, createAnchor(element, rect.right, rect.top, selection.toString()))
    selection.removeAllRanges()
    return true
  }

  /** Krok z zaznaczenia kadruje blok, w którym leży tekst, jak Miejsce wskazane kliknięciem. */
  const stepFromSelection = (range: Range): void => {
    const container = range.commonAncestorContainer
    const element = container instanceof Element ? container : container.parentElement
    if (!element) return
    const rect = range.getBoundingClientRect()
    const quote = range.toString().replace(/\s+/g, ' ').trim()
    const title = quote.length > STEP_TITLE ? `${quote.slice(0, STEP_TITLE - 1).trimEnd()}…` : quote
    const anchor = createAnchor(blockOf(element), rect.left, rect.top)
    bridge.send({ type: 'add-step', camera: { kind: 'place', anchor }, title })
  }

  const selectionMenu = createSelectionMenu({
    // W prezentacji widzowie patrzą na dokument, a nowe uwagi stawia się z doku.
    blocked: () =>
      mode !== null || pointing || marking || shaping || picking || lift.busy || (present !== null && !present.edit),
    unzoom: () => unzoom,
    offers: (action) => bridge.takesNotes?.() !== false || !NOTE_ACTIONS.has(action),
    run: (action, range, color) => {
      switch (action) {
        case 'copy':
          // Kliknięcie w menu jest gestem użytkownika, więc kopiowanie nie potrzebuje uprawnień schowka.
          document.execCommand('copy')
          break
        case 'comment':
        case 'sticky':
          placeFromSelection(action)
          break
        case 'highlight':
          if (ink.fromRange(range, color)) window.getSelection()?.removeAllRanges()
          break
        case 'step':
          stepFromSelection(range)
          break
        case 'find':
        case 'search':
          bridge.send({ type: 'selection-find', scope: action === 'find' ? 'doc' : 'library' })
          break
      }
    }
  })
  root.append(selectionMenu.element)

  guard.overlay = host
  guard.onOverlayClick = (event) => {
    // Kliknięcie kończące przeciągnięcie nie otwiera wątku.
    if (lift.swallowsClick()) return
    const hit = root.elementFromPoint(event.clientX, event.clientY)
    if (selectionMenu.click(event.clientX, event.clientY, hit)) return
    for (const [id, node] of nodes) {
      if (node !== hit) continue
      select(id)
      bridge.send({ type: 'select', id, rect: rectOf(id) })
    }
  }

  guard.onOverlayPress = (event) => {
    if (event.type === 'pointerup') {
      lift.release(event.clientX, event.clientY)
      return
    }
    if (event.button !== 0) return
    const hit = root.elementFromPoint(event.clientX, event.clientY)
    for (const [id, node] of nodes) if (node === hit) lift.press(id, event)
  }

  catcher.addEventListener('mousemove', (event) => {
    ghost.classList.add('on')
    ghost.style.translate = `${event.clientX}px ${event.clientY}px`
    const element = elementAt(event.clientX, event.clientY)
    if (element) outline(element)
  })
  catcher.addEventListener('mouseleave', () => ghost.classList.remove('on'))

  // Bez warstwy łapiącej mysz, żeby kółko, przewijane ramki i podpowiedzi dokumentu działały dalej.
  window.addEventListener(
    'pointermove',
    (event) => {
      if (!event.isTrusted) return
      // Szybki ruch przychodzi w paczkach, a linia potrzebuje każdego punktu.
      const points = event.getCoalescedEvents()
      const held = (event.buttons & 1) === 1
      for (const { clientX, clientY, timeStamp } of points.length > 0 ? points : [event]) {
        presenter.move(clientX, clientY, held, timeStamp)
        marker.move(clientX, clientY, held, timeStamp)
      }
      lastPointer = { x: event.clientX, y: event.clientY, held }
      lift.move(event.clientX, event.clientY, held)
      shapes.move(event.clientX, event.clientY, held, event.shiftKey)
      route.move(event.clientX, event.clientY, held)
    },
    { capture: true, passive: true }
  )
  // Puszczenie poza znacznikiem nie trafia do warstwy, więc łapie je okno.
  window.addEventListener(
    'pointerup',
    (event) => {
      if (event.isTrusted && event.button === 0) lift.release(event.clientX, event.clientY)
    },
    true
  )
  window.addEventListener('pointercancel', () => lift.cancel(), true)
  // Przeciągnięcie bez okna w tle nie dostałoby już puszczenia. Uwaga niesiona przyciskiem czeka dalej.
  window.addEventListener('blur', () => {
    if (lift.busy && !lift.carried) lift.cancel()
  })
  document.documentElement.addEventListener('mouseleave', () => {
    presenter.leave()
    marker.leave()
  })

  window.addEventListener(
    'keydown',
    (event) => {
      if (!event.isTrusted || event.altKey) return
      // Klawisz może zamknąć arkusz, a zakreślenie czeka jeszcze na następną linię.
      ink.flush()
      // Shift wyrównuje kształt także wtedy, gdy mysz stoi.
      if (event.key === 'Shift' && lastPointer.held) shapes.move(lastPointer.x, lastPointer.y, true, true)
      const key = event.key.toLowerCase() as OverlayKey
      if (!OVERLAY_KEYS.includes(key)) return
      // Esc odkłada uwagę z ręki na jej miejsce i na tym kończy, żeby powłoka nie zamknęła czegoś jeszcze.
      if (key === 'escape' && lift.busy) {
        lift.cancel()
        return
      }
      const ctrl = event.ctrlKey || event.metaKey
      // Klawisze kroków bez Ctrl rozstrzyga nasłuch na końcu drogi zdarzenia, niżej.
      if (!ctrl && STEP_KEYS.includes(key)) return
      // Skróty z Ctrl. `Ctrl+Z` w polu dokumentu należy do pola, a odróżnić je może tylko ta warstwa.
      const chord = key === 'arrowleft' || key === 'arrowright' || key === 'z'
      if (key === 'escape' && (mode !== null || pointing || marking || shaping || picking)) {
        shapes.cancel()
        route.cancel()
        bridge.send({ type: 'shortcut', key, shift: false, ctrl: false })
        return
      }
      if (isEditable(event.target) || event.repeat || ctrl !== chord) return
      bridge.send({ type: 'shortcut', key, shift: event.shiftKey, ctrl })
    },
    true
  )

  // W prezentacji spacja i strzałki prowadzą po krokach, ale dokument z własną obsługą klawiszy
  // dostaje je pierwszy. Klawisz, który dokument zatrzymał, zostaje przy nim.
  window.addEventListener('keydown', (event) => {
    if (!present || present.edit || !event.isTrusted || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    const key = event.key.toLowerCase() as OverlayKey
    if (!STEP_KEYS.includes(key) || isEditable(event.target)) return
    event.preventDefault()
    if (!event.repeat) bridge.send({ type: 'shortcut', key, shift: event.shiftKey, ctrl: false })
  })

  bridge.onMode((next) => {
    setMode(next)
    if (next !== null) placeFromSelection(next)
  })

  bridge.onItems((next) => {
    const before = new Map(items.map((item) => [item.id, item]))
    if (present) {
      for (const { id } of next) if (!before.has(id)) fresh.add(id)
    }
    // Uwaga, która zmieniła miejsce poza tą warstwą, np. po cofnięciu, przelatuje ze starego.
    const moved: [string, Point][] = []
    for (const item of next) {
      const old = before.get(item.id)
      if (!old || !isMovable(item) || lift.owns(item.id) || sameSpot(old.anchor, item.anchor)) continue
      const from = anchorPoint(old, targets.get(old.id))
      if (from) moved.push([item.id, from])
    }
    const arrived = seeded ? next.filter((item) => isMovable(item) && !before.has(item.id)) : []
    seeded = true
    items = next
    render()
    for (const item of arrived) {
      // Szkic stoi w tym samym miejscu, więc znika, gdy uwaga się na nim przykleja. Niewidoczny szkic
      // karteczki to papier powłoki uniesiony nad stroną, z którego karteczka od razu siada.
      const here = draft !== null && sameSpot(draft.anchor, item.anchor)
      const held = here && item.kind === 'sticky' && draft?.node.classList.contains('shown') === false
      if (here) clearDraft()
      lift.arrive(item.id, held)
    }
    for (const [id, from] of moved) lift.relocate(id, from)
  })

  bridge.onFocus((id) => {
    select(id)
    pendingFocus = id
    scheduleLayout()
  })

  bridge.onTrack((on) => {
    tracking = on
    lastPositions = ''
    scheduleLayout()
  })

  bridge.onPointer(setPointing)
  bridge.onMarker(setMarking)
  bridge.onShaper(setShaping)
  bridge.onDrawings((on) => {
    drawingsOn = on
    shapes.setVisible(on || present !== null)
  })
  bridge.onRoute(route.setRoute)
  bridge.onPick(setPicking)
  bridge.onPlace(({ kind, color }) => placeDefault(kind, color))
  bridge.onCarry((id) => lift.carry(id))
  bridge.onPresent((next) => {
    // Kształt, który przestał czekać, a wciąż jest w kroku, rysuje się teraz na oczach widzów.
    const drawn = (present?.pending ?? []).filter(
      (id) => next !== null && !next.pending.includes(id) && (next.reveal || next.show.includes(id))
    )
    present = next
    fresh.clear()
    route.setMask(next ? { camera: next.camera, rest: next.rest } : null)
    shapes.setPending(next?.pending ?? [])
    shapes.setVisible(drawingsOn || next !== null)
    render()
    shapes.drawOn(drawn)
  })
  window.addEventListener(
    'keyup',
    (event) => {
      if (event.isTrusted && event.key === 'Shift' && lastPointer.held) shapes.move(lastPointer.x, lastPointer.y, true, false)
    },
    true
  )
  bridge.onPointerWithdraw(() => {
    presenter.withdraw()
    marker.withdraw()
  })

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    setTimeout(() => {
      ink.retone()
      scheduleLayout()
    }, THEME_SETTLE_MS)
  })

  window.addEventListener('scroll', scheduleLayout, { capture: true, passive: true })
  window.addEventListener('resize', scheduleLayout)
  onZoom(scheduleLayout)
  document.addEventListener('toggle', scheduleLayout, true)
  window.addEventListener('load', scheduleFoot)
  void document.fonts.ready.then(scheduleFoot)
  const onLayout = (): void => {
    scheduleLayout()
    scheduleFoot()
  }
  new ResizeObserver(onLayout).observe(document.documentElement)
  if (document.body) {
    new MutationObserver(onLayout).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open']
    })
  }
}
