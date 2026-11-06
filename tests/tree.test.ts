import { describe, expect, it } from 'vitest'
import {
  BIG_FOLDER,
  blockedLabel,
  buildLibrary,
  buildTree,
  displayName,
  flattenLibrary,
  inboxDocs,
  type LibraryRow,
  ROW_H,
  type TreeNode
} from '../src/renderer/src/tree'
import type { DocEntry, ProjectGroup } from '../src/shared/types'

function doc(relPath: string, overrides: Partial<DocEntry> = {}): DocEntry {
  return {
    id: relPath,
    path: `/repo/${relPath}`,
    name: relPath.split('/').at(-1) ?? relPath,
    format: 'html',
    relPath,
    title: null,
    mtimeMs: 1,
    size: 1,
    projectName: 'repo',
    classification: 'document',
    reason: '',
    status: 'read',
    branch: null,
    commit: null,
    missing: false,
    otherPaths: [],
    sha: null,
    ...overrides
  }
}

function project(docs: DocEntry[]): ProjectGroup {
  return {
    id: 'p',
    name: 'repo',
    path: '/repo',
    isRepo: true,
    defaultBranch: 'main',
    docs,
    pullRequests: {}
  }
}

const shape = (nodes: TreeNode[]): unknown[] =>
  nodes.map((node) => (node.kind === 'doc' ? node.doc.relPath : { [node.name]: shape(node.children) }))

describe('buildTree', () => {
  it('usuwa folder z jednym dokumentem', () => {
    expect(shape(buildTree(project([doc('a/b/c/plan.html')])))).toEqual(['a/b/c/plan.html'])
  })

  it('scala łańcuch pojedynczych folderów', () => {
    const docs = [doc('output/raporty/a.html'), doc('output/raporty/b.html')]

    expect(shape(buildTree(project(docs)))).toEqual([
      { 'output/raporty': ['output/raporty/a.html', 'output/raporty/b.html'] }
    ])
  })

  it('stawia branche przed domyślnym i zostawia je przy jednym dokumencie', () => {
    const docs = [doc('z.html', { branch: 'main' }), doc('a.html', { branch: 'feature/x' })]

    expect(shape(buildTree(project(docs)))).toEqual([{ 'feature/x': ['a.html'] }, 'z.html'])
  })

  it('dokument bez brancha trafia do korzenia', () => {
    expect(shape(buildTree(project([doc('a.html')])))).toEqual(['a.html'])
  })

  it('dokumenty o tej samej ścieżce na dwóch branchach nie mieszają się', () => {
    const docs = [
      doc('sub/a.html', { id: '1', branch: 'x' }),
      doc('sub/b.html', { id: '2', branch: 'x' }),
      doc('sub/a.html', { id: '3', branch: 'y' }),
      doc('sub/b.html', { id: '4', branch: 'y' })
    ]

    const [first, second] = buildTree(project(docs))

    expect(first?.kind === 'folder' && first.children).toHaveLength(1)
    expect(second?.kind === 'folder' && second.children).toHaveLength(1)
  })
})

const noTone = (): 'none' => 'none'
const recent = { sort: 'recent', toneOf: noTone } as const
const allOpen = (): boolean => false
const useDefaults = (_key: string, byDefault: boolean): boolean => byDefault
const none = new Set<string>()
const labels = (rows: LibraryRow[]): string[] =>
  rows.map((row) =>
    row.type === 'doc' ? row.doc.relPath : row.type === 'folder' ? `[${row.node.name}]` : `<${row.model.project.name}>`
  )

