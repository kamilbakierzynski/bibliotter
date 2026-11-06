import type { PointerEvent } from 'react'
import { wake } from '../motion/spring'
import { dockC, edgeMotion, G, rope, setNav, sL, sR } from './layout'
import { touch } from './native'

/* Krawędź można chwycić: reaguje na kursor, ciągnie się za ręką i odskakuje. */

interface Drag {
  x0: number
  start: number
  moved: boolean
}

const OVERPULL_OPEN = 3.2
const OVERPULL_SHUT = 2.2
const THROW = 0.14

let drag: Drag | null = null

export function gripDown(e: PointerEvent<HTMLElement>): void {
  e.currentTarget.setPointerCapture(e.pointerId)
  drag = { x0: e.clientX, start: rope.target, moved: false }
  rope.setPull(e.clientY)
  rope.bump.to(0)
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
  if (x > G.open) x = G.open + Math.sqrt(x - G.open) * OVERPULL_OPEN
  if (x < G.closed) x = G.closed - Math.sqrt(G.closed - x) * OVERPULL_SHUT
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
    setNav(document.getElementById('nav')?.classList.contains('is-open') !== true, e.clientY)
    return
  }
  const i = Math.round(rope.pull * (rope.n - 1))
  setNav(rope.target + (rope.vs[i] ?? 0) * THROW > (G.open + G.closed) / 2, e.clientY)
}

export function gripLeave(): void {
  if (!drag) rope.bump.to(0)
}
