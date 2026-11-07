import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexedTexts, SearchIndex } from '../src/main/searchIndex'
import { locateEnd, locateStart, TextBuilder } from '../src/preload/findText'
import { normalizeText } from '../src/shared/textNormalize'
import {
  closestSpan,
  createMatcher,
  MAX_MATCHES,
  parseFindCommand,
  scanDocument,
  snippetAt,
  type TextQuery
} from '../src/shared/textSearch'

const query = (text: string, options: Partial<TextQuery> = {}): TextQuery => ({
  text,
  matchCase: false,
  wholeWord: false,
  regex: false,
  ...options
})

/** Trafienia tak, jak zobaczy je użytkownik, czyli jako fragmenty oryginału. */
function matches(text: string, phrase: string, options?: Partial<TextQuery>): string[] {
  const matcher = createMatcher(query(phrase, options))
  if (!matcher) return []
  return matcher.find(matcher.folded ? normalizeText(text) : text).map(({ start, end }) => text.slice(start, end))
}

describe('dopasowanie frazy', () => {
  it('pomija wielkość liter i polskie znaki, a pokazuje oryginał', () => {
    expect(matches('Łąka, ŁĄKA i laka', 'laka')).toEqual(['Łąka', 'ŁĄKA', 'laka'])
    expect(matches('Zażółć gęślą jaźń', 'GĘŚLĄ')).toEqual(['gęślą'])
  })

  it('z wielkością liter szuka dokładnie tego, co wpisano', () => {
    expect(matches('Łąka łąka laka', 'łąka', { matchCase: true })).toEqual(['łąka'])
  })

  it('całe słowa nie pasują w środku innego słowa, także polskiego', () => {
    expect(matches('dom domek podomka dom.', 'dom', { wholeWord: true })).toEqual(['dom', 'dom'])
    expect(matches('kąt kątem', 'kat', { wholeWord: true })).toEqual(['kąt'])
  })

  it('fraza z kropką na początku działa z całymi słowami', () => {
    expect(matches('plik.ts i .ts', '.ts', { wholeWord: true })).toEqual(['.ts', '.ts'])
  })

  it('kolejne trafienia się nie nakładają', () => {
    expect(matches('aaaa', 'aa')).toEqual(['aa', 'aa'])
  })

  it('fraza wklejona z kilku linii ma zwinięte białe znaki', () => {
    expect(matches('jedna linia dalej', 'jedna\n   linia')).toEqual(['jedna linia'])
  })

  it('puste zapytanie niczego nie znajduje', () => {
    expect(createMatcher(query('   '))).toBeNull()
  })

  it('zatrzymuje się na limicie', () => {
    const text = 'a '.repeat(MAX_MATCHES + 10)
    expect(createMatcher(query('a'))?.find(normalizeText(text))).toHaveLength(MAX_MATCHES)
  })
})

describe('wyrażenie regularne', () => {
  it('działa na oryginale i bez wielkości liter', () => {
    expect(matches('Faktura FV-12 i fv-7', 'fv-\\d+', { regex: true })).toEqual(['FV-12', 'fv-7'])
  })

  it('zna polskie litery', () => {
    expect(matches('żółć kot', '\\p{L}+ć', { regex: true })).toEqual(['żółć'])
  })

  it('łączy się z całymi słowami', () => {
    expect(matches('kotek kot', 'ko.', { regex: true, wholeWord: true })).toEqual(['kot'])
  })

  it('przyjmuje ucieczki, których nie zna tryb `u`', () => {
    expect(matches('a-b', 'a\\-b', { regex: true })).toEqual(['a-b'])
  })

  it('puste dopasowanie nie zatrzymuje szukania', () => {
    expect(matches('baab', 'a*', { regex: true })).toEqual(['aa'])
  })

  it('niepoprawne wyrażenie zgłasza błąd zamiast cicho nic nie znaleźć', () => {
    expect(() => createMatcher(query('(', { regex: true }))).toThrow(SyntaxError)
  })
})

