import type { ContentDoc, TextSnippet } from '../../../shared/textSearch'
import { search, searchModel } from './search'
import { notify } from './state'

/*
 * Zrzuty miejsc trafień do karty przy wierszu panelu „Szukaj w treści”. Robi je proces główny
 * w ukrytym oknie, a tu zostają do następnego wyszukiwania, bo kursor często wraca do tego samego wiersza.
 */

/** Chwila na wierszu zamawia zrzut, zanim pokaże się karta. Przejazd kursorem przez listę nic nie zamawia. */
const AIM_MS = 160
/** Zrzut to kilkadziesiąt kilobajtów, a wyniki potrafią mieć setki wierszy. */
const KEEP = 40

const shots = new Map<string, string | null>()
const asked = new Set<string>()
let results: ContentDoc[] | null = null
let aimTimer = 0

const keyOf = (docId: string, hit: TextSnippet): string => [docId, hit.before, hit.match, hit.after].join('\u0000')

/** Zrzuty należą do wyników, które stoją w panelu, więc nowe wyszukiwanie zaczyna od zera. */
function sync(): void {
  if (results === search.docs) return
  results = search.docs
  shots.clear()
  asked.clear()
}

/** `undefined` znaczy, że zrzut dopiero się robi, a `null`, że go nie będzie. */
export function hitShot(at: number): string | null | undefined {
  sync()
  const item = searchModel().hits[at]
  return item ? shots.get(keyOf(item.doc.id, item.hit)) : null
}

/** Zamawia zrzut, jeśli jeszcze go nie ma. Woła to karta przy każdym rysowaniu. */
export function askHitShot(at: number): void {
  sync()
  const item = searchModel().hits[at]
  if (!item) return
  const key = keyOf(item.doc.id, item.hit)
  if (shots.has(key) || asked.has(key)) return
  asked.add(key)
  const owner = search.docs
  const settle = (shot: string | null | 'later'): void => {
    if (owner !== search.docs) return
    asked.delete(key)
    // Wyprzedzony zrzut może się jeszcze przydać, gdy kursor wróci na ten wiersz.
    if (shot === 'later') return
    shots.set(key, shot)
    for (const old of shots.keys()) {
      if (shots.size <= KEEP) break
      shots.delete(old)
    }
    notify()
  }
  window.api.previewHit(item.doc.id, search.answeredQuery, item.hit).then(settle, () => settle(null))
}

/** Kursor wszedł na wiersz trafienia albo z niego zszedł. */
export function aimHit(at: number | null): void {
  clearTimeout(aimTimer)
  if (at !== null) aimTimer = window.setTimeout(() => askHitShot(at), AIM_MS)
}
