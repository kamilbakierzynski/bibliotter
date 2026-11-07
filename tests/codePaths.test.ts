import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { codePathBases, codePathCandidates, findCodePaths, pathPart } from '../src/main/codePaths'
import { linkTarget } from '../src/main/docLinks'
import { renderMarkdown } from '../src/main/markdown'

describe('pathPart', () => {
  it('rozpoznaje ścieżki z ukośnikiem, rozszerzeniem i numerem wiersza', () => {
    expect(pathPart('src/app.ts')).toBe('src/app.ts')
    expect(pathPart('Assets/Game/Layout/')).toBe('Assets/Game/Layout')
    expect(pathPart('package.json')).toBe('package.json')
    expect(pathPart('src/app.ts:42')).toBe('src/app.ts')
    expect(pathPart('src/app.ts:12-20')).toBe('src/app.ts')
    expect(pathPart('C:\\repo\\a.ps1')).toBe('C:\\repo\\a.ps1')
    expect(pathPart('pages/[id].tsx')).toBe('pages/[id].tsx')
  })

  it('odrzuca polecenia, wywołania, adresy i zwykłe słowa', () => {
    for (const code of ['npm test', 't()', 'a = b', 'https://example.com/a.js', '--watch', '~/notes.md', '\\\\serwer\\udział\\a.txt', 'DocEntry', '..', '1.5x', '$HOME/a']) {
      expect(pathPart(code), code).toBeNull()
    }
  })
})

describe('codePathCandidates', () => {
  it('bierze pojedyncze kawałki kodu, bez powtórek', () => {
    const source = 'Zob. `src/a.ts` i `src/a.ts`, potem `npm test` oraz ``src/b.ts``.\n\n```\nsrc/c.ts\n```\n'
    expect(codePathCandidates(source)).toEqual(['src/a.ts'])
  })
})

describe('findCodePaths', () => {
  let root: string
  let doc: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'code-paths-'))
    await mkdir(join(root, '.git'))
    await mkdir(join(root, 'docs', 'plany'), { recursive: true })
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(join(root, 'Assets', 'Layout'), { recursive: true })
    await writeFile(join(root, 'src', 'app.ts'), 'export {}\n')
    await writeFile(join(root, 'src', 'a#b.ts'), '\n')
    await writeFile(join(root, 'docs', 'plany', 'obok.md'), '# Obok\n')
    doc = join(root, 'docs', 'plany', 'plan.md')
    await writeFile(doc, '# Plan\n')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('czyta ścieżki od folderu dokumentu w górę aż do korzenia repozytorium', async () => {
    expect(await codePathBases(doc)).toEqual([join(root, 'docs', 'plany'), join(root, 'docs'), root])
  })

  it('daje link tylko kodowi, który wskazuje istniejący plik albo katalog', async () => {
    const source = [
      '`src/app.ts:12`, `Assets/Layout/`, `obok.md`, `src/brak.ts`, `src/a#b.ts`, `npm test`',
      `i ścieżka bezwzględna \`${join(root, 'src', 'app.ts')}\``
    ].join('\n')
    const links = await findCodePaths(source, doc)

    expect(Object.fromEntries(links)).toEqual({
      'src/app.ts:12': '../../src/app.ts:12',
      'Assets/Layout/': '../../Assets/Layout',
      'obok.md': 'obok.md',
      'src/a#b.ts': '../../src/a%23b.ts',
      [join(root, 'src', 'app.ts')]: '../../src/app.ts'
    })
    // Link prowadzi tam, gdzie leży plik, tak jak zwykły link w dokumencie.
    expect(linkTarget(links.get('src/app.ts:12') as string, doc)?.path).toBe(join(root, 'src', 'app.ts:12'))
    expect(linkTarget(links.get('src/a#b.ts') as string, doc)?.path).toBe(join(root, 'src', 'a#b.ts'))
  })

  it('bez repozytorium czyta tylko folder dokumentu', async () => {
    const loose = await mkdtemp(join(tmpdir(), 'code-paths-loose-'))
    try {
      await mkdir(join(loose, 'notatki'))
      await writeFile(join(loose, 'a.ts'), '\n')
      expect(await codePathBases(join(loose, 'notatki', 'x.md'))).toEqual([join(loose, 'notatki')])
    } finally {
      await rm(loose, { recursive: true, force: true })
    }
  })
})

describe('renderMarkdown z linkami kodu', () => {
  const links = new Map([['src/app.ts', '../src/app.ts']])

  it('zamienia znany kod w link, a resztę zostawia', () => {
    const { html } = renderMarkdown('Zob. `src/app.ts` i `src/inne.ts`.', undefined, links)

    expect(html).toContain('<a class="code-path" href="../src/app.ts"><code>src/app.ts</code></a>')
    expect(html).toContain('<code>src/inne.ts</code>')
  })

  it('nie wkłada linku do linku ani do bloku kodu', () => {
    const { html } = renderMarkdown('[opis `src/app.ts`](https://example.com)\n\n```\nsrc/app.ts\n```\n', undefined, links)

    expect(html).not.toContain('code-path')
  })

  it('bez spisu działa jak dawniej', () => {
    expect(renderMarkdown('`src/app.ts`').html).toBe('<p><code>src/app.ts</code></p>\n')
  })
})
