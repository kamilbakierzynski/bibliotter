import { randomBytes } from 'node:crypto'
import {
  type Anchor,
  type Annotation,
  type AnnotationKind,
  type AnnotationStatus,
  type FractionBox,
  type NewAnnotation,
  type ShapeType,
  STICKY_COLORS,
  type StickyColor
} from '../shared/annotations'
import {
  MAX_STEP_SHOW,
  MAX_STEP_TITLE,
  MAX_STEPS,
  parseStepCamera,
  type Presentation,
  type PresentationStep,
  STEP_ID,
  STEP_RESTS,
  type StepCamera,
  type StepRest
} from '../shared/presentation'
import { parseAnchor, parseShape } from './annotationStore'
import { analyzeHtml } from './classify'

/*
 * Trasa prezentacji w postaci dla agenta. Agent nie widzi układu strony, więc miejsce wskazuje
 * cytatem z tekstu dokumentu albo selektorem CSS, a kształt opisuje w ułamkach elementu. Cytat
 * sprawdzamy w tekście od razu: literówka wraca do agenta jako błąd, a nie jako krok, który apka
 * po cichu pominie, bo nie znalazła kadru.
 */

/** Apka szuka miejsca po początku cytatu, więc tylko ten początek musi być w tekście. */
const MATCH_LENGTH = 48
const QUOTE_LENGTH = 160
/**
 * Prostokąt i elipsa bez podanego pudełka obejmują element z zapasem. Elipsa wpisana w pudełko
 * ucina jego rogi, więc dostaje go więcej, żeby nie przecinała skrajnych liter cytatu.
 */
const AROUND: Record<'rect' | 'ellipse', FractionBox> = {
  rect: { x: -0.03, y: -0.12, width: 1.06, height: 1.24 },
  ellipse: { x: -0.15, y: -0.35, width: 1.3, height: 1.7 }
}
const DEFAULT_SHAPE_COLOR: StickyColor = 'pink'
const TEXT_LIMIT = 160

const clean = (text: string): string => text.replace(/\s+/g, ' ').trim()
/** Znaczniki rozdzielają tekst spacjami, których na stronie nie ma, więc porównujemy bez odstępów. */
const compact = (text: string): string => text.replace(/\s+/g, '')

export interface AgentPlace {
  quote?: string
  selector?: string
}

/** Punkt w elemencie: 0 to lewa albo górna krawędź, 1 prawa albo dolna. */
export interface AgentPoint extends AgentPlace {
  x?: number
  y?: number
}

export type AgentCamera =
  | { kind: 'hold' }
  | { kind: 'place'; quote: string; selector: string; heading: string | null }
  | { kind: 'area'; quote: string; selector: string; heading: string | null; box: FractionBox }

export interface AgentStep {
  id: string
  title: string
  camera: AgentCamera
  rest: StepRest
  show: string[]
}

/** Uwaga albo kształt, który krok może pokazać. Prywatna uwaga nie zdradza treści bez prośby. */
export interface AgentItem {
  id: string
  kind: AnnotationKind
  status: AnnotationStatus
  quote: string | null
  heading: string | null
  text?: string
  private?: true
  shape?: ShapeType
  color?: StickyColor | null
}

export interface AgentPresentation {
  steps: AgentStep[]
  items: AgentItem[]
}

export interface QuoteSpot {
  heading: string | null
  /** Cytat stoi w tekście więcej niż raz, a apka weźmie pierwsze trafienie. */
  repeated: boolean
}

/**
 * Szuka cytatu w tekście dokumentu i zwraca najbliższy wcześniejszy nagłówek, jak warstwa
 * w dokumencie. `undefined` znaczy, że cytatu nie ma.
 */
export function quoteFinder(html: string): (quote: string) => QuoteSpot | undefined {
  const parts = html.split(/(<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]\s*>)/i).map((part) => ({
    heading: /^<h[1-3]\b/i.test(part),
    text: analyzeHtml(part).text
  }))
  const whole = compact(parts.map(({ text }) => text).join(' '))
  return (quote) => {
    const needle = compact(quote.slice(0, MATCH_LENGTH))
    if (!needle) return undefined
    const first = whole.indexOf(needle)
    if (first < 0) return undefined
    const repeated = whole.indexOf(needle, first + 1) >= 0
    let heading: string | null = null
    for (const part of parts) {
      const found = compact(part.text).includes(needle)
      if (part.heading) heading = part.text || heading
      if (found) return { heading, repeated }
    }
    // Cytat przez granicę nagłówka też trafi w dokumencie, tylko bez nagłówka.
    return { heading: null, repeated }
  }
}

