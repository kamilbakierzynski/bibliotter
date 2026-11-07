import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnnotationHistory } from '../src/main/annotationHistory'
import { AnnotationStore } from '../src/main/annotationStore'
import type { NewAnnotation } from '../src/shared/annotations'

let home: string
let store: AnnotationStore
let history: AnnotationHistory

const anchor = { selector: '#plan', offsetX: 0.5, offsetY: 0.5, quote: 'Akapit', heading: null }
const comment: NewAnnotation = { kind: 'comment', audience: 'agent', color: null, anchor, text: 'Popraw to' }
const sticky: NewAnnotation = { kind: 'sticky', audience: 'me', color: 'blue', anchor, text: 'Temat na spotkanie' }
const highlight: NewAnnotation = {
  kind: 'highlight',
  audience: 'me',
  color: 'pink',
  anchor,
  text: '',
  strokes: ['0.1 0.2 0.3 0.4'],
  anchorWidth: 680
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'history-'))
  store = new AnnotationStore(join(home, 'library'))
  history = new AnnotationHistory(store, async () => {})
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

const ids = async (docId = 'd1'): Promise<string[]> => (await store.listForDoc(docId)).map(({ id }) => id)

describe('AnnotationHistory', () => {
  it.each([
    ['komentarza', comment, 'dodanie komentarza'],
    ['karteczki', sticky, 'dodanie karteczki'],
    ['zakreślenia', highlight, 'dodanie zakreślenia']
  ])('cofa dodanie %s i przywraca je z tym samym id', async (_name, input, label) => {
    const note = await history.create('d1', 'sha', input)

    expect(await history.undo('d1')).toBe(`Cofnięto: ${label}`)
    expect(await ids()).toEqual([])

    expect(await history.redo('d1')).toBe(`Przywrócono: ${label}`)
    expect(await store.listForDoc('d1')).toEqual([note])
  })

  it('cofa usunięcie, także wątku z odpowiedzią agenta', async () => {
    const { id } = await history.create('d1', 'sha', comment)
    await store.addMessage(id, 'agent', 'Gotowe')
    await history.delete(id)
    expect(await ids()).toEqual([])

    expect(await history.undo('d1')).toBe('Cofnięto: usunięcie komentarza')
    expect((await store.get(id)).messages.map(({ text }) => text)).toEqual(['Popraw to', 'Gotowe'])

    expect(await history.redo('d1')).toBe('Przywrócono: usunięcie komentarza')
    expect(await ids()).toEqual([])
  })

  it('cofa zamknięcie i zmianę odbiorcy, nie ruszając reszty uwagi', async () => {
    const { id } = await history.create('d1', 'sha', comment)
    await history.setStatus(id, 'resolved')
    await history.setAudience(id, 'me')
    await store.addMessage(id, 'agent', 'Dopisek')

    expect(await history.undo('d1')).toBe('Cofnięto: zmiana odbiorcy')
    expect((await store.get(id)).audience).toBe('agent')
    expect(await history.undo('d1')).toBe('Cofnięto: zamknięcie uwagi')
    const reopened = await store.get(id)
    expect(reopened.status).toBe('open')
    expect(reopened.messages.at(-1)?.text).toBe('Dopisek')

    await history.redo('d1')
    expect((await store.get(id)).status).toBe('resolved')
  })

  it('cofa odpowiedź i oddaje ją na jej miejsce w rozmowie', async () => {
    const { id } = await history.create('d1', 'sha', comment)
    await history.reply(id, 'Moja odpowiedź')
    await store.addMessage(id, 'agent', 'Agent po mnie')

    expect(await history.undo('d1')).toBe('Cofnięto: odpowiedź')
    expect((await store.get(id)).messages.map(({ text }) => text)).toEqual(['Popraw to', 'Agent po mnie'])

    await history.redo('d1')
    expect((await store.get(id)).messages.map(({ text }) => text)).toEqual(['Popraw to', 'Moja odpowiedź', 'Agent po mnie'])
  })

  it('nowe działanie kasuje to, co można było przywrócić', async () => {
    await history.create('d1', 'sha', comment)
    await history.undo('d1')
    const sticker = await history.create('d1', 'sha', sticky)

    expect(await history.redo('d1')).toBeNull()
    expect(await ids()).toEqual([sticker.id])
  })

  it('każdy dokument ma własną historię', async () => {
    const first = await history.create('d1', 'sha', comment)
    const second = await history.create('d2', 'sha', comment)

    expect(await history.undo('d1')).not.toBeNull()
    expect(await ids('d1')).toEqual([])
    expect(await ids('d2')).toEqual([second.id])
    expect(await history.undo('d1')).toBeNull()
    expect(first.docId).toBe('d1')
  })

  it('nie cofa dodania uwagi, na którą odpisał agent, ale idzie dalej przy kolejnym naciśnięciu', async () => {
    const older = await history.create('d1', 'sha', sticky)
    const answered = await history.create('d1', 'sha', comment)
    await store.addMessage(answered.id, 'agent', 'Odpowiedź')

    expect(await history.undo('d1')).toBe('Agent odpisał na tę uwagę, więc zostaje')
    expect(await ids()).toContain(answered.id)

    expect(await history.undo('d1')).toBe('Cofnięto: dodanie karteczki')
    expect(await ids()).toEqual([answered.id])
    expect(older.kind).toBe('sticky')
  })

  it('przywrócenie usunięcia nie rusza wątku, jeśli agent dopisał coś po cofnięciu', async () => {
    const { id } = await history.create('d1', 'sha', comment)
    await store.addMessage(id, 'agent', 'Pierwsza')
    await history.delete(id)
    await history.undo('d1')
    await store.addMessage(id, 'agent', 'Druga, której nie widziałem')

    expect(await history.redo('d1')).toBe('Agent odpisał na tę uwagę, więc zostaje')
    expect((await store.get(id)).messages).toHaveLength(3)
  })

  it('pomija kroki, które agent już unieważnił', async () => {
    const { id } = await history.create('d1', 'sha', comment)
    await history.setAudience(id, 'me')
    await history.setStatus(id, 'resolved')
    await store.setStatus(id, 'open')

    expect(await history.undo('d1')).toBe('Cofnięto: zmiana odbiorcy')
    expect((await store.get(id)).audience).toBe('agent')
  })

  it('pomija uwagę usuniętą poza historią', async () => {
    const kept = await history.create('d1', 'sha', sticky)
    const { id } = await history.create('d1', 'sha', comment)
    await store.delete(id)

    expect(await history.undo('d1')).toBe('Cofnięto: dodanie karteczki')
    expect(await store.listForDoc('d1')).toEqual([])
    expect(kept.id).not.toBe(id)
  })

  it('klawisz wyprzedzający zapis cofa właśnie to działanie', async () => {
    const created = history.create('d1', 'sha', highlight)
    const undone = history.undo('d1')

    await created
    expect(await undone).toBe('Cofnięto: dodanie zakreślenia')
    expect(await ids()).toEqual([])
  })

  it('każda zmiana dociera do widoków przed następną', async () => {
    const order: string[] = []
    const seen = new AnnotationHistory(store, async () => {
      order.push(`push:${(await store.listForDoc('d1')).length}`)
    })

    const created = seen.create('d1', 'sha', highlight)
    const undone = seen.undo('d1')
    await Promise.all([created, undone])

    expect(order).toEqual(['push:1', 'push:0'])
  })

  it('błąd zapisu zostawia krok na stosie', async () => {
    await history.create('d1', 'sha', comment)
    const failure = vi.spyOn(store, 'delete').mockRejectedValueOnce(new Error('dysk'))

    await expect(history.undo('d1')).rejects.toThrow('dysk')
    expect(await history.undo('d1')).toBe('Cofnięto: dodanie komentarza')
    failure.mockRestore()
  })

  it('błąd jednej zmiany nie zatrzymuje kolejnych', async () => {
    await expect(history.setStatus('nie-ma', 'resolved')).rejects.toThrow()
    await history.create('d1', 'sha', comment)
    expect(await ids()).toHaveLength(1)
  })

  it('pamięta ograniczoną liczbę kroków, zaczynając od najnowszych', async () => {
    const { id } = await history.create('d1', 'sha', comment)
    for (let i = 0; i < 101; i++) await history.setAudience(id, i % 2 === 0 ? 'me' : 'agent')

    for (let i = 0; i < 100; i++) expect(await history.undo('d1')).toBe('Cofnięto: zmiana odbiorcy')
    expect(await history.undo('d1')).toBeNull()
    expect(await ids()).toEqual([id])
  }, 60_000)

  it('bez historii zwraca null', async () => {
    expect(await history.undo('d1')).toBeNull()
    expect(await history.redo('d1')).toBeNull()
  })
})
