import { Pill, rectIn, renderPills } from '../motion/pill'
import { Rope } from '../motion/rope'
import { clamp, connectLoop, lerp, Spring, type SpringOptions, wake } from '../motion/spring'
import { fitHome, renderMorph, renderZoom } from './home'
import { hideFly, tipNeedsRoom } from './keys'
import { inLayer, placeLayer } from './layer'
import { noteQuiet, touch, trackQuiet } from './native'
import { onWall, renderHangs, syncPanelMode } from './notes'
import { releaseUnused } from './sheets'
import { canAnnotate, focusedDoc, isOpen, MAX_SHEETS, notify, type PanelView, pinned, ui } from './state'

/*
 * Geometria powłoki i rysowanie klatki. Układ jest zawsze prawdą: `sheetRects` mówi, gdzie
 * arkusz stoi, a sprężyny `dl` i `dw` gaszą różnicę po zmianie, więc przerwane przejście
 * zachowuje prędkość, a układ idzie wiernie za sceną.
 */

export interface Sheet {
  i: number
  /** Element `.pane`. */
  el: HTMLElement | null
  /** Element `.sheet`, nad którym stoi widok dokumentu. */
  box: HTMLElement | null
  dl: Spring
  dw: Spring
  o: Spring
  l: number
  w: number
  x: number
  wide: number
  floating: boolean
}

const elementIds = {
  app: 'app',
  nav: 'nav',
  panel: 'panel',
  scroll: 'panelScroll',
  navClip: 'navClip',
  chev: 'navChev',
  grip: 'navGrip',
  stage: 'stage',
  scrim: 'scrim',
  insp: 'insp',
  inspIn: 'inspIn',
  lights: 'lights',
  handle: 'splitHandle',
  home: 'home',
  homeBody: 'homeBody'
} as const

/** Dok i paleta leżą na stronie warstwy. */
const layerIds = {
  dock: 'dock',
  bar: 'bar',
  barCtx: 'barCtx',
  barCtxIn: 'barCtxIn',
  tray: 'tray',
  trayIn: 'trayIn',
  camBox: 'camBox',
  camIn: 'camIn',
  cmd: 'cmd',
  tip: 'tip'
} as const

export const els = {} as Record<keyof typeof elementIds | keyof typeof layerIds, HTMLElement>

export function bindElements(): void {
  const bind = (ids: Record<string, string>, find: (id: string) => HTMLElement | null): void => {
    for (const [name, id] of Object.entries(ids)) {
      const element = find(id)
      if (!element) throw new Error(`Brak elementu #${id}`)
      els[name as keyof typeof els] = element
    }
  }
  bind(elementIds, (id) => document.getElementById(id))
  bind(layerIds, inLayer)
}

export const G = {
  W: 0,
  H: 0,
  railLeft: 0,
  rail: 0,
  panel: 0,
  navTop: 0,
  navBot: 0,
  shapeLeft: 0,
  r: 0,
  stageTop: 0,
  stageBot: 0,
  stageGap: 0,
  stageRight: 0,
  insW: 0,
  insTop: 0,
  insBot: 0,
  rDock: 0,
  dockBot: 0,
  dockZone: 0,
  closed: 0,
  open: 0,
  cmdW: 0,
  cmdH: 0,
  overlay: false
}

/** Wysokość tabliczki nad arkuszem. */
export const PLACARD = 36
export const PAIR_GAP = 10
export const ROW_GAP = 18
export const PEEK_W = 0.58
export const OFF = 24
export const OPEN: SpringOptions = { k: 170, z: 0.74 }
export const SHUT: SpringOptions = { k: 240, z: 0.9 }
const rowWidth = (w: number): number => Math.max(480, w * 0.64)
const DOCK_H = 52
const NARROW_W = 860
/** Zapas wycięcia na cień doku. Zasłania dokument, więc jest mały. */
const LAYER_SIDE = 20
const LAYER_TOP = 8
/** Cień palety jest większy, a dokumenty pod nią i tak stoją. */
const PALETTE_SIDE = 46
const PALETTE_TOP = 20
/** W ruchu wycięcie bierze zapas na przestrzelenie sprężyn. */
const LAYER_SLACK = 28
/** Wskazówka stoi nad dokiem i ma swój cień. */
const TIP_ROOM = 44
const TIP_SIDE = 12

