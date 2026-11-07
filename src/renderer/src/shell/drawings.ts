import type { Annotation, ShapeType } from '../../../shared/annotations'
import { focusedId, notify, readStored, writeStored } from './state'

/*
 * Rysunki w dokumentach: kształty i strzałki. W bazie to zwykłe uwagi rodzaju `shape`, ale
 * w powłoce nie są notatkami, więc nie trafiają na listę uwag, do licznika ani do palety.
 * Usuwa się je gumką narzędzia albo cofnięciem.
 *
 * Przełącznik nad arkuszem chowa rysunki jednego dokumentu, a apka pamięta to między uruchomieniami.
 */

const HIDDEN_KEY = 'hiddenDrawings'
const SHAPE_KEY = 'shapeType'
const TYPES: readonly ShapeType[] = ['arrow', 'rect', 'ellipse', 'line']

function readHidden(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readStored(HIDDEN_KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

const stored = readStored(SHAPE_KEY) as ShapeType | null

export const drawings = {
  /** Kształty ze wszystkich dokumentów, tylko otwarte. */
  shapes: [] as Annotation[],
  hidden: readHidden(),
  /** Co rysuje narzędzie kształtu. */
  type: (stored && TYPES.includes(stored) ? stored : 'arrow') as ShapeType
}

/** Zostawia w liście uwag same notatki, a kształty odkłada tutaj. */
export function splitShapes(annotations: Annotation[]): Annotation[] {
  drawings.shapes = annotations.filter((note) => note.kind === 'shape' && note.status === 'open')
  return annotations.filter((note) => note.kind !== 'shape')
}

export const findShape = (id: string): Annotation | undefined => drawings.shapes.find((shape) => shape.id === id)
export const hasDrawings = (docId: string | null): boolean =>
  docId !== null && drawings.shapes.some((shape) => shape.docId === docId)
export const drawingsHidden = (docId: string | null): boolean => docId !== null && drawings.hidden.has(docId)

/** Wysyła pełną listę, bo widok dokumentu mógł powstać po ostatniej zmianie. */
export function syncDrawings(): void {
  window.api.setHiddenDrawings([...drawings.hidden])
}

function setHidden(docId: string, hidden: boolean): void {
  if (drawings.hidden.has(docId) === hidden) return
  if (hidden) drawings.hidden.add(docId)
  else drawings.hidden.delete(docId)
  writeStored(HIDDEN_KEY, JSON.stringify([...drawings.hidden]))
  syncDrawings()
  notify()
}

/** Przełącznik nad arkuszem. Dokument bez rysunków nie ma czego chować. */
export function toggleDrawings(docId: string | null = focusedId()): void {
  if (!docId || (!hasDrawings(docId) && !drawingsHidden(docId))) return
  setHidden(docId, !drawingsHidden(docId))
}

/** Nowy kształt nie może powstać niewidoczny, więc narzędzie odsłania rysunki dokumentu. */
export function revealDrawings(docId: string | null): void {
  if (docId) setHidden(docId, false)
}

export function setShapeType(type: ShapeType): void {
  drawings.type = type
  writeStored(SHAPE_KEY, type)
  notify()
}
