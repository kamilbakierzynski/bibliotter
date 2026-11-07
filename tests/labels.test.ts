import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commandRunner, type GitRunner } from '../src/main/git'
import { LabelStore } from '../src/main/labelStore'
import { Library } from '../src/main/library'
import { sendSignal, watchSignal } from '../src/main/signals'
import {
  cleanLabel,
  countLabels,
  defaultLabelColor,
  LABEL_COLORS,
  labelTone,
  MAX_LABEL_LENGTH,
  moveLabelColor,
  parseLabels,
  ticketLink,
  ticketRows,
  ticketTemplate,
  withLabelColor
} from '../src/shared/labels'
import type { DocEntry, LibrarySnapshot } from '../src/shared/types'

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'labels-'))
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('nazwy etykiet', () => {
  it('porządkuje odstępy i przycina długą nazwę', () => {
    expect(cleanLabel('  PR \n  review ')).toBe('PR review')
    expect(cleanLabel('x'.repeat(100))).toHaveLength(MAX_LABEL_LENGTH)
    expect(cleanLabel(7)).toBe('')
  })

  it('nie tworzy odmian tej samej nazwy', () => {
    expect(parseLabels(['plan', 'PLAN', ' ', 'PAY-1'], ['Plan'])).toEqual(['Plan', 'PAY-1'])
    expect(parseLabels('Plan')).toEqual([])
  })

  it('liczy dokumenty i sortuje numery naturalnie', () => {
    expect(countLabels([['PAY-10', 'Plan'], ['PAY-9'], ['plan']])).toEqual([
      { name: 'PAY-9', count: 1 },
      { name: 'PAY-10', count: 1 },
      { name: 'Plan', count: 2 }
    ])
  })
})

describe('kody zgłoszeń', () => {
  const BROWSE = 'https://firma.atlassian.net/browse/{code}'

  it.each([
    ['firma.atlassian.net', BROWSE],
    ['https://firma.atlassian.net/', BROWSE],
    ['https://firma.atlassian.net/browse', BROWSE],
    ['https://firma.atlassian.net/browse/PAY-1482?focusedCommentId=7#komentarz', BROWSE],
    ['https://firma.atlassian.net/jira/board?selectedIssue=PAY-1', 'https://firma.atlassian.net/jira/board?selectedIssue={code}'],
    ['http://jira.local:8080/issues/{code}/', 'http://jira.local:8080/issues/{code}/'],
    ['https://linear.app/firma/issue', 'https://linear.app/firma/issue/{code}'],
    ['  firma.atlassian.net  ', BROWSE]
  ])('z adresu %s robi szablon', (value, template) => {
    expect(ticketTemplate(value)).toBe(template)
  })

  it('puste pole czyści ustawienie', () => {
    expect(ticketTemplate('   ')).toBe('')
  })

  it.each(['javascript:alert(1)', 'file:///C:/plik.html', 'ftp://firma.pl/{code}', 'nie adres', 42, null])(
    'odrzuca %s',
    (value) => {
      expect(ticketTemplate(value)).toBeNull()
    }
  )

  it('wstawia kod do szablonu', () => {
    expect(ticketLink(BROWSE, 'PAY-1482')).toBe('https://firma.atlassian.net/browse/PAY-1482')
  })

  it('zwykła etykieta i brak adresu nie dają linku', () => {
    expect(ticketLink(BROWSE, 'Plan')).toBeNull()
    expect(ticketLink('', 'PAY-1')).toBeNull()
    expect(ticketLink(undefined, 'PAY-1')).toBeNull()
  })

  it('spis ma tylko kody, od najświeższego dokumentu, z tytułem najnowszego', () => {
    const docs = [
      { labels: ['PAY-1', 'Plan'], mtimeMs: 10, title: 'Starszy' },
      { labels: ['MOB-7'], mtimeMs: 15, title: 'Środkowy' },
      { labels: ['PAY-1'], mtimeMs: 20, title: 'Nowszy' }
    ]
    const rows = ticketRows(docs, (doc) => doc.title)
    expect(rows.map(({ name, count, title }) => [name, count, title])).toEqual([
      ['PAY-1', 2, 'Nowszy'],
      ['MOB-7', 1, 'Środkowy']
    ])
    expect(rows[0]?.titles).toContain('Starszy')
  })
})

