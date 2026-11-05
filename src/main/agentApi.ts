import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Annotation, AnnotationKind, AnnotationStatus, Audience } from '../shared/annotations'
import { AnnotationStore } from './annotationStore'
import { analyzeHtml } from './classify'
import { type DocMeta, MetaStore } from './metaStore'
import { normalizePath } from './scanner'
import { normalizeText, queryTerms } from './textNormalize'

const SEARCH_LIMIT = 30
const SNIPPET_CONTEXT = 80

export interface CurrentDocument {
  docId: string
  title: string | null
  path: string
  project: string
  branch: string | null
  openedAt: string
}

export interface AgentDocument {
  id: string
  title: string | null
  path: string
  project: string | null
  branch: string | null
  commit: string | null
  status: string
  /** Oryginał zniknął i dostępna jest tylko zachowana kopia. */
  missing: boolean
  openComments: number
}

export interface AgentComment {
  id: string
  docId: string
  docTitle: string | null
  kind: AnnotationKind
  audience: Audience
  status: AnnotationStatus
  heading: string | null
  quote: string | null
  /** Uwaga powstała do starszej wersji dokumentu. */
  outdated: boolean
  messages: { author: string; text: string; createdAt: string }[]
}

export interface CommentFilter {
  doc?: string
  status?: AnnotationStatus | 'all'
  /** Domyślnie uwagi prywatne (`me`) są pomijane. */
  includePersonal?: boolean
}

export function currentDocumentPath(dataDir: string): string {
  return join(dataDir, 'state', 'current.json')
}

