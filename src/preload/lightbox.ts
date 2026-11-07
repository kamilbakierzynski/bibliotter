import { t } from '../shared/i18n'
import { springCurve } from '../shared/springCurve'
import { DOC_FOOT, MAX_Z_INDEX } from './overlay'
import { onScreen, zoom } from './zoom'

/*
 * Obrazek w dokumencie powiększa się po kliknięciu, nad całym arkuszem. Powiększenie żyje
 * w dokumencie, bo widok dokumentu leży nad powłoką, więc sięga tylko do krawędzi arkusza.
 * Kopia obrazka wylatuje z miejsca oryginału i do niego wraca, a oryginału nie dotykamy.
 */

const MARGIN = 28
/** Zdjęcie rośnie najwyżej dwa razy ponad swoje piksele, bo dalej robi się z niego plama. */
const RASTER_UPSCALE = 2
/** Powiększenie o mniej niż tyle nic by nie dało, więc obrazek zostaje zwykłym obrazkiem. */
const WORTH = 1.15
/** Ikonki i znaczki są małe z natury, więc nie rosną, nawet gdy jest miejsce. */
const MIN_NATURAL = 128
const DRAG_SLOP = 4
const FLY_MS = 520
const FADE_MS = 260
const SPRING = springCurve(120, 0.92)

const STYLE = `
  * { box-sizing: border-box; }
  .backdrop {
    position: absolute; inset: 0; background: rgb(12 12 14 / 84%);
    -webkit-backdrop-filter: blur(10px) saturate(.85); backdrop-filter: blur(10px) saturate(.85);
    cursor: zoom-out;
  }
  .stage { position: absolute; inset: 0; overflow: hidden; overscroll-behavior: contain; cursor: zoom-out; }
  .stage.actual { overflow: auto; scrollbar-width: thin; scrollbar-color: rgb(255 255 255 / 28%) transparent; }
  .canvas { position: relative; }
  .picture {
    position: absolute; top: 0; left: 0; max-width: none; transform-origin: 0 0;
    border-radius: 4px;
    box-shadow: 0 0 0 .5px rgb(255 255 255 / 10%), 0 30px 80px -24px rgb(0 0 0 / 70%);
    user-select: none; -webkit-user-drag: none; cursor: zoom-out;
  }
  .picture.grows { cursor: zoom-in; }
  .stage.actual .picture { cursor: grab; }
  .stage.actual .picture.held { cursor: grabbing; }
  .close {
    position: absolute; top: 14px; right: 14px; display: grid; place-items: center; width: 32px; height: 32px;
    padding: 0; color: #f4f4f5; background: rgb(255 255 255 / 10%); border: 0; border-radius: 50%; cursor: pointer;
    box-shadow: 0 0 0 .5px rgb(255 255 255 / 14%); transition: background .16s;
  }
  .close:hover { background: rgb(255 255 255 / 18%); }
  .close:focus-visible { outline: 2px solid #f4f4f5; outline-offset: 2px; }
  .close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linecap: round; }
`

interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface LightboxBridge {
  /** Narzędzie albo tryb uwag przejął mysz, więc obrazek nie powiększa się po kliknięciu. */
  busy(): boolean
  /** Kursor powiększania nad obrazkiem pod wskaźnikiem. Dokument nie może go nadpisać. */
  setCursor(on: boolean): void
}

export interface LightboxHandle {
  close(): void
}

