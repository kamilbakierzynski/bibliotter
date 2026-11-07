import type { Anchor, FractionBox } from './annotations'
import type { CameraShot } from './camera'

/*
 * Trasa prezentacji: płaska lista kroków, a każdy krok to jedno kliknięcie na spotkaniu.
 * Krok mówi, dokąd patrzy kamera, co robi reszta dokumentu i które uwagi widać. Same uwagi
 * i kształty należą do dokumentu, więc krok trzyma tylko ich identyfikatory.
 *
 * Stan ekranu liczy się z samego numeru kroku, bez historii, więc skok wstecz i do dowolnego
 * kroku nie potrzebuje osobnej logiki. Moduł nie zna DOM ani Electrona.
 */

/** `hold` zostawia kamerę z poprzedniego kroku, `place` kadruje element, a `area` jego kawałek. */
export type StepCamera =
  | { kind: 'hold' }
  | { kind: 'place'; anchor: Anchor }
  | { kind: 'area'; anchor: Anchor; box: FractionBox }

export const STEP_RESTS = ['normal', 'dim', 'hide'] as const
/** Co dzieje się z dokumentem poza kadrem. */
export type StepRest = (typeof STEP_RESTS)[number]

export interface PresentationStep {
  id: string
  /** Pusty tytuł formularz pokazuje jako „Krok N”. */
  title: string
  camera: StepCamera
  rest: StepRest
  /** Identyfikatory uwag widocznych w tym kroku. */
  show: string[]
}

export interface Presentation {
  steps: PresentationStep[]
}

/** Kadr kroku dla formularza i podglądu w dokumencie. */
export interface RouteFrame {
  id: string
  camera: StepCamera
  label: string
}

export type PickKind = 'place' | 'area'

/**
 * Co dokument pokazuje w kroku prezentacji. `camera` to kadr, który widać, także odziedziczony
 * po wcześniejszym kroku, bo wokół niego leży maska. `pending` to kształty, które dopiero
 * narysują się na oczach widzów, gdy kamera stanie.
 */
export interface PresentState {
  show: string[]
  /** Przełącznik rysunków w prezentacji odsłania wszystkie uwagi i kształty dokumentu. */
  reveal: boolean
  rest: StepRest
  camera: StepCamera | null
  pending: string[]
}

export const MAX_STEPS = 200
export const MAX_STEP_TITLE = 120
/** Krok pokazuje kilka rzeczy, a nie całą bibliotekę uwag. */
export const MAX_STEP_SHOW = 200
export const STEP_ID = /^[A-Za-z0-9_-]{1,40}$/

export const emptyPresentation = (): Presentation => ({ steps: [] })

/** Kadr kamery z kroku. `hold` nie ma własnego kadru. */
export function stepShot(camera: StepCamera): CameraShot | null {
  if (camera.kind === 'place') return { anchor: camera.anchor }
  if (camera.kind === 'area') return { anchor: camera.anchor, box: camera.box }
  return null
}

const NONE: ReadonlySet<string> = new Set()

/** Krok ma kadr, którego nie ma już w dokumencie. Prezentacja go pomija. */
const lost = (step: PresentationStep, missing: ReadonlySet<string>): boolean =>
  step.camera.kind !== 'hold' && missing.has(step.id)

/**
 * Numer kroku, którego kadr widać w kroku `index`: `hold` sięga wstecz. `-1` to cały dokument.
 * Kroki z `missing` nie mają kadru w dokumencie, więc `hold` sięga za nie.
 */
export function shotOwner(steps: readonly PresentationStep[], index: number, missing = NONE): number {
  for (let i = Math.min(index, steps.length - 1); i >= 0; i--) {
    const step = steps[i] as PresentationStep
    if (step.camera.kind !== 'hold' && !lost(step, missing)) return i
  }
  return -1
}

/** Kadr widoczny w kroku: `hold` bierze kadr najbliższego wcześniejszego kroku, który go ma. */
export function shotAt(steps: readonly PresentationStep[], index: number, missing = NONE): CameraShot | null {
  const owner = shotOwner(steps, index, missing)
  return owner < 0 ? null : stepShot((steps[owner] as PresentationStep).camera)
}

/** Kroki, które prezentacja pokaże, w kolejności trasy. Krok bez swojego kadru wypada. */
export function playable(steps: readonly PresentationStep[], missing = NONE): number[] {
  return steps.flatMap((step, i) => (lost(step, missing) ? [] : [i]))
}

/** Najbliższy krok do pokazania w stronę `direction` od `index`, a `null`, gdy dalej nie ma kroków. */
export function stepFrom(
  steps: readonly PresentationStep[],
  index: number,
  direction: 1 | -1,
  missing = NONE
): number | null {
  const list = playable(steps, missing)
  const found = direction > 0 ? list.find((i) => i > index) : [...list].reverse().find((i) => i < index)
  return found ?? null
}