export const navL = new Spring(10, 240, 0.9)
export const navT = new Spring(10, 240, 0.9)
export const navB = new Spring(700, 240, 0.9)
export const navR = new Spring(22, 240, 0.9)
export const insB = new Spring(1000, 240, 0.9)
export const insT = new Spring(40, 240, 0.9)
export const insE = new Spring(700, 240, 0.9)
export const sL = new Spring(0, 135, 0.8)
export const sR = new Spring(0, 170, 0.84)
export const dockC = new Spring(0, 118, 0.8)
export const dockIn = new Spring(0, 150, 0.68)
export const trayW = new Spring(0, 300, 0.7)
export const mW = new Spring(0)
export const mH = new Spring(0)
export const ratio = new Spring(0.56, 320, 0.9)
export const tipX = new Spring(0, 460, 0.84)
export const camX = new Spring(0, 135, 0.8)
export const camW = new Spring(0, 300, 0.7)
export const ctxP = new Spring(0, 240, 0.84)
export const glowD = new Spring(0, 42, 1)

export const sheets: Sheet[] = Array.from({ length: MAX_SHEETS }, (_, i) => ({
  i,
  el: null,
  box: null,
  dl: new Spring(0, 170, 0.74),
  dw: new Spring(0, 170, 0.74),
  o: new Spring(0, 260, 1),
  l: 0,
  w: 0,
  x: 0,
  wide: 0,
  floating: false
}))

export const rope = new Rope('right', () => ({ base: navL.x, top: navT.x, bottom: navB.x, r: navR.x }))
export const insRope = new Rope('left', () => ({ base: insB.x, top: insT.x, bottom: insE.x, r: navR.x }))
insRope.k = 210
insRope.z = 0.7
insRope.pull = 0.5

export const railPill = new Pill()
export const railHover = new Pill()
export const selPill = new Pill()
export const hoverPill = new Pill()
export const toolPill = new Pill('x')
export const cmdPill = new Pill()
export const popPill = new Pill()
export const actPill = new Pill()
export const viewPill = new Pill('x')
export const homePill = new Pill('x')
export const spisPill = new Pill()

/** Ciała, które ruszają dopiero, gdy arkusze staną się zrzutami. */
export function sheetBodies(): Spring[] {
  return [sL, sR, camX, ratio, ...sheets.flatMap((s) => [s.dl, s.dw, s.o])]
}

export function measure(): void {
  const style = getComputedStyle(document.documentElement)
  const n = (name: string): number => parseFloat(style.getPropertyValue(name))
  const box = els.app.getBoundingClientRect()
  Object.assign(G, {
    W: box.width,
    H: box.height,
    railLeft: n('--rail-left'),
    rail: n('--rail'),
    panel: n('--panel'),
    navTop: n('--nav-top'),
    navBot: n('--nav-bot'),
    shapeLeft: n('--shape-left'),
    r: n('--r-shell'),
    stageTop: n('--stage-top'),
    stageBot: n('--stage-bot'),
    stageGap: n('--stage-gap'),
    stageRight: n('--stage-right'),
    insW: n('--insp'),
    insTop: n('--insp-top'),
    insBot: n('--insp-bot'),
    rDock: n('--r-dock'),
    dockBot: n('--dock-bot'),
    dockZone: n('--dock-zone')
  })
  G.closed = G.railLeft + G.rail
  G.open = G.closed + G.panel
  G.cmdW = Math.min(760, G.W - 32)
  G.cmdH = Math.min(558, G.H - 40)
  G.overlay = G.W < 1180
  document.documentElement.classList.toggle('narrow', G.W <= NARROW_W)
  els.cmd.style.width = `${G.cmdW}px`
  els.cmd.style.height = `${G.cmdH}px`
}

