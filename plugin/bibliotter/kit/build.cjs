#!/usr/bin/env node
/*
 * Składa dokument objaśniający z folderu roboczego: doc.json, essay.html i plików z wynikami.
 * Kod cytowany w bibliografii pochodzi z obiektów Gita, więc nie da się go przepisać z błędem.
 * Wynik to jeden plik HTML z wklejonym stylem, skryptem i fontami, zgodny z regułami biblioteki.
 * Ten sam build składa objaśnienie zmiany ("kind": "diff") i plan zmiany ("kind": "plan").
 *
 *   node build.cjs <folder> [--out <plik.html>] [--repo <repo>] [--check] [--no-exclude]
 */
'use strict'
const { execFileSync, spawnSync } = require('node:child_process')
const { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } = require('node:path')
const figuresKit = require('./figures.cjs')
const planKit = require('./plan.cjs')

const KIT = __dirname
const KIT_VERSION = '0.2.0'

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
    kinds: { code: 'Kod', test: 'Test', commit: 'Opis commita', git: 'Przeszukanie', run: 'Eksperyment', said: 'Rozmowa', doc: 'Dokument', web: 'Strona', plan: 'Plan' },
    commitLabel: 'opis commita',
    saidLabel: 'rozmowa',
    beforeChange: 'przed zmianą',
    more: (n) => `… i ${n} ${plural(n, 'wiersz', 'wiersze', 'wierszy')} więcej`,
    // Plan zmiany
    planKicker: 'Plan zmiany',
    base: 'Stan wyjściowy',
    on: 'na',
    planFile: 'Plan',
    sections: (n) => `${n} ${plural(n, 'sekcja', 'sekcje', 'sekcji')}`,
    openInPlan: 'Otwórz to miejsce w planie',
    planCopyNote: (from, date, href, title) => `Kopia planu z \`${from}\`, zrobiona ${date}. Objaśnienie z rysunkami: [${title}](${href}).`,
    biblioIntroPlan: 'Fragmenty kodu pochodzą z obiektów Gita i pokazują stan, od którego plan zaczyna. Wyniki eksperymentów pochodzą z plików zapisanych przy ich uruchomieniu. Jeśli nie zaznaczono inaczej, kod pochodzi z {rev}.',
    biblioIntroPlanWorktree: 'Fragmenty kodu pochodzą z plików na dysku z dnia {date}, czyli ze stanu, od którego plan zaczyna, i mogły się od tego czasu zmienić. Wyniki eksperymentów pochodzą z plików zapisanych przy ich uruchomieniu.',
    figure: 'Rysunek',
    states: { same: 'bez zmian', changed: 'zmienione', new: 'nowe', removed: 'usunięte' },
    lineStates: { changed: 'zmienione połączenie', new: 'nowe połączenie', removed: 'usunięte połączenie' },
    callStates: { changed: 'zmienione wywołanie', new: 'nowe wywołanie', removed: 'usunięte wywołanie' },
    fileChange: { new: 'nowy', changed: 'zmiana', removed: 'usunięty' },
    stepOf: (n, all) => `Krok ${n} z ${all}`,
    stepWord: 'krok',
    after: (list) => `po ${list.length === 1 ? 'kroku' : 'krokach'} ${list.join(', ')}`,
    stepStatus: { doing: 'w toku', done: 'zrobione' },
    doneWhen: 'Gotowe, gdy',
    files: (n) => `${n} ${plural(n, 'plik', 'pliki', 'plików')}`,
    lines: (n) => `${n} ${plural(n, 'wiersz', 'wiersze', 'wierszy')}`,
    parallel: 'równolegle',
    roadmapCaption: 'Kolejność kroków. Kliknięcie w kartę przenosi do opisu kroku.',
    roadmapParallel: 'Kroki w jednym rzędzie nie zależą od siebie, więc mogą powstawać równolegle.',
    filesCaption: 'Pliki, których dotyka plan, i kroki, które je zmieniają. Liczba wierszy opisuje stan wyjściowy.',
    filesSum: {
      new: (n) => `${n} ${plural(n, 'nowy', 'nowe', 'nowych')}`,
      changed: (n) => `${n} ${plural(n, 'zmieniony', 'zmienione', 'zmienionych')}`,
      removed: (n) => `${n} ${plural(n, 'usunięty', 'usunięte', 'usuniętych')}`
    },
    stepsShort: (list) => `${list.length === 1 ? 'krok' : 'kroki'} ${list.join(', ')}`,
    decision: 'Decyzja',
    decisionOpen: 'do rozstrzygnięcia',
    decisionDone: 'rozstrzygnięta',
    recommend: 'polecam',
    chosen: 'wybrane',
    whyOption: (letter) => `Dlaczego ${letter}`,
    answerHint: 'Zaznacz pytanie, wciśnij <kbd>C</kbd>, wybierz odbiorcę Agent i napisz, którą drogę wybierasz albo czego w nich brakuje.',
    riskHead: ['Ryzyko', 'Szansa', 'Skutek', 'Co z tym robimy'],
    likelihood: ['mała', 'średnia', 'duża'],
    impact: ['mały', 'średni', 'duży'],
    sketch: 'Szkic',
    sketchNew: (file) => `nowy plik ${file}`,
    sketchChange: (file) => `zmiana w ${file}`,
    sketchNote: 'tego kodu jeszcze nie ma',
    progress: 'Postęp',
    progressLine: (done, all) => `${done} z ${all} ${plural(all, 'kroku', 'kroków', 'kroków')} zrobione`,
    glance: {
      label: 'Plan w pigułce',
      steps: 'Kroki',
      files: 'Pliki',
      decisions: 'Decyzje',
      risks: 'Ryzyka',
      stages: (n) => `${n} ${plural(n, 'etap', 'etapy', 'etapów')}`,
      done: (n) => `${n} ${plural(n, 'zrobiony', 'zrobione', 'zrobionych')}`,
      open: (n) => `${plural(n, 'czeka', 'czekają', 'czeka')} na Ciebie`,
      closed: 'rozstrzygnięte',
      band: (level, n) => `${n} ${[plural(n, 'niskie', 'niskie', 'niskich'), plural(n, 'średnie', 'średnie', 'średnich'), plural(n, 'wysokie', 'wysokie', 'wysokich')][level - 1]}`
    }
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
    kinds: { code: 'Code', test: 'Test', commit: 'Commit message', git: 'Search', run: 'Experiment', said: 'Conversation', doc: 'Document', web: 'Web page', plan: 'Plan' },
    commitLabel: 'commit message',
    saidLabel: 'conversation',
    beforeChange: 'before the change',
    more: (n) => `… and ${n} more line${n === 1 ? '' : 's'}`,
    planKicker: 'Change plan',
    base: 'Starting point',
    on: 'on',
    planFile: 'Plan',
    sections: (n) => `${n} section${n === 1 ? '' : 's'}`,
    openInPlan: 'Open this place in the plan',
    planCopyNote: (from, date, href, title) => `Copy of the plan from \`${from}\`, made ${date}. Illustrated explanation: [${title}](${href}).`,
    biblioIntroPlan: 'Code excerpts come from Git objects and show the state the plan starts from. Experiment results come from files saved when they ran. Unless noted otherwise, code is from {rev}.',
    biblioIntroPlanWorktree: 'Code excerpts come from the files on disk on {date}, the state the plan starts from, and may have changed since. Experiment results come from files saved when they ran.',
    figure: 'Figure',
    states: { same: 'unchanged', changed: 'changed', new: 'new', removed: 'removed' },
    lineStates: { changed: 'changed connection', new: 'new connection', removed: 'removed connection' },
    callStates: { changed: 'changed call', new: 'new call', removed: 'removed call' },
    fileChange: { new: 'new', changed: 'changed', removed: 'removed' },
    stepOf: (n, all) => `Step ${n} of ${all}`,
    stepWord: 'step',
    after: (list) => `after step${list.length === 1 ? '' : 's'} ${list.join(', ')}`,
    stepStatus: { doing: 'in progress', done: 'done' },
    doneWhen: 'Done when',
    files: (n) => `${n} file${n === 1 ? '' : 's'}`,
    lines: (n) => `${n} line${n === 1 ? '' : 's'}`,
    parallel: 'in parallel',
    roadmapCaption: 'The order of the steps. Click a card to jump to its description.',
    roadmapParallel: 'Steps in one row do not depend on each other, so they can be built in parallel.',
    filesCaption: 'The files the plan touches and the steps that change them. Line counts describe the starting point.',
    filesSum: { new: (n) => `${n} new`, changed: (n) => `${n} changed`, removed: (n) => `${n} removed` },
    stepsShort: (list) => `step${list.length === 1 ? '' : 's'} ${list.join(', ')}`,
    decision: 'Decision',
    decisionOpen: 'open',
    decisionDone: 'decided',
    recommend: 'recommended',
    chosen: 'chosen',
    whyOption: (letter) => `Why ${letter}`,
    answerHint: 'Select the question, press <kbd>C</kbd>, choose Agent as the recipient and write which way you choose or what the options miss.',
    riskHead: ['Risk', 'Likelihood', 'Impact', 'What we do about it'],
    likelihood: ['low', 'medium', 'high'],
    impact: ['low', 'medium', 'high'],
    sketch: 'Sketch',
    sketchNew: (file) => `new file ${file}`,
    sketchChange: (file) => `change in ${file}`,
    sketchNote: 'this code does not exist yet',
    progress: 'Progress',
    progressLine: (done, all) => `${done} of ${all} step${all === 1 ? '' : 's'} done`,
    glance: {
      label: 'The plan at a glance',
      steps: 'Steps',
      files: 'Files',
      decisions: 'Decisions',
      risks: 'Risks',
      stages: (n) => `${n} stage${n === 1 ? '' : 's'}`,
      done: (n) => `${n} done`,
      open: () => 'waiting for you',
      closed: 'decided',
      band: (level, n) => `${n} ${['low', 'medium', 'high'][level - 1]}`
    }
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
const isPlan = doc.kind === 'plan'
if (doc.kind !== undefined && !['diff', 'plan'].includes(doc.kind)) problem('"kind" is diff or plan')
const today = new Date().toISOString().slice(0, 10)

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

