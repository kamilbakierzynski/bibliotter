import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LinkGraph, planHrefOf } from '../src/main/docLinks'
import type { DocEntry, LibrarySnapshot } from '../src/shared/types'

describe('planHrefOf', () => {
  it('czyta plan z meta w nagłówku strony, w dowolnym zapisie atrybutów', () => {
    expect(planHrefOf('<head><meta name="bibliotter-plan" content="plan-a.md"></head>')).toBe('plan-a.md')
    expect(planHrefOf("<meta content='../docs/plan%20b.md#x' NAME='Bibliotter-Plan'>")).toBe('../docs/plan%20b.md#x')
    expect(planHrefOf('<meta name=bibliotter-plan content=plan.md>')).toBe('plan.md')
    expect(planHrefOf('<meta name="bibliotter-plan" content="a&amp;b.md">')).toBe('a&b.md')
  })

  it('pomija inne meta, puste wskazanie i meta w treści strony', () => {
    expect(planHrefOf('<meta name="bibliotter-kind" content="plan"><meta data-name="bibliotter-plan" content="x.md">')).toBeNull()
    expect(planHrefOf('<meta name="bibliotter-plan" content="  ">')).toBeNull()
    expect(planHrefOf('<body><p>Przykład</p><meta name="bibliotter-plan" content="x.md"></body>')).toBeNull()
  })
})

describe('LinkGraph.pair', () => {
  let root: string
  let snapshot: LibrarySnapshot
  let graph: LinkGraph
  const docs = new Map<string, DocEntry>()

  const page = (plan: string | null, title: string): string =>
    `<!doctype html><html><head><meta charset="utf-8">${plan === null ? '' : `<meta name="bibliotter-plan" content="${plan}">`}<title>${title}</title></head><body><p>${title}</p></body></html>`

  const entry = async (id: string, relPath: string): Promise<DocEntry> => {
    const path = join(root, relPath)
    const { mtimeMs, size } = await stat(path)
    const doc = {
      id,
      path,
      name: relPath.split('/').at(-1),
      format: relPath.endsWith('.md') ? 'markdown' : 'html',
      relPath,
      title: id,
      mtimeMs,
      size,
      projectName: 'projekt',
      otherPaths: [] as string[],
      missing: false
    } as DocEntry
    docs.set(id, doc)
    return doc
  }

  const doc = (id: string): DocEntry => docs.get(id) as DocEntry
  const at = async (relPath: string, seconds: number): Promise<void> => {
    const time = new Date(Date.UTC(2026, 10, 7, 12, 0, seconds))
    await utimes(join(root, relPath), time, time)
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'pair-'))
    await mkdir(join(root, 'docs'), { recursive: true })
    await mkdir(join(root, 'explain', 'main'), { recursive: true })
    await writeFile(join(root, 'docs', 'plan.md'), '# Plan\n\n## Krok 1\n')
    await writeFile(join(root, 'docs', 'samotny.md'), '# Bez objaśnienia\n')
    // Objaśnienie z kitu leży gdzie indziej niż plan i wskazuje go ścieżką względną.
    await writeFile(join(root, 'explain', 'main', 'plan-stare.html'), page('../../docs/plan.md', 'Stare'))
    await writeFile(join(root, 'explain', 'main', 'plan-nowe.html'), page('../../docs/plan.md', 'Nowe'))
    await writeFile(join(root, 'explain', 'main', 'plan-kopia.html'), page('plan-kopia.md', 'Z kopią'))
    await writeFile(join(root, 'explain', 'main', 'plan-kopia.md'), '> Kopia planu\n\n# Plan z kopią\n')
    await writeFile(join(root, 'explain', 'main', 'obcy.html'), page('../../spoza.md', 'Obcy'))
    await writeFile(join(root, 'spoza.md'), '# Poza biblioteką\n')
    await writeFile(join(root, 'zwykla.html'), page(null, 'Zwykła'))
    await at('explain/main/plan-stare.html', 1)
    await at('explain/main/plan-nowe.html', 2)

    snapshot = {
      projects: [
        {
          docs: [
            await entry('plan', 'docs/plan.md'),
            await entry('samotny', 'docs/samotny.md'),
            await entry('stare', 'explain/main/plan-stare.html'),
            await entry('nowe', 'explain/main/plan-nowe.html'),
            await entry('kopia', 'explain/main/plan-kopia.html'),
            await entry('kopia-md', 'explain/main/plan-kopia.md'),
            await entry('obcy', 'explain/main/obcy.html'),
            await entry('zwykla', 'zwykla.html')
          ]
        }
      ],
      review: []
    } as unknown as LibrarySnapshot
    graph = new LinkGraph(() => snapshot)
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('prowadzi z objaśnienia do planu, także do kopii obok', async () => {
    expect(await graph.pair(doc('stare'))).toEqual({ docId: 'plan', role: 'plan' })
    expect(await graph.pair(doc('kopia'))).toEqual({ docId: 'kopia-md', role: 'plan' })
  })

  it('prowadzi z planu do najnowszego objaśnienia', async () => {
    expect(await graph.pair(doc('plan'))).toEqual({ docId: 'nowe', role: 'explanation' })
    expect(await graph.pair(doc('kopia-md'))).toEqual({ docId: 'kopia', role: 'explanation' })
  })

  it('nie łączy dokumentów bez pary ani z plikiem spoza biblioteki', async () => {
    expect(await graph.pair(doc('samotny'))).toBeNull()
    expect(await graph.pair(doc('zwykla'))).toBeNull()
    expect(await graph.pair(doc('obcy'))).toBeNull()
  })

  it('widzi objaśnienie dodane w nowej migawce', async () => {
    await writeFile(join(root, 'docs', 'opis.html'), page('samotny.md', 'Opis'))
    const project = snapshot.projects[0] as { docs: DocEntry[] }
    snapshot = { ...snapshot, projects: [{ ...project, docs: [...project.docs, await entry('opis', 'docs/opis.html')] }] } as LibrarySnapshot

    expect(await graph.pair(doc('samotny'))).toEqual({ docId: 'opis', role: 'explanation' })
  })
})
