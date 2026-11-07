import type { DocEntry } from '../../../shared/types'
import { clamp, lerp, Spring, wake } from '../motion/spring'
import { type KeyLike, togglePop } from './keys'
import { closeLabelPop } from './labels'
import { els, glowD, homePill, paintGlow, reflow, sheets, SHUT, spisPill, sL, sR, syncChrome, OFF } from './layout'
import { aimAt, clearFrames, touch } from './native'
import { setInsp, setSelNote, setTool } from './notes'
import { applyGlow, closePeek, openDoc, peekDoc, setPane, syncFocus } from './sheets'
import { data, type FormatFilter, memo, notify, pinned, saveFormat, ui, visibleDocs, waiting } from './state'

/*
 * Ekran startowy to warstwa na ścianie, pod arkuszami. Ściana i Spis to ten sam zbiór
 * dokumentów, więc arkusz składa się do swojego wiersza, a wiersz rozkłada się w arkusz.
 */

const ZOOM_IN = { k: 420, z: 0.92 }
const ZOOM_OUT = { k: 300, z: 0.92 }
/** Reszta drogi to mniej niż trzy piksele, a żywy dokument czeka na koniec powiększenia. */
const ZOOM_DONE = 0.006
/** Tyle dokumentów mieści się na ścianie, zanim stanie się spisem wszystkiego. */
const HOME_LIMIT = 36
const HEAD_H = 36
/** Odstępy ściany razem z miejscem na dok, który pływa nad jej dołem. */
const WALL_PAD = 204

export const zoomP = new Spring(1, 150, 0.84)
export const viewP = new Spring(0, 165, 0.86)

interface Zoom {
  i: number
  out: boolean
  sheet: HTMLElement
  thumb: HTMLElement
  placard: HTMLElement
  k: number
  dx: number
  dy: number
  h0: number
  h1: number
}

interface MorphItem {
  hs: HTMLElement
  row: HTMLElement
  cap: HTMLElement
  k: number
  dx: number
  dy: number
}

let zoom: Zoom | null = null
let homeIdx = -1
let homeFit = ''
let glowEl: HTMLElement | null = null
const morph = { items: [] as MorphItem[], q: -1, wall: null as HTMLElement | null, list: null as HTMLElement | null }

export const zoomBusy = (): boolean => zoom !== null

const rank = (doc: DocEntry): number => (waiting(doc) ? 0 : doc.status === 'to-read' ? 1 : 2)

/** Wszystko, co mogłoby wisieć na ścianie. */
const wallDocs = memo(
  () => [visibleDocs(), data.annotations, ui.setup] as const,
  (docs, _notes, setup): DocEntry[] =>
    setup
      ? []
      : docs.filter((doc) => doc.status !== 'archived').sort((a, b) => rank(a) - rank(b) || b.mtimeMs - a.mtimeMs)
)

export const homeDocs = memo(
  () => [wallDocs()] as const,
  (docs): DocEntry[] => docs.slice(0, HOME_LIMIT)
)

export const homeTotal = (): number => wallDocs().length

export const rankOf = rank

function offsetIn(element: HTMLElement, box: HTMLElement): [number, number] {
  let x = 0
  let y = 0
  for (let e: HTMLElement | null = element; e && e !== box; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft
    y += e.offsetTop
  }
  return [x, y]
}

/** Miniatura ma stały kształt liczony z dostępnej wysokości, a powiększenie niczego nie przelewa. */
export function fitHome(force = false): void {
  const { home, homeBody } = els
  const W = sR.x - sL.x
  const H = home.clientHeight
  const key = `${Math.round(W)}/${H}`
  const box = homeBody.querySelector<HTMLElement>('.hs')
  if (!box || (!force && key === homeFit)) return
  homeFit = key
  const width = box.offsetWidth
  home.style.setProperty('--th', `${clamp((H - HEAD_H - WALL_PAD) / 2, width * 0.6, width * 1.34)}px`)
}