describe('kolory etykiet', () => {
  it('kolor wynika z nazwy, a wielkość liter go nie zmienia', () => {
    expect(defaultLabelColor('Plan')).toBe(defaultLabelColor('plan'))
    expect(LABEL_COLORS).toContain(defaultLabelColor('Cokolwiek'))
  })

  it('rodzaje startowe mają różne kolory', () => {
    expect(new Set(['PR review', 'Explainer', 'Plan', 'Idea'].map(defaultLabelColor)).size).toBe(4)
  })

  it('kody jednego projektu mają wspólny kolor', () => {
    expect(defaultLabelColor('PAY-1482')).toBe(defaultLabelColor('PAY-7'))
  })

  it('paleta nie zawiera pomarańczu Sygnału', () => {
    expect(LABEL_COLORS).not.toContain('orange')
  })

  it('wybór użytkownika wygrywa, także wybór bez koloru', () => {
    expect(labelTone('Plan', withLabelColor({}, 'plan', 'blue'))).toBe('blue')
    expect(labelTone('Plan', withLabelColor({}, 'PLAN', 'none'))).toBe('none')
  })

  it('kolor idzie za zmianą nazwy i znika z usunięciem', () => {
    const colors = withLabelColor({}, 'Plan', 'blue')
    expect(moveLabelColor(colors, 'Plan', 'Roadmapa')).toEqual({ roadmapa: 'blue' })
    expect(moveLabelColor(colors, 'Plan', null)).toEqual({})
  })
})

describe('LabelStore', () => {
  let library: string
  let store: LabelStore

  beforeEach(() => {
    library = join(workspace, 'library')
    store = new LabelStore(library)
  })

  it('zapisuje etykiety obok metadanych i wczytuje je po restarcie', async () => {
    await store.set('d1', ['Plan', 'PAY-1'])

    const raw = JSON.parse(await readFile(join(library, 'd1', 'labels.json'), 'utf8'))
    const reopened = new LabelStore(library)
    await reopened.load()

    expect(raw).toEqual({ labels: ['Plan', 'PAY-1'] })
    expect(reopened.get('d1')).toEqual(['Plan', 'PAY-1'])
  })

  it('zdjęcie ostatniej etykiety usuwa plik', async () => {
    await store.set('d1', ['Plan'])
    await store.set('d1', [])

    await expect(access(join(library, 'd1', 'labels.json'))).rejects.toThrow()
    expect(store.all()).toEqual([])
  })

  it('nowy dokument przejmuje pisownię istniejącej etykiety', async () => {
    await store.set('d1', ['PR review'])

    expect(await store.set('d2', ['pr REVIEW'])).toEqual(['PR review'])
  })

  it('zmiana nazwy obejmuje wszystkie dokumenty i może zmienić samą wielkość liter', async () => {
    await store.set('d1', ['plan'])
    await store.set('d2', ['plan', 'Idea'])

    await store.rename('plan', 'Plan')

    expect(store.get('d1')).toEqual(['Plan'])
    expect(store.get('d2')).toEqual(['Plan', 'Idea'])
  })

  it('zmiana na zajętą nazwę łączy etykiety', async () => {
    await store.set('d1', ['Pomysł', 'Idea'])
    await store.set('d2', ['Pomysł'])

    await store.rename('Pomysł', 'idea')

    expect(store.get('d1')).toEqual(['Idea'])
    expect(store.get('d2')).toEqual(['Idea'])
    expect(store.all()).toEqual([{ name: 'Idea', count: 2 }])
  })

  it('odrzuca pustą nazwę', async () => {
    await store.set('d1', ['Plan'])

    await expect(store.rename('Plan', '  ')).rejects.toThrow('empty')
    expect(store.get('d1')).toEqual(['Plan'])
  })

  it('usunięcie zdejmuje etykietę ze wszystkich dokumentów', async () => {
    await store.set('d1', ['Plan', 'Idea'])
    await store.set('d2', ['plan'])

    await store.remove('Plan')

    expect(store.get('d1')).toEqual(['Idea'])
    expect(store.get('d2')).toEqual([])
  })

  it('uszkodzony plik nie blokuje pozostałych dokumentów', async () => {
    await store.set('d1', ['Plan'])
    await mkdir(join(library, 'd2'), { recursive: true })
    await writeFile(join(library, 'd2', 'labels.json'), '{ zepsuty')

    await store.load()

    expect(store.get('d1')).toEqual(['Plan'])
    expect(store.get('d2')).toEqual([])
  })
})

