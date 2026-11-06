import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandRunner, type GitRunner } from '../src/main/git'
import { Library } from '../src/main/library'
import type { DocEntry, FolderLink, LibrarySnapshot } from '../src/shared/types'

const git = commandRunner('git')
const noGh: GitRunner = async () => {
  throw Object.assign(new Error('brak gh'), { code: 'ENOENT' })
}

const prose = 'Zdanie opisujące decyzję w dokumencie o łamigłówkach. '.repeat(30)
const docHtml = (title: string, extra = ''): string =>
  `<title>${title}</title><style>h1{}</style><h1>A</h1><h2>B</h2><h2>C</h2><p>${prose}${extra}</p>`

let workspace: string
let root: string
let home: string
let library: Library
let links: FolderLink[]
let changes: LibrarySnapshot[]
let gh: GitRunner

async function put(path: string, content: string): Promise<string> {
  const target = join(root, path)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content)
  return target
}

async function openLibrary(): Promise<Library> {
  return Library.open({
    dataDir: home,
    git,
    gh,
    getConfig: () => ({ roots: [root], folderLinks: links }),
    onChange: (snapshot) => changes.push(snapshot)
  })
}

const allDocs = (snapshot: LibrarySnapshot): DocEntry[] => snapshot.projects.flatMap((project) => project.docs)

function findDoc(snapshot: LibrarySnapshot, name: string): DocEntry {
  const doc = allDocs(snapshot).find((candidate) => candidate.name === name)
  if (!doc) throw new Error(`Brak dokumentu ${name}`)
  return doc
}

async function initRepo(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await git(['init', '-b', 'main'], path)
  await git(['config', 'user.email', 'test@example.com'], path)
  await git(['config', 'user.name', 'Test'], path)
  await writeFile(join(path, 'kod.txt'), 'x')
  await git(['add', '.'], path)
  await git(['commit', '-m', 'start'], path)
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'library-'))
  root = join(workspace, 'projekty')
  home = join(workspace, 'home')
  await mkdir(root)
  links = []
  changes = []
  gh = noGh
  library = await openLibrary()
})

afterEach(async () => {
  library.close()
  await rm(workspace, { recursive: true, force: true })
})

