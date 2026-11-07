import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentApi } from '../src/main/agentApi'
import { runCli } from '../src/main/agentCli'
import { parseConfig } from '../src/main/config'
import { commandRunner, type GitRunner } from '../src/main/git'
import { Library } from '../src/main/library'
import { handleLine } from '../src/main/mcpServer'
import { walkRoots } from '../src/main/scanner'
import { buildLibrary, buildTree, displayName, flattenLibrary, type FolderNode, lastSegment, projectFolders } from '../src/renderer/src/tree'
import type { DocEntry, LibrarySnapshot, ProjectGroup } from '../src/shared/types'

const git = commandRunner('git')
const noGh: GitRunner = async () => {
  throw Object.assign(new Error('brak gh'), { code: 'ENOENT' })
}

const prose = 'Zdanie opisujące decyzję w dokumencie o łamigłówkach. '.repeat(30)
const docHtml = (title: string): string => `<title>${title}</title><style>h1{}</style><h1>A</h1><h2>B</h2><h2>C</h2><p>${prose}${title}</p>`

let workspace: string
let root: string
let library: Library
let hidden: string[]
let names: Record<string, string>

async function put(path: string, content: string): Promise<string> {
  const target = join(root, path)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content)
  return target
}

const allDocs = (snapshot: LibrarySnapshot): DocEntry[] => snapshot.projects.flatMap((project) => project.docs)
const docNames = (snapshot: LibrarySnapshot): string[] => allDocs(snapshot).map((doc) => doc.name).sort()

function findDoc(snapshot: LibrarySnapshot, name: string): DocEntry {
  const doc = allDocs(snapshot).find((candidate) => candidate.name === name)
  if (!doc) throw new Error(`Brak dokumentu ${name}`)
  return doc
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'folders-'))
  root = join(workspace, 'projekty')
  await mkdir(root)
  hidden = []
  names = {}
  library = await Library.open({
    dataDir: join(workspace, 'home'),
    git,
    gh: noGh,
    getConfig: () => ({ roots: [root], folderLinks: [], hiddenFolders: hidden, folderNames: names }),
    onChange: () => {}
  })
})

afterEach(async () => {
  library.close()
  await rm(workspace, { recursive: true, force: true })
})

describe('konfiguracja folderów', () => {
  it('starsza konfiguracja dostaje puste listy', () => {
    expect(parseConfig('{"roots":["C:/a"]}')).toMatchObject({ hiddenFolders: [], folderNames: {} })
  })

  it('odrzuca nazwy, które nie są tekstem', () => {
    const config = parseConfig('{"hiddenFolders":["C:/a"],"folderNames":{"C:/a":"Raporty","C:/b":7}}')
    expect(config.hiddenFolders).toEqual(['C:/a'])
    expect(config.folderNames).toEqual({ 'C:/a': 'Raporty' })
  })
})

