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
