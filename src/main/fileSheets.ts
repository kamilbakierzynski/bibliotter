import { execFile } from 'node:child_process'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { FileMode, FileSheetInfo, FileTreeEntry, FileViewData, GitMark, LineRange } from '../shared/fileView'
import { t } from '../shared/i18n'
import type { DocEntry } from '../shared/types'
import { escapeHtml } from './markdownMath'
import { FONTS, MARKDOWN_BACKGROUND } from './markdownPage'
import { stableId } from './scanner'

/** Większy plik i tak nie da się czytać w arkuszu, a CodeMirror trzymałby go w pamięci strony. */
const MAX_BYTES = 4 * 1024 * 1024
const SNIFF_BYTES = 8192
const GIT_TIMEOUT_MS = 8000
/** Folder z tysiącami wpisów i tak przewija się filtrem, a nie wzrokiem. */
const TREE_LIMIT = 3000
/** Tyle ścieżek dostaje filtr drzewa. Więcej nie przeczyta nikt, a lista idzie do strony w całości. */
const FILES_LIMIT = 40000
/** Stan gita dla drzewa żyje chwilę, bo rozwijanie kolejnych folderów pyta o niego seriami. */
const STATUS_TTL_MS = 1500
/** Poza repozytorium nikt nie podał `.gitignore`, więc filtr omija to, czego nikt nie czyta. */
const WALK_SKIP = new Set(['.git', 'node_modules', '.hg', '.svn'])

/** Pliki, które nie są tekstem albo czyta się je jako obraz, nawet gdy pierwsze bajty udają tekst. */
const BINARY = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|icns|pdf|zip|gz|tgz|7z|rar|exe|dll|so|dylib|node|wasm|woff2?|ttf|otf|mp3|mp4|webm|wav|mov|sqlite|db|psd|docx?|xlsx?|pptx?)$/i

/**
 * Strona arkusza ładuje tylko własny skrypt. Treść pliku leży w bloku danych, którego przeglądarka
 * nie wykonuje, więc nawet plik z `<script>` nie uruchomi niczego. `connect-src` pozwala tylko na
 * listy drzewa z własnego adresu.
 */
export const FILE_VIEW_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

export const FILE_VIEW_SCRIPT = '/__file-view.js'
export const FILE_TREE_PATH = '/__tree'
export const FILE_LIST_PATH = '/__files'

/** Język z rozszerzenia. Strona zna te same nazwy, a nieznany plik dostaje zwykły tekst. */
const LANGUAGES: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', jsonc: 'json', css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'java',
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'java',
  sql: 'sql', yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml', php: 'php'
}

export const languageOf = (path: string): string => LANGUAGES[extname(path).slice(1).toLowerCase()] ?? 'text'

interface Sheet {
  entry: DocEntry
  data: FileViewData
  /** Korzeń drzewa: repozytorium albo folder, gdy repozytorium nie ma. */
  root: string
  repo: boolean
  /** Git odpowiada w tle. Strona arkusza i drzewo czekają na niego, panel już nie. */
  ready: Promise<void>
}

interface GitStatus {
  at: number
  marks: Map<string, GitMark>
  /** Nieśledzone foldery, które git zwija do jednego wpisu z ukośnikiem na końcu. */
  fresh: string[]
}

/** Git bez przycinania wyjścia: ostatni znak nowej linii to też część pliku. */
function git(args: string[], cwd: string): Promise<string> {
  return new Promise((done, fail) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BYTES * 2 }, (error, stdout) =>
      error ? fail(error) : done(stdout)
    )
  })
}

const unix = (text: string): string => text.replace(/\r\n?/g, '\n')
const slashes = (path: string): string => path.replace(/\\/g, '/')

/** Link do pliku w drzewie: pełna ścieżka, którą rozwiązywanie linków bierze jak każdą inną. */
const hrefOf = (path: string): string => encodeURI(slashes(path)).replace(/#/g, '%23').replace(/\?/g, '%3F')

/** Tekst to plik bez bajtu zerowego na początku. Tak samo zgaduje git. */
async function isText(path: string): Promise<boolean> {
  if (BINARY.test(path)) return false
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0)
    return !buffer.subarray(0, bytesRead).includes(0)
  } finally {
    await handle.close()
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (info) => info.isDirectory(),
    () => false
  )
}

