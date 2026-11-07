import { execFile } from 'node:child_process'
import { open, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, relative } from 'node:path'
import type { FileMode, FileSheetInfo, FileViewData, LineRange } from '../shared/fileView'
import { t } from '../shared/i18n'
import type { DocEntry } from '../shared/types'
import { escapeHtml } from './markdownMath'
import { FONTS, MARKDOWN_BACKGROUND } from './markdownPage'
import { stableId } from './scanner'

/** Większy plik i tak nie da się czytać w arkuszu, a CodeMirror trzymałby go w pamięci strony. */
const MAX_BYTES = 4 * 1024 * 1024
const SNIFF_BYTES = 8192
const GIT_TIMEOUT_MS = 8000

/** Pliki, które nie są tekstem albo czyta się je jako obraz, nawet gdy pierwsze bajty udają tekst. */
const BINARY = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|icns|pdf|zip|gz|tgz|7z|rar|exe|dll|so|dylib|node|wasm|woff2?|ttf|otf|mp3|mp4|webm|wav|mov|sqlite|db|psd|docx?|xlsx?|pptx?)$/i

/**
 * Strona arkusza ładuje tylko własny skrypt. Treść pliku leży w bloku danych, którego przeglądarka
 * nie wykonuje, więc nawet plik z `<script>` nie uruchomi niczego.
 */
export const FILE_VIEW_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

export const FILE_VIEW_SCRIPT = '/__file-view.js'

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

interface RepoFile {
  root: string
  rel: string
  branch: string | null
  /** Wersja z HEAD, pusta dla nowego pliku. `null`, gdy git pliku nie śledzi i go nie widzi. */
  original: string | null
}

async function repoFile(path: string): Promise<RepoFile | null> {
  const cwd = dirname(path)
  let root: string
  try {
    root = (await git(['rev-parse', '--show-toplevel'], cwd)).trim()
  } catch {
    return null
  }
  if (!root) return null
  const rel = relative(root, path).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..')) return null
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], root).then(
    (name) => (name.trim() && name.trim() !== 'HEAD' ? name.trim() : null),
    () => null
  )
  try {
    return { root, rel, branch, original: unix(await git(['show', `HEAD:${rel}`], root)) }
  } catch {
    // Plik spoza HEAD: nowy, jeśli git go widzi, a pominięty przez .gitignore nie ma zmian.
    const fresh = await git(['ls-files', '--others', '--exclude-standard', '--', rel], root).then(
      (out) => out.trim() !== '',
      () => false
    )
    return { root, rel, branch, original: fresh ? '' : null }
  }
}

/** Liczy dodane i usunięte wiersze tak jak `git diff --stat`, bez wołania gita drugi raz. */
export function lineStats(before: string, after: string): { added: number; removed: number } {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
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

/**
 * Pliki otwarte z linków. Arkusz pliku ma identyfikator jak dokument, więc widok, para i zerknięcie
 * obsługują go tą samą drogą, a biblioteka o nim nie wie.
 */
export class FileSheets {
  private sheets = new Map<string, Sheet>()

  has(id: string): boolean {
    return this.sheets.has(id)
  }

  entry(id: string): DocEntry | undefined {
    return this.sheets.get(id)?.entry
  }

  pathOf(id: string): string | undefined {
    return this.sheets.get(id)?.entry.path
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

  /** Czyta plik od nowa i zapamiętuje go jako arkusz. Każde otwarcie widzi bieżący stan dysku. */
  async open(path: string, mode: FileMode | null, lines: LineRange | null): Promise<DocEntry> {
    const id = stableId('f', path)
    const [raw, info, repo] = await Promise.all([readFile(path, 'utf8'), stat(path), repoFile(path)])
    const text = unix(raw)
    const original = repo?.original ?? null
    const changed = original !== null && original !== text
    const stats = changed ? lineStats(original, text) : { added: 0, removed: 0 }
    const known = this.sheets.get(id)?.entry.file
    const file: FileSheetInfo = { mode: changed ? (mode ?? known?.mode ?? 'file') : 'file', changed, ...stats }
    const name = basename(path)
    const entry: DocEntry = {
      id,
      path,
      name,
      format: 'markdown',
      relPath: repo?.rel ?? name,
      title: name,
      alias: null,
      mtimeMs: info.mtimeMs,
      size: info.size,
      projectName: repo ? basename(repo.root) : basename(dirname(path)),
      classification: 'document',
      reason: '',
      status: 'read',
      branch: repo?.branch ?? null,
      commit: null,
      missing: false,
      otherPaths: [],
      sha: null,
      labels: [],
      file
    }
    const data: FileViewData = {
      name,
      path: repo?.rel ?? path,
      text,
      original: changed ? original : null,
      mode: file.mode,
      lines,
      language: languageOf(path),
      phrases: { '$ unchanged lines': t('Niezmienione wiersze: $') }
    }
    this.sheets.set(id, { entry, data })
    return entry
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
    try {
      return await this.open(sheet.entry.path, sheet.data.mode, sheet.data.lines)
    } catch {
      return sheet.entry
    }
  }

  page(id: string): string | null {
    const sheet = this.sheets.get(id)
    if (!sheet) return null
    // `<` w JSON zamieniony na ucieczkę, żeby `</script>` w pliku nie zamknął bloku danych.
    const json = JSON.stringify(sheet.data).replace(/</g, '\\u003c')
    return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(sheet.data.name)}</title>
<style>${FONTS}${PAGE_CSS}</style>
</head>
<body>
<script type="application/json" id="file-data">${json}</script>
<main id="file-view"></main>
<script src="${FILE_VIEW_SCRIPT}"></script>
</body>
</html>`
  }
}

/** Tło i fonty strony. Wygląd edytora ustawia sam skrypt, w motywie CodeMirrora. */
const PAGE_CSS = `
:root { color-scheme: light dark; --paper: ${MARKDOWN_BACKGROUND.light}; --ink: #17181a; --ink-2: #55585e; --ink-3: #8b8e94; --hair: #e4e5e8; --hair-2: #c9cbd0; --tint: #f5f5f6; --tint-2: #ececee; }
@media (prefers-color-scheme: dark) {
  :root { --paper: ${MARKDOWN_BACKGROUND.dark}; --ink: #f4f4f5; --ink-2: #a4a4ac; --ink-3: #6e6e76; --hair: #2b2b2f; --hair-2: #414147; --tint: #1d1d20; --tint-2: #26262a; }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; color: var(--ink); background: var(--paper); font: 400 13px/1.6 'Geist Mono', Consolas, monospace; transition: background-color .42s ease, color .42s ease; }
main { padding: 28px 0 96px; }
`
