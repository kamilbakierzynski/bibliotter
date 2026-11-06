import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentApi, writeCurrentDocument } from '../src/main/agentApi'
import { AnnotationStore, parseAnchor, watchAnnotations } from '../src/main/annotationStore'
import { MetaStore, type DocMeta } from '../src/main/metaStore'
import type { NewAnnotation } from '../src/shared/annotations'

let home: string
let docsDir: string
let store: AnnotationStore
let api: AgentApi

const comment: NewAnnotation = {
  kind: 'comment',
  audience: 'agent',
  color: null,
  anchor: { selector: '#plan', offsetX: 0.5, offsetY: 0.5, quote: 'Pierwszy akapit', heading: 'Cel' },
  text: 'Popraw to'
}

async function addDoc(id: string, overrides: Partial<DocMeta> = {}): Promise<DocMeta> {
  const path = join(docsDir, `${id}.html`)
  await writeFile(path, `<title>Tytuł ${id}</title><h1>Łamigłówki</h1><p>Treść dokumentu ${id}</p>`)
  const metas = new MetaStore(join(home, 'library'))
  const meta: DocMeta = {
    id,
    path,
    title: `Tytuł ${id}`,
    firstSeenAt: '2026-11-05T10:00:00.000Z',
    status: 'to-read',
    sha: 'sha1',
    mtimeMs: 1,
    projectPath: join(docsDir, 'projekt'),
    branch: 'feature/x',
    commit: 'abc',
    versions: [],
    ...overrides
  }
  await metas.save(meta)
  return meta
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'notes-'))
  docsDir = join(home, 'docs')
  await mkdir(docsDir)
  store = new AnnotationStore(join(home, 'library'))
  api = new AgentApi(home)
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('watchAnnotations', () => {
  it('budzi apkę, gdy uwagę zapisze inny proces', async () => {
    const onChange = vi.fn()
    const stop = watchAnnotations(join(home, 'library'), onChange)

    await new AnnotationStore(join(home, 'library')).create('d1', 'sha1', comment)

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 3000 })
    stop()
  })

  it('budzi apkę po usunięciu uwagi', async () => {
    const created = await store.create('d1', 'sha1', comment)
    const onChange = vi.fn()
    const stop = watchAnnotations(join(home, 'library'), onChange)

    await store.delete(created.id)

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 3000 })
    stop()
  })

  it('nie słucha zapisów skanu w bibliotece', async () => {
    const onChange = vi.fn()
    const stop = watchAnnotations(join(home, 'library'), onChange)

    await addDoc('d1')
    await new Promise((done) => setTimeout(done, 400))

    expect(onChange).not.toHaveBeenCalled()
    stop()
  })
})

describe('AnnotationStore', () => {
  it('zapisuje uwagę jako osobny plik', async () => {
    const created = await store.create('d1', 'sha1', comment)
    const raw = await readFile(join(home, 'library', 'd1', 'annotations', `${created.id}.json`), 'utf8')

    expect(JSON.parse(raw)).toMatchObject({ docSha: 'sha1', status: 'open', kind: 'comment' })
    expect(created.messages[0]).toMatchObject({ author: 'user', text: 'Popraw to' })
  })

  it('karteczka bez koloru dostaje żółty, a komentarz nie ma koloru', async () => {
    const sticky = await store.create('d1', 's', { ...comment, kind: 'sticky', audience: 'me' })

    expect(sticky.color).toBe('yellow')
    expect((await store.create('d1', 's', comment)).color).toBeNull()
  })

  it('odrzuca pustą treść', async () => {
    await expect(store.create('d1', 's', { ...comment, text: '   ' })).rejects.toThrow('pusta')
  })

  it('dopisuje wiadomości i zmienia status', async () => {
    const { id } = await store.create('d1', 's', comment)

    await store.addMessage(id, 'agent', 'Gotowe')
    await store.setStatus(id, 'resolved')

    expect(await store.get(id)).toMatchObject({ status: 'resolved', messages: [{}, { author: 'agent' }] })
  })

  it('uszkodzony plik nie ukrywa pozostałych uwag', async () => {
    await store.create('d1', 's', comment)
    await writeFile(join(home, 'library', 'd1', 'annotations', 'zepsuty.json'), '{')

    expect(await store.listForDoc('d1')).toHaveLength(1)
  })

  it('usuwa uwagę', async () => {
    const { id } = await store.create('d1', 's', comment)

    await store.delete(id)

    expect(await store.listAll()).toEqual([])
  })
})

