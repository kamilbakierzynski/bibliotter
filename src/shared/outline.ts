/** Nagłówek dokumentu w spisie treści. Element zostaje w dokumencie, a do powłoki idzie tylko tekst. */
export interface OutlineHeading {
  /** Poziom od 1 do 6, jak w `h1` do `h6`. */
  level: number
  text: string
}

/** Polecenie z powłoki: skok do nagłówka albo prośba o spis, np. po przeładowaniu powłoki. */
export type OutlineCommand = { type: 'jump'; index: number } | { type: 'report' }

export function parseOutlineCommand(value: unknown): OutlineCommand | null {
  if (typeof value !== 'object' || value === null) return null
  const { type, index } = value as Record<string, unknown>
  if (type === 'report') return { type }
  return type === 'jump' && Number.isInteger(index) && (index as number) >= 0 ? { type, index: index as number } : null
}

/** Najwięcej nagłówków w spisie. Dalej spis przestaje być mapą, a robi się z niego treść. */
export const MAX_OUTLINE = 400
/** Dłuższy nagłówek jest zdaniem, a w spisie wystarczy jego początek. */
export const MAX_HEADING_TEXT = 160

export function parseOutline(value: unknown): OutlineHeading[] | null {
  if (!Array.isArray(value)) return null
  return value.slice(0, MAX_OUTLINE).flatMap((item: unknown) => {
    const { level, text } = (item ?? {}) as Record<string, unknown>
    if (!Number.isInteger(level) || (level as number) < 1 || (level as number) > 6 || typeof text !== 'string') return []
    return [{ level: level as number, text: text.slice(0, MAX_HEADING_TEXT) }]
  })
}
