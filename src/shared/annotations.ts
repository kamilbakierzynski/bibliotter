export type AnnotationKind = 'comment' | 'sticky'
/** Dla kogo jest uwaga. Uwagi `me` agent domyślnie pomija. */
export type Audience = 'agent' | 'me'
export type AnnotationStatus = 'open' | 'resolved'
export type MessageAuthor = 'user' | 'agent'

export const STICKY_COLORS = ['yellow', 'blue', 'green', 'pink'] as const
export type StickyColor = (typeof STICKY_COLORS)[number]

/** Miejsce w dokumencie. Brak kotwicy oznacza uwagę do całego dokumentu. */
export interface Anchor {
  selector: string
  /** Pozycja w elemencie jako ułamek jego szerokości i wysokości. */
  offsetX: number
  offsetY: number
  /** Zaznaczony tekst albo początek tekstu elementu. Pomaga odnaleźć miejsce i daje agentowi kontekst. */
  quote: string
  /** Najbliższy wcześniejszy nagłówek. */
  heading: string | null
}

export interface AnnotationMessage {
  id: string
  author: MessageAuthor
  text: string
  createdAt: string
}

export interface Annotation {
  id: string
  docId: string
  kind: AnnotationKind
  audience: Audience
  status: AnnotationStatus
  color: StickyColor | null
  anchor: Anchor | null
  /** Wersja dokumentu, do której powstała uwaga. */
  docSha: string
  createdAt: string
  updatedAt: string
  messages: AnnotationMessage[]
}

export interface NewAnnotation {
  kind: AnnotationKind
  audience: Audience
  color: StickyColor | null
  anchor: Anchor | null
  text: string
}

export type OverlayMode = AnnotationKind | null

/** Dane pinezki przekazywane do warstwy w dokumencie. */
export interface OverlayItem {
  id: string
  kind: AnnotationKind
  audience: Audience
  color: StickyColor | null
  anchor: Anchor
  /** Numer komentarza albo tekst karteczki. */
  label: string
}

export type OverlayEvent =
  | { type: 'place'; kind: AnnotationKind; anchor: Anchor }
  | { type: 'select'; id: string }
  | { type: 'orphans'; ids: string[] }
  | { type: 'shortcut'; key: 'comment' | 'sticky' | 'cancel' }
