import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeFile, type FileAnalyzer } from '../src/main/analysis'
import { commandRunner, type GitRunner } from '../src/main/git'
import { Library } from '../src/main/library'
import type { DocEntry, FolderLink, LibrarySnapshot, ScanProgress } from '../src/shared/types'

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

async function openLibrary(extra: { analyze?: FileAnalyzer; onProgress?: (progress: ScanProgress) => void } = {}): Promise<Library> {
  return Library.open({
    dataDir: home,
    git,
    gh,
    getConfig: () => ({ roots: [root], folderLinks: links }),
    onChange: (snapshot) => changes.push(snapshot),
    ...extra
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

  it('czyta repozytorium z plików, bez uruchamiania gita', async () => {
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

    expect(started).toEqual([])
  })

  it('pliki odrzucone po ścieżce w ogóle nie są czytane', async () => {
    await put('plan.html', docHtml('Plan'))
    await put('README.md', '# Repo')
    await put('tmp/szkic.html', docHtml('Szkic'))
    await put('test-results/raport.html', docHtml('Raport'))
    library.close()
    const read: string[] = []
    library = await openLibrary({
      analyze: (path, format) => {
        read.push(path)
        return analyzeFile(path, format)
      }
    })

    const snapshot = await library.scan()

    expect(read.map((path) => path.split(/[\\/]/).at(-1))).toEqual(['plan.html'])
    expect(allDocs(snapshot).map((doc) => doc.name)).toEqual(['plan.html'])
    expect(snapshot.ignoredCount).toBe(3)
  })

  it('decyzja użytkownika działa także dla pliku, który odpadłby po ścieżce', async () => {
    const path = await put('plan.html', docHtml('Plan'))
    const { id } = findDoc(await library.scan(), 'plan.html')
    await rm(path)
    await put('tmp/plan.html', docHtml('Plan'))
    const moved = await library.scan()
    expect(allDocs(moved).filter((doc) => !doc.missing)).toEqual([])

    await library.setClassification(id, 'document')

    expect(findDoc(library.getSnapshot(), 'plan.html').classification).toBe('document')
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

  it('zmienia status wielu dokumentów jedną migawką i pomija nieznane', async () => {
    await put('a.html', docHtml('Plan A'))
    await put('b.html', docHtml('Plan B'))
    const snapshot = await library.scan()
    const ids = [findDoc(snapshot, 'a.html').id, findDoc(snapshot, 'b.html').id]
    changes = []

    await library.setStatuses([...ids, 'nie-ma-takiego'], 'to-decide')

    expect(changes).toHaveLength(1)
    expect(allDocs(changes[0] as LibrarySnapshot).map((doc) => doc.status)).toEqual(['to-decide', 'to-decide'])
    const meta = JSON.parse(await readFile(join(home, 'library', ids[0] as string, 'meta.json'), 'utf8'))
    expect(meta.status).toBe('to-decide')
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

describe('przebieg skanu', () => {
  /** Zatrzymuje analizę wskazanego pliku, a resztę przepuszcza. */
  function holdFile(name: string): { analyze: FileAnalyzer; release: () => void } {
    let release = (): void => {}
    const gate = new Promise<void>((done) => {
      release = done
    })
    return {
      release,
      analyze: async (path, format) => {
        if (path.endsWith(name)) await gate
        return analyzeFile(path, format)
      }
    }
  }

  it('pokazuje dokumenty w trakcie skanu, a zapisuje je dopiero na końcu', async () => {
    await put('gotowy.html', docHtml('Gotowy'))
    await put('wolny.html', docHtml('Wolny'))
    library.close()
    const { analyze, release } = holdFile('wolny.html')
    library = await openLibrary({ analyze })

    const scan = library.scan()
    await expect.poll(() => allDocs(library.getSnapshot()).map((doc) => doc.name)).toEqual(['gotowy.html'])
    const { id } = findDoc(library.getSnapshot(), 'gotowy.html')

    await expect(readFile(join(home, 'library', id, 'meta.json'), 'utf8')).rejects.toThrow()
    release()
    await scan
    expect(allDocs(library.getSnapshot()).map((doc) => doc.name).sort()).toEqual(['gotowy.html', 'wolny.html'])
    await expect(readFile(join(home, 'library', id, 'meta.json'), 'utf8')).resolves.toContain('gotowy.html')
  })

  it('najnowsze pliki idą na początek', async () => {
    const old = await put('stary.html', docHtml('Stary'))
    await put('nowy.html', docHtml('Nowy'))
    const dayAgo = new Date(Date.now() - 86_400_000)
    await utimes(old, dayAgo, dayAgo)
    library.close()
    const read: string[] = []
    library = await openLibrary({
      analyze: (path, format) => {
        read.push(path)
        return analyzeFile(path, format)
      }
    })

    await library.scan()

    expect(read[0]).toMatch(/nowy\.html$/)
  })

  it('status nadany w trakcie skanu nie ginie, gdy dokument nie ma jeszcze danych na dysku', async () => {
    await put('gotowy.html', docHtml('Gotowy'))
    await put('wolny.html', docHtml('Wolny'))
    library.close()
    const { analyze, release } = holdFile('wolny.html')
    library = await openLibrary({ analyze })

    const scan = library.scan()
    await expect.poll(() => allDocs(library.getSnapshot()).length).toBe(1)
    const { id } = findDoc(library.getSnapshot(), 'gotowy.html')
    await library.markOpened(id)
    expect(findDoc(library.getSnapshot(), 'gotowy.html').status).toBe('read')

    release()
    await scan

    expect(findDoc(library.getSnapshot(), 'gotowy.html').status).toBe('read')
    const meta = JSON.parse(await readFile(join(home, 'library', id, 'meta.json'), 'utf8'))
    expect(meta.status).toBe('read')
  })

  it('zmiana statusu nie uruchamia skanu', async () => {
    await put('plan.html', docHtml('Plan'))
    const { id } = findDoc(await library.scan(), 'plan.html')
    const scan = vi.spyOn(library, 'scan')

    await library.markOpened(id)
    await library.setStatus(id, 'decided')

    expect(scan).not.toHaveBeenCalled()
    expect(findDoc(library.getSnapshot(), 'plan.html').status).toBe('decided')
  })

  it('zgłasza postęp i jego koniec', async () => {
    await put('plan.html', docHtml('Plan'))
    await put('tmp/szkic.html', docHtml('Szkic'))
    library.close()
    const progress: ScanProgress[] = []
    library = await openLibrary({ onProgress: (state) => progress.push(state) })

    await library.scan()

    expect(progress[0]).toMatchObject({ active: true })
    expect(progress.at(-1)).toEqual({ active: false, found: 2, done: 2 })
  })

  it('usunięty folder znika od razu, jeszcze przed skanem', async () => {
    const second = join(workspace, 'drugi')
    await mkdir(second)
    await writeFile(join(second, 'obcy.html'), docHtml('Obcy'))
    await put('plan.html', docHtml('Plan'))
    let roots = [root, second]
    library.close()
    library = await Library.open({
      dataDir: home,
      git,
      gh,
      getConfig: () => ({ roots, folderLinks: links }),
      onChange: (snapshot) => changes.push(snapshot)
    })
    await library.scan()
    expect(allDocs(library.getSnapshot())).toHaveLength(2)

    roots = [root]
    const scan = library.scan()

    expect(allDocs(library.getSnapshot()).map((doc) => doc.name)).toEqual(['plan.html'])
    await scan
  })
})

describe('start z pamięci', () => {
  it('pokazuje ostatni stan, zanim skończy się pierwszy skan', async () => {
    await put('plan.html', docHtml('Plan'))
    const { id } = findDoc(await library.scan(), 'plan.html')
    await library.setStatus(id, 'to-decide')
    library.close()
    changes = []

    library = await openLibrary()

    expect(findDoc(changes[0] as LibrarySnapshot, 'plan.html')).toMatchObject({ id, status: 'to-decide' })
    expect(library.getServedPath(id)).toMatch(/plan\.html$/)
  })

  it('skan bez zmian po starcie nikogo nie budzi', async () => {
    await put('a.html', docHtml('A'))
    await put('b/c.html', docHtml('C'))
    await library.scan()
    library.close()
    changes = []

    library = await openLibrary()
    await library.scan()

    expect(changes).toHaveLength(1)
  })

  it('pamięć z innymi folderami nie jest pokazywana', async () => {
    await put('plan.html', docHtml('Plan'))
    await library.scan()
    library.close()
    changes = []
    const other = join(workspace, 'inny')
    await mkdir(other)

    library = await Library.open({
      dataDir: home,
      git,
      gh,
      getConfig: () => ({ roots: [other], folderLinks: [] }),
      onChange: (snapshot) => changes.push(snapshot)
    })

    expect(changes[0]).toMatchObject({ roots: [other], projects: [] })
  })

  it('uszkodzona pamięć nie zatrzymuje startu', async () => {
    await put('plan.html', docHtml('Plan'))
    await library.scan()
    library.close()
    await writeFile(join(home, 'cache', 'library-v1.json'), '{"roots":')

    library = await openLibrary()

    expect(allDocs(await library.scan()).map((doc) => doc.name)).toEqual(['plan.html'])
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
