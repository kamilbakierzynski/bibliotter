import type { ThemeChoice } from '../../../shared/types'
import { saveTheme, notify, SYSTEM_DARK, ui } from './state'

const THEME_FADE_MS = 520

let timer = 0

export function applyMode(): void {
  document.documentElement.dataset.mode = ui.mode
  window.api.setTheme(ui.theme)
}

function changeMode(): void {
  const root = document.documentElement
  root.classList.add('theming')
  clearTimeout(timer)
  timer = window.setTimeout(() => root.classList.remove('theming'), THEME_FADE_MS)
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
