import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PresentationStore, readPresentation } from '../src/main/presentationStore'
import { parseAnchor } from '../src/main/annotationStore'
import {
  moveStep,
  nextStep,
  parsePresentState,
  playable,
  type PresentationStep,
  shotAt,
  shotOwner,
  stepFrom,
  stepState
} from '../src/shared/presentation'

const anchor = { selector: '#diagram', offsetX: 0.5, offsetY: 0.5, quote: 'Wykres', heading: 'Ryzyka' }

const step = (id: string, camera: PresentationStep['camera'] = { kind: 'hold' }): PresentationStep => ({
  id,
  title: '',
  camera,
  rest: 'normal',
  show: []
})

describe('trasa', () => {
  it('krok bez ruchu pokazuje kadr ostatniego kroku, który go ustawił', () => {
    const steps = [
      step('s1'),
      step('s2', { kind: 'place', anchor }),
      step('s3'),
      step('s4', { kind: 'area', anchor, box: { x: 0, y: 0, width: 0.5, height: 0.5 } })
    ]
    expect(shotOwner(steps, 0)).toBe(-1)
    expect(shotAt(steps, 0)).toBeNull()
    expect(shotOwner(steps, 2)).toBe(1)
    expect(shotAt(steps, 2)).toEqual({ anchor })
    expect(shotAt(steps, 3)).toEqual({ anchor, box: { x: 0, y: 0, width: 0.5, height: 0.5 } })
  })

  it('prezentacja pomija krok bez kadru, a krok bez ruchu sięga za niego', () => {
    const steps = [
      step('s1'),
      step('s2', { kind: 'place', anchor }),
      step('s3', { kind: 'place', anchor: { ...anchor, selector: '#nie-ma' } }),
      step('s4'),
      step('s5', { kind: 'area', anchor, box: { x: 0, y: 0, width: 0.5, height: 0.5 } })
    ]
    const missing = new Set(['s3'])
    expect(playable(steps, missing)).toEqual([0, 1, 3, 4])
    expect(shotOwner(steps, 3, missing)).toBe(1)
    expect(shotAt(steps, 3, missing)).toEqual({ anchor })
    // Krok bez ruchu nie ma czego zgubić, więc nie wypada, nawet z identyfikatorem na liście.
    expect(playable(steps, new Set(['s1', 's4']))).toEqual([0, 1, 2, 3, 4])
    expect(stepFrom(steps, 1, 1, missing)).toBe(3)
    expect(stepFrom(steps, 3, -1, missing)).toBe(1)
    expect(stepFrom(steps, 4, 1, missing)).toBeNull()
    expect(stepFrom(steps, 0, -1, missing)).toBeNull()
    // Start prezentacji szuka pierwszego kroku od pozycji przed trasą.
    expect(stepFrom(steps, -1, 1, missing)).toBe(0)
  })

  it('stan kroku kładzie maskę wokół kadru, który widać, także odziedziczonego', () => {
    const steps = [
      { ...step('s1'), rest: 'dim' as const },
      { ...step('s2', { kind: 'place', anchor }), show: ['n1'] },
      { ...step('s3'), rest: 'hide' as const, show: ['n1', 'k1'] }
    ]
    expect(stepState(steps, 0, false)).toEqual({ show: [], reveal: false, rest: 'dim', camera: null })
    expect(stepState(steps, 2, true)).toEqual({
      show: ['n1', 'k1'],
      reveal: true,
      rest: 'hide',
      camera: { kind: 'place', anchor }
    })
    expect(stepState(steps, 2, false, new Set(['s2'])).camera).toBeNull()
  })

  it('stan kroku z powłoki przechodzi przez sprawdzenie, a śmieci odpadają', () => {
    const read = (value: unknown): ReturnType<typeof parsePresentState> => parsePresentState(value, (item) => parseAnchor(item))
    expect(read({ show: ['n1', 'n1', 3], reveal: 'tak', rest: 'mgła', camera: { kind: 'hold' }, pending: ['k1'] })).toEqual({
      show: ['n1'],
      reveal: false,
      rest: 'normal',
      camera: null,
      pending: ['k1']
    })
    expect(read({ show: [], rest: 'hide', camera: { kind: 'place', anchor }, pending: [] })?.camera).toEqual({ kind: 'place', anchor })
    expect(read('krok')).toBeNull()
  })

  it('nowy krok jest kopią poprzedniego, ale kamera stoi, a tytuł jest pusty', () => {
    const previous = { ...step('s1', { kind: 'place', anchor }), title: 'Wstęp', rest: 'dim' as const, show: ['n1'] }
    const next = nextStep(previous, 's2')
    expect(next).toEqual({ id: 's2', title: '', camera: { kind: 'hold' }, rest: 'dim', show: ['n1'] })
    next.show.push('n2')
    expect(previous.show).toEqual(['n1'])
    expect(nextStep(undefined, 's3').rest).toBe('normal')
  })

  it('przesuwa krok w granicach listy', () => {
    const steps = ['a', 'b', 'c'].map((id) => step(id))
    expect(moveStep(steps, 'a', 1).map(({ id }) => id)).toEqual(['b', 'a', 'c'])
    expect(moveStep(steps, 'c', -5).map(({ id }) => id)).toEqual(['c', 'a', 'b'])
    expect(moveStep(steps, 'c', 1).map(({ id }) => id)).toEqual(['a', 'b', 'c'])
    expect(moveStep(steps, 'brak', 1).map(({ id }) => id)).toEqual(['a', 'b', 'c'])
  })

  it('odrzuca zły krok, a resztę trasy zostawia', () => {
    const parsed = readPresentation({
      steps: [
        { id: 's1', title: 'Cel  ', camera: { kind: 'place', anchor }, rest: 'hide', show: ['n1', 'n1', 7] },
        { id: 's1', title: 'Powtórzony identyfikator' },
        { id: '../poza', title: 'Zły identyfikator' },
        { id: 's2', camera: { kind: 'area', anchor, box: { x: 0, y: 0, width: 0, height: 1 } } },
        { id: 's3', camera: { kind: 'place' } },
        { id: 's4', rest: 'mgła' },
        'tekst'
      ]
    })
    expect(parsed?.steps).toEqual([
      { id: 's1', title: 'Cel  ', camera: { kind: 'place', anchor }, rest: 'hide', show: ['n1'] },
      { id: 's4', title: '', camera: { kind: 'hold' }, rest: 'normal', show: [] }
    ])
    expect(readPresentation({ steps: 'nie lista' })).toBeNull()
    expect(readPresentation(null)).toBeNull()
  })

  it('poprawna trasa przechodzi przez sprawdzenie bez zmian', () => {
    const presentation = {
      steps: [
        { ...step('s1', { kind: 'area', anchor, box: { x: -0.1, y: 0.2, width: 1.2, height: 0.4 } }), title: 'Wykres ', show: ['n1'] },
        step('s2')
      ]
    }
    expect(readPresentation(JSON.parse(JSON.stringify(presentation)))).toEqual(presentation)
  })
})