const stageEdges = (): { left: number; right: number; base: number } => {
  const edge = ui.nav ? G.open : G.closed
  const base = G.W - G.stageRight
  return { left: edge + G.stageGap, right: base - (ui.insp && !G.overlay ? G.insW + G.stageGap : 0), base }
}

export function applyLayout(pullY?: number): void {
  measure()
  syncPanelMode()
  navL.to(G.shapeLeft)
  navT.to(G.navTop)
  navB.to(G.H - G.navBot)
  navR.to(G.r)
  const { left, right, base } = stageEdges()
  rope.to(ui.nav ? G.open : G.closed, pullY)
  insB.to(base)
  insT.to(G.insTop)
  insE.to(G.H - G.insBot)
  insRope.to(ui.insp && !onWall() ? base - G.insW : base)
  sL.to(left)
  sR.to(right)
  dockC.to((sL.t + sR.t) / 2)
  syncChrome()
  syncCam()
  touch()
  wake()
}

/** Zmiana rozmiaru okna nie jest ruchem: krawędzie idą za oknem, a dokument żyje dalej. */
export function applyResize(): void {
  measure()
  syncPanelMode()
  navL.set(G.shapeLeft)
  navT.set(G.navTop)
  navB.set(G.H - G.navBot)
  navR.set(G.r)
  const { left, right, base } = stageEdges()
  rope.place(ui.nav ? G.open : G.closed)
  insB.set(base)
  insT.set(G.insTop)
  insE.set(G.H - G.insBot)
  insRope.place(ui.insp && !onWall() ? base - G.insW : base)
  sL.set(left)
  sR.set(right)
  dockC.set((sL.t + sR.t) / 2)
  syncChrome()
  syncCam()
  if (camX.t !== camX.x) camX.set(camX.t)
  noteQuiet()
}

/** Pierwsze ustawienie sceny, zanim nawigacja wyjedzie na linie. */
export function placeInitial(): void {
  measure()
  navL.set(G.shapeLeft)
  navT.set(G.navTop)
  navB.set(G.H - G.navBot)
  navR.set(G.r)
  rope.place(G.closed)
  const base = G.W - G.stageRight
  insB.set(base)
  insT.set(G.insTop)
  insE.set(G.H - G.insBot)
  insRope.place(base)
  sL.set(G.closed + G.stageGap)
  sR.set(base)
  dockC.set((G.open + G.stageGap + base) / 2)
  rope.T = navT.x
  rope.B = navB.x
}

export function sheetRects(w: number, atTarget = false): { l: number; w: number }[] {
  const rects = sheets.map((s) => ({ l: s.l, w: s.w }))
  const n = ui.home ? 0 : pinned()
  const split = atTarget ? ratio.t : ratio.x
  const cam = atTarget ? camX.t : camX.x
  const [first, second] = ui.order
  if (n === 1 && first !== undefined) rects[first] = { l: 0, w }
  if (n === 2 && first !== undefined && second !== undefined) {
    const side = (w - PAIR_GAP) * (1 - split)
    rects[first] = { l: 0, w: w - PAIR_GAP - side }
    rects[second] = { l: w - side, w: side }
  }
  if (n > 2) {
    const W = rowWidth(w)
    ui.order.forEach((p, i) => {
      rects[p] = { l: i * (W + ROW_GAP) - cam, w: W }
    })
  }
  if (ui.peek !== null) rects[ui.peek] = { l: w * (1 - PEEK_W), w: w * PEEK_W }
  return rects
}

/** Zmiana układu zapisuje różnicę, a sprężyna ją gasi. */
export function reflow(change: () => void, options: SpringOptions = OPEN): void {
  const w = sR.x - sL.x
  const before = sheetRects(w)
  change()
  const after = sheetRects(w)
  sheets.forEach((s, i) => {
    const open = isOpen(i)
    const from = before[i] as { l: number; w: number }
    const to = after[i] as { l: number; w: number }
    if (open && s.o.x < 0.02) {
      s.dl.x = w + OFF - to.l
      s.dl.v = 0
      s.dw.x = 0
      s.dw.v = 0
    } else {
      s.dl.x += from.l - to.l
      s.dw.x += from.w - to.w
    }
    s.dl.to(0, options)
    s.dw.to(0, options)
    s.o.to(open ? 1 : 0)
  })
  syncChrome()
  syncCam()
  touch()
  notify()
}

