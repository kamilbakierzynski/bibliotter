import { clamp } from '../motion/spring'
import { cardPage } from './linkHover'
import { MOD } from './state'

/*
 * Wskazówki przycisków w nagłówku arkusza: co robi przycisk i jaki ma skrót. Pod nagłówkiem stoi
 * natywny widok dokumentu, więc wskazówka leży na stronie kart linków, która jest nad dokumentami.
 * Wycięcie tej strony łapie mysz, dlatego zaczyna się pod przyciskiem, a nie na nim.
 */

const DELAY_MS = 380
/** Tyle po zejściu z przycisku następny pokazuje wskazówkę od razu. */
const MEMORY_MS = 320
const FADE_MS = 160
const GAP = 8
const EDGE = 8
/** Cień wskazówki wychodzi na boki i w dół, a wycięcie musi go objąć. */
const SHADOW_SIDE = 20
const SHADOW_BOTTOM = 32

let tip: HTMLElement | null = null
let current: HTMLElement | null = null
let live = false
let showTimer = 0
let memoryTimer = 0
let fadeTimer = 0

function tipElement(page: Window): HTMLElement {
  if (tip?.isConnected) return tip
  tip = page.document.createElement('div')
  tip.className = 'tip sheet-tip'
  page.document.body.append(tip)
  return tip
}

function fill(box: HTMLElement, label: string, keys: string[]): void {
  const doc = box.ownerDocument
  const text = doc.createElement('span')
  text.textContent = label
  box.replaceChildren(text)
  box.classList.toggle('say', keys.length === 0)
  if (!keys.length) return
  const caps = doc.createElement('span')
  caps.className = 'keys'
  for (const key of keys) {
    const cap = doc.createElement('kbd')
    cap.textContent = key
    caps.append(cap)
  }
  box.append(caps)
}

function show(button: HTMLElement): void {
  const page = cardPage()
  if (!page || !button.isConnected) return
  clearTimeout(fadeTimer)
  const box = tipElement(page)
  const keys = (button.dataset.keys ?? '').split(' ').filter(Boolean).map((key) => (key === 'MOD' ? MOD : key))
  fill(box, button.dataset.tip ?? '', keys)
  const r = button.getBoundingClientRect()
  const width = box.offsetWidth
  const height = box.offsetHeight
  const left = clamp(r.left + r.width / 2 - width / 2, EDGE, Math.max(EDGE, window.innerWidth - width - EDGE))
  const top = r.bottom + GAP
  box.style.translate = `${left}px ${top}px`
  const x = Math.max(0, Math.floor(left - SHADOW_SIDE))
  const y = Math.ceil(r.bottom) + 1
  const right = Math.min(window.innerWidth, Math.ceil(left + width + SHADOW_SIDE))
  window.api.placeCardLayer({ x, y, width: right - x, height: Math.ceil(top + height + SHADOW_BOTTOM) - y })
  box.classList.add('on')
  live = true
}

function hide(): void {
  clearTimeout(showTimer)
  if (!tip?.classList.contains('on')) return
  tip.classList.remove('on')
  clearTimeout(fadeTimer)
  fadeTimer = window.setTimeout(() => window.api.placeCardLayer(null), FADE_MS)
}

/** Wskaźnik wszedł na element nagłówka. Przycisk z `data-tip` dostaje wskazówkę, reszta ją chowa. */
export function sheetTipOver(target: EventTarget | null): void {
  const button = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null
  if (button === current) return
  current = button
  clearTimeout(memoryTimer)
  clearTimeout(showTimer)
  if (!button) {
    hide()
    return
  }
  if (live) show(button)
  else showTimer = window.setTimeout(() => show(button), DELAY_MS)
}

export function sheetTipLeave(): void {
  current = null
  hide()
  clearTimeout(memoryTimer)
  memoryTimer = window.setTimeout(() => {
    live = false
  }, MEMORY_MS)
}

/**
 * Kliknięcie zmienia stan przycisku albo go zabiera, więc wskazówka znika. Wraca dopiero po zejściu
 * z przycisku, bo `current` zostaje i ruch po tym samym przycisku nic nie robi.
 */
export function sheetTipPress(): void {
  live = false
  hide()
}
