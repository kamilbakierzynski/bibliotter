import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analyzeHtml, classify } from '../src/main/classify'
import { isIgnoredDirectory } from '../src/main/scanner'

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

  it('pomija tylko foldery, które pomija też skaner', () => {
    const kit = readFileSync(BUILD, 'utf8')
    const list = /const IGNORED_DIRECTORIES = new Set\(\[([^\]]+)\]\)/.exec(kit)?.[1] ?? ''
    const names = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1] as string)
    expect(names.length).toBeGreaterThan(10)
    for (const name of names) expect(isIgnoredDirectory(name), name).toBe(true)
  })
})
