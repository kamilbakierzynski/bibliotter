/**
 * Kieszeń trzyma kilka dokumentów pod ręką, na przykład przed spotkaniem. Skróty od Ctrl 1 do
 * Ctrl 9 otwierają je po kolei, więc miejsc jest dziewięć. Kolejność to kolejność wkładania.
 */
export const POCKET_MAX = 9

export function parsePocket(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(parsed)) return []
    const ids = parsed.filter((item): item is string => typeof item === 'string')
    return [...new Set(ids)].slice(0, POCKET_MAX)
  } catch {
    return []
  }
}

export type PocketChange = { ids: string[]; result: 'added' | 'removed' | 'full' }

/** Wkłada dokument do kieszeni albo go wyjmuje. Pełna kieszeń niczego nie wypycha. */
export function togglePocketId(ids: readonly string[], id: string): PocketChange {
  if (ids.includes(id)) return { ids: ids.filter((item) => item !== id), result: 'removed' }
  if (ids.length >= POCKET_MAX) return { ids: [...ids], result: 'full' }
  return { ids: [...ids, id], result: 'added' }
}
