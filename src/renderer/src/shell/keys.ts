import { clamp, wake } from '../motion/spring'
import { homeKey, toggleHome, toggleHomeView } from './home'
import { inLayer, layerDocument, typesInField } from './layer'
import { els, G, popPill, setNav, tipX } from './layout'
import { cover, uncover } from './native'
import { cancelDraft, canWall, closeThread, setInsp, setTool, toggleNotesView } from './notes'
import { closeActs, closeCmd, openActs, openCmd, openMap, setMap } from './palette'
import { closePeek, closeSheet, focusPane, splitKey } from './sheets'
import { toggleMode } from './theme'
import { canAnnotate, focusedDoc, MOD, notify, pinned, ui } from './state'

const HOLD_MS = 380
const TIP_DELAY_MS = 380
const TIP_MEMORY_MS = 320
/** Wycięcie warstwy czeka, aż gasnąca wskazówka zniknie. */
const TIP_FADE_MS = 160
const FLY_HIDE_MS = 200

export interface KeyLike {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  preventDefault(): void
}

interface CapSpot {
  sel: string
  keys: string[]
  side: 'top' | 'bottom' | 'right'
  label?: string
  end?: boolean
  when?: () => boolean
}

/** Skrót przypięty do kontrolki, której dotyczy. Resztę zna ściąga, a klawisz ? do niej prowadzi. */
const HOLD: CapSpot[] = [
  { sel: '.rail [data-open-cmd]', keys: [MOD, 'K'], side: 'right' },
  { sel: '#homeBtn', keys: ['H'], side: 'right' },
  { sel: '#homeSeg', keys: ['Shift', 'H'], side: 'bottom', when: () => ui.home && ui.peek === null && !ui.setup },
  { sel: '#railMode', keys: ['T'], side: 'right' },
  { sel: '#navChev', keys: [MOD, 'B'], side: 'right' },
  { sel: '.tb[data-tool="move"]', keys: ['V'], side: 'top' },
  { sel: '.tb[data-tool="comment"]', keys: ['C'], side: 'top' },
  { sel: '.tb[data-tool="sticky"]', keys: ['N'], side: 'top' },
  { sel: '#statusBtn', keys: ['S'], side: 'top' },
  { sel: '#cmdBtn', keys: ['?'], label: 'Wszystkie skróty', side: 'top' },
  { sel: '.pane.focused [data-moved="split"]', keys: [MOD, '\\'], side: 'bottom', end: true },
  { sel: '.pane.focused [data-moved="insp"]', keys: ['I'], side: 'bottom' },
  { sel: '.pane.focused .pl-close', keys: ['X'], side: 'bottom' },
  { sel: '.pane.peek .pl-pin', keys: [MOD, '\\'], side: 'bottom' },
  { sel: '#camMap', keys: [MOD, '←', '→'], side: 'top', when: () => pinned() > 2 },
  { sel: '#viewSeg', keys: ['Shift', 'I'], side: 'bottom', when: () => ui.insp && canWall() }
]

let capTimer = 0
let tipTimer = 0
let tipLive = false
let tipOff = 0
let tipRoom = false
let tipRoomTimer = 0
let flyTimer = 0

export const fly = {
  view: null as string | null,
  left: 0,
  top: 0
}

const keyHtml = (keys: string[]): string => keys.map((key) => `<kbd>${key}</kbd>`).join('')

export function showCaps(): void {
  const box = document.getElementById('caps')
  if (!box) return
  const a = els.app.getBoundingClientRect()
  const d = els.dock.getBoundingClientRect()
  const cx = d.left + d.width / 2
  const cy = d.top + d.height / 2
  const html = HOLD.map((spot) => {
    const element = document.querySelector(spot.sel) ?? layerDocument().querySelector(spot.sel)
    const r = element?.getBoundingClientRect()
    if (!element || !r || !r.width || (spot.when && !spot.when())) return ''
    if (ui.home && ui.peek === null && element.closest('#barCtx, .pane')) return ''
    const x = spot.side === 'right' ? r.right + 7 : spot.end ? r.right : r.left + r.width / 2
    const y = spot.side === 'top' ? r.top - 9 : spot.side === 'bottom' ? r.bottom + 6 : r.top + r.height / 2
    const wait = Math.round(Math.hypot(x - cx, y - cy) * 0.2)
    const text = spot.label ? `<b>${spot.keys.join(' ')}</b>${spot.label}` : spot.keys.join(' ')
    return `<span class="kc ${spot.side}${spot.end ? ' end' : ''}" style="left:${x - a.left}px;top:${y - a.top}px;--d:${wait}ms"><kbd>${text}</kbd></span>`
  }).join('')
  box.innerHTML = html
  void box.offsetHeight
  box.classList.add('on')
  cover('caps')
}

export function hideCaps(): void {
  clearTimeout(capTimer)
  document.getElementById('caps')?.classList.remove('on')
  uncover('caps')
}

/** Przytrzymanie: Ctrl trzymany chwilę bez innego klawisza wyciąga skróty z kontrolek. */
export function holdStart(): void {
  if (ui.cmd || typesInField()) return
  clearTimeout(capTimer)
  capTimer = window.setTimeout(showCaps, HOLD_MS)
}

/** Wskazówka leży na warstwie doku, więc wycięcie musi ją objąć. */
export const tipNeedsRoom = (): boolean => tipRoom

function setTipRoom(on: boolean): void {
  tipRoom = on
  wake()
}