describe('klasyfikacja i kopie', () => {
  it('rozdziela dokumenty, niepewne i pomijane', async () => {
    await put('plan.html', docHtml('Plan'))
    await put('prawie.html', `<style>p{}</style><p>${prose}</p>`)
    await put('aplikacja/index.html', '<div id="root"></div>')

    const snapshot = await library.scan()

    expect(allDocs(snapshot).map((doc) => doc.name)).toEqual(['plan.html'])
    expect(snapshot.review.map((doc) => doc.name)).toEqual(['prawie.html'])
    expect(snapshot.ignoredCount).toBe(1)
  })

  it('zbiera Markdown obok HTML i zachowuje jego kopię z własnym rozszerzeniem', async () => {
    const path = await put('plan.md', `# Plan Markdown

## A

${prose}

## B
`)
    await put('raport.html', docHtml('Raport'))
    await put('README.md', `# Repo

## A

${prose}

## B
`)

    const first = await library.scan()
    const doc = findDoc(first, 'plan.md')

    expect(doc).toMatchObject({ format: 'markdown', title: 'Plan Markdown', classification: 'document' })
    expect(findDoc(first, 'raport.html').format).toBe('html')
    expect(first.ignoredCount).toBe(1)
    expect((await library.search('łamigłówkach')).map((hit) => hit.doc.name).sort()).toEqual(['plan.md', 'raport.html'])

    await rm(path)
    const second = await library.scan()

    expect(findDoc(second, 'plan.md')).toMatchObject({ format: 'markdown', missing: true })
    expect(library.getServedPath(doc.id)).toMatch(/.md$/)
  })

  it('skan bez zmian nikogo nie budzi', async () => {
    await put('plan.html', docHtml('Plan'))
    await library.scan()
    const before = changes.length

    await library.scan()

    expect(changes).toHaveLength(before)
  })

  it('czyta każde repozytorium tylko raz, nawet gdy pliki pytają równolegle', async () => {
    await initRepo(join(root, 'repo'))
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) await put(`repo/${name}.html`, docHtml(name))
    library.close()
    const started: string[] = []
    const realGit = git
    library = await Library.open({
      dataDir: home,
      git: (args, cwd) => {
        started.push(args.join(' '))
        return realGit(args, cwd)
      },
      gh,
      getConfig: () => ({ roots: [root], folderLinks: links }),
      onChange: () => {}
    })

    await library.scan()

    expect(started.filter((command) => command.startsWith('rev-parse --show-toplevel'))).toHaveLength(1)
  })

  it('wyszukiwanie widzi tylko bieżącą wersję zmienionego dokumentu', async () => {
    const path = await put('plan.html', docHtml('Plan', ' pierwszawersja'))
    await library.scan()

    await writeFile(path, docHtml('Plan', ' drugawersja'))
    await utimes(path, new Date(), new Date(Date.now() + 5000))
    await library.scan()

    expect(await library.search('pierwszawersja')).toEqual([])
    expect((await library.search('drugawersja')).map((hit) => hit.doc.name)).toEqual(['plan.html'])
  })

  it('zachowuje kopię i pokazuje ją po usunięciu oryginału', async () => {
    const path = await put('plan.html', docHtml('Plan'))
    const { id } = findDoc(await library.scan(), 'plan.html')

    await rm(path)
    const snapshot = await library.scan()
    const doc = findDoc(snapshot, 'plan.html')
    const served = library.getServedPath(id)

    expect(doc).toMatchObject({ id, missing: true })
    expect(served).toBeDefined()
    expect(await readFile(served as string, 'utf8')).toContain('<title>Plan</title>')
  })

  it('tworzy nową wersję tylko przy zmianie treści', async () => {
    const path = await put('plan.html', docHtml('Plan'))
    const { id } = findDoc(await library.scan(), 'plan.html')
    await library.scan()
    await writeFile(path, docHtml('Plan', ' Nowy akapit.'))
    await library.scan()

    const meta = JSON.parse(await readFile(join(home, 'library', id, 'meta.json'), 'utf8'))

    expect(meta.versions).toHaveLength(2)
  })

  it('przeniesiony plik zachowuje status i historię', async () => {
    const path = await put('plan.html', docHtml('Plan'))
    const { id } = findDoc(await library.scan(), 'plan.html')
    await library.setStatus(id, 'to-decide')

    await rm(path)
    await put('nowe/plan-v2.html', docHtml('Plan'))
    const moved = findDoc(await library.scan(), 'plan-v2.html')

    expect(moved).toMatchObject({ id, status: 'to-decide', missing: false })
    expect(allDocs(library.getSnapshot())).toHaveLength(1)
  })
})

describe('statusy', () => {
  it('nowy dokument czeka na przeczytanie, a stary trafia do archiwum', async () => {
    const old = await put('stary.html', docHtml('Stary'))
    const dayAgo = new Date(Date.now() - 86_400_000)
    const monthAgo = new Date(Date.now() - 30 * 86_400_000)
    await utimes(old, monthAgo, monthAgo)
    const fresh = await put('nowy.html', docHtml('Nowy'))
    await utimes(fresh, dayAgo, dayAgo)

    const snapshot = await library.scan()

    expect(findDoc(snapshot, 'stary.html').status).toBe('archived')
    expect(findDoc(snapshot, 'nowy.html').status).toBe('to-read')
  })

  it('otwarcie oznacza jako przeczytany, a zmiana treści cofa ten stan', async () => {
    const path = await put('plan.html', docHtml('Plan'))
    const { id } = findDoc(await library.scan(), 'plan.html')

    await library.markOpened(id)
    expect(findDoc(library.getSnapshot(), 'plan.html').status).toBe('read')

    await writeFile(path, docHtml('Plan', ' Zmiana.'))
    expect(findDoc(await library.scan(), 'plan.html').status).toBe('to-read')
  })

  it('status przetrwa ponowne uruchomienie', async () => {
    await put('plan.html', docHtml('Plan'))
    const { id } = findDoc(await library.scan(), 'plan.html')
    await library.setStatus(id, 'decided')

    library.close()
    library = await openLibrary()

    expect(findDoc(await library.scan(), 'plan.html').status).toBe('decided')
  })
})

