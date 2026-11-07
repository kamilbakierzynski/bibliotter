import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, parse, relative, resolve } from 'node:path'
import { type DocLink, type DocLinks, isLocalHref, type LinkPreview, WIKI_PREFIX } from '../shared/links'
import type { DocEntry, DocFormat, LibrarySnapshot } from '../shared/types'
import { analyzeDocument, analyzeHtml } from './classify'
import { mapLimit } from './concurrency'
import { isExternalUrl } from './docPolicy'
import { renderMarkdown, slugOf } from './markdown'
import { formatOf, isIgnoredDirectory, isInside, normalizePath } from './scanner'

const READ_CONCURRENCY = 8
const EXCERPT_LENGTH = 180
const ANCHOR = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi
const NON_CONTENT = /<(script|style)\b[\s\S]*?<\/\1\s*>/gi
const FIRST_PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/i
const NETWORK_PATH = /^[\\/]{2}/
/** Agenci dopisują do ścieżki numer linii, np. `src/plik.ts:42`. */
const LINE_SUFFIX = /:\d+(?:[:-]\d+)?$/

export interface RawLink {
  href: string
  text: string
}

export interface LinkTarget {
  path: string
  fragment: string
}

const pageOf = (format: DocFormat, source: string): string =>
  (format === 'markdown' ? renderMarkdown(source).html : source).replace(NON_CONTENT, ' ')

/** Czyta linki z gotowej strony, więc Markdown i HTML idą jedną drogą, a kod w blokach się nie liczy. */
export function extractLinks(format: DocFormat, source: string): RawLink[] {
  return [...pageOf(format, source).matchAll(ANCHOR)].map(([, double, single, inner]) => ({
    href: (double ?? single ?? '').replace(/&amp;/g, '&'),
    text: analyzeHtml(inner ?? '').text
  }))
}

function decoded(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path // Znak `%` w nazwie pliku nie musi być kodowaniem.
  }
}

/**
 * Ścieżka sieciowa spoza udziału dokumentu. Samo sprawdzenie, czy taki plik istnieje, łączy się
 * z obcym serwerem i wysyła mu dane logowania Windows, więc dokument nie może jej podać.
 */
function leavesMachine(path: string, docPath: string): boolean {
  const root = parse(path).root
  return NETWORK_PATH.test(root) && root.toLowerCase() !== parse(resolve(docPath)).root.toLowerCase()
}

/** Zamienia `href` na plik względem prawdziwego miejsca dokumentu, a nie adresu jego strony. */
export function linkTarget(href: string, docPath: string): LinkTarget | null {
  if (!isLocalHref(href)) return null
  const hash = href.indexOf('#')
  const bare = (hash < 0 ? href : href.slice(0, hash)).replace(/\?.*$/, '')
  if (!bare) return null
  const path = resolve(dirname(docPath), decoded(bare))
  if (leavesMachine(path, docPath)) return null
  return { path, fragment: hash < 0 ? '' : href.slice(hash + 1) }
}

async function firstExisting(path: string): Promise<string | null> {
  for (const candidate of [path, path.replace(LINE_SUFFIX, '')]) {
    if (await exists(candidate)) return candidate
  }
  return null
}

interface Summary {
  title: string | null
  excerpt: string | null
}

function excerptOf(format: DocFormat, source: string, text: string): string | null {
  const paragraph = FIRST_PARAGRAPH.exec(pageOf(format, source))?.[1]
  const excerpt = (paragraph ? analyzeHtml(paragraph).text : text).slice(0, EXCERPT_LENGTH).trim()
  return excerpt ? (excerpt.length === EXCERPT_LENGTH ? `${excerpt}…` : excerpt) : null
}

async function summarize(path: string, format: DocFormat): Promise<Summary | null> {
  try {
    const source = await readFile(path, 'utf8')
    const { title, text } = analyzeDocument(format, source)
    return { title, excerpt: excerptOf(format, source, text) }
  } catch {
    return null
  }
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  )

/** Pliki pod katalogiem według nazwy. Obsidian wskazuje plik samą nazwą, a skan zna tylko dokumenty. */
async function filesUnder(root: string): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>()
  const pending = [root]
  while (pending.length > 0) {
    await mapLimit(pending.splice(0), READ_CONCURRENCY, async (directory) => {
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (!isIgnoredDirectory(entry.name)) pending.push(path)
        } else {
          const key = entry.name.toLowerCase()
          found.set(key, [...(found.get(key) ?? []), path])
        }
      }
    })
  }
  return found
}

