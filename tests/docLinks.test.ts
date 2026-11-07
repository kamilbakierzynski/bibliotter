import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractLinks, LinkGraph, linkTarget } from '../src/main/docLinks'
import { isLocalHref } from '../src/shared/links'
import type { DocEntry, LibrarySnapshot } from '../src/shared/types'

describe('isLocalHref', () => {
  it('uznaje za lokalne ścieżki i ścieżki z dyskiem', () => {
    for (const href of ['plan.md', './plan.md', '../plan.md', '/plan.md', 'C:/Users/a/plan.md', 'C:\\a\\plan.md', 'src/a.ts:42']) {
      expect(isLocalHref(href)).toBe(true)
    }
  })

  it('nie uznaje kotwic ani adresów ze schematem', () => {
    for (const href of ['', '#cel', 'https://example.com', 'mailto:a@b.c', 'xref:Unity.Thing', 'javascript:alert(1)']) {
      expect(isLocalHref(href)).toBe(false)
    }
  })
})

describe('linkTarget', () => {
  const doc = resolve('/repo/docs/plan.md')

  it('liczy ścieżkę od miejsca dokumentu, także przez `..`', () => {
    expect(linkTarget('inny.md', doc)?.path).toBe(resolve('/repo/docs/inny.md'))
    expect(linkTarget('./inny.md', doc)?.path).toBe(resolve('/repo/docs/inny.md'))
    expect(linkTarget('../README.md', doc)?.path).toBe(resolve('/repo/README.md'))
    expect(linkTarget('../../wyzej/a.md', doc)?.path).toBe(resolve('/wyzej/a.md'))
  })

  it('oddziela kotwicę i zapytanie od ścieżki', () => {
    expect(linkTarget('inny.md#cel?x', doc)).toEqual({ path: resolve('/repo/docs/inny.md'), fragment: 'cel?x' })
    expect(linkTarget('inny.md?v=2', doc)).toEqual({ path: resolve('/repo/docs/inny.md'), fragment: '' })
  })

  it('dekoduje nazwę, ale przeżyje znak procentu w nazwie pliku', () => {
    expect(linkTarget('%C5%BC%C3%B3%C5%82%20ty.md', doc)?.path).toBe(resolve('/repo/docs/żół ty.md'))
    expect(linkTarget('100%.md', doc)?.path).toBe(resolve('/repo/docs/100%.md'))
  })

  it('nie zwraca niczego dla kotwicy, schematu i samego zapytania', () => {
    expect(linkTarget('#cel', doc)).toBeNull()
    expect(linkTarget('https://example.com/a.md', doc)).toBeNull()
    expect(linkTarget('?x=1', doc)).toBeNull()
  })

  it.runIf(process.platform === 'win32')('nie wychodzi na inną maszynę', () => {
    for (const href of ['//host/udzial/a.md', '\\\\host\\udzial\\a.md', '%5C%5Chost%5Cudzial%5Ca.md', '%5C%5C%3F%5CUNC%5Chost%5Cudzial%5Ca.md', '/\\host\\udzial\\a.md']) {
      expect(linkTarget(href, doc)).toBeNull()
    }
  })

  it.runIf(process.platform === 'win32')('zostaje w udziale, w którym leży dokument', () => {
    const shared = '\\\\nas\\dokumenty\\plan.md'

    expect(linkTarget('inny.md', shared)?.path).toBe('\\\\nas\\dokumenty\\inny.md')
    expect(linkTarget('//inny/udzial/a.md', shared)).toBeNull()
  })

  it.runIf(process.platform === 'win32')('przyjmuje ścieżkę bezwzględną z dyskiem', () => {
    expect(linkTarget('C:/Users/a/kod.ts', doc)?.path).toBe('C:\\Users\\a\\kod.ts')
    expect(linkTarget('C:%5CUsers%5Ca%5Ckod.ts', doc)?.path).toBe('C:\\Users\\a\\kod.ts')
  })
})

describe('extractLinks', () => {
  it('czyta linki zwykłe, referencyjne i z HTML, ale nie z kodu ani obrazków', () => {
    const source = [
      '[jeden](a.md) oraz [dwa **mocno**][ref] i ![obraz](b.png)',
      '',
      '<a href="c.md">trzy</a>',
      '',
      '```',
      '[kod](d.md)',
      '```',
      '',
      '`[kod](e.md)`',
      '',
      '[ref]: https://example.com/?a=1&b=2'
    ].join('\n')

    expect(extractLinks('markdown', source)).toEqual([
      { href: 'a.md', text: 'jeden' },
      { href: 'https://example.com/?a=1&b=2', text: 'dwa mocno' },
      { href: 'c.md', text: 'trzy' }
    ])
  })

  it('czyta linki z HTML bez skryptów', () => {
    const source = `<a class="x" href='a.html'>A</a><script>const s = '<a href="b.html">B</a>'</script>`

    expect(extractLinks('html', source)).toEqual([{ href: 'a.html', text: 'A' }])
  })
})

