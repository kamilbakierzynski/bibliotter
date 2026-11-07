export const MAX_LABEL_LENGTH = 40

export interface LabelCount {
  name: string
  count: number
}

/** Pusty wynik znaczy, że nie ma czego zapisać. */
export function cleanLabel(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH).trim()
}

const labelKey = (name: string): string => name.toLocaleLowerCase('pl')

export const sameLabel = (a: string, b: string): boolean => labelKey(a) === labelKey(b)

/** Ten sam papier co karteczki. Bez pomarańczu, bo ten znaczy tylko „to czeka na Ciebie”. */
export const LABEL_COLORS = ['yellow', 'sand', 'pink', 'lilac', 'blue', 'mint', 'green'] as const
export type LabelColor = (typeof LABEL_COLORS)[number]
/** `none` to wybór użytkownika: zwykły znacznik bez koloru. */
export type LabelTone = LabelColor | 'none'
/** Wybory użytkownika według nazwy bez wielkości liter. Reszta ma kolor wyliczony z nazwy. */
export type LabelColors = Record<string, LabelTone>

const TICKET = /^([A-Z][A-Z0-9]{1,9})-\d{1,6}$/

export const isTicket = (name: string): boolean => TICKET.test(name)

const TICKET_IN_TEXT = /\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/
const TICKET_SLOT = '{code}'

const isWebAddress = (value: string): boolean => {
  try {
    const { protocol, hostname } = new URL(value)
    return (protocol === 'https:' || protocol === 'http:') && hostname !== ''
  } catch {
    return false
  }
}

/**
 * Użytkownik wkleja, co ma pod ręką: adres swojej Jiry, adres zgłoszenia albo gotowy szablon z `{code}`.
 * Wynik to zawsze szablon. Pusty napis czyści ustawienie, a `null` znaczy, że to nie jest adres strony.
 */
export function ticketTemplate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return ''
  const address = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  if (!isWebAddress(address.replaceAll(TICKET_SLOT, 'PROJ-1'))) return null
  if (address.includes(TICKET_SLOT)) return address
  const { origin, pathname, search } = new URL(address)
  const path = pathname.replace(/\/+$/, '')
  if (TICKET_IN_TEXT.test(path)) return origin + path.replace(TICKET_IN_TEXT, TICKET_SLOT)
  if (TICKET_IN_TEXT.test(search)) return origin + path + search.replace(TICKET_IN_TEXT, TICKET_SLOT)
  return `${origin}${path || '/browse'}/${TICKET_SLOT}`
}

/** Kod ma tylko litery, cyfry i myślnik, więc nie wymaga kodowania w adresie. */
export const ticketLink = (template: string | undefined, code: string): string | null =>
  template && isTicket(code) ? template.replaceAll(TICKET_SLOT, code) : null

export interface TicketRow extends LabelCount {
  /** Tytuł najnowszego dokumentu, bo sam kod niewiele mówi. */
  title: string
  /** Wszystkie tytuły razem, żeby kod dało się znaleźć po temacie. */
  titles: string
  newestMs: number
}

/** Kody od najświeższego dokumentu, bo kodów przybywa, a zwykle wraca się do bieżących. */
export function ticketRows<Doc extends { labels: readonly string[]; mtimeMs: number }>(
  docs: readonly Doc[],
  titleOf: (doc: Doc) => string
): TicketRow[] {
  const rows = new Map<string, TicketRow>()
  for (const doc of docs) {
    for (const name of doc.labels) {
      if (!isTicket(name)) continue
      const title = titleOf(doc)
      const row = rows.get(name)
      if (!row) rows.set(name, { name, count: 1, title, titles: title, newestMs: doc.mtimeMs })
      else {
        row.count += 1
        row.titles += `\n${title}`
        if (doc.mtimeMs > row.newestMs) Object.assign(row, { title, newestMs: doc.mtimeMs })
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.newestMs - a.newestMs)
}

/** Kolor wynika z nazwy, więc nie zmienia się po restarcie. Kody jednego projektu mają wspólny. */
export function defaultLabelColor(name: string): LabelColor {
  const seed = labelKey(TICKET.exec(name)?.[1] ?? name)
  let hash = 2_166_136_261
  for (const char of seed) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16_777_619)
  return LABEL_COLORS[(hash >>> 0) % LABEL_COLORS.length] as LabelColor
}

export const labelTone = (name: string, colors: LabelColors = {}): LabelTone =>
  colors[labelKey(name)] ?? defaultLabelColor(name)

export const isLabelTone = (value: unknown): value is LabelTone =>
  value === 'none' || LABEL_COLORS.includes(value as LabelColor)

export function parseLabelColors(value: unknown): LabelColors {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, LabelTone] => isLabelTone(entry[1])))
}

export const withLabelColor = (colors: LabelColors, name: string, tone: LabelTone): LabelColors => ({
  ...colors,
  [labelKey(name)]: tone
})

/** Kolor idzie za etykietą przy zmianie nazwy. Nazwa już używana zachowuje swój. */
export function moveLabelColor(colors: LabelColors, name: string, next: string | null): LabelColors {
  const { [labelKey(name)]: tone, ...rest } = colors
  return next && tone ? { [labelKey(next)]: tone, ...rest } : rest
}

export const hasLabel = (labels: readonly string[], name: string): boolean =>
  labels.some((label) => sameLabel(label, name))

/** Znana pisownia wygrywa, więc „plan” nie tworzy drugiej etykiety obok „Plan”. */
export function parseLabels(values: unknown, known: readonly string[] = []): string[] {
  if (!Array.isArray(values)) return []
  const spelling = new Map(known.map((name) => [labelKey(name), name]))
  const labels = new Map<string, string>()
  for (const value of values) {
    const name = cleanLabel(value)
    const key = labelKey(name)
    if (name && !labels.has(key)) labels.set(key, spelling.get(key) ?? name)
  }
  return [...labels.values()]
}

/** Spis etykiet z liczbą dokumentów. Porządek jest stały, więc wiersze nie skaczą przy zaznaczaniu. */
export function countLabels(lists: Iterable<readonly string[]>): LabelCount[] {
  const counts = new Map<string, LabelCount>()
  for (const list of lists) {
    for (const name of list) {
      const found = counts.get(labelKey(name))
      if (found) found.count += 1
      else counts.set(labelKey(name), { name, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl', { numeric: true, sensitivity: 'base' }))
}
