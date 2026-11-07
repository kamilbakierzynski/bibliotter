#!/usr/bin/env node
/*
 * Składa dokument objaśniający z folderu roboczego: doc.json, essay.html i plików z wynikami.
 * Kod cytowany w bibliografii pochodzi z obiektów Gita, więc nie da się go przepisać z błędem.
 * Wynik to jeden plik HTML z wklejonym stylem, skryptem i fontami, zgodny z regułami biblioteki.
 *
 *   node build.cjs <folder> [--out <plik.html>] [--repo <repo>] [--check] [--no-exclude]
 */
'use strict'
const { execFileSync, spawnSync } = require('node:child_process')
const { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } = require('node:path')

const KIT = __dirname
const KIT_VERSION = '0.1.0'

/* Reguły biblioteki z src/main/classify.ts i src/main/scanner.ts. Zmiana tam wymaga zmiany tutaj. */
const MIN_TEXT = 800
const MIN_HEADINGS = 3
const BULK_FOLDER_SIZE = 20
const NON_DOCUMENT_FOLDERS = new Set(['tmp', 'temp', 'public', 'static', 'fixtures', 'testdata', '__snapshots__', 'templates'])
const IGNORED_DIRECTORIES = new Set(['node_modules', 'bower_components', 'vendor', 'dist', 'build', 'out', 'target', 'coverage', 'obj', 'bin', 'Library', 'Temp', 'Logs', 'Packages', 'venv', '__pycache__', 'site-packages', 'playwright-report', 'storybook-static'])
const TEST_OUTPUT_FOLDER = /^(pytest-|test_|test-results)/i
const SAFE_GIT = new Set(['grep', 'log', 'show', 'diff', 'blame', 'ls-files'])

const TEXT = {
  pl: {
    kicker: 'Objaśnienie zmiany',
    abstract: 'Streszczenie',
    toc: 'Spis treści',
    bibliography: 'Bibliografia',
    biblioIntro: 'Fragmenty kodu pochodzą z obiektów Gita, a wyniki eksperymentów z plików zapisanych przy ich uruchomieniu. Jeśli nie zaznaczono inaczej, kod pochodzi z {rev}.',
    annex: 'Aneks',
    showFile: 'Pokaż plik ({n} wierszy)',
    back: 'wróć do tekstu',
    listing: 'Listing',
    stop: 'Zatrzymaj się na chwilę',
    dunno: 'Nie wiem, pokaż odpowiedź',
    again: 'Odpowiedz jeszcze raz',
    recap: 'Pytania po drodze: trafione {right} z {all}.',
    revisit: 'Warto wrócić do:',
    waiting: 'Jeszcze bez odpowiedzi:',
    sideLabel: 'Źródła akapitu',
    citeLabel: 'Źródło {n}',
    before: 'przed',
    worktree: 'drzewo robocze',
    change: 'Zmiana',
    text: 'Tekst',
    basis: 'Podstawa',
    sources: (n, runs) => `${n} ${plural(n, 'źródło', 'źródła', 'źródeł')}${runs ? `, w tym ${runs} ${plural(runs, 'eksperyment', 'eksperymenty', 'eksperymentów')}` : ''}`,
    minutes: (n) => `ok. ${n} min czytania`,
    commits: (n) => `${n} ${plural(n, 'commit', 'commity', 'commitów')}`,
    uncommitted: 'bez commita',
    kinds: { code: 'Kod', test: 'Test', commit: 'Opis commita', git: 'Przeszukanie', run: 'Eksperyment', said: 'Rozmowa', doc: 'Dokument' },
    commitLabel: 'opis commita',
    saidLabel: 'rozmowa',
    beforeChange: 'przed zmianą',
    more: (n) => `… i ${n} ${plural(n, 'wiersz', 'wiersze', 'wierszy')} więcej`
  },
  en: {
    kicker: 'Change explained',
    abstract: 'Abstract',
    toc: 'Contents',
    bibliography: 'Bibliography',
    biblioIntro: 'Code excerpts come from Git objects and experiment results from files saved when they ran. Unless noted otherwise, code is from {rev}.',
    annex: 'Appendix',
    showFile: 'Show file ({n} lines)',
    back: 'back to text',
    listing: 'Listing',
    stop: 'Stop for a moment',
    dunno: "I don't know, show the answer",
    again: 'Answer again',
    recap: 'Questions along the way: {right} of {all} right.',
    revisit: 'Worth revisiting:',
    waiting: 'Not answered yet:',
    sideLabel: 'Sources for this paragraph',
    citeLabel: 'Source {n}',
    before: 'before',
    worktree: 'working tree',
    change: 'Change',
    text: 'Text',
    basis: 'Basis',
    sources: (n, runs) => `${n} source${n === 1 ? '' : 's'}${runs ? `, including ${runs} experiment${runs === 1 ? '' : 's'}` : ''}`,
    minutes: (n) => `about ${n} min read`,
    commits: (n) => `${n} commit${n === 1 ? '' : 's'}`,
    uncommitted: 'uncommitted changes',
    kinds: { code: 'Code', test: 'Test', commit: 'Commit message', git: 'Search', run: 'Experiment', said: 'Conversation', doc: 'Document' },
    commitLabel: 'commit message',
    saidLabel: 'conversation',
    beforeChange: 'before the change',
    more: (n) => `… and ${n} more line${n === 1 ? '' : 's'}`
  }
}

