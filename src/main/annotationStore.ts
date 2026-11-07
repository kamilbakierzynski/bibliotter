import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Anchor,
  type Annotation,
  type AnnotationMessage,
  type AnnotationStatus,
  type Audience,
  type MessageAuthor,
  type NewAnnotation,
  type OverlayItem,
  type Shape,
  SHAPE_TYPES,
  type ShapeType,
  STICKY_COLORS,
  type StickyColor
} from '../shared/annotations'
import { sendSignal, watchSignal } from './signals'

const MAX_TEXT_LENGTH = 20_000
const MAX_SELECTOR_LENGTH = 2_000
const MAX_QUOTE_LENGTH = 400
/** Zakreślenie obejmuje cały swój tekst, żeby wrócić na niego po przelaniu dokumentu. */
export const MAX_HIGHLIGHT_QUOTE = 2_000
const MAX_HEADING_LENGTH = 200
const MAX_STROKES = 64
const MAX_STROKE_LENGTH = 120_000
/** Pary ułamków rozmiaru elementu kotwicy. Linia może nieco wyjść poza element. */
const STROKE = /^-?\d+(\.\d+)?( -?\d+(\.\d+)?)+$/

const newId = (prefix: string): string => `${prefix}${randomBytes(4).toString('hex')}`

function cleanText(text: unknown): string {
  const value = typeof text === 'string' ? text.trim() : ''
  if (!value) throw new Error('Comment text is empty')
  if (value.length > MAX_TEXT_LENGTH) throw new Error('Comment text is too long')
  return value
}

const clampRatio = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

/** Kotwica przychodzi z warstwy w dokumencie, więc jej pola sprawdzamy jak dane z zewnątrz. */
export function parseAnchor(value: unknown, maxQuote = MAX_QUOTE_LENGTH): Anchor | null {
  if (typeof value !== 'object' || value === null) return null
  const { selector, offsetX, offsetY, quote, heading } = value as Record<string, unknown>
  if (typeof selector !== 'string' || !selector || selector.length > MAX_SELECTOR_LENGTH) return null
  return {
    selector,
    offsetX: clampRatio(offsetX),
    offsetY: clampRatio(offsetY),
    quote: typeof quote === 'string' ? quote.slice(0, maxQuote) : '',
    heading: typeof heading === 'string' ? heading.slice(0, MAX_HEADING_LENGTH) : null
  }
}

/** Linie przychodzą z warstwy w dokumencie, więc sprawdzamy je jak jej kotwice. */
export function parseStrokes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_STROKES) return null
  const valid = value.every(
    (stroke) => typeof stroke === 'string' && stroke.length <= MAX_STROKE_LENGTH && STROKE.test(stroke)
  )
  return valid ? (value as string[]) : null
}

/** Kształt może sięgać daleko poza mały element kotwicy, ale nie bez końca. */
const MAX_SHAPE_REACH = 1000

const reach = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_SHAPE_REACH

export function parseShapeType(value: unknown): ShapeType | null {
  return SHAPE_TYPES.includes(value as ShapeType) ? (value as ShapeType) : null
}

/** Kształt przychodzi z warstwy dokumentu albo od agenta, więc sprawdzamy go jak kotwicę. */
export function parseShape(value: unknown): Shape | null {
  if (typeof value !== 'object' || value === null) return null
  const shape = value as Record<string, unknown>
  const type = parseShapeType(shape.type)
  if (type === 'arrow' || type === 'line') {
    const end = parseAnchor(shape.end)
    return end ? { type, end } : null
  }
  if (type !== 'rect' && type !== 'ellipse') return null
  const box = (shape.box ?? null) as Record<string, unknown> | null
  if (!box || !reach(box.x) || !reach(box.y) || !reach(box.width) || !reach(box.height)) return null
  if (box.width <= 0 || box.height <= 0) return null
  return { type, box: { x: box.x, y: box.y, width: box.width, height: box.height } }
}

export function parseStickyColor(value: unknown): StickyColor | null {
  return STICKY_COLORS.includes(value as StickyColor) ? (value as StickyColor) : null
}

const STICKY_LABEL_LENGTH = 120

/** Elementy do pokazania w dokumencie. Numer komentarza nie zmienia się po zamknięciu innych. */
export function toOverlayItems(annotations: Annotation[]): OverlayItem[] {
  const numbers = new Map(
    annotations.filter((item) => item.kind === 'comment').map((item, index) => [item.id, index + 1])
  )
  return annotations.flatMap((item) => {
    if (item.status !== 'open' || !item.anchor) return []
    const label =
      item.kind === 'comment'
        ? String(numbers.get(item.id))
        : (item.messages[0]?.text ?? '').slice(0, STICKY_LABEL_LENGTH)
    const waiting = item.messages.at(-1)?.author === 'agent'
    return [
      {
        id: item.id,
        kind: item.kind,
        audience: item.audience,
        color: item.color,
        anchor: item.anchor,
        label,
        waiting,
        strokes: item.strokes,
        anchorWidth: item.anchorWidth,
        shape: item.shape
      }
    ]
  })
}