describe('sortowanie drzewa', () => {
  it('stawia ostatnio zmienione wyżej, a folder liczy po najnowszym pliku', () => {
    const docs = [
      doc('stary/a.html', { mtimeMs: 1 }),
      doc('stary/b.html', { mtimeMs: 2 }),
      doc('nowy/a.html', { mtimeMs: 3 }),
      doc('nowy/b.html', { mtimeMs: 9 }),
      doc('z.html', { mtimeMs: 5 }),
      doc('a.html', { mtimeMs: 4 })
    ]

    expect(shape(buildTree(project(docs), { sort: 'recent' }))).toEqual([
      { nowy: ['nowy/b.html', 'nowy/a.html'] },
      { stary: ['stary/b.html', 'stary/a.html'] },
      'z.html',
      'a.html'
    ])
  })

  it('zachowuje porządek nazw z numerami', () => {
    const docs = [doc('plan-10.html'), doc('plan-2.html')]

    expect(shape(buildTree(project(docs), { sort: 'name' }))).toEqual(['plan-2.html', 'plan-10.html'])
  })

  it('zlicza poddrzewo i podnosi najmocniejszy sygnał', () => {
    const docs = [
      doc('a/b/x.html', { status: 'to-read' }),
      doc('a/b/y.html', { status: 'to-decide' }),
      doc('a/z.html', { mtimeMs: 7 })
    ]
    const toneOf = (item: DocEntry) => (item.status === 'to-decide' ? 'decide' : item.status === 'to-read' ? 'read' : 'none') as 'decide' | 'read' | 'none'

    const [folder] = buildTree(project(docs), { toneOf })

    expect(folder).toMatchObject({ kind: 'folder', name: 'a', count: 3, latest: 7, tone: 'decide' })
  })
})

describe('buildLibrary', () => {
  it('odkłada archiwum na koniec projektu i zwija je', () => {
    const docs = [doc('nowy.html', { mtimeMs: 2 }), doc('stary.html', { id: 's', status: 'archived' })]

    const library = buildLibrary([project(docs)], recent)
    const { rows } = flattenLibrary(library, useDefaults, none)

    expect(labels(rows)).toEqual(['<repo>', 'nowy.html', '[Archiwum]'])
    expect(library.chains.get('s')).toEqual(['p', 'p#:archive'])
  })

  it('projekt z samym archiwum jest zwinięty, ale nie potrzebuje grupy', () => {
    const docs = [doc('a.html', { status: 'archived' })]

    const library = buildLibrary([project(docs)], recent)

    expect(labels(flattenLibrary(library, useDefaults, none).rows)).toEqual(['<repo>'])
    expect(labels(flattenLibrary(library, allOpen, none).rows)).toEqual(['<repo>', 'a.html'])
  })

  it('stawia projekty z bieżącą pracą przed samym archiwum', () => {
    const fresh = { ...project([doc('a.html', { id: 'a', mtimeMs: 1 })]), id: 'nowy', name: 'nowy' }
    const stale = { ...project([doc('b.html', { id: 'b', mtimeMs: 9, status: 'archived' })]), id: 'stary', name: 'stary' }

    const { projects } = buildLibrary([stale, fresh], recent)

    expect(projects.map((item) => item.project.name)).toEqual(['nowy', 'stary'])
  })

  it('zwija duży folder, ale zostawia mały', () => {
    const big = Array.from({ length: BIG_FOLDER + 1 }, (_, i) => doc(`duzy/${i}.html`))
    const small = [doc('maly/a.html'), doc('maly/b.html')]

    const { rows } = flattenLibrary(buildLibrary([project([...big, ...small])], recent), useDefaults, none)

    expect(labels(rows)).toEqual(['<repo>', '[duzy]', '[maly]', 'maly/a.html', 'maly/b.html'])
  })
})

