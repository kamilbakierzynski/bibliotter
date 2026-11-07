import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cleanLabel, countLabels, hasLabel, type LabelCount, parseLabels, sameLabel } from '../shared/labels'
import { mapLimit } from './concurrency'

const LOAD_CONCURRENCY = 32
const WRITE_CONCURRENCY = 16

/**
 * Etykiety dokumentu leżą w `library/<dokument>/labels.json`, obok `meta.json`. Osobny plik
 * sprawia, że agent może je zmieniać przy otwartej apce, a ona nie nadpisze ich przy zapisie metadanych.
 */
export class LabelStore {
  private labels = new Map<string, string[]>()

  constructor(
    private readonly libraryDir: string,
    private readonly onSaved: () => Promise<void> = () => Promise.resolve()
  ) {}

  private path(docId: string): string {
    return join(this.libraryDir, docId, 'labels.json')
  }

  async load(): Promise<void> {
    const folders = await readdir(this.libraryDir).catch((): string[] => [])
    const loaded = await mapLimit(folders, LOAD_CONCURRENCY, async (docId): Promise<[string, string[]] | null> => {
      try {
        const { labels } = JSON.parse(await readFile(this.path(docId), 'utf8')) as { labels?: unknown }
        return [docId, parseLabels(labels)]
      } catch {
        return null // Większość dokumentów nie ma etykiet, a uszkodzony plik nie może zablokować biblioteki.
      }
    })
    this.labels = new Map(loaded.filter((entry) => entry !== null))
  }

  get(docId: string): string[] {
    return this.labels.get(docId) ?? []
  }

  all(): LabelCount[] {
    return countLabels(this.labels.values())
  }

  private async write(docId: string, labels: string[]): Promise<void> {
    const target = this.path(docId)
    if (labels.length === 0) {
      this.labels.delete(docId)
      await rm(target, { force: true })
      return
    }
    this.labels.set(docId, labels)
    await mkdir(join(this.libraryDir, docId), { recursive: true })
    const temp = `${target}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(temp, `${JSON.stringify({ labels }, null, 2)}\n`, 'utf8')
    await rename(temp, target)
  }

  async set(docId: string, values: unknown): Promise<string[]> {
    const labels = parseLabels(values, this.all().map(({ name }) => name))
    await this.write(docId, labels)
    await this.onSaved()
    return labels
  }

  private async rewrite(name: string, change: (labels: string[]) => string[]): Promise<void> {
    const affected = [...this.labels].filter(([, labels]) => hasLabel(labels, name))
    await mapLimit(affected, WRITE_CONCURRENCY, ([docId, labels]) => this.write(docId, change(labels)))
    await this.onSaved()
  }

  /** Nazwa już używana łączy obie etykiety w jedną. */
  async rename(from: string, to: unknown): Promise<void> {
    const name = cleanLabel(to)
    if (!name) throw new Error('Label name is empty')
    const others = this.all().flatMap((label) => (sameLabel(label.name, from) ? [] : [label.name]))
    await this.rewrite(from, (labels) =>
      parseLabels(labels.map((label) => (sameLabel(label, from) ? name : label)), others)
    )
  }

  remove(name: string): Promise<void> {
    return this.rewrite(name, (labels) => labels.filter((label) => !sameLabel(label, name)))
  }
}
