import type { DocEntry } from '../../../shared/types'
import { displayName, ROW_H } from '../tree'
import { notify, readStored, writeStored } from './state'

/*
 * Wiersze dokumentów w panelu mogą nazywać dokument tytułem, nazwą pliku albo jednym i drugim:
 * tytuł na górze, a pod nim mniejsza nazwa pliku.
 */

export type DocNaming = 'title' | 'file' | 'both'

const KEY = 'docNaming'

function read(): DocNaming {
  const stored = readStored(KEY)
  return stored === 'file' || stored === 'both' ? stored : 'title'
}

export const naming = { mode: read() }

export function setDocNaming(mode: DocNaming): void {
  naming.mode = mode
  writeStored(KEY, mode)
  notify()
}

/** Sam `index.html` niewiele mówi, więc dostaje przed sobą nazwę folderu. */
export function fileName(doc: DocEntry): string {
  const parts = doc.relPath.split(/[\\/]/)
  const parent = parts.at(-2)
  return /^index\./i.test(doc.name) && parent ? `${parent}/${doc.name}` : doc.name
}

/** Nazwa w pierwszej linii wiersza. */
export const rowName = (doc: DocEntry): string => (naming.mode === 'file' ? fileName(doc) : displayName(doc))

export const twoLine = (): boolean => naming.mode === 'both'

/** Drzewo ma jedną wysokość wierszy, bo na niej liczy przestawianie. Dwie linie potrzebują wyższych. */
const TALL_ROW_H = 40

export const treeRowH = (): number => (twoLine() ? TALL_ROW_H : ROW_H)
