import { describe, expect, it } from 'vitest'
import { lineStats } from '../src/main/fileSheets'
import { fileFragment, lineSuffix, parseFileFragment } from '../src/shared/fileView'

describe('kotwica arkusza pliku', () => {
  it('czyta wiersze jak GitHub i tryb zmian', () => {
    expect(parseFileFragment('L12')).toEqual({ mode: null, lines: { from: 12, to: 12 } })
    expect(parseFileFragment('L20-L12')).toEqual({ mode: null, lines: { from: 12, to: 20 } })
    expect(parseFileFragment('diff&L3-5')).toEqual({ mode: 'diff', lines: { from: 3, to: 5 } })
    expect(parseFileFragment('naglowek')).toEqual({ mode: null, lines: null })
    expect(parseFileFragment('L0')).toEqual({ mode: null, lines: null })
  })

  it('bierze wiersze z końca ścieżki, jak w wyjściu kompilatora', () => {
    expect(lineSuffix('src/app.ts:12')).toEqual({ from: 12, to: 12 })
    expect(lineSuffix('src/app.ts:12-20#x')).toEqual({ from: 12, to: 20 })
    expect(lineSuffix('src/app.ts')).toBeNull()
  })

  it('składa kotwicę z powrotem', () => {
    expect(fileFragment('file', { from: 4, to: 4 })).toBe('file&L4')
    expect(fileFragment('diff', { from: 4, to: 9 })).toBe('diff&L4-L9')
    expect(fileFragment('file', null)).toBe('file')
  })
})

describe('liczba zmienionych wierszy', () => {
  it('liczy jak git diff --stat', () => {
    expect(lineStats('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual({ added: 2, removed: 1 })
    expect(lineStats('', 'x\ny')).toEqual({ added: 2, removed: 0 })
    expect(lineStats('x\ny', 'x\ny')).toEqual({ added: 0, removed: 0 })
  })
})