if (isPlan) {
  // Plan nie ma zmiany, tylko stan, od którego zaczyna: commit albo pliki na dysku.
  if (doc.change) problem('a plan has "base" instead of "change"')
  const base = doc.base ?? { rev: 'HEAD' }
  parentRev = null // nic w planie nie jest „przed zmianą”
  if (base.worktree) {
    changeLine = `${T.worktree}, ${today}, ${T.on} ${shortOf('HEAD')}`
  } else {
    if (tryGit('rev-parse', '--verify', `${base.rev}^{commit}`) === null) problem(`base.rev ${base.rev} is not a commit`)
    changeRev = shortOf(base.rev)
    changeLine = `${changeRev}, ${dateOf(changeRev)}`
  }
} else if (change.rev) {
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

const revAlias = (rev) => {
  if (rev === undefined || rev === 'change' || (isPlan && rev === 'base')) return changeRev
  if (rev === 'parent' && isPlan) {
    problem('a plan has no "parent" revision; quote "base" or a commit')
    return changeRev
  }
  return rev === 'parent' ? parentRev : rev
}
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
  // Plan opisuje kod, który ma się zmienić, więc nieskomitowane zmiany w tym pliku zmieniają też punkt wyjścia.
  if (isPlan && rev === changeRev && rev !== WORKTREE && !dirtyWarned.has(clean) && tryGit('status', '--porcelain', '--', clean)?.trim()) {
    dirtyWarned.add(clean)
    warn(`${where}: ${part.file} has uncommitted changes since ${rev}. If the plan builds on them, set "base": { "worktree": true }.`)
  }
  return { file: part.file.replace(/\\/g, '/'), rev, from: from + 1, to: from + count, excerpt }
}

