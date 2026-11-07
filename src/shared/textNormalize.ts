const SPECIAL_LETTERS: Record<string, string> = { ł: 'l', Ł: 'l', ø: 'o', Ø: 'o', đ: 'd', Đ: 'd' }

/**
 * Sprowadza tekst do małych liter bez znaków diakrytycznych, np. „Łąka” do „laka”.
 * Długość wyniku jest równa długości wejścia, więc pozycje z tekstu znormalizowanego
 * wskazują to samo miejsce w oryginale.
 */
export function normalizeText(text: string): string {
  let result = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)
    const code = char.charCodeAt(0)
    if (code < 128) {
      result += char.toLowerCase()
      continue
    }
    const special = SPECIAL_LETTERS[char]
    if (special) {
      result += special
      continue
    }
    const base = char.normalize('NFD').charAt(0).toLowerCase()
    result += base.length === 1 ? base : char
  }
  return result
}

/** Dzieli zapytanie na słowa gotowe do wyszukiwania w tekście znormalizowanym. */
export function queryTerms(query: string): string[] {
  return normalizeText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}
