import { randomBytes } from 'node:crypto'
import { mkdirSync, watch } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Anchor,
  type Annotation,
  type AnnotationStatus,
  type Audience,
  type MessageAuthor,
  type NewAnnotation,
  type OverlayItem,
  STICKY_COLORS,
  type StickyColor
} from '../shared/annotations'

const MAX_TEXT_LENGTH = 20_000
const MAX_SELECTOR_LENGTH = 2_000
const MAX_QUOTE_LENGTH = 400
const MAX_HEADING_LENGTH = 200

const newId = (prefix: string): string => `${prefix}${randomBytes(4).toString('hex')}`

function cleanText(text: unknown): string {
  const value = typeof text === 'string' ? text.trim() : ''
  if (!value) throw new Error('Treść uwagi jest pusta')
  if (value.length > MAX_TEXT_LENGTH) throw new Error('Treść uwagi jest za długa')
  return value
}

const clampRatio = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

/** Kotwica przychodzi z warstwy w dokumencie, więc jej pola sprawdzamy jak dane z zewnątrz. */
export function parseAnchor(value: unknown): Anchor | null {
  if (typeof value !== 'object' || value === null) return null
  const { selector, offsetX, offsetY, quote, heading } = value as Record<string, unknown>
  if (typeof selector !== 'string' || !selector || selector.length > MAX_SELECTOR_LENGTH) return null
  return {
    selector,
    offsetX: clampRatio(offsetX),
    offsetY: clampRatio(offsetY),
    quote: typeof quote === 'string' ? quote.slice(0, MAX_QUOTE_LENGTH) : '',
    heading: typeof heading === 'string' ? heading.slice(0, MAX_HEADING_LENGTH) : null
  }
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
    return [{ id: item.id, kind: item.kind, audience: item.audience, color: item.color, anchor: item.anchor, label }]
  })
}

const WATCH_DEBOUNCE_MS = 150

/** Powiadamia o zmianach uwag, także tych zapisanych przez agenta w innym procesie. */
export function watchAnnotations(libraryDir: string, onChange: () => void): () => void {
  mkdirSync(libraryDir, { recursive: true })
  let timer: NodeJS.Timeout | null = null
  const watcher = watch(libraryDir, { recursive: true }, (_event, fileName) => {
    if (fileName !== null && !fileName.includes('annotations')) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, WATCH_DEBOUNCE_MS)
  })
  watcher.on('error', () => watcher.close())
  return () => {
    if (timer) clearTimeout(timer)
    watcher.close()
  }
}

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
    if (!annotation) throw new Error(`Nie ma uwagi ${id}`)
    return annotation
  }

  async create(docId: string, docSha: string, input: NewAnnotation): Promise<Annotation> {
    const createdAt = new Date().toISOString()
    return this.write({
      id: newId('a'),
      docId,
      kind: input.kind,
      audience: input.audience,
      status: 'open',
      color: input.kind === 'sticky' ? (input.color ?? 'yellow') : null,
      anchor: input.anchor,
      docSha,
      createdAt,
      updatedAt: createdAt,
      messages: [{ id: newId('m'), author: 'user', text: cleanText(input.text), createdAt }]
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

  async delete(id: string): Promise<void> {
    const annotation = await this.get(id)
    await rm(join(this.directory(annotation.docId), `${id}.json`), { force: true })
  }
}
