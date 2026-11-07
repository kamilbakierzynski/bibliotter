import type { Annotation } from '../../../shared/annotations'
import type { ViewerKey } from '../../../shared/types'
import { renderPills } from '../motion/pill'
import { springCurve } from '../../../shared/springCurve'
// Kamera rejestruje się sama, a tryb prezentacji będzie ją wołał.
import './camera'
import { homeRendered, syncHomeSeg } from './home'
import { splitShapes, syncDrawings } from './drawings'
import { handleFindEvent } from './find'
import { keepLayout, reopenLayout } from './hot'
import { handleKey, hideCaps, holdStart, isPopOpen, type KeyLike, togglePop } from './keys'
import { closeLabelPop, connectAutoLabel } from './labels'
import { layerDocument, layerHost, layerWindow } from './layer'
import {
  applyResize,
  bindElements,
  connectFrames,
  dockIn,
  placeInitial,
  render,
  syncChrome,
  syncRail,
  syncSel
} from './layout'
import { setLibrary, setScanProgress } from './library'
import { closeRowMenu } from './menu'
import { resumeLast } from './options'
import { docReady, focusLive, touch, wheelUnderDock } from './native'
import { closeThread, handleOverlayEvent, syncTools, syncViewSeg } from './notes'
import { handleOutlineEvent, isOutlineEvent, syncMinimap } from './outline'
import { notesChanged } from './present'
import { handleRoutePick, reloadRoutes, routeNotesChanged, setMissing } from './route'
import { closeCmd, renderCmd } from './palette'
import { handleSelectionMenu } from './selectionMenu'
import { followFileLink } from './files'
import { applyGlow, focusPane } from './sheets'
import { data, findNote, notify, ui } from './state'
import { applyMode } from './theme'
import { startingLibrary } from './prefetch'

let booted = false
let thumbFrame = 0

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
  arrowright: 'ArrowRight',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
  f5: 'F5'
}

function onViewerKey({ type, key, code, ctrl, shift, alt }: ViewerKey): void {
  if (key === 'Control' || key === 'Meta') {
    if (type === 'down') holdStart()
    else hideCaps()
    return
  }
  hideCaps()
  // Cofanie przychodzi z warstwy dokumentu, bo tylko ona wie, czy klawisz trafił do pola.
  if (type === 'down' && !(ctrl && key.toLowerCase() === 'z')) handleKey(virtualKey(key, shift, ctrl, alt, code))
}

function setAnnotations(annotations: Annotation[]): void {
  data.annotations = splitShapes(annotations)
  notesChanged()
  routeNotesChanged()
  // Zamknięty lub usunięty wątek przestaje trzymać arkusz w zrzucie.
  const selected = findNote(ui.selNote)
  if (ui.selNote && (!selected || (selected.status !== 'open' && !ui.showResolved))) closeThread()
  notify()
  touch()
}

function connectApi(): void {
  window.api.onLibraryChanged((json) => {
    setLibrary(json)
    if (ui.cmd) renderCmd()
  })
  window.api.onScanProgress(setScanProgress)
  window.api.onAnnotationsChanged(setAnnotations)
  window.api.onPresentationChanged(reloadRoutes)
  connectAutoLabel()
  syncMinimap()
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
    } else if (event.type === 'find' || event.type === 'find-seed') {
      handleFindEvent(docId, event)
    } else if (event.type === 'route-pick') {
      handleRoutePick(docId, event.camera)
    } else if (event.type === 'route-missing') {
      setMissing(docId, event.ids)
    } else if (event.type === 'add-step' || event.type === 'selection-find') {
      handleSelectionMenu(docId, event)
    } else {
      if (isOutlineEvent(event)) handleOutlineEvent(docId, event)
      else handleOverlayEvent(docId, event)
    }
  })
  window.api.onViewerKey(onViewerKey)
  window.api.onFollowLink(followFileLink)
  window.api.onViewerFocus((docId) => {
    const slot = ui.panes.indexOf(docId)
    if (slot >= 0) focusPane(slot)
  })
  window.api.onThumb((thumb) => {
    data.thumbs.set(thumb.docId, thumb)
    // Ściana dostaje miniatury seriami, a powłoka rysuje się raz na klatkę.
    thumbFrame ||= requestAnimationFrame(() => {
      thumbFrame = 0
      applyGlow()
      notify()
    })
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
  page.addEventListener(
    'pointerdown',
    (event) => {
      hideCaps()
      if (!(event.target as Element).closest?.('#rowMenu')) closeRowMenu()
    },
    true
  )
  page.addEventListener('blur', () => hideCaps())
  page.addEventListener('keydown', (event) => {
    // Terminal ma klawiaturę dla siebie, a swój skrót obsługuje sam.
    if ((event.target as Element).closest?.('.term')) return
    if (!event.repeat) handleKey(event)
  })
  page.addEventListener('click', (event) => {
    if (isPopOpen() && !(event.target as HTMLElement).closest('#statusPop')) togglePop(false)
    if (ui.labelPop && !(event.target as HTMLElement).closest('#labelPop')) closeLabelPop()
    // Kliknięcie obok dokumentu nie zabiera mu klawiatury, więc strzałki dalej go przewijają.
    if (!(event.target as HTMLElement).closest('.term')) focusLive()
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
  addEventListener('blur', closeRowMenu)
  addEventListener('resize', () => {
    closeRowMenu()
    applyResize()
    resync()
  })

  placeInitial()
  // Ściana stoi od pierwszej klatki, bo to na niej widać, że biblioteka się wczytuje.
  syncChrome()
  applyGlow()
  ui.ready = true
  resync()
  render()
  requestAnimationFrame(() => dockIn.to(1))
  void Promise.all([document.fonts.ready, layerDocument().fonts.ready]).then(resync)

  keepLayout()
  void startingLibrary().then((json) => {
    setLibrary(json)
    if (!reopenLayout()) resumeLast()
  })
  void window.api.listAnnotations().then(setAnnotations)
  syncDrawings()
}
