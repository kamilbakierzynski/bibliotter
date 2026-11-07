import type { OutlineHeading } from './outline'
import type { StepCamera } from './presentation'
import type { FindState } from './textSearch'

export type NoteKind = 'comment' | 'sticky'
export type AnnotationKind = NoteKind | 'highlight' | 'shape'
/** Dla kogo jest uwaga. Uwagi `me` agent domyślnie pomija. */
export type Audience = 'agent' | 'me'
export type AnnotationStatus = 'open' | 'resolved'
export type MessageAuthor = 'user' | 'agent'

/** Karteczka i zakreślacz mają te same nazwy kolorów, a odcienie każde ma swoje. */
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

/** Kawałek elementu w ułamkach jego szerokości i wysokości. Kształt może wyjść poza element. */
export interface FractionBox {
  x: number
  y: number
  width: number
  height: number
}

export const SHAPE_TYPES = ['arrow', 'rect', 'ellipse', 'line'] as const
export type ShapeType = (typeof SHAPE_TYPES)[number]

/**
 * Kształt rysowany tuszem. Prostokąt i elipsa leżą w ułamkach elementu kotwicy uwagi. Linia
 * i strzałka zaczynają się w kotwicy uwagi, a kończą w `end`, więc idą za oboma elementami.
 */
export type Shape = { type: 'rect' | 'ellipse'; box: FractionBox } | { type: 'arrow' | 'line'; end: Anchor }

/** Narzędzie kształtu: co rysuje przeciągnięcie i jakim kolorem. */
export interface ShapeTool {
  type: ShapeType
  color: StickyColor
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
  /** Zakreślenie może nie mieć żadnej wiadomości, dopóki użytkownik nie dopisze notatki. */
  messages: AnnotationMessage[]
  /** Linie zakreślenia, tylko przy rodzaju `highlight`. */
  strokes?: string[]
  /** Szerokość elementu kotwicy przy rysowaniu. Inna oznacza, że tekst przelał się inaczej. */
  anchorWidth?: number
  /** Geometria kształtu, tylko przy rodzaju `shape`. */
  shape?: Shape
}

export interface NewAnnotation {
  kind: AnnotationKind
  audience: Audience
  color: StickyColor | null
  anchor: Anchor | null
  text: string
  strokes?: string[]
  anchorWidth?: number
  shape?: Shape
}

export type OverlayMode = NoteKind | null

/** Dane pinezki przekazywane do warstwy w dokumencie. */
export interface OverlayItem {
  id: string
  kind: AnnotationKind
  audience: Audience
  color: StickyColor | null
  anchor: Anchor
  /** Numer komentarza, tekst karteczki albo notatka przy zakreśleniu. */
  label: string
  /** Agent odpisał, więc uwaga czeka na użytkownika. */
  waiting: boolean
  strokes?: string[]
  anchorWidth?: number
  shape?: Shape
}

/** Prostokąt w widoku dokumentu, w pikselach CSS. */
export interface OverlayRect {
  x: number
  y: number
  width: number
  height: number
}

/** Klawisze, które dokument przekazuje do powłoki, gdy to on ma fokus. */
export const OVERLAY_KEYS = [
  'v', 'c', 'n', 'm', 'a', 'p', 's', 'l', 'r', 'i', 'o', 'g', 'd', 'x', 'h', 't', 'z', '?', 'escape', 'arrowleft', 'arrowright',
  ' ', 'pageup', 'pagedown', 'home', 'end', 'f5'
] as const
export type OverlayKey = (typeof OVERLAY_KEYS)[number]

/**
 * Klawisze kroków prezentacji. Poza prezentacją należą do dokumentu, a w niej tylko wtedy,
 * gdy dokument sam ich nie obsłużył. Pilot do prezentacji wysyła zwykle strzałki albo PgUp i PgDn.
 */
export const STEP_KEYS: readonly OverlayKey[] = [' ', 'pageup', 'pagedown', 'home', 'end', 'arrowleft', 'arrowright']

/** Co zrobić z tekstem zaznaczonym w dokumencie. */
export type SelectionAction = 'comment' | 'sticky' | 'copy'

export type OverlayEvent =
  | { type: 'place'; kind: NoteKind; anchor: Anchor; rect: OverlayRect }
  /** Skończone zakreślenie, gotowe do zapisania. */
  | { type: 'highlight'; color: StickyColor; anchor: Anchor; strokes: string[]; anchorWidth: number }
  /** Skończony kształt, gotowy do zapisania. */
  | { type: 'shape'; color: StickyColor; anchor: Anchor; shape: Shape }
  | { type: 'erase'; id: string }
  /** Komentarz albo karteczka przeniesione w nowe miejsce. */
  | { type: 'move'; id: string; anchor: Anchor }
  /** Uwaga wisi przy kursorze i czeka na kliknięcie. `null` znaczy, że już leży. */
  | { type: 'carrying'; id: string | null }
  | { type: 'select'; id: string; rect: OverlayRect | null }
  /** Uwaga wybrana poza dokumentem stoi już na ekranie. */
  | { type: 'focused'; id: string; rect: OverlayRect | null }
  | { type: 'orphans'; ids: string[] }
  | { type: 'shortcut'; key: OverlayKey; shift: boolean; ctrl: boolean }
  | { type: 'selection'; active: boolean }
  | { type: 'positions'; items: { id: string; rect: OverlayRect }[] }
  | { type: 'find'; state: FindState }
  | { type: 'find-seed'; text: string }
  /** Nagłówki dokumentu do spisu treści. */
  | { type: 'outline'; headings: OutlineHeading[] }
  /** Rozdział przy linii czytania albo `-1` przed pierwszym nagłówkiem. */
  | { type: 'outline-at'; index: number }
  /** Kadr kroku wskazany w dokumencie kliknięciem albo przeciągnięciem. */
  | { type: 'route-pick'; camera: StepCamera }
  /** Kroki trasy, których kadru nie ma w dokumencie. */
  | { type: 'route-missing'; ids: string[] }
