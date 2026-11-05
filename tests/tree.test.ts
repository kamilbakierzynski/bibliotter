import { describe, expect, it } from 'vitest'
import { blockedLabel, buildTree, displayName, inboxDocs, type TreeNode } from '../src/renderer/src/tree'
import type { DocEntry, ProjectGroup } from '../src/shared/types'

function doc(relPath: string, overrides: Partial<DocEntry> = {}): DocEntry {
  return {
    id: relPath,
    path: `/repo/${relPath}`,
    name: relPath.split('/').at(-1) ?? relPath,
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
