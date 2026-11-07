import type { Anchor, FractionBox } from './annotations'

export type { FractionBox } from './annotations'

/*
 * Kamera powiększa dokument skalą strony, czyli tak jak gest szczypania. Układ strony zostaje
 * nietknięty: tekst się nie przelewa, a współrzędne elementów i kliknięć są takie same jak bez
 * powiększenia. Zmienia się tylko to, który kawałek strony widać i jak duży.
 *
 * Ruch kamery pokazuje powłoka na zrzutach, bo zmiana skali co klatkę szarpie. Ten moduł liczy
 * kadr i drogę pomiędzy dwoma widokami, a nie wie nic o Electronie ani o DOM.
 */

/** Najmocniejsze powiększenie. Powyżej tekst jest już większy niż nagłówek na całym ekranie. */
export const MAX_CAMERA_SCALE = 4
/** Kadr nie dotyka krawędzi ekranu. */
const FILL = 0.9
/** Poniżej tej różnicy powiększenie uznajemy za to samo, więc kamera tylko przesuwa widok. */
const SAME_SCALE = 1e-3

/** Prostokąt w pikselach CSS strony, czyli razem z przewinięciem. */
export interface PageRect {
  x: number
  y: number
  width: number
  height: number
}

/** Kadr kamery: element z kotwicy, opcjonalnie tylko jego kawałek, albo prostokąt na stronie. */
export type CameraShot = { anchor: Anchor; box?: FractionBox } | { rect: PageRect }

/** Co widać w widoku: lewy górny róg w pikselach strony i powiększenie. */
export interface CameraView {
  left: number
  top: number
  scale: number
}

export interface CameraMove {
  from: CameraView
  to: CameraView
}

/** Widok dokumentu w pikselach CSS. `foot` to pas na dole, nad którym pływa dok. */
export interface CameraViewport {
  width: number
  height: number
  foot: number
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function parseBox(value: unknown): PageRect | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y, width, height } = value as Record<string, unknown>
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

/** Kadr przychodzi z powłoki, a potem idzie do dokumentu, więc sprawdzamy jego kształt. */
export function parseCameraShot(value: unknown, parseAnchor: (value: unknown) => Anchor | null): CameraShot | null {
  if (typeof value !== 'object' || value === null) return null
  const shot = value as Record<string, unknown>
  if ('rect' in shot) {
    const rect = parseBox(shot.rect)
    return rect ? { rect } : null
  }
  const anchor = parseAnchor(shot.anchor)
  if (!anchor) return null
  if (shot.box === undefined) return { anchor }
  const box = parseBox(shot.box)
  return box ? { anchor, box } : null
}

export function parseCameraView(value: unknown): CameraView | null {
  if (typeof value !== 'object' || value === null) return null
  const { left, top, scale } = value as Record<string, unknown>
  return finite(left) && finite(top) && finite(scale) && scale > 0 ? { left, top, scale } : null
}

/** Prostokąt elementu na stronie zawężony do kawałka z kadru. */
export function boxWithin(element: PageRect, box: FractionBox | undefined): PageRect {
  if (!box) return element
  return {
    x: element.x + box.x * element.width,
    y: element.y + box.y * element.height,
    width: Math.max(box.width * element.width, 1),
    height: Math.max(box.height * element.height, 1)
  }
}

/**
 * Powiększenie, przy którym kadr wypełnia widok nad dokiem, i punkt strony, który ma stanąć
 * w środku widoku. Środek leży nieco niżej niż środek kadru, bo kadr ma stanąć nad dokiem.
 */
export function fitShot(target: PageRect, viewport: CameraViewport): { scale: number; centerX: number; centerY: number } {
  const room = Math.max(viewport.height - viewport.foot, 1)
  const fit = Math.min(viewport.width / Math.max(target.width, 1), room / Math.max(target.height, 1)) * FILL
  const scale = Math.min(MAX_CAMERA_SCALE, Math.max(1, fit))
  return {
    scale,
    centerX: target.x + target.width / 2,
    centerY: target.y + target.height / 2 + viewport.foot / (2 * scale)
  }
}

/**
 * Widok w połowie drogi. Powiększenie rośnie geometrycznie, bo tak odbiera je oko, a strona
 * powiększa się wokół jedynego punktu, który w obu widokach stoi w tym samym miejscu ekranu.
 * Dzięki temu ruch wygląda jak gest szczypania, a nie jak osobny zoom i osobne przewinięcie.
 */
export function cameraAt(move: CameraMove, progress: number): CameraView {
  const { from, to } = move
  if (Math.abs(to.scale - from.scale) < SAME_SCALE) {
    return {
      left: from.left + (to.left - from.left) * progress,
      top: from.top + (to.top - from.top) * progress,
      scale: from.scale + (to.scale - from.scale) * progress
    }
  }
  const scale = from.scale * Math.pow(to.scale / from.scale, progress)
  const fixed = (a: number, b: number): number => (b * to.scale - a * from.scale) / (to.scale - from.scale)
  const fixedX = fixed(from.left, to.left)
  const fixedY = fixed(from.top, to.top)
  return {
    left: fixedX - ((fixedX - from.left) * from.scale) / scale,
    top: fixedY - ((fixedY - from.top) * from.scale) / scale,
    scale
  }
}

/**
 * Jak przesunąć i powiększyć zrzut zrobiony w widoku `image`, żeby pokazywał to, co widać
 * w widoku `at`. Przesunięcie jest w pikselach ekranu, a punkt odniesienia to lewy górny róg.
 */
export function frameTransform(image: CameraView, at: CameraView): { x: number; y: number; scale: number } {
  return {
    x: (image.left - at.left) * at.scale,
    y: (image.top - at.top) * at.scale,
    scale: at.scale / image.scale
  }
}