describe('LinkGraph', () => {
  let root: string
  let snapshot: LibrarySnapshot
  let graph: LinkGraph
  const docs = new Map<string, DocEntry>()

  const entry = async (id: string, relPath: string, title: string, otherPaths: string[] = []): Promise<DocEntry> => {
    const path = join(root, relPath)
    const { mtimeMs, size } = await stat(path)
    const doc = {
      id,
      path,
      name: relPath.split('/').at(-1),
      format: relPath.endsWith('.md') ? 'markdown' : 'html',
      relPath,
      title,
      mtimeMs,
      size,
      projectName: 'projekt',
      otherPaths,
      missing: false
    } as DocEntry
    docs.set(id, doc)
    return doc
  }

  const doc = (id: string): DocEntry => docs.get(id) as DocEntry
  const thumb = (docId: string): Promise<string | null> => Promise.resolve(docId === 'cel' ? 'data:image/jpeg;base64,AA' : null)

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'links-'))
    await mkdir(join(root, 'docs'), { recursive: true })
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(
      join(root, 'docs', 'plan.md'),
      [
        '# Plan',
        '',
        '[cel](cel.md#sekcja) i znów [cel](./cel.md) oraz [sam siebie](plan.md) i [kotwica](#plan)',
        '[strona](../strona.html) [readme](../README.md) [kod](../src/a.ts:42) [katalog](../src/)',
        '[brak](nie-ma.md) [sieć](https://example.com/x)'
      ].join('\n')
    )
    await writeFile(join(root, 'docs', 'cel.md'), '# Cel\n\nPierwszy akapit celu z *ważną* treścią.\n\n## Sekcja\n')
    await writeFile(join(root, 'strona.html'), '<title>Strona</title><p>Treść</p><a href="docs/plan.md">plan</a>')
    await writeFile(join(root, 'README.md'), '# Opis repozytorium\n\nKrótki wstęp.\n')
    await writeFile(join(root, 'src', 'a.ts'), 'export {}\n')
    await writeFile(join(root, 'kopia.md'), '[cel z kopii](docs/cel.md)\n')
    await writeFile(join(root, 'wiki.md'), '[[cel#Sekcja dalej]] i [[plan|inny tekst]] oraz [[#Tu]] i [[wiki]]\n')
    await writeFile(join(root, 'docs', 'moc.md'), '# Blisko\n')
    await writeFile(join(root, 'moc.md'), '# Daleko\n')
    await mkdir(join(root, 'zasoby'), { recursive: true })
    await writeFile(join(root, 'zasoby', 'obraz.png'), '')
    await mkdir(join(root, 'sejf', '.obsidian'), { recursive: true })
    await mkdir(join(root, 'sejf', 'notatki'), { recursive: true })
    await writeFile(join(root, 'sejf', 'notatki', 'wpis.md'), '[[cel]]\n')
    await writeFile(join(root, 'sejf', 'wewnatrz.md'), '# Wewnątrz\n')

    const all = [
      await entry('plan', 'docs/plan.md', 'Plan'),
      await entry('cel', 'docs/cel.md', 'Cel', [join(root, 'stary-cel.md')]),
      await entry('strona', 'strona.html', 'Strona'),
      await entry('wiki', 'wiki.md', 'Wiki'),
      await entry('sejf', 'sejf/notatki/wpis.md', 'Wpis')
    ]
    snapshot = {
      projects: [{ docs: all }],
      review: [await entry('kopia', 'kopia.md', 'Kopia')]
    } as unknown as LibrarySnapshot
    graph = new LinkGraph(() => snapshot)
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('rozróżnia dokumenty, pliki, sieć i martwe linki', async () => {
    const kinds = async (href: string): Promise<[string | undefined, string | null | undefined]> => {
      const link = await graph.resolve(doc('plan'), href)
      return [link?.kind, link?.docId]
    }

    expect(await kinds('cel.md')).toEqual(['doc', 'cel'])
    expect(await kinds('../strona.html')).toEqual(['doc', 'strona'])
    expect(await kinds('../README.md')).toEqual(['file', null])
    expect(await kinds('../src/a.ts:42')).toEqual(['file', null])
    expect(await kinds('../src/')).toEqual(['file', null])
    expect(await kinds('nie-ma.md')).toEqual(['missing', null])
    expect(await kinds('https://example.com')).toEqual(['external', null])
    expect(await graph.resolve(doc('plan'), '#plan')).toBeNull()
  })

  it('znajduje dokument także pod jego drugą ścieżką', async () => {
    const link = await graph.resolve(doc('plan'), '../stary-cel.md')

    expect(link?.docId).toBe('cel')
  })

  it('zgłasza linki wychodzące bez powtórek, siebie i kotwic', async () => {
    const { outgoing } = await graph.links(doc('plan'))

    expect(outgoing.map(({ text, kind }) => [text, kind])).toEqual([
      ['cel', 'doc'],
      ['strona', 'doc'],
      ['readme', 'file'],
      ['kod', 'file'],
      ['katalog', 'file'],
      ['brak', 'missing'],
      ['sieć', 'external']
    ])
  })

  it('zbiera linki przychodzące z Markdownu i HTML', async () => {
    expect((await graph.links(doc('cel'))).incoming.sort()).toEqual(['kopia', 'plan', 'wiki'])
    expect((await graph.links(doc('plan'))).incoming.sort()).toEqual(['strona', 'wiki'])
    expect((await graph.links(doc('kopia'))).incoming).toEqual([])
  })

  it('widzi zmiany dopiero w nowej migawce i czyta tylko zmienione pliki', async () => {
    const path = join(root, 'kopia.md')
    await writeFile(path, 'bez linków, ale dłuższy tekst\n')
    expect((await graph.links(doc('cel'))).incoming.sort()).toEqual(['kopia', 'plan', 'wiki'])

    const { mtimeMs, size } = await stat(path)
    docs.set('kopia', { ...doc('kopia'), mtimeMs, size })
    snapshot = { ...snapshot, review: [doc('kopia')] }

    expect((await graph.links(doc('cel'))).incoming.sort()).toEqual(['plan', 'wiki'])
  })

  it('składa kartę dokumentu z biblioteki', async () => {
    const preview = await graph.preview(doc('plan'), 'cel.md#sekcja', thumb)

    expect(preview).toMatchObject({
      title: 'Cel',
      project: 'projekt',
      path: 'docs/cel.md',
      excerpt: 'Pierwszy akapit celu z ważną treścią.',
      thumb: 'data:image/jpeg;base64,AA'
    })
  })

  it('składa kartę dokumentu spoza biblioteki', async () => {
    const preview = await graph.preview(doc('plan'), '../README.md', thumb)

    expect(preview).toMatchObject({
      title: 'Opis repozytorium',
      project: null,
      path: '../README.md',
      excerpt: 'Krótki wstęp.',
      thumb: null
    })
  })

  it('rozwiązuje link Obsidiana po nazwie, także spoza biblioteki i bez ścieżki', async () => {
    const wiki = async (name: string): Promise<string | null | undefined> => (await graph.resolve(doc('plan'), `wiki:${name}`))?.path

    expect((await graph.resolve(doc('plan'), 'wiki:cel'))?.docId).toBe('cel')
    expect((await graph.resolve(doc('plan'), 'wiki:CEL'))?.docId).toBe('cel')
    expect((await graph.resolve(doc('plan'), 'wiki:cel.md'))?.docId).toBe('cel')
    expect(await wiki('readme')).toBe(join(root, 'README.md'))
    expect(await wiki('obraz.png')).toBe(join(root, 'zasoby', 'obraz.png'))
    expect(await wiki('src/a.ts')).toBe(join(root, 'src', 'a.ts'))
  })

  it('przelicza nagłówek na identyfikator, a odnośnika do bloku nie przewija', async () => {
    expect((await graph.resolve(doc('plan'), 'wiki:cel#Żółta Gęś!'))?.fragment).toBe('żółta-gęś')
    expect((await graph.resolve(doc('plan'), 'wiki:cel%23Sekcja%20dalej'))?.fragment).toBe('sekcja-dalej')
    expect((await graph.resolve(doc('plan'), 'wiki:cel#^blok-1'))?.fragment).toBe('')
  })

  it('przy powtórzonej nazwie wybiera plik najbliżej dokumentu', async () => {
    const near = await graph.resolve(doc('plan'), 'wiki:moc')
    const far = await graph.resolve(doc('kopia'), 'wiki:moc')

    expect(near?.path).toBe(join(root, 'docs', 'moc.md'))
    expect(far?.path).toBe(join(root, 'moc.md'))
  })

  it('zgłasza brakującą notatkę i nie wychodzi na inną maszynę', async () => {
    expect((await graph.resolve(doc('plan'), 'wiki:nie-ma-takiej'))?.kind).toBe('missing')
    for (const name of ['//host/udzial/a', '///host/udzial/a', '\\\\\\host\\udzial\\a']) {
      expect((await graph.resolve(doc('plan'), `wiki:${name}`))?.path ?? '').not.toMatch(/^[\\/]{2}/)
    }
  })

  it('liczy link Obsidiana jako link przychodzący', async () => {
    const { outgoing, incoming } = await graph.links(doc('wiki'))

    expect(outgoing.map(({ text, kind }) => [text, kind])).toEqual([['cel › Sekcja dalej', 'doc'], ['inny tekst', 'doc']])
    expect(incoming).toEqual([])
    expect((await graph.links(doc('cel'))).incoming).toContain('wiki')
  })

  it('nie wychodzi poza sejf Obsidiana', async () => {
    expect((await graph.resolve(doc('sejf'), 'wiki:cel'))?.kind).toBe('missing')
    expect((await graph.resolve(doc('sejf'), 'wiki:wewnatrz'))?.kind).toBe('file')
  })

  it('nie składa karty dla kodu, siebie, sieci i martwych linków', async () => {
    for (const href of ['../src/a.ts', 'plan.md', 'https://example.com', 'nie-ma.md']) {
      expect(await graph.preview(doc('plan'), href, thumb)).toBeNull()
    }
  })
})
