import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { analyzeHtml, classify } from '../src/main/classify'
import { extractLinks, linkTarget } from '../src/main/docLinks'
import { renderMarkdown } from '../src/main/markdown'
import { isIgnoredDirectory } from '../src/main/scanner'

const { readHeadings } = createRequire(__filename)('../plugin/bibliotter/kit/plan.cjs')

/*
 * Kit z pluginu powiela reguły biblioteki, bo działa poza apką. Ten test pilnuje, żeby
 * dokument złożony kitem dalej był dla biblioteki dokumentem, a lista pomijanych folderów
 * w kicie nie obiecywała więcej niż skaner.
 */
const BUILD = resolve(__dirname, '../plugin/bibliotter/kit/build.cjs')

let root = ''
let repo = ''
const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })

function workFolder(name: string, essay: string, sources: Record<string, unknown>): string {
  const folder = join(root, name)
  mkdirSync(join(folder, 'runs'), { recursive: true })
  writeFileSync(join(folder, 'runs', 'a.txt'), 'krok 1: 2 zdjęcia\nkrok 2: 2 zdjęcia\n')
  writeFileSync(join(folder, 'essay.html'), essay)
  writeFileSync(
    join(folder, 'doc.json'),
    JSON.stringify({
      lang: 'pl',
      repo,
      change: { rev: 'HEAD' },
      slug: name,
      title: `Objaśnienie ${name}`,
      abstract: ['Streszczenie z tezą, które mówi, co czytelnik sprawdzi.'],
      sources,
      checks: {
        q1: {
          title: 'ile razy',
          question: 'Ile razy?',
          options: [
            { text: 'Raz', why: 'Tak było przed zmianą.' },
            { text: 'Dwa', why: 'Tyle pokazał eksperyment.', correct: true }
          ]
        }
      }
    })
  )
  return folder
}

const build = (folder: string, out: string) =>
  spawnSync(process.execPath, [BUILD, folder, '--out', out, '--no-exclude'], { encoding: 'utf8' })

