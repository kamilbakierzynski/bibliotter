import { clamp, Spring } from '../motion/spring'
import { readStored, ui, writeStored } from './state'

/*
 * Terminal stoi obok dokumentów, z prawej albo pod nimi, a scena cofa się przed nim jak przed
 * panelem uwag. Nieprzypięty należy do dokumentu, przy którym go otwarto, i chowa się, gdy ten
 * dokument schodzi ze sceny. Przypięty zostaje na miejscu przy każdym dokumencie.
 *
 * Ten moduł zna tylko stan i geometrię, żeby układ sceny mógł go czytać bez cyklu importów.
 */

export type TermSide = 'right' | 'bottom'

const SIDE_KEY = 'terminalSide'
const SIZE_KEY = 'terminalSize'
/** Stan sesji przechodzi przez przeładowanie strony, bo powłoka w procesie głównym działa dalej. */
export const KEPT_KEY = 'keptTerminal'

const MIN_W = 300
const MIN_H = 120
/** Tyle sceny musi zostać dokumentom obok terminala. */
const DOC_MIN_W = 380
const DOC_MIN_H = 220

function readSizes(): { right: number | null; bottom: number | null } {
  try {
    const parsed = JSON.parse(readStored(SIZE_KEY) ?? '{}') as { right?: unknown; bottom?: unknown }
    const size = (value: unknown): number | null => (typeof value === 'number' && value > 0 ? value : null)
    return { right: size(parsed.right), bottom: size(parsed.bottom) }
  } catch {
    return { right: null, bottom: null }
  }
}

export const term = {
  /** Użytkownik chce widzieć terminal. Co z tego wynika, mówi `termShown`. */
  want: false,
  side: (readStored(SIDE_KEY) === 'bottom' ? 'bottom' : 'right') as TermSide,
  pinned: false,
  /** Dokument, do którego należy nieprzypięty terminal. */
  owner: null as string | null,
  session: null as number | null,
  cwd: '',
  /** Rozmiar wybrany przeciągnięciem krawędzi. Bez niego terminal bierze część sceny. */
  size: readSizes(),
  /** Czy ostatni układ sceny liczył się z terminalem. */
  applied: false
}

export function saveSide(): void {
  writeStored(SIDE_KEY, term.side)
}

export function saveSize(): void {
  writeStored(SIZE_KEY, JSON.stringify(term.size))
}

/** Lewy brzeg terminala z prawej i zarazem prawy brzeg panelu uwag. Bez terminala to brzeg okna. */
export const tR = new Spring(0, 170, 0.84)
/** Dolna krawędź sceny. Bez terminala to `--stage-bot`, z terminalem pod spodem jest wyżej. */
export const sB = new Spring(0, 170, 0.84)

export function termShown(): boolean {
  if (!term.want || ui.home || ui.presenting || ui.setup !== null) return false
  return term.pinned || (term.owner !== null && ui.order.some((i) => ui.panes[i] === term.owner))
}

/** Szerokość terminala z prawej przy danej szerokości sceny. */
export function termWidth(stage: number): number {
  const max = Math.max(MIN_W, stage - DOC_MIN_W)
  return Math.round(clamp(term.size.right ?? stage * 0.4, MIN_W, max))
}

/** Wysokość terminala pod spodem przy danej wysokości sceny. */
export function termHeight(stage: number): number {
  const max = Math.max(MIN_H, stage - DOC_MIN_H)
  return Math.round(clamp(term.size.bottom ?? stage * 0.34, MIN_H, max))
}

/** Ile miejsca terminal zabiera scenie z prawej i od dołu, razem z odstępem. */
export function termRoom(stageW: number, stageH: number, gap: number): { right: number; bottom: number } {
  if (!termShown()) return { right: 0, bottom: 0 }
  return term.side === 'right' ? { right: termWidth(stageW) + gap, bottom: 0 } : { right: 0, bottom: termHeight(stageH) + gap }
}

/** Ile terminal trzyma klawiaturę, zanim proces główny przeniesie fokus na powłokę okna. */
const CLAIM_MS = 1000
let claimedAt = -Infinity
/** Ukryty panel nie przyjmie fokusu, więc fokus czeka na pierwszą klatkę, w której panel już widać. */
let focusWanted: (() => void) | null = null

export function claimKeyboard(focus: (() => void) | null = null): void {
  claimedAt = performance.now()
  focusWanted = focus
}

/**
 * Klawiatura jest w terminalu. Zaraz po kliknięciu przycisku okno ma jeszcze fokus w dokumencie,
 * więc przez chwilę liczy się samo pole xterm, inaczej dokument odebrałby klawiaturę.
 */
export function termHasKeyboard(): boolean {
  if (!termShown()) return false
  if (performance.now() - claimedAt < CLAIM_MS) return true
  return document.hasFocus() && !!document.activeElement?.closest('.term')
}

let termEl: HTMLElement | null = null

export function bindTerminal(element: HTMLElement | null): void {
  termEl = element
}

/** Woła się co klatkę z `render`, po ustawieniu sceny. */
export function renderTerminal(left: number, right: number, base: number, height: number, stageBot: number, gap: number): void {
  const el = termEl
  if (!el) return
  let box: { x: number; y: number; w: number; h: number }
  if (term.side === 'right') {
    // Z prawej terminal stoi przy brzegu okna, a między nim a arkuszami mieści się panel uwag.
    box = { x: tR.x + gap, y: 0, w: base - tR.x - gap, h: 0 }
  } else {
    const top = height - sB.x + gap
    box = { x: left, y: top, w: right - left, h: height - stageBot - top }
  }
  const open = term.side === 'right' ? box.w : box.h
  el.style.left = `${box.x}px`
  el.style.width = `${Math.max(0, box.w)}px`
  if (term.side === 'bottom') {
    el.style.top = `${box.y}px`
    el.style.height = `${Math.max(0, box.h)}px`
  } else {
    el.style.top = ''
    el.style.height = ''
  }
  el.style.opacity = String(clamp(open / 80))
  el.style.visibility = open < 2 ? 'hidden' : 'visible'
  if (focusWanted && open >= 2) {
    const focus = focusWanted
    focusWanted = null
    focus()
  }
}

export function syncTerminalChrome(underCaption: boolean): void {
  termEl?.classList.toggle('under-caption', underCaption && term.side === 'right')
}