describe('trafienia w dokumencie', () => {
  it('liczy wszystkie, a pokazuje tylko pierwsze', () => {
    const text = 'kot i kot i kot'
    const matcher = createMatcher(query('KOT'))
    if (!matcher) throw new Error('brak zapytania')
    const doc = scanDocument({ docId: 'a', source: normalizeText(text), text: () => text }, matcher, 2)
    expect(doc?.count).toBe(3)
    expect(doc?.hits).toHaveLength(2)
    expect(doc?.hits[1]).toEqual({ before: 'kot i ', match: 'kot', after: ' i kot' })
  })

  it('dokument bez trafień nie trafia do wyników', () => {
    const matcher = createMatcher(query('pies'))
    if (!matcher) throw new Error('brak zapytania')
    const original = (): string => {
      throw new Error('oryginał nie był potrzebny')
    }
    expect(scanDocument({ docId: 'a', source: 'kot', text: original }, matcher, 2)).toBeNull()
  })

  it('wybiera trafienie po otoczeniu, a nie po numerze', () => {
    const text = 'pierwszy kot śpi. drugi kot biega. trzeci kot je.'
    const matcher = createMatcher(query('kot'))
    const spans = matcher?.find(normalizeText(text)) ?? []
    expect(closestSpan(text, spans, { before: 'drugi ', match: 'kot', after: ' biega' })).toBe(1)
  })

  it('otoczenie z indeksu ma spacje po tagach, a strona ich nie ma', () => {
    const page = 'nagłówek akapit kot koniec'
    const spans = createMatcher(query('kot'))?.find(page) ?? []
    expect(closestSpan(page, spans, { before: 'nagłó wek a kapit ', match: 'kot', after: ' ko niec' })).toBe(0)
  })

  it('fragment wycina oryginał wokół trafienia', () => {
    expect(snippetAt('abcdefgh', { start: 3, end: 5 }, 2)).toEqual({ before: 'bc', match: 'de', after: 'fg' })
  })
})

describe('tekst strony', () => {
  const build = (fill: (builder: TextBuilder<string>) => void): ReturnType<TextBuilder<string>['finish']> => {
    const builder = new TextBuilder<string>()
    fill(builder)
    return builder.finish()
  }

  it('zwija białe znaki także na granicy węzłów', () => {
    const { text } = build((b) => {
      b.add('a', '  jeden\n   ')
      b.add('b', ' dwa  ')
    })
    expect(text).toBe('jeden dwa ')
  })

  it('granica bloku daje spację, a tekst w jednym bloku idzie razem', () => {
    const { text } = build((b) => {
      b.add('a', 'po')
      b.add('b', 'dział')
      b.gap()
      b.add('c', 'dalej')
    })
    expect(text).toBe('podział dalej')
  })

  it('pozycje wracają do właściwych węzłów', () => {
    const { text, runs } = build((b) => {
      b.add('a', '  ab  cd')
      b.add('b', 'ef')
    })
    expect(text).toBe('ab cdef')
    expect(locateStart(runs, text.indexOf('d'))).toEqual({ node: 'a', offset: 7 })
    expect(locateEnd(runs, text.indexOf('d') + 1)).toEqual({ node: 'a', offset: 8 })
    expect(locateStart(runs, text.indexOf('f'))).toEqual({ node: 'b', offset: 1 })
  })

  it('początek trafienia na granicy bloku przechodzi do następnego węzła', () => {
    const { runs } = build((b) => {
      b.add('a', 'ab')
      b.gap()
      b.add('b', 'cd')
    })
    expect(locateStart(runs, 2)).toEqual({ node: 'b', offset: 0 })
    expect(locateEnd(runs, 3)).toEqual({ node: 'a', offset: 2 })
  })
})

describe('polecenia z powłoki', () => {
  it('przepuszcza tylko znany kształt', () => {
    expect(parseFindCommand({ type: 'step', forward: true })).toEqual({ type: 'step', forward: true })
    expect(parseFindCommand({ type: 'set', query: { text: 'a' } })).toEqual({ type: 'set', query: query('a') })
    expect(parseFindCommand({ type: 'set', query: { text: 1 } })).toBeNull()
    expect(parseFindCommand({ type: 'inne' })).toBeNull()
    expect(parseFindCommand(null)).toBeNull()
  })
})

describe('zapytanie wątku szukania', () => {
  it('czyta tekst i jego znormalizowaną wersję z indeksu biblioteki', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bibliotter-search-'))
    const path = join(dir, 'index.sqlite')
    try {
      const index = new SearchIndex(path)
      index.putDocText({ docId: 'a', sha: '1', title: 'Tytuł', path: 'projekt', text: 'Łąka w ogrodzie' })
      index.close()

      const db = new DatabaseSync(path, { readOnly: true })
      const read = (folded: boolean): string[][] =>
        [...indexedTexts(db, folded)].map(({ docId, source, text }) => [docId, source, text()])
      expect(read(true)).toEqual([['a', 'laka w ogrodzie', 'Łąka w ogrodzie']])
      expect(read(false)).toEqual([['a', 'Łąka w ogrodzie', 'Łąka w ogrodzie']])
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