describe('ukryte foldery', () => {
  it('skan nie wchodzi do ukrytego folderu ani jego podfolderów', async () => {
    await put('widoczny/a.html', docHtml('A'))
    await put('ukryty/b.html', docHtml('B'))
    await put('ukryty/gleboko/c.html', docHtml('C'))
    const { files } = await walkRoots([root], [join(root, 'ukryty')])
    expect(files.map((file) => file.name)).toEqual(['a.html'])
  })

  it('wybrany folder leżący w ukrytym też jest pomijany', async () => {
    await put('ukryty/pod/a.html', docHtml('A'))
    const result = await walkRoots([join(root, 'ukryty', 'pod')], [join(root, 'ukryty')])
    expect(result.files).toEqual([])
    expect(result.unavailableRoots).toEqual([])
  })

  it('dokumenty znikają z biblioteki i z wyszukiwania, a nie zostają jako kopie', async () => {
    await put('widoczny/a.html', docHtml('Widoczny'))
    await put('ukryty/b.html', docHtml('Ukryty'))
    expect(docNames(await library.scan())).toEqual(['a.html', 'b.html'])

    hidden = [join(root, 'ukryty')]
    const snapshot = await library.scan()
    expect(docNames(snapshot)).toEqual(['a.html'])
    expect(snapshot.hiddenFolders).toEqual(hidden)
    expect(await library.search('Ukryty')).toEqual([])
  })

  it('po przywróceniu dokument wraca ze statusem i identyfikatorem', async () => {
    await put('ukryty/b.html', docHtml('Ukryty'))
    const first = findDoc(await library.scan(), 'b.html')
    await library.setStatus(first.id, 'to-decide')

    hidden = [join(root, 'ukryty')]
    await library.scan()
    hidden = []
    const back = findDoc(await library.scan(), 'b.html')
    expect(back.id).toBe(first.id)
    expect(back.status).toBe('to-decide')
  })

  it('kopia poza ukrytym folderem nie przejmuje historii ukrytego dokumentu', async () => {
    const content = docHtml('Kopia')
    await put('ukryty/b.html', content)
    const first = findDoc(await library.scan(), 'b.html')

    hidden = [join(root, 'ukryty')]
    await put('inny/b.html', content)
    const copy = findDoc(await library.scan(), 'b.html')
    expect(copy.path).toContain(`inny${sep}`)
    expect(copy.id).not.toBe(first.id)
  })

  it('usunięty plik w ukrytym folderze nie wraca jako kopia', async () => {
    const path = await put('ukryty/b.html', docHtml('Znika'))
    await library.scan()
    hidden = [join(root, 'ukryty')]
    await rm(path)
    expect(docNames(await library.scan())).toEqual([])
  })
})

describe('nazwy w apce', () => {
  it('nazwa dokumentu nie zmienia pliku i przetrwa zmianę treści', async () => {
    const path = await put('a.html', docHtml('Plan'))
    const doc = findDoc(await library.scan(), 'a.html')

    const renamed = findDoc(await library.renameDoc(doc.id, '  Mój plan  '), 'a.html')
    expect(renamed.alias).toBe('Mój plan')
    expect(displayName(renamed)).toBe('Mój plan')
    expect(await readdir(root)).toEqual(['a.html'])
    expect(await readFile(path, 'utf8')).toBe(docHtml('Plan'))

    await writeFile(path, docHtml('Nowa treść'))
    expect(findDoc(await library.scan(), 'a.html').alias).toBe('Mój plan')
  })

  it('pusta nazwa wraca do oryginalnej', async () => {
    await put('a.html', docHtml('Plan'))
    const doc = findDoc(await library.scan(), 'a.html')
    await library.renameDoc(doc.id, 'Mój plan')
    const restored = findDoc(await library.renameDoc(doc.id, '   '), 'a.html')
    expect(restored.alias).toBeNull()
    expect(displayName(restored)).toBe('Plan')
  })

  it('nazwa projektu trafia do projektu i jego dokumentów', async () => {
    await put('repo/.git/HEAD', 'ref: refs/heads/main')
    await put('repo/a.html', docHtml('A'))
    const before = (await library.scan()).projects[0] as ProjectGroup
    names = { [before.path]: 'Mój projekt' }
    const after = await library.scan()
    expect(after.projects[0]?.name).toBe('Mój projekt')
    expect(findDoc(after, 'a.html').projectName).toBe('Mój projekt')
    expect(after.folderNames).toEqual(names)
  })
})

function doc(path: string, relPath: string, overrides: Partial<DocEntry> = {}): DocEntry {
  return {
    id: path,
    path,
    name: lastSegment(path),
    format: 'html',
    relPath,
    title: null,
    alias: null,
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
    labels: [],
    ...overrides
  } as DocEntry
}

const project = (docs: DocEntry[]): ProjectGroup => ({
  id: 'p',
  name: 'repo',
  path: 'C:\\repo',
  isRepo: true,
  defaultBranch: 'main',
  docs,
  pullRequests: {}
})

