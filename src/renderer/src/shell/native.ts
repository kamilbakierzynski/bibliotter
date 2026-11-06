import type { ViewerBounds, ViewerPlacement } from '../../../shared/types'
import { wake } from '../motion/spring'
import { zoomBusy, zoomP } from './home'
import { typesInField } from './layer'
import { camX, G, insRope, mH, PLACARD, ratio, rope, sheetBodies, sheetRects, sheets, sL, sR } from './layout'
import { onWall, sheetHoldsNote } from './notes'
import { data, focusedId, isOpen, notify, ui } from './state'

/*
 * Dokument to natywny widok, który zawsze leży nad powłoką. Wszystko, co rusza arkusz albo na
 * niego nachodzi, potrzebuje więc zrzutu: widok idzie na bok, a jego miejsce zajmuje płótno.
 * W spoczynku widok wraca i dalej działa, jakby nic się nie stało.
 *
 * Wszystkie przejścia idą przez `reconcile`, które porównuje stan z tym, co powinno stać na
 * ekranie. Dzięki temu przerwanie ruchu w dowolnej chwili nie wymaga osobnej obsługi.
 */

/** Ile trwa przenikanie zrzutu starego układu w nowy. */
const FADE_MS = 200
/** Tyle dostaje dokument na przeliczenie układu po zmianie rozmiaru. */
const REFLOW_MS = 90
/** Pierwsza klatka po wczytaniu bywa pusta. */
const FIRST_PAINT_MS = 70
/** Zrzut nie może zatrzymać ruchu na dłużej, nawet gdy dokument wisi. */
const CAPTURE_LIMIT_MS = 400

interface Shot {
  canvas: HTMLCanvasElement
  background: string
}

interface Frame {
  docId: string
  width: number
  height: number
}

const delay = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
const nextPaint = (): Promise<void> =>
  new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))

const covers = new Set<string>()
/** Miejsca, w których widok stoi na ekranie, i dokumenty w tych widokach. */
const liveDocs = new Map<number, string>()
const frames = new Map<number, Frame>()
const openViews = new Set<string>()
const known = new Map<string, ViewerBounds>()
const readyAt = new Map<string, number>()
let held = false
let running = false
let again = false
let wasQuiet = true
let lastPlacements = ''
let refreshTimer = 0
let refreshing = false
let lastCurrent: string | null | undefined

function stackOf(i: number): HTMLElement | null {
  return sheets[i]?.box?.querySelector<HTMLElement>('.sheet-stack') ?? null
}

/** Piksele są w kolejności BGRA, a płótno oczekuje RGBA. */
function toShot(frame: { width: number; height: number; data: Uint8Array }): Shot | null {
  const source = frame.data.byteOffset % 4 === 0 ? frame.data : frame.data.slice()
  const pixels = new Uint8ClampedArray(source.buffer as ArrayBuffer, source.byteOffset, source.byteLength)
  const words = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.byteLength >> 2)
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as number
    words[i] = (word & 0xff00ff00) | ((word & 0xff) << 16) | ((word >> 16) & 0xff)
  }
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0)
  const scale = devicePixelRatio
  canvas.className = 'sheet-frame'
  canvas.style.width = `${frame.width / scale}px`
  canvas.style.height = `${frame.height / scale}px`
  const corner = words[0] ?? 0xffffffff
  return { canvas, background: `rgb(${corner & 0xff} ${(corner >> 8) & 0xff} ${(corner >> 16) & 0xff})` }
}

async function grab(docId: string): Promise<(Shot & Frame) | null> {
  const frame = await Promise.race([window.api.captureDoc(docId), delay(CAPTURE_LIMIT_MS).then(() => null)])
  const shot = frame && toShot(frame)
  return shot ? { ...shot, docId, width: frame.width, height: frame.height } : null
}