interface Repo {
  root: string
  branch: string | null
}

/** Korzeń repozytorium i gałąź jednym wywołaniem. Puste repozytorium nie ma HEAD, więc gałąź bywa `null`. */
async function repoOf(cwd: string): Promise<Repo | null> {
  const lines = await git(['rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'], cwd).then(
    (out) => out.split('\n').map((line) => line.trim()),
    () => null
  )
  if (lines?.[0]) return { root: resolve(lines[0]), branch: lines[1] && lines[1] !== 'HEAD' ? lines[1] : null }
  const root = await git(['rev-parse', '--show-toplevel'], cwd).then(
    (out) => out.trim(),
    () => ''
  )
  return root ? { root: resolve(root), branch: null } : null
}

interface RepoFile extends Repo {
  rel: string
  /** Wersja z HEAD, pusta dla nowego pliku. `null`, gdy git pliku nie śledzi i go nie widzi. */
  original: string | null
}

/**
 * Plik w repozytorium. Korzeń i wersja z HEAD idą równolegle, bo `HEAD:./nazwa` liczy się od folderu
 * pliku i nie potrzebuje korzenia. Kolejno trzy wywołania gita to na Windowsie kilkaset milisekund.
 */
async function repoFile(path: string): Promise<RepoFile | null> {
  const cwd = dirname(path)
  const [repo, shown] = await Promise.all([
    repoOf(cwd),
    git(['show', `HEAD:./${basename(path)}`], cwd).then(unix, () => null)
  ])
  if (!repo) return null
  const rel = slashes(relative(repo.root, path))
  if (!rel || rel.startsWith('..')) return null
  if (shown !== null) return { ...repo, rel, original: shown }
  // Plik spoza HEAD: nowy, jeśli git go widzi, a pominięty przez .gitignore nie ma zmian.
  const fresh = await git(['ls-files', '--others', '--exclude-standard', '--', rel], repo.root).then(
    (out) => out.trim() !== '',
    () => false
  )
  return { ...repo, rel, original: fresh ? '' : null }
}

/** Liczy dodane i usunięte wiersze tak jak `git diff --stat`, bez wołania gita drugi raz. */
export function lineStats(before: string, after: string): { added: number; removed: number } {
  // Znak nowej linii na końcu pliku kończy ostatni wiersz, a nie zaczyna kolejnego.
  const lines = (text: string): string[] => (text === '' ? [] : text.replace(/\n$/, '').split('\n'))
  const a = lines(before)
  const b = lines(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const left = a.slice(start, endA)
  const right = b.slice(start, endB)
  // Najdłuższy wspólny podciąg tylko dla środka, a dla bardzo długiego środka oszacowanie.
  if (left.length * right.length > 4_000_000) return { added: right.length, removed: left.length }
  const row = new Uint32Array(right.length + 1)
  for (const line of left) {
    let diagonal = 0
    for (let j = 1; j <= right.length; j++) {
      const above = row[j] as number
      row[j] = line === right[j - 1] ? diagonal + 1 : Math.max(above, row[j - 1] as number)
      diagonal = above
    }
  }
  const common = row[right.length] as number
  return { added: right.length - common, removed: left.length - common }
}

/** `git status --porcelain -z`: dwa znaki stanu, spacja i ścieżka od korzenia. Zmiana nazwy niesie drugą ścieżkę. */
export function parseStatus(out: string): { marks: Map<string, GitMark>; fresh: string[] } {
  const marks = new Map<string, GitMark>()
  const fresh: string[] = []
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const item = parts[i] as string
    if (item.length < 4) continue
    const code = item.slice(0, 2)
    const path = item.slice(3)
    if (code[0] === 'R' || code[0] === 'C') i++
    const mark: GitMark = code === '??' ? 'U' : code.includes('A') ? 'A' : code[0] === 'R' ? 'R' : code.includes('D') ? 'D' : 'M'
    if (code === '??' && path.endsWith('/')) fresh.push(path)
    marks.set(path.replace(/\/$/, ''), mark)
  }
  return { marks, fresh }
}