describe('decyzje użytkownika', () => {
  it('niepewny plik można dodać do biblioteki', async () => {
    await put('prawie.html', `<style>p{}</style><p>${prose}</p>`)
    const [doc] = (await library.scan()).review

    const snapshot = await library.setClassification((doc as DocEntry).id, 'document')

    expect(snapshot.review).toEqual([])
    expect(findDoc(snapshot, 'prawie.html').classification).toBe('document')
  })

  it('dokument można pominąć i nie wraca po kolejnym skanie', async () => {
    await put('plan.html', docHtml('Plan'))
    const { id } = findDoc(await library.scan(), 'plan.html')

    await library.setClassification(id, 'ignored')
    const snapshot = await library.scan()

    expect(allDocs(snapshot)).toEqual([])
    expect(snapshot.ignoredCount).toBe(1)
  })
})

describe('wyszukiwanie', () => {
  it('znajduje treść bez polskich znaków i zwraca fragment z oryginału', async () => {
    await put('plan.html', docHtml('Plan'))
    await library.scan()

    const [hit] = await library.search('lamiglowkach')

    expect(hit?.doc.name).toBe('plan.html')
    expect(hit?.match).toBe('łamigłówkach')
  })

  it('obsługuje prefiks i kilka słów', async () => {
    await put('plan.html', docHtml('Plan'))
    await library.scan()

    expect(await library.search('decyz dokum')).toHaveLength(1)
    expect(await library.search('decyz nieistniejace')).toEqual([])
  })

  it('nie wybucha na znakach składni FTS', async () => {
    await put('plan.html', docHtml('Plan'))
    await library.scan()

    await expect(library.search('"plan" (')).resolves.toHaveLength(1)
    await expect(library.search('***')).resolves.toEqual([])
  })
})

describe('repozytoria', () => {
  it('łączy kopie z worktree w jeden dokument głównego repozytorium', async () => {
    const repo = join(root, 'gra')
    await initRepo(repo)
    await git(['worktree', 'add', '-b', 'feature/x', join(root, 'gra-wt')], repo)
    await put('gra/dokument.html', docHtml('Dokument'))
    await put('gra-wt/dokument.html', docHtml('Dokument'))
    await put('gra-wt/nowy.html', docHtml('Nowy na branchu'))

    const snapshot = await library.scan()

    expect(snapshot.projects).toHaveLength(1)
    expect(snapshot.projects[0]?.name).toBe('gra')
    expect(findDoc(snapshot, 'dokument.html').otherPaths).toHaveLength(1)
    expect(findDoc(snapshot, 'nowy.html').branch).toBe('feature/x')
  })

  it('zostawia branch z chwili powstania dokumentu po przełączeniu', async () => {
    const repo = join(root, 'gra')
    await initRepo(repo)
    await git(['checkout', '-b', 'feature/y'], repo)
    await put('gra/plan.html', docHtml('Plan'))
    await library.scan()

    await git(['checkout', 'main'], repo)
    const snapshot = await library.scan({ refreshGit: true })

    expect(findDoc(snapshot, 'plan.html').branch).toBe('feature/y')
  })

  it('przypisuje folder spoza repozytorium do wskazanego repozytorium', async () => {
    const repo = join(root, 'gra')
    await initRepo(repo)
    await put('notatki/plan.html', docHtml('Plan'))
    links = [{ folder: join(root, 'notatki'), repo }]

    const snapshot = await library.scan()

    expect(snapshot.projects[0]?.name).toBe('gra')
    expect(findDoc(snapshot, 'plan.html')).toMatchObject({ relPath: 'plan.html', branch: 'main' })
  })

  it('dopasowuje PR po branchu w tle', async () => {
    const repo = join(root, 'gra')
    await initRepo(repo)
    await git(['remote', 'add', 'origin', 'git@github.com:ktos/gra.git'], repo)
    await git(['checkout', '-b', 'feature/z'], repo)
    await put('gra/plan.html', docHtml('Plan'))
    library.close()
    gh = async (args) => {
      expect(args).toContain('feature/z')
      return JSON.stringify([{ number: 7, title: 'Plan', url: 'https://github.com/ktos/gra/pull/7', state: 'OPEN' }])
    }
    library = await openLibrary()

    await library.scan()
    await expect.poll(() => library.getSnapshot().projects[0]?.pullRequests['feature/z']?.number).toBe(7)
    expect(changes.length).toBeGreaterThan(1)
  })
})