const isVector = (source: string): boolean => /^data:image\/svg/i.test(source) || /\.svg(?:[?#]|$)/i.test(source)

const sourceOf = (image: HTMLImageElement): string => image.currentSrc || image.src

/** Obrazek w linku, przycisku albo w tekście do edycji należy do nich, a nie do powiększenia. */
function belongsElsewhere(image: HTMLImageElement): boolean {
  return image.isContentEditable || image.closest('a[href], button, label, summary, [role="button"], [onclick]') !== null
}

/** Dokument, który sam obsługuje kliknięcie w obrazek, zwykle zmienia nad nim kursor. */
const documentHandles = (image: HTMLImageElement): boolean => {
  const cursor = getComputedStyle(image).cursor
  return cursor !== 'auto' && cursor !== 'default'
}

function closeIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M4 4l8 8M12 4l-8 8')
  svg.append(path)
  return svg
}

/**
 * Rozmiar widoku w pikselach ekranu, razem z paskiem przewijania strony, żeby nie dało się
 * przewinąć jej spod powiększenia. Pod powiększeniem kamery okno strony jest mniejsze.
 */
function viewSize(): { width: number; height: number } {
  const view = window.visualViewport
  if (!view || view.scale === 1) return { width: innerWidth, height: innerHeight }
  return { width: view.width * view.scale, height: view.height * view.scale }
}

function naturalSize(image: HTMLImageElement, shown: Box): { width: number; height: number } {
  if (image.naturalWidth > 0 && image.naturalHeight > 0) return { width: image.naturalWidth, height: image.naturalHeight }
  return { width: shown.width, height: shown.height }
}

/** Miejsce obrazka dopasowanego do widoku, nad dolnym zapasem na dok. */
function fitBox(natural: { width: number; height: number }, vector: boolean): Box {
  const { width, height } = viewSize()
  const top = MARGIN
  const bottom = Math.max(MARGIN, DOC_FOOT)
  const roomWidth = Math.max(1, width - 2 * MARGIN)
  const roomHeight = Math.max(1, height - top - bottom)
  const cap = vector ? Infinity : RASTER_UPSCALE
  const scale = Math.min(roomWidth / natural.width, roomHeight / natural.height, cap)
  const fitWidth = natural.width * scale
  const fitHeight = natural.height * scale
  return { x: (width - fitWidth) / 2, y: top + (roomHeight - fitHeight) / 2, width: fitWidth, height: fitHeight }
}

function shownBox(image: HTMLImageElement): Box | null {
  const rect = image.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return null
  return onScreen({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
}

/** Papier strony pod obrazkiem, bo przezroczysty obrazek na ciemnej zasłonie straciłby kreski. */
function paperOf(): string {
  for (const element of [document.body, document.documentElement]) {
    if (!element) continue
    const color = getComputedStyle(element).backgroundColor
    if (color && color !== 'transparent' && !/rgba(.*,s*0)$/.test(color)) return color
  }
  return '#ffffff'
}

/**
 * Czy obrazek urośnie po kliknięciu na tyle, żeby było warto. Kursor dokumentu da się sprawdzić
 * tylko bez własnego stylu kursora, więc obrazek już uznany pod wskaźnikiem go pomija.
 */
function zoomable(image: HTMLImageElement, checkCursor = true): boolean {
  if (!image.complete || belongsElsewhere(image) || (checkCursor && documentHandles(image))) return false
  const shown = shownBox(image)
  if (!shown) return false
  const natural = naturalSize(image, shown)
  if (Math.max(natural.width, natural.height) < MIN_NATURAL) return false
  const fit = fitBox(natural, isVector(sourceOf(image)))
  return fit.width > shown.width * WORTH
}

const imageAt = (event: Event): HTMLImageElement | null => {
  const target = event.composedPath()[0]
  return target instanceof HTMLImageElement ? target : null
}

const flight = (from: Box, to: Box): string =>
  `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})`

/**
 * Nasłuchy stoją na `window` w fazie przechwytywania i trzeba je założyć przed warstwą uwag:
 * Esc przy otwartym powiększeniu zamyka tylko powiększenie, a nie arkusz albo tryb.
 */
export function startLightbox(bridge: LightboxBridge): LightboxHandle {
  let host: HTMLElement | null = null
  let stage: HTMLDivElement
  let canvas: HTMLDivElement
  let backdrop: HTMLDivElement
  let picture: HTMLImageElement
  let closeButton: HTMLButtonElement

  let source: HTMLImageElement | null = null
  let natural = { width: 1, height: 1 }
  let vector = false
  let actual = false
  let closing = false
  let hovered: HTMLImageElement | null = null
  let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null

  const isOpen = (): boolean => source !== null && !closing

  const build = (): void => {
    host = document.createElement('bibliotter-lightbox')
    host.hidden = true
    const root = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = STYLE
    backdrop = document.createElement('div')
    backdrop.className = 'backdrop'
    stage = document.createElement('div')
    stage.className = 'stage'
    canvas = document.createElement('div')
    canvas.className = 'canvas'
    picture = document.createElement('img')
    picture.className = 'picture'
    picture.alt = ''
    picture.draggable = false
    canvas.append(picture)
    stage.append(canvas)
    closeButton = document.createElement('button')
    closeButton.className = 'close'
    closeButton.type = 'button'
    closeButton.append(closeIcon())
    root.append(style, backdrop, stage, closeButton)
    document.documentElement.append(host)

    // Kliknięcia w powiększeniu nie docierają do skryptów dokumentu.
    for (const type of ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'contextmenu'] as const) {
      root.addEventListener(type, (event) => event.stopPropagation())
    }
    host.addEventListener('wheel', (event) => {
      if (!actual) event.preventDefault()
    }, { passive: false })
    closeButton.addEventListener('click', () => close())
    stage.addEventListener('click', (event) => {
      if (event.target === stage || event.target === canvas) close()
    })
    picture.addEventListener('pointerdown', pressPicture)
    picture.addEventListener('pointermove', dragPicture)
    picture.addEventListener('pointerup', releasePicture)
    picture.addEventListener('pointercancel', () => {
      drag = null
      picture.classList.remove('held')
    })
  }

  /** Host ma rozmiar widoku na ekranie i kontruje powiększenie kamery, więc rysuje w pikselach ekranu. */
  const placeHost = (): void => {
    if (!host) return
    const { scale, left, top } = zoom()
    const { width, height } = viewSize()
    host.style.cssText = [
      'all: initial',
      'position: fixed',
      `left: ${left}px`,
      `top: ${top}px`,
      `width: ${width}px`,
      `height: ${height}px`,
      `z-index: ${MAX_Z_INDEX}`,
      'transform-origin: 0 0',
      scale === 1 ? '' : `transform: scale(${1 / scale})`,
      host.hidden ? 'display: none' : 'display: block'
    ].join(';')
  }

  /** Miejsce obrazka na płótnie, bez przewinięcia. */
  let placed: Box = { x: 0, y: 0, width: 1, height: 1 }

  const setPicture = (box: Box): void => {
    placed = box
    picture.style.width = `${box.width}px`
    picture.style.height = `${box.height}px`
    picture.style.translate = `${box.x}px ${box.y}px`
  }

  /** Miejsce obrazka widoczne teraz w hoście, z przewinięciem w trybie rzeczywistego rozmiaru. */
  const visibleBox = (): Box => ({ ...placed, x: placed.x - stage.scrollLeft, y: placed.y - stage.scrollTop })

  const fly = (from: Box, to: Box): Animation =>
    picture.animate([{ transform: flight(from, to) }, { transform: 'none' }], { duration: FLY_MS, easing: SPRING })

  const layoutFit = (): Box => {
    const { width, height } = viewSize()
    stage.classList.remove('actual')
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    stage.scrollTo(0, 0)
    const box = fitBox(natural, vector)
    setPicture(box)
    picture.classList.toggle('grows', canGrow(box))
    return box
  }

  /** Rzeczywiste piksele, gdy dopasowany obrazek jest od nich wyraźnie mniejszy. */
  const canGrow = (fit: Box): boolean => !vector && natural.width > fit.width * 1.05

  const layoutActual = (anchor: { x: number; y: number }, from: Box): Box => {
    const { width, height } = viewSize()
    const bottom = Math.max(MARGIN, DOC_FOOT)
    const canvasWidth = Math.max(width, natural.width + 2 * MARGIN)
    const canvasHeight = Math.max(height, natural.height + MARGIN + bottom)
    stage.classList.add('actual')
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`
    const box = {
      x: Math.max(MARGIN, (width - natural.width) / 2),
      y: Math.max(MARGIN, (height - bottom + MARGIN - natural.height) / 2),
      width: natural.width,
      height: natural.height
    }
    setPicture(box)
    // Punkt pod kursorem zostaje pod kursorem.
    const fx = (anchor.x - from.x) / from.width
    const fy = (anchor.y - from.y) / from.height
    stage.scrollTo(box.x + fx * box.width - anchor.x, box.y + fy * box.height - anchor.y)
    return box
  }

  const open = (image: HTMLImageElement): void => {
    const shown = shownBox(image)
    if (!shown) return
    if (!host) build()
    if (!host) return
    for (const element of [picture, backdrop, closeButton]) element.getAnimations().forEach((animation) => animation.cancel())
    source = image
    closing = false
    actual = false
    natural = naturalSize(image, shown)
    vector = isVector(sourceOf(image))
    picture.src = sourceOf(image)
    picture.style.backgroundColor = paperOf()
    picture.style.borderRadius = getComputedStyle(image).borderRadius
    closeButton.setAttribute('aria-label', t('Zamknij'))
    closeButton.title = t('Zamknij')
    host.hidden = false
    placeHost()
    const fit = layoutFit()
    fly(shown, fit)
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' })
    closeButton.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, delay: 120, easing: 'ease-out', fill: 'backwards' })
    setCursor(null)
  }

  const finish = (): void => {
    if (!host) return
    host.hidden = true
    placeHost()
    picture.removeAttribute('src')
    // Wygaszanie trzyma stan końcowy, więc zostałoby na następne otwarcie.
    for (const element of [picture, backdrop, closeButton]) element.getAnimations().forEach((animation) => animation.cancel())
    source = null
    closing = false
    actual = false
    drag = null
  }

  const close = (): void => {
    if (!host || !source || closing) return
    closing = true
    const from = visibleBox()
    const back = source.isConnected ? shownBox(source) : null
    const duration = back ? FLY_MS * 0.72 : FADE_MS
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, delay: back ? 60 : 0, easing: 'ease-in', fill: 'forwards' })
    closeButton.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' })
    const flying = back
      ? picture.animate([{ transform: 'none' }, { transform: flight(back, from) }], { duration, easing: SPRING, fill: 'forwards' })
      : picture.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards' })
    // Oryginał wraca do roli, gdy kopia już na nim siedzi, a ruch sprężyny po nim już nie widać.
    void flying.finished.then(() => {
      if (closing) finish()
    }, () => {})
  }

  const toggleActual = (at: { x: number; y: number }): void => {
    const from = visibleBox()
    if (actual) {
      actual = false
      fly(from, layoutFit())
    } else if (canGrow(from)) {
      actual = true
      layoutActual(at, from)
      fly(from, visibleBox())
    }
  }

  function pressPicture(event: PointerEvent): void {
    if (event.button !== 0 || closing) return
    drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false }
    if (actual) {
      picture.setPointerCapture(event.pointerId)
      picture.classList.add('held')
    }
  }

  function dragPicture(event: PointerEvent): void {
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return
    drag.moved = true
    if (actual) stage.scrollTo(drag.left - dx, drag.top - dy)
  }

  function releasePicture(event: PointerEvent): void {
    const held = drag
    drag = null
    picture.classList.remove('held')
    if (!held || held.moved || event.button !== 0 || closing) return
    // Pozycja w hoście: host kontruje kamerę, więc liczy w pikselach ekranu.
    const box = host?.getBoundingClientRect()
    const scale = zoom().scale
    const at = { x: (event.clientX - (box?.left ?? 0)) * scale, y: (event.clientY - (box?.top ?? 0)) * scale }
    if (actual || picture.classList.contains('grows')) toggleActual(at)
    else close()
  }

  const setCursor = (image: HTMLImageElement | null): void => {
    if (image === hovered) return
    hovered = image
    bridge.setCursor(image !== null)
  }

  // Ruch, a nie samo wejście, bo po zamknięciu powiększenia wskaźnik stoi już nad obrazkiem.
  window.addEventListener(
    'pointermove',
    (event) => {
      if (!event.isTrusted) return
      const image = imageAt(event)
      const free = !isOpen() && !bridge.busy()
      if (image && image === hovered && free) return
      // Własny styl kursora schodzi przed sprawdzeniem, bo zasłoniłby kursor dokumentu.
      setCursor(null)
      if (image && free && zoomable(image)) setCursor(image)
    },
    true
  )

  window.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      if (isOpen() || bridge.busy()) return
      const image = imageAt(event)
      // Obrazek spod wskaźnika ma już własny kursor, więc kursora dokumentu nie da się sprawdzić drugi raz.
      if (!image || !zoomable(image, image !== hovered)) return
      if (window.getSelection()?.isCollapsed === false) return
      // Dokument może obsłużyć kliknięcie sam, więc decydujemy po jego nasłuchach, jak przy linkach.
      const decide = (current: Event = event): void => {
        if (current !== event) return
        window.removeEventListener('click', decide)
        clearTimeout(timer)
        if (event.defaultPrevented || !image.isConnected) return
        event.preventDefault()
        open(image)
      }
      window.addEventListener('click', decide)
      const timer = window.setTimeout(decide)
    },
    true
  )

  window.addEventListener(
    'keydown',
    (event) => {
      if (!isOpen() || !event.isTrusted || event.ctrlKey || event.metaKey) return
      // Klawisze nie przewijają strony pod spodem ani nie przełączają trybów.
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === 'Escape') close()
      else if (event.key === 'Enter' || event.key === ' ') {
        const { width, height } = viewSize()
        toggleActual({ x: width / 2, y: height / 2 })
      }
    },
    true
  )

  const refit = (): void => {
    if (!isOpen()) return
    placeHost()
    if (actual) {
      const { width, height } = viewSize()
      layoutActual({ x: width / 2, y: height / 2 }, visibleBox())
    } else layoutFit()
  }
  window.addEventListener('resize', refit)
  window.visualViewport?.addEventListener('resize', refit)
  window.visualViewport?.addEventListener('scroll', refit)

  return {
    close() {
      if (source && !closing) finish()
    }
  }
}
