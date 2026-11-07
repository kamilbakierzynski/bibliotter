import { normalizeText } from './textNormalize'

/*
 * Jedno znaczenie „znaleziono” dla szukania w dokumencie i we wszystkich dokumentach. Domyślnie
 * wielkość liter i polskie znaki nie mają znaczenia, a przełączniki działają jak w VS Code.
 */

export interface TextQuery {
  text: string
  matchCase: boolean
  wholeWord: boolean
  regex: boolean
}

export interface TextSpan {
  start: number
  end: number
}

export interface TextSnippet {
  before: string
  match: string
  after: string
}

/** Tyle tekstu po każdej stronie trafienia pokazuje panel i tyle pomaga odnaleźć je w dokumencie. */
export const SNIPPET_REACH = 48
/** Dalej licznik mówi już tylko „co najmniej”, a dokument przestaje malować kolejne. */
export const MAX_MATCHES = 5000

export type SearchFailure = 'pattern' | 'slow' | 'index'

export interface ContentDoc {
  docId: string
  count: number
  hits: TextSnippet[]
}

export interface ContentSearch {
  docs: ContentDoc[]
  failure?: SearchFailure
}

export interface FindState {
  count: number
  /** Numer bieżącego trafienia od 1. Zero, gdy nie ma żadnego. */
  active: number
  /** Dokument ma więcej trafień, niż apka liczy. */
  capped: boolean
  failure: SearchFailure | null
}

export const NO_FIND: FindState = { count: 0, active: 0, capped: false, failure: null }

export type FindCommand =
  /**
   * `target` to konkretne trafienie z panelu. `center` stawia je na środku strony, nawet gdy już je
   * widać. Używa go tylko ukryte okno podglądu trafienia, więc powłoka go nie wysyła.
   */
  | { type: 'set'; query: TextQuery; target?: TextSnippet; center?: boolean }
  | { type: 'step'; forward: boolean }
  | { type: 'clear' }
  /** Prosi dokument o zaznaczony tekst, który staje się zapytaniem. */
  | { type: 'seed' }

const WORD_CHAR = /[\p{L}\p{N}_]/u
const isWord = (char: string | undefined): boolean => char !== undefined && WORD_CHAR.test(char)

/** Słowo kończy się tam, gdzie obok znaku słowa stoi coś innego. Fraza może zaczynać się od kropki. */
function standsAlone(source: string, { start, end }: TextSpan): boolean {
  const opens = !isWord(source[start]) || !isWord(source[start - 1])
  return opens && (!isWord(source[end - 1]) || !isWord(source[end]))
}

/** Bez flagi `u` wyrażenie przyjmuje też ucieczki w rodzaju `\-`, których `u` zabrania. */
function compilePattern({ text, matchCase, wholeWord }: TextQuery): RegExp {
  const flags = matchCase ? 'gm' : 'gim'
  const whole = (source: string, edge: [string, string]): string =>
    wholeWord ? `${edge[0]}(?:${source})${edge[1]}` : source
  try {
    return new RegExp(whole(text, ['(?<![\\p{L}\\p{N}_])', '(?![\\p{L}\\p{N}_])']), `${flags}u`)
  } catch {
    return new RegExp(whole(text, ['\\b', '\\b']), flags)
  }
}

function findPattern(pattern: RegExp, source: string, limit: number): TextSpan[] {
  const spans: TextSpan[] = []
  pattern.lastIndex = 0
  while (spans.length < limit) {
    const found = pattern.exec(source)
    if (!found) break
    // Puste dopasowanie, np. `a*`, nie ma czego pokazać, a stanęłoby w miejscu.
    if (found[0].length === 0) {
      pattern.lastIndex += 1
      continue
    }
    spans.push({ start: found.index, end: found.index + found[0].length })
  }
  return spans
}

function findLiteral(needle: string, wholeWord: boolean, source: string, limit: number): TextSpan[] {
  const spans: TextSpan[] = []
  let at = source.indexOf(needle)
  while (at >= 0 && spans.length < limit) {
    const span = { start: at, end: at + needle.length }
    const fits = !wholeWord || standsAlone(source, span)
    if (fits) spans.push(span)
    at = source.indexOf(needle, fits ? span.end : at + 1)
  }
  return spans
}

export interface TextMatcher {
  /** Szuka w tekście po `normalizeText`, który ma tę samą długość co oryginał. */
  folded: boolean
  find(source: string, limit?: number): TextSpan[]
}