const projectRootOf = (doc: DocEntry): string => doc.path.slice(0, doc.path.length - doc.relPath.length) || dirname(doc.path)

/** Sejf Obsidiana, a bez niego projekt dokumentu. Poza nie link `[[nazwa]]` nie wychodzi. */
async function vaultRootOf(doc: DocEntry): Promise<string> {
  const project = projectRootOf(doc)
  let directory = dirname(doc.path)
  while (isInside(directory, project) && dirname(directory) !== directory) {
    if (await exists(join(directory, '.obsidian'))) return directory
    directory = dirname(directory)
  }
  return project
}

const segmentsOf = (path: string): string[] => path.toLowerCase().split(/[\\/]/)

/** Przy powtórzonej nazwie wygrywa plik najbliżej dokumentu, a potem płytszy. */
function nearest(paths: string[], docPath: string): string | null {
  const home = segmentsOf(dirname(docPath))
  const shared = (path: string): number => {
    const parts = segmentsOf(dirname(path))
    const differs = home.findIndex((part, index) => part !== parts[index])
    return differs < 0 ? home.length : differs
  }
  const ranked = [...paths].sort(
    (a, b) => shared(b) - shared(a) || segmentsOf(a).length - segmentsOf(b).length || a.localeCompare(b)
  )
  return ranked[0] ?? null
}

interface Catalog {
  snapshot: LibrarySnapshot
  docs: DocEntry[]
  byPath: Map<string, DocEntry>
}

interface Parsed {
  mtimeMs: number
  size: number
  links: RawLink[]
}

function docAt({ byPath }: Catalog, path: string): DocEntry | undefined {
  return byPath.get(normalizePath(path)) ?? byPath.get(normalizePath(path.replace(LINE_SUFFIX, '')))
}

/**
 * Linki między dokumentami biblioteki. Dokumenty czyta dopiero pierwsze pytanie o linki,
 * a kolejne skany czytają tylko pliki, które się zmieniły.
 */
export class LinkGraph {
  private readonly parsed = new Map<string, Parsed>()
  private catalog: Catalog | null = null
  private backlinks: { snapshot: LibrarySnapshot; ready: Promise<Map<string, string[]>> } | null = null
  /** Spis plików sejfu. Nowa migawka go czyści, a czytamy tylko sejfy, o które ktoś zapytał. */
  private readonly vaults = new Map<string, Promise<Map<string, string[]>>>()

  constructor(private readonly snapshot: () => LibrarySnapshot | null) {}

  private currentCatalog(): Catalog | null {
    const snapshot = this.snapshot()
    if (!snapshot) return null
    if (this.catalog?.snapshot === snapshot) return this.catalog
    const docs = [...snapshot.projects.flatMap((project) => project.docs), ...snapshot.review]
    const byPath = new Map<string, DocEntry>()
    for (const doc of docs) {
      for (const path of [doc.path, ...doc.otherPaths]) byPath.set(normalizePath(path), doc)
    }
    this.catalog = { snapshot, docs, byPath }
    this.vaults.clear()
    return this.catalog
  }

  private async vaultFiles(doc: DocEntry): Promise<Map<string, string[]>> {
    const root = await vaultRootOf(doc)
    const key = normalizePath(root)
    const known = this.vaults.get(key)
    if (known) return known
    const files = filesUnder(root)
    this.vaults.set(key, files)
    return files
  }

