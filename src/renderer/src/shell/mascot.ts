import type { MouseEvent, PointerEvent } from 'react'
import { toggleHome } from './home'

/*
 * Znak w pasku od czasu do czasu robi jedną drobną rzecz: mruga, rozgląda się, zerka na kartkę,
 * węszy, strzyże uchem albo bębni łapami. Robi to tylko w spoczynku, czyli gdy okno ma fokus,
 * nikt nie pisze, a system nie prosi o ograniczenie ruchu. Złapany i przeciągnięty daje się głaskać.
 */

const ACTS: readonly (readonly [string, number])[] = [
  ['look', 2000],
  ['read', 2000],
  ['sniff', 1200],
  ['ear', 700],
  ['drum', 1300]
]
const BLINK_MS = 260
/** Mruganie to połowa czynności, bo jest najmniej natrętne. */
const BLINK_SHARE = 0.45
const QUIET_MS = 4000
const NEXT_MIN = 25_000
const NEXT_SPREAD = 45_000
/** Tyle trzeba przeciągnąć, żeby kliknięcie przestało prowadzić na stronę główną. */
const DRAG_PX = 8
/** Tyle głaskania potrzeba, żeby wydra zmrużyła oczy. */
const PET_PX = 150
const HAPPY_MS = 1600

const still = matchMedia('(prefers-reduced-motion: reduce)')
let logo: HTMLElement | null = null
let lastKey = 0
let timer = 0
let happyTimer = 0
let press: { x: number; lx: number; ly: number; travel: number } | null = null
let dragged = false

const resting = (): boolean =>
  !document.hidden && document.hasFocus() && performance.now() - lastKey > QUIET_MS && !still.matches

function act(name: string, ms: number): void {
  const el = logo
  if (!el) return
  el.classList.add(`do-${name}`)
  window.setTimeout(() => el.classList.remove(`do-${name}`), ms)
}

function pickAct(): void {
  if (Math.random() < BLINK_SHARE) {
    act('blink', BLINK_MS)
    return
  }
  const [name, ms] = ACTS[Math.floor(Math.random() * ACTS.length)] ?? ACTS[0]!
  act(name, ms)
}

function schedule(): void {
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    if (logo && resting() && !press) pickAct()
    schedule()
  }, NEXT_MIN + Math.random() * NEXT_SPREAD)
}

window.addEventListener('keydown', () => (lastKey = performance.now()), true)

export function bindLogo(el: HTMLElement | null): void {
  logo = el
  if (el) schedule()
  else clearTimeout(timer)
}

const mark = (): SVGElement | null => logo?.querySelector<SVGElement>('.mark') ?? null

function happy(): void {
  logo?.classList.add('happy')
  clearTimeout(happyTimer)
  happyTimer = window.setTimeout(() => logo?.classList.remove('happy'), HAPPY_MS)
}

export function logoDown(e: PointerEvent<HTMLElement>): void {
  if (e.button !== 0) return
  press = { x: e.clientX, lx: e.clientX, ly: e.clientY, travel: 0 }
  dragged = false
}

export function logoMove(e: PointerEvent<HTMLElement>): void {
  if (!press) return
  press.travel += Math.abs(e.clientX - press.lx) + Math.abs(e.clientY - press.ly)
  press.lx = e.clientX
  press.ly = e.clientY
  if (!dragged && press.travel > DRAG_PX) {
    dragged = true
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.classList.add('petting')
  }
  if (!dragged) return
  const tilt = Math.max(-7, Math.min(7, (e.clientX - press.x) / 4))
  const svg = mark()
  if (svg && !still.matches) svg.style.transform = `rotate(${tilt}deg)`
  if (press.travel > PET_PX) happy()
}

export function logoUp(e: PointerEvent<HTMLElement>): void {
  press = null
  e.currentTarget.classList.remove('petting')
  const svg = mark()
  if (svg) svg.style.transform = ''
}

/** Kliknięcie prowadzi na stronę główną, chyba że właśnie skończyło się głaskanie. */
export function logoClick(e: MouseEvent<HTMLElement>): void {
  if (dragged) {
    dragged = false
    e.preventDefault()
    return
  }
  toggleHome()
}