describe('watchSignal', () => {
  it('reaguje tylko na swój sygnał', async () => {
    const library = join(workspace, 'library')
    const onLabels = vi.fn()
    const stop = watchSignal(library, 'labels', onLabels)

    await sendSignal(library, 'annotations')
    await new Promise((done) => setTimeout(done, 300))
    expect(onLabels).not.toHaveBeenCalled()

    await sendSignal(library, 'labels')
    await vi.waitFor(() => expect(onLabels).toHaveBeenCalled(), { timeout: 3000 })
    stop()
  })
})

describe('etykiety w bibliotece', () => {
  const noGh: GitRunner = async () => {
    throw Object.assign(new Error('brak gh'), { code: 'ENOENT' })
  }
  const prose = 'Zdanie opisujące decyzję w dokumencie o łamigłówkach. '.repeat(30)
  const html = (title: string): string =>
    `<title>${title}</title><style>h1{}</style><h1>A</h1><h2>B</h2><h2>C</h2><p>${prose}</p>`

  let root: string
  let home: string
  let library: Library
  let changes: LibrarySnapshot[]

  const open = (): Promise<Library> =>
    Library.open({
      dataDir: home,
      git: commandRunner('git'),
      gh: noGh,
      getConfig: () => ({ roots: [root], folderLinks: [] }),
      onChange: (snapshot) => changes.push(snapshot)
    })

  const docIn = (snapshot: LibrarySnapshot, name: string): DocEntry => {
    const doc = snapshot.projects.flatMap((project) => project.docs).find((candidate) => candidate.name === name)
    if (!doc) throw new Error(`Brak dokumentu ${name}`)
    return doc
  }

  beforeEach(async () => {
    root = join(workspace, 'projekty')
    home = join(workspace, 'home')
    await mkdir(root)
    await writeFile(join(root, 'plan.html'), html('Plan'))
    changes = []
    library = await open()
  })

  afterEach(() => {
    library.close()
  })

  it('zmiana ogłasza nową migawkę bez skanowania folderów', async () => {
    const { id } = docIn(await library.scan(), 'plan.html')
    changes = []
    const scan = vi.spyOn(library, 'scan')

    await library.setLabels(id, ['Plan', 'PAY-1'])

    expect(scan).not.toHaveBeenCalled()
    expect(docIn(changes.at(-1) as LibrarySnapshot, 'plan.html').labels).toEqual(['Plan', 'PAY-1'])
  })

  it('etykiety przetrwają restart i przeniesienie pliku', async () => {
    const { id } = docIn(await library.scan(), 'plan.html')
    await library.setLabels(id, ['Plan'])
    library.close()

    const content = await readFile(join(root, 'plan.html'))
    await rm(join(root, 'plan.html'))
    await writeFile(join(root, 'nowa-nazwa.html'), content)
    library = await open()

    expect(docIn(await library.scan(), 'nowa-nazwa.html').labels).toEqual(['Plan'])
  })

  it('skan nie cofa etykiety nadanej w jego trakcie', async () => {
    const { id } = docIn(await library.scan(), 'plan.html')

    const scanning = library.scan()
    await library.setLabels(id, ['Plan'])

    expect(docIn(await scanning, 'plan.html').labels).toEqual(['Plan'])
    expect(docIn(library.getSnapshot(), 'plan.html').labels).toEqual(['Plan'])
  })

  it('etykieta zapisana przez agenta w innym procesie dociera po sygnale', async () => {
    const { id } = docIn(await library.scan(), 'plan.html')
    const agent = new LabelStore(join(home, 'library'))
    await agent.load()
    await agent.set(id, ['Od agenta'])

    await library.reloadLabels()

    expect(docIn(library.getSnapshot(), 'plan.html').labels).toEqual(['Od agenta'])
  })

  it('odmawia plikowi spoza biblioteki', async () => {
    await expect(library.setLabels('dbrak', ['Plan'])).rejects.toThrow('z biblioteki')
  })
})
