import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentApi } from '../src/main/agentApi'
import { runCli, USAGE } from '../src/main/agentCli'
import { canDrawOtter, decodeRows, OTTER_FACTS, otterText, pickFact, renderPixels } from '../src/main/otter'
import { OTTER_ROWS } from '../src/main/otterArt'

type Color = string | null
interface Cell {
  char: string
  fg: Color
  bg: Color
}

/** Czyta linię tak jak terminal: śledzi kolor tekstu i tła z kodów SGR i zwraca komórki po wcięciu. */
function cells(line: string): Cell[] {
  expect(line.startsWith('  ')).toBe(true)
  let fg: Color = null
  let bg: Color = null
  const found: Cell[] = []
  for (const [, params, char] of line.slice(2).matchAll(/\x1b\[([\d;]*)m|(.)/gsu)) {
    if (char !== undefined) {
      found.push({ char, fg, bg })
      continue
    }
    const codes = (params ?? '').split(';')
    while (codes.length > 0) {
      const code = codes.shift()
      if (code === '' || code === '0') [fg, bg] = [null, null]
      else if (code === '39') fg = null
      else if (code === '49') bg = null
      else if (code === '38' || code === '48') {
        expect(codes.shift()).toBe('2')
        const rgb = codes.splice(0, 3).join(',')
        if (code === '38') fg = rgb
        else bg = rgb
      }
    }
  }
  return found
}

const pixels = decodeRows(OTTER_ROWS)
const art = renderPixels(pixels)

describe('bibliotter otter', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('nie występuje w pomocy', async () => {
    expect(USAGE).not.toMatch(/\botter\b/)
    expect(await runCli(['help'], {} as AgentApi)).not.toMatch(/\botter\b/)
  })

  it('bez terminala wypisuje sam fakt, bez rysunku i kodów ANSI', async () => {
    const env = {}
    const pipe = { isTTY: undefined, hasColors: () => true }
    expect(canDrawOtter(pipe, env)).toBe(false)
    expect(canDrawOtter({}, env)).toBe(false)
    expect(otterText({ draw: false, random: () => 0 })).toBe(
      'Otters juggle stones more often when they are hungry.\n— University of Exeter, 2020'
    )

    vi.stubEnv('NO_COLOR', '1')
    const output = await runCli(['otter'], {} as AgentApi)
    expect(OTTER_FACTS.map((fact) => `${fact.text}\n— ${fact.source}`)).toContain(output)
  })

  it('rysuje tylko w terminalu z pełnym kolorem i ustępuje przed NO_COLOR', () => {
    const terminal = { isTTY: true, hasColors: (count: number) => count <= 2 ** 24 }
    expect(canDrawOtter(terminal, {})).toBe(true)
    expect(canDrawOtter(terminal, { NO_COLOR: '1' })).toBe(false)
    expect(canDrawOtter({ isTTY: true, hasColors: (count: number) => count <= 256 }, {})).toBe(false)
  })

  it('wybiera fakt z losowości podanej z zewnątrz', () => {
    expect(pickFact(() => 0)).toBe(OTTER_FACTS[0])
    expect(pickFact(() => 0.999999)).toBe(OTTER_FACTS[OTTER_FACTS.length - 1])
    expect(pickFact(() => 1)).toBe(OTTER_FACTS[OTTER_FACTS.length - 1])
    expect(OTTER_FACTS.filter((fact) => /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(fact.text + fact.source))).toEqual([])
  })

  it('rysunek ma 16 linii po 32 komórki, reset na końcu linii i pustą linię pod spodem', () => {
    expect(pixels).toHaveLength(32)
    expect(pixels.every((row) => row.length === 32)).toBe(true)
    expect(art).toHaveLength(16)
    for (const line of art) {
      expect(cells(line)).toHaveLength(32)
      expect(line.endsWith('\x1b[0m')).toBe(true)
    }
    const output = otterText({ draw: true, random: () => 0 }).split('\n')
    expect(output.slice(0, 16)).toEqual(art)
    expect(output[16]).toBe('')
    expect(output[17]).toBe('  Otters juggle stones more often when they are hungry.')
  })

  it('przezroczyste rogi nie dostają koloru', () => {
    art.forEach((line, y) => {
      cells(line).forEach((cell, x) => {
        const top = pixels[2 * y]?.[x] ?? null
        const bottom = pixels[2 * y + 1]?.[x] ?? null
        if (!top && !bottom) expect(cell).toEqual({ char: ' ', fg: null, bg: null })
        else if (!top || !bottom) expect(cell.bg).toBeNull()
        else expect([cell.char, cell.fg, cell.bg]).toEqual(['▀', top.join(','), bottom.join(',')])
        if (!top && bottom) expect([cell.char, cell.fg]).toEqual(['▄', bottom.join(',')])
        if (top && !bottom) expect([cell.char, cell.fg]).toEqual(['▀', top.join(',')])
      })
    })
    const corners = [art[0], art[15]].flatMap((line) => {
      const row = cells(line as string)
      return [row[0], row[31]]
    })
    expect(corners).toEqual(Array(4).fill({ char: ' ', fg: null, bg: null }))
  })
})