function layoutSheets(w: number): void {
  const rects = sheetRects(w)
  for (const s of sheets) {
    const r = rects[s.i] as { l: number; w: number }
    if (isOpen(s.i)) {
      s.l = r.l
      s.w = r.w
    }
    s.x = r.l + s.dl.x
    // Przestrzelenie ciągnie tylko krawędź prowadzącą: prawy brzeg zostaje przy ścianie.
    s.wide = Math.max(0, r.w + s.dw.x + (s.dl.x < 0 && r.l + r.w > w - 1 ? -s.dl.x : 0))
    if (!s.el) continue
    s.el.style.left = `${s.x}px`
    s.el.style.width = `${s.wide}px`
    s.el.style.opacity = String(clamp(s.o.x * 1.6))
    s.el.style.visibility = s.o.x < 0.01 ? 'hidden' : 'visible'
  }
  // Tytuł gaśnie tam, gdzie zachodzi na niego zerknięcie, także w drodze do przypięcia.
  const top = sheets.find((s) => s.floating && s.o.x > 0.01)
  for (const s of sheets) {
    if (s.floating && ui.peek !== s.i && isOpen(s.i) && Math.abs(s.dl.x) + Math.abs(s.dw.x) < 12) {
      s.floating = false
    }
    if (!s.el) continue
    const edge = !top || s === top || (ui.peek === null && s.x >= top.x) ? Infinity : top.x - s.x - 8
    const over = s.wide - edge
    s.el.style.setProperty('--vis', over > 0 ? `${edge}px` : '')
    s.el.style.setProperty('--fade', over > 0 ? `${Math.min(32, over)}px` : '')
  }
  const [firstSlot] = ui.order
  const a = sheets[firstSlot ?? 0] as Sheet
  const calm = pinned() === 2 && ui.peek === null && !ui.home ? clamp(1 - Math.abs(a.dw.x) / 30) : 0
  els.handle.style.left = `${a.x + a.wide + PAIR_GAP / 2 - 8}px`
  els.handle.style.opacity = String(calm)
  els.handle.style.pointerEvents = calm > 0.9 ? 'auto' : 'none'
}

export function syncCam(): void {
  const n = pinned()
  if (n < 3) {
    if (camX.x) camX.set(0)
    return
  }
  const w = sR.t - sL.t
  const W = rowWidth(w)
  const max = Math.max(0, n * (W + ROW_GAP) - ROW_GAP - w)
  const at = ui.order.indexOf(ui.peek === null ? ui.focus : ui.back)
  camX.to(clamp(at * (W + ROW_GAP) - (w - W) / 2, 0, max))
}

let revealEls: { el: HTMLElement; x: number; y: number }[] = []

export function cacheReveal(): void {
  const b = els.app.getBoundingClientRect()
  revealEls = [...els.panel.querySelectorAll<HTMLElement>('.rv')].map((el) => {
    const r = el.getBoundingClientRect()
    return { el, x: r.left - b.left, y: r.top + r.height / 2 - b.top }
  })
}

export function edgeMotion(): void {
  cacheReveal()
  els.nav.classList.add('moving')
  els.nav.classList.remove('is-open')
}

export function setNav(open: boolean, pullY?: number): void {
  ui.nav = open
  hideFly()
  edgeMotion()
  applyLayout(pullY === undefined ? navT.x + 30 : pullY)
}

/** Ponowny wybór tego samego widoku zwija panel. */
export function setView(view: PanelView, y?: number): void {
  const same = ui.view === view
  ui.view = view
  hoverPill.hide()
  notify()
  syncRail()
  if (!ui.nav) setNav(true, y)
  else if (same) setNav(false, y)
}