const anchorKey = (anchor: Anchor): string => `${anchor.selector}\u0000${anchor.quote}`

function cameraOut(camera: StepCamera): AgentCamera {
  if (camera.kind === 'hold') return { kind: 'hold' }
  const { selector, quote, heading } = camera.anchor
  if (camera.kind === 'place') return { kind: 'place', quote, selector, heading }
  return { kind: 'area', quote, selector, heading, box: camera.box }
}

function itemOf(note: Annotation, personal: boolean): AgentItem {
  const item: AgentItem = {
    id: note.id,
    kind: note.kind,
    status: note.status,
    quote: note.anchor?.quote || null,
    heading: note.anchor?.heading ?? null
  }
  if (note.kind === 'shape') return { ...item, shape: note.shape?.type, color: note.color }
  if (note.kind === 'sticky' || note.kind === 'highlight') item.color = note.color
  if (note.audience === 'me' && !personal) return { ...item, private: true }
  const text = note.messages[0]?.text
  return text ? { ...item, text: text.slice(0, TEXT_LIMIT) } : item
}

/** Trasa dla agenta: kroki i opis wszystkiego, co pokazują, oraz każdego kształtu dokumentu. */
export function presentationOut(presentation: Presentation, notes: Annotation[], personal = false): AgentPresentation {
  const shown = new Set(presentation.steps.flatMap((step) => step.show))
  return {
    steps: presentation.steps.map((step) => ({
      id: step.id,
      title: step.title,
      camera: cameraOut(step.camera),
      rest: step.rest,
      show: [...step.show]
    })),
    items: notes.filter((note) => shown.has(note.id) || note.kind === 'shape').map((note) => itemOf(note, personal))
  }
}

export interface PresentationChange {
  presentation: Presentation
  /** Kształty do utworzenia i krok, który je pokaże. */
  shapes: { step: number; input: NewAnnotation }[]
  warnings: string[]
}

type Raw = Record<string, unknown>

const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)

function text(value: unknown, label: string): string {
  if (value === undefined) return ''
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  return value
}

/**
 * Zamienia kroki od agenta na trasę do zapisu. Niczego nie zapisuje, więc błąd w dowolnym
 * kroku zostawia trasę i uwagi bez zmian. `before` to obecna trasa: kotwice, które agent oddał
 * bez zmian, wracają w całości, także te, których cytat pochodzi z widoku strony, a nie z pliku.
 */
