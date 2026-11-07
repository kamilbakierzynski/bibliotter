import type { ThemeChoice } from '../../../shared/types'
import { saveTheme, notify, SYSTEM_DARK, ui } from './state'

export function applyMode(): void {
  document.documentElement.dataset.mode = ui.mode
  window.api.setTheme(ui.theme)
}

/**
 * Motyw zmienia się od razu, bez przejścia kolorów. Przejście na każdym elemencie kosztowało
 * w każdej klatce przeliczenie stylów całego drzewa, więc 0,42 s zamieniało się w sekundę szarpania.
 */
function changeMode(): void {
  applyMode()
  notify()
}

/** Przy motywie systemowym wynik przychodzi z `matchMedia`, gdy główny proces odda wybór systemowi. */
export function setTheme(choice: ThemeChoice): void {
  ui.theme = choice
  saveTheme(choice)
  if (choice !== 'system') ui.mode = choice
  changeMode()
}

export function toggleMode(): void {
  setTheme(ui.mode === 'light' ? 'dark' : 'light')
}

matchMedia(SYSTEM_DARK).addEventListener('change', ({ matches }) => {
  const mode = matches ? 'dark' : 'light'
  if (ui.theme !== 'system' || mode === ui.mode) return
  ui.mode = mode
  changeMode()
})