/** Kolor poświaty idzie z dokumentu, a jej środek za sceną. */
export function paintGlow(colors: [string, string, string]): void {
  const style = els.lights.style
  style.setProperty('--g1', colors[0])
  style.setProperty('--g2', colors[1])
  style.setProperty('--g3', colors[2])
}

export function syncChrome(): void {
  const root = document.documentElement
  const { stage, home } = els
  const atHome = ui.home && ui.peek === null
  stage.classList.toggle('under-caption', !ui.insp || G.overlay)
  home.classList.toggle('on', ui.home)
  home.classList.toggle('setup', ui.setup !== null)
  root.classList.toggle('at-home', atHome)
  root.classList.toggle('no-lib', ui.setup !== null)
  ctxP.to(atHome || !canAnnotate(focusedDoc()) ? 0 : 1)
  const many = (pinned() > 1 && !ui.home) || ui.peek !== null
  const last = ui.peek === null ? ui.order[pinned() - 1] : ui.peek
  for (const s of sheets) {
    s.el?.classList.toggle('last', s.i === last)
    s.el?.classList.toggle('focused', s.i === ui.focus)
  }
  stage.classList.toggle('split', many)
  stage.classList.toggle('peeking', ui.peek !== null)
  root.classList.toggle('split-dim', many)
}

function settle(): void {
  els.navClip.style.clipPath = ''
  els.nav.classList.remove('moving')
  els.nav.classList.toggle('is-open', ui.nav)
  syncSel(true)
  for (const s of sheets) {
    if (!isOpen(s.i)) s.el?.classList.remove('peek')
    if (ui.peek !== s.i) s.floating = false
  }
  releaseUnused()
  noteQuiet()
}

/** Wycięcie obejmuje dok, a w ruchu także miejsce, do którego dok zmierza. */
function fitLayer(left: number, cw: number, ch: number, barW: number, ctx: number): void {
  const barAim = barW + trayW.t - trayW.x + camW.t - camW.x + (ctxP.t - ctx) * els.barCtxIn.offsetWidth
  const aimW = mW.t > 0 ? G.cmdW : barAim
  const aimH = mH.t > 0 ? G.cmdH : DOCK_H
  const aimL = lerp(dockC.t, G.W / 2, mW.t) - aimW / 2
  const tip = tipNeedsRoom()
  const rest =
    Math.abs(left - aimL) < 0.5 &&
    Math.abs(cw - aimW) < 0.5 &&
    Math.abs(ch - aimH) < 0.5 &&
    (!tip || Math.abs(tipX.x - tipX.t) < 0.5)
  const tall = Math.max(ch, aimH)
  const big = tall > DOCK_H + 1
  const side = (big ? PALETTE_SIDE : LAYER_SIDE) + (rest ? 0 : LAYER_SLACK)
  let from = Math.min(left, aimL) - side
  let to = Math.max(left + cw, aimL + aimW) + side
  let top = G.H - G.dockBot - tall - (big ? PALETTE_TOP : tip ? TIP_ROOM : LAYER_TOP)
  if (tip) {
    const half = els.tip.offsetWidth / 2 + TIP_SIDE
    from = Math.min(from, tipX.x - half, tipX.t - half)
    to = Math.max(to, tipX.x + half, tipX.t + half)
    top = Math.min(top, G.H - G.dockBot - DOCK_H - TIP_ROOM)
  }
  const x = Math.max(0, Math.floor(from))
  const y = Math.max(0, Math.floor(top))
  const width = Math.min(Math.round(G.W), Math.ceil(to)) - x
  placeLayer({ x, y, width, height: Math.round(G.H) - y }, rest)
}

