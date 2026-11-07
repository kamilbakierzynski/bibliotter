import type { FileMode } from '../../../shared/fileView'
import type { FollowLink } from '../../../shared/links'
import type { DocEntry } from '../../../shared/types'
import { followLink } from './sheets'
import { data, notify } from './state'

/*
 * Arkusze plików otwarte z linków. Nie należą do biblioteki, więc migawka biblioteki ich nie zna,
 * a powłoka dokłada je do `data.entries` po każdej migawce. Dzięki temu arkusz, para i zerknięcie
 * traktują plik jak dokument.
 */
const files = new Map<string, DocEntry>()

export const isFileSheet = (id: string | null | undefined): boolean => !!id && files.has(id)

export function rememberFile(entry: DocEntry): void {
  files.set(entry.id, entry)
  data.entries.set(entry.id, entry)
}

/** Migawka biblioteki buduje `data.entries` od nowa, więc pliki wracają do niej tutaj. */
export function keepFiles(): void {
  for (const [id, entry] of files) data.entries.set(id, entry)
}

/** Link do pliku przychodzi razem z jego opisem, bo powłoka nie zna jeszcze takiego arkusza. */
export function followFileLink({ from, docId, mode, file }: FollowLink): void {
  if (file) rememberFile(file)
  followLink(from, docId, mode)
}

/** Git odpowiedział po otwarciu panelu. Arkusz, którego już nie ma, nie wraca. */
export function updateFile(entry: DocEntry): void {
  if (!files.has(entry.id)) return
  rememberFile(entry)
  notify()
}

const TREE_KEY = 'bibliotter.fileTree'

function readTree(): boolean {
  try {
    return localStorage.getItem(TREE_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Drzewo plików obok arkusza jest jedno dla wszystkich plików, jak panel w edytorze. */
export const fileTree = { shown: readTree() }

/** Proces główny nie pamięta drzewa między uruchomieniami, więc powłoka mówi mu o nim na starcie. */
export function syncFileTree(): void {
  void window.api.setFileTree(fileTree.shown)
}

export function toggleFileTree(): void {
  fileTree.shown = !fileTree.shown
  try {
    localStorage.setItem(TREE_KEY, fileTree.shown ? 'on' : 'off')
  } catch {
    // Bez pamięci przełącznik działa do zamknięcia apki.
  }
  syncFileTree()
  notify()
}

export function setFileMode(id: string, mode: FileMode): void {
  const entry = files.get(id)
  if (!entry?.file || entry.file.mode === mode) return
  rememberFile({ ...entry, file: { ...entry.file, mode } })
  notify()
  void window.api.setFileMode(id, mode).then((fresh) => {
    if (fresh) rememberFile(fresh)
    notify()
  })
}

/** Odświeżenie czyta plik od nowa, więc liczby zmian w nagłówku też mogą być inne. */
export function refreshFile(id: string): void {
  void window.api.reloadDoc(id).then(() => window.api.setFileMode(id, files.get(id)?.file?.mode ?? 'file')).then((fresh) => {
    if (fresh) rememberFile(fresh)
    notify()
  })
}
