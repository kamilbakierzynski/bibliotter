import { type FSWatcher, watch } from 'node:fs'
import { formatOf, isIgnoredDirectory } from './scanner'

/** Plik zwykle zapisuje się kilkoma zdarzeniami, więc skan chwilę czeka na ich koniec. */
const SETTLE_MS = 400
/** Agent potrafi pisać do Markdownów bez przerwy, a skan czyta wszystkie foldery. */
const SCAN_GAP_MS = 3000

/** Czy zmiana dotyczy dokumentu poza katalogami, które skan i tak pomija. */
export function isRelevantChange(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]/)
  const fileName = segments.pop()
  if (!fileName || !formatOf(fileName)) return false
  return !segments.some(isIgnoredDirectory)
}

/**
 * Obserwuje foldery natywnym mechanizmem systemu, który na Windowsie i macOS działa
 * rekurencyjnie. Folder, którego nie da się obserwować (np. dysk sieciowy), odświeża się
 * dalej przy powrocie do okna i po kliknięciu Skanuj.
 */
export class FolderWatcher {
  private watchers: FSWatcher[] = []
  private timer: NodeJS.Timeout | null = null
  private lastScanAt = 0

  constructor(private readonly onChange: () => void) {}

  watch(roots: string[]): void {
    this.close()
    for (const root of roots) {
      try {
        const watcher = watch(root, { recursive: true }, (_event, fileName) => {
          if (fileName === null || isRelevantChange(fileName)) this.schedule()
        })
        watcher.on('error', () => watcher.close())
        this.watchers.push(watcher)
      } catch {
        // Niedostępny folder apka zgłasza już przy skanowaniu.
      }
    }
  }

  close(): void {
    for (const watcher of this.watchers) watcher.close()
    this.watchers = []
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Zaplanowany skan zostaje na miejscu, więc ciągłe zapisy nie odsuwają go w nieskończoność. */
  private schedule(): void {
    if (this.timer) return
    const wait = Math.max(SETTLE_MS, this.lastScanAt + SCAN_GAP_MS - Date.now())
    this.timer = setTimeout(() => {
      this.timer = null
      this.lastScanAt = Date.now()
      this.onChange()
    }, wait)
  }
}