const planMarkdown = '---\ntitle: Plan stempla\n---\n# Plan stempla\n\n## Krok 1: stempel w cache\n\nTekst kroku.\n\n## Ryzyka\n\nPierwsze.\n\n## Ryzyka\n\nDrugie o tej samej nazwie.\n'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function planDoc(): any {
  return {
    kind: 'plan',
    lang: 'pl',
    repo,
    base: { rev: 'HEAD' },
    plan: '',
    slug: 'unused',
    title: 'Plan stempla w pamięci',
    abstract: ['Dziś stempel liczy się za każdym razem. Krok {{step:cache}} to zmienia, a decyzja {{decision:gdzie}} czeka.'],
    sources: {
      stamp: { kind: 'code', note: 'Funkcja stempla.', file: 'src/stamp.ts', anchor: 'function stampOf', count: 3 },
      risk: { kind: 'plan', note: 'Drugi rozdział o ryzykach.', heading: 'ryzyka-1' }
    },
    figures: {
      droga: {
        type: 'flow',
        caption: 'Droga stempla dziś i po zmianie.{{stamp}}',
        lanes: ['Okno', 'Proces główny'],
        nodes: [
          { id: 'view', label: 'Widok', lane: 0, row: 0 },
          { id: 'stamp', label: 'Stempel', sub: 'stamp.ts', lane: 1, row: 0, state: 'changed', file: 'src/stamp.ts' },
          { id: 'cache', label: 'Pamięć stempli', lane: 1, row: 1, state: 'new', file: 'src/cache.ts' }
        ],
        edges: [
          { from: 'view', to: 'stamp', label: 'stampOf(sha)' },
          { from: 'stamp', to: 'cache', label: 'get', state: 'new' }
        ]
      }
    },
    steps: [
      { id: 'cache', title: 'Dodaj pamięć stempli', goal: 'Drugi odczyt nie liczy stempla.', size: 'S', plan: 'Krok 1: stempel w cache', files: [{ path: 'src/cache.ts', change: 'new' }, 'src/stamp.ts'], verify: 'Test pamięci przechodzi.' },
      { id: 'use', title: 'Użyj pamięci w widoku', goal: 'Widok pyta pamięć.', size: 'M', files: ['src/stamp.ts'], verify: 'Ręczne otwarcie dwa razy.' }
    ],
    decisions: {
      gdzie: {
        title: 'Gdzie trzymać stemple',
        question: 'Czy pamięć ma przetrwać restart aplikacji?',
        options: [
          { text: 'Tylko w pamięci', pros: ['prosto'], cons: ['znika po restarcie'], recommended: true },
          { text: 'Na dysku', pros: ['przetrwa restart'], cons: ['trzeba sprzątać'] }
        ],
        why: 'Stempel liczy się szybko.{{stamp}}'
      }
    },
    risks: [{ text: 'Pamięć rośnie bez końca.', likelihood: 'low', impact: 'mid', mitigation: 'Limit wpisów.', step: 'cache' }]
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function planFolder(name: string, doc: any): string {
  const folder = join(root, name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'plan.md'), planMarkdown)
  writeFileSync(
    join(folder, 'essay.html'),
    `<h2>Jak jest dziś</h2>\n\n<p>${prose}Funkcja liczy stempel przy każdym wywołaniu.{{stamp}}</p>\n\n<!--figure:droga-->\n\n<h2>Kroki</h2>\n\n<!--roadmap-->\n\n<!--step:cache-->\n\n<p>${prose}</p>\n\n<!--step:use-->\n\n<!--files-->\n\n<h2>Decyzje i ryzyka</h2>\n\n<!--decision:gdzie-->\n\n<!--risks-->\n\n<p>Ryzyko opisuje plik planu.{{risk}}</p>\n\n<p class="nocite">Nie mierzyłem czasu stempla.</p>`
  )
  writeFileSync(join(folder, 'doc.json'), JSON.stringify({ ...doc, plan: join(folder, 'plan.md'), slug: name }))
  return folder
}

const prose = 'Zdanie, które objaśnia działanie zmiany prostymi słowami i ma swoje źródło. '.repeat(8)
const goodEssay = `<h2>Problem</h2>

<p>${prose}Funkcja liczy stempel.{{stamp}}</p>

<!--check:q1-->

<h2>Eksperyment</h2>

<p>${prose}Wynik uruchomienia.{{run}} Opis zmiany.{{commit}}</p>

<p>W eksperymencie {{exp:run}} stempel zmienia się dwa razy.</p>

<p class="nocite">Nie uruchamiałem <code>npm test</code> przy tym commicie.</p>`

const goodSources = {
  stamp: { kind: 'code', note: 'Funkcja stempla.', file: 'src/stamp.ts', anchor: 'function stampOf', count: 3 },
  run: { kind: 'run', note: 'Wynik.', file: 'runs/a.txt', command: 'node harness.cjs' },
  commit: { kind: 'commit', note: 'Opis.' }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'explain-kit-'))
  repo = join(root, 'repo')
  mkdirSync(join(repo, 'src'), { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: repo })
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  writeFileSync(join(repo, 'src', 'stamp.ts'), 'export const a = 1\nexport function stampOf(sha: string): string {\n  return `${sha}-dark`\n}\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Dodaj stempel')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5 })
})

