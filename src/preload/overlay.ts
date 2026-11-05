import type { Anchor, AnnotationKind, OverlayEvent, OverlayItem, OverlayMode } from '../shared/annotations'
import { createAnchor, resolveAnchor } from './anchor'

const MAX_Z_INDEX = '2147483647'

const STYLE = `
  * { box-sizing: border-box; }
  .pin, .note, .draft {
    position: absolute; top: 0; left: 0;
    font: 12px/1.35 system-ui, 'Segoe UI', sans-serif;
    pointer-events: auto; cursor: pointer; user-select: none;
  }
  .pin, .draft {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; margin: -26px 0 0 0;
    color: #fff; font-weight: 600;
    background: #2f5cd6; border: 2px solid #fff;
    border-radius: 50% 50% 50% 2px;
    box-shadow: 0 1px 5px rgb(0 0 0 / 40%);
  }
  .pin.me { background: #5f6368; }
  .draft { background: #2f5cd6; border-style: dashed; pointer-events: none; }
  .note {
    width: 132px; min-height: 40px; max-height: 92px; padding: 7px 8px;
    overflow: hidden; color: #2b2610; overflow-wrap: anywhere;
    border-radius: 2px 2px 10px 2px;
    box-shadow: 0 2px 7px rgb(0 0 0 / 32%);
  }
  .note.yellow { background: #fbe88a; }
  .note.blue { background: #bcdcff; }
  .note.green { background: #c5ecbd; }
  .note.pink { background: #ffc9de; }
  .selected { outline: 3px solid #ffb020; outline-offset: 1px; }
  .hidden { display: none; }
  .catcher {
    position: fixed; inset: 0; display: none;
    pointer-events: auto; cursor: crosshair; background: transparent;
  }
  .catcher.active { display: block; }
  .highlight {
    position: fixed; display: none; pointer-events: none;
    background: rgb(47 92 214 / 8%); outline: 2px solid rgb(47 92 214 / 60%);
    border-radius: 2px;
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
  const layer = document.createElement('div')
  const highlight = document.createElement('div')
  highlight.className = 'highlight'
  const catcher = document.createElement('div')
  catcher.className = 'catcher'
  root.append(style, layer, highlight, catcher)
  document.documentElement.append(host)

  let items: OverlayItem[] = []
  let mode: OverlayMode = null
  let selectedId: string | null = null
  let pendingFocus: string | null = null
  let draft: { element: Element; anchor: Anchor; node: HTMLElement } | null = null
  let lastOrphans = ''
  let frame = 0

  const nodes = new Map<string, HTMLElement>()
  const targets = new Map<string, Element | null>()

  const place = (node: HTMLElement, element: Element, anchor: Anchor): void => {
    const rect = element.getBoundingClientRect()
    const visible = rect.width > 0 || rect.height > 0
    node.classList.toggle('hidden', !visible)
    if (!visible) return
    const x = rect.left + window.scrollX + anchor.offsetX * rect.width
    const y = rect.top + window.scrollY + anchor.offsetY * rect.height
    node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
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
    }
    if (draft) place(draft.node, draft.element, draft.anchor)

    // Uwaga wybrana z listy może przyjść przed swoją pinezką, więc przewijamy dopiero po jej ułożeniu.
    const focused = pendingFocus ? targets.get(pendingFocus) : null
    if (focused) {
      pendingFocus = null
      openAncestors(focused)
      focused.scrollIntoView({ block: 'center' })
      scheduleLayout()
    }

    const key = orphans.join(',')
    if (key !== lastOrphans) {
      lastOrphans = key
      bridge.send({ type: 'orphans', ids: orphans })
    }
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
    mode = null
    guard.onClick = null
    bridge.send({ type: 'place', kind, anchor })
  }

  const elementAt = (x: number, y: number): Element | null =>
    document.elementsFromPoint(x, y).find((element) => element !== host) ?? null

  const select = (id: string | null): void => {
    selectedId = id
    for (const [itemId, node] of nodes) node.classList.toggle('selected', itemId === id)
  }

  const render = (): void => {
    for (const node of nodes.values()) node.remove()
    nodes.clear()
    targets.clear()

    for (const item of items) {
      const node = document.createElement('div')
      const audience = item.audience === 'me' ? ' me' : ''
      node.className = item.kind === 'sticky' ? `note ${item.color ?? 'yellow'}` : `pin${audience}`
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
      bridge.send({ type: 'select', id })
    }
  }

  catcher.addEventListener('mousemove', (event) => {
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

  window.addEventListener(
    'keydown',
    (event) => {
      if (!event.isTrusted || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'Escape' && mode !== null) bridge.send({ type: 'shortcut', key: 'cancel' })
      if (isEditable(event.target)) return
      if (event.key === 'c') bridge.send({ type: 'shortcut', key: 'comment' })
      if (event.key === 'n') bridge.send({ type: 'shortcut', key: 'sticky' })
    },
    true
  )

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

  window.addEventListener('scroll', scheduleLayout, { capture: true, passive: true })
  window.addEventListener('resize', scheduleLayout)
  document.addEventListener('toggle', scheduleLayout, true)
  new ResizeObserver(scheduleLayout).observe(document.documentElement)
  if (document.body) {
    new MutationObserver(scheduleLayout).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open']
    })
  }
}
