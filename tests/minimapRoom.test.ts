import { describe, expect, it } from 'vitest'
import { contentAt, EMPTY_ROOM, parseColor, type Room } from '../src/preload/minimapRoom'

const room = (content: number[], extra: Partial<Room> = {}): Room => ({ decor: false, wide: false, content, ...extra })

describe('contentAt', () => {
  it('bez treści pod pasem minimapa zostaje', () => {
    expect(contentAt(EMPTY_ROOM, 0, 900)).toBe(false)
  })

  it('treść liczy się tylko wtedy, gdy jest w oknie', () => {
    const footer = room([15100, 15140])
    expect(contentAt(footer, 0, 900)).toBe(false)
    expect(contentAt(footer, 14300, 15200)).toBe(true)
    expect(contentAt(footer, 15140, 16000)).toBe(false)
  })

  it('znajduje właściwy przedział wśród wielu', () => {
    const images = room([1000, 1400, 3000, 3400, 6000, 6400])
    expect(contentAt(images, 1500, 2900)).toBe(false)
    expect(contentAt(images, 2900, 3100)).toBe(true)
    expect(contentAt(images, 3300, 4000)).toBe(true)
    expect(contentAt(images, 6400, 7000)).toBe(false)
    expect(contentAt(images, 0, 1001)).toBe(true)
  })

  it('strona przewijana w bok zawsze ma treść pod pasem', () => {
    expect(contentAt(room([], { wide: true }), 0, 100)).toBe(true)
  })
})

describe('parseColor', () => {
  it('czyta rgb i rgba w obu zapisach', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30, 1])
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 0.5])
    expect(parseColor('rgb(10 20 30 / 0.25)')).toEqual([10, 20, 30, 0.25])
    expect(parseColor('transparent')).toBeNull()
  })
})