  /** Obsidian szuka notatki po nazwie, a dopiero potem to, co podano, jest zwykłym plikiem. */
  private async wikiTarget(from: DocEntry, href: string): Promise<LinkTarget | null> {
    const value = decoded(href.slice(WIKI_PREFIX.length))
    const hash = value.indexOf('#')
    const name = (hash < 0 ? value : value.slice(0, hash)).trim().replace(/\\/g, '/').replace(/^\.?\//, '')
    const heading = hash < 0 ? '' : value.slice(hash + 1).trim()
    const fragment = heading.startsWith('^') ? '' : slugOf(heading)
    const files = await this.vaultFiles(from)
    for (const file of [`${name}.md`, name]) {
      const suffix = `/${file.toLowerCase()}`
      const hits = (files.get(basename(file).toLowerCase()) ?? []).filter((path) =>
        path.replace(/\\/g, '/').toLowerCase().endsWith(suffix)
      )
      const path = nearest(hits, from.path)
      if (path) return { path, fragment }
    }
    const missing = linkTarget(`${name}.md`, from.path)
    return missing && { ...missing, fragment }
  }

  private targetOf(from: DocEntry, href: string): Promise<LinkTarget | null> | LinkTarget | null {
    return href.startsWith(WIKI_PREFIX) ? this.wikiTarget(from, href) : linkTarget(href, from.path)
  }

  /** Mówi, dokąd prowadzi `href`. Kotwica i obcy schemat nie prowadzą do niczego, co apka otworzy. */
  async resolve(from: DocEntry, href: string, text = ''): Promise<DocLink | null> {
    if (isExternalUrl(href)) return { href, text, kind: 'external', docId: null, path: null, fragment: '' }
    const target = await this.targetOf(from, href)
    const catalog = this.currentCatalog()
    if (!target || !catalog) return null
    const { fragment } = target
    const doc = docAt(catalog, target.path)
    if (doc) return { href, text, kind: 'doc', docId: doc.id, path: doc.path, fragment }
    const path = await firstExisting(target.path)
    return path
      ? { href, text, kind: 'file', docId: null, path, fragment }
      : { href, text, kind: 'missing', docId: null, path: target.path, fragment }
  }

  private async parse(doc: DocEntry): Promise<RawLink[]> {
    if (doc.missing) return []
    const key = normalizePath(doc.path)
    const cached = this.parsed.get(key)
    if (cached?.mtimeMs === doc.mtimeMs && cached.size === doc.size) return cached.links
    try {
      const links = extractLinks(doc.format, await readFile(doc.path, 'utf8'))
      this.parsed.set(key, { mtimeMs: doc.mtimeMs, size: doc.size, links })
      return links
    } catch {
      return [] // Plik mógł zniknąć po skanie.
    }
  }

  private async collectBacklinks(catalog: Catalog): Promise<Map<string, string[]>> {
    const found = new Map<string, Set<string>>()
    await mapLimit(catalog.docs, READ_CONCURRENCY, async (doc) => {
      for (const { href } of await this.parse(doc)) {
        const target = await this.targetOf(doc, href)
        const to = target && docAt(catalog, target.path)
        if (!to || to.id === doc.id) continue
        found.set(to.id, (found.get(to.id) ?? new Set()).add(doc.id))
      }
    })
    return new Map([...found].map(([docId, from]) => [docId, [...from]]))
  }

  private incoming(): Promise<Map<string, string[]>> {
    const catalog = this.currentCatalog()
    if (!catalog) return Promise.resolve(new Map())
    if (this.backlinks?.snapshot !== catalog.snapshot) {
      this.backlinks = { snapshot: catalog.snapshot, ready: this.collectBacklinks(catalog) }
    }
    return this.backlinks.ready
  }

  async links(doc: DocEntry): Promise<DocLinks> {
    const [raw, incoming] = await Promise.all([this.parse(doc), this.incoming()])
    const resolved = await mapLimit(raw, READ_CONCURRENCY, ({ href, text }) => this.resolve(doc, href, text))
    const seen = new Set<string>()
    const outgoing = resolved.filter((link): link is DocLink => {
      if (!link || link.docId === doc.id) return false
      const key = link.path ? normalizePath(link.path) : link.href
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return { outgoing, incoming: incoming.get(doc.id) ?? [] }
  }

  /** Karta dla linku do innego dokumentu, także spoza biblioteki. Inne pliki karty nie mają. */
  async preview(from: DocEntry, href: string, thumb: (docId: string) => Promise<string | null>): Promise<LinkPreview | null> {
    const link = await this.resolve(from, href)
    if (!link?.path || link.docId === from.id) return null
    const format = formatOf(link.path)
    if (!format) return null
    const catalog = this.currentCatalog()
    const doc = link.docId && catalog ? docAt(catalog, link.path) : undefined
    const summary = await summarize(link.path, format)
    if (doc) {
      return {
        title: doc.alias ?? doc.title ?? doc.name,
        project: doc.projectName,
        path: doc.relPath,
        mtimeMs: doc.mtimeMs,
        excerpt: summary?.excerpt ?? null,
        thumb: await thumb(doc.id)
      }
    }
    if (!summary) return null
    const { mtimeMs } = await stat(link.path)
    return {
      title: summary.title ?? basename(link.path),
      project: null,
      path: relative(dirname(from.path), link.path).replace(/\\/g, '/'),
      mtimeMs,
      excerpt: summary.excerpt,
      thumb: null
    }
  }
}