function showShot(i: number, shot: Shot & Frame, fade: boolean): void {
  const stack = stackOf(i)
  const box = sheets[i]?.box
  if (!stack || !box) return
  const previous = [...stack.children]
  shot.canvas.classList.toggle('fade', fade)
  stack.append(shot.canvas)
  box.style.background = shot.background
  frames.set(i, { docId: shot.docId, width: shot.width, height: shot.height })
  if (fade) setTimeout(() => previous.forEach((node) => node.remove()), FADE_MS + 40)
  else previous.forEach((node) => node.remove())
}

export function clearFrames(i: number): void {
  frames.delete(i)
  stackOf(i)?.replaceChildren()
}

/** Dokument już się zmienił, więc jego stary obraz przygasa i czeka pod nowym. */
function dimFrames(i: number): void {
  for (const frame of stackOf(i)?.children ?? []) frame.classList.add('stale')
}

function targetBounds(i: number): ViewerBounds {
  const r = sheetRects(sR.t - sL.t, true)[i] as { l: number; w: number }
  return {
    x: Math.round(sL.t + r.l),
    y: Math.round(G.stageTop + PLACARD),
    width: Math.max(1, Math.round(r.w)),
    height: Math.max(1, Math.round(G.H - G.stageTop - G.stageBot - PLACARD))
  }
}

function placements(live: ReadonlySet<number>): ViewerPlacement[] {
  const list: ViewerPlacement[] = []
  for (const s of sheets) {
    const docId = ui.panes[s.i]
    if (!docId || !isOpen(s.i) || !openViews.has(docId)) continue
    const bounds = targetBounds(s.i)
    known.set(docId, bounds)
    const item = { docId, bounds, live: live.has(s.i) }
    // Zerknięcie leży nad innymi arkuszami, więc wchodzi na stos jako ostatnie.
    if (s.i === ui.peek) list.push(item)
    else list.unshift(item)
  }
  // Widok bez otwartego arkusza czeka odstawiony. Na starym miejscu przykryłby scenę w ruchu.
  const placed = new Set(list.map(({ docId }) => docId))
  for (const docId of openViews) {
    const bounds = known.get(docId)
    if (bounds && !placed.has(docId)) list.unshift({ docId, bounds, live: false })
  }
  return list
}

async function sendPlacements(live: ReadonlySet<number>): Promise<void> {
  const list = placements(live)
  const key = JSON.stringify(list)
  if (key === lastPlacements) return
  lastPlacements = key
  await window.api.setViewerLayout(list)
}

function computeQuiet(): boolean {
  if (held || zoomBusy()) return false
  if (Math.abs(sL.x - sL.t) > 0.6 || Math.abs(sR.x - sR.t) > 0.6 || Math.abs(camX.x - camX.t) > 0.6) return false
  if (Math.abs(ratio.x - ratio.t) > 0.002) return false
  if (mH.x > 0.004) return false
  if (rope.reach > sL.x - 0.5) return false
  if (ui.insp && !onWall() && !G.overlay && insRope.least < sR.x + 0.5) return false
  for (const s of sheets) {
    if (!isOpen(s.i)) {
      if (s.o.x > 0.02) return false
      continue
    }
    if (Math.abs(s.dl.x) > 0.6 || Math.abs(s.dw.x) > 0.6 || s.o.x < 0.97) return false
  }
  return true
}

function wantedLive(): Set<number> {
  const want = new Set<number>()
  if (!computeQuiet() || covers.size > 0 || (ui.insp && G.overlay)) return want
  const w = sR.t - sL.t
  const rects = sheetRects(w, true)
  for (const s of sheets) {
    const docId = ui.panes[s.i]
    if (!docId || !isOpen(s.i) || !openViews.has(docId)) continue
    if (ui.peek !== null && ui.peek !== s.i) continue
    if (data.viewers.get(docId)?.status !== 'ready') continue
    if (sheetHoldsNote(s.i)) continue
    const r = rects[s.i] as { l: number; w: number }
    // Arkusz ucięty przez scenę zostaje zrzutem, bo żywy widok wszedłby na nawigację.
    if (r.l < -1 || r.l + r.w > w + 1) continue
    want.add(s.i)
  }
  return want
}