/** Drzewo układa foldery przed plikami, a nazwy jak Eksplorator: bez wielkości liter i z liczbami po kolei. */
export function sortTree(entries: FileTreeEntry[]): FileTreeEntry[] {
  return entries.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.dir ? -1 : 1))
}

function blankEntry(id: string, path: string, name: string, size: number, mtimeMs: number, file: FileSheetInfo): DocEntry {
  return {
    id,
    path,
    name,
    format: 'markdown',
    relPath: name,
    title: name,
    alias: null,
    mtimeMs,
    size,
    projectName: basename(dirname(path)),
    classification: 'document',
    reason: '',
    status: 'read',
    branch: null,
    commit: null,
    missing: false,
    otherPaths: [],
    sha: null,
    labels: [],
    file
  }
}

const sameFace = (a: DocEntry, b: DocEntry): boolean =>
  a.relPath === b.relPath &&
  a.projectName === b.projectName &&
  a.branch === b.branch &&
  JSON.stringify(a.file) === JSON.stringify(b.file)

/** Napisy strony arkusza. Strona nie ma `t()`, więc dostaje je gotowe. */
const pageLabels = (): Record<string, string> => ({
  filter: t('Filtruj pliki'),
  empty: t('Pusty folder'),
  none: t('Nie ma takich plików'),
  more: t('Pokazano pierwsze $ trafień'),
  pick: t('Wybierz plik z drzewa'),
  tree: t('Drzewo plików'),
  ignored: t('Pominięty w .gitignore'),
  U: t('Nowy'),
  A: t('Dodany'),
  M: t('Zmieniony'),
  R: t('Przemianowany'),
  D: t('Usunięty')
})

/**
 * Pliki i foldery otwarte z linków. Arkusz ma identyfikator jak dokument, więc widok, para
 * i zerknięcie obsługują go tą samą drogą, a biblioteka o nim nie wie.
 *
 * Otwarcie oddaje arkusz od razu po odczycie pliku, żeby panel stanął bez czekania. Git (gałąź,
 * wersja z HEAD, korzeń drzewa) dochodzi w tle, strona arkusza czeka na niego w środku panelu,
 * a gdy zmieni nagłówek, `onEntry` mówi o tym powłoce.
 */
export class FileSheets {
  private sheets = new Map<string, Sheet>()
  private statuses = new Map<string, Promise<GitStatus>>()
  private treeShown = true

  constructor(private readonly onEntry: (entry: DocEntry) => void = () => {}) {}

  has(id: string): boolean {
    return this.sheets.has(id)
  }

  entry(id: string): DocEntry | undefined {
    return this.sheets.get(id)?.entry
  }

  pathOf(id: string): string | undefined {
    return this.sheets.get(id)?.entry.path
  }

  ids(): string[] {
    return [...this.sheets.keys()]
  }

  /** Czy plik da się pokazać w arkuszu. Reszta idzie do Eksploratora, jak dotąd. */
  async viewable(path: string): Promise<boolean> {
    try {
      const info = await stat(path)
      return info.isFile() && info.size <= MAX_BYTES && (await isText(path))
    } catch {
      return false
    }
  }

  /** Drzewo obok pliku jest jedno dla wszystkich arkuszy, jak panel w edytorze. */
  setTreeShown(shown: boolean): void {
    this.treeShown = shown
    for (const sheet of this.sheets.values()) {
      if (sheet.data.tree) sheet.data = { ...sheet.data, tree: { ...sheet.data.tree, shown } }
    }
  }

