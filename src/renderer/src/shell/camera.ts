import { type CameraMove, type CameraShot, type CameraView, cameraAt, frameTransform } from '../../../shared/camera'
import { clamp, connectLoop, Spring } from '../motion/spring'
import { coverAndWait, grab, placeShot, shownFrame, uncover } from './native'
import { openPane, ui } from './state'

/*
 * Ruch kamery w arkuszu. Skala strony zmieniana co klatkę szarpie, więc widok dokumentu schodzi
 * na czas ruchu, a powłoka pokazuje dwa zrzuty: sprzed ruchu i po nim. Gdy jeden kadr mieści się
 * w drugim, oba zrzuty leżą w jednym układzie strony i kamera przejeżdża przez nie jak przez jedną
 * scenę. Szerszy zrzut leży pod spodem, a ostrzejszy, z większą skalą, przenika go z góry.
 *
 * Skok w odległe miejsce nie ma pikseli na drogę, bo zrzut obejmuje tylko widoczny kadr. Wtedy
 * stary obraz odpływa w stronę ruchu, a nowy wpływa za nim. Gdy sprężyna stanie, wraca żywy widok.
 */

const REASON = 'camera'
/** Ta sama krzywa co przejścia w CSS, bez wyraźnego przestrzału. */
const MOVE = { k: 120, z: 0.92 }
/** Ostrzejszy zrzut wchodzi, gdy kadr jest już blisko, bo wcześniej zajmuje mały kawałek ekranu. */
const FADE_FROM = 0.2
const FADE_SPAN = 0.6
/** Tyle węższego kadru musi leżeć w szerszym, żeby kamera mogła przejechać przez oba zrzuty. */
const NESTED = 0.85
/** Przy skoku obrazy odpływają o tyle pikseli i lekko zmieniają skalę, żeby było widać kierunek. */
const DRIFT = 48
const DRIFT_SCALE = 0.04
const DISSOLVE_FROM = 0.1
const DISSOLVE_SPAN = 0.5
/** Kamera stoi, a zmienia się tylko treść kadru. Oba zrzuty leżą wtedy jeden na drugim. */
const STILL: CameraMove = { from: { left: 0, top: 0, scale: 1 }, to: { left: 0, top: 0, scale: 1 } }
/** Dokument potrzebuje chwili, żeby narysować zmianę, zanim zrobimy mu zrzut. */
const REPAINT_MS = 40

interface Pose {
  x: number
  y: number
  scale: number
}

interface Flight {
  start: HTMLCanvasElement
  end: HTMLCanvasElement
  path: CameraMove
  width: number
  height: number
  nested: boolean
  done: () => void
}

const progress = new Spring(1, MOVE.k, MOVE.z)
let flight: Flight | null = null
let queue: Promise<unknown> = Promise.resolve()

function pose(canvas: HTMLCanvasElement, { x, y, scale }: Pose): void {
  // Zrzut stoi w arkuszu wyśrodkowany, więc przesunięcie liczymy od tego miejsca.
  canvas.style.transform = `translateX(-50%) translate(${x}px, ${y}px) scale(${scale})`
}

interface Region {
  left: number
  top: number
  right: number
  bottom: number
}

function regionOf(view: CameraView, width: number, height: number): Region {
  return { left: view.left, top: view.top, right: view.left + width / view.scale, bottom: view.top + height / view.scale }
}

/** Czy węższy kadr leży prawie cały w szerszym. Wtedy szerszy zrzut pokrywa całą drogę kamery. */
function nests(path: CameraMove, width: number, height: number): boolean {
  const zoomsIn = path.to.scale >= path.from.scale
  const wide = regionOf(zoomsIn ? path.from : path.to, width, height)
  const narrow = regionOf(zoomsIn ? path.to : path.from, width, height)
  const across = Math.max(0, Math.min(wide.right, narrow.right) - Math.max(wide.left, narrow.left))
  const down = Math.max(0, Math.min(wide.bottom, narrow.bottom) - Math.max(wide.top, narrow.top))
  return (across * down) / ((narrow.right - narrow.left) * (narrow.bottom - narrow.top)) >= NESTED
}

/** Obraz wokół środka ekranu: przesunięty o `shift` i powiększony o `scale`. */
function drifted(current: Flight, shiftX: number, shiftY: number, scale: number): Pose {
  return {
    x: ((1 - scale) * current.width) / 2 + shiftX,
    y: ((1 - scale) * current.height) / 2 + shiftY,
    scale
  }
}

