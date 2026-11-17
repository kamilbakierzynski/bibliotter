import type { PointerEvent } from 'react'
import { wake } from '../motion/spring'
import { dockC, edgeMotion, G, rope, setNav, sL, sR } from './layout'
import { touch } from './native'
import { PANEL_MIN, panelMax, panelWanted, resetPanelWidth, savePanelWidth, setPanelWidth } from './panelWidth'
import { ui } from './state'

/*
 * Krawędź można chwycić: reaguje na kursor, ciągnie się za ręką i odskakuje.
 * Ciągnięta dalej niż najwęższy panel zmienia jego szerokość, aż do połowy okna.
 */

interface Drag {
  x0: number
  start: number
  moved: boolean
  /** Szerokość sprzed chwycenia. Wraca, gdy panel się zamknie. */
  width: number
  /** Panel był otwarty, więc ciągnięcie w lewo go zwęża. Zamknięty poszerza się dopiero za swoją szerokością. */
  open: boolean
}

const OVERPULL_OPEN = 3.2
const OVERPULL_SHUT = 2.2
const THROW = 0.14
const DOUBLE_MS = 400

let drag: Drag | null = null
let lastClick = -Infinity

export function gripDown(e: PointerEvent<HTMLElement>): void {
  e.currentTarget.setPointerCapture(e.pointerId)
  drag = { x0: e.clientX, start: rope.target, moved: false, width: panelWanted(), open: ui.nav }
  rope.setPull(e.clientY)
  rope.bump.to(0)
}

function resize(width: number): void {
  G.panel = setPanelWidth(width, G.W)
  G.open = G.closed + G.panel
}

export function gripMove(e: PointerEvent<HTMLElement>): void {
  const y = e.clientY
  if (!drag) {
    rope.bumpY = y
    rope.bump.to(6)
    return
  }
  const dx = e.clientX - drag.x0
  if (!drag.moved && Math.abs(dx) > 3) {
    drag.moved = true
    edgeMotion()
  }
  if (!drag.moved) return
  let x = drag.start + dx
  const widest = G.closed + panelMax(G.W)
  if (x > widest) x = widest + Math.sqrt(x - widest) * OVERPULL_OPEN
  if (x < G.closed) x = G.closed - Math.sqrt(G.closed - x) * OVERPULL_SHUT
  if (x - G.closed >= PANEL_MIN && (drag.open || x > G.open)) resize(x - G.closed)
  rope.setPull(y)
  rope.target = x
  sL.to(x + G.stageGap)
  dockC.to((sL.t + sR.t) / 2)
  touch()
  wake()
}

export function gripUp(e: PointerEvent<HTMLElement>): void {
  const current = drag
  drag = null
  if (!current) return
  if (!current.moved) {
    // Drugie kliknięcie tuż po pierwszym nie przełącza panelu, tylko otwiera go w domyślnej szerokości.
    const double = e.timeStamp - lastClick < DOUBLE_MS
    lastClick = double ? -Infinity : e.timeStamp
    if (double) {
      G.panel = resetPanelWidth(G.W)
      setNav(true, e.clientY)
      return
    }
    setNav(document.getElementById('nav')?.classList.contains('is-open') !== true, e.clientY)
    return
  }
  const i = Math.round(rope.pull * (rope.n - 1))
  const thrown = rope.target + (rope.vs[i] ?? 0) * THROW
  const open = rope.target - G.closed >= PANEL_MIN || thrown > G.closed + PANEL_MIN / 2
  // Zamykanie przeciąga panel przez wszystkie szerokości, ale nie powinno zmienić tej zapamiętanej.
  if (!open) setPanelWidth(current.width, G.W)
  savePanelWidth()
  setNav(open, e.clientY)
}

export function gripLeave(): void {
  if (!drag) rope.bump.to(0)
}