  /** Czyta plik od nowa i zapamiętuje go jako arkusz. Każde otwarcie widzi bieżący stan dysku. */
  async open(path: string, mode: FileMode | null, lines: LineRange | null): Promise<DocEntry> {
    const id = stableId('f', path)
    const [raw, info] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    const text = unix(raw)
    const known = this.sheets.get(id)
    const name = basename(path)
    // Do odpowiedzi gita nagłówek zostaje taki, jaki był, żeby ponowne otwarcie nie mrugało.
    const file: FileSheetInfo = known?.entry.file ?? { mode: 'file', changed: false, added: 0, removed: 0 }
    const entry: DocEntry = {
      ...blankEntry(id, path, name, info.size, info.mtimeMs, file),
      ...(known ? { relPath: known.entry.relPath, projectName: known.entry.projectName, branch: known.entry.branch } : {})
    }
    const data: FileViewData = {
      name,
      path: known?.data.path ?? path,
      text,
      original: null,
      mode: 'file',
      lines,
      language: languageOf(path),
      phrases: { '$ unchanged lines': t('Niezmienione wiersze: $') },
      labels: pageLabels(),
      tree: null
    }
    const sheet: Sheet = { entry, data, root: dirname(path), repo: false, ready: Promise.resolve() }
    sheet.ready = this.completeFile(id, sheet, path, text, mode ?? known?.entry.file?.mode ?? null).catch(() => {})
    this.sheets.set(id, sheet)
    return entry
  }

  private async completeFile(id: string, sheet: Sheet, path: string, text: string, mode: FileMode | null): Promise<void> {
    const repo = await repoFile(path).catch(() => null)
    if (this.sheets.get(id) !== sheet) return
    const original = repo?.original ?? null
    const changed = original !== null && original !== text
    const stats = changed ? lineStats(original, text) : { added: 0, removed: 0 }
    const file: FileSheetInfo = { mode: changed ? (mode ?? 'file') : 'file', changed, ...stats }
    const root = repo?.root ?? dirname(path)
    const before = sheet.entry
    sheet.root = root
    sheet.repo = repo !== null
    sheet.entry = {
      ...before,
      relPath: repo?.rel ?? basename(path),
      projectName: basename(root),
      branch: repo?.branch ?? null,
      file
    }
    sheet.data = {
      ...sheet.data,
      path: repo?.rel ?? path,
      original: changed ? original : null,
      mode: file.mode,
      tree: { name: basename(root), current: slashes(relative(root, path)), reveal: null, shown: this.treeShown }
    }
    if (!sameFace(before, sheet.entry)) this.onEntry(sheet.entry)
  }

  /** Link do folderu daje arkusz z samym drzewem, rozwiniętym do tego folderu. */
  async openFolder(path: string): Promise<DocEntry> {
    const id = stableId('d', path)
    const info = await stat(path)
    const name = basename(path) || path
    const entry = blankEntry(id, path, name, 0, info.mtimeMs, { mode: 'file', changed: false, added: 0, removed: 0, folder: true })
    const known = this.sheets.get(id)
    if (known) Object.assign(entry, { relPath: known.entry.relPath, projectName: known.entry.projectName, branch: known.entry.branch })
    const data: FileViewData = {
      name,
      path,
      text: '',
      original: null,
      mode: 'file',
      lines: null,
      language: 'text',
      folder: true,
      labels: pageLabels(),
      tree: null
    }
    const sheet: Sheet = { entry, data, root: path, repo: false, ready: Promise.resolve() }
    sheet.ready = this.completeFolder(id, sheet, path).catch(() => {})
    this.sheets.set(id, sheet)
    return entry
  }

  private async completeFolder(id: string, sheet: Sheet, path: string): Promise<void> {
    const repo = await repoOf(path)
    if (this.sheets.get(id) !== sheet) return
    const root = repo?.root ?? path
    const rel = slashes(relative(root, path))
    const before = sheet.entry
    sheet.root = root
    sheet.repo = repo !== null
    sheet.entry = { ...before, relPath: rel || before.name, projectName: basename(root), branch: repo?.branch ?? null }
    // W arkuszu folderu drzewo jest całą treścią, więc nie da się go schować.
    sheet.data = { ...sheet.data, tree: { name: basename(root), current: null, reveal: rel || null, shown: true } }
    if (!sameFace(before, sheet.entry)) this.onEntry(sheet.entry)
  }