export const needsPatternThread = (query: TextQuery): boolean => query.regex

/** `null` to puste zapytanie. Niepoprawne wyrażenie zgłasza `SyntaxError`. */
export function createMatcher(query: TextQuery): TextMatcher | null {
  if (!query.text.trim()) return null
  if (query.regex) {
    const pattern = compilePattern(query)
    return { folded: false, find: (source, limit = MAX_MATCHES) => findPattern(pattern, source, limit) }
  }
  // Tekst dokumentu ma zwinięte białe znaki, więc fraza wklejona z kilku linii też ma je zwinięte.
  const phrase = query.text.replace(/\s+/g, ' ')
  const needle = query.matchCase ? phrase : normalizeText(phrase)
  return {
    folded: !query.matchCase,
    find: (source, limit = MAX_MATCHES) => findLiteral(needle, query.wholeWord, source, limit)
  }
}

export function snippetAt(text: string, { start, end }: TextSpan, reach = SNIPPET_REACH): TextSnippet {
  return {
    before: text.slice(Math.max(0, start - reach), start),
    match: text.slice(start, end),
    after: text.slice(end, end + reach)
  }
}

export interface IndexedText {
  docId: string
  /** Tekst w postaci, której szuka `TextMatcher`. */
  source: string
  /** Oryginał do fragmentów. Większość dokumentów nie pasuje, więc czytamy go dopiero na żądanie. */
  text: () => string
}

/** Liczy wszystkie trafienia, ale zwraca tylko pierwsze `shown`, bo resztę pokazuje dokument. */
export function scanDocument({ docId, source, text }: IndexedText, matcher: TextMatcher, shown: number): ContentDoc | null {
  const spans = matcher.find(source)
  if (spans.length === 0) return null
  const original = text()
  return { docId, count: spans.length, hits: spans.slice(0, shown).map((span) => snippetAt(original, span)) }
}

const compact = (text: string): string => normalizeText(text).replace(/\s+/g, '')

function sharedStart(a: string, b: string): number {
  let length = 0
  while (length < a.length && a[length] === b[length]) length += 1
  return length
}

function sharedEnd(a: string, b: string): number {
  let length = 0
  while (length < a.length && a[a.length - 1 - length] === b[b.length - 1 - length]) length += 1
  return length
}

/**
 * Indeks i strona różnią się, bo strona ma tylko to, co widać. Numer trafienia mógłby więc wskazać
 * inne miejsce, a otoczenie zostaje to samo. Spacje nie liczą się, bo tagi dokładają je w indeksie.
 */
export function closestSpan(text: string, spans: TextSpan[], { before, after }: TextSnippet): number {
  const wanted = { before: compact(before), after: compact(after) }
  // Strona ma mniej spacji niż indeks, więc jej fragment bierzemy z zapasem.
  const reach = SNIPPET_REACH * 2
  let best = 0
  let bestScore = -1
  spans.forEach(({ start, end }, index) => {
    const score =
      sharedEnd(wanted.before, compact(text.slice(Math.max(0, start - reach), start))) +
      sharedStart(wanted.after, compact(text.slice(end, end + reach)))
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  })
  return best
}

/** Zapytanie przychodzi przez IPC, więc sprawdzamy jego kształt. */
export function parseTextQuery(value: unknown): TextQuery | null {
  if (typeof value !== 'object' || value === null) return null
  const { text, matchCase, wholeWord, regex } = value as Record<string, unknown>
  if (typeof text !== 'string') return null
  return { text, matchCase: matchCase === true, wholeWord: wholeWord === true, regex: regex === true }
}

function parseSnippet(value: unknown): TextSnippet | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { before, match, after } = value as Record<string, unknown>
  if (typeof before !== 'string' || typeof match !== 'string' || typeof after !== 'string') return undefined
  return { before, match, after }
}

export function parseFindCommand(value: unknown): FindCommand | null {
  if (typeof value !== 'object' || value === null) return null
  const command = value as Record<string, unknown>
  switch (command.type) {
    case 'set': {
      const query = parseTextQuery(command.query)
      const target = parseSnippet(command.target)
      return query && { type: 'set', query, ...(target ? { target } : {}) }
    }
    case 'step':
      return { type: 'step', forward: command.forward === true }
    case 'clear':
    case 'seed':
      return { type: command.type }
    default:
      return null
  }
}
