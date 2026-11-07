import { EN, EN_PLURALS } from './en'

/*
 * Język interfejsu. Polski tekst w kodzie jest jednocześnie kluczem słownika, więc nowy napis działa
 * od razu, a bez tłumaczenia po prostu pokazuje się po polsku. `tests/i18n.test.ts` pilnuje, żeby
 * każdy napis w `t(...)` miał tłumaczenie.
 *
 * `t` czyta bieżący język w chwili wywołania, więc wolno go wołać tylko w trakcie działania, a nie
 * w stałych modułu: taka stała zapamiętałaby język z uruchomienia i nie poszłaby za zmianą w opcjach.
 *
 * Teksty dla agenta (CLI, MCP) są zawsze po angielsku i nie idą przez `t`, bo działają poza apką.
 * Błędy, których użytkownik nie zobaczy, też nie potrzebują tłumaczenia.
 */

export const LANGUAGES = [
  { value: 'pl', label: 'Polski' },
  { value: 'en', label: 'English' }
] as const

export type Language = (typeof LANGUAGES)[number]['value']

export const DEFAULT_LANGUAGE: Language = 'pl'

export const isLanguage = (value: unknown): value is Language => LANGUAGES.some((item) => item.value === value)

let current: Language = DEFAULT_LANGUAGE

export const language = (): Language => current

export function setLanguage(next: Language): void {
  current = next
}

/** Angielski z brytyjskim zapisem dat, bo dzień przed miesiącem to ten sam układ co po polsku. */
export const locale = (): string => (current === 'en' ? 'en-GB' : 'pl-PL')

export function t(text: string, values?: Record<string, string | number>): string {
  const phrase = current === 'en' ? (EN[text] ?? text) : text
  if (!values) return phrase
  return phrase.replace(/\{(\w+)\}/g, (hole, name: string) => String(values[name] ?? hole))
}

/** Formy podaje się po polsku, a angielskie znajdują się po pierwszej z nich. */
export function plural(n: number, one: string, few: string, many: string): string {
  const english = current === 'en' ? EN_PLURALS[one] : undefined
  if (english) return n === 1 ? english[0] : english[1]
  if (n === 1) return one
  const a = n % 10
  const b = n % 100
  return a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