export function presentationIn(
  input: unknown,
  {
    before,
    notes,
    find,
    dropped = new Set()
  }: {
    before: Presentation
    notes: Annotation[]
    find: ReturnType<typeof quoteFinder>
    /** Kształty usuwane razem z tym zapisem. Znikają z kroków bez ostrzeżenia. */
    dropped?: ReadonlySet<string>
  }
): PresentationChange {
  if (!Array.isArray(input)) throw new Error('steps must be a list')
  if (input.length > MAX_STEPS) throw new Error(`A presentation has at most ${MAX_STEPS} steps`)
  const known = new Map<string, Anchor>()
  for (const step of before.steps) if (step.camera.kind !== 'hold') known.set(anchorKey(step.camera.anchor), step.camera.anchor)
  const existing = new Set(notes.map(({ id }) => id))
  const seen = new Set<string>()
  const warnings: string[] = []
  const shapes: PresentationChange['shapes'] = []

  const anchorAt = (raw: unknown, label: string, x = 0.5, y = 0.5): Anchor => {
    if (!isObject(raw)) throw new Error(`${label} must be an object with a quote or a selector`)
    const quote = clean(text(raw.quote, `${label}.quote`))
    const selector = text(raw.selector, `${label}.selector`).trim()
    if (!quote && !selector) throw new Error(`${label} needs a quote or a selector`)
    const reused = known.get(`${selector}\u0000${quote}`)
    if (reused) return reused
    let heading: string | null = null
    if (quote) {
      const spot = find(quote)
      if (!spot) throw new Error(`${label}: the quote is not in the document text: "${quote.slice(0, 60)}"`)
      heading = spot.heading
      // Selektor wskazuje element, a cytat tylko go potwierdza, więc powtórka szkodzi samemu cytatowi.
      if (spot.repeated && !selector) {
        warnings.push(`${label}: the quote appears more than once in the document, so the app uses the first place. A longer quote picks one place.`)
      }
    }
    const anchor = parseAnchor({ selector, offsetX: x, offsetY: y, quote: quote.slice(0, QUOTE_LENGTH), heading })
    if (!anchor) throw new Error(`${label} is not a valid place`)
    return anchor
  }

  const pointAt = (raw: unknown, label: string): Anchor => {
    const point = isObject(raw) ? raw : {}
    for (const key of ['x', 'y'] as const) {
      const value = point[key]
      if (value !== undefined && (typeof value !== 'number' || value < 0 || value > 1)) {
        throw new Error(`${label}.${key} must be a number from 0 to 1`)
      }
    }
    return anchorAt(raw, label, (point.x as number | undefined) ?? 0.5, (point.y as number | undefined) ?? 0.5)
  }

  const cameraIn = (raw: unknown, label: string): StepCamera => {
    if (raw === undefined || (isObject(raw) && raw.kind === 'hold')) return { kind: 'hold' }
    if (!isObject(raw) || (raw.kind !== 'place' && raw.kind !== 'area')) {
      throw new Error(`${label}.kind must be hold, place or area`)
    }
    const anchor = anchorAt(raw, label)
    const camera = parseStepCamera({ kind: raw.kind, anchor, box: raw.box }, (value) => value as Anchor)
    if (!camera) throw new Error(`${label}.box must be {x, y, width, height} in fractions of the element`)
    return camera
  }

  const shapeIn = (raw: unknown, label: string): NewAnnotation => {
    if (!isObject(raw)) throw new Error(`${label} must be an object`)
    const color = raw.color === undefined ? DEFAULT_SHAPE_COLOR : raw.color
    if (!STICKY_COLORS.includes(color as StickyColor)) throw new Error(`${label}.color must be one of ${STICKY_COLORS.join(', ')}`)
    let anchor: Anchor
    let shape: unknown
    if (raw.type === 'rect' || raw.type === 'ellipse') {
      anchor = anchorAt(raw.at, `${label}.at`)
      shape = { type: raw.type, box: raw.box ?? AROUND[raw.type] }
    } else if (raw.type === 'arrow' || raw.type === 'line') {
      anchor = pointAt(raw.from, `${label}.from`)
      shape = { type: raw.type, end: pointAt(raw.to, `${label}.to`) }
    } else {
      throw new Error(`${label}.type must be rect, ellipse, arrow or line`)
    }
    const parsed = parseShape(shape)
    if (!parsed) throw new Error(`${label}.box must be {x, y, width, height} in fractions of the element`)
    return { kind: 'shape', audience: 'me', color: color as StickyColor, anchor, text: '', shape: parsed }
  }

  const steps: PresentationStep[] = input.map((raw, index) => {
    const label = `steps[${index}]`
    if (!isObject(raw)) throw new Error(`${label} must be an object`)
    const given = text(raw.id, `${label}.id`)
    const id = STEP_ID.test(given) && !seen.has(given) ? given : `s${randomBytes(5).toString('hex')}`
    seen.add(id)
    const rest = raw.rest === undefined ? 'normal' : raw.rest
    if (!STEP_RESTS.includes(rest as StepRest)) throw new Error(`${label}.rest must be normal, dim or hide`)
    if (raw.show !== undefined && !Array.isArray(raw.show)) throw new Error(`${label}.show must be a list of ids`)
    const show: string[] = []
    for (const item of (raw.show as unknown[] | undefined) ?? []) {
      if (typeof item !== 'string') throw new Error(`${label}.show must be a list of ids`)
      if (dropped.has(item)) continue
      if (existing.has(item)) {
        if (!show.includes(item)) show.push(item)
      } else {
        warnings.push(`${label}: no note or shape ${item} in the document, so the step skips it`)
      }
    }
    if (raw.shapes !== undefined && !Array.isArray(raw.shapes)) throw new Error(`${label}.shapes must be a list`)
    for (const [at, shape] of ((raw.shapes as unknown[] | undefined) ?? []).entries()) {
      shapes.push({ step: index, input: shapeIn(shape, `${label}.shapes[${at}]`) })
    }
    if (show.length + shapes.filter((shape) => shape.step === index).length > MAX_STEP_SHOW) {
      throw new Error(`${label} shows more than ${MAX_STEP_SHOW} items`)
    }
    return {
      id,
      title: clean(text(raw.title, `${label}.title`)).slice(0, MAX_STEP_TITLE),
      camera: cameraIn(raw.camera, `${label}.camera`),
      rest: rest as StepRest,
      show
    }
  })
  return { presentation: { steps }, shapes, warnings }
}
