import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { blockedLabel, relativeTime } from '../src/renderer/src/tree'
import { parseConfig } from '../src/main/config'
import { EN, EN_PLURALS } from '../src/shared/en'
import { DEFAULT_LANGUAGE, isLanguage, language, locale, plural, setLanguage, t } from '../src/shared/i18n'

const root = resolve(__dirname, '..')
const source = (path: string): string => readFileSync(join(root, path), 'utf8')

function filesIn(folder: string): string[] {
  return readdirSync(join(root, folder)).flatMap((name) => {
    const path = `${folder}/${name}`
    return statSync(join(root, path)).isDirectory() ? filesIn(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

const LITERAL = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`
const WRAPPED = new RegExp(String.raw`(?<![\w.])t\(\s*(${LITERAL})`, 'g')
const PLURAL = new RegExp(String.raw`\bplural\(\s*[^,]+,\s*(${LITERAL})`, 'g')

const unquote = (literal: string): string => literal.slice(1, -1)

describe('tłumaczenie', () => {
  afterEach(() => setLanguage(DEFAULT_LANGUAGE))

  it('po polsku zwraca tekst z kodu, a po angielsku jego tłumaczenie', () => {
    expect(t('Motyw')).toBe('Motyw')
    setLanguage('en')
    expect(language()).toBe('en')
    expect(t('Motyw')).toBe('Theme')
  })

  it('tekst bez tłumaczenia zostaje po polsku, a nie znika', () => {
    setLanguage('en')
    expect(t('Napis, którego nie ma w słowniku')).toBe('Napis, którego nie ma w słowniku')
  })

  it('wstawia wartości, także przed tłumaczeniem i po nim', () => {
    expect(t('Usuń {name}', { name: 'a.pl' })).toBe('Usuń a.pl')
    setLanguage('en')
    expect(t('Usuń {name}', { name: 'a.pl' })).toBe('Remove a.pl')
    expect(t('{done} z {total}', { done: 2, total: 5 })).toBe('2 of 5')
  })

  it('nazwa z klamrami przychodzi z danych i nie jest kolejnym miejscem do wypełnienia', () => {
    expect(t('Usuń {name}', { name: '{name}' })).toBe('Usuń {name}')
  })

  it('polskie formy liczby działają jak dotąd', () => {
    const forms = (n: number): string => plural(n, 'dokument', 'dokumenty', 'dokumentów')
    expect([1, 2, 5, 12, 22, 25].map(forms)).toEqual([
      'dokument',
      'dokumenty',
      'dokumentów',
      'dokumentów',
      'dokumenty',
      'dokumentów'
    ])
  })

  it('angielski ma dwie formy liczby, a zero to liczba mnoga', () => {
    setLanguage('en')
    const forms = (n: number): string => plural(n, 'dokument', 'dokumenty', 'dokumentów')
    expect([0, 1, 2, 22].map(forms)).toEqual(['documents', 'document', 'documents', 'documents'])
  })

  it('czas i liczba zablokowanych żądań idą za językiem', () => {
    const now = Date.UTC(2026, 10, 6, 12)
    const ago = (minutes: number): number => now - minutes * 60_000
    expect(relativeTime(ago(5), now)).toBe('5 min temu')
    expect(blockedLabel(22)).toBe('Zablokowano 22 żądania')
    setLanguage('en')
    expect(relativeTime(ago(0), now)).toBe('just now')
    expect(relativeTime(ago(5), now)).toBe('5 min ago')
    expect(relativeTime(ago(60 * 24), now)).toBe('yesterday')
    expect(relativeTime(ago(60 * 24 * 3), now)).toBe('3 days ago')
    expect(relativeTime(Date.UTC(2026, 0, 31), now)).toBe('31/01/2026')
    expect(blockedLabel(1)).toBe('Blocked 1 request')
    expect(blockedLabel(22)).toBe('Blocked 22 requests')
  })

  it('angielski ma własny zapis dat', () => {
    expect(locale()).toBe('pl-PL')
    setLanguage('en')
    expect(locale()).toBe('en-GB')
  })
})

describe('ustawienie języka', () => {
  it('brak wpisu i nieznany język to polski', () => {
    expect(parseConfig('{}').language).toBe('pl')
    expect(parseConfig('{"language":"de"}').language).toBe('pl')
    expect(parseConfig('{"language":7}').language).toBe('pl')
  })

  it('zapamiętany język wraca z konfiguracji', () => {
    expect(parseConfig('{"language":"en"}').language).toBe('en')
  })

  it('rozpoznaje tylko obsługiwane języki', () => {
    expect(isLanguage('pl')).toBe(true)
    expect(isLanguage('en')).toBe(true)
    expect(isLanguage('de')).toBe(false)
    expect(isLanguage(null)).toBe(false)
  })
})

describe('słownik', () => {
  const code = [...filesIn('src/renderer/src'), ...filesIn('src/preload'), ...filesIn('src/main')]
    .filter((path) => !path.endsWith('.d.ts'))
    .map(source)

  it('każdy napis w t(...) ma tłumaczenie', () => {
    const used = code.flatMap((text) => [...text.matchAll(WRAPPED)].map((match) => unquote(match[1] as string)))
    expect(used.length).toBeGreaterThan(300)
    expect([...new Set(used)].filter((text) => EN[text] === undefined)).toEqual([])
  })

  it('każde wywołanie plural ma angielskie formy', () => {
    const used = code.flatMap((text) => [...text.matchAll(PLURAL)].map((match) => unquote(match[1] as string)))
    expect(used.length).toBeGreaterThan(5)
    expect([...new Set(used)].filter((one) => EN_PLURALS[one] === undefined)).toEqual([])
  })

  it('tłumaczenie ma te same miejsca na wartości co oryginał', () => {
    const holes = (text: string): string[] => [...text.matchAll(/\{\w+\}/g)].map(([hole]) => hole).sort()
    const wrong = Object.entries(EN).filter(([polish, english]) => holes(polish).join() !== holes(english).join())
    expect(wrong).toEqual([])
  })

  it('w tłumaczeniach nie zostało nic po polsku', () => {
    expect(Object.values(EN).filter((english) => /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(english))).toEqual([])
  })

  it('powody z panelu Niepewne mają tłumaczenia', () => {
    const reasons = [...source('src/main/classify.ts').matchAll(/\breview\('([^']+)'\)/g)].map((match) => match[1] as string)
    expect(reasons.length).toBeGreaterThan(0)
    expect([...reasons, 'Twoja decyzja', 'Oryginał zniknął'].filter((text) => EN[text] === undefined)).toEqual([])
  })

  it('kroki cofania uwag mają tłumaczenia', () => {
    const history = source('src/main/annotationHistory.ts')
    const nouns = [...history.matchAll(/^ {2}\w+: '([^']+)'/gm)].map((match) => match[1] as string)
    const steps = [...history.matchAll(/this\.record\([^,]+, '([^']+)'/g)].map((match) => match[1] as string)
    const verbs = [...history.matchAll(/this\.move\(docId, '\w+', '([^']+)'\)/g)].map((match) => match[1] as string)
    expect(nouns).toHaveLength(4)
    expect(steps.length).toBeGreaterThan(0)
    expect(verbs).toHaveLength(2)
    const labels = [...nouns.flatMap((noun) => [`dodanie ${noun}`, `usunięcie ${noun}`]), ...steps, ...verbs]
    expect(labels.filter((text) => EN[text] === undefined)).toEqual([])
  })
})

/** Polskie znaki w napisie poza `t(...)` to prawie zawsze tekst, który po angielsku zostałby po polsku. */
describe('interfejs', () => {
  const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/
  /** Nie są tekstem interfejsu: mapa znaków do szukania, polskie nazwy filtrów i błędy programisty. */
  const ALLOWED = /^export const norm\b|^const DIA\b|^\s*names: \[|throw new Error\(/

  function bareTexts(path: string): string[] {
    const text = source(path)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(new RegExp(String.raw`\bt\(\s*(?:${LITERAL})`, 'g'), 't(')
      .replace(new RegExp(String.raw`\bplural\([^)]*\)`, 'g'), 'plural()')
    return text
      .split('\n')
      .filter((line) => !ALLOWED.test(line))
      .flatMap((line) => {
        const literals = [...line.matchAll(/'[^']*'|"[^"]*"|`[^`]*`|>[^<>{}]+</g)].map(([match]) => match)
        return literals.filter((literal) => POLISH.test(literal)).map((literal) => `${path}: ${literal}`)
      })
  }

  const files = filesIn('src/renderer/src').filter((path) => /\/(ui|shell)\/|tree\.ts$/.test(path))

  it('napisy z polskimi znakami idą przez t(...)', () => {
    expect(files.flatMap(bareTexts)).toEqual([])
  })

  /** Słowo bez polskich znaków też bywa napisem, a w obu językach brzmią tak samo tylko te. */
  it('goły tekst w JSX idzie przez t(...)', () => {
    const SAME = new Set(['Branch', 'Format', 'Status', 'Agent', 'Auto'])
    const bare = files
      .filter((path) => path.endsWith('.tsx'))
      .flatMap((path) => {
        const words = [...source(path).matchAll(/(?:>|^[ \t]+)([A-Z][a-z]+)(?=<| <)/gm)].map((match) => match[1] as string)
        return words.filter((word) => !SAME.has(word)).map((word) => `${path}: ${word}`)
      })
    expect(bare).toEqual([])
  })
})

/** CLI i MCP czyta agent, a działają poza apką, więc ich tekst jest zawsze angielski, niezależnie od ustawienia języka. */
describe('teksty dla agenta', () => {
  const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/
  const FILES = [
    'src/main/agentCli.ts',
    'src/main/mcpServer.ts',
    'src/main/agentApi.ts',
    'src/main/mcp.ts',
    'src/main/annotationStore.ts',
    'src/main/labelStore.ts'
  ]

  it('nie mają polskich znaków ani nie idą przez t(...)', () => {
    const wrong = FILES.flatMap((path) => {
      const text = source(path)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      const literals = [...text.matchAll(/'[^'\n]*'|`[^`]*`/g)].map(([match]) => match)
      return [...literals.filter((literal) => POLISH.test(literal)), ...(/\bt\(\s*['"`]/.test(text) ? ['t()'] : [])].map(
        (found) => `${path}: ${found}`
      )
    })
    expect(wrong).toEqual([])
  })

  it('opisy pluginu też są po angielsku', () => {
    const manifests = ['plugin/.claude-plugin/marketplace.json', 'plugin/bibliotter/.claude-plugin/plugin.json']
    expect(manifests.filter((path) => POLISH.test(source(path)))).toEqual([])
  })
})