/** Powiadamia o zmianach uwag, także tych zapisanych przez agenta w innym procesie. */
export const watchAnnotations = (libraryDir: string, onChange: () => void): (() => void) =>
  watchSignal(libraryDir, 'annotations', onChange)

/**
 * Każda uwaga to osobny plik `library/<dokument>/annotations/<id>.json`. Dzięki temu apka
 * i agent mogą pisać równocześnie, a historia w prywatnym gicie pozostaje czytelna.
 */
export class AnnotationStore {
  constructor(private readonly libraryDir: string) {}

  private directory(docId: string): string {
    return join(this.libraryDir, docId, 'annotations')
  }

  private async write(annotation: Annotation): Promise<Annotation> {
    const directory = this.directory(annotation.docId)
    await mkdir(directory, { recursive: true })
    const target = join(directory, `${annotation.id}.json`)
    const temp = `${target}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(temp, `${JSON.stringify(annotation, null, 2)}\n`, 'utf8')
    await rename(temp, target)
    await sendSignal(this.libraryDir, 'annotations')
    return annotation
  }

  async listForDoc(docId: string): Promise<Annotation[]> {
    let files: string[]
    try {
      files = await readdir(this.directory(docId))
    } catch {
      return []
    }
    const annotations: Annotation[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(this.directory(docId), file), 'utf8')
        annotations.push(JSON.parse(raw) as Annotation)
      } catch {
        // Uszkodzony plik pomijamy, żeby jedna uwaga nie ukryła pozostałych.
      }
    }
    return annotations.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async listAll(): Promise<Annotation[]> {
    let docIds: string[]
    try {
      docIds = await readdir(this.libraryDir)
    } catch {
      return []
    }
    const lists = await Promise.all(docIds.map((docId) => this.listForDoc(docId)))
    return lists.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async get(id: string): Promise<Annotation> {
    const annotation = (await this.listAll()).find((candidate) => candidate.id === id)
    if (!annotation) throw new Error(`No comment ${id}`)
    return annotation
  }

  async create(docId: string, docSha: string, input: NewAnnotation): Promise<Annotation> {
    const createdAt = new Date().toISOString()
    // Zakreślenie i kształt nie mają tekstu, dopóki użytkownik czegoś nie dopisze.
    const highlight = input.kind === 'highlight'
    const drawing = highlight || input.kind === 'shape'
    if (input.kind === 'shape' && !input.shape) throw new Error('Shape geometry is missing')
    return this.write({
      id: newId('a'),
      docId,
      kind: input.kind,
      audience: input.audience,
      status: 'open',
      color: input.kind === 'comment' ? null : (input.color ?? 'yellow'),
      anchor: input.anchor,
      docSha,
      createdAt,
      updatedAt: createdAt,
      messages: drawing ? [] : [{ id: newId('m'), author: 'user', text: cleanText(input.text), createdAt }],
      ...(highlight ? { strokes: input.strokes ?? [], anchorWidth: input.anchorWidth ?? 0 } : {}),
      ...(input.kind === 'shape' ? { shape: input.shape } : {})
    })
  }

  async addMessage(id: string, author: MessageAuthor, text: string): Promise<Annotation> {
    const annotation = await this.get(id)
    const createdAt = new Date().toISOString()
    return this.write({
      ...annotation,
      updatedAt: createdAt,
      messages: [...annotation.messages, { id: newId('m'), author, text: cleanText(text), createdAt }]
    })
  }

  async setStatus(id: string, status: AnnotationStatus): Promise<Annotation> {
    const annotation = await this.get(id)
    return this.write({ ...annotation, status, updatedAt: new Date().toISOString() })
  }

  async setAudience(id: string, audience: Audience): Promise<Annotation> {
    const annotation = await this.get(id)
    return this.write({ ...annotation, audience, updatedAt: new Date().toISOString() })
  }

  /** Oddaje uwagę z tym samym identyfikatorem, bo mógł już trafić do agenta. */
  async restore(annotation: Annotation): Promise<void> {
    await this.write(annotation)
  }

  async removeMessage(id: string, messageId: string): Promise<void> {
    const annotation = await this.get(id)
    await this.write({
      ...annotation,
      updatedAt: new Date().toISOString(),
      messages: annotation.messages.filter((message) => message.id !== messageId)
    })
  }

  /** Wiadomość wraca na swoje miejsce w rozmowie, choć agent mógł w tym czasie odpisać. */
  async restoreMessage(id: string, message: AnnotationMessage): Promise<void> {
    const annotation = await this.get(id)
    await this.write({
      ...annotation,
      updatedAt: new Date().toISOString(),
      messages: [...annotation.messages, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    })
  }

  async delete(id: string): Promise<void> {
    const annotation = await this.get(id)
    await rm(join(this.directory(annotation.docId), `${id}.json`), { force: true })
    await sendSignal(this.libraryDir, 'annotations')
  }
}
