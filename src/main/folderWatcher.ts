import { type FSWatcher, watch } from 'node:fs'
import { isHtmlFile, isIgnoredDirectory } from './scanner'

const DEBOUNCE_MS = 400

/** Czy zmiana dotyczy pliku HTML poza katalogami, które skan i tak pomija. */
export function isRelevantChange(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]/)
  const fileName = segments.pop()
  if (!fileName || !isHtmlFile(fileName)) return false
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

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.onChange()
    }, DEBOUNCE_MS)
  }
}
