import { mkdirSync, watch } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const WATCH_DEBOUNCE_MS = 150

export type SignalName = 'annotations' | 'labels' | 'presentation'

// Folder `state` nie trafia do prywatnego gita z danymi.
const signalDir = (libraryDir: string): string => join(dirname(libraryDir), 'state', 'signals')

/** Sygnał to tylko podpowiedź dla otwartej apki, więc jego błąd nie może cofnąć zapisanych danych. */
export async function sendSignal(libraryDir: string, name: SignalName): Promise<void> {
  const directory = signalDir(libraryDir)
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, name), new Date().toISOString())
  } catch {
    // Dwa procesy mogą pisać sygnał w tej samej chwili. Wystarczy, że dotrze jeden.
  }
}

/**
 * Powiadamia o zmianach zapisanych przez agenta w innym procesie.
 * Słucha sygnału w osobnym folderze, a nie całej biblioteki: skan zapisuje tam tysiące plików,
 * a każde zdarzenie, nawet odrzucone, zabiera główny proces Electrona na kilka milisekund.
 */
export function watchSignal(libraryDir: string, name: SignalName, onChange: () => void): () => void {
  const directory = signalDir(libraryDir)
  mkdirSync(directory, { recursive: true })
  let timer: NodeJS.Timeout | null = null
  const watcher = watch(directory, (_event, file) => {
    if (file !== null && file !== name) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, WATCH_DEBOUNCE_MS)
  })
  watcher.on('error', () => watcher.close())
  return () => {
    if (timer) clearTimeout(timer)
    watcher.close()
  }
}
