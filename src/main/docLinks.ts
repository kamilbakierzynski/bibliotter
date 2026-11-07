import { open, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, parse, relative, resolve } from 'node:path'
import { type DocLink, type DocLinks, type DocPair, isLocalHref, type LinkPreview, WIKI_PREFIX } from '../shared/links'
import { SNIPPET_REACH, type TextSnippet } from '../shared/textSearch'
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

/** Czyta linki prosto z pliku. Null znaczy, że pliku nie da się teraz odczytać. */
export async function readLinks(path: string, format: DocFormat): Promise<RawLink[] | null> {
  try {
    return extractLinks(format, await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

/** Składanie Markdownu to czysty procesor, więc apka podaje tu wątek spoza głównego. */
export type LinkReader = typeof readLinks

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

/** Kit pisze meta na samej górze strony, więc szukanie par nie czyta całych dokumentów. */
const HEAD_BYTES = 16 * 1024
const META_TAG = /<meta\b[^>]*>/gi
const BODY = /<body\b/i
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null
}

/** Plan, który objaśnia strona: `<meta name="bibliotter-plan" content="plan.md">`, jak pisze go kit explain-plan. */
export function planHrefOf(html: string): string | null {
  const body = html.search(BODY)
  for (const [tag] of (body < 0 ? html : html.slice(0, body)).matchAll(META_TAG)) {
    if (attribute(tag, 'name')?.toLowerCase() !== 'bibliotter-plan') continue
    const href = (attribute(tag, 'content') ?? '').replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name: string) => ENTITIES[name] ?? '')
    return href.trim() || null
  }
  return null
}

async function headOf(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(HEAD_BYTES)
    const { bytesRead } = await file.read(buffer, 0, HEAD_BYTES, 0)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await file.close()
  }
}

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
async function findVaultRoot(doc: DocEntry): Promise<string> {
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
  byId: Map<string, DocEntry>
}

interface Parsed {
  mtimeMs: number
  size: number
  links: RawLink[]
}

/** Pliki, do których prowadzą lokalne linki dokumentu, policzone przy danym układzie biblioteki. */
interface Targets {
  mtimeMs: number
  size: number
  layout: number
  paths: string[]
}

/** Spis plików sejfu się starzeje, bo linki `[[nazwa]]` prowadzą też do obrazków i innych plików spoza biblioteki. */
const VAULT_TTL_MS = 60_000
/** Tyle kodu strony wokół linku daje dość tekstu, żeby odnaleźć to miejsce w dokumencie. */
const SNIPPET_HTML = 4000
/** Skan wysyła migawki seriami, a start apki ma ważniejsze rzeczy do zrobienia. */
const WARM_DELAY_MS = 3000

interface Head {
  mtimeMs: number
  size: number
  plan: string | null
}

function docAt({ byPath }: Catalog, path: string): DocEntry | undefined {
  return byPath.get(normalizePath(path)) ?? byPath.get(normalizePath(path.replace(LINE_SUFFIX, '')))
}

/**
 * Linki między dokumentami biblioteki. Dokumenty czyta dopiero pierwsze pytanie o linki,
 * a kolejne skany czytają tylko pliki, które się zmieniły.
 *
 * Migawka zmienia się przy każdym otwarciu dokumentu, a cele linków tylko wtedy, gdy w bibliotece
 * przybędzie albo ubędzie plików. Dlatego cele są zapamiętane przy dokumencie razem z numerem układu
 * i linki zwrotne składają się z nich bez czytania dysku.
 */