function draw(current: Flight, at: number): void {
  const { start, end, path } = current
  if (current.nested) {
    const view = cameraAt(path, at)
    pose(start, frameTransform(path.from, view))
    pose(end, frameTransform(path.to, view))
    const sharper = clamp((at - FADE_FROM) / FADE_SPAN)
    // Ostrzejszy zrzut leży na wierzchu: przy zbliżeniu to końcowy, przy oddaleniu startowy.
    if (path.to.scale >= path.from.scale) end.style.opacity = String(sharper)
    else start.style.opacity = String(1 - sharper)
    return
  }
  const from = regionOf(path.from, current.width, current.height)
  const to = regionOf(path.to, current.width, current.height)
  const dx = (to.left + to.right - from.left - from.right) / 2
  const dy = (to.top + to.bottom - from.top - from.bottom) / 2
  const length = Math.hypot(dx, dy) || 1
  // Treść jedzie w przeciwną stronę niż kamera.
  const ux = (-dx / length) * DRIFT
  const uy = (-dy / length) * DRIFT
  const grow = Math.sign(Math.log(path.to.scale / path.from.scale)) * DRIFT_SCALE
  const gone = clamp(at, 0, 1.2)
  pose(start, drifted(current, ux * gone, uy * gone, 1 + grow * gone))
  pose(end, drifted(current, -ux * (1 - gone), -uy * (1 - gone), 1 - grow * (1 - gone)))
  end.style.opacity = String(clamp((at - DISSOLVE_FROM) / DISSOLVE_SPAN))
}

connectLoop(
  () => {
    const current = flight
    if (!current) return
    if (!progress.rest) {
      draw(current, progress.x)
      return
    }
    flight = null
    draw(current, 1)
    current.done()
  },
  () => {}
)

function fly(start: HTMLCanvasElement, end: HTMLCanvasElement, path: CameraMove, width: number, height: number): Promise<void> {
  const stack = start.parentElement as HTMLElement
  const nested = nests(path, width, height)
  for (const canvas of [start, end]) canvas.style.transformOrigin = '0 0'
  // Na wierzchu leży obraz, który przenika: przy oddaleniu zbliżenie, w każdym innym ruchu nowy kadr.
  if (nested && path.to.scale < path.from.scale) stack.insertBefore(end, start)
  else {
    end.style.opacity = '0'
    stack.append(end)
  }
  return new Promise((done) => {
    flight = { start, end, path, width, height, nested, done }
    draw(flight, 0)
    progress.set(0)
    progress.to(1, MOVE)
  })
}

export interface AimOptions {
  /**
   * Zmiana w dokumencie, która ma wejść w kadr końcowy, np. maska prezentacji. Biegnie po zrzucie
   * startowym, a przed ruchem, więc widzowie widzą ją jako część przelotu, a nie osobny błysk.
   */
  before?: () => Promise<void> | void
}

async function move(i: number, shot: CameraShot | null, options: AimOptions): Promise<boolean> {
  const docId = ui.panes[i]
  if (!docId) return false
  await coverAndWait(REASON)
  try {
    const start = shownFrame(i)
    await options.before?.()
    const moved = await window.api.aimCamera(docId, shot)
    // Kamera nie ruszyła, ale haczyk zmienił dokument, więc zmiana przenika w miejscu.
    const path = moved ?? (options.before ? STILL : null)
    if (!path) return false
    if (!moved) await new Promise((done) => setTimeout(done, REPAINT_MS))
    const end = await grab(docId)
    if (!end || ui.panes[i] !== docId) return false
    if (start?.parentElement) {
      const scale = devicePixelRatio
      await fly(start, end.canvas, path, end.width / scale, end.height / scale)
      end.canvas.remove()
      end.canvas.style.transform = ''
      end.canvas.style.transformOrigin = ''
      end.canvas.style.opacity = ''
    }
    placeShot(i, end)
    return moved !== null
  } finally {
    uncover(REASON)
  }
}

/**
 * Ustawia kamerę arkusza na kadrze, a `null` wraca do całej strony. Kolejne wywołania czekają
 * na poprzednie, więc ruchy nie nakładają się na siebie. Wynik mówi, czy kamera ruszyła.
 */
export function aimCamera(i: number, shot: CameraShot | null, options: AimOptions = {}): Promise<boolean> {
  const run = queue.then(() => move(i, shot, options))
  queue = run.catch(() => false)
  return run
}

// Test e2e kamery prowadzi ją po identyfikatorze dokumentu, bez trasy i bez prezentacji.
Object.assign(window, {
  bibliotterCamera: {
    aim: (docId: string, shot: CameraShot | null): Promise<boolean> => {
      const i = openPane(docId)
      return i < 0 ? Promise.resolve(false) : aimCamera(i, shot)
    }
  }
})