export async function writeCurrentDocument(dataDir: string, current: CurrentDocument | null): Promise<void> {
  const target = currentDocumentPath(dataDir)
  if (!current) {
    await rm(target, { force: true })
    return
  }
  await mkdir(join(dataDir, 'state'), { recursive: true })
  // Szybkie przełączanie dokumentów zapisuje równolegle, więc każdy zapis ma własny plik tymczasowy.
  const temp = `${target}.${randomUUID()}.tmp`
  await writeFile(temp, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  )

/**
 * Dostęp agenta do biblioteki. Korzysta tylko ze zwykłych plików w folderze danych,
 * więc działa także przy zamkniętej apce i nie wymaga Electrona ani SQLite.
 */
export class AgentApi {
  private readonly metas: MetaStore
  readonly annotations: AnnotationStore

  constructor(private readonly dataDir: string) {
    const libraryDir = join(dataDir, 'library')
    this.metas = new MetaStore(libraryDir)
    this.annotations = new AnnotationStore(libraryDir)
  }

  private async allMetas(): Promise<DocMeta[]> {
    await this.metas.load()
    return this.metas.all()
  }

  async current(): Promise<CurrentDocument | null> {
    try {
      return JSON.parse(await readFile(currentDocumentPath(this.dataDir), 'utf8')) as CurrentDocument
    } catch {
      return null
    }
  }

  private async toDocument(meta: DocMeta, annotations: Annotation[]): Promise<AgentDocument> {
    return {
      id: meta.id,
      title: meta.title,
      path: meta.path,
      project: meta.projectPath ? basename(meta.projectPath) : null,
      branch: meta.branch,
      commit: meta.commit,
      status: meta.status,
      missing: !(await exists(meta.path)),
      openComments: annotations.filter(
        (item) => item.docId === meta.id && item.status === 'open' && item.audience === 'agent'
      ).length
    }
  }

  async documents(filter: { status?: string; project?: string; branch?: string } = {}): Promise<AgentDocument[]> {
    const [metas, annotations] = await Promise.all([this.allMetas(), this.annotations.listAll()])
    const visible = metas.filter((meta) => meta.classificationOverride !== 'ignored')
    const documents = await Promise.all(visible.map((meta) => this.toDocument(meta, annotations)))
    return documents
      .filter((doc) => !filter.status || doc.status === filter.status)
      .filter((doc) => !filter.project || doc.project === filter.project)
      .filter((doc) => !filter.branch || doc.branch === filter.branch)
      .sort((a, b) => (a.project ?? '').localeCompare(b.project ?? ''))
  }

  /** Przyjmuje identyfikator, ścieżkę albo słowo `current`. */
  private async resolve(reference: string): Promise<{ id: string | null; path: string; title: string | null }> {
    const metas = await this.allMetas()
    if (reference === 'current') {
      const current = await this.current()
      if (!current) throw new Error('W apce nie jest otwarty żaden dokument')
      const meta = metas.find((candidate) => candidate.id === current.docId)
      return { id: meta?.id ?? null, path: meta ? await this.readablePath(meta) : current.path, title: current.title }
    }
    const meta = metas.find(
      (candidate) => candidate.id === reference || normalizePath(candidate.path) === normalizePath(reference)
    )
    if (!meta) throw new Error(`Nie ma dokumentu ${reference}`)
    return { id: meta.id, path: await this.readablePath(meta), title: meta.title }
  }

  private async readablePath(meta: DocMeta): Promise<string> {
    if (await exists(meta.path)) return meta.path
    return this.metas.latestCopyPath(meta) ?? meta.path
  }

  async readDocument(reference: string, format: 'text' | 'html' = 'text'): Promise<{ title: string | null; path: string; content: string }> {
    const { path, title } = await this.resolve(reference)
    const html = await readFile(path, 'utf8')
    return { title, path, content: format === 'html' ? html : analyzeHtml(html).text }
  }

  async comments(filter: CommentFilter = {}): Promise<AgentComment[]> {
    const metas = new Map((await this.allMetas()).map((meta) => [meta.id, meta]))
    const docId = filter.doc ? (await this.resolve(filter.doc)).id : null
    const status = filter.status ?? 'open'

    return (await this.annotations.listAll())
      .filter((item) => docId === null || item.docId === docId)
      .filter((item) => status === 'all' || item.status === status)
      .filter((item) => filter.includePersonal || item.audience === 'agent')
      .map((item) => {
        const meta = metas.get(item.docId)
        return {
          id: item.id,
          docId: item.docId,
          docTitle: meta?.title ?? null,
          kind: item.kind,
          audience: item.audience,
          status: item.status,
          heading: item.anchor?.heading ?? null,
          quote: item.anchor?.quote || null,
          outdated: meta !== undefined && meta.sha !== item.docSha,
          messages: item.messages.map(({ author, text, createdAt }) => ({ author, text, createdAt }))
        }
      })
  }

  reply(id: string, text: string): Promise<Annotation> {
    return this.annotations.addMessage(id, 'agent', text)
  }

  async resolveComment(id: string, text?: string): Promise<Annotation> {
    if (text) await this.annotations.addMessage(id, 'agent', text)
    return this.annotations.setStatus(id, 'resolved')
  }

  async search(query: string): Promise<{ id: string; title: string | null; path: string; snippet: string }[]> {
    const terms = queryTerms(query)
    if (terms.length === 0) return []
    const hits: { id: string; title: string | null; path: string; snippet: string }[] = []

    for (const meta of await this.allMetas()) {
      if (meta.classificationOverride === 'ignored') continue
      let text: string
      try {
        text = analyzeHtml(await readFile(await this.readablePath(meta), 'utf8')).text
      } catch {
        continue
      }
      const haystack = normalizeText(`${meta.title ?? ''} ${text}`)
      if (!terms.every((term) => haystack.includes(term))) continue

      const position = normalizeText(text).indexOf(terms[0] as string)
      const from = Math.max(0, position - SNIPPET_CONTEXT)
      hits.push({
        id: meta.id,
        title: meta.title,
        path: meta.path,
        snippet: text.slice(from, Math.max(position, 0) + SNIPPET_CONTEXT).trim()
      })
      if (hits.length >= SEARCH_LIMIT) break
    }
    return hits
  }
}