export function thumbOf(id: string): HTMLElement | null {
  const selector = ui.homeView === 'wall' ? `.hs[data-doc="${CSS.escape(id)}"] .hs-sheet` : `.sr[data-doc="${CSS.escape(id)}"]`
  return els.homeBody.querySelector<HTMLElement>(selector)
}

export function homeItems(): HTMLElement[] {
  return [...els.homeBody.querySelectorAll<HTMLElement>(ui.homeView === 'wall' ? '.hs[data-doc]' : '.sr')]
}

function revealIn(box: HTMLElement, el: HTMLElement): void {
  const b = box.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const by = Math.min(0, r.top - b.top) + Math.max(0, r.bottom - b.bottom)
  box.scrollTo({ top: box.scrollTop + by, behavior: 'smooth' })
}

export function homeSelect(i: number, quiet = false): void {
  const list = homeItems()
  if (list.length === 0) return
  homeIdx = clamp(i, 0, list.length - 1)
  const el = list[homeIdx] as HTMLElement
  aimAt(el.dataset.doc ?? null)
  for (const item of els.homeBody.querySelectorAll('.sel')) item.classList.remove('sel')
  el.classList.add('sel')
  if (ui.homeView === 'list') spisPill.to({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
  if (!quiet) revealIn(els.homeBody, el)
}

export function homeDeselect(): void {
  homeIdx = -1
  for (const item of els.homeBody.querySelectorAll('.sel')) item.classList.remove('sel')
}

export function homeKey(e: KeyLike): boolean {
  const wall = ui.homeView === 'wall'
  const step = (
    { ArrowDown: wall ? 3 : 1, ArrowUp: wall ? -3 : -1, ArrowRight: wall ? 1 : 0, ArrowLeft: wall ? -1 : 0 } as Record<string, number>
  )[e.key]
  if (step) {
    e.preventDefault()
    homeSelect(homeIdx < 0 ? 0 : homeIdx + step)
    return true
  }
  if (e.key === 'Enter' && homeIdx >= 0) {
    e.preventDefault()
    const id = homeItems()[homeIdx]?.dataset.doc
    if (!id) return false
    if (e.ctrlKey || e.metaKey) peekDoc(id)
    else openDoc(id)
    ui.kbd = true
    return true
  }
  return false
}

/** Po każdym przerysowaniu liczy trasy miniatur do ich wierszy. */
export function bindMorph(): void {
  const { homeBody } = els
  morph.wall = homeBody.querySelector('.h-wall')
  morph.list = homeBody.querySelector('.h-list')
  morph.items = homeDocs().flatMap((doc) => {
    const id = CSS.escape(doc.id)
    const hs = homeBody.querySelector<HTMLElement>(`.hs[data-doc="${id}"]`)
    const row = homeBody.querySelector<HTMLElement>(`.sr[data-doc="${id}"]`)
    const cap = hs?.querySelector<HTMLElement>('.hs-cap')
    if (!hs || !row || !cap) return []
    const [hx, hy] = offsetIn(hs, homeBody)
    const [rx, ry] = offsetIn(row, homeBody)
    return [{ hs, row, cap, k: 40 / hs.offsetWidth, dx: rx + 8 - hx, dy: ry + 7 - hy }]
  })
  morph.q = -1
  renderMorph()
}

export function renderMorph(): void {
  const q = viewP.x
  const { items, wall, list } = morph
  if (q === morph.q || items.length === 0 || !wall || !list) return
  morph.q = q
  items.forEach((m, i) => {
    const p = clamp(q * 1.4 - i * 0.08)
    const style = m.hs.style
    style.transformOrigin = p ? '0 0' : ''
    style.transform = p ? `translate(${m.dx * p}px,${m.dy * p}px) scale(${lerp(1, m.k, p)})` : ''
    style.opacity = p > 0.74 ? String(clamp((1 - p) / 0.26)) : ''
    m.cap.style.opacity = p ? String(clamp(1 - p * 4)) : ''
    m.row.style.opacity = String(clamp((p - 0.62) / 0.38))
  })
  list.style.opacity = String(clamp(q * 2.2 - 0.4))
  list.style.transform = q < 0.999 ? `translateY(${(1 - q) * 12}px)` : ''
  list.style.visibility = q < 0.002 ? 'hidden' : ''
  wall.style.visibility = q > 0.998 ? 'hidden' : ''
  els.home.classList.toggle('as-list', q > 0.5)
}

export function syncHomeSeg(instant = false): void {
  const seg = document.getElementById('homeSeg')
  const on = seg?.querySelector<HTMLElement>(`[data-home-view="${ui.homeView}"]`)
  if (on) homePill.to({ x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight }, instant)
}

export function setHomeView(view: 'wall' | 'list'): void {
  if (ui.homeView === view || ui.setup) return
  finishZoom()
  ui.homeView = view
  syncHomeSeg()
  bindMorph()
  viewP.to(view === 'list' ? 1 : 0)
  if (view === 'list') homeSelect(Math.max(homeIdx, 0), true)
  else homeDeselect()
  notify()
}

export function setFormat(format: FormatFilter): void {
  ui.format = format
  saveFormat(format)
  homeDeselect()
  notify()
}

export function toggleHomeView(): void {
  if (ui.setup) return
  const view = ui.homeView === 'wall' ? 'list' : 'wall'
  if (ui.home) {
    setHomeView(view)
    return
  }
  ui.homeView = view
  viewP.set(view === 'list' ? 1 : 0)
  syncHomeSeg(true)
  goHome()
}

/** Arkusz wyrasta z miniatury albo z wiersza spisu i tam wraca. */
function zoomFrom(i: number, thumb: HTMLElement, out: boolean): void {
  const pane = sheets[i]?.el
  const sheet = sheets[i]?.box
  const placard = pane?.querySelector<HTMLElement>('.placard')
  if (!sheet || !placard) return
  const b = sheet.getBoundingClientRect()
  const t = thumb.getBoundingClientRect()
  const k = t.width / b.width
  zoom = { i, out, sheet, thumb, placard, k, dx: t.left - b.left, dy: t.top - b.top, h0: t.height / k, h1: b.height }
  Object.assign(sheet.style, { flex: 'none', transformOrigin: '0 0' })
  thumb.style.visibility = 'hidden'
}

export function renderZoom(): void {
  if (!zoom) return
  const q = zoomP.x
  const z = zoom
  z.sheet.style.transform = `translate(${z.dx * (1 - q)}px,${z.dy * (1 - q)}px) scale(${lerp(z.k, 1, q)})`
  z.sheet.style.height = `${lerp(z.h0, z.h1, q)}px`
  z.sheet.style.borderRadius = `${lerp(8 / z.k, 16, clamp(q))}px`
  z.placard.style.opacity = String(clamp(q * 3 - 2))
  if (Math.abs(zoomP.t - q) < ZOOM_DONE) finishZoom()
}

export function finishZoom(): void {
  if (!zoom) return
  const z = zoom
  zoom = null
  for (const property of ['flex', 'transformOrigin', 'transform', 'height', 'borderRadius'] as const) {
    z.sheet.style[property] = ''
  }
  z.placard.style.opacity = ''
  z.thumb.style.visibility = ''
  if (z.out) {
    sheets[z.i]?.o.set(0)
    // Ta klatka zapisała już arkuszowi pełną widoczność, a bez przekształcenia stanąłby nad ścianą w całym rozmiarze.
    const pane = sheets[z.i]?.el
    if (pane) Object.assign(pane.style, { opacity: '0', visibility: 'hidden' })
    clearFrames(z.i)
  }
  touch()
}

export function openHome(id: string, thumb: HTMLElement | null): void {
  if (zoom && zoom.out && ui.panes[zoom.i] === id) {
    zoom.out = false
    ui.home = false
    zoomP.to(1, ZOOM_IN)
    syncFocus()
    return
  }
  finishZoom()
  const i = ui.order[0] as number
  const s = sheets[i]
  if (!s) return
  clearFrames(i)
  setPane(i, id)
  ui.focus = i
  ui.back = i
  ui.selNote = null
  ui.kbd = false
  ui.home = false
  if (thumb) {
    s.dl.set(0)
    s.dw.set(0)
    s.o.set(1)
    notify()
    // Układ arkusza musi stać, zanim policzymy jego drogę z miniatury.
    requestAnimationFrame(() => {
      if (ui.home || ui.panes[i] !== id) return
      s.el?.style.setProperty('visibility', 'visible')
      zoomFrom(i, thumb, false)
      zoomP.set(0)
      zoomP.to(1, ZOOM_IN)
      renderZoom()
      touch()
    })
  } else {
    reflow(() => {})
  }
  syncFocus()
}

export function goHome(): void {
  if (ui.home) return
  if (zoom) {
    zoom.out = true
    ui.home = true
    zoomP.to(0, ZOOM_OUT)
    syncFocus()
    return
  }
  closePeek()
  togglePop(false)
  closeLabelPop()
  setSelNote(null)
  setTool('move')
  if (ui.insp) setInsp(false)
  const i = ui.focus
  const one = pinned() === 1
  const w = sR.x - sL.x
  const doc = ui.panes[i]
  ui.last = { order: [...ui.order], docs: ui.order.map((p) => ui.panes[p] ?? null), focus: i }
  const showing = ui.kbd || ui.homeView === 'list'
  if (showing) homeSelect(homeItems().findIndex((el) => el.dataset.doc === doc), true)
  ui.kbd = false
  const thumb = one && doc ? thumbOf(doc) : null
  if (thumb) {
    zoomFrom(i, thumb, true)
    ui.home = true
    zoomP.set(1)
    zoomP.to(0, ZOOM_OUT)
    syncChrome()
    touch()
  } else {
    reflow(() => {
      ui.home = true
      const sheet = sheets[i]
      if (one && sheet) sheet.l = w + OFF
      ui.order = [i]
    }, SHUT)
  }
  syncFocus()
}

/** H wraca do całego układu, a nie tylko do jednego arkusza. */
export function toggleHome(): void {
  if (!ui.home) {
    goHome()
    return
  }
  if (ui.peek !== null || ui.setup) return
  const last = ui.last
  if (!last || last.order.length < 2) {
    const id = last ? last.docs[0] : ui.panes[ui.focus]
    if (id) openDoc(id)
    return
  }
  finishZoom()
  last.order.forEach((p, at) => {
    const id = last.docs[at]
    if (id && ui.panes[p] !== id) {
      clearFrames(p)
      setPane(p, id)
    }
  })
  ui.focus = last.focus
  ui.back = last.focus
  reflow(() => {
    ui.home = false
    ui.order = [...last.order]
  })
  syncFocus()
}

export function homeHover(el: HTMLElement | null): void {
  if (el === glowEl) return
  glowEl = el
  aimAt(el?.dataset.doc ?? null)
  if (!el) {
    glowD.to(0)
    applyGlow()
    return
  }
  const r = el.getBoundingClientRect()
  const a = els.app.getBoundingClientRect()
  glowD.to(r.left - a.left + r.width / 2 - (sL.t + sR.t) / 2)
  const glow = data.thumbs.get(el.dataset.doc ?? '')?.glow
  if (glow) paintGlow(glow)
  if (ui.homeView === 'list') homeSelect(homeItems().indexOf(el), true)
  else if (homeIdx >= 0) homeDeselect()
  wake()
}

/** Po wyjściu z ekranu startowego poświata wraca nad arkusz. */
export function leaveHomeHover(): void {
  if (!ui.home && glowEl) {
    glowEl = null
    glowD.to(0)
  }
}

export function homeRendered(): void {
  fitHome(true)
  bindMorph()
  if (ui.homeView === 'list' && ui.home && homeIdx < 0) homeSelect(0, true)
  syncHomeSeg(true)
}