function setHeld(on: boolean): void {
  held = on
  for (const body of sheetBodies()) body.held = on
  zoomP.held = on
  if (!on) wake()
}

const staleSize = (frame: Frame | undefined, bounds: ViewerBounds): boolean => {
  if (!frame) return true
  const scale = devicePixelRatio
  return Math.abs(frame.width / scale - bounds.width) > 1 || Math.abs(frame.height / scale - bounds.height) > 1
}

/** Czy zrzut pokazuje dokument w takim układzie, w jakim zaraz stanie na ekranie. */
function frameIsCurrent(i: number): boolean {
  const docId = ui.panes[i]
  const frame = frames.get(i)
  return frame?.docId === docId && !staleSize(frame, targetBounds(i))
}

async function freshen(i: number): Promise<void> {
  const docId = ui.panes[i]
  if (!docId || frameIsCurrent(i)) return
  const age = performance.now() - (readyAt.get(docId) ?? 0)
  await delay(Math.max(REFLOW_MS, FIRST_PAINT_MS - age))
  const shot = await grab(docId)
  if (shot && ui.panes[i] === docId) showShot(i, shot, true)
}

/** Dokument przelicza układ w tle, więc nowy obraz może przeniknąć stary jeszcze w ruchu. */
function scheduleRefresh(): void {
  clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    if (refreshing) return
    refreshing = true
    const stale = sheets.filter((s) => isOpen(s.i) && !liveDocs.has(s.i) && ui.panes[s.i] && !frameIsCurrent(s.i))
    const ready = stale.filter((s) => data.viewers.get(ui.panes[s.i] ?? '')?.status === 'ready')
    void Promise.all(ready.map((s) => freshen(s.i))).finally(() => {
      refreshing = false
    })
  }, REFLOW_MS)
}

/** Pole tekstowe w powłoce zachowuje klawiaturę, dopóki ktoś w nim pisze. */
const shellKeepsKeyboard = (): boolean => ui.cmd || typesInField()

async function step(): Promise<void> {
  const want = wantedLive()

  const leaving = [...liveDocs].filter(([i, docId]) => !want.has(i) || ui.panes[i] !== docId)
  if (leaving.length > 0) {
    await Promise.all(
      leaving.map(async ([i, docId]) => {
        const shot = await grab(docId)
        if (shot) showShot(i, shot, false)
        liveDocs.delete(i)
        if (ui.panes[i] !== docId) dimFrames(i)
      })
    )
  }

  // Zrzut już wisi na arkuszu, więc podmieniony dokument nie potrzebuje widoku.
  releaseUnused()
  await sendPlacements(new Set(liveDocs.keys()))
  if (held) setHeld(false)

  const coming = [...want].filter((i) => !liveDocs.has(i))
  if (coming.length === 0) {
    scheduleRefresh()
    return
  }

  clearTimeout(refreshTimer)
  await Promise.all(coming.map((i) => (frameIsCurrent(i) ? null : freshen(i).then(() => delay(FADE_MS)))))
  const stillWanted = wantedLive()
  const going = coming.filter((i) => stillWanted.has(i))
  if (going.length === 0) return

  for (const i of going) liveDocs.set(i, ui.panes[i] as string)
  await sendPlacements(new Set(liveDocs.keys()))
  await nextPaint()
  for (const i of going) if (liveDocs.has(i)) clearFrames(i)

  const focused = focusedId()
  if (focused && going.includes(ui.focus) && !shellKeepsKeyboard()) window.api.focusDoc(focused)
}

async function reconcile(): Promise<void> {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      await step()
    } while (again)
  } finally {
    running = false
    if (held) setHeld(false)
  }
}

