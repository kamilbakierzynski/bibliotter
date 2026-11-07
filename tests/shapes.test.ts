import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AnnotationStore, parseShape, toOverlayItems } from '../src/main/annotationStore'
import { constrain, inkPath, nearInk, type Point, shapeStrokes } from '../src/preload/shapeInk'

const bounds = (points: Point[]): { left: number; top: number; right: number; bottom: number } => ({
  left: Math.min(...points.map((point) => point.x)),
  top: Math.min(...points.map((point) => point.y)),
  right: Math.max(...points.map((point) => point.x)),
  bottom: Math.max(...points.map((point) => point.y))
})

describe('tusz kształtów', () => {
  it('prostokąt i elipsa mieszczą się w przeciągnięciu, niezależnie od kierunku', () => {
    for (const type of ['rect', 'ellipse'] as const) {
      const [stroke] = shapeStrokes(type, { x: 200, y: 150 }, { x: 40, y: 30 })
      const box = bounds(stroke?.points ?? [])
      expect(box.left).toBeCloseTo(40, 0)
      expect(box.top).toBeCloseTo(30, 0)
      expect(box.right).toBeCloseTo(200, 0)
      expect(box.bottom).toBeCloseTo(150, 0)
    }
  })

  it('domyka prostokąt i elipsę kawałek za początkiem, jak ręką', () => {
    for (const type of ['rect', 'ellipse'] as const) {
      const [stroke] = shapeStrokes(type, { x: 0, y: 0 }, { x: 160, y: 100 })
      const points = stroke?.points ?? []
      const first = points[0] as Point
      const last = points.at(-1) as Point
      expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeGreaterThan(4)
      expect(stroke?.taperIn).toBeGreaterThan(0)
      expect(stroke?.taperOut).toBeGreaterThan(0)
    }
  })

  it('strzałka ma łuk i dwa pociągnięcia grotu przy końcu', () => {
    const to = { x: 300, y: 100 }
    const strokes = shapeStrokes('arrow', { x: 0, y: 100 }, to)
    expect(strokes).toHaveLength(3)
    const shaft = strokes[0]?.points ?? []
    // Łuk odchodzi od prostej, ale nie dalej niż o kilkanaście pikseli.
    const sag = Math.max(...shaft.map((point) => Math.abs(point.y - 100)))
    expect(sag).toBeGreaterThan(1)
    expect(sag).toBeLessThanOrEqual(14)
    for (const barb of strokes.slice(1)) {
      const tip = barb.points[0] as Point
      const outer = barb.points.at(-1) as Point
      expect(Math.hypot(tip.x - to.x, tip.y - to.y)).toBeLessThan(0.01)
      // Grot wraca w stronę początku strzałki.
      expect(outer.x).toBeLessThan(to.x)
    }
    const [up, down] = strokes.slice(1).map((barb) => (barb.points.at(-1) as Point).y)
    expect(Math.sign((up as number) - 100)).not.toBe(Math.sign((down as number) - 100))
  })

  it('pomija kształt mniejszy niż kliknięcie', () => {
    expect(shapeStrokes('rect', { x: 0, y: 0 }, { x: 5, y: 80 })).toEqual([])
    expect(shapeStrokes('ellipse', { x: 0, y: 0 }, { x: 80, y: 3 })).toEqual([])
    expect(shapeStrokes('line', { x: 0, y: 0 }, { x: 6, y: 6 })).toEqual([])
    expect(shapeStrokes('arrow', { x: 0, y: 0 }, { x: 40, y: 0 })).toHaveLength(3)
  })

  it('rysuje wypełnioną wstęgę ze skończonymi liczbami', () => {
    for (const type of ['arrow', 'rect', 'ellipse', 'line'] as const) {
      const path = inkPath(shapeStrokes(type, { x: 10, y: 20 }, { x: 180, y: 120 }))
      expect(path.startsWith('M')).toBe(true)
      expect(path).not.toMatch(/NaN|Infinity/)
    }
  })

  it('gumka trafia przy linii, a nie w środku prostokąta', () => {
    const strokes = shapeStrokes('rect', { x: 0, y: 0 }, { x: 200, y: 100 })
    expect(nearInk(strokes, 100, 3, 10)).toBe(true)
    expect(nearInk(strokes, 197, 50, 10)).toBe(true)
    expect(nearInk(strokes, 100, 50, 10)).toBe(false)
  })

  it('Shift robi kwadrat i koło, a linię przyciąga do 15 stopni', () => {
    expect(constrain('rect', { x: 10, y: 10 }, { x: 90, y: 40 })).toEqual({ x: 90, y: 90 })
    expect(constrain('ellipse', { x: 10, y: 10 }, { x: -20, y: 60 })).toEqual({ x: -40, y: 60 })
    const snapped = constrain('line', { x: 0, y: 0 }, { x: 100, y: 7 })
    expect(snapped.y).toBeCloseTo(0, 6)
    expect(snapped.x).toBeCloseTo(Math.hypot(100, 7), 6)
    const diagonal = constrain('arrow', { x: 0, y: 0 }, { x: 100, y: 90 })
    expect(Math.atan2(diagonal.y, diagonal.x)).toBeCloseTo(Math.PI / 4, 6)
  })
})

describe('zapis kształtu', () => {
  const folders: string[] = []
  const anchor = { selector: 'p', offsetX: 0.5, offsetY: 0.5, quote: 'Akapit', heading: null }
  const store = (): AnnotationStore => {
    const folder = mkdtempSync(join(tmpdir(), 'shapes-'))
    folders.push(folder)
    return new AnnotationStore(folder)
  }

  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  it('przyjmuje tylko poprawną geometrię', () => {
    expect(parseShape({ type: 'rect', box: { x: -0.2, y: 0.1, width: 1.4, height: 0.5 } })).toEqual({
      type: 'rect',
      box: { x: -0.2, y: 0.1, width: 1.4, height: 0.5 }
    })
    expect(parseShape({ type: 'arrow', end: anchor })).toEqual({ type: 'arrow', end: anchor })
    expect(parseShape({ type: 'rect', box: { x: 0, y: 0, width: 0, height: 1 } })).toBeNull()
    expect(parseShape({ type: 'ellipse', box: { x: 0, y: 0, width: 'szeroko', height: 1 } })).toBeNull()
    expect(parseShape({ type: 'rect', box: { x: 1e9, y: 0, width: 1, height: 1 } })).toBeNull()
    expect(parseShape({ type: 'line' })).toBeNull()
    expect(parseShape({ type: 'star', box: { x: 0, y: 0, width: 1, height: 1 } })).toBeNull()
    expect(parseShape(null)).toBeNull()
  })

  it('powstaje bez wiadomości i trafia do dokumentu razem z geometrią', async () => {
    const annotations = store()
    const shape = { type: 'ellipse', box: { x: 0.1, y: -0.5, width: 0.8, height: 2 } } as const
    const item = await annotations.create('dok', 'sha', {
      kind: 'shape',
      audience: 'me',
      color: 'blue',
      anchor,
      text: '',
      shape
    })
    expect(item.messages).toEqual([])
    expect((await annotations.listForDoc('dok'))[0]?.shape).toEqual(shape)
    expect(toOverlayItems([item])[0]).toMatchObject({ kind: 'shape', color: 'blue', label: '', shape })
  })

  it('odmawia kształtu bez geometrii', async () => {
    await expect(
      store().create('dok', 'sha', { kind: 'shape', audience: 'me', color: 'blue', anchor, text: '' })
    ).rejects.toThrow()
  })
})
