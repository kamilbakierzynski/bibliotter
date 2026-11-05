import { copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocStatus } from '../shared/types'

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

export class MetaStore {
  private readonly metas = new Map<string, DocMeta>()

  constructor(private readonly libraryDir: string) {}

  async load(): Promise<void> {
    await mkdir(this.libraryDir, { recursive: true })
    this.metas.clear()
    for (const entry of await readdir(this.libraryDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      try {
        const raw = await readFile(join(this.libraryDir, entry.name, 'meta.json'), 'utf8')
        const meta = JSON.parse(raw) as DocMeta
        this.metas.set(meta.id, meta)
      } catch {
        // Uszkodzony wpis pomijamy, a jego plik zostaje na dysku do ręcznej naprawy.
      }
    }
  }

  all(): DocMeta[] {
    return [...this.metas.values()]
  }

  get(id: string): DocMeta | undefined {
    return this.metas.get(id)
  }

  async save(meta: DocMeta): Promise<void> {
    this.metas.set(meta.id, meta)
    const directory = join(this.libraryDir, meta.id)
    await mkdir(directory, { recursive: true })
    const target = join(directory, 'meta.json')
    const temp = `${target}.tmp`
    await writeFile(temp, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    await rename(temp, target)
  }

  /** Zachowuje kopię treści. Identyczna treść nie tworzy nowej wersji. */
  async addVersion(meta: DocMeta, sourcePath: string, sha: string, savedAt: Date): Promise<DocMeta> {
    if (meta.versions.some((version) => version.sha === sha)) return meta
    const directory = join(this.libraryDir, meta.id, 'versions')
    await mkdir(directory, { recursive: true })
    const stamp = savedAt.toISOString().replace(/[:.]/g, '-')
    const file = `${stamp}-${sha.slice(0, 12)}.html`
    await copyFile(sourcePath, join(directory, file))
    return { ...meta, versions: [...meta.versions, { sha, savedAt: savedAt.toISOString(), file }] }
  }

  latestCopyPath(meta: DocMeta): string | null {
    const latest = meta.versions.at(-1)
    return latest ? join(this.libraryDir, meta.id, 'versions', latest.file) : null
  }
}
