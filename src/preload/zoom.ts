import type { OverlayRect } from '../shared/annotations'

/*
 * Kamera powiększa stronę skalą strony, więc układ i współrzędne elementów zostają bez zmian,
 * a zmienia się tylko widoczny kawałek. Warstwa liczy wszystko w układzie strony, a ten moduł
 * przelicza to na ekran widoku tam, gdzie liczy się to, co widać.
 */

export interface Zoom {
  scale: number
  /** Lewy górny róg widocznego kawałka w układzie okna strony. */
  left: number
  top: number
}

export function zoom(): Zoom {
  const view = window.visualViewport
  return view ? { scale: view.scale, left: view.offsetLeft, top: view.offsetTop } : { scale: 1, left: 0, top: 0 }
}

/** Prostokąt z układu okna strony w pikselach ekranu widoku, jak go widzi powłoka. */
export function onScreen({ x, y, width, height }: OverlayRect): OverlayRect {
  const { scale, left, top } = zoom()
  if (scale === 1 && left === 0 && top === 0) return { x, y, width, height }
  return { x: (x - left) * scale, y: (y - top) * scale, width: width * scale, height: height * scale }
}

/** Punkt z układu okna strony na ekranie widoku. */
export function toScreen(x: number, y: number, at: Zoom = zoom()): { x: number; y: number } {
  return { x: (x - at.left) * at.scale, y: (y - at.top) * at.scale }
}

/** Punkt z ekranu widoku w układzie okna strony. */
export function fromScreen(x: number, y: number, at: Zoom = zoom()): { x: number; y: number } {
  return { x: at.left + x / at.scale, y: at.top + y / at.scale }
}

/** Woła przy każdej zmianie powiększenia albo widocznego kawałka. */
export function onZoom(listener: () => void): void {
  window.visualViewport?.addEventListener('resize', listener)
  window.visualViewport?.addEventListener('scroll', listener)
}

/** Rozmiar widocznego kawałka w pikselach ekranu widoku. */
export function screenSize(at: Zoom = zoom()): { width: number; height: number } {
  const view = window.visualViewport
  if (!view || at.scale === 1) return { width: innerWidth, height: innerHeight }
  return { width: view.width * at.scale, height: view.height * at.scale }
}

const fitted = new WeakMap<HTMLElement, string>()
const FITTED = ['inset', 'width', 'height', 'transform', 'transform-origin']

/**
 * Kładzie warstwę `position: fixed` na widocznym kawałku strony i skaluje ją odwrotnie do strony.
 * Jej treść liczy się wtedy w pikselach ekranu, więc ma ten sam rozmiar przy każdym powiększeniu.
 */
export function fitScreen(element: HTMLElement, at: Zoom = zoom()): void {
  const zoomed = at.scale !== 1
  const { width, height } = screenSize(at)
  const key = zoomed ? `${at.left} ${at.top} ${width} ${height} ${at.scale}` : ''
  if ((fitted.get(element) ?? '') === key) return
  fitted.set(element, key)
  const style = element.style
  if (!zoomed) {
    for (const name of FITTED) style.removeProperty(name)
    return
  }
  style.inset = `${at.top}px auto auto ${at.left}px`
  style.width = `${width}px`
  style.height = `${height}px`
  style.transformOrigin = '0 0'
  style.transform = `scale(${1 / at.scale})`
}
