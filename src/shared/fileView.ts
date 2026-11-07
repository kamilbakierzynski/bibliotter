/*
 * Arkusz pliku: kod albo tekst spoza biblioteki, otwarty z linku w dokumencie. Pokazuje go
 * CodeMirror w zwykłym widoku dokumentu, więc para, zerknięcie i szereg działają jak dla dokumentu.
 */

/** Co pokazuje arkusz pliku: sam plik albo zmiany względem ostatniego commita. */
export type FileMode = 'file' | 'diff'

/** Opis arkusza pliku. Dokument z biblioteki go nie ma. */
export interface FileSheetInfo {
  mode: FileMode
  /** Plik różni się od wersji z HEAD albo jest nowy w repozytorium. */
  changed: boolean
  added: number
  removed: number
}

/** Wiersze, na które wskazuje link: `#L12`, `#L12-L20` albo `plik.ts:12`. */
export interface LineRange {
  from: number
  to: number
}

/** Dane strony arkusza. Proces główny wkłada je w stronę jako JSON. */
export interface FileViewData {
  name: string
  /** Ścieżka w repozytorium albo pełna ścieżka pliku spoza repozytorium. */
  path: string
  text: string
  /** Wersja z HEAD. `null`, gdy plik nie leży w repozytorium albo git go nie śledzi. */
  original: string | null
  mode: FileMode
  lines: LineRange | null
  language: string
  /** Napisy CodeMirrora w języku apki, np. o zwiniętych wierszach diffu. */
  phrases?: Record<string, string>
}

const LINES = /^L(\d+)(?:-L?(\d+))?$/i
const LINE_SUFFIX = /:(\d+)(?:[:-](\d+))?$/

function range(from: string, to: string | undefined): LineRange | null {
  const start = Number(from)
  const end = to === undefined ? start : Number(to)
  if (!Number.isSafeInteger(start) || start < 1) return null
  return { from: Math.min(start, end), to: Math.max(start, end) }
}

/** Kotwica arkusza pliku: `diff` przełącza na zmiany, `L12` i `L12-L20` wskazują wiersze. */
export function parseFileFragment(fragment: string): { mode: FileMode | null; lines: LineRange | null } {
  const parts = fragment.split(/[&,]/).map((part) => part.trim())
  let mode: FileMode | null = null
  let lines: LineRange | null = null
  for (const part of parts) {
    if (part === 'diff' || part === 'file') mode = part
    const match = LINES.exec(part)
    if (match) lines = range(match[1] as string, match[2])
  }
  return { mode, lines }
}

/** Wiersze z końca ścieżki w linku, jak w wyjściu kompilatora: `src/app.ts:12` albo `src/app.ts:12-20`. */
export function lineSuffix(href: string): LineRange | null {
  const bare = href.replace(/[?#].*$/, '')
  const match = LINE_SUFFIX.exec(bare)
  return match ? range(match[1] as string, match[2]) : null
}

export function fileFragment(mode: FileMode, lines: LineRange | null): string {
  const at = lines ? (lines.from === lines.to ? `L${lines.from}` : `L${lines.from}-L${lines.to}`) : ''
  return [mode, at].filter(Boolean).join('&')
}
