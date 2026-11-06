import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isInside, walkRoots } from '../src/main/scanner'

let root: string

async function put(path: string, content = '<html></html>'): Promise<void> {
  const target = join(root, path)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'scan-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('walkRoots', () => {
  it('wskazuje najbliższe repozytorium i liczbę plików w folderze', async () => {
    await mkdir(join(root, 'repo', '.git'), { recursive: true })
    await put('repo/docs/plan.html')
    await put('repo/docs/inny.htm')
    await put('luzny.html')

    const { files } = await walkRoots([root])
    const plan = files.find((file) => file.name === 'plan.html')

    expect(plan?.repoDir).toBe(join(root, 'repo'))
    expect(plan?.siblings).toBe(2)
    expect(files.find((file) => file.name === 'luzny.html')?.repoDir).toBeNull()
  })

  it('znajduje Markdown i liczy pliki osobno dla każdego formatu', async () => {
    await put('docs/plan.md', '# Plan')
    await put('docs/notatki.MARKDOWN', '# Notatki')
    await put('docs/raport.html')
    await put('docs/szkic.mdx', '# Nie')

    const { files } = await walkRoots([root])
    const summary = files.map(({ name, format, siblings }) => [name, format, siblings]).sort()

    expect(summary).toEqual([
      ['notatki.MARKDOWN', 'markdown', 2],
      ['plan.md', 'markdown', 2],
      ['raport.html', 'html', 1]
    ])
  })

  it('rozpoznaje worktree, w którym .git jest plikiem', async () => {
    await put('wt/.git', 'gitdir: ../repo/.git/worktrees/wt')
    await put('wt/a.html')

    const { files } = await walkRoots([root])

    expect(files[0]?.repoDir).toBe(join(root, 'wt'))
  })

  it('pomija katalogi zależności, buildów i ukryte', async () => {
    await put('node_modules/pkg/index.html')
    await put('dist/index.html')
    await put('.cache/page.html')
    await put('notatka.txt')

    expect((await walkRoots([root])).files).toEqual([])
  })

  it('zgłasza niedostępny folder bez przerywania skanu', async () => {
    await put('a.html')
    const missing = join(root, 'nie-ma')

    const result = await walkRoots([missing, root])

    expect(result.unavailableRoots).toEqual([missing])
    expect(result.files).toHaveLength(1)
  })

  it('nie dubluje pliku przy nakładających się folderach', async () => {
    await put('sub/a.html')

    expect((await walkRoots([root, join(root, 'sub')])).files).toHaveLength(1)
  })
})

describe('isInside', () => {
  it('nie myli folderu z folderem o wspólnym początku nazwy', () => {
    expect(isInside(join(root, 'a', 'x.html'), join(root, 'a'))).toBe(true)
    expect(isInside(join(root, 'ab', 'x.html'), join(root, 'a'))).toBe(false)
  })
})