const span = (part) => `${part.file}:${part.from}${part.to > part.from ? `-${part.to}` : ''}`

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
// Plan i objaśnienie zmiany leżą w jednym folderze gałęzi, więc plan ma przedrostek w nazwie.
const slug = ((name) => (isPlan && !name.startsWith('plan-') ? `plan-${name}` : name))(slugify(doc.slug ?? doc.title ?? 'explain'))
const out = resolve(option('--out') ?? join(mainCheckout, 'explain', branchPath, `${slug}.html`))

/* Foldery, których skaner biblioteki nie pokazuje. */
const skippedFolder = (name) => name.startsWith('.') || IGNORED_DIRECTORIES.has(name) || NON_DOCUMENT_FOLDERS.has(name.toLowerCase()) || TEST_OUTPUT_FOLDER.test(name)
const isInside = (root, path) => {
  const rel = relative(resolve(root), path)
  return !rel.startsWith('..') && !isAbsolute(rel)
}
function libraryRoots() {
  const home = process.env.BIBLIOTTER_HOME ?? process.env.HTMLDOCS_HOME ?? [join(homedir(), 'Bibliotter'), join(homedir(), 'HtmlDocs')].find((dir) => existsSync(join(dir, 'config.json')))
  try {
    const { roots } = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'))
    return Array.isArray(roots) ? roots : null
  } catch {
    return null // Bez konfiguracji apki nie wiemy, co skanuje.
  }
}
const visibleIn = (root, path) => isInside(root, path) && !relative(resolve(root), dirname(path)).split(/[\\/]/).filter(Boolean).some(skippedFolder)

