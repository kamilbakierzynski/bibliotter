import { describe, expect, it } from 'vitest'
import { footY, restingFoot, retreat, stickAngle } from '../src/preload/presenterRig'
import { Trail } from '../src/preload/presenterTrail'

const WIDTH = 1000
const HEIGHT = 800
const angleAt = (x: number, y: number): number => stickAngle(x, y, restingFoot(x, y, WIDTH, HEIGHT), HEIGHT)

describe('kijek wskaźnika', () => {
  it('kładzie palec do środka arkusza po obu stronach pionu', () => {
    expect(angleAt(100, 400)).toBeLessThan(0)
    expect(angleAt(980, 400)).toBeGreaterThan(0)
    expect(angleAt(720, 400)).toBeCloseTo(0)
  })

  it('nie przewraca się przy dolnej krawędzi', () => {
    const top = angleAt(100, 40)
    const bottom = angleAt(100, HEIGHT - 4)
    expect(Math.abs(bottom - top)).toBeLessThan(0.02)
    expect(Math.abs(bottom)).toBeLessThan(Math.PI / 4)
  })

  it('stoi pod arkuszem nawet w niskim oknie', () => {
    expect(footY(300)).toBeGreaterThan(300 + 500)
  })

  it('wycofuje rękę w całości pod dolną krawędź', () => {
    const y = 300
    const angle = angleAt(100, y)
    const below = y + Math.cos(angle) * retreat(y, HEIGHT, angle)
    expect(below).toBeGreaterThan(HEIGHT)
  })
})

/** Największa odległość obrysu od prostej poziomej w wybranym odcinku linii. */
const spread = (d: string, from: number, to: number): number => {
  const ribbon = d.slice(0, d.indexOf('Z'))
  const pairs = [...ribbon.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2])
  }))
  const inside = pairs.filter(({ x }) => x >= from && x <= to)
  return Math.max(...inside.map(({ y }) => Math.abs(y)))
}

const MOUSE_MS = 8

const straight = (step: number, length: number): Trail => {
  const trail = new Trail(0, 0, 0)
  for (let x = step; x <= length; x += step) trail.add(x, 0, (x / step) * MOUSE_MS)
  return trail
}

const finished = (trail: Trail): Trail => {
  trail.finish()
  return trail
}

/** Punkty środka linii. */
const centerPoints = (trail: Trail): { x: number; y: number }[] =>
  [...trail.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2])
  }))