/** Woła się po każdej zmianie, która może ruszyć arkusze. */
export function touch(): void {
  if (liveDocs.size > 0 && !computeQuiet()) setHeld(true)
  void reconcile()
}

/** Sprawdzane co klatkę: gdy arkusze stanęły, widoki mogą wrócić, zanim wygaśnie reszta ruchu. */
export function trackQuiet(): void {
  const quiet = computeQuiet()
  if (quiet === wasQuiet) return
  wasQuiet = quiet
  if (quiet) void reconcile()
}

export function noteQuiet(): void {
  wasQuiet = computeQuiet()
  void reconcile()
}

/** Coś nachodzi na arkusze: paleta, wskazówka, lista statusów. */
export function cover(reason: string): void {
  if (covers.has(reason)) return
  covers.add(reason)
  void reconcile()
}

export function uncover(reason: string): void {
  if (covers.delete(reason)) void reconcile()
}

export function ensureView(docId: string): void {
  if (openViews.has(docId)) return
  openViews.add(docId)
  const doc = data.entries.get(docId)
  if (doc) data.opened.set(docId, doc.mtimeMs)
  void window.api.openDoc(docId)
  window.api.requestThumbs([docId])
}

export function dropView(docId: string): void {
  if (!openViews.delete(docId)) return
  known.delete(docId)
  readyAt.delete(docId)
  data.viewers.delete(docId)
  data.positions.delete(docId)
  void window.api.closeDoc(docId)
}

/** Kółko nad dokiem przewija dokument, który leży pod nim. */
export function wheelUnderDock(x: number, y: number, deltaX: number, deltaY: number): void {
  for (const docId of liveDocs.values()) {
    const box = known.get(docId)
    if (!box || x < box.x || y < box.y || x >= box.x + box.width || y >= box.y + box.height) continue
    window.api.wheelDoc(docId, { x: x - box.x, y: y - box.y, deltaX, deltaY })
    return
  }
}

export const viewIsOpen = (docId: string): boolean => openViews.has(docId)

/** Zamyka widoki, których nie ma na scenie ani w układzie, do którego można wrócić. */
export function releaseUnused(): void {
  const needed = new Set<string>()
  for (const s of sheets) {
    const id = ui.panes[s.i]
    if (id && (isOpen(s.i) || s.o.x > 0.01)) needed.add(id)
    else if (s.o.x <= 0.01) clearFrames(s.i)
  }
  for (const id of ui.last?.docs ?? []) if (id) needed.add(id)
  for (const id of ui.stash?.docs ?? []) if (id) needed.add(id)
  for (const id of openViews) if (!needed.has(id)) dropView(id)
  for (const s of sheets) {
    const id = ui.panes[s.i]
    if (id && !needed.has(id)) ui.panes[s.i] = null
  }
}

export function docReady(docId: string): void {
  readyAt.set(docId, performance.now())
  // Dokument przeładował się pod zrzutem, więc stary obraz już go nie pokazuje.
  for (const [i, frame] of frames) if (frame.docId === docId) frames.delete(i)
  void reconcile()
}

/** Dokument zmienił się pod zrzutem, np. przewinął się do uwagi. */
export function refreshFrame(i: number): void {
  const docId = ui.panes[i]
  if (!docId || liveDocs.has(i)) return
  void grab(docId).then((shot) => {
    if (shot && ui.panes[i] === docId && !liveDocs.has(i)) showShot(i, shot, true)
  })
}

export function focusLive(): void {
  const docId = focusedId()
  if (docId && [...liveDocs.values()].includes(docId) && !shellKeepsKeyboard()) window.api.focusDoc(docId)
}

/** Agent widzi jako bieżący dokument, na którym pracuje użytkownik. */
export function syncCurrent(): void {
  const docId = focusedId()
  if (docId === lastCurrent) return
  lastCurrent = docId
  void window.api.setCurrentDoc(docId).catch(() => notify())
}