  /** Przełącznik w nagłówku arkusza zmienia tylko tryb, a strona sama przechodzi przez kotwicę. */
  setMode(id: string, mode: FileMode): DocEntry | undefined {
    const sheet = this.sheets.get(id)
    if (!sheet?.entry.file?.changed) return sheet?.entry
    sheet.entry = { ...sheet.entry, file: { ...sheet.entry.file, mode } }
    sheet.data = { ...sheet.data, mode }
    return sheet.entry
  }

  /** Odświeżenie arkusza czyta plik i HEAD jeszcze raz, z tym samym trybem. */
  async refresh(id: string): Promise<DocEntry | undefined> {
    const sheet = this.sheets.get(id)
    if (!sheet) return undefined
    this.statuses.clear()
    try {
      const { path } = sheet.entry
      if (sheet.data.folder) await this.openFolder(path)
      else await this.open(path, sheet.data.mode, sheet.data.lines)
      await this.sheets.get(id)?.ready
      return this.sheets.get(id)?.entry
    } catch {
      return sheet.entry
    }
  }

  /** Strona arkusza czeka na gita, bo z niego bierze diff i korzeń drzewa. Panel stoi już wtedy na ekranie. */
  async page(id: string): Promise<string | null> {
    await this.sheets.get(id)?.ready
    const sheet = this.sheets.get(id)
    if (!sheet) return null
    // `<` w JSON zamieniony na ucieczkę, żeby `</script>` w pliku nie zamknął bloku danych.
    const json = JSON.stringify(sheet.data).replace(/</g, '\\u003c')
    const tree = sheet.data.tree?.shown ? 'on' : 'off'
    return `<!doctype html>
<html lang="pl" data-tree="${tree}"${sheet.data.folder ? ' data-folder' : ''}>
<head>
<meta charset="utf-8">
<title>${escapeHtml(sheet.data.name)}</title>
<style>${FONTS}${PAGE_CSS}</style>
</head>
<body>
<script type="application/json" id="file-data">${json}</script>
<aside id="file-tree" aria-label="${escapeHtml(t('Drzewo plików'))}"></aside>
<main id="file-view"></main>
<script src="${FILE_VIEW_SCRIPT}"></script>
</body>
</html>`
  }

  private status(root: string): Promise<GitStatus> {
    const cached = this.statuses.get(root)
    if (cached) return cached
    const next = git(['status', '--porcelain=v1', '-z', '--untracked-files=normal'], root).then(
      (out) => ({ at: Date.now(), ...parseStatus(out) }),
      () => ({ at: Date.now(), marks: new Map<string, GitMark>(), fresh: [] })
    )
    this.statuses.set(root, next)
    setTimeout(() => {
      if (this.statuses.get(root) === next) this.statuses.delete(root)
    }, STATUS_TTL_MS)
    return next
  }

  /** Ignorowane wpisy jednego folderu. `--directory` zwija ignorowany folder do jednej linii. */
  private async ignoredIn(root: string, rel: string): Promise<Set<string>> {
    const args = ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory']
    const out = await git(rel ? [...args, '--', `${rel}/`] : args, root).catch(() => '')
    const found = new Set<string>()
    for (const item of out.split('\0')) {
      const path = item.replace(/\/$/, '')
      if (path && slashes(dirname(path)) === (rel || '.')) found.add(path)
    }
    return found
  }