describe('ślad palca', () => {
  it('prowadzi środek linii od naciśnięcia do miejsca puszczenia', () => {
    const trail = new Trail(0, 0, 0)
    trail.add(40, 0, 8)
    trail.add(40, 40, 16)
    trail.finish()
    expect(trail.d.startsWith('M0 0Q')).toBe(true)
    expect(trail.d.endsWith('L40 40')).toBe(true)
  })

  it('pomija drgnięcia myszy', () => {
    const trail = new Trail(0, 0, 0)
    trail.add(0.5, 0.5, 8)
    trail.finish()
    expect(trail.points).toBe(1)
  })

  it('wygasza drżenie ręki przy wolnym ruchu', () => {
    const trail = new Trail(0, 0, 0)
    for (let i = 1; i < 300; i++) trail.add(i * 1.6, i % 2 ? 2 : -2, i * MOUSE_MS)
    const calm = centerPoints(trail).filter(({ x }) => x > 60 && x < 420)
    expect(Math.max(...calm.map(({ y }) => Math.abs(y)))).toBeLessThan(0.7)
  })

  it('ściera schodki z pikseli', () => {
    const trail = new Trail(0, 0, 0)
    for (let i = 1; i < 300; i++) trail.add(i * 2, Math.round(i * 0.2), i * MOUSE_MS)
    const points = centerPoints(trail).filter(({ x }) => x > 60 && x < 540)
    const worst = Math.max(...points.map(({ x, y }) => Math.abs(y - x * 0.1)))
    expect(worst - Math.min(...points.map(({ x, y }) => Math.abs(y - x * 0.1)))).toBeLessThan(0.6)
  })

  it('nie zostawia fal przy drżącym ruchu', () => {
    let wobble = 7
    const shake = (): number => {
      wobble = (wobble * 16807) % 2147483647
      return (wobble / 2147483647 - 0.5) * 3
    }
    const trail = new Trail(0, 0, 0)
    for (let i = 1; i < 400; i++) trail.add(i * 2.2 + shake(), shake(), i * MOUSE_MS)
    trail.finish()
    const points = centerPoints(trail).filter(({ x }) => x > 80 && x < 760)
    const turning = points.slice(2).map((point, index) => {
      const a = points[index] ?? point
      const b = points[index + 1] ?? point
      return Math.abs(Math.atan2(point.y - b.y, point.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x))
    })
    const mean = turning.reduce((sum, turn) => sum + turn, 0) / turning.length
    expect(mean).toBeLessThan(0.03)
  })

  it('nie zgniata małego kółka', () => {
    const trail = new Trail(20, 0, 0)
    for (let i = 1; i < 250; i++) {
      const angle = i * MOUSE_MS * 0.01
      trail.add(Math.round(Math.cos(angle) * 20), Math.round(Math.sin(angle) * 20), i * MOUSE_MS)
    }
    trail.finish()
    const radii = centerPoints(trail).slice(40, -40).map(({ x, y }) => Math.hypot(x, y))
    const mean = radii.reduce((sum, radius) => sum + radius, 0) / radii.length
    expect(mean).toBeGreaterThan(20 * 0.85)
  })

  it('zachowuje kształt szybkiego łuku', () => {
    const trail = new Trail(100, 0, 0)
    for (let i = 1; i <= 60; i++) {
      const angle = i * 0.1
      trail.add(Math.cos(angle) * 100, Math.sin(angle) * 100, i * MOUSE_MS)
    }
    const radii = centerPoints(trail).map(({ x, y }) => Math.hypot(x, y))
    expect(Math.min(...radii)).toBeGreaterThan(93)
  })

  it('w trakcie rysowania sięga palca, choć stabilizacja zostaje z tyłu', () => {
    const trail = straight(12, 240)
    expect(trail.length).toBeLessThan(236)
    expect(Math.max(...centerPoints(trail).map(({ x }) => x))).toBe(240)
  })

  it('o układaniu linii decyduje ostatni stan, a nie pamięć poprzedniej klatki', () => {
    const trail = straight(4, 40)
    const before = trail.outline(1)
    trail.add(44, 0, 88)
    expect(trail.outline(1)).not.toBe(before)
  })

  it('zwęża początek, a koniec dopiero po puszczeniu', () => {
    const open = straight(4, 200)
    const done = finished(straight(4, 200))
    const middle = spread(done.outline(1), 96, 104)
    expect(spread(open.outline(1), 0, 2)).toBeLessThan(middle / 2)
    expect(spread(open.outline(1), 198, 200)).toBeGreaterThan(middle * 0.9)
    expect(spread(done.outline(1), 198, 200)).toBeLessThan(middle / 2)
  })

  it('cienieje przy szybkim ruchu', () => {
    const slow = spread(straight(3, 300).outline(1), 150, 170)
    const fast = spread(straight(30, 3000).outline(1), 1500, 1700)
    expect(fast).toBeLessThan(slow * 0.75)
  })

  it('o grubości decyduje prędkość, a nie częstotliwość myszy', () => {
    const rare = new Trail(0, 0, 0)
    const often = new Trail(0, 0, 0)
    for (let x = 8; x <= 800; x += 8) rare.add(x, 0, x)
    for (let x = 2; x <= 800; x += 2) often.add(x, 0, x)
    expect(spread(often.outline(1), 400, 420)).toBeCloseTo(spread(rare.outline(1), 400, 420), 0)
  })

  it('węższa warstwa mieści się w szerszej', () => {
    const trail = finished(straight(4, 200))
    expect(spread(trail.outline(0.24), 96, 104)).toBeLessThan(spread(trail.outline(1), 96, 104) / 3)
  })

  it('rysuje klin światła tylko przy palcu i rosnący ku niemu', () => {
    const comet = straight(4, 400).comet(1)
    expect(comet).not.toContain('Q300 ')
    expect(spread(comet, 335, 340)).toBeLessThan(spread(comet, 396, 400))
  })

  it('dzieli linię na zawrocie, żeby się tam nie zapadła', () => {
    const back = straight(4, 200)
    for (let x = 196; x >= 0; x -= 4) back.add(x, 10, 800 + (200 - x) * 2)
    const arcs = (trail: Trail): number => trail.outline(1).match(/a/g)?.length ?? 0
    expect(arcs(back)).toBeGreaterThan(arcs(straight(4, 200)))
  })

  it('nie dzieli linii na łagodnym łuku', () => {
    const arc = new Trail(100, 0, 0)
    for (let a = 0.05; a < 3; a += 0.05) arc.add(Math.cos(a) * 100, Math.sin(a) * 100, a * 1000)
    expect(arc.outline(1).match(/a/g)?.length).toBe(4)
  })
})
