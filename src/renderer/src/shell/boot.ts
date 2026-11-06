import type { Annotation } from '../../../shared/annotations'
import type { ViewerKey } from '../../../shared/types'
import { renderPills } from '../motion/pill'
import { springCurve } from '../motion/spring'
import { homeRendered, syncHomeSeg } from './home'
import { handleKey, hideCaps, holdStart, isPopOpen, type KeyLike, togglePop } from './keys'
import { layerDocument, layerHost, layerWindow } from './layer'
import {
  applyResize,
  bindElements,
  connectFrames,
  dockIn,
  placeInitial,
  render,
  syncRail,
  syncSel
} from './layout'
import { load, setLibrary } from './library'
import { docReady, touch, wheelUnderDock } from './native'
import { closeThread, handleOverlayEvent, syncTools, syncViewSeg } from './notes'
import { closeCmd, renderCmd } from './palette'
import { applyGlow, focusPane } from './sheets'
import { data, findNote, notify, ui } from './state'
import { applyMode } from './theme'

let booted = false

const virtualKey = (key: string, shift: boolean, ctrl: boolean, alt = false, code?: string): KeyLike => ({
  key,
  code,
  ctrlKey: ctrl,
  metaKey: false,
  shiftKey: shift,
  altKey: alt,
  preventDefault: () => {}
})

const OVERLAY_KEY_NAMES: Record<string, string> = {
  escape: 'Escape',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight'
}

function onViewerKey({ type, key, code, ctrl, shift, alt }: ViewerKey): void {
  if (key === 'Control' || key === 'Meta') {
    if (type === 'down') holdStart()
    else hideCaps()
    return
  }
  hideCaps()
  if (type === 'down') handleKey(virtualKey(key, shift, ctrl, alt, code))
}

function setAnnotations(annotations: Annotation[]): void {
  data.annotations = annotations
  // Zamknięty lub usunięty wątek przestaje trzymać arkusz w zrzucie.
  const selected = findNote(ui.selNote)
  if (ui.selNote && (!selected || (selected.status !== 'open' && !ui.showResolved))) closeThread()
  notify()
  touch()
}

function connectApi(): void {
  window.api.onLibraryChanged((snapshot) => {
    setLibrary(snapshot)
    if (ui.cmd) renderCmd()
  })
  window.api.onAnnotationsChanged(setAnnotations)
  window.api.onViewerState((state) => {
    const before = data.viewers.get(state.docId)?.status
    data.viewers.set(state.docId, state)
    if (state.status === 'ready' && before !== 'ready') docReady(state.docId)
    notify()
  })
  window.api.onOverlayEvent((docId, event) => {
    if (event.type === 'shortcut') {
      const key = OVERLAY_KEY_NAMES[event.key] ?? event.key
      handleKey(virtualKey(key, event.shift, event.ctrl))
    } else {
      handleOverlayEvent(docId, event)
    }
  })
  window.api.onViewerKey(onViewerKey)
  window.api.onViewerFocus((docId) => {
    const slot = ui.panes.indexOf(docId)
    if (slot >= 0) focusPane(slot)
  })
  window.api.onThumb((thumb) => {
    data.thumbs.set(thumb.docId, thumb)
    applyGlow()
    notify()
  })
}

/** Klawiatura może być na powłoce albo na warstwie doku, np. po kliknięciu narzędzia. */
function connectKeyboard(page: Window): void {
  page.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat) return
      hideCaps()
      if (event.key === 'Control' || event.key === 'Meta') holdStart()
    },
    true
  )
  page.addEventListener(
    'keyup',
    (event) => {
      if (event.key === 'Control' || event.key === 'Meta') hideCaps()
    },
    true
  )
  page.addEventListener('pointerdown', () => hideCaps(), true)
  page.addEventListener('blur', () => hideCaps())
  page.addEventListener('keydown', (event) => {
    if (!event.repeat) handleKey(event)
  })
  page.addEventListener('click', (event) => {
    if (isPopOpen() && !(event.target as HTMLElement).closest('#statusPop')) togglePop(false)
  })
}

function resync(): void {
  syncRail(true)
  syncSel(true)
  syncTools(true)
  syncViewSeg(true)
  syncHomeSeg(true)
  homeRendered()
  renderPills()
}

/** Uruchamia powłokę po pierwszym narysowaniu. React rysuje treść, a to spina ruch i dane. */
export function boot(): void {
  if (booted) return
  booted = true
  const root = document.documentElement
  root.style.setProperty('--spring', springCurve(120, 0.92))
  root.style.setProperty('--spring-pop', springCurve(170, 0.62))
  applyMode()
  bindElements()
  connectFrames()
  connectApi()
  connectKeyboard(window)
  connectKeyboard(layerWindow())
  // Wycięcie jest szersze od palety o cień, a klik obok niej ma zamknąć paletę jak klik w tło.
  layerHost().addEventListener('click', (event) => {
    if (event.target === layerHost()) closeCmd()
  })
  layerHost().addEventListener(
    'wheel',
    (event) => wheelUnderDock(event.clientX, event.clientY, -event.deltaX, -event.deltaY),
    { passive: true }
  )
  addEventListener('resize', () => {
    applyResize()
    resync()
  })

  placeInitial()
  applyGlow()
  ui.ready = true
  resync()
  render()
  requestAnimationFrame(() => dockIn.to(1))
  void Promise.all([document.fonts.ready, layerDocument().fonts.ready]).then(resync)

  load(window.api.getLibrary)
  void window.api.listAnnotations().then(setAnnotations)
}