export class LinkGraph {
  private readonly parsed = new Map<string, Parsed>()
  private readonly targets = new Map<string, Targets>()
  private catalog: Catalog | null = null
  /** Ścieżki dokumentów z ostatniej migawki i numer, który rośnie, gdy się zmienią. */
  private layoutKey = ''
  private layout = 0
  private backlinks: { snapshot: LibrarySnapshot; ready: Promise<Map<string, string[]>> } | null = null
  /**
   * Przejścia linkiem z tej sesji: cel i dokumenty, z których do niego przyszedł użytkownik.
   * Link dorysowany skryptem strony albo dopisany przed skanem nie ginie w panelu celu.
   */
  private readonly followed = new Map<string, Set<string>>()
  private readonly heads = new Map<string, Head>()
  /** Objaśnienia każdego planu, liczone raz na migawkę jak linki zwrotne. */
  private explained: { snapshot: LibrarySnapshot; ready: Promise<Map<string, DocEntry[]>> } | null = null
  /** Spis plików sejfu. Czytamy tylko sejfy, o które ktoś zapytał, i od nowa po zmianie układu. */
  private readonly vaults = new Map<string, { at: number; files: Promise<Map<string, string[]>> }>()
  /** Sejf każdego folderu. Bez tego każdy link `[[nazwa]]` pytał dysk o `.obsidian` piętro po piętrze. */
  private readonly roots = new Map<string, Promise<string>>()
  private warmTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly snapshot: () => LibrarySnapshot | null,
    private readonly read: LinkReader = readLinks
  ) {}

  private currentCatalog(): Catalog | null {
    const snapshot = this.snapshot()
    if (!snapshot) return null
    if (this.catalog?.snapshot === snapshot) return this.catalog
    const docs = [...snapshot.projects.flatMap((project) => project.docs), ...snapshot.review]
    const byPath = new Map<string, DocEntry>()
    for (const doc of docs) {
      for (const path of [doc.path, ...doc.otherPaths]) byPath.set(normalizePath(path), doc)
    }
    this.catalog = { snapshot, docs, byPath, byId: new Map(docs.map((doc) => [doc.id, doc])) }
    const layoutKey = [...byPath.keys()].sort().join('\n')
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey
      this.layout += 1
      this.vaults.clear()
      this.roots.clear()
    }
    return this.catalog
  }

  private vaultRootOf(doc: DocEntry): Promise<string> {
    const key = `${normalizePath(projectRootOf(doc))}\u0000${normalizePath(dirname(doc.path))}`
    const known = this.roots.get(key)
    if (known) return known
    const root = findVaultRoot(doc)
    this.roots.set(key, root)
    return root
  }

  private async vaultFiles(doc: DocEntry): Promise<Map<string, string[]>> {
    const root = await this.vaultRootOf(doc)
    const key = normalizePath(root)
    const known = this.vaults.get(key)
    if (known && Date.now() - known.at < VAULT_TTL_MS) return known.files
    const files = filesUnder(root)
    this.vaults.set(key, { at: Date.now(), files })
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
    const links = await this.read(doc.path, doc.format)
    if (!links) return [] // Plik mógł zniknąć po skanie.
    this.parsed.set(key, { mtimeMs: doc.mtimeMs, size: doc.size, links })
    return links
  }

  /** Cele lokalnych linków dokumentu. Liczy je od nowa tylko zmieniony plik albo zmieniony układ biblioteki. */
  private async targetPaths(doc: DocEntry, layout: number): Promise<string[]> {
    if (doc.missing) return []
    const key = normalizePath(doc.path)
    const cached = this.targets.get(key)
    if (cached?.layout === layout && cached.mtimeMs === doc.mtimeMs && cached.size === doc.size) return cached.paths
    const paths: string[] = []
    for (const { href } of await this.parse(doc)) {
      const target = await this.targetOf(doc, href)
      if (target) paths.push(target.path)
    }
    this.targets.set(key, { mtimeMs: doc.mtimeMs, size: doc.size, layout, paths })
    return paths
  }

  private async collectBacklinks(catalog: Catalog): Promise<Map<string, string[]>> {
    const found = new Map<string, Set<string>>()
    const { layout } = this
    await mapLimit(catalog.docs, READ_CONCURRENCY, async (doc) => {
      for (const path of await this.targetPaths(doc, layout)) {
        const to = docAt(catalog, path)
        if (!to || to.id === doc.id) continue
        found.set(to.id, (found.get(to.id) ?? new Set()).add(doc.id))
      }
    })
    return new Map([...found].map(([docId, from]) => [docId, [...from]]))
  }

  /** Użytkownik przeszedł linkiem z `from` do `docId`, więc `from` na pewno tu linkuje. */
  noteFollow(from: DocEntry, docId: string): void {
    if (from.id === docId) return
    this.followed.set(docId, (this.followed.get(docId) ?? new Set()).add(from.id))
  }

  /**
   * Link z `source` do `target` razem z tekstem wokół, w postaci trafienia z szukania w treści.
   * Dzięki temu podgląd pokaże miejsce, z którego dokument tu linkuje. Link bez tekstu nie ma czego szukać.
   */
  async linkSnippet(source: DocEntry, target: DocEntry): Promise<TextSnippet | null> {
    const catalog = this.currentCatalog()
    if (!catalog || source.missing) return null
    let page: string
    try {
      page = pageOf(source.format, await readFile(source.path, 'utf8'))
    } catch {
      return null
    }
    for (const match of page.matchAll(ANCHOR)) {
      const [whole, double, single, inner] = match
      const text = analyzeHtml(inner ?? '').text
      if (!text) continue
      const to = await this.targetOf(source, (double ?? single ?? '').replace(/&amp;/g, '&'))
      if (!to || docAt(catalog, to.path)?.id !== target.id) continue
      const start = match.index
      const end = start + whole.length
      return {
        before: analyzeHtml(page.slice(Math.max(0, start - SNIPPET_HTML), start)).text.slice(-SNIPPET_REACH),
        match: text,
        after: analyzeHtml(page.slice(end, end + SNIPPET_HTML)).text.slice(0, SNIPPET_REACH)
      }
    }
    return null
  }

  /**
   * Po zmianie biblioteki liczy linki zwrotne w tle, więc panel nie czeka na pierwsze czytanie
   * wszystkich plików. Seria zmian, np. przy skanie, liczy raz, dopiero po ciszy.
   */
  warmSoon(): void {
    if (this.warmTimer) clearTimeout(this.warmTimer)
    this.warmTimer = setTimeout(() => {
      this.warmTimer = null
      this.incoming().catch(() => {})
    }, WARM_DELAY_MS)
    this.warmTimer.unref()
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
    const catalog = this.currentCatalog()
    const followed = [...(this.followed.get(doc.id) ?? [])].filter((id) => catalog?.byId.has(id))
    return { outgoing, incoming: [...new Set([...(incoming.get(doc.id) ?? []), ...followed])] }
  }

  private async planHref(doc: DocEntry): Promise<string | null> {
    if (doc.missing || doc.format !== 'html') return null
    const key = normalizePath(doc.path)
    const cached = this.heads.get(key)
    if (cached?.mtimeMs === doc.mtimeMs && cached.size === doc.size) return cached.plan
    try {
      const plan = planHrefOf(await headOf(doc.path))
      this.heads.set(key, { mtimeMs: doc.mtimeMs, size: doc.size, plan })
      return plan
    } catch {
      return null // Plik mógł zniknąć po skanie.
    }
  }

  private planOf(catalog: Catalog, doc: DocEntry, href: string | null): DocEntry | null {
    const target = href ? linkTarget(href, doc.path) : null
    const plan = target ? docAt(catalog, target.path) : undefined
    return plan && plan.id !== doc.id ? plan : null
  }

  private explanations(catalog: Catalog): Promise<Map<string, DocEntry[]>> {
    if (this.explained?.snapshot !== catalog.snapshot) {
      const collect = async (): Promise<Map<string, DocEntry[]>> => {
        const found = new Map<string, DocEntry[]>()
        const pages = catalog.docs.filter((doc) => doc.format === 'html')
        await mapLimit(pages, READ_CONCURRENCY, async (doc) => {
          const plan = this.planOf(catalog, doc, await this.planHref(doc))
          if (plan) found.set(plan.id, [...(found.get(plan.id) ?? []), doc])
        })
        return found
      }
      this.explained = { snapshot: catalog.snapshot, ready: collect() }
    }
    return this.explained.ready
  }

  /** Objaśnienie prowadzi do swojego planu, a plan do objaśnienia. Z kilku objaśnień wygrywa najnowsze. */
  async pair(doc: DocEntry): Promise<DocPair | null> {
    const catalog = this.currentCatalog()
    if (!catalog) return null
    const plan = this.planOf(catalog, doc, await this.planHref(doc))
    if (plan) return { docId: plan.id, role: 'plan' }
    const explanations = (await this.explanations(catalog)).get(doc.id) ?? []
    const [newest] = [...explanations].sort((a, b) => b.mtimeMs - a.mtimeMs)
    return newest ? { docId: newest.id, role: 'explanation' } : null
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
