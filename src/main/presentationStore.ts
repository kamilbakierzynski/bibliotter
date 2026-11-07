import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptyPresentation, parsePresentation, type Presentation } from '../shared/presentation'
import { parseAnchor } from './annotationStore'
import { sendSignal, watchSignal } from './signals'

/** Identyfikator dokumentu staje się nazwą folderu, więc nie może wyjść poza bibliotekę. */
const DOC_ID = /^[A-Za-z0-9_-]{1,80}$/

export const readPresentation = (value: unknown): Presentation | null => parsePresentation(value, (anchor) => parseAnchor(anchor))

/** Powiadamia o zmianach trasy, także tych zapisanych przez agenta w innym procesie. */
export const watchPresentation = (libraryDir: string, onChange: () => void): (() => void) =>
  watchSignal(libraryDir, 'presentation', onChange)

/**
 * Trasa dokumentu to jeden plik `library/<dokument>/presentation.json` obok `annotations/`.
 * Jeden dokument ma jedną trasę, a zapis idzie przez plik tymczasowy, bo agent może czytać
 * i pisać przy otwartej apce.
 */
export class PresentationStore {
  constructor(private readonly libraryDir: string) {}

  private file(docId: string): string {
    if (!DOC_ID.test(docId)) throw new Error('Invalid document id')
    return join(this.libraryDir, docId, 'presentation.json')
  }

  /** Brak pliku i uszkodzony plik to pusta trasa, żeby formularz zawsze dało się otworzyć. */
  async read(docId: string): Promise<Presentation> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.file(docId), 'utf8'))
      return readPresentation(raw) ?? emptyPresentation()
    } catch {
      return emptyPresentation()
    }
  }

  /** Pusta trasa nie zostawia pliku, bo dokument bez kroków nie jest prezentacją. */
  async write(docId: string, presentation: Presentation): Promise<Presentation> {
    const target = this.file(docId)
    if (presentation.steps.length === 0) {
      await rm(target, { force: true })
    } else {
      await mkdir(join(this.libraryDir, docId), { recursive: true })
      const temp = `${target}.${randomBytes(4).toString('hex')}.tmp`
      await writeFile(temp, `${JSON.stringify(presentation, null, 2)}\n`, 'utf8')
      await rename(temp, target)
    }
    await sendSignal(this.libraryDir, 'presentation')
    return presentation
  }
}