describe('zapis trasy', () => {
  const folders: string[] = []
  const store = (): { store: PresentationStore; folder: string } => {
    const folder = mkdtempSync(join(tmpdir(), 'route-'))
    folders.push(folder)
    return { store: new PresentationStore(join(folder, 'library')), folder }
  }

  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  it('zapisuje trasę obok uwag i czyta ją z powrotem', async () => {
    const { store: routes, folder } = store()
    const presentation = { steps: [step('s1', { kind: 'place', anchor })] }
    await routes.write('dok', presentation)
    const file = join(folder, 'library', 'dok', 'presentation.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(presentation)
    expect(await routes.read('dok')).toEqual(presentation)
    // Otwarta apka dowiaduje się o zmianie z sygnału, także gdy pisał agent.
    expect(existsSync(join(folder, 'state', 'signals', 'presentation'))).toBe(true)
  })

  it('pusta trasa nie zostawia pliku, a brak pliku to pusta trasa', async () => {
    const { store: routes, folder } = store()
    await routes.write('dok', { steps: [step('s1')] })
    await routes.write('dok', { steps: [] })
    expect(existsSync(join(folder, 'library', 'dok', 'presentation.json'))).toBe(false)
    expect(await routes.read('dok')).toEqual({ steps: [] })
    expect(await routes.read('inny')).toEqual({ steps: [] })
  })

  it('uszkodzony plik to pusta trasa, a nie błąd formularza', async () => {
    const { store: routes, folder } = store()
    mkdirSync(join(folder, 'library', 'dok'), { recursive: true })
    writeFileSync(join(folder, 'library', 'dok', 'presentation.json'), '{ nie json')
    expect(await routes.read('dok')).toEqual({ steps: [] })
  })

  it('nie wychodzi poza bibliotekę', async () => {
    const { store: routes } = store()
    await expect(routes.write('../poza', { steps: [step('s1')] })).rejects.toThrow()
  })
})
