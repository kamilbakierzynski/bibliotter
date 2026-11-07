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
 * Podmiana dokumentu w arkuszu nie rusza niczego, więc zrzut nie jest jej potrzebny. Nowy widok
 * staje w miejscu starego jednym poleceniem, a stary czeka odstawiony, bo najczęściej się wraca.
 * Dlatego ostatnie dokumenty i ten, na który celuje kursor, są wczytane, zanim padnie kliknięcie.
 *
 * Wszystkie przejścia idą przez `reconcile`, które porównuje stan z tym, co powinno stać na
 * ekranie. Dzięki temu przerwanie ruchu w dowolnej chwili nie wymaga osobnej obsługi.
 */

/** Ile trwa przenikanie zrzutu starego układu w nowy. */
const FADE_MS = 120
/** Tyle dostaje dokument na przeliczenie układu po zmianie rozmiaru. */
const REFLOW_MS = 60
/** Zrzut nie może zatrzymać ruchu na dłużej, nawet gdy dokument wisi. */
const CAPTURE_LIMIT_MS = 400
/**
 * Stary dokument czeka tyle na nowy, zanim kartka pokaże miniaturę. Typowe wczytanie trwa 150–300 ms,
 * a gdy stary schodził tuż przed nowym, miniatura błyskała między nimi na kilka klatek.
 */
const SWAP_HOLD_MS = 400
/** Widok dopiero co zmienił rozmiar, więc jego następna klatka może mieć jeszcze stary układ. */
const RESIZE_SETTLE_MS = 34
/** Kursor, który tylko przejeżdża przez listę, niczego nie ładuje. */
const AIM_DELAY_MS = 80
/** Wczytane dokumenty, do których można wrócić bez czekania. Każdy to osobny proces. */
const RECENT_LIMIT = 4
const AIM_LIMIT = 2
/** Odległość arkusza od celu, na której zrzut zaczyna schodzić z jazdy z arkuszem na miejsce żywego widoku. */
const PIN_FAR = 64
/** Bliżej zrzut stoi już w miejscu żywego widoku. */
const PIN_NEAR = 1

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
/** Kiedy widok dostał obecny rozmiar. */
const sizedAt = new Map<string, number>()
/** Od kiedy stary dokument czeka w arkuszu na nowy. */
const holding = new Map<number, number>()
/** Najnowsze na początku. */
let recent: string[] = []
let aimed: string[] = []
let aiming: string | null = null
let aimTimer = 0
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

export async function grab(docId: string): Promise<(Shot & Frame) | null> {
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
  alignSheet(i)
  box.style.background = shot.background
  frames.set(i, { docId: shot.docId, width: shot.width, height: shot.height })
  if (fade) setTimeout(() => previous.forEach((node) => node.remove()), FADE_MS + 40)
  else previous.forEach((node) => node.remove())
}