describe('kit dokumentów explain', () => {
  it('składa dokument, który biblioteka uznaje za dokument', () => {
    const out = join(root, 'explain', 'main', 'dobry.html')
    const result = build(workFolder('dobry', goodEssay, goodSources), out)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    // Akapit z klasą nocite mówi, czego nie sprawdzono, więc nie potrzebuje źródła.
    expect(result.stdout).not.toContain('without a source')

    const html = readFileSync(out, 'utf8')
    expect(html).toContain('W eksperymencie A stempel')
    const verdict = classify(analyzeHtml(html), { relPath: 'explain/main/dobry.html', siblings: 1, format: 'html' })
    expect(verdict.classification).toBe('document')
    // Kod w bibliografii pochodzi z Gita, a nie z eseju.
    expect(html).toContain('function</span> stampOf')
    expect(html).toContain('Eksperyment A')
    expect(html).toContain('Dodaj stempel')
  })

  it('odrzuca kotwicę, której nie ma w kodzie, i nic nie zapisuje', () => {
    const out = join(root, 'explain', 'main', 'zly.html')
    const sources = { ...goodSources, stamp: { ...goodSources.stamp, anchor: 'function zmyslona' } }
    const result = build(workFolder('zly', goodEssay, sources), out)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('anchor not found')
    expect(() => readFileSync(out)).toThrow()
  })

  it('odrzuca źródło bez przypisu, nieznany przypis i skrypt w eseju', () => {
    const essay = `${goodEssay}\n\n<p>Akapit z nieznanym przypisem.{{brak}} Litera opisu {{exp:commit}}.</p>\n\n<script>alert(1)</script>`
    const result = build(workFolder('reguly', essay, { ...goodSources, zbedne: { kind: 'commit', note: 'Nieużyte.' } }), join(root, 'x.html'))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('source "zbedne" is never cited')
    expect(result.stderr).toContain('{{brak}}')
    expect(result.stderr).toContain('no <script> in essay.html')
    expect(result.stderr).toContain('only run sources have letters')
  })

  it('składa plan z kopią pliku planu, która linkuje z powrotem', () => {
    const folder = planFolder('plan-dobry', planDoc())
    const out = join(root, 'explain', 'main', 'plan-dobry.html')
    const result = build(folder, out)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)

    const html = readFileSync(out, 'utf8')
    expect(html).toContain('<meta name="bibliotter-kind" content="plan">')
    expect(html).toContain('<meta name="bibliotter-plan" content="plan-dobry.md">')
    const verdict = classify(analyzeHtml(html), { relPath: 'explain/main/plan-dobry.html', siblings: 1, format: 'html' })
    expect(verdict.classification).toBe('document')
    // Krok i przypis prowadzą do nagłówków pliku planu, z tym samym identyfikatorem co w arkuszu.
    expect(html).toContain('href="plan-dobry.md#krok-1-stempel-w-cache"')
    expect(html).toContain('href="plan-dobry.md#ryzyka-1"')
    expect(html).toContain('Krok 2 z 2')
    expect(html).toContain('Rysunek 1. Droga stempla')
    expect(html).toContain('<svg viewBox=')
    // Odnośniki {{step:..}} i {{decision:..}} stają się numerami.
    expect(html).toContain('<a class="xref" href="#krok-cache">1</a>')
    expect(html).toContain('<a class="xref" href="#decyzja-gdzie">1</a>')

    const copy = readFileSync(join(root, 'explain', 'main', 'plan-dobry.md'), 'utf8')
    expect(copy.startsWith('---\ntitle: Plan stempla\n---\n> Kopia planu z')).toBe(true)
    expect(copy).toContain('(plan-dobry.html)')

    // Apka widzi parę tą samą drogą co zwykłe linki: plan prowadzi do kopii, a kopia do planu.
    const copyPath = join(root, 'explain', 'main', 'plan-dobry.md')
    const toPlan = extractLinks('html', html).map((link) => linkTarget(link.href, out)).filter((target) => target?.path === copyPath)
    expect(toPlan.map((target) => target?.fragment)).toContain('krok-1-stempel-w-cache')
    const back = extractLinks('markdown', copy).map((link) => linkTarget(link.href, copyPath)?.path)
    expect(back).toContain(out)
  })

  it('odrzuca plan z błędnymi plikami, zależnościami i rysunkiem', () => {
    const doc = planDoc()
    doc.steps[0].files = [{ path: 'src/stamp.ts', change: 'new' }, 'src/zmyslony.ts']
    doc.steps[1].after = ['brak']
    doc.figures.droga.edges.push({ from: 'stamp', to: 'duch' })
    const result = build(planFolder('plan-zly', doc), join(root, 'explain', 'main', 'plan-zly.html'))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('src/stamp.ts is marked new, but it already exists')
    expect(result.stderr).toContain('src/zmyslony.ts does not exist')
    expect(result.stderr).toContain('unknown step "brak"')
    expect(result.stderr).toContain('names a node that is not defined')
  })

  it('liczy kotwice nagłówków tak samo jak arkusz Markdownu w apce', () => {
    const source = [
      '---',
      'title: Tytuł',
      '---',
      '# Plan: skok do nagłówka',
      '## Krok 1 — indeks `headings`',
      '## **Ważne** i [link](x.md)',
      '## Krok 1 — indeks `headings`',
      '## Zażółć gęślą jaźń? ##',
      '```',
      '# to nie nagłówek',
      '```',
      'Podkreślony',
      '----------',
      '### A & B',
      '## [[Notatka|alias]] i _kursywa_'
    ].join('\n')
    const app = [...renderMarkdown(source).html.matchAll(/<h[1-6] id="([^"]*)"/g)].map((match) => match[1])
    const kit = readHeadings(source).headings.map((heading: { id: string }) => heading.id)
    expect(kit).toEqual(app)
  })

  it('pomija tylko foldery, które pomija też skaner', () => {
    const kit = readFileSync(BUILD, 'utf8')
    const list = /const IGNORED_DIRECTORIES = new Set\(\[([^\]]+)\]\)/.exec(kit)?.[1] ?? ''
    const names = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1] as string)
    expect(names.length).toBeGreaterThan(10)
    for (const name of names) expect(isIgnoredDirectory(name), name).toBe(true)
  })
})
