/**
 * Migawka biblioteki jedzie przez IPC razem ze startem Reacta, a nie dopiero po pierwszym rysowaniu,
 * więc powłoka zwykle rysuje od razu wiersze zamiast szkieletu. Moduł importujemy jako pierwszy.
 */
let latest: string | null = null
const arrived = (json: string): void => {
  latest = json
}
// Zmiana, która przyjdzie przed podpięciem powłoki, też tu zostaje, bo odpowiedź i zmiany przychodzą po kolei.
const stop = window.api.onLibraryChanged(arrived)
const first = window.api.getLibrary().then(arrived)

/** Najświeższa migawka z tych, które przyszły od startu strony. */
export async function startingLibrary(): Promise<string> {
  await first
  stop()
  return latest ?? (await window.api.getLibrary())
}
