import { describe, expect, it } from 'vitest'
import { ancestors, matchPath } from '../src/fileView/tree'
import { lineStats, parseStatus, sortTree } from '../src/main/fileSheets'
import { fileFragment, lineSuffix, parseFileFragment, treeFragment } from '../src/shared/fileView'

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

describe('drzewo plików', () => {
  it('czyta stan gita z porcelain -z, z nowymi folderami i zmianą nazwy', () => {
    const out = [' M src/app.ts', '?? notes/', 'A  new.ts', 'R  b.ts', 'a.ts', ' D gone.ts', ''].join('\0')
    const { marks, fresh } = parseStatus(out)
    expect(marks.get('src/app.ts')).toBe('M')
    expect(marks.get('notes')).toBe('U')
    expect(marks.get('new.ts')).toBe('A')
    expect(marks.get('b.ts')).toBe('R')
    expect(marks.has('a.ts')).toBe(false)
    expect(marks.get('gone.ts')).toBe('D')
    expect(fresh).toEqual(['notes/'])
  })

  it('układa foldery przed plikami i liczby po kolei', () => {
    const entry = (name: string, dir: boolean) => ({ name, rel: name, href: name, dir })
    const sorted = sortTree([entry('b.ts', false), entry('src', true), entry('a10.ts', false), entry('a2.ts', false), entry('.claude', true)])
    expect(sorted.map((item) => item.name)).toEqual(['.claude', 'src', 'a2.ts', 'a10.ts', 'b.ts'])
  })

  it('rozwija foldery do pliku albo do samego folderu', () => {
    expect(ancestors('src/main/x.ts', false)).toEqual(['', 'src', 'src/main'])
    expect(ancestors('src/main', true)).toEqual(['', 'src', 'src/main'])
    expect(ancestors(null, true)).toEqual([''])
  })

  it('filtr woli nazwę od ścieżki, a ścieżkę od liter po kolei', () => {
    const name = matchPath('src/main/fileSheets.ts', 'sheets')
    const path = matchPath('src/main/index.ts', 'main/')
    const letters = matchPath('src/main/fileSheets.ts', 'fsts')
    expect(name?.marks).toEqual([4, 5, 6, 7, 8, 9])
    expect(name && path && name.score < path.score).toBe(true)
    expect(path && letters && path.score < letters.score).toBe(true)
    expect(matchPath('src/app.ts', 'zz')).toBeNull()
  })

  it('kotwica pokazuje i chowa drzewo', () => {
    expect(treeFragment('tree')).toBe(true)
    expect(treeFragment('diff&notree')).toBe(false)
    expect(treeFragment('L4')).toBeNull()
    expect(fileFragment(null, { from: 4, to: 4 })).toBe('L4')
  })
})

describe('liczba wierszy nowego pliku', () => {
  it('nie liczy końcowego znaku nowej linii jako wiersza', () => {
    expect(lineStats('', 'def main():\n    return 42\n')).toEqual({ added: 2, removed: 0 })
  })
})
