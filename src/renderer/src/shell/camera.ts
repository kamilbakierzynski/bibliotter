import {
  type CameraMove,
  type CameraPlan,
  type CameraShot,
  type CameraView,
  cameraAt,
  frameTransform,
  MAX_PAN_MS
} from '../../../shared/camera'
import { clamp, connectLoop, Spring } from '../motion/spring'
import { coverAndWait, grab, placeShot, shownFrame, uncover, uncoverAndWait } from './native'
import { openPane, ui } from './state'

/*
 * Ruch kamery w arkuszu. Skala strony zmieniana co klatkę szarpie, więc widok dokumentu schodzi
 * na czas ruchu, a powłoka pokazuje dwa zrzuty: sprzed ruchu i po nim. Gdy jeden kadr mieści się
 * w drugim, oba zrzuty leżą w jednym układzie strony i kamera przejeżdża przez nie jak przez jedną
 * scenę. Szerszy zrzut leży pod spodem, a ostrzejszy, z większą skalą, przenika go z góry.
 *
 * Skok w odległe miejsce nie ma pikseli na drogę, bo zrzut obejmuje tylko widoczny kadr. Wtedy
 * kamera jedzie po samej stronie: oddala się na zrzutach do skali przejazdu, żywy widok przewija
 * się płynnie do celu, a na końcu kamera zbliża się do kadru, znowu na zrzutach. Gdy żywy widok
 * nie może stanąć, stary obraz odpływa w stronę ruchu, a nowy wpływa za nim.
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
/** Oddalenie i zbliżenie w podróży są szybsze, bo razem z przejazdem składają się na jeden ruch. */
const LEG = { k: 210, z: 1 }
/** Przejazd po stronie przesuwa ekran najwyżej o tyle wysokości widoku. Dalej kamera się oddala. */
const TRAVEL_SCREENS = 2.5
/** Czas przejazdu rośnie z drogą na ekranie, w milisekundach na piksel. */
const PAN_BASE_MS = 320
const PAN_MS_PER_PX = 0.16
const PAN_MIN_MS = 420
const SAME_SCALE = 1e-3

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

function fly(
  start: HTMLCanvasElement,
  end: HTMLCanvasElement,
  path: CameraMove,
  width: number,
  height: number,
  spring: { k: number; z: number } = MOVE
): Promise<void> {
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
    progress.to(1, spring)
  })
}

export interface AimOptions {
  /**
   * Zmiana w dokumencie, która ma wejść w kadr końcowy, np. maska prezentacji. Biegnie po zrzucie
   * startowym, a przed ruchem, więc widzowie widzą ją jako część przelotu, a nie osobny błysk.
   */
  before?: () => Promise<void> | void
  /** Ruch czekał w kolejce, a w tym czasie przestał być potrzebny, np. bo prezentacja się skończyła. */
  skip?: () => boolean
  /**
   * Zmiana na czas przejazdu po stronie między odległymi kadrami, np. zdjęcie maski, żeby widzowie
   * widzieli drogę. Biegnie przed oddaleniem kamery, a `before` przed zbliżeniem do nowego kadru.
   */
  travel?: () => Promise<void> | void
}

const still = (path: CameraMove): boolean =>
  Math.abs(path.to.scale - path.from.scale) < SAME_SCALE &&
  Math.abs(path.to.left - path.from.left) < 0.5 &&
  Math.abs(path.to.top - path.from.top) < 0.5

/**
 * Jeden ruch na zrzutach, gdy arkusz jest już zasłonięty: zrzut startowy, zmiana w dokumencie, ruch
 * kamery, zrzut końcowy i przelot. `false` znaczy, że ruch się nie udał, a `null`, że kamera stała.
 */
async function shotLeg(
  i: number,
  docId: string,
  aim: () => Promise<CameraMove | null>,
  change: (() => Promise<void> | void) | undefined,
  spring: { k: number; z: number },
  skipStill = false
): Promise<CameraMove | null | false> {
  const start = shownFrame(i)
  await change?.()
  const moved = await aim()
  // Kamera nie ruszyła, ale haczyk zmienił dokument, więc zmiana przenika w miejscu.
  const stood = !moved || (skipStill && still(moved))
  if (stood && !change) return moved
  const path = stood ? STILL : moved
  if (stood) await new Promise((done) => setTimeout(done, REPAINT_MS))
  const end = await grab(docId)
  if (!end || ui.panes[i] !== docId) return false
  if (start?.parentElement) {
    const scale = devicePixelRatio
    await fly(start, end.canvas, path, end.width / scale, end.height / scale, spring)
    end.canvas.remove()
    end.canvas.style.transform = ''
    end.canvas.style.transformOrigin = ''
    end.canvas.style.opacity = ''
  }
  placeShot(i, end)
  return moved
}

/** Środek widoku na stronie. */
function middle(view: CameraView, plan: CameraPlan): { x: number; y: number } {
  return {
    x: view.left + plan.viewport.width / (2 * view.scale),
    y: view.top + plan.viewport.height / (2 * view.scale)
  }
}

/**
 * Podróż między kadrami, których zrzuty się nie pokrywają. Kamera oddala się do skali, w której
 * przejazd nie przesuwa ekranu dalej niż o kilka wysokości widoku, ale nie poniżej całej strony.
 * Potem żywy widok przewija się do celu, a kamera zbliża się do kadru.
 */
async function voyage(i: number, docId: string, shot: CameraShot, plan: CameraPlan, options: AimOptions): Promise<boolean> {
  const from = middle(plan.from, plan)
  const to = middle(plan.to, plan)
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const lower = Math.min(plan.from.scale, plan.to.scale)
  const scale = Math.max(1, Math.min(lower, (TRAVEL_SCREENS * plan.viewport.height) / Math.max(distance, 1)))
  const ms = Math.min(MAX_PAN_MS, Math.max(PAN_MIN_MS, PAN_BASE_MS + PAN_MS_PER_PX * distance * scale))

  await coverAndWait(REASON)
  let live = false
  try {
    const away = Math.abs(plan.from.scale - scale) > SAME_SCALE
    if (away || options.travel) {
      const left = await shotLeg(
        i,
        docId,
        () => (away ? window.api.steerCamera(docId, { type: 'pose', x: from.x, y: from.y, scale }) : Promise.resolve(null)),
        options.travel,
        LEG,
        true
      )
      if (left === false) return false
    }
    if (options.skip?.()) return true
    live = await uncoverAndWait(REASON, i)
    // Bez żywego widoku przejazdu nie widać, więc widok staje od razu u celu, a obrazy przenikają.
    await window.api.steerCamera(docId, { type: 'pan', x: to.x, y: to.y, ms: live ? ms : 0 })
  } finally {
    if (!live) uncover(REASON)
  }
  if (options.skip?.()) return true
  await coverAndWait(REASON)
  try {
    const arrived = await shotLeg(i, docId, () => window.api.aimCamera(docId, shot), options.before, live ? LEG : MOVE, true)
    return arrived !== false
  } finally {
    uncover(REASON)
  }
}

async function move(i: number, shot: CameraShot | null, options: AimOptions): Promise<boolean> {
  const docId = ui.panes[i]
  if (!docId || options.skip?.()) return false
  const plan = shot ? await window.api.planCamera(docId, shot) : null
  if (shot && plan && !nests(plan, plan.viewport.width, plan.viewport.height)) {
    return voyage(i, docId, shot, plan, options)
  }
  await coverAndWait(REASON)
  try {
    const moved = await shotLeg(i, docId, () => window.api.aimCamera(docId, shot), options.before, MOVE)
    return moved !== false && moved !== null
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