export function clearFrames(i: number): void {
  frames.delete(i)
  stackOf(i)?.replaceChildren()
  const box = sheets[i]?.box
  if (box) box.style.background = ''
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

const smoothstep = (from: number, to: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/**
 * Wyśrodkowany zrzut jedzie z arkuszem, a powłoka stawia go w pełnych pikselach, więc w ogonie
 * sprężyny tekst skakał o piksel w przód i w tył. Zrzut w docelowym rozmiarze schodzi więc płynnie
 * na miejsce żywego widoku i tam stoi, a ostatnie piksele przestrzelenia robi sama krawędź arkusza.
 * Zmienia się tylko `left`, bo `transform` należy do kamery.
 */
function alignSheet(i: number): void {
  const s = sheets[i]
  const stack = stackOf(i)
  if (!s || !stack?.firstElementChild || !isOpen(i)) return
  const target = targetBounds(i)
  const left = sL.x + s.x
  const distance = Math.max(Math.abs(left - target.x), Math.abs(left + s.wide - target.x - target.width))
  const pin = 1 - smoothstep(PIN_NEAR, PIN_FAR, distance)
  for (const canvas of stack.querySelectorAll<HTMLCanvasElement>('canvas.sheet-frame')) {
    const width = canvas.width / devicePixelRatio
    if (Math.abs(width - target.width) > 1) {
      canvas.style.left = ''
      continue
    }
    // `left` wskazuje środek zrzutu, bo zrzut przesuwa się o połowę szerokości w lewo.
    const centered = s.wide / 2
    const pinned = target.x - left + width / 2
    canvas.style.left = `${centered + (pinned - centered) * pin}px`
  }
}

/** Woła się co klatkę, gdy arkusze dostały już pozycje. */
export function alignShots(): void {
  for (const s of sheets) alignSheet(s.i)
}

const sameBounds = (a: ViewerBounds | undefined, b: ViewerBounds): boolean =>
  a !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

function size(docId: string, bounds: ViewerBounds): void {
  if (!sameBounds(known.get(docId), bounds)) sizedAt.set(docId, performance.now())
  known.set(docId, bounds)
}

/** Odstawiony widok ma rozmiar arkusza, w którym najpewniej stanie. */
const restingBounds = (): ViewerBounds => targetBounds(ui.home ? (ui.order[0] as number) : ui.focus)

function placements(): ViewerPlacement[] {
  const list: ViewerPlacement[] = []
  for (const s of sheets) {
    const docId = ui.panes[s.i]
    if (!docId || !isOpen(s.i) || !openViews.has(docId)) continue
    const bounds = targetBounds(s.i)
    size(docId, bounds)
    const item = { docId, bounds, live: liveDocs.get(s.i) === docId }
    // Zerknięcie leży nad innymi arkuszami, więc wchodzi na stos jako ostatnie.
    if (s.i === ui.peek) list.push(item)
    else list.unshift(item)
  }
  // Stary dokument stoi w arkuszu, aż nowy będzie miał co pokazać.
  for (const [i, docId] of liveDocs) {
    if (ui.panes[i] !== docId) list.push({ docId, bounds: targetBounds(i), live: true })
  }
  // Widok bez otwartego arkusza czeka odstawiony. Na starym miejscu przykryłby scenę w ruchu.
  const placed = new Set(list.map(({ docId }) => docId))
  const resting = restingBounds()
  for (const docId of openViews) {
    if (placed.has(docId)) continue
    size(docId, resting)
    list.unshift({ docId, bounds: resting, live: false })
  }
  return list
}

async function sendPlacements(): Promise<void> {
  const list = placements()
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

/** Arkusze, w których może teraz stać żywy widok, jeśli jego dokument jest gotowy. */
function liveSlots(): number[] {
  const slots: number[] = []
  if (!computeQuiet() || covers.size > 0 || (ui.insp && G.overlay)) return slots
  const w = sR.t - sL.t
  const rects = sheetRects(w, true)
  for (const s of sheets) {
    const docId = ui.panes[s.i]
    if (!docId || !isOpen(s.i) || !openViews.has(docId)) continue
    if (ui.peek !== null && ui.peek !== s.i) continue
    if (sheetHoldsNote(s.i)) continue
    const r = rects[s.i] as { l: number; w: number }
    // Arkusz ucięty przez scenę zostaje zrzutem, bo żywy widok wszedłby na nawigację.
    if (r.l < -1 || r.l + r.w > w + 1) continue
    slots.push(s.i)
  }
  return slots
}

const statusAt = (i: number): string | undefined => data.viewers.get(ui.panes[i] ?? '')?.status
const wantedLive = (): Set<number> => new Set(liveSlots().filter((i) => statusAt(i) === 'ready'))

/** Czy stary dokument może jeszcze poczekać na nowy. Gdy nowy się spóźni, kartka pokazuje jego miniaturę. */
function keepsWaiting(i: number, slots: number[]): boolean {
  // Stan nowego widoku przychodzi z procesu głównego chwilę po kliknięciu, a do tego czasu dokument też się wczytuje.
  const status = statusAt(i)
  if (!slots.includes(i) || (status !== undefined && status !== 'loading')) return false
  const now = performance.now()
  const since = holding.get(i)
  if (since === undefined) {
    holding.set(i, now)
    window.setTimeout(() => void reconcile(), SWAP_HOLD_MS)
    return true
  }
  return now - since < SWAP_HOLD_MS
}

/** Widok ma już docelowy rozmiar i narysował się w nim, więc może stanąć bez zrzutu. */
function fitsSheet(i: number): boolean {
  const docId = ui.panes[i] as string
  const settled = performance.now() - (sizedAt.get(docId) ?? 0) >= RESIZE_SETTLE_MS
  return settled && sameBounds(known.get(docId), targetBounds(i))
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
  await delay(REFLOW_MS)
  const shot = await grab(docId)
  // W czasie zrzutu widok mógł już stanąć na arkuszu, a wtedy nikt by tego obrazu nie zdjął.
  if (shot && ui.panes[i] === docId && liveDocs.get(i) !== docId) showShot(i, shot, true)
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
const shellKeepsKeyboard = (): boolean => ui.cmd || ui.labelPop || typesInField()

/** Widoki stają na arkuszach w jednym poleceniu, a zrzuty znikają dopiero, gdy są już pod nimi. */
async function enter(going: number[]): Promise<void> {
  for (const i of going) {
    liveDocs.set(i, ui.panes[i] as string)
    holding.delete(i)
  }
  await sendPlacements()
  await nextPaint()
  for (const i of going) if (liveDocs.get(i) === ui.panes[i]) clearFrames(i)

  const focused = focusedId()
  if (focused && going.includes(ui.focus) && !shellKeepsKeyboard()) window.api.focusDoc(focused)
}

async function step(): Promise<void> {
  const slots = liveSlots()
  const want = new Set(slots.filter((i) => statusAt(i) === 'ready'))

  // Ten sam dokument schodzi na czas ruchu, więc jego miejsce zajmuje zrzut.
  const stepping = [...liveDocs].filter(([i, docId]) => ui.panes[i] === docId && !want.has(i))
  if (stepping.length > 0) {
    await Promise.all(
      stepping.map(async ([i, docId]) => {
        const shot = await grab(docId)
        if (shot) showShot(i, shot, false)
      })
    )
    // Widok schodzi dopiero wtedy, gdy zrzut jest już na ekranie. Inaczej przez klatkę spod arkusza wygląda miniatura.
    await nextPaint()
    for (const [i] of stepping) liveDocs.delete(i)
  }

  for (const [i, docId] of [...liveDocs]) {
    if (ui.panes[i] === docId || want.has(i) || keepsWaiting(i, slots)) continue
    liveDocs.delete(i)
    holding.delete(i)
  }

  const missing = [...want].filter((i) => liveDocs.get(i) !== ui.panes[i])
  const instant = missing.filter((i) => frameIsCurrent(i) || fitsSheet(i))
  const coming = missing.filter((i) => !instant.includes(i))

  releaseUnused()
  if (instant.length > 0) await enter(instant)
  else await sendPlacements()
  if (held) setHeld(false)

  if (coming.length === 0) {
    scheduleRefresh()
    return
  }

  clearTimeout(refreshTimer)
  await Promise.all(coming.map((i) => (frameIsCurrent(i) ? null : freshen(i).then(() => delay(FADE_MS)))))
  const stillWanted = wantedLive()
  const going = coming.filter((i) => stillWanted.has(i))
  if (going.length > 0) await enter(going)
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

/** Zasłania arkusze i czeka, aż ich zrzuty staną na miejscu żywych widoków. */
export async function coverAndWait(reason: string): Promise<void> {
  covers.add(reason)
  await reconcile()
  while (running) await nextPaint()
}

/** Zrzut dokumentu, który stoi teraz w arkuszu, albo `null`, gdy arkusz pokazuje coś innego. */
export function shownFrame(i: number): HTMLCanvasElement | null {
  if (frames.get(i)?.docId !== ui.panes[i]) return null
  const shown = stackOf(i)?.querySelectorAll<HTMLCanvasElement>('canvas.sheet-frame')
  return shown?.[shown.length - 1] ?? null
}

/** Stawia gotowy zrzut w arkuszu bez przenikania. Arkusz uzna go za aktualny obraz dokumentu. */
export function placeShot(i: number, shot: Shot & Frame): void {
  showShot(i, shot, false)
}

function addView(docId: string): void {
  openViews.add(docId)
  const doc = data.entries.get(docId)
  if (doc) data.opened.set(docId, doc.mtimeMs)
}

export function ensureView(docId: string): void {
  recent = [docId, ...recent.filter((id) => id !== docId)].slice(0, RECENT_LIMIT)
  if (!openViews.has(docId)) addView(docId)
  // Widok mógł powstać na zapas, ale dopiero teraz dokument został naprawdę otwarty.
  void window.api.openDoc(docId)
  window.api.requestThumbs([docId])
}

function warmView(docId: string): void {
  aimed = [docId, ...aimed.filter((id) => id !== docId)].slice(0, AIM_LIMIT)
  if (openViews.has(docId)) return
  addView(docId)
  void window.api.warmDoc(docId)
  void reconcile()
}

/** Kursor zatrzymał się nad dokumentem, więc najpewniej zaraz zostanie kliknięty. */
export function aimAt(docId: string | null): void {
  if (docId === aiming) return
  aiming = docId
  clearTimeout(aimTimer)
  if (docId) aimTimer = window.setTimeout(() => warmView(docId), AIM_DELAY_MS)
}

export function dropView(docId: string): void {
  if (!openViews.delete(docId)) return
  known.delete(docId)
  sizedAt.delete(docId)
  recent = recent.filter((id) => id !== docId)
  aimed = aimed.filter((id) => id !== docId)
  data.viewers.delete(docId)
  data.positions.delete(docId)
  void window.api.closeDoc(docId)
}

/** Widok czekający poza sceną pokazałby starą treść, a nowa wczyta się przy otwarciu. */
export function dropStaleViews(): void {
  const onStage = new Set([...ui.panes, ...(ui.last?.docs ?? []), ...(ui.stash?.docs ?? [])])
  for (const docId of [...openViews]) {
    if (onStage.has(docId)) continue
    const doc = data.entries.get(docId)
    if (!doc || doc.mtimeMs !== data.opened.get(docId)) dropView(docId)
  }
  void reconcile()
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
  for (const id of [...recent, ...aimed]) needed.add(id)
  for (const id of openViews) if (!needed.has(id)) dropView(id)
  for (const s of sheets) {
    const id = ui.panes[s.i]
    if (id && !needed.has(id)) ui.panes[s.i] = null
  }
}

export function docReady(docId: string): void {
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