/* Pliki w stanie wyjściowym planu albo w commicie zmiany, z pamięcią podręczną. */
const fileCache = new Map()
function fileAt(path, rev = changeRev) {
  const clean = path.replace(/\\/g, '/')
  const key = `${rev}\n${clean}`
  if (!fileCache.has(key)) {
    let text = null
    try {
      text = rev === WORKTREE ? (existsSync(join(repo, clean)) ? readAt(rev, clean) : null) : tryGit('cat-file', '-e', `${rev}:${clean}`) === null ? null : readAt(rev, clean)
    } catch {
      text = null
    }
    fileCache.set(key, { exists: text !== null, lines: text === null ? 0 : text.replace(/\n$/, '').split('\n').length })
  }
  return fileCache.get(key)
}
const baseName = () => (changeRev === WORKTREE ? T.worktree : changeRev)
function checkFile(path, state, where) {
  const now = fileAt(path)
  if (isPlan) {
    if (state === 'new' && now.exists) problem(`${where}: ${path} is marked new, but it already exists in ${baseName()}`)
    if (state !== 'new' && !now.exists) problem(`${where}: ${path} does not exist in ${baseName()}; mark it new or fix the path`)
    return
  }
  const before = fileAt(path, parentRev)
  if (state === 'new' && (!now.exists || before.exists)) problem(`${where}: ${path} is marked new, but the change does not add it`)
  else if (state === 'removed' && (now.exists || !before.exists)) problem(`${where}: ${path} is marked removed, but the change does not remove it`)
  else if (state !== 'new' && state !== 'removed' && !now.exists) problem(`${where}: ${path} does not exist in ${baseName()}`)
}
function commitLine(rev, where) {
  const line = tryGit('log', '-1', '--format=%h %s', rev)?.trim()
  if (!line) {
    problem(`${where}: "commit" ${rev} is not a commit`)
    return ''
  }
  return line.length > 64 ? `${line.slice(0, 61)}...` : line
}
const sketchBlock = (lines, file) => {
  const family = familyOf(file ?? '')
  return `<pre class="code plain">${lines.map((line) => `<span class="ln">${highlight(line, family) || ' '}</span>`).join('')}</pre>`
}

const plan = planKit({ doc, T, escape, problem, warn, fileAt, checkFile, commitLine, sketchBlock, readWork, isPlan })
const figureKit = figuresKit({ T, escape, problem, warn, checkFile })

/* Plik planu w Markdownie. Spoza biblioteki trafia jako kopia obok dokumentu, żeby oba były w apce. */
function planFile() {
  if (!doc.plan) return null
  const spec = typeof doc.plan === 'string' ? { file: doc.plan } : doc.plan
  // Względna ścieżka to najpierw folder roboczy, bo tam leży plan napisany na potrzeby dokumentu.
  const candidates = [resolve(work, String(spec.file ?? '')), resolve(repo, String(spec.file ?? ''))]
  const path = candidates.find((candidate) => spec.file && existsSync(candidate))
  if (!path) {
    problem(`"plan": ${spec.file} not found in the work folder or the repository; give an absolute path or one relative to either`)
    return null
  }
  if (extname(path).toLowerCase() !== '.md') warn(`"plan": ${basename(path)} is not a .md file`)
  const roots = libraryRoots()
  const visible = roots ? roots.some((root) => visibleIn(root, path)) : visibleIn(mainCheckout, path)
  const copy = spec.copy ?? !visible
  const target = copy ? join(dirname(out), `${basename(out, extname(out))}.md`) : path
  const href = relative(dirname(out), target).split(/[\\/]/).map(encodeURIComponent).join('/')
  return { path, target, copy, href }
}
plan.attachPlan(planFile())