function plural(n, one, few, many) {
  if (n === 1) return one
  const last = n % 10
  const tens = n % 100
  return last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? few : many
}

const errors = []
const warnings = []
const problem = (message) => errors.push(message)
const warn = (message) => warnings.push(message)

/* Argumenty */
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}
const folder = args.find((arg, index) => !arg.startsWith('--') && !['--out', '--repo'].includes(args[index - 1]))
if (!folder) {
  console.error('usage: node build.cjs <folder> [--out <file.html>] [--repo <repo>] [--check] [--no-exclude]')
  process.exit(2)
}
const work = resolve(folder)
const readWork = (name) => readFileSync(join(work, name), 'utf8').replace(/\r/g, '')

let doc
try {
  doc = JSON.parse(readWork('doc.json'))
} catch (error) {
  console.error(`error: cannot read ${join(work, 'doc.json')}: ${error.message}`)
  process.exit(1)
}
const essay = existsSync(join(work, 'essay.html')) ? readWork('essay.html') : (problem('Missing essay.html'), '')
const lang = doc.lang === 'en' ? 'en' : 'pl'
const T = TEXT[lang]

/* Git */
const run = (cwd, command, list) => execFileSync(command, list, { cwd, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\r/g, '')
const tryRun = (cwd, command, list) => {
  try {
    return run(cwd, command, list)
  } catch {
    return null
  }
}
const repo = resolve(option('--repo') ?? doc.repo ?? tryRun(process.cwd(), 'git', ['rev-parse', '--show-toplevel'])?.trim() ?? process.cwd())
const git = (...list) => run(repo, 'git', list)
const tryGit = (...list) => tryRun(repo, 'git', list)
if (tryGit('rev-parse', '--git-dir') === null) {
  console.error(`error: ${repo} is not a git repository. Set "repo" in doc.json or pass --repo.`)
  process.exit(1)
}

const WORKTREE = 'worktree'
const change = doc.change ?? {}
let changeRev = WORKTREE
let parentRev = 'HEAD'
let changeLine = ''
const shortOf = (rev) => tryGit('rev-parse', '--short', rev)?.trim() ?? rev
const dateOf = (rev) => tryGit('log', '-1', '--format=%cs', rev)?.trim() ?? ''
const peopleOf = (rev) => {
  const author = tryGit('log', '-1', '--format=%an', rev)?.trim()
  const body = tryGit('log', '-1', '--format=%B', rev) ?? ''
  const co = [...body.matchAll(/^Co-Authored-By:\s*([^<\n]+?)\s*</gim)].map((match) => match[1].trim())
  return [...new Set([author, ...co].filter(Boolean))]
}
const joinNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ${lang === 'pl' ? 'i' : 'and'} ${names.at(-1)}`)

if (change.rev) {
  if (tryGit('rev-parse', '--verify', `${change.rev}^{commit}`) === null) problem(`change.rev ${change.rev} is not a commit`)
  changeRev = shortOf(change.rev)
  parentRev = `${changeRev}~1`
  changeLine = `${changeRev}, ${dateOf(changeRev)}, ${joinNames(peopleOf(changeRev))}`
} else if (change.range) {
  const [from, to = 'HEAD'] = String(change.range).split('..')
  changeRev = shortOf(to)
  parentRev = tryGit('merge-base', from, to)?.trim().slice(0, 7) ?? from
  const count = tryGit('rev-list', '--count', `${parentRev}..${changeRev}`)?.trim() ?? '?'
  changeLine = `${shortOf(parentRev)}..${changeRev}, ${T.commits(Number(count))}, ${dateOf(changeRev)}`
} else {
  changeLine = `${T.uncommitted}, ${new Date().toISOString().slice(0, 10)}`
}
const fullChange = changeRev === WORKTREE ? '' : (tryGit('rev-parse', changeRev)?.trim() ?? '')

const revAlias = (rev) => (rev === undefined || rev === 'change' ? changeRev : rev === 'parent' ? parentRev : rev)
const revName = (rev) => (rev === WORKTREE ? T.worktree : rev === parentRev ? `${shortOf(parentRev)}, ${T.beforeChange}` : shortOf(rev))
const readAt = (rev, file) => {
  const clean = file.replace(/\\/g, '/')
  if (rev === WORKTREE) return readFileSync(join(repo, clean), 'utf8').replace(/\r/g, '')
  return git('show', `${rev}:${clean}`)
}

const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* Kolorowanie kodu grubością i szarością, bez barw. */
const FAMILIES = {
  c: { comment: /\/\*.*?\*\/|\/\/.*$|^\s*\*.*$/, keywords: true, ext: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'java', 'cs', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'swift', 'kt', 'kts', 'scala', 'dart', 'php'] },
  hash: { comment: /#.*$/, keywords: true, ext: ['py', 'rb', 'sh', 'bash', 'zsh', 'ps1', 'yml', 'yaml', 'toml', 'r', 'pl', 'ex', 'exs', 'nix'] },
  dash: { comment: /--.*$/, keywords: true, ext: ['sql', 'lua', 'hs', 'elm'] },
  // Style i znaczniki nie mają słów kluczowych w sensie języków programowania.
  style: { comment: /\/\*.*?\*\/|^\s*\*.*$/, keywords: false, ext: ['css', 'scss', 'less'] },
  markup: { comment: /<!--.*?-->/, keywords: false, ext: ['html', 'htm', 'xml', 'svg', 'vue'] }
}
const KEYWORDS = new Set('abstract as async await break case catch class const continue def default defer del delete do elif else enum except export extends false final finally fn for from func function go if impl implements import in instanceof interface is lambda let loop match mod module mut namespace new nil none not null of or override package pass private protected pub public raise readonly return self static struct super switch this throw throws trait true try type typeof undefined unless use val var void when where while with yield'.split(' '))
function familyOf(file) {
  const ext = extname(file).slice(1).toLowerCase()
  return Object.values(FAMILIES).find((family) => family.ext.includes(ext)) ?? null
}
function highlight(line, family) {
  if (!family) return escape(line)
  const token = new RegExp(`(${family.comment.source})|('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\`(?:[^\`\\\\]|\\\\.)*\`)|\\b([A-Za-z_]+)\\b`, 'g')
  let out = ''
  let last = 0
  for (const match of line.matchAll(token)) {
    if (match[3] && !(family.keywords && KEYWORDS.has(match[3]))) continue
    out += escape(line.slice(last, match.index))
    const cls = match[1] ? 'c' : match[2] ? 's' : 'k'
    out += `<span class="${cls}">${escape(match[0])}</span>`
    last = match.index + match[0].length
  }
  return out + escape(line.slice(last))
}
const codeBlock = (lines, first, file) => {
  const family = familyOf(file ?? '')
  return `<pre class="code">${lines.map((line, index) => `<span class="ln"><span class="gut">${first + index}</span>${highlight(line, family) || ' '}</span>`).join('')}</pre>`
}
const plainBlock = (lines) => `<pre class="code plain">${lines.map((line) => `<span class="ln">${escape(line) || ' '}</span>`).join('')}</pre>`

/* Fragment kodu: kotwica w tekście albo numery wierszy. Kotwica nie dryfuje, gdy plik się zmienia. */
const dirtyWarned = new Set()
function resolvePart(part, where) {
  const rev = revAlias(part.rev)
  if (!part.file) {
    problem(`${where}: missing "file"`)
    return null
  }
  let lines
  try {
    lines = readAt(rev, part.file).split('\n')
  } catch {
    problem(`${where}: cannot read ${part.file} at ${rev}`)
    return null
  }
  let from
  if (part.anchor !== undefined) {
    const hits = lines.flatMap((line, index) => (line.includes(part.anchor) ? [index] : []))
    if (hits.length === 0) {
      problem(`${where}: anchor not found in ${rev}:${part.file}: ${part.anchor}`)
      return null
    }
    const nth = part.nth ?? 1
    if (hits.length > 1 && part.nth === undefined) warn(`${where}: anchor matches ${hits.length} lines in ${part.file}, using the first. Add "nth" to pick another.`)
    from = (hits[nth - 1] ?? hits[0]) + (part.before ?? 0)
  } else if (Array.isArray(part.lines)) {
    from = part.lines[0] - 1
    part.count = part.lines[1] - part.lines[0] + 1
  } else {
    problem(`${where}: give "anchor" or "lines"`)
    return null
  }
  const count = part.count ?? 1
  const excerpt = lines.slice(from, from + count)
  if (from < 0 || excerpt.length !== count) {
    problem(`${where}: lines ${from + 1}-${from + count} are outside ${part.file} at ${rev}`)
    return null
  }
  if (part.expect && !excerpt.join('\n').includes(part.expect)) problem(`${where}: excerpt of ${part.file} does not contain "${part.expect}"`)
  if (count > 40) warn(`${where}: ${count} lines is a long excerpt. Readers check short ones.`)
  const clean = part.file.replace(/\\/g, '/')
  if (rev === WORKTREE && changeRev !== WORKTREE && !dirtyWarned.has(clean) && tryGit('status', '--porcelain', '--', clean)?.trim()) {
    dirtyWarned.add(clean)
    warn(`${where}: ${part.file} has uncommitted changes, so this excerpt shows them as they are now and nobody can check it later. Quote a commit unless the uncommitted state is the point.`)
  }
  return { file: part.file.replace(/\\/g, '/'), rev, from: from + 1, to: from + count, excerpt }
}

const span = (part) => `${part.file}:${part.from}${part.to > part.from ? `-${part.to}` : ''}`

/* Źródła */
const sources = doc.sources ?? {}
let runLetter = 0
const runOrder = []
function prepareSource(id, source) {
  const where = `source "${id}"`
  const kind = source.kind
  if (!T.kinds[kind]) {
    problem(`${where}: unknown kind "${kind}". Use code, test, commit, git, run, said or doc.`)
    return
  }
  if (!source.note || !String(source.note).trim()) problem(`${where}: "note" must say in one sentence what this source shows`)
  source.id = id
  source.kindLabel = T.kinds[kind]
  if (kind === 'code' || kind === 'test') {
    const parts = (source.parts ?? [source]).map((part, index) => resolvePart(part, `${where} part ${index + 1}`)).filter(Boolean)
    if (parts.length === 0) return
    source.parts = parts
    const [first] = parts
    const suffix = first.rev === parentRev ? `, ${T.before}` : first.rev === WORKTREE && changeRev !== WORKTREE ? `, ${T.worktree}` : ''
    source.label = source.label ?? `${basename(first.file)}:${first.from}${suffix}`
    source.body = parts.map((part) => `<p class="ref-from">${escape(span(part))} · ${escape(revName(part.rev))}</p>${codeBlock(part.excerpt, part.from, part.file)}`).join('')
  } else if (kind === 'commit') {
    const rev = revAlias(source.rev)
    const message = tryGit('log', '-1', '--format=%B', rev)
    if (message === null) return problem(`${where}: no commit ${rev}`)
    source.label = source.label ?? T.commitLabel
    source.where = `git log -1 ${shortOf(rev)}`
    source.body = plainBlock(message.trim().split('\n'))
  } else if (kind === 'git') {
    const list = (source.args ?? []).map((arg) => String(arg).replaceAll('{change}', changeRev).replaceAll('{parent}', parentRev))
    if (!SAFE_GIT.has(list[0])) return problem(`${where}: only git ${[...SAFE_GIT].join(', ')} are allowed`)
    const result = spawnSync('git', list, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 24 })
    if (result.status !== 0 && !(list[0] === 'grep' && result.status === 1)) return problem(`${where}: git ${list.join(' ')} failed: ${(result.stderr || '').trim().split('\n')[0]}`)
    const revs = list.filter((arg) => /^[\w./~^-]+$/.test(arg) && !arg.startsWith('-'))
    let lines = (result.stdout || '').replace(/\r/g, '').trimEnd().split('\n')
    if (list[0] === 'grep') lines = lines.map((line) => revs.reduce((text, rev) => (text.startsWith(`${rev}:`) ? text.slice(rev.length + 1) : text), line))
    if (lines.length === 1 && lines[0] === '') lines = [lang === 'pl' ? '(brak wyników)' : '(no results)']
    const limit = source.maxLines ?? 40
    const width = Math.min(source.width ?? 160, 400)
    const extra = lines.length - limit
    const cut = lines.slice(0, limit).filter((line) => line.length > width).length
    lines = lines.slice(0, limit).map((line) => (line.length > width ? `${line.slice(0, width - 3)}...` : line))
    if (cut > 0) warn(`${where}: ${cut} line(s) cut at ${width} characters. Raise "width" if the cut part matters.`)
    if (extra > 0) lines.push(T.more(extra))
    const quote = (arg) => (/[\s|\\*?'"()[\]{}$]/.test(arg) ? `'${arg}'` : arg)
    source.label = source.label ?? `git ${list[0]}`
    source.where = `git ${list.map(quote).join(' ')}`
    source.body = plainBlock(lines)
  } else if (kind === 'run') {
    // Jeden eksperyment może zapisać kilka plików; wtedy "file" jest listą i wszystkie mają jedną literę.
    const files = [source.file ?? []].flat()
    if (files.length === 0) return problem(`${where}: "file" with the saved output is required`)
    const missing = files.filter((file) => !existsSync(join(work, file)))
    if (missing.length > 0) return problem(`${where}: ${missing.join(', ')} not found; paths are relative to the work folder ${work}`)
    const outputs = files.map((file) => ({ file, lines: readWork(file).trimEnd().split('\n') }))
    const total = outputs.reduce((sum, item) => sum + item.lines.length, 0)
    if (total > 80) warn(`${where}: ${total} lines of output. Keep the part the text relies on.`)
    runOrder.push(id)
    source.where = source.command ?? files.join(', ')
    source.body = outputs.map((item) => `${files.length > 1 ? `<p class="ref-from">${escape(item.file)}</p>` : ''}${plainBlock(item.lines)}`).join('')
  } else if (kind === 'said') {
    if (!source.quote) return problem(`${where}: "quote" with the exact words is required`)
    source.label = source.label ?? T.saidLabel
    source.where = [source.who, source.when].filter(Boolean).join(', ')
    source.body = `<blockquote>${escape(source.quote)}</blockquote>`
  } else if (kind === 'doc') {
    if (!source.href) return problem(`${where}: "href" is required`)
    source.label = source.label ?? source.title ?? basename(decodeURI(source.href))
    source.where = source.href
    source.body = `<p class="ref-from"><a href="${escape(source.href)}">${escape(source.title ?? source.href)}</a></p>`
  }
}
for (const [id, source] of Object.entries(sources)) prepareSource(id, source)

/*
 * {{exp:id}} wstawia samą literę eksperymentu, bez przypisu. Litery zależą od kolejności
 * przypisów, więc znane są dopiero na końcu; do tego czasu stoi znak z prywatnej części
 * Unicode, którego kod z Gita praktycznie nie zawiera.
 */
const expRefs = new Set()
const expMark = (text) =>
  String(text).replace(/\{\{\s*exp\s*:\s*([\w-]+)\s*\}\}/g, (_, id) => {
    expRefs.add(id)
    return `${id}`
  })
const expFill = (html) => html.replace(/([\w-]+)/g, (_, id) => sources[id]?.letter ?? '?')

/* Pytania */
const checks = doc.checks ?? {}
const LETTERS = 'abcd'
const answerPositions = []
function checkHtml(id) {
  const check = checks[id]
  const where = `check "${id}"`
  if (!check) {
    problem(`${where} is used in essay.html but missing in doc.json`)
    return ''
  }
  check.used = true
  const options = check.options ?? []
  if (options.length < 2 || options.length > 4) problem(`${where}: needs 2-4 options`)
  const right = options.findIndex((item) => item.correct)
  if (right < 0 || options.filter((item) => item.correct).length !== 1) problem(`${where}: exactly one option needs "correct": true`)
  if (options.some((item) => !item.text || !item.why)) problem(`${where}: every option needs "text" and "why"`)
  if (!check.question || !check.title) problem(`${where}: "question" and a short "title" are required`)
  answerPositions.push(right)
  const lengths = options.map((item) => String(item.text ?? '').length)
  const others = lengths.filter((_, index) => index !== right)
  if (right >= 0 && others.length > 0 && lengths[right] > 1.4 * Math.max(...others)) warn(`${where}: the correct option is much longer than the others, which gives it away`)
  const letters = options.map((_, index) => LETTERS[index])
  return `<section class="check" id="${escape(id)}" data-answer="${letters[right] ?? 'a'}" data-title="${escape(check.title ?? '')}" data-state="open">
<p class="check-label">${T.stop}</p>
<p class="check-q">${expMark(check.question)}</p>
<ol class="check-opts">${options.map((item, index) => `<li data-opt="${letters[index]}"><span><i class="mark"></i><span class="text">${expMark(item.text)}</span></span></li>`).join('')}</ol>
<details class="check-answer"><summary>${T.dunno}</summary>${options.map((item, index) => `<p data-why="${letters[index]}"><strong>${expMark(item.text)}.</strong> ${expMark(item.why)}</p>`).join('')}</details>
</section>`
}

/* Listingi w tekście: krótkie fragmenty, przy których czytelnik zatrzymuje wzrok. */
const listings = doc.listings ?? {}
let listingNumber = 0
function listingHtml(id) {
  const spec = listings[id]
  if (!spec) {
    problem(`listing "${id}" is used in essay.html but missing in doc.json`)
    return ''
  }
  const part = resolvePart(spec, `listing "${id}"`)
  if (!part) return ''
  if (part.to - part.from + 1 > 12) warn(`listing "${id}" has ${part.to - part.from + 1} lines. In the text, keep listings at 12 or fewer; the bibliography can hold more.`)
  listingNumber += 1
  const caption = spec.caption ? ` ${spec.caption}` : ''
  return `<figure class="listing">${codeBlock(part.excerpt, part.from, part.file)}<figcaption>${T.listing} ${listingNumber}. ${escape(part.file)}, ${escape(revName(part.rev))}.${caption}</figcaption></figure>`
}

/* Esej: bloki rozdzielone pustą linią. */
const numbers = new Map()
const firstCite = new Set()
function cite(id) {
  if (!sources[id] || !sources[id].body) {
    if (!sources[id]) problem(`essay cites {{${id}}}, which is not in doc.json sources`)
    return ''
  }
  if (!numbers.has(id)) numbers.set(id, numbers.size + 1)
  const number = numbers.get(id)
  const anchor = firstCite.has(id) ? '' : ` id="c-${escape(id)}"`
  firstCite.add(id)
  return `<a class="cite"${anchor} href="#z-${escape(id)}" aria-label="${T.citeLabel.replace('{n}', number)}">${number}</a>`
}

const FORBIDDEN = [
  [/<script\b/i, 'no <script> in essay.html; put a custom visual into script.js'],
  [/<style\b/i, 'no <style> in essay.html; put custom styles into style.css'],
  [/<(?:link|iframe|object|embed)\b/i, 'no <link>, <iframe>, <object> or <embed>: the document must stand alone'],
  [/attachShadow/, 'no Shadow DOM: search and comment anchors cannot see inside it'],
  [/\bsrc\s*=\s*["'](?!data:)/i, 'images and media must be data: URIs; the document cannot read files next to it'],
  [/url\(\s*["']?https?:/i, 'no remote url() resources']
]
for (const [pattern, message] of FORBIDDEN) if (pattern.test(essay)) problem(`essay.html: ${message}`)
if (/display\s*:\s*none/i.test(essay)) warn('essay.html uses display:none; hidden text is skipped by search. Use <details> to fold content.')

const headings = []
const blocks = essay.trim().split(/\n\s*\n/)
const body = blocks
  .map((raw) => {
    const block = raw.trim()
    const heading = block.match(/^<h2\b[^>]*>([\s\S]*?)<\/h2>$/)
    if (heading) {
      const n = headings.length + 1
      headings.push({ n, text: heading[1].trim() })
      return `<div class="row"><div class="col"><h2 class="ch" id="r${n}"><span class="n">${n}</span>${heading[1].trim()}</h2></div></div>`
    }
    const marker = block.match(/^<!--\s*(check|listing)\s*:\s*([\w-]+)\s*-->$/)
    if (marker) {
      const html = marker[1] === 'check' ? checkHtml(marker[2]) : listingHtml(marker[2])
      return `<div class="row"><div class="col">${html}</div></div>`
    }
    const used = []
    const html = expMark(block).replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, id) => {
      const mark = cite(id)
      if (mark && !used.includes(id)) used.push(id)
      return mark
    })
    const wide = /^<[a-z]+\b[^>]*\bclass\s*=\s*["'][^"']*\bwide\b/i.test(block)
    const prose = /^<(p|ul|ol)\b/i.test(block)
    // Pytanie otwarte, podsumowanie i akapity z klasą nocite (czego nie sprawdzono) nie twierdzą nic o kodzie.
    const exempt = /^<[a-z]+\b[^>]*(?:\bid\s*=\s*["']otwarte["']|\bclass\s*=\s*["'][^"']*\b(?:nocite|recap)\b)/i.test(block)
    if (prose && !exempt && used.length === 0 && /<code>/.test(block)) warn(`paragraph about code without a source: "${block.replace(/<[^>]+>/g, '').slice(0, 70)}..."`)
    const side = used.map((id) => `<a href="#z-${escape(id)}"><span class="num">${numbers.get(id)}</span><span>${escape(sources[id].label ?? sources[id].kindLabel)}</span></a>`).join('')
    return `<div class="row${wide ? ' wide' : ''}"><div class="col">${html}</div>${side ? `<aside class="src" aria-label="${T.sideLabel}">${side}</aside>` : ''}</div>`
  })
  .join('\n')

if (headings.length < 2) problem('essay.html needs numbered chapters: at least two <h2> blocks')
if (headings.length > 8) warn(`${headings.length} chapters; more than eight reads like a manual. Merge the short ones.`)
for (const id of Object.keys(sources)) if (!numbers.has(id) && sources[id].body) problem(`source "${id}" is never cited`)
for (const id of Object.keys(checks)) if (!checks[id].used) warn(`check "${id}" is defined but not placed in essay.html`)
if (Object.keys(checks).length > 3) warn('more than three questions turns an essay into a quiz')
if (answerPositions.length >= 2 && answerPositions.every((at) => at === answerPositions[0])) warn('every question has its answer at the same position')

/* Eksperymenty dostają litery w kolejności pierwszego przypisu. */
for (const id of [...numbers.keys()].filter((key) => sources[key].kind === 'run')) {
  const letter = String.fromCharCode(65 + runLetter++)
  sources[id].letter = letter
  sources[id].label = sources[id].label ?? `${T.kinds.run} ${letter}`
  sources[id].kindLabel = `${T.kinds.run} ${letter}`
}
const abstractHtml = (doc.abstract ?? []).map((paragraph) => `<p>${expFill(expMark(paragraph))}</p>`).join('\n')
// Napisy na marginesie powstały przed nadaniem liter, więc uzupełniamy je teraz.
const finalBody = expFill(body).replace(/<span class="num">(\d+)<\/span><span>([^<]*)<\/span>/g, (all, number, label) => {
  const id = [...numbers].find(([, n]) => String(n) === number)?.[0]
  return id && sources[id].kind === 'run' ? `<span class="num">${number}</span><span>${escape(sources[id].label)}</span>` : all
})

/* Aneks: skrypty eksperymentów w całości, żeby dało się je uruchomić ponownie. */
const annex = (doc.annex ?? [])
  .map((item, index) => {
    if (!item.file || !existsSync(join(work, item.file))) {
      problem(`annex ${index + 1}: file ${item.file} not found in ${work}`)
      return ''
    }
    const lines = readWork(item.file).trimEnd().split('\n')
    const letter = String.fromCharCode(65 + index)
    return `<h3 id="aneks-${letter.toLowerCase()}">${T.annex} ${letter}. ${escape(item.title ?? item.file)}</h3>${item.note ? `<p>${expFill(expMark(item.note))}</p>` : ''}<details><summary>${T.showFile.replace('{n}', lines.length)}</summary>${codeBlock(lines, 1, item.file)}</details>`
  })
  .join('')

/* Ścieżka wyniku: główny checkout, explain/<gałąź>/<temat>.html. Stała ścieżka zachowuje uwagi. */
const slugify = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'explain'
const commonDir = tryGit('rev-parse', '--path-format=absolute', '--git-common-dir')?.trim()
const toplevel = tryGit('rev-parse', '--show-toplevel')?.trim() ?? repo
const mainCheckout = commonDir && basename(commonDir) === '.git' ? dirname(commonDir) : toplevel
const branch = (doc.branch ?? tryGit('rev-parse', '--abbrev-ref', 'HEAD')?.trim() ?? 'HEAD').replace(/^HEAD$/, changeRev)
const branchPath = branch.split('/').map((part) => part.replace(/[<>:"|?*\\]/g, '-')).join(sep)
const slug = slugify(doc.slug ?? doc.title ?? 'explain')
const out = resolve(option('--out') ?? join(mainCheckout, 'explain', branchPath, `${slug}.html`))

function checkPlace() {
  const folders = dirname(out).split(/[\\/]/).filter(Boolean)
  const below = relative(mainCheckout, out).startsWith('..') ? folders.slice(-3) : relative(mainCheckout, dirname(out)).split(/[\\/]/).filter(Boolean)
  for (const name of below) {
    if (name.startsWith('.') || IGNORED_DIRECTORIES.has(name)) problem(`output folder "${name}" is skipped by the library scanner`)
    if (NON_DOCUMENT_FOLDERS.has(name.toLowerCase())) problem(`output folder "${name}" marks files as not documents`)
    if (TEST_OUTPUT_FOLDER.test(name)) problem(`output folder "${name}" looks like test output and is ignored`)
  }
  if (existsSync(dirname(out))) {
    const siblings = readdirSync(dirname(out)).filter((name) => /\.html?$/i.test(name) && join(dirname(out), name) !== out).length + 1
    if (siblings >= BULK_FOLDER_SIZE) problem(`${dirname(out)} would hold ${siblings} HTML files; from ${BULK_FOLDER_SIZE} the library treats the folder as generator output`)
    else if (siblings >= BULK_FOLDER_SIZE - 4) warn(`${dirname(out)} holds ${siblings} HTML files; at ${BULK_FOLDER_SIZE} the library stops showing them`)
  }
  const home = process.env.BIBLIOTTER_HOME ?? process.env.HTMLDOCS_HOME ?? [join(homedir(), 'Bibliotter'), join(homedir(), 'HtmlDocs')].find((dir) => existsSync(join(dir, 'config.json')))
  try {
    const { roots = [] } = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'))
    const inside = roots.some((root) => !relative(resolve(root), out).startsWith('..') && !isAbsolute(relative(resolve(root), out)))
    if (!inside) warn(`${out} is outside the folders Bibliotter scans (${roots.join(', ')})`)
  } catch {
    // Bez konfiguracji apki nie wiemy, co skanuje, i nie ma czego ostrzegać.
  }
}
checkPlace()

/* Składanie */
const fonts = [
  ['Geist', 'geist-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
  ['Geist', 'geist-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
  ['Geist Mono', 'geist-mono-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
  ['Geist Mono', 'geist-mono-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF']
]
  .map(([family, file, range]) => `@font-face { font-family: '${family}'; font-weight: 100 900; font-display: block; src: url(data:font/woff2;base64,${readFileSync(join(KIT, 'fonts', file)).toString('base64')}) format('woff2'); unicode-range: ${range}; }`)
  .join('\n')

const ordered = [...numbers.keys()].map((id) => sources[id])
const entry = (source) => {
  const place = source.where ? `<span class="where">${escape(source.where)}</span>` : ''
  return `<li class="ref" id="z-${escape(source.id)}"><div class="ref-head"><span class="num">${numbers.get(source.id)}</span><span class="kind">${escape(source.kindLabel)}</span>${place}</div><p class="ref-note">${expFill(expMark(escape(source.note ?? '')))}</p>${source.body}<a class="back" href="#c-${escape(source.id)}">${T.back}</a></li>`
}

const textOnly = (html) => html.replace(/<(style|script|svg|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
const words = textOnly(finalBody).split(' ').length
const minutes = Math.max(1, Math.round(words / 200))
const runs = ordered.filter((source) => source.kind === 'run').length
const project = basename(mainCheckout)
const writtenBy = doc.writtenBy ?? 'Claude'
const today = new Date().toISOString().slice(0, 10)
if (!Array.isArray(doc.abstract) || doc.abstract.length === 0) problem('doc.json needs "abstract": one to three paragraphs with the thesis')
if (!doc.title) problem('doc.json needs "title"')

const style = existsSync(join(work, 'style.css')) ? readWork('style.css') : ''
const script = existsSync(join(work, 'script.js')) ? readWork('script.js') : ''
if (/attachShadow/.test(script)) problem('script.js: no Shadow DOM')
const kitScript = readFileSync(join(KIT, 'kit.js'), 'utf8').replace('__KIT_TEXT__', JSON.stringify({ again: T.again, recap: T.recap, revisit: T.revisit, waiting: T.waiting }))
const tocItems = [
  ...headings.map(({ n, text }) => `<li><a href="#r${n}"><span class="n">${n}</span><span>${text.replace(/<[^>]+>/g, '')}</span></a></li>`),
  `<li><a href="#bibliografia"><span class="n"></span><span>${T.bibliography}</span></a></li>`,
  ...(annex ? [`<li><a href="#aneks"><span class="n"></span><span>${T.annex}</span></a></li>`] : [])
].join('')

const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="bibliotter-kind" content="explain">
<meta name="bibliotter-kit" content="${KIT_VERSION}">
<meta name="bibliotter-doc" content="${escape(slug)}">
${fullChange ? `<meta name="bibliotter-commit" content="${fullChange}">\n` : ''}<title>${escape(doc.title ?? '')}</title>
<style>${fonts}
${readFileSync(join(KIT, 'kit.css'), 'utf8')}${style ? `\n/* Styl tego dokumentu */\n${style}` : ''}</style>
</head>
<body>
<main>
<header>
<p class="kicker">${escape(doc.kicker ?? `${T.kicker} · ${project} · ${changeRev === WORKTREE ? T.worktree : changeRev}`)}</p>
<h1>${escape(doc.title ?? '')}</h1>
${doc.subtitle ? `<p class="subtitle">${escape(doc.subtitle)}</p>` : ''}
<p class="byline"><b>${T.change}</b> ${escape(changeLine)}<br><b>${T.text}</b> ${escape(writtenBy)}, ${today}<br><b>${T.basis}</b> ${T.sources(numbers.size, runs)} · ${T.minutes(minutes)}</p>
</header>
<section class="abstract" aria-label="${T.abstract}">
<h2>${T.abstract}</h2>
${abstractHtml}
</section>
<nav class="toc" aria-label="${T.toc}"><ol>${tocItems}</ol></nav>
${finalBody}
<section class="biblio" id="bibliografia">
<h2>${T.bibliography}</h2>
<p class="intro">${T.biblioIntro.replace('{rev}', escape(changeRev === WORKTREE ? T.worktree : changeRev))}</p>
<ol class="refs">${ordered.map(entry).join('\n')}</ol>
</section>
${annex ? `<section class="annex" id="aneks">\n<h2>${T.annex}</h2>\n${annex}\n</section>\n` : ''}</main>
<script>${kitScript}</script>
${script ? `<script>\n${script}\n</script>\n` : ''}</body>
</html>
`

for (const id of expRefs) {
  if (!sources[id]) problem(`{{exp:${id}}} names a source that is not in doc.json`)
  else if (sources[id].kind !== 'run') problem(`{{exp:${id}}} names a ${sources[id].kind} source; only run sources have letters`)
  else if (!sources[id].letter) problem(`{{exp:${id}}} has no letter because the essay never cites {{${id}}}`)
}

/* Reguły klasyfikacji biblioteki na gotowym pliku. */
const text = textOnly(html.replace(/<head\b[\s\S]*?<\/head\s*>/i, ' '))
if (text.length < MIN_TEXT) problem(`only ${text.length} characters of text; the library needs ${MIN_TEXT}`)
if ((html.match(/<h[1-3][\s>]/gi) ?? []).length < MIN_HEADINGS) problem(`fewer than ${MIN_HEADINGS} headings h1-h3`)
if (/<script\b[^>]*\ssrc=["'](?!https?:|\/\/)/i.test(html)) problem('a local <script src> makes the library hide the document')
if (/<div\b[^>]*\bid=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i.test(html)) problem('an empty #root, #app or #__next looks like an app entry point')
const size = Buffer.byteLength(html)
if (size > 600 * 1024) warn(`${Math.round(size / 1024)} KB is large for one explanation`)

for (const message of warnings) console.log(`warning: ${message}`)
if (errors.length > 0) {
  for (const message of errors) console.error(`error: ${message}`)
  console.error(`${errors.length} error(s), nothing written`)
  process.exit(1)
}
if (flag('--check')) {
  console.log(`ok: ${numbers.size} sources, ${headings.length} chapters, about ${minutes} min; would write ${out}`)
  process.exit(0)
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)

/* Dokument jest dla czytelnika, nie dla historii repozytorium, więc explain/ zostaje lokalnie. */
const relativeOut = relative(mainCheckout, out)
if (!flag('--no-exclude') && !relativeOut.startsWith('..') && relativeOut.split(/[\\/]/)[0] === 'explain' && commonDir) {
  const ignored = spawnSync('git', ['check-ignore', '-q', relativeOut.replace(/\\/g, '/')], { cwd: mainCheckout }).status === 0
  if (!ignored) {
    const exclude = join(commonDir, 'info', 'exclude')
    mkdirSync(dirname(exclude), { recursive: true })
    const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
    appendFileSync(exclude, `${current && !current.endsWith('\n') ? '\n' : ''}# Bibliotter: explanations stay local\n/explain/\n`)
    console.log(`note: added /explain/ to ${exclude}, so explanations stay out of commits`)
  }
}
console.log(`wrote ${out}`)
console.log(`${Math.round(size / 1024)} KB, ${numbers.size} sources (${runs} experiments), ${headings.length} chapters, about ${minutes} min`)