const folders = (nodes: ReturnType<typeof buildTree>): FolderNode[] =>
  nodes.flatMap((node) => (node.kind === 'folder' ? [node, ...folders(node.children)] : []))

describe('foldery w drzewie', () => {
  it('wiersz zna swój folder na dysku, także po scaleniu łańcucha', () => {
    const tree = buildTree(
      project([doc('C:\\repo\\a\\b\\x.html', 'a/b/x.html'), doc('C:\\repo\\a\\b\\y.html', 'a/b/y.html')])
    )
    expect(folders(tree).map((node) => [node.name, node.paths])).toEqual([['a/b', ['C:\\repo\\a\\b']]])
  })

  it('jeden wiersz może zbierać foldery z kilku worktree', () => {
    const tree = buildTree(
      project([doc('C:\\repo\\docs\\x.html', 'docs/x.html'), doc('C:\\wt\\docs\\y.html', 'docs/y.html')])
    )
    expect(folders(tree)[0]?.paths).toEqual(['C:\\repo\\docs', 'C:\\wt\\docs'])
  })

  it('kopia spoza projektu nie udaje folderu nad projektem', () => {
    const tree = buildTree(
      project([
        doc('C:\\wt\\a\\x.html', '../wt/a/x.html', { missing: true }),
        doc('C:\\inny\\b\\y.html', '../inny/b/y.html', { missing: true })
      ])
    )
    const [parent] = folders(tree)
    expect(parent?.name).toBe('..')
    expect(parent?.paths).toEqual([])
  })

  it('nazwa z apki zastępuje też scalony łańcuch', () => {
    const docs = [doc('C:\\repo\\a\\b\\x.html', 'a/b/x.html'), doc('C:\\repo\\a\\b\\y.html', 'a/b/y.html')]
    const [folder] = folders(buildTree(project(docs), { names: { 'C:\\repo\\a\\b': 'Raporty' } }))
    expect(folder?.name).toBe('Raporty')
    expect(folder?.renamed).toBe(true)
  })

  it('projekt pokazuje foldery, z których pochodzą jego dokumenty', () => {
    expect(
      projectFolders(project([doc('C:\\repo\\docs\\x.html', 'docs/x.html'), doc('C:\\wt\\y.html', 'y.html')]))
    ).toEqual(['C:\\repo', 'C:\\wt'])
    expect(projectFolders(project([doc('C:\\repo\\x.html', 'x.html', { missing: true })]))).toEqual(['C:\\repo'])
  })

  it('ukrywany wiersz znika z listy razem z zawartością, bez czekania na skan', () => {
    const docs = [
      doc('C:\\repo\\a\\x.html', 'a/x.html'),
      doc('C:\\repo\\a\\y.html', 'a/y.html'),
      doc('C:\\repo\\z.html', 'z.html')
    ]
    const model = buildLibrary([project(docs)], { sort: 'name', toneOf: () => 'none' })
    const open = (): boolean => false
    const rows = (leaving: Set<string>): string[] => flattenLibrary(model, open, new Set(), leaving).rows.map((row) => row.key)
    expect(rows(new Set())).toEqual(['p', 'p/a', 'C:\\repo\\a\\x.html', 'C:\\repo\\a\\y.html', 'C:\\repo\\z.html'])
    expect(rows(new Set(['p/a']))).toEqual(['p', 'C:\\repo\\z.html'])
    expect(rows(new Set(['p']))).toEqual([])
  })
})

