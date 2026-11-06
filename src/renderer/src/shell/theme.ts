import { saveTheme, notify, ui } from './state'

const THEME_FADE_MS = 520

let timer = 0

export function applyMode(): void {
  document.documentElement.dataset.mode = ui.mode
  window.api.setTheme(ui.mode)
}

export function toggleMode(): void {
  ui.mode = ui.mode === 'light' ? 'dark' : 'light'
  saveTheme(ui.mode)
  const root = document.documentElement
  root.classList.add('theming')
  clearTimeout(timer)
  timer = window.setTimeout(() => root.classList.remove('theming'), THEME_FADE_MS)
  applyMode()
  notify()
}