  /** Jeden folder drzewa. `null`, gdy arkusza nie ma albo ścieżka wychodzi poza korzeń. */
  async tree(id: string, dir: string): Promise<FileTreeEntry[] | null> {
    await this.sheets.get(id)?.ready
    const sheet = this.sheets.get(id)
    if (!sheet) return null
    const { root } = sheet
    const abs = resolve(root, dir || '.')
    const rel = slashes(relative(root, abs))
    if (rel.startsWith('..') || isAbsolute(rel)) return null
    const listing = await readdir(abs, { withFileTypes: true }).catch(() => null)
    if (!listing) return null
    const [status, ignored] = sheet.repo
      ? await Promise.all([this.status(root), this.ignoredIn(root, rel)])
      : [null, new Set<string>()]
    const entries = await Promise.all(
      listing
        .filter((item) => item.name !== '.git')
        .slice(0, TREE_LIMIT)
        .map(async (item): Promise<FileTreeEntry> => {
          const path = rel ? `${rel}/${item.name}` : item.name
          const full = join(abs, item.name)
          const folder = item.isDirectory() || (item.isSymbolicLink() && (await isDirectory(full)))
          const entry: FileTreeEntry = { name: item.name, rel: path, href: hrefOf(full), dir: folder }
          if (ignored.has(path)) entry.ignored = true
          if (status) {
            const mark = status.marks.get(path) ?? (status.fresh.some((prefix) => path.startsWith(prefix)) ? 'U' : undefined)
            if (mark && !folder) entry.mark = mark
            if (folder && (mark || [...status.marks.keys()].some((key) => key.startsWith(`${path}/`)))) entry.changed = true
          }
          return entry
        })
    )
    return sortTree(entries)
  }

  /** Wszystkie pliki pod korzeniem dla filtra drzewa: w repozytorium te, które widzi git. */
  async files(id: string): Promise<{ files: string[]; truncated: boolean } | null> {
    await this.sheets.get(id)?.ready
    const sheet = this.sheets.get(id)
    if (!sheet) return null
    if (sheet.repo) {
      const out = await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], sheet.root).catch(() => '')
      const all = [...new Set(out.split('\0').filter(Boolean))]
      return { files: all.slice(0, FILES_LIMIT), truncated: all.length > FILES_LIMIT }
    }
    const files: string[] = []
    const pending = ['']
    while (pending.length > 0 && files.length < FILES_LIMIT) {
      const rel = pending.shift() as string
      const listing = await readdir(join(sheet.root, rel), { withFileTypes: true }).catch(() => [])
      for (const item of listing) {
        const path = rel ? `${rel}/${item.name}` : item.name
        if (item.isDirectory()) {
          if (!WALK_SKIP.has(item.name)) pending.push(path)
        } else {
          files.push(path)
        }
      }
    }
    return { files: files.slice(0, FILES_LIMIT), truncated: files.length >= FILES_LIMIT }
  }
}

/**
 * Tło, fonty i drzewo plików. Wygląd edytora ustawia sam skrypt, w motywie CodeMirrora.
 * Drzewo stoi po lewej, bo przy prawej krawędzi arkusza mieszka minimapa.
 */
