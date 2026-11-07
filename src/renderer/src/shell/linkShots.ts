import type { LinkShotRequest } from '../../../shared/links'
import { data, notify } from './state'

/*
 * Zrzuty do karty przy wierszu panelu Linki. Robi je to samo ukryte okno co podglądy trafień:
 * link wychodzący pokazuje cel na kotwicy albo od początku, a zwrotny miejsce, z którego dokument tu linkuje.
 */

/** Chwila na wierszu zamawia zrzut, zanim pokaże się karta. Przejazd kursorem przez listę nic nie zamawia. */
const AIM_MS = 160
/** Zrzut to kilkadziesiąt kilobajtów. */
const KEEP = 40

/** Wiersz panelu Linki, który ma kartę z podglądem. */
export interface LinkCardRow {
  request: LinkShotRequest
  /** Dokument na karcie: cel linku albo dokument, który tu linkuje. */
  docId: string
  /** Kotwica celu, już odkodowana. Pusta, gdy link prowadzi na początek dokumentu. */
  fragment: string
}

const rows = new Map<string, LinkCardRow>()
const shots = new Map<string, string | null>()
const asked = new Set<string>()
let aimTimer = 0

/** Zrzut należy do wersji pliku, więc zmieniony dokument dostaje nowy. */
function shotKey(key: string): string | null {
  const row = rows.get(key)
  const doc = row && data.entries.get(row.docId)
  return doc ? `${key}\u0000${doc.mtimeMs}` : null
}

/** Panel zgłasza wiersz przy rysowaniu, a karta znajdzie go po kluczu z `data-link`. */
export function linkCardKey(row: LinkCardRow): string {
  const key = JSON.stringify(row.request)
  rows.set(key, row)
  return key
}

export const linkCardRow = (key: string): LinkCardRow | undefined => rows.get(key)

/** `undefined` znaczy, że zrzut dopiero się robi, a `null`, że go nie będzie. */
export function linkShot(key: string): string | null | undefined {
  const stamp = shotKey(key)
  return stamp ? shots.get(stamp) : null
}

/** Zamawia zrzut, jeśli jeszcze go nie ma. Woła to karta przy każdym rysowaniu. */
export function askLinkShot(key: string): void {
  const row = rows.get(key)
  const stamp = shotKey(key)
  if (!row || !stamp || shots.has(stamp) || asked.has(stamp)) return
  asked.add(stamp)
  const settle = (shot: string | null | 'later'): void => {
    asked.delete(stamp)
    // Wyprzedzony zrzut może się jeszcze przydać, gdy kursor wróci na ten wiersz.
    if (shot === 'later') return
    shots.set(stamp, shot)
    for (const old of shots.keys()) {
      if (shots.size <= KEEP) break
      shots.delete(old)
    }
    notify()
  }
  window.api.linkShot(row.request).then(settle, () => settle(null))
}

/** Kursor wszedł na wiersz linku albo z niego zszedł. */
export function aimLink(key: string | null): void {
  clearTimeout(aimTimer)
  if (key !== null) aimTimer = window.setTimeout(() => askLinkShot(key), AIM_MS)
}
