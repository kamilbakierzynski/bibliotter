import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AnnotationStore, parseStrokes, toOverlayItems } from '../src/main/annotationStore'
import { chiselPath, decodeLine, encodeLine, lineOf, nearLine, textBands } from '../src/preload/markerStroke'
import { Trail } from '../src/preload/presenterTrail'

/** Pole figury z pierwszego czworokąta ścieżki. Znak mówi o kierunku obiegu. */
function signedAreas(path: string): number[] {
  return [...path.matchAll(/M([^Z]+)Z/g)].map(([, body]) => {
    const points = (body as string).split('L').map((pair) => pair.split(' ').map(Number) as [number, number])
    return points.reduce((sum, [x, y], i) => {
      const [nextX, nextY] = points[(i + 1) % points.length] as [number, number]
      return sum + x * nextY - nextX * y
    }, 0)
  })
}

describe('linia zakreślacza', () => {
  it('jest szeroka w poziomie i węższa w pionie, jak ścięta końcówka', () => {
    const wide = chiselPath([0, 0, 100, 0])
    const narrow = chiselPath([0, 0, 0, 100])
    const area = (path: string): number => Math.abs(signedAreas(path)[0] as number)
    expect(area(wide) / 100).toBeGreaterThan(area(narrow) / 100)
  })

  it('trzyma ten sam obieg, więc powrót po sobie nie wycina dziur', () => {
    const areas = signedAreas(chiselPath([0, 0, 50, 10, 0, 20, 30, -40, -20, 5]))
    expect(areas.length).toBe(4)
    expect(new Set(areas.map(Math.sign)).size).toBe(1)
  })

  it('rozpoznaje trafienie przy linii, także między punktami', () => {
    const line = [0, 0, 100, 0]
    expect(nearLine(line, 50, 6, 10)).toBe(true)
    expect(nearLine(line, 50, 40, 10)).toBe(false)
    expect(nearLine(line, 120, 0, 10)).toBe(false)
  })

  it('wraca z ułamków do pikseli przy innym rozmiarze elementu', () => {
    const stroke = encodeLine([100, 200, 300, 400], 100, 200, 400, 800)
    expect(stroke).toBe('0 0 0.5 0.25')
    expect(decodeLine(stroke, 200, 1000)).toEqual([0, 0, 100, 250])
  })
})

describe('zakreślenie po przelaniu tekstu', () => {
  it('składa prostokąty jednego wiersza w jedno pociągnięcie', () => {
    const bands = textBands([
      { left: 10, right: 60, top: 0, bottom: 20 },
      { left: 60, right: 120, top: 2, bottom: 18 },
      { left: 10, right: 80, top: 24, bottom: 44 }
    ])
    expect(bands).toEqual([
      [10, 10, 120, 10],
      [10, 34, 80, 34]
    ])
  })

  it('pomija puste prostokąty na końcach wierszy', () => {
    expect(textBands([{ left: 40, right: 40, top: 0, bottom: 20 }])).toEqual([])
  })
})

describe('wygładzanie', () => {
  /** Poziomy ruch ręką z drżeniem o 3 px, co 8 ms jak mysz. */
  const shaky = (): Trail => {
    const trail = new Trail(0, 0, 0)
    for (let i = 1; i <= 80; i++) trail.add(i * 6, i % 2 === 0 ? 3 : -3, i * 8)
    trail.finish()
    return trail
  }

  it('ściera drżenie ręki z linii zakreślacza', () => {
    const line = lineOf(shaky())
    const inside = line.filter((_, i) => i % 2 === 1).slice(10, -10)
    expect(Math.max(...inside.map(Math.abs))).toBeLessThan(1)
  })

  it('kończy linię pod końcówką', () => {
    expect(lineOf(shaky()).slice(-2)[0]).toBe(480)
  })

  it('zostawia ostry zakręt ostrym', () => {
    const trail = new Trail(0, 0, 0)
    for (let i = 1; i <= 30; i++) trail.add(i * 6, 0, i * 8)
    for (let i = 1; i <= 30; i++) trail.add(180 - i * 6, 40, (30 + i) * 8)
    trail.finish()
    expect(Math.max(...lineOf(trail).filter((_, i) => i % 2 === 0))).toBeGreaterThan(150)
  })
})

describe('zapis zakreślenia', () => {
  const folders: string[] = []
  const anchor = { selector: 'p', offsetX: 0.5, offsetY: 0.5, quote: 'Zakreślony tekst', heading: null }
  const store = (): AnnotationStore => {
    const folder = mkdtempSync(join(tmpdir(), 'marker-'))
    folders.push(folder)
    return new AnnotationStore(folder)
  }

  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  it('powstaje bez tekstu i zachowuje kolor', async () => {
    const annotations = store()
    const item = await annotations.create('dok', 'sha', {
      kind: 'highlight',
      audience: 'me',
      color: 'green',
      anchor,
      text: '',
      strokes: ['0.1 0.2 0.3 0.4']
    })
    expect(item.messages).toEqual([])
    expect(item.color).toBe('green')
    expect((await annotations.listForDoc('dok'))[0]?.strokes).toEqual(['0.1 0.2 0.3 0.4'])
  })

  it('zostawia czytelny plik, po jednym wierszu na linię', async () => {
    const annotations = store()
    const folder = folders.at(-1) as string
    await annotations.create('dok', 'sha', {
      kind: 'highlight',
      audience: 'me',
      color: 'yellow',
      anchor,
      text: '',
      strokes: ['0.1 0.2 0.3 0.4', '0.5 0.6 0.7 0.8']
    })
    const [file] = readdirSync(join(folder, 'dok', 'annotations'))
    const lines = readFileSync(join(folder, 'dok', 'annotations', file as string), 'utf8').split('\n')
    expect(lines.filter((line) => /^\s*"0\.\d/.test(line))).toHaveLength(2)
  })

  it('trafia do dokumentu razem z liniami i dopisaną notatką', async () => {
    const annotations = store()
    const item = await annotations.create('dok', 'sha', {
      kind: 'highlight',
      audience: 'me',
      color: 'pink',
      anchor,
      text: '',
      strokes: ['0.1 0.2 0.3 0.4']
    })
    expect(toOverlayItems([item])[0]).toMatchObject({ kind: 'highlight', label: '', strokes: ['0.1 0.2 0.3 0.4'] })
    const noted = await annotations.addMessage(item.id, 'user', 'Na spotkanie')
    expect(toOverlayItems([noted])[0]?.label).toBe('Na spotkanie')
  })

  it('odrzuca linie o złym kształcie', () => {
    expect(parseStrokes(['0.1 0.2 -0.3 1.4'])).toEqual(['0.1 0.2 -0.3 1.4'])
    expect(parseStrokes([])).toBeNull()
    expect(parseStrokes('0.1 0.2')).toBeNull()
    expect(parseStrokes(['0.1'])).toBeNull()
    expect(parseStrokes(['1 2 NaN 4'])).toBeNull()
    expect(parseStrokes(['0.1 0.2<script>'])).toBeNull()
    expect(parseStrokes(Array.from({ length: 65 }, () => '0 0 1 1'))).toBeNull()
  })
})