export function render(): void {
  rope.render()
  insRope.render()
  if (els.nav.classList.contains('moving')) {
    for (const r of revealEls) r.el.style.setProperty('--e', `${(rope.edgeAt(r.y) - r.x).toFixed(1)}px`)
    els.navClip.style.clipPath = `path('${rope.path?.getAttribute('d') ?? ''}')`
  }
  const y = navT.x + 30
  const p = clamp((rope.mean - G.closed) / (G.open - G.closed))
  els.chev.style.transform = `translate(${rope.edgeAt(y) - 11}px,${y - 11}px) rotate(${180 * (1 - p)}deg)`
  els.grip.style.transform = `translateX(${rope.mean - 8}px)`

  const w = sR.x - sL.x
  const { stage } = els
  stage.style.left = `${sL.x}px`
  stage.style.width = `${w}px`
  stage.style.clipPath = `inset(-80px -4000px -80px ${G.shapeLeft + 8 - sL.x}px)`
  const m = clamp(mH.x)
  stage.style.transform = m > 0.001 ? `scale(${1 - 0.022 * m})` : ''
  layoutSheets(w)
  els.lights.style.setProperty('--sx', `${sL.x + w / 2 + glowD.x}px`)
  if (ui.home) fitHome()
  renderZoom()
  renderMorph()

  const ctx = clamp(ctxP.x)
  els.barCtx.style.width = ctx > 0.999 ? '' : `${els.barCtxIn.offsetWidth * ctx}px`
  els.barCtx.style.opacity = String(clamp(ctx * 1.4 - 0.4))
  // Szerokości przed pomiarem, bo inaczej dok spóźnia się o klatkę i przycina własną treść.
  els.tray.style.width = `${Math.max(0, trayW.x)}px`
  els.camBox.style.width = `${Math.max(0, camW.x)}px`
  const barW = els.bar.offsetWidth
  const cw = lerp(barW, G.cmdW, mW.x)
  const ch = lerp(DOCK_H, G.cmdH, mH.x)
  const { dock, bar, cmd } = els
  const left = lerp(dockC.x, G.W / 2, clamp(mW.x)) - cw / 2
  fitLayer(left, cw, ch, barW, ctx)
  dock.style.width = `${cw}px`
  dock.style.height = `${ch}px`
  dock.style.left = `${left}px`
  dock.style.borderRadius = `${lerp(G.rDock, 22, m)}px`
  dock.style.transform = `translateY(${(1 - dockIn.x) * 84}px)`
  const fade = clamp(1 - mH.x * 3.4)
  bar.style.opacity = String(fade)
  bar.style.filter = fade < 1 ? `blur(${(1 - fade) * 5}px)` : ''
  bar.style.visibility = fade <= 0.01 ? 'hidden' : 'visible'
  const c = clamp((mH.x - 0.28) / 0.5)
  cmd.style.opacity = String(c)
  cmd.style.transform = `translate(-50%,${(1 - c) * 10}px)`
  cmd.style.visibility = c <= 0.01 && !ui.cmd ? 'hidden' : 'visible'
  els.scrim.style.opacity = String(m)

  const ip = Math.max(clamp((insB.x - sR.x - G.stageGap) / G.insW), clamp((insB.x - insRope.mean) / G.insW))
  els.inspIn.style.opacity = String(clamp(ip * 1.7 - 0.6))
  els.inspIn.style.transform = `translateX(${(1 - ip) * 16}px)`

  renderHangs()
  renderPills()
  els.tip.style.transform = `translateX(${tipX.x}px) translateX(-50%)`
  trackQuiet()
}

export function connectFrames(): void {
  connectLoop(render, settle)
}

export function syncRail(instant = false): void {
  const rail = document.getElementById('rail')
  const button = rail?.querySelector(`.rb[data-view="${ui.view}"]`)
  if (rail && button) railPill.to(rectIn(button, rail), instant)
}

export function syncSel(instant = false): void {
  const { scroll } = els
  const id = ui.panes[ui.focus]
  const atHome = ui.home && ui.peek === null
  const row = !atHome && id ? scroll.querySelector<HTMLElement>(`.row[data-doc="${CSS.escape(id)}"]`) : null
  const shown = row !== null && row.getClientRects().length > 0 && row.getBoundingClientRect().height > 8
  if (shown) selPill.to(rectIn(row, scroll), instant)
  else selPill.hide()
  for (const r of scroll.querySelectorAll('.row[data-doc]')) r.classList.toggle('on', shown && r === row)
}
