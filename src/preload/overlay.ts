import {
  type Anchor,
  type AnnotationKind,
  OVERLAY_KEYS,
  type OverlayEvent,
  type OverlayItem,
  type OverlayKey,
  type OverlayMode,
  type OverlayRect,
  type SelectionAction
} from '../shared/annotations'
import { createAnchor, resolveAnchor } from './anchor'

const MAX_Z_INDEX = '2147483647'
/** Wysokość doku nad dołem arkusza i oddech nad nim. */
const DOC_FOOT = 84
const FOOT_WAIT_MS = 150
/** Dłuższych elementów nie przeszukujemy przy każdym rysowaniu cytatu. */
const MAX_QUOTE_SCOPE = 20_000

/*
 * Pinezki i karteczki należą do języka apki, a nie dokumentu. Dokument ma własne fonty,
 * więc warstwa używa kroju systemowego, a resztę bierze z makiety.
 */
const STYLE = `
  * { box-sizing: border-box; }
  .pin, .note, .draft, .ghost {
    position: absolute; top: 0; left: 0;
    font: 500 12px/1.35 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
    pointer-events: auto; cursor: pointer; user-select: none;
  }
  .pin, .draft {
    display: grid; place-items: center;
    width: 24px; height: 24px; margin: -24px 0 0 -1px;
    color: #fff; font-size: 11px; font-weight: 600;
    background: #131316; border-radius: 50% 50% 50% 4px;
    box-shadow: 0 0 0 1.5px #fff, 0 4px 10px rgb(0 0 0 / 24%);
    transition: scale .36s cubic-bezier(.2, 1.3, .3, 1), background-color .3s;
  }
  .pin.waiting { background: #f0480a; }
  .pin.me { color: #131316; background: #fff; box-shadow: 0 0 0 1px rgb(0 0 0 / 16%), 0 4px 10px rgb(0 0 0 / 16%); }
  .pin:hover { scale: 1.12; }
  .pin.selected { scale: 1.2; }
  .draft { pointer-events: none; visibility: hidden; }
  @keyframes drop { from { opacity: 0; transform: translateY(-14px) scale(.7); } to { opacity: 1; transform: none; } }
  .note {
    width: 148px; min-height: 40px; max-height: 108px; padding: 10px 12px 14px;
    overflow: hidden; color: #3a3312; overflow-wrap: anywhere; text-align: left;
    border-radius: 3px 3px 14px 3px; rotate: 1.3deg;
    box-shadow: 0 1px 1px rgb(0 0 0 / 5%), 0 12px 18px -8px rgb(0 0 0 / 24%);
    transition: rotate .42s cubic-bezier(.2, 1.3, .3, 1), scale .42s cubic-bezier(.2, 1.3, .3, 1);
  }
  .note.yellow { background: #f7e7a0; }
  .note.blue { background: #cfe3f7; }
  .note.green { background: #d4ebcc; }
  .note.pink { background: #f7d5df; }
  .note:hover, .note.selected { rotate: 0deg; scale: 1.02; }
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
    width: 24px; height: 24px; margin: -24px 0 0 -1px; opacity: .92;
    background: #131316; border-radius: 50% 50% 50% 4px;
    box-shadow: 0 0 0 1.5px #fff, 0 4px 10px rgb(0 0 0 / 24%);
  }
  .ghost.sticky {
    width: 34px; height: 34px; margin: -30px 0 0 6px; rotate: -4deg;
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
  /** Element warstwy. Kliknięcia pinezek też nie dochodzą do dokumentu. */
  overlay: Element | null
  onOverlayClick: ((event: MouseEvent) => void) | null
}

/**
 * Trzeba wywołać przed skryptami dokumentu. Tylko nasłuch na `window` w fazie przechwytywania,
 * dodany jako pierwszy, zatrzyma też delegowane obsługi kliknięć na `document` i `window`.
 */
export function guardPointerEvents(): PointerGuard {
  const guard: PointerGuard = { onClick: null, overlay: null, onOverlayClick: null }
  for (const type of POINTER_EVENTS) {
    window.addEventListener(
      type,
      (event) => {
        const handler = guard.onClick ?? (event.target === guard.overlay ? guard.onOverlayClick : null)
        if (!handler || !event.isTrusted) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (event.type === 'click') handler(event as MouseEvent)
      },
      true
    )
  }
  return guard
}

export interface OverlayBridge {
  send(event: OverlayEvent): void
  onMode(listener: (mode: OverlayMode) => void): void
  onItems(listener: (items: OverlayItem[]) => void): void
  onFocus(listener: (id: string | null) => void): void
  onTrack(listener: (on: boolean) => void): void
  onSelection(listener: (action: SelectionAction) => void): void
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

const toRect = ({ x, y, width, height }: DOMRect): OverlayRect => ({ x, y, width, height })

/** Cytat to zaznaczony tekst. Kliknięcie zapisuje początek elementu, a tego nie podkreślamy. */
function isSelectedQuote(element: Element, quote: string): boolean {
  if (!quote) return false
  const text = (element as HTMLElement).innerText ?? element.textContent ?? ''
  return !text.replace(/\s+/g, ' ').trim().startsWith(quote)
}

/** Znajduje cytat w tekście elementu, pomijając różnice w białych znakach. */
function findRange(root: Element, quote: string): Range | null {
  if ((root.textContent?.length ?? 0) > MAX_QUOTE_SCOPE) return null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const positions: [Text, number][] = []
  let text = ''
  let afterSpace = true
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (let index = 0; index < node.data.length; index++) {
      const char = node.data.charAt(index)
      const space = /\s/.test(char)
      if (space && afterSpace) continue
      afterSpace = space
      text += space ? ' ' : char
      positions.push([node, index])
    }
  }
  const at = text.indexOf(quote)
  const start = positions[at]
  const end = positions[at + quote.length - 1]
  if (at < 0 || !start || !end) return null
  const range = document.createRange()
  range.setStart(start[0], start[1])
  range.setEnd(end[0], end[1] + 1)
  return range
}

/**
 * Warstwa z pinezkami. Działa w odizolowanym świecie i w zamkniętym Shadow DOM, więc skrypty
 * dokumentu nie widzą treści uwag. Tekst trafia tu tylko przez `textContent`.
 */
export function startOverlay(bridge: OverlayBridge, guard: PointerGuard): void {
  const host = document.createElement('html-docs-overlay')
  host.style.cssText = `all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: ${MAX_Z_INDEX}; pointer-events: none;`
  const root = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = STYLE
  const quotes = document.createElement('div')
  const layer = document.createElement('div')
  const highlight = document.createElement('div')
  highlight.className = 'highlight'
  const catcher = document.createElement('div')
  catcher.className = 'catcher'
  const ghost = document.createElement('div')
  ghost.className = 'ghost'
  root.append(style, quotes, layer, highlight, catcher, ghost)
  document.documentElement.append(host)

  // Dok pływa nad dołem arkusza, więc dokument dostaje zapas, żeby koniec treści wyszedł spod niego.
  const foot = document.createElement('html-docs-foot')
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
  let selecting = false

  const nodes = new Map<string, HTMLElement>()
  const targets = new Map<string, Element | null>()
  const ranges = new Map<string, Range | null>()
  const bars = new Map<string, HTMLElement[]>()

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

  const layout = (): void => {
    frame = 0
    const orphans: string[] = []
    for (const item of items) {
      const node = nodes.get(item.id)
      if (!node) continue
      let target = targets.get(item.id) ?? null
      if (!target?.isConnected) {
        target = resolveAnchor(item.anchor)
        targets.set(item.id, target)
      }
      if (target) {
        place(node, target, item.anchor)
      } else {
        node.classList.add('hidden')
        orphans.push(item.id)
      }
      drawQuote(item, target)
    }
    if (draft) place(draft.node, draft.element, draft.anchor)

    // Uwaga wybrana z listy może przyjść przed swoją pinezką, więc przewijamy dopiero po jej ułożeniu.
    const focused = pendingFocus ? targets.get(pendingFocus) : null
    if (focused) {
      reportFocus = pendingFocus
      pendingFocus = null
      openAncestors(focused)
      focused.scrollIntoView({ block: 'center' })
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

  const setMode = (next: OverlayMode): void => {
    mode = next
    guard.onClick = next === null ? null : placeAt
    catcher.classList.toggle('active', next !== null)
    highlight.style.display = 'none'
    ghost.className = next === null ? 'ghost' : `ghost ${next}`
    if (next === null) clearDraft()
  }

  const showDraft = (kind: AnnotationKind, element: Element, anchor: Anchor): void => {
    clearDraft()
    const node = document.createElement('div')
    node.className = 'draft'
    node.textContent = '+'
    layer.append(node)
    draft = { element, anchor, node }
    place(node, element, anchor)
    catcher.classList.remove('active')
    highlight.style.display = 'none'
    ghost.className = 'ghost'
    mode = null
    guard.onClick = null
    bridge.send({ type: 'place', kind, anchor, rect: toRect(node.getBoundingClientRect()) })
  }

  const elementAt = (x: number, y: number): Element | null =>
    document.elementsFromPoint(x, y).find((element) => element !== host) ?? null

  const select = (id: string | null): void => {
    selectedId = id
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

    for (const item of items) {
      const node = document.createElement('div')
      const audience = item.audience === 'me' ? ' me' : ''
      const waiting = item.waiting ? ' waiting' : ''
      node.className = item.kind === 'sticky' ? `note ${item.color ?? 'yellow'}` : `pin${audience}${waiting}`
      node.classList.toggle('selected', item.id === selectedId)
      node.textContent = item.label
      layer.append(node)
      nodes.set(item.id, node)
    }
    scheduleLayout()
  }

  const placeFromSelection = (kind: AnnotationKind): boolean => {
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

  guard.overlay = host
  guard.onOverlayClick = (event) => {
    const hit = root.elementFromPoint(event.clientX, event.clientY)
    for (const [id, node] of nodes) {
      if (node !== hit) continue
      select(id)
      bridge.send({ type: 'select', id, rect: rectOf(id) })
    }
  }

  catcher.addEventListener('mousemove', (event) => {
    ghost.classList.add('on')
    ghost.style.translate = `${event.clientX}px ${event.clientY}px`
    const element = elementAt(event.clientX, event.clientY)
    if (!element) return
    const rect = element.getBoundingClientRect()
    Object.assign(highlight.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    })
  })
  catcher.addEventListener('mouseleave', () => ghost.classList.remove('on'))

  window.addEventListener(
    'keydown',
    (event) => {
      if (!event.isTrusted || event.altKey) return
      const key = event.key.toLowerCase() as OverlayKey
      if (!OVERLAY_KEYS.includes(key)) return
      const ctrl = event.ctrlKey || event.metaKey
      const arrow = key === 'arrowleft' || key === 'arrowright'
      if (key === 'escape' && mode !== null) {
        bridge.send({ type: 'shortcut', key, shift: false, ctrl: false })
        return
      }
      if (isEditable(event.target) || event.repeat || ctrl !== arrow) return
      bridge.send({ type: 'shortcut', key, shift: event.shiftKey, ctrl })
    },
    true
  )

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection()
    const active = selection !== null && !selection.isCollapsed && !isEditable(document.activeElement)
    if (active === selecting) return
    selecting = active
    bridge.send({ type: 'selection', active })
  })

  bridge.onMode((next) => {
    setMode(next)
    if (next !== null) placeFromSelection(next)
  })

  bridge.onItems((next) => {
    items = next
    render()
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

  bridge.onSelection((action) => {
    if (action !== 'copy') placeFromSelection(action)
  })

  window.addEventListener('scroll', scheduleLayout, { capture: true, passive: true })
  window.addEventListener('resize', scheduleLayout)
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