/**
 * Stan dokumentu w kroku, bez kształtów do narysowania. Maska leży wokół kadru, który widać,
 * także odziedziczonego, a przy całym dokumencie nie ma czego zasłaniać.
 */
export function stepState(
  steps: readonly PresentationStep[],
  index: number,
  reveal: boolean,
  missing = NONE
): Omit<PresentState, 'pending'> {
  const step = steps[index]
  const owner = shotOwner(steps, index, missing)
  const camera = owner < 0 ? null : (steps[owner] as PresentationStep).camera
  return { show: [...(step?.show ?? [])], reveal, rest: step?.rest ?? 'normal', camera }
}

/** Nowy krok startuje jako kopia poprzedniego: ta sama reszta dokumentu i te same uwagi, kamera stoi. */
export function nextStep(previous: PresentationStep | undefined, id: string): PresentationStep {
  return {
    id,
    title: '',
    camera: { kind: 'hold' },
    rest: previous?.rest ?? 'normal',
    show: [...(previous?.show ?? [])]
  }
}

/** Przesuwa krok o `delta` miejsc, w granicach listy. Zwraca nową listę albo tę samą, gdy nie ma ruchu. */
export function moveStep(steps: readonly PresentationStep[], id: string, delta: number): PresentationStep[] {
  const from = steps.findIndex((step) => step.id === id)
  if (from < 0) return [...steps]
  const to = Math.min(steps.length - 1, Math.max(0, from + delta))
  if (to === from) return [...steps]
  const next = [...steps]
  const [step] = next.splice(from, 1)
  next.splice(to, 0, step as PresentationStep)
  return next
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
/** Kadr może nieco wyjść poza element, ale nie dowolnie daleko. */
const MAX_BOX_REACH = 1000

function parseBox(value: unknown): FractionBox | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y, width, height } = value as Record<string, unknown>
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return null
  if (width <= 0 || height <= 0 || [x, y, width, height].some((part) => Math.abs(part) > MAX_BOX_REACH)) return null
  return { x, y, width, height }
}

export function parseStepCamera(value: unknown, parseAnchor: (value: unknown) => Anchor | null): StepCamera | null {
  if (typeof value !== 'object' || value === null) return null
  const camera = value as Record<string, unknown>
  if (camera.kind === 'hold') return { kind: 'hold' }
  const anchor = parseAnchor(camera.anchor)
  if (!anchor) return null
  if (camera.kind === 'place') return { kind: 'place', anchor }
  if (camera.kind !== 'area') return null
  const box = parseBox(camera.box)
  return box ? { kind: 'area', anchor, box } : null
}

const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length <= 64))].slice(0, MAX_STEP_SHOW)
    : []

/** Stan kroku idzie z powłoki do dokumentu, więc sprawdzamy go jak trasę. */
export function parsePresentState(value: unknown, parseAnchor: (value: unknown) => Anchor | null): PresentState | null {
  if (typeof value !== 'object' || value === null) return null
  const state = value as Record<string, unknown>
  const camera = state.camera === null || state.camera === undefined ? null : parseStepCamera(state.camera, parseAnchor)
  return {
    show: ids(state.show),
    reveal: state.reveal === true,
    rest: STEP_RESTS.includes(state.rest as StepRest) ? (state.rest as StepRest) : 'normal',
    camera: camera?.kind === 'hold' ? null : camera,
    pending: ids(state.pending)
  }
}

/**
 * Trasa przychodzi z formularza albo z pliku, który mógł napisać agent, więc sprawdzamy ją jak
 * kotwice uwag. Zły krok psuje tylko siebie: znika z listy, a reszta trasy zostaje.
 */
export function parsePresentation(value: unknown, parseAnchor: (value: unknown) => Anchor | null): Presentation | null {
  if (typeof value !== 'object' || value === null) return null
  const { steps } = value as Record<string, unknown>
  if (!Array.isArray(steps)) return null
  const seen = new Set<string>()
  const parsed: PresentationStep[] = []
  for (const raw of steps.slice(0, MAX_STEPS)) {
    if (typeof raw !== 'object' || raw === null) continue
    const step = raw as Record<string, unknown>
    if (typeof step.id !== 'string' || !STEP_ID.test(step.id) || seen.has(step.id)) continue
    const camera = parseStepCamera(step.camera ?? { kind: 'hold' }, parseAnchor)
    if (!camera) continue
    seen.add(step.id)
    parsed.push({
      id: step.id,
      // Bez przycinania spacji: formularz zapisuje w trakcie pisania, a odczyt nie może zjeść spacji między słowami.
      title: typeof step.title === 'string' ? step.title.slice(0, MAX_STEP_TITLE) : '',
      camera,
      rest: STEP_RESTS.includes(step.rest as StepRest) ? (step.rest as StepRest) : 'normal',
      show: ids(step.show)
    })
  }
  return { steps: parsed }
}
