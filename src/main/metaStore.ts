import { copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { DocStatus } from '../shared/types'
import { mapLimit } from './concurrency'

export interface DocVersion {
  sha: string
  savedAt: string
  file: string
}

/** Trwałe dane dokumentu w `library/<id>/meta.json`. Ten plik może czytać też agent. */
export interface DocMeta {
  id: string
  path: string
  title: string | null
  /** Nazwa nadana w apce. Nie zmienia pliku na dysku. */
  alias?: string
  firstSeenAt: string
  status: DocStatus
  /** Decyzja użytkownika, która ma pierwszeństwo przed automatyczną klasyfikacją. */
  classificationOverride?: 'document' | 'ignored'
  sha: string
  mtimeMs: number
  projectPath: string | null
  branch: string | null
  commit: string | null
  versions: DocVersion[]
}

interface PendingCopy {
  sourcePath: string
  file: string
}

const LOAD_CONCURRENCY = 32
const WRITE_CONCURRENCY = 16

/**
 * Pamięć jest aktualna od razu, a dysk dogania ją w `flush`. Dzięki temu skan pokazuje
 * dokumenty, zanim skończą się tysiące zapisów, a kolejne zmiany jednego dokumentu
 * kończą się jednym zapisem jego najświeższego stanu.
 */
export class MetaStore {
  private readonly metas = new Map<string, DocMeta>()
  private readonly dirty = new Set<string>()
  private readonly copies = new Map<string, PendingCopy[]>()
  private flushing: Promise<void> | null = null

  constructor(private readonly libraryDir: string) {}

  async load(): Promise<void> {
    await mkdir(this.libraryDir, { recursive: true })
    const entries = await readdir(this.libraryDir, { withFileTypes: true })
    const folders = entries.filter((entry) => entry.isDirectory())
    const loaded = await mapLimit(folders, LOAD_CONCURRENCY, async (entry): Promise<DocMeta | null> => {
      try {
        return JSON.parse(await readFile(join(this.libraryDir, entry.name, 'meta.json'), 'utf8')) as DocMeta
      } catch {
        return null // Uszkodzony wpis pomijamy, a jego plik zostaje na dysku do ręcznej naprawy.
      }
    })
    this.metas.clear()
    for (const meta of loaded) {
      if (meta) this.metas.set(meta.id, meta)
    }
  }

  all(): DocMeta[] {
    return [...this.metas.values()]
  }

  get(id: string): DocMeta | undefined {
    return this.metas.get(id)
  }

  stage(meta: DocMeta): void {
    this.metas.set(meta.id, meta)
    this.dirty.add(meta.id)
  }

  async save(meta: DocMeta): Promise<void> {
    this.stage(meta)
    await this.flush()
  }

  /** Dopisuje kopię treści, którą `flush` zrobi w tle. Identyczna treść nie tworzy nowej wersji. */
  planVersion(meta: DocMeta, sourcePath: string, sha: string, savedAt: Date): DocMeta {
    if (meta.versions.some((version) => version.sha === sha)) return meta
    const stamp = savedAt.toISOString().replace(/[:.]/g, '-')
    const file = `${stamp}-${sha.slice(0, 12)}${extname(sourcePath).toLowerCase()}`
    this.copies.set(meta.id, [...(this.copies.get(meta.id) ?? []), { sourcePath, file }])
    return { ...meta, versions: [...meta.versions, { sha, savedAt: savedAt.toISOString(), file }] }
  }

  /** Zapisuje wszystko, co zmieniono do tej pory. Równoległe wywołania czekają na ten sam zapis. */
  flush(): Promise<void> {
    this.flushing ??= this.writeDirty().finally(() => {
      this.flushing = null
      if (this.dirty.size > 0) void this.flush()
    })
    return this.flushing
  }

  private async writeDirty(): Promise<void> {
    while (this.dirty.size > 0) {
      const ids = [...this.dirty]
      this.dirty.clear()
      await mapLimit(ids, WRITE_CONCURRENCY, (id) => this.write(id))
    }
  }

  private async write(id: string): Promise<void> {
    const directory = join(this.libraryDir, id)
    try {
      await this.writeCopies(id, directory)
      const meta = this.metas.get(id)
      if (!meta) return
      await mkdir(directory, { recursive: true })
      const target = join(directory, 'meta.json')
      const temp = `${target}.tmp`
      await writeFile(temp, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
      await rename(temp, target)
    } catch (error) {
      // Stan w pamięci zostaje, a kolejna zmiana tego dokumentu spróbuje zapisać go ponownie.
      console.error('Nie udało się zapisać danych dokumentu', id, error)
    }
  }

  private async writeCopies(id: string, directory: string): Promise<void> {
    const copies = this.copies.get(id) ?? []
    if (copies.length === 0) return
    this.copies.delete(id)
    const versions = join(directory, 'versions')
    await mkdir(versions, { recursive: true })
    for (const { sourcePath, file } of copies) {
      await copyFile(sourcePath, join(versions, file)).catch(() => this.forgetVersion(id, file))
    }
  }

  /** Plik zniknął przed zrobieniem kopii, więc wersja bez kopii nie może zostać w historii. */
  private forgetVersion(id: string, file: string): void {
    const meta = this.metas.get(id)
    if (meta) this.metas.set(id, { ...meta, versions: meta.versions.filter((version) => version.file !== file) })
  }

  latestCopyPath(meta: DocMeta): string | null {
    const latest = meta.versions.at(-1)
    return latest ? join(this.libraryDir, meta.id, 'versions', latest.file) : null
  }
}