describe('flattenLibrary', () => {
  const docs = [doc('a/x.html', { mtimeMs: 3 }), doc('a/y.html', { mtimeMs: 2 }), doc('z.html', { mtimeMs: 1 })]

  it('układa wiersze jeden pod drugim i liczy wysokość', () => {
    const { rows, height } = flattenLibrary(buildLibrary([project(docs)], recent), allOpen, none)

    expect(rows.map((row) => row.y)).toEqual([0, 1, 2, 3, 4].map((line) => line * ROW_H))
    expect(height).toBe(5 * ROW_H)
  })

  it('odtwarza wcięcia i linie drzewa', () => {
    const { rows } = flattenLibrary(buildLibrary([project(docs)], recent), allOpen, none)
    const [, folder, first, second, loose] = rows

    expect(folder).toMatchObject({ indent: 8, elbow: null, guides: [] })
    expect(first).toMatchObject({ indent: 38, elbow: 23, guides: [23] })
    expect(second).toMatchObject({ indent: 38, elbow: 23, guides: [] })
    expect(loose).toMatchObject({ indent: 23, elbow: 8, guides: [] })
  })

  it('zwinięty folder nie zajmuje miejsca', () => {
    const library = buildLibrary([project(docs)], recent)
    const folderKey = 'p/a'

    const { rows, height } = flattenLibrary(library, (key) => key === folderKey, none)

    expect(labels(rows)).toEqual(['<repo>', '[a]', 'z.html'])
    expect(height).toBe(3 * ROW_H)
  })

  it('wiersze zwijanego folderu znikają pod rodzicem, nie zajmując miejsca', () => {
    const library = buildLibrary([project(docs)], recent)
    const folderKey = 'p/a'

    const { rows, height } = flattenLibrary(library, (key) => key === folderKey, new Set([folderKey]))
    const ghosts = rows.filter((row) => row.ghost)

    expect(ghosts.map((row) => row.y)).toEqual([ROW_H, ROW_H])
    expect(rows.at(-1)).toMatchObject({ y: 2 * ROW_H, ghost: false })
    expect(height).toBe(3 * ROW_H)
  })

  it('ogranicza liczbę duchów przy dużym folderze', () => {
    const many = Array.from({ length: 500 }, (_, i) => doc(`duzy/${i}.html`))
    const library = buildLibrary([project(many)], recent)
    const folderKey = 'p/duzy'

    const { rows } = flattenLibrary(library, (key) => key === folderKey, new Set([folderKey]))

    expect(rows.length).toBeLessThan(50)
  })

  it('wiersze zawsze idą w kolejności `y`, od czego zależy okno listy', () => {
    const library = buildLibrary([project(docs)], recent)
    const { rows } = flattenLibrary(library, (key) => key === 'p/a', new Set(['p/a']))

    expect(rows.map((row) => row.y)).toEqual(rows.map((row) => row.y).sort((a, b) => a - b))
  })
})

describe('displayName', () => {
  it('woli tytuł od nazwy pliku', () => {
    expect(displayName(doc('a.html', { title: 'Plan prac' }))).toBe('Plan prac')
  })

  it('dla index bez tytułu pokazuje nazwę folderu', () => {
    expect(displayName(doc('raport-2026/index.html'))).toBe('raport-2026')
    expect(displayName(doc('notatki.htm'))).toBe('notatki')
  })
})

describe('inboxDocs', () => {
  it('pokazuje dokumenty czekające na Ciebie, od najnowszych', () => {
    const docs = [
      doc('stary.html', { status: 'to-read', mtimeMs: 1 }),
      doc('nowy.html', { status: 'to-decide', mtimeMs: 2 }),
      doc('gotowy.html', { status: 'decided', mtimeMs: 3 })
    ]

    expect(inboxDocs([project(docs)]).map((item) => item.name)).toEqual(['nowy.html', 'stary.html'])
  })
})

describe('blockedLabel', () => {
  it('odmienia liczebnik po polsku', () => {
    expect(blockedLabel(1)).toBe('Zablokowano 1 żądanie')
    expect(blockedLabel(3)).toBe('Zablokowano 3 żądania')
    expect(blockedLabel(5)).toBe('Zablokowano 5 żądań')
    expect(blockedLabel(12)).toBe('Zablokowano 12 żądań')
    expect(blockedLabel(22)).toBe('Zablokowano 22 żądania')
  })
})