/* Źródła */
const sources = doc.sources ?? {}
let runLetter = 0
const runOrder = []
function prepareSource(id, source) {
  const where = `source "${id}"`
  const kind = source.kind
  if (!T.kinds[kind]) {
    problem(`${where}: unknown kind "${kind}". Use code, test, commit, git, run, said, doc, web or plan.`)
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
    // Przy plikach na dysku samo {change} albo {base} znika, bo git grep bez rewizji czyta drzewo robocze.
    const list = (source.args ?? [])
      .filter((arg) => !(changeRev === WORKTREE && (arg === '{change}' || arg === '{base}')))
      .map((arg) => String(arg).replaceAll('{change}', changeRev).replaceAll('{base}', changeRev).replaceAll('{parent}', parentRev ?? changeRev))
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
  } else if (kind === 'web') {
    if (!/^https?:\/\//.test(source.url ?? '')) return problem(`${where}: "url" must start with http:// or https://`)
    if (source.quote && String(source.quote).split(/\s+/).length > 30) warn(`${where}: the quote is long; quote one sentence and say the rest in your own words`)
    source.label = source.label ?? source.title ?? new URL(source.url).hostname
    source.where = source.url
    source.body = `<p class="ref-from"><a href="${escape(source.url)}">${escape(source.title ?? source.url)}</a>${source.accessed ? ` · ${escape(source.accessed)}` : ''}</p>${source.quote ? `<blockquote>${escape(source.quote)}</blockquote>` : ''}`
  } else if (kind === 'plan') {
    // Fragment pliku planu: przypis prowadzi do nagłówka, który apka przewinie po kliknięciu.
    const section = plan.planSection(source.heading ?? '', where)
    if (!section) return
    const all = plan.planMd.lines.slice(section.line, section.end)
    while (all.length > 1 && !all.at(-1).trim()) all.pop()
    const limit = source.count ?? 14
    const shown = all.slice(0, limit)
    if (all.length > limit) shown.push(T.more(all.length - limit))
    source.label = source.label ?? `§ ${section.text}`
    source.where = `${basename(plan.planMd.target)} § ${section.text}`
    source.body = `<p class="ref-from"><a href="${escape(section.href)}">${T.openInPlan}</a></p>${plainBlock(shown)}`
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

/* {{fig:id}} wstawia numer rysunku. Numery nadaje build na końcu, w kolejności rysunków w tekście. */
const figRefs = new Set()
const figMark = (text) =>
  String(text).replace(/\{\{\s*fig\s*:\s*([\w-]+)\s*\}\}/g, (_, id) => {
    figRefs.add(id)
    return `${id}`
  })
const marks = (text) => plan.refs(figMark(expMark(text)))

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
  spec.used = true
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

const citeAll = (html, used) =>
  html.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, id) => {
    const mark = cite(id)
    if (mark && !used.includes(id)) used.push(id)
    return mark
  })
const rowHtml = (html, used, wide) => {
  const side = used.map((id) => `<a href="#z-${escape(id)}"><span class="num">${numbers.get(id)}</span><span>${escape(sources[id].label ?? sources[id].kindLabel)}</span></a>`).join('')
  return `<div class="row${wide ? ' wide' : ''}"><div class="col">${html}</div>${side ? `<aside class="src" aria-label="${T.sideLabel}">${side}</aside>` : ''}</div>`
}

/*
 * W planie nazwa w <code> bywa nowa, więc akapit bez źródła ostrzega tylko wtedy, gdy ta nazwa
 * już istnieje w stanie wyjściowym, czyli akapit mówi o dzisiejszym kodzie.
 */
const knownNames = new Map()
const existsInBase = (name) => {
  if (!knownNames.has(name)) {
    const list = changeRev === WORKTREE ? ['grep', '-q', '-F', '--untracked', '-e', name] : ['grep', '-q', '-F', '-e', name, changeRev]
    knownNames.set(name, spawnSync('git', list, { cwd: repo }).status === 0)
  }
  return knownNames.get(name)
}
const namesInCode = (block) =>
  [...block.matchAll(/<code>([^<]{3,80})<\/code>/g)]
    .map((match) => match[1].trim().replace(/\(\)$/, ''))
    .filter((name) => /^[\w$.\/-]+$/.test(name) && !/^\d/.test(name))
    .slice(0, 6)

const figures = doc.figures ?? {}
const MARKER = /^<!--\s*(check|listing|figure|step|decision|sketch|roadmap|files|risks)\s*(?::\s*([\w-]+))?\s*-->$/
let sketchNumber = 0
const placedFigures = new Set()
const placedSketches = new Set()
const headings = []
const blocks = essay.trim().split(/\n\s*\n/)
const body = blocks
  .map((raw) => {
    const block = raw.trim()
    const heading = block.match(/^<h2\b[^>]*>([\s\S]*?)<\/h2>$/)
    if (heading) {
      const n = headings.length + 1
      headings.push({ n, text: heading[1].trim() })
      return `<div class="row"><div class="col"><h2 class="ch" id="r${n}"><span class="n">${n}</span>${marks(heading[1].trim())}</h2></div></div>`
    }
    const marker = block.match(MARKER)
    if (marker) {
      const [, kind, id] = marker
      if (['check', 'listing', 'figure', 'step', 'decision', 'sketch'].includes(kind) && !id) {
        problem(`<!--${kind}--> needs an id: <!--${kind}:name-->`)
        return ''
      }
      if (kind === 'check' || kind === 'listing') {
        const html = kind === 'check' ? checkHtml(id) : listingHtml(id)
        return `<div class="row"><div class="col">${html}</div></div>`
      }
      // Kod szkicu nie przechodzi przez przypisy, bo {{ }} bywa w nim zwykłym kodem.
      if (kind === 'sketch') {
        placedSketches.add(id)
        return `<div class="row"><div class="col">${plan.sketch(id, ++sketchNumber)}</div></div>`
      }
      if (kind === 'figure') placedFigures.add(id)
      const html = kind === 'figure' ? figureKit.render(id, figures[id]) : kind === 'step' || kind === 'decision' ? plan[kind](id) : plan[kind]()
      const used = []
      return rowHtml(citeAll(marks(html), used), used, kind === 'figure' || kind === 'roadmap')
    }
    const used = []
    const html = citeAll(marks(block), used)
    const wide = /^<[a-z]+\b[^>]*\bclass\s*=\s*["'][^"']*\bwide\b/i.test(block)
    const prose = /^<(p|ul|ol)\b/i.test(block)
    // Pytanie otwarte, podsumowanie i akapity z klasą nocite (czego nie sprawdzono) nie twierdzą nic o kodzie.
    const exempt = /^<[a-z]+\b[^>]*(?:\bid\s*=\s*["']otwarte["']|\bclass\s*=\s*["'][^"']*\b(?:nocite|recap)\b)/i.test(block)
    if (prose && !exempt && used.length === 0 && /<code>/.test(block)) {
      const snippet = block.replace(/<[^>]+>/g, '').slice(0, 70)
      if (!isPlan) warn(`paragraph about code without a source: "${snippet}..."`)
      else {
        const known = namesInCode(block).filter(existsInBase)
        if (known.length > 0) warn(`paragraph names ${known.map((name) => `"${name}"`).join(', ')}, which exist in ${baseName()}, but cites nothing: "${snippet}..."`)
      }
    }
    return rowHtml(html, used, wide)
  })
  .join('\n')

if (headings.length < 2) problem('essay.html needs numbered chapters: at least two <h2> blocks')
const chapterLimit = isPlan ? 9 : 8
if (headings.length > chapterLimit) warn(`${headings.length} chapters; more than ${chapterLimit} reads like a manual. Merge the short ones.`)
plan.finish()
for (const id of Object.keys(sources)) if (!numbers.has(id) && sources[id].body) problem(`source "${id}" is never cited`)
for (const id of Object.keys(checks)) if (!checks[id].used) warn(`check "${id}" is defined but not placed in essay.html`)
for (const id of Object.keys(listings)) if (!listings[id].used) warn(`listing "${id}" is defined but not placed; add <!--listing:${id}-->`)
for (const id of Object.keys(figures)) if (!placedFigures.has(id)) warn(`figure "${id}" is defined but not placed; add <!--figure:${id}-->`)
for (const id of Object.keys(doc.sketches ?? {})) if (!placedSketches.has(id)) warn(`sketch "${id}" is defined but not placed; add <!--sketch:${id}-->`)
// Litera eksperymentu wpisana ręcznie rozjeżdża się z kolejnością przypisów.
const typedLetters = [essay, ...(doc.annex ?? []).flatMap((item) => [item.title ?? '', item.note ?? ''])].join('\n').match(/\b(?:[Ee]ksperymen\w*|[Ee]xperiment)\s+[A-H]\b/g)
if (typedLetters) warn(`experiment letters typed by hand (${[...new Set(typedLetters)].join(', ')}); write {{exp:id}}, because letters follow the order of citations`)
if (Object.keys(checks).length > 3) warn('more than three questions turns an essay into a quiz')
if (answerPositions.length >= 2 && answerPositions.every((at) => at === answerPositions[0])) warn('every question has its answer at the same position')

/* Eksperymenty dostają litery w kolejności pierwszego przypisu. */
for (const id of [...numbers.keys()].filter((key) => sources[key].kind === 'run')) {
  const letter = String.fromCharCode(65 + runLetter++)
  sources[id].letter = letter
  sources[id].label = sources[id].label ?? `${T.kinds.run} ${letter}`
  sources[id].kindLabel = `${T.kinds.run} ${letter}`
}
// Napisy na marginesie powstały przed nadaniem liter, więc uzupełniamy je teraz.
const lettered = expFill(body).replace(/<span class="num">(\d+)<\/span><span>([^<]*)<\/span>/g, (all, number, label) => {
  const id = [...numbers].find(([, n]) => String(n) === number)?.[0]
  return id && sources[id].kind === 'run' ? `<span class="num">${number}</span><span>${escape(sources[id].label)}</span>` : all
})

/* Rysunki z podpisem dostają numery po kolei; ręcznie wpisany numer build poprawia. */
const figureNumbers = new Map()
const numbered = lettered.replace(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/g, (all, attrs, inner) => {
  if (!/\bclass\s*=\s*["'][^"']*\bfig\b/.test(attrs) || !/<figcaption\b/.test(inner)) return all
  const number = figureNumbers.size + 1
  const id = /\bid\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1] ?? `#${number}`
  figureNumbers.set(id, number)
  return `<figure${attrs}>${inner.replace(/<figcaption\b([^>]*)>\s*(?:(?:Rysunek|Figure)\s+\d+\.\s*)?/, `<figcaption$1>${T.figure} ${number}. `)}</figure>`
})
const figFill = (html) =>
  html.replace(/([\w-]+)/g, (_, id) => {
    if (!figureNumbers.has(id)) problem(`{{fig:${id}}} names no figure; give the <figure> id="${id}" and a <figcaption>`)
    return figureNumbers.get(id) ?? '?'
  })
const finalBody = figFill(numbered)
const abstractHtml = (doc.abstract ?? []).map((paragraph) => `<p>${figFill(expFill(marks(paragraph)))}</p>`).join('\n')
const glanceHtml = plan.glance()

/* Aneks: skrypty eksperymentów w całości, żeby dało się je uruchomić ponownie. */
const annex = (doc.annex ?? [])
  .map((item, index) => {
    if (!item.file || !existsSync(join(work, item.file))) {
      problem(`annex ${index + 1}: file ${item.file} not found in ${work}`)
      return ''
    }
    const lines = readWork(item.file).trimEnd().split('\n')
    const letter = String.fromCharCode(65 + index)
    return `<h3 id="aneks-${letter.toLowerCase()}">${T.annex} ${letter}. ${expFill(expMark(escape(item.title ?? item.file)))}</h3>${item.note ? `<p>${expFill(expMark(item.note))}</p>` : ''}<details><summary>${T.showFile.replace('{n}', lines.length)}</summary>${codeBlock(lines, 1, item.file)}</details>`
  })
  .join('')

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
  const roots = libraryRoots()
  if (roots && !roots.some((root) => isInside(root, out))) warn(`${out} is outside the folders Bibliotter scans (${roots.join(', ')})`)
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
if (!Array.isArray(doc.abstract) || doc.abstract.length === 0) problem('doc.json needs "abstract": one to three paragraphs with the thesis')
if (!doc.title) problem('doc.json needs "title"')

const style = existsSync(join(work, 'style.css')) ? readWork('style.css') : ''
const script = existsSync(join(work, 'script.js')) ? readWork('script.js') : ''
if (/attachShadow/.test(script)) problem('script.js: no Shadow DOM')
const kitScript = readFileSync(join(KIT, 'kit.js'), 'utf8').replace('__KIT_TEXT__', JSON.stringify({ again: T.again, recap: T.recap, revisit: T.revisit, waiting: T.waiting }))
const planMd = plan.planMd
const progress = plan.progress()
const bylineRows = [
  `<b>${isPlan ? T.base : T.change}</b> ${escape(changeLine)}`,
  planMd ? `<b>${T.planFile}</b> <a href="${escape(planMd.href)}">${escape(basename(planMd.target))}</a> · ${T.sections(planMd.headings.length)}` : '',
  `<b>${T.text}</b> ${escape(writtenBy)}, ${today}`,
  `<b>${T.basis}</b> ${T.sources(numbers.size, runs)} · ${T.minutes(minutes)}`,
  progress ? `<b>${T.progress}</b> ${progress}` : ''
]
  .filter(Boolean)
  .join('<br>')
const biblioIntro = !isPlan
  ? T.biblioIntro.replace('{rev}', escape(changeRev === WORKTREE ? T.worktree : changeRev))
  : changeRev === WORKTREE
    ? T.biblioIntroPlanWorktree.replace('{date}', today)
    : T.biblioIntroPlan.replace('{rev}', escape(changeRev))
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
<meta name="bibliotter-kind" content="${isPlan ? 'plan' : 'explain'}">
<meta name="bibliotter-kit" content="${KIT_VERSION}">
<meta name="bibliotter-doc" content="${escape(slug)}">
${fullChange ? `<meta name="${isPlan ? 'bibliotter-base' : 'bibliotter-commit'}" content="${fullChange}">\n` : ''}${planMd ? `<meta name="bibliotter-plan" content="${escape(planMd.href)}">\n` : ''}<title>${escape(doc.title ?? '')}</title>
<style>${fonts}
${readFileSync(join(KIT, 'kit.css'), 'utf8')}${style ? `\n/* Styl tego dokumentu */\n${style}` : ''}</style>
</head>
<body>
<main>
<header>
<p class="kicker">${escape(doc.kicker ?? `${isPlan ? T.planKicker : T.kicker} · ${project} · ${changeRev === WORKTREE ? T.worktree : changeRev}`)}</p>
<h1>${escape(doc.title ?? '')}</h1>
${doc.subtitle ? `<p class="subtitle">${escape(doc.subtitle)}</p>` : ''}
<p class="byline">${bylineRows}</p>
</header>
<section class="abstract" aria-label="${T.abstract}">
<h2>${T.abstract}</h2>
${abstractHtml}
</section>
${glanceHtml}<nav class="toc" aria-label="${T.toc}"><ol>${tocItems}</ol></nav>
${finalBody}
<section class="biblio" id="bibliografia">
<h2>${T.bibliography}</h2>
<p class="intro">${biblioIntro}</p>
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
  if (planMd?.copy) console.log(`would copy the plan to ${planMd.target}`)
  process.exit(0)
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)

/* Kopia planu spoza biblioteki leży obok dokumentu i na górze linkuje do objaśnienia. */
if (planMd?.copy) {
  const front = /^---\r?\n[\w-]+:[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(planMd.source)?.[0] ?? ''
  const shown = planMd.path.startsWith(homedir()) ? `~${planMd.path.slice(homedir().length).replace(/\\/g, '/')}` : planMd.path.replace(/\\/g, '/')
  const note = `> ${T.planCopyNote(shown, today, encodeURIComponent(basename(out)), String(doc.title ?? '').replace(/[[\]]/g, ''))}\n\n`
  writeFileSync(planMd.target, `${front}${note}${planMd.source.slice(front.length)}`)
  console.log(`copied the plan to ${planMd.target}`)
}

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