const PAGE_CSS = `
:root { color-scheme: light dark; --paper: ${MARKDOWN_BACKGROUND.light}; --ink: #17181a; --ink-2: #55585e; --ink-3: #8b8e94; --hair: #e4e5e8; --hair-2: #c9cbd0; --tint: #f5f5f6; --tint-2: #ececee;
  --syn-keyword: #57418f; --syn-string: #37642b; --syn-number: #66502f; --syn-type: #17635a; --syn-function: #245a8a; --syn-tag: #8a2f4f; --syn-property: #245a8a; --syn-escape: #665000;
  --tree-w: 248px; }
@media (prefers-color-scheme: dark) {
  :root { --paper: ${MARKDOWN_BACKGROUND.dark}; --ink: #f4f4f5; --ink-2: #a4a4ac; --ink-3: #6e6e76; --hair: #2b2b2f; --hair-2: #414147; --tint: #1d1d20; --tint-2: #26262a;
    --syn-keyword: #c9b8f0; --syn-string: #b9dfab; --syn-number: #e8d3b0; --syn-type: #a6e0d3; --syn-function: #aecdf0; --syn-tag: #f0b8c9; --syn-property: #c4daf2; --syn-escape: #f2df8a; }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; color: var(--ink); background: var(--paper); font: 400 13px/1.6 'Geist Mono', Consolas, monospace; transition: background-color .42s ease, color .42s ease; }
main { padding: 28px 0 96px; }
@media (max-width: 760px) { :root { --tree-w: 200px; } }
@media (max-width: 560px) { :root { --tree-w: 168px; } }
html[data-tree="on"] main { margin-left: var(--tree-w); }
html[data-folder] main { display: none; }
/* Arkusz folderu przewija samo drzewo, więc strona stoi, a minimapa nie ma czego pokazywać. */
html[data-folder], html[data-folder] body { height: 100%; overflow: hidden; }

#file-tree { display: none; position: fixed; z-index: 2; inset: 0 auto 0 0; width: var(--tree-w); flex-direction: column; font: 400 12.5px/1 Geist, system-ui, sans-serif; color: var(--ink-2); background: var(--paper); box-shadow: inset -1px 0 0 var(--hair); }
html[data-tree="on"] #file-tree { display: flex; }
html[data-folder] #file-tree { width: min(100%, 560px); box-shadow: none; }
.ft-head { flex: none; padding: 14px 10px 8px 12px; }
.ft-filter { display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 9px; border-radius: 9px; background: var(--tint); transition: background-color .16s, box-shadow .16s; }
.ft-filter:focus-within { background: var(--paper); box-shadow: inset 0 0 0 1px var(--hair-2); }
.ft-filter svg { flex: none; width: 14px; height: 14px; color: var(--ink-3); }
.ft-filter input { flex: 1; min-width: 0; height: 100%; padding: 0; color: var(--ink); background: none; border: 0; outline: 0; font: inherit; }
.ft-filter input::placeholder { color: var(--ink-3); }
.ft-root { margin: 12px 2px 0; color: var(--ink-3); font: 500 10.5px/1 'Geist Mono', Consolas, monospace; letter-spacing: .04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ft-list { flex: 1; min-height: 0; overflow: auto; padding: 0 6px 96px; scrollbar-width: thin; scrollbar-color: var(--hair-2) transparent; overscroll-behavior: contain; }
.ft-row { position: relative; display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px 0 calc(6px + var(--depth, 0) * 14px); color: inherit; text-decoration: none; border-radius: 7px; cursor: default; user-select: none; white-space: nowrap; transition: background-color .12s, color .12s; }
button.ft-row { width: 100%; margin: 0; border: 0; background: none; font: inherit; text-align: left; }
.ft-row:hover { color: var(--ink); background: var(--tint); }
.ft-row.on { color: var(--ink); background: var(--tint-2); font-weight: 550; }
.ft-row.on::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; border-radius: 2px; background: var(--ink); }
.ft-row:focus-visible { outline: 1.5px solid var(--ink-2); outline-offset: -1.5px; }
.ft-row .ft-chev { flex: none; width: 12px; height: 12px; color: var(--ink-3); transition: rotate .22s cubic-bezier(.2, 1.3, .3, 1); }
.ft-row[aria-expanded="true"] .ft-chev { rotate: 90deg; }
.ft-row .ft-icon { flex: none; width: 14px; height: 14px; color: var(--ink-3); }
.ft-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ft-row.dir .ft-name { color: var(--ink); }
.ft-row.ignored, .ft-row.ignored .ft-name { color: var(--ink-3); }
.ft-row.ignored .ft-icon, .ft-row.ignored .ft-chev { opacity: .6; }
.ft-row[data-mark] .ft-name { color: var(--ink); font-weight: 600; }
.ft-mark { flex: none; min-width: 12px; color: var(--ink-2); font: 600 10.5px/1 'Geist Mono', Consolas, monospace; text-align: right; }
.ft-dot { flex: none; width: 5px; height: 5px; margin-right: 3px; border-radius: 50%; background: var(--ink-2); }
.ft-path { flex: none; max-width: 45%; overflow: hidden; color: var(--ink-3); font-size: 11px; text-overflow: ellipsis; direction: rtl; }
.ft-name b { color: var(--ink); font-weight: 650; }
.ft-note { padding: 10px 12px; color: var(--ink-3); font-size: 12px; line-height: 1.5; }
.ft-pick { position: fixed; inset: 0 0 0 min(100%, 560px); display: none; align-items: center; justify-content: center; color: var(--ink-3); font: 400 13px/1.5 Geist, system-ui, sans-serif; }
html[data-folder] .ft-pick { display: flex; }
@media (max-width: 760px) { html[data-folder] .ft-pick { display: none; } html[data-folder] #file-tree { width: 100%; } }
`
