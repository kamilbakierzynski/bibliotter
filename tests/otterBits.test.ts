import { describe, expect, it } from 'vitest'
import { isOtterDay, versionName } from '../src/shared/otter'
import { parsePocket, POCKET_MAX, togglePocketId } from '../src/shared/pocket'

describe('Światowy Dzień Wydry', () => {
  it('wypada w ostatnią środę maja', () => {
    expect(isOtterDay(new Date(2026, 4, 27))).toBe(true)
    expect(isOtterDay(new Date(2027, 4, 26))).toBe(true)
    expect(isOtterDay(new Date(2028, 4, 31))).toBe(true)
  })

  it('nie wypada w inne środy ani w inne miesiące', () => {
    expect(isOtterDay(new Date(2027, 4, 19))).toBe(false)
    expect(isOtterDay(new Date(2027, 4, 27))).toBe(false)
    expect(isOtterDay(new Date(2026, 10, 25))).toBe(false)
  })
})

describe('nazwy wersji', () => {
  it('idą alfabetycznie po rodzajach wydr', () => {
    expect(versionName('0.1.0')).toBe('Aonyx')
    expect(versionName('0.5.3')).toBe('Lutra')
    expect(versionName('0.7.0')).toBe('Pteronura')
    expect(versionName('1.0.0')).toBe('Lutrinae')
  })

  it('poza listą nie ma nazwy', () => {
    expect(versionName('0.8.0')).toBeNull()
    expect(versionName('0.0.1')).toBeNull()
    expect(versionName('2.0.0')).toBeNull()
    expect(versionName('dev')).toBeNull()
  })
})

describe('kieszeń', () => {
  it('wkłada i wyjmuje dokument', () => {
    const added = togglePocketId(['a'], 'b')
    expect(added).toEqual({ ids: ['a', 'b'], result: 'added' })
    expect(togglePocketId(added.ids, 'a')).toEqual({ ids: ['b'], result: 'removed' })
  })

  it('pełna kieszeń niczego nie wypycha', () => {
    const full = Array.from({ length: POCKET_MAX }, (_, i) => `d${i}`)
    expect(togglePocketId(full, 'nowy')).toEqual({ ids: full, result: 'full' })
    expect(togglePocketId(full, 'd3').result).toBe('removed')
  })

  it('odczyt znosi zepsute dane, duplikaty i nadmiar', () => {
    expect(parsePocket(null)).toEqual([])
    expect(parsePocket('nie json')).toEqual([])
    expect(parsePocket('{"a":1}')).toEqual([])
    expect(parsePocket('["a", 3, "a", "b"]')).toEqual(['a', 'b'])
    expect(parsePocket(JSON.stringify(Array.from({ length: 12 }, (_, i) => `d${i}`)))).toHaveLength(POCKET_MAX)
  })
})
