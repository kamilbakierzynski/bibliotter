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

export type LinkOutcome = 'opened' | 'revealed' | 'missing' | 'none'

/** Prośba do powłoki o przejście z dokumentu `from` do `docId`. */
export interface FollowLink {
  from: string
  docId: string
  peek: boolean
}

/** Link Obsidiana `[[nazwa]]` wskazuje nazwę w sejfie, a nie ścieżkę, więc dostaje własny adres. */
export const WIKI_PREFIX = 'wiki:'

const SCHEME = /^[a-z][a-z\d+.-]+:/i

/** Link do pliku, a nie kotwica ani adres ze schematem. Pojedyncza litera to dysk, nie schemat. */
export const isLocalHref = (href: string): boolean =>
  href.startsWith(WIKI_PREFIX) || (href !== '' && !href.startsWith('#') && !SCHEME.test(href))