export function hideTip(): void {
  clearTimeout(tipTimer)
  els.tip.classList.remove('on')
  clearTimeout(tipRoomTimer)
  if (tipRoom) tipRoomTimer = window.setTimeout(() => setTipRoom(false), TIP_FADE_MS)
}

export function showTip(button: HTMLElement): void {
  const label = button.dataset.tip ?? ''
  const keys = (button.dataset.keys ?? '').replace('MOD', MOD).split(' ').filter(Boolean)
  els.tip.innerHTML = `<span>${label}</span><span class="keys">${keyHtml(keys)}</span>`
  const r = button.getBoundingClientRect()
  const a = els.app.getBoundingClientRect()
  const x = r.left - a.left + r.width / 2
  els.tip.style.bottom = `${a.bottom - r.top + 14}px`
  if (tipLive) tipX.to(x)
  else tipX.set(x)
  clearTimeout(tipRoomTimer)
  setTipRoom(true)
  els.tip.classList.add('on')
  tipLive = true
}

export function dockHover(button: HTMLElement | null): void {
  if (!button || ui.cmd || isPopOpen()) return
  clearTimeout(tipTimer)
  clearTimeout(tipOff)
  if (tipLive) showTip(button)
  else tipTimer = window.setTimeout(() => showTip(button), TIP_DELAY_MS)
}

export function dockLeave(): void {
  hideTip()
  tipOff = window.setTimeout(() => {
    tipLive = false
  }, TIP_MEMORY_MS)
}

const popElement = (): HTMLElement | null => document.getElementById('statusPop')
export const isPopOpen = (): boolean => popElement()?.classList.contains('on') ?? false

export function syncPopPill(instant = false): void {
  const pop = popElement()
  const status = focusedDoc()?.status
  const button = status ? pop?.querySelector<HTMLElement>(`[data-status="${status}"]`) : null
  if (button && pop) {
    popPill.to({ x: button.offsetLeft, y: button.offsetTop, w: button.offsetWidth, h: button.offsetHeight }, instant)
  }
}

export function togglePop(force?: boolean): void {
  const pop = popElement()
  const button = inLayer('statusBtn')
  if (!pop || !button) return
  const on = force === undefined ? !pop.classList.contains('on') : force
  if (on) {
    syncPopPill(true)
    const r = button.getBoundingClientRect()
    const a = els.app.getBoundingClientRect()
    pop.style.left = `${r.left - a.left + r.width / 2}px`
    pop.style.bottom = `${a.bottom - r.top + 16}px`
    hideTip()
    cover('pop')
  } else {
    uncover('pop')
  }
  pop.classList.toggle('on', on)
}

export function hideFly(): void {
  clearTimeout(flyTimer)
  document.getElementById('flyout')?.classList.remove('on')
  uncover('fly')
}

export function showFly(view: string, button: HTMLElement): void {
  clearTimeout(flyTimer)
  const flyout = document.getElementById('flyout')
  if (!flyout) return
  const b = button.getBoundingClientRect()
  const a = els.app.getBoundingClientRect()
  fly.view = view
  fly.left = b.right - a.left + 12
  fly.top = clamp(b.top - a.top - 6, 8, G.H - 240)
  notify()
  flyout.classList.add('on')
  cover('fly')
}

export function holdFly(): void {
  clearTimeout(flyTimer)
}

export function leaveFly(): void {
  flyTimer = window.setTimeout(hideFly, FLY_HIDE_MS)
}

function escapeStep(): void {
  if (ui.draft) cancelDraft()
  setTool('move')
  togglePop(false)
  if (ui.selNote) closeThread()
  else closePeek()
}

/** Wspólna obsługa klawiszy z powłoki i z dokumentu, który ma fokus. */
export function handleKey(e: KeyLike): void {
  const typing = typesInField()
  const mod = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (mod && k === 'k') {
    e.preventDefault()
    if (!ui.cmd) openCmd()
    else if (ui.map) setMap(false)
    else if (ui.acts) closeActs()
    else openActs()
    return
  }
  if (mod && k === 'b') {
    e.preventDefault()
    setNav(!ui.nav)
    return
  }
  if (mod && (k === '\\' || e.code === 'Backslash')) {
    e.preventDefault()
    splitKey()
    return
  }
  if (mod && pinned() > 1 && ui.peek === null && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault()
    const at = ui.order.indexOf(ui.focus) + (e.key === 'ArrowRight' ? 1 : -1)
    focusPane(ui.order[clamp(at, 0, pinned() - 1)] as number)
    return
  }
  if (ui.cmd) {
    if (e.key === 'Escape') closeCmd()
    return
  }
  if (!typing && ui.home && ui.peek === null && !ui.setup && homeKey(e)) return
  if (typing || mod || e.altKey) return
  if (ui.home && ui.peek === null && 'vcnsix'.includes(k)) return
  if (e.key === 'Escape') {
    escapeStep()
    return
  }
  const doc = focusedDoc()
  if (k === 'v') setTool('move')
  else if (k === 'c' && canAnnotate(doc)) setTool(ui.tool === 'comment' ? 'move' : 'comment')
  else if (k === 'n' && canAnnotate(doc)) setTool(ui.tool === 'sticky' ? 'move' : 'sticky')
  else if (k === 'i') {
    if (e.shiftKey) toggleNotesView()
    else setInsp(!ui.insp)
  } else if (k === 's' && canAnnotate(doc)) togglePop()
  else if (k === 'x') closeSheet(ui.focus)
  else if (k === 'h') {
    if (e.shiftKey) toggleHomeView()
    else toggleHome()
  } else if (k === 't') toggleMode()
  else if (e.key === '?') openMap()
}
