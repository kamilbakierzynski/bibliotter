/** Dokąd prowadzi link: do dokumentu z biblioteki, innego pliku, sieci albo donikąd. */
export type LinkKind = 'doc' | 'file' | 'external' | 'missing'

export interface DocLink {
  href: string
  text: string
  kind: LinkKind
  /** Dokument z biblioteki, do którego prowadzi link. */
  docId: string | null
  /** Plik na dysku. Adres w sieci go nie ma. */
  path: string | null
  /** Kotwica w dokumencie docelowym. */
  fragment: string
}

export interface DocLinks {
  outgoing: DocLink[]
  /** Dokumenty z biblioteki, które linkują do tego dokumentu. */
  incoming: string[]
}

/**
 * Plan w Markdownie i jego objaśnienie z kitu explain-plan. Objaśnienie wskazuje plan w meta
 * `bibliotter-plan`, więc apka przeskakuje między nimi bez szukania po nazwach.
 */
export interface DocPair {
  /** Drugi dokument pary. */
  docId: string
  /** Czym jest drugi dokument: planem albo jego objaśnieniem. */
  role: 'plan' | 'explanation'
}

/** Karta nad linkiem do innego dokumentu. */
export interface LinkPreview {
  title: string
  /** Projekt dokumentu. Plik spoza biblioteki go nie ma. */
  project: string | null
  path: string
  mtimeMs: number
  excerpt: string | null
  /** Miniatura jako adres `data:`, gdy jest już gotowa. */
  thumb: string | null
}

/**
 * Karta linku rysowana przez powłokę w warstwie nad dokumentami. Dane innego dokumentu
 * nie trafiają więc do procesu dokumentu, a karta działa też w dokumentach HTML.
 */
export interface LinkHoverCard {
  preview: LinkPreview
  /** Wiersz linku pod wskaźnikiem w układzie okna. */
  link: { x: number; y: number; width: number; height: number }
}

/**
 * Podgląd wiersza z panelu Linki. Link wychodzący pokazuje cel, ustawiony na kotwicy, jeśli ją ma,
 * a link zwrotny pokazuje dokument `from` w miejscu, z którego linkuje do `docId`.
 */
export type LinkShotRequest =
  | { kind: 'outgoing'; docId: string; href: string }
  | { kind: 'incoming'; docId: string; from: string }

/** Zamówienie przychodzi przez IPC, więc sprawdzamy każde pole. */
export function parseLinkShot(value: unknown): LinkShotRequest | null {
  if (typeof value !== 'object' || value === null) return null
  const { kind, docId, href, from } = value as Record<string, unknown>
  if (typeof docId !== 'string') return null
  if (kind === 'outgoing' && typeof href === 'string') return { kind, docId, href }
  if (kind === 'incoming' && typeof from === 'string') return { kind, docId, from }
  return null
}

export type LinkOutcome = 'opened' | 'revealed' | 'missing' | 'none'

/** Jak otworzyć dokument: na miejscu, zerknięciem albo od razu obok bieżącego arkusza. */
export type OpenMode = 'open' | 'peek' | 'split'

/** Ctrl + klik zerka, a Ctrl Shift + klik stawia dokument od razu obok. */
export const openModeOf = (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): OpenMode =>
  !(event.ctrlKey || event.metaKey) ? 'open' : event.shiftKey ? 'split' : 'peek'

/** Tryb przychodzi przez IPC, więc nieznana wartość otwiera dokument na miejscu. */
export const parseOpenMode = (mode: unknown): OpenMode => (mode === 'peek' || mode === 'split' ? mode : 'open')

/** Prośba do powłoki o przejście z dokumentu `from` do `docId`. */
export interface FollowLink {
  from: string
  docId: string
  mode: OpenMode
  /** Arkusz pliku, którego powłoka jeszcze nie zna, bo nie ma go w bibliotece. */
  file?: import('./types').DocEntry
}

/** Link Obsidiana `[[nazwa]]` wskazuje nazwę w sejfie, a nie ścieżkę, więc dostaje własny adres. */
export const WIKI_PREFIX = 'wiki:'

const SCHEME = /^[a-z][a-z\d+.-]+:/i

/** Link do pliku, a nie kotwica ani adres ze schematem. Pojedyncza litera to dysk, nie schemat. */
export const isLocalHref = (href: string): boolean =>
  href.startsWith(WIKI_PREFIX) || (href !== '' && !href.startsWith('#') && !SCHEME.test(href))