describe('parseAnchor', () => {
  it('odrzuca dane bez selektora', () => {
    expect(parseAnchor({ quote: 'x' })).toBeNull()
    expect(parseAnchor(null)).toBeNull()
  })

  it('ogranicza wartości spoza zakresu i skraca cytat', () => {
    const anchor = parseAnchor({ selector: 'p', offsetX: 9, offsetY: -1, quote: 'x'.repeat(5000) })

    expect(anchor).toMatchObject({ offsetX: 1, offsetY: 0, heading: null })
    expect(anchor?.quote).toHaveLength(400)
  })
})

describe('AgentApi', () => {
  it('pokazuje dokumenty z liczbą otwartych uwag dla agenta', async () => {
    await addDoc('d1')
    await store.create('d1', 'sha1', comment)
    await store.create('d1', 'sha1', { ...comment, audience: 'me' })

    const [doc] = await api.documents()

    expect(doc).toMatchObject({ id: 'd1', openComments: 1, branch: 'feature/x', project: 'projekt' })
  })

  it('filtruje dokumenty po branchu i pomija odrzucone', async () => {
    await addDoc('d1')
    await addDoc('d2', { branch: 'inny' })
    await addDoc('d3', { classificationOverride: 'ignored' })

    expect((await api.documents({ branch: 'inny' })).map((doc) => doc.id)).toEqual(['d2'])
    expect(await api.documents()).toHaveLength(2)
  })

  it('domyślnie pomija uwagi prywatne i zamknięte', async () => {
    await addDoc('d1')
    const open = await store.create('d1', 'sha1', comment)
    await store.create('d1', 'sha1', { ...comment, kind: 'sticky', audience: 'me', text: 'Na spotkanie' })
    const closed = await store.create('d1', 'sha1', comment)
    await store.setStatus(closed.id, 'resolved')

    expect((await api.comments()).map((item) => item.id)).toEqual([open.id])
    expect(await api.comments({ includePersonal: true })).toHaveLength(2)
    expect(await api.comments({ status: 'all' })).toHaveLength(2)
  })

  it('oznacza uwagi do starszej wersji i podaje kontekst miejsca', async () => {
    await addDoc('d1', { sha: 'nowsza' })
    await store.create('d1', 'starsza', comment)

    const [item] = await api.comments()

    expect(item).toMatchObject({ outdated: true, heading: 'Cel', quote: 'Pierwszy akapit', docTitle: 'Tytuł d1' })
  })

  it('odpowiada i zamyka uwagę jako agent', async () => {
    await addDoc('d1')
    const { id } = await store.create('d1', 'sha1', comment)

    await api.reply(id, 'Pytanie do Ciebie')
    const closed = await api.resolveComment(id, 'Zrobione')

    expect(closed.status).toBe('resolved')
    expect(closed.messages.map((message) => message.author)).toEqual(['user', 'agent', 'agent'])
  })

  it('czyta dokument otwarty w apce jako tekst', async () => {
    const meta = await addDoc('d1')
    await writeCurrentDocument(home, {
      docId: 'd1',
      title: meta.title,
      path: meta.path,
      project: 'projekt',
      branch: null,
      openedAt: '2026-11-05T10:00:00.000Z'
    })

    const { content, title } = await api.readDocument('current')

    expect(title).toBe('Tytuł d1')
    expect(content).toContain('Treść dokumentu d1')
    expect(content).not.toContain('<h1>')
  })

  it('zgłasza brak otwartego dokumentu', async () => {
    await writeCurrentDocument(home, null)

    await expect(api.readDocument('current')).rejects.toThrow('żaden dokument')
    expect(await api.current()).toBeNull()
  })

  it('wyszukuje bez polskich znaków i bez SQLite', async () => {
    await addDoc('d1')
    await addDoc('d2')

    const hits = await api.search('lamiglowki d2')

    expect(hits.map((hit) => hit.id)).toEqual(['d2'])
    expect(hits[0]?.snippet).toContain('Łamigłówki')
  })
})