describe('agent i ukryte foldery', () => {
  let home: string
  let api: AgentApi

  const addDoc = async (id: string, folder: string, title: string): Promise<void> => {
    const directory = join(workspace, folder)
    const path = join(directory, `${id}.md`)
    await mkdir(directory, { recursive: true })
    await writeFile(path, `# ${title}\n\nTreść o migracji.\n`)
    await mkdir(join(home, 'library', id), { recursive: true })
    await writeFile(
      join(home, 'library', id, 'meta.json'),
      JSON.stringify({ id, path, title, firstSeenAt: '2026-11-06T10:00:00.000Z', status: 'to-read', sha: 'abc', mtimeMs: 1, projectPath: null, branch: null, commit: null, versions: [] })
    )
  }

  const hide = (...folders: string[]): Promise<void> =>
    writeFile(join(home, 'config.json'), JSON.stringify({ hiddenFolders: folders.map((folder) => join(workspace, folder)) }))

  const note = (docId: string, text: string) =>
    api.annotations.create(docId, 'abc', { kind: 'comment', audience: 'agent', color: null, anchor: null, text })

  const tool = async (name: string, args: unknown = {}): Promise<string> => {
    const reply = (await handleLine(
      api,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
    )) as { result: { content: { text: string }[] } }
    return reply.result.content.map((item) => item.text).join('\n')
  }

  beforeEach(async () => {
    home = join(workspace, 'agent-home')
    await mkdir(home, { recursive: true })
    api = new AgentApi(home)
    await addDoc('dwidoczny', 'widoczny', 'Plan widoczny')
    await addDoc('dukryty', 'ukryty/gleboko', 'Plan ukryty')
  })

  it('bez ukrytych folderów agent widzi wszystko', async () => {
    expect((await api.documents()).map((doc) => doc.id).sort()).toEqual(['dukryty', 'dwidoczny'])
  })

  it('lista i wyszukiwanie pomijają ukryty folder razem z podfolderami', async () => {
    await hide('ukryty')
    expect((await api.documents()).map((doc) => doc.id)).toEqual(['dwidoczny'])
    expect((await api.search('migracji')).map((hit) => hit.id)).toEqual(['dwidoczny'])
  })

  it('CLI i MCP dostają ten sam wynik', async () => {
    await hide('ukryty')
    expect(await runCli(['list'], api)).not.toContain('Plan ukryty')
    expect(await runCli(['search', 'migracji'], api)).not.toContain('Plan ukryty')
    const listed = await tool('list_documents')
    expect(listed).toContain('Plan widoczny')
    expect(listed).not.toContain('Plan ukryty')
    expect(await tool('search_documents', { query: 'migracji' })).not.toContain('Plan ukryty')
  })

  it('ukrytego dokumentu nie da się odczytać po identyfikatorze ani ścieżce', async () => {
    await hide('ukryty')
    await expect(api.readDocument('dukryty')).rejects.toThrow('No document')
    await expect(api.readDocument(join(workspace, 'ukryty', 'gleboko', 'dukryty.md'))).rejects.toThrow('No document')
  })

  it('etykiety dokumentów z ukrytego folderu nie liczą się w spisie', async () => {
    await api.changeLabels('dukryty', { add: ['Plan'] })
    await api.changeLabels('dwidoczny', { add: ['Pomysł'] })
    await hide('ukryty')
    expect((await api.labels()).map((label) => label.name)).toEqual(['Pomysł'])
  })

  it('uwagi z ukrytego folderu znikają, a uwaga spoza biblioteki zostaje', async () => {
    await note('dukryty', 'Ukryta prośba')
    await note('dwidoczny', 'Widoczna prośba')
    await note('dspoza', 'Prośba spoza biblioteki')
    await hide('ukryty')
    const texts = (await api.comments()).flatMap((item) => item.messages.map((message) => message.text)).sort()
    expect(texts).toEqual(['Prośba spoza biblioteki', 'Widoczna prośba'])
  })

  it('po przywróceniu folderu agent znów widzi dokument, bez ponownego uruchamiania', async () => {
    await hide('ukryty')
    expect(await api.documents()).toHaveLength(1)
    await hide()
    expect((await api.readDocument('dukryty')).title).toBe('Plan ukryty')
  })
})
