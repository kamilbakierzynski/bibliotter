import { readStored, writeStored } from './state'

/*
 * Panel biblioteki można poszerzyć, ciągnąc jego krawędź, aż do połowy okna. Szerokość zapamiętujemy,
 * a w węższym oknie panel sam się zwęża, nie ruszając zapamiętanej wartości.
 */

const KEY = 'panelWidth'
/** Szerokość z `--panel` w CSS. Węższego panelu nie ma. */
export const PANEL_MIN = 264
const MAX_SHARE = 0.5

const stored = Number(readStored(KEY))
let wanted = Number.isFinite(stored) && stored >= PANEL_MIN ? Math.round(stored) : PANEL_MIN

export const panelMax = (windowWidth: number): number => Math.max(PANEL_MIN, Math.floor(windowWidth * MAX_SHARE))

const fit = (width: number, windowWidth: number): number => Math.round(Math.min(Math.max(width, PANEL_MIN), panelMax(windowWidth)))

function apply(width: number): number {
  document.documentElement.style.setProperty('--panel', `${width}px`)
  return width
}

/** Szerokość, jaką panel ma w oknie tej szerokości. Ustawia ją też w CSS. */
export const fitPanel = (windowWidth: number): number => apply(fit(wanted, windowWidth))

export const panelWanted = (): number => wanted

/** Ustawia szerokość w trakcie ciągnięcia. Zapis na dysk robi `savePanelWidth`. */
export function setPanelWidth(width: number, windowWidth: number): number {
  wanted = fit(width, windowWidth)
  return apply(wanted)
}

export function savePanelWidth(): void {
  writeStored(KEY, String(wanted))
}

/** Podwójne kliknięcie krawędzi wraca do szerokości z CSS. */
export function resetPanelWidth(windowWidth: number): number {
  const width = setPanelWidth(PANEL_MIN, windowWidth)
  savePanelWidth()
  return width
}

let panelEl: HTMLElement | null = null
let stretched = 0

/** Krawędź naciągnięta ponad szerokość panelu ciągnie za sobą jego treść, więc nazwy dalej sięgają do brzegu. */
export function stretchPanel(reach: number, width: number): void {
  const next = reach - width > 0.5 ? Math.round(reach) : 0
  if (next === stretched) return
  stretched = next
  panelEl ??= document.getElementById('panel')
  if (panelEl) panelEl.style.width = next ? `${next}px` : ''
}
