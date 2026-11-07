import type { OverlayEvent, OverlayMode, ShapeTool, StickyColor } from '../shared/annotations'
import type { OutlineCommand, OutlineHeading } from '../shared/outline'
import { collectHeadings, type Heading, headingAt, sameOutline } from './outline'
import { type Bars, contentAt, EMPTY_ROOM, findBars, measureRoom, parseColor, type Room } from './minimapRoom'
import { CODE, HEAD, MEDIA, RULE, type Sketch, sketchPage } from './pageSketch'
import { zoom } from './zoom'

/*
 * Minimapa i spis treści po stronie dokumentu.
 *
 * Minimapa to pas przy prawej krawędzi arkusza, jak w VS Code. Rysuje szkic układu, a nie zrzut,
 * więc ma barwy apki na każdym dokumencie i nie wysyła nigdzie obrazu strony. Leży w zamkniętym
 * Shadow DOM, więc skrypty dokumentu jej nie widzą. Pod przyklejonym paskiem nawigacji pas
 * zaczyna się niżej. Nad tłem pasa albo ramką sekcji kładzie własny papier. Gdy pod pas sięga
 * tekst albo obraz, minimapa ustępuje: zostaje po niej uchwyt, a ona wysuwa się dopiero spod
 * krawędzi, jak szuflada, żeby nie zasłaniać dokumentu, który zajmuje całą szerokość.
 *
 * Spis treści rysuje powłoka. Stąd idą tylko poziomy i teksty nagłówków oraz bieżący rozdział.
 */

const STRIP = 64
const PAD_X = 9
const INSET_Y = 12
/** Odstęp, który treść musi zostawić przed pasem, żeby minimapa jej nie dotykała. */
const GAP = 10
const COLUMN = STRIP + GAP
/** Pod przyklejonym paskiem pas ma tyle oddechu, ile od krawędzi okna. */
const BAR_GAP = 8
const GRIP_W = 4
const GRIP_H = 36
const GRIP_REACH = 96
/** Szeroki do mapy, którą da się trafić, a wąski na tyle, żeby szkic był mapą, a nie zrzutem. */
const MAX_SCALE_X = 0.25
/** Linia tekstu dostaje na mapie ok. 2,5 px, więc akapit ma fakturę, a nie jest plamą. */
const MAX_SCALE_Y = 1 / 8
const MIN_SLIDER = 18
/** Szuflada ma pod szkicem tyle oddechu, ile szkic ma po bokach. */
const PAD_BOTTOM = 8
/** Linia czytania: rozdział zaczyna się, gdy jego nagłówek minie górną część okna. */
const READING_LINE = 0.3
/** Nagłówek po skoku stoi tyle pod górną krawędzią, żeby nie przyklejał się do niej. */
const JUMP_MARGIN = 28
const REFRESH_MS = 280
const REFRESH_MAX_MS = 1400
const REVEAL_MS = 140
const CONCEAL_MS = 380
const THEME_SETTLE_MS = 480
const HIT_CHECK_MS = 300
const MAX_HITS = 3000
const MAX_PAINT_SCAN = 8000
const ALL_MATCHES = 'bibliotter-find'
const CURRENT_MATCH = 'bibliotter-find-current'

interface Tone {
  dark: boolean
  /** Tło strony, na którym leży szuflada, gdy minimapa wysuwa się nad treść. */
  paper: string
  ink: string
}

const ALPHA = {
  light: { text: 0.24, head: 0.8, code: 0.2, codeBg: 0.05, media: 0.08, rule: 0.18, slider: 0.055, hover: 0.085, drag: 0.12 },
  dark: { text: 0.3, head: 0.92, code: 0.26, codeBg: 0.07, media: 0.11, rule: 0.22, slider: 0.075, hover: 0.11, drag: 0.16 }
}

const STYLE = `
  * { box-sizing: border-box; }
  .strip {
    position: fixed; top: ${INSET_Y}px; width: ${STRIP}px;
    pointer-events: none; opacity: 0; translate: 10px 0;
    transition: opacity .18s ease, translate .42s cubic-bezier(.2, 1.1, .3, 1), background-color .3s;
    border-radius: 12px 0 0 12px;
  }
  .strip.on { opacity: 1; translate: 0 0; pointer-events: auto; cursor: default; }
  /* Nad dekoracją pas ma papier strony i tylko włos krawędzi, bo leży tam na stałe. */
  .strip.card { box-shadow: -1px 0 0 rgb(0 0 0 / 7%), -10px 0 24px -14px rgb(0 0 0 / 18%); }
  .strip.card.dark { box-shadow: -1px 0 0 rgb(255 255 255 / 8%), -10px 0 24px -14px rgb(0 0 0 / 50%); }
  .strip.drawer {
    translate: ${STRIP + 12}px 0; opacity: 0;
    box-shadow: -1px 0 0 rgb(0 0 0 / 6%), -12px 0 28px -8px rgb(0 0 0 / 22%);
  }
  .strip.drawer.dark { box-shadow: -1px 0 0 rgb(255 255 255 / 8%), -12px 0 28px -8px rgb(0 0 0 / 55%); }
  .strip.drawer.on { translate: 0 0; opacity: 1; }
  .strip.quiet { opacity: .45; pointer-events: none; }
  /* Uchwyt mówi, że minimapa jest, tylko ustąpiła treści. */
  .grip {
    position: fixed; width: ${GRIP_W}px; height: ${GRIP_H}px; border-radius: ${GRIP_W / 2}px;
    pointer-events: none; opacity: 0; translate: ${GRIP_W + 4}px 0;
    transition: opacity .2s ease, translate .42s cubic-bezier(.2, 1.1, .3, 1), height .24s cubic-bezier(.2, 1.1, .3, 1);
  }
  .grip.on { opacity: 1; translate: 0 0; }
  .grip.near { height: ${GRIP_H + 12}px; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .label {
    position: fixed; max-width: 280px; padding: 5px 9px;
    font: 500 12px/1.3 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
    color: #131316; background: #fff; border-radius: 8px;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 6%), 0 6px 18px -4px rgb(0 0 0 / 20%);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    pointer-events: none; opacity: 0; translate: 6px -50%; transition: opacity .12s ease, translate .24s cubic-bezier(.2, 1.1, .3, 1);
  }
  .label.dark { color: #f4f4f5; background: #1c1c1f; box-shadow: 0 0 0 1px rgb(255 255 255 / 8%), 0 6px 18px -4px rgb(0 0 0 / 50%); }
  .label.on { opacity: 1; translate: 0 -50%; }
  @media (prefers-reduced-motion: reduce) { .strip, .label, .grip { transition: none; } }
`

export interface MinimapBridge {
  send(event: OverlayEvent): void
  /** Minimapę włącza powłoka. Okno miniatur nie dostaje tego nigdy, więc na miniaturach jej nie ma. */
  onShow(listener: (on: boolean) => void): void
  onCommand(listener: (command: OutlineCommand) => void): void
  onMode(listener: (mode: OverlayMode) => void): void
  onPointer(listener: (on: boolean) => void): void
  onMarker(listener: (color: StickyColor | null) => void): void
  onShaper(listener: (tool: ShapeTool | null) => void): void
}

interface Geometry {
  /** Prawa krawędź pasa w oknie strony, czyli lewa krawędź paska przewijania. */
  right: number
  /** Górna krawędź pasa w oknie, niżej pod przyklejonym paskiem nawigacji. */
  top: number
  height: number
  viewW: number
  viewH: number
  docH: number
  range: number
  sx: number
  sy: number
  /** Przesunięcie szkicu w pasie, gdy treść jest węższa niż mapa. */
  ox: number
  mapH: number
  stripH: number
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

function pageTone(): Tone {
  const body = document.body ? parseColor(getComputedStyle(document.body).backgroundColor) : null
  const root = parseColor(getComputedStyle(document.documentElement).backgroundColor)
  const scheme = getComputedStyle(document.documentElement).colorScheme
  const darkCanvas = scheme.includes('dark') && matchMedia('(prefers-color-scheme: dark)').matches
  const color = [body, root].find((c) => c && c[3] > 0.5) ?? (darkCanvas ? [18, 18, 18, 1] : [255, 255, 255, 1])
  const [r, g, b] = color
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const dark = luminance < 0.45
  return { dark, paper: `rgb(${r} ${g} ${b})`, ink: dark ? '244 244 245' : '19 19 22' }
}

export function startMinimap(bridge: MinimapBridge): void {
  const host = document.createElement('bibliotter-minimap')
  host.style.cssText = 'all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;'
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = STYLE
  const strip = document.createElement('div')
  strip.className = 'strip'
  const canvas = document.createElement('canvas')
  const label = document.createElement('div')
  label.className = 'label'
  const grip = document.createElement('div')
  grip.className = 'grip'
  strip.append(canvas)
  root.append(style, strip, grip, label)
  // Pod warstwą uwag, żeby ręka prezentera i marker przechodziły nad minimapą.
  const overlay = document.documentElement.querySelector(':scope > bibliotter-overlay')
  document.documentElement.insertBefore(host, overlay)

  const context = canvas.getContext('2d')
  const paper = document.createElement('canvas')
  const paperContext = paper.getContext('2d')
  if (!context || !paperContext) return

  let enabled = false
  let tools = { mode: false, pointer: false, marker: false, shaper: false }
  let sketch: Sketch | null = null
  let sketching = 0
  let headings: Heading[] = []
  let sent: OutlineHeading[] | null = null
  let sentIndex = -2
  /** Po skoku ze spisu bieżący jest ten nagłówek, aż użytkownik sam przewinie. */
  let pinned: number | null = null
  let space: Room = EMPTY_ROOM
  let bars: Bars = { top: 0, bottom: 0, skip: new Set() }
  let revealed = false
  let revealTimer = 0
  let concealTimer = 0
  let tone = pageTone()
  let hoverY: number | null = null
  let drag: { grab: number } | null = null
  let glideFrame = 0
  let frame = 0
  let paperKey = ''
  let hits: { all: unknown; current: unknown } = { all: null, current: null }
  let hitRects: number[] = []
  let currentRects: number[] = []
  let refreshTimer = 0
  let refreshFirst = 0
  let dpr = devicePixelRatio || 1

  const scroller = (): Element => document.scrollingElement ?? document.documentElement

  const geometry = (): Geometry | null => {
    const viewW = document.documentElement.clientWidth
    const viewH = innerHeight
    const docH = scroller().scrollHeight
    const top = Math.max(INSET_Y, bars.top + BAR_GAP)
    const height = viewH - top - Math.max(INSET_Y, bars.bottom + BAR_GAP)
    // Pusty szkic, np. arkusz folderu z samym drzewem, nie ma czego pokazać na mapie.
    if (!sketch || sketch.lines.length + sketch.blocks.length === 0 || height < 120 || viewW < STRIP * 4) return null
    const innerW = STRIP - PAD_X * 2
    const contentW = Math.max(1, sketch.right - sketch.left)
    const sx = Math.min(MAX_SCALE_X, innerW / contentW)
    const sy = Math.min(MAX_SCALE_Y, height / docH)
    return {
      right: viewW,
      top,
      height,
      viewW,
      viewH,
      docH,
      range: Math.max(0, docH - viewH),
      sx,
      sy,
      ox: PAD_X + (innerW - contentW * sx) / 2,
      mapH: Math.min(height, docH * sy),
      // Pas kończy się ze szkicem, więc pod krótkim dokumentem margines zostaje dokumentowi.
      stripH: Math.min(height, Math.ceil(docH * sy) + PAD_BOTTOM)
    }
  }

  const slider = (g: Geometry): { y: number; h: number } => {
    const h = Math.min(g.mapH, Math.max(MIN_SLIDER, g.viewH * g.sy))
    const y = g.range > 0 ? (scroller().scrollTop / g.range) * (g.mapH - h) : 0
    return { y, h }
  }

  const scrollable = (g: Geometry): boolean => g.range > 24
  const zoomed = (): boolean => Math.abs(zoom().scale - 1) > 0.01
  const busy = (): boolean => tools.mode || tools.pointer || tools.marker || tools.shaper
  /** Treść pod pasem sprawdza się przy każdej klatce, bo liczy się ta, która jest teraz w oknie. */
  const blockedAt = (g: Geometry): boolean => contentAt(space, scrollY + g.top, scrollY + g.top + g.stripH)
  const blocked = (): boolean => {
    const g = geometry()
    return g !== null && blockedAt(g)
  }

  const syncVisibility = (): void => {
    const g = geometry()
    const base = enabled && g !== null && scrollable(g) && !zoomed()
    const drawer = base && g !== null && blockedAt(g)
    const open = base && (!drawer || revealed || drag !== null)
    strip.classList.toggle('drawer', drawer)
    strip.classList.toggle('card', base && !drawer && space.decor)
    strip.classList.toggle('dark', tone.dark)
    strip.classList.toggle('on', open)
    strip.classList.toggle('quiet', open && busy())
    strip.style.background = drawer || (base && space.decor) ? tone.paper : ''
    grip.classList.toggle('on', drawer && !open && !busy())
    if (!open) hideLabel()
    if (g) {
      strip.style.left = `${g.right - STRIP}px`
      strip.style.top = `${g.top}px`
      strip.style.height = `${g.stripH}px`
      grip.style.left = `${g.right - GRIP_W - 3}px`
      grip.style.top = `${g.top + g.stripH / 2 - GRIP_H / 2}px`
      grip.style.background = `rgb(${tone.ink} / ${tone.dark ? 0.32 : 0.24})`
    }
  }

  /** Szkic na osobnym płótnie, bo przewijanie zmienia tylko suwak. */
  const paintPaper = (g: Geometry): void => {
    if (!sketch) return
    const key = `${sketch.lines.length}:${sketch.blocks.length}:${g.sx}:${g.sy}:${g.ox}:${tone.ink}:${dpr}:${hitRects.length}:${currentRects.join(',')}`
    if (key === paperKey) return
    paperKey = key
    const width = Math.round(STRIP * dpr)
    const height = Math.max(1, Math.round(g.mapH * dpr))
    paper.width = width
    paper.height = height
    const c = paperContext
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, STRIP, g.mapH)
    const alpha = tone.dark ? ALPHA.dark : ALPHA.light
    const ink = (a: number): string => `rgb(${tone.ink} / ${a})`
    const x = (value: number): number => g.ox + (value - sketch!.left) * g.sx

    const { blocks, lines } = sketch
    for (let i = 0; i < blocks.length; i += 5) {
      const kind = blocks[i + 4]
      const bx = x(blocks[i] ?? 0)
      const by = (blocks[i + 1] ?? 0) * g.sy
      const bw = Math.max(1, (blocks[i + 2] ?? 0) * g.sx)
      const bh = Math.max(1, (blocks[i + 3] ?? 0) * g.sy)
      if (kind === RULE) {
        c.fillStyle = ink(alpha.rule)
        c.fillRect(bx, by, bw, 1 / dpr)
      } else {
        c.fillStyle = ink(kind === MEDIA ? alpha.media : alpha.codeBg)
        c.beginPath()
        c.roundRect(bx, by, bw, bh, Math.min(2, bh / 2))
        c.fill()
      }
    }

    // Grubość paska wynika z wysokości linii, ale ma granice, żeby akapit nie zlewał się w plamę.
    const bar = (h: number, kind: number): number => clamp(h * g.sy * (kind === HEAD ? 0.7 : 0.5), 1, kind === HEAD ? 4 : 2.4)
    for (const kind of [0, CODE, HEAD]) {
      c.fillStyle = ink(kind === HEAD ? alpha.head : kind === CODE ? alpha.code : alpha.text)
      for (let i = 0; i < lines.length; i += 5) {
        if (lines[i + 4] !== kind) continue
        const h = lines[i + 3] ?? 0
        const thick = bar(h, kind)
        const y = ((lines[i + 1] ?? 0) + h / 2) * g.sy - thick / 2
        c.fillRect(x(lines[i] ?? 0), y, Math.max(1, (lines[i + 2] ?? 0) * g.sx), thick)
      }
    }

    // Trafienia mają barwy podświetleń w dokumencie: jasnożółte i bursztynowe bieżące.
    for (const [list, color] of [[hitRects, 'rgb(240 196 60 / .9)'], [currentRects, '#ff9d00']] as const) {
      c.fillStyle = color
      for (let i = 0; i < list.length; i += 4) {
        const hy = (list[i + 1] ?? 0) * g.sy
        const hh = Math.max(2, (list[i + 3] ?? 0) * g.sy)
        c.fillRect(x(list[i] ?? 0) - 1, hy - 0.5, Math.max(4, (list[i + 2] ?? 0) * g.sx + 2), hh + 1)
      }
    }
  }

  const draw = (): void => {
    frame = 0
    syncVisibility()
    const g = geometry()
    if (!g || !strip.classList.contains('on')) return
    const width = Math.round(STRIP * dpr)
    const height = Math.round(g.stripH * dpr)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    paintPaper(g)
    const c = context
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, canvas.width, canvas.height)
    c.drawImage(paper, 0, 0)
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    const { y, h } = slider(g)
    const alpha = tone.dark ? ALPHA.dark : ALPHA.light
    const over = hoverY !== null && hoverY >= y && hoverY <= y + h
    c.fillStyle = `rgb(${tone.ink} / ${drag ? alpha.drag : over ? alpha.hover : alpha.slider})`
    c.beginPath()
    c.roundRect(3, y, STRIP - 6, h, 6)
    c.fill()
    if (drag) showLabelFor(scroller().scrollTop + g.viewH * READING_LINE, y + h / 2)
  }

  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(draw)
  }

  // Spis treści

  const readingIndex = (): number => {
    if (pinned !== null && pinned < headings.length) return pinned
    const g = geometry()
    const top = scroller().scrollTop
    const viewH = innerHeight
    // Na samym dole krótki ostatni rozdział nie dojdzie do linii czytania, a i tak jest czytany.
    if (g && g.range > 0 && top >= g.range - 2) return headingAt(headings, top + viewH - 1)
    return headingAt(headings, top + viewH * READING_LINE)
  }

  const reportIndex = (): void => {
    const index = readingIndex()
    if (index === sentIndex) return
    sentIndex = index
    bridge.send({ type: 'outline-at', index })
  }

  const reportOutline = (force = false): void => {
    const list = headings.map(({ level, text }) => ({ level, text }))
    if (force || !sent || !sameOutline(sent, list)) {
      sent = list
      bridge.send({ type: 'outline', headings: list })
      sentIndex = -2
    }
    reportIndex()
  }

  // Szkic

  const readHits = (): void => {
    const all = CSS.highlights.get(ALL_MATCHES) ?? null
    const current = CSS.highlights.get(CURRENT_MATCH) ?? null
    if (all === hits.all && current === hits.current) return
    hits = { all, current }
    const rectsOf = (highlight: Highlight | null, out: number[]): void => {
      if (!highlight) return
      let count = 0
      for (const range of highlight) {
        if (++count > MAX_HITS) break
        if (!(range instanceof Range)) continue
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        out.push(rect.left + scrollX, rect.top + scrollY, rect.width, rect.height)
      }
    }
    hitRects = []
    currentRects = []
    rectsOf(all, hitRects)
    rectsOf(current, currentRects)
    schedule()
  }

  const refresh = async (): Promise<void> => {
    refreshTimer = 0
    refreshFirst = 0
    headings = collectHeadings()
    reportOutline()
    if (!enabled) return
    const run = ++sketching
    const found = findBars(COLUMN, MAX_PAINT_SCAN)
    const next = await sketchPage(() => run !== sketching, found.skip)
    if (!next || run !== sketching) return
    sketch = next
    bars = found
    tone = pageTone()
    space = measureRoom(next, tone.paper, found.skip, COLUMN, MAX_PAINT_SCAN)
    paperKey = ''
    hits = { all: null, current: null }
    readHits()
    schedule()
  }

  /** Zmiany w dokumencie przychodzą seriami, więc szkic czeka na ciszę, ale nie w nieskończoność. */
  const scheduleRefresh = (): void => {
    const now = performance.now()
    if (refreshFirst === 0) refreshFirst = now
    clearTimeout(refreshTimer)
    const wait = refreshFirst + REFRESH_MAX_MS - now < REFRESH_MS ? 0 : REFRESH_MS
    refreshTimer = window.setTimeout(() => void refresh(), wait)
  }

  // Przewijanie

  const stopGlide = (): void => {
    cancelAnimationFrame(glideFrame)
    glideFrame = 0
  }

  /** Skok na sprężynie, żeby było widać, w którą stronę pojechał dokument. */
  const glideTo = (target: number): void => {
    stopGlide()
    const element = scroller()
    const goal = clamp(target, 0, Math.max(0, element.scrollHeight - innerHeight))
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element.scrollTo({ top: goal, behavior: 'instant' })
      return
    }
    let x = element.scrollTop
    let v = 0
    let last = performance.now()
    // Bez przestrzelenia, bo dokument, który minie cel i wraca, czyta się jak zacięcie.
    const k = 340
    const damping = 2 * Math.sqrt(k)
    const step = (now: number): void => {
      // Znacznik klatki bywa wcześniejszy niż chwila zamówienia klatki.
      const dt = clamp((now - last) / 1000, 0, 0.032)
      last = now
      v += (-k * (x - goal) - damping * v) * dt
      x += v * dt
      if (Math.abs(x - goal) < 0.5 && Math.abs(v) < 6) {
        element.scrollTo({ top: goal, behavior: 'instant' })
        glideFrame = 0
        return
      }
      element.scrollTo({ top: x, behavior: 'instant' })
      glideFrame = requestAnimationFrame(step)
    }
    glideFrame = requestAnimationFrame(step)
  }

  const jump = (index: number): void => {
    let heading = headings[index]
    if (heading && !heading.element.isConnected) {
      headings = collectHeadings()
      heading = headings[index]
    }
    if (!heading) return
    for (let current: Element | null = heading.element; current; current = current.parentElement) {
      if (current instanceof HTMLDetailsElement) current.open = true
    }
    const margin = parseFloat(getComputedStyle(heading.element).scrollMarginTop) || JUMP_MARGIN
    const top = heading.element.getBoundingClientRect().top + scroller().scrollTop
    pinned = index
    reportIndex()
    glideTo(top - margin)
  }

  /** Użytkownik przewija sam, więc spis znów idzie za linią czytania. */
  const release = (): void => {
    stopGlide()
    if (pinned === null) return
    pinned = null
    reportIndex()
  }

  // Etykieta rozdziału

  function hideLabel(): void {
    label.classList.remove('on')
  }

  function showLabelFor(docY: number, stripY: number): void {
    const g = geometry()
    const heading = headings[headingAt(headings, docY)]
    if (!g || !heading) {
      hideLabel()
      return
    }
    if (label.textContent !== heading.text) label.textContent = heading.text
    label.classList.toggle('dark', tone.dark)
    label.style.right = `${innerWidth - (g.right - STRIP) + 8}px`
    label.style.top = `${g.top + clamp(stripY, 10, g.height - 10)}px`
    label.classList.add('on')
  }

  // Mysz

  const stripY = (event: PointerEvent): number => event.clientY - strip.getBoundingClientRect().top

  const scrollToSlider = (y: number, g: Geometry, h: number): void => {
    const room = g.mapH - h
    const top = room > 0 ? (clamp(y, 0, room) / room) * g.range : 0
    stopGlide()
    scroller().scrollTo({ top, behavior: 'instant' })
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const g = geometry()
    if (!g) return
    event.preventDefault()
    release()
    canvas.setPointerCapture(event.pointerId)
    const y = stripY(event)
    const { y: top, h } = slider(g)
    if (y >= top && y <= top + h) {
      drag = { grab: y - top }
    } else {
      // Klik poza suwakiem stawia tam środek okna, a dalsze ciągnięcie prowadzi suwak.
      drag = { grab: h / 2 }
      const room = g.mapH - h
      glideTo(room > 0 ? (clamp(y - h / 2, 0, room) / room) * g.range : 0)
    }
    schedule()
  })

  canvas.addEventListener('pointermove', (event) => {
    const g = geometry()
    if (!g) return
    const y = stripY(event)
    hoverY = y
    if (drag && canvas.hasPointerCapture(event.pointerId)) {
      if (glideFrame === 0 || Math.abs(event.movementY) > 0) scrollToSlider(y - drag.grab, g, slider(g).h)
    } else if (y <= g.mapH) {
      showLabelFor(y / g.sy, y)
    } else {
      hideLabel()
    }
    schedule()
  })

  const endDrag = (): void => {
    if (!drag) return
    drag = null
    hideLabel()
    schedule()
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener('lostpointercapture', endDrag)
  canvas.addEventListener('pointerleave', () => {
    hoverY = null
    if (!drag) hideLabel()
    schedule()
  })

  // Szuflada: gdy treść sięga pod pas, minimapa wysuwa się dopiero spod samej krawędzi.
  const setRevealed = (on: boolean): void => {
    if (revealed === on) return
    revealed = on
    schedule()
  }

  window.addEventListener(
    'pointermove',
    (event) => {
      if (!event.isTrusted || !enabled || !blocked() || busy()) return
      const viewW = document.documentElement.clientWidth
      // Uchwyt rośnie, gdy kursor idzie w stronę krawędzi, żeby było widać, gdzie wysunąć mapę.
      grip.classList.toggle('near', event.clientX >= viewW - GRIP_REACH && event.clientX <= viewW)
      const edge = event.clientX >= viewW - (revealed ? STRIP + 24 : 14) && event.clientX <= viewW
      if (edge) {
        clearTimeout(concealTimer)
        concealTimer = 0
        if (!revealed && revealTimer === 0) {
          revealTimer = window.setTimeout(() => {
            revealTimer = 0
            setRevealed(true)
          }, REVEAL_MS)
        }
      } else {
        clearTimeout(revealTimer)
        revealTimer = 0
        if (revealed && concealTimer === 0 && !drag) {
          concealTimer = window.setTimeout(() => {
            concealTimer = 0
            setRevealed(false)
          }, CONCEAL_MS)
        }
      }
    },
    { capture: true, passive: true }
  )
  document.documentElement.addEventListener('mouseleave', () => {
    clearTimeout(revealTimer)
    revealTimer = 0
    grip.classList.remove('near')
    if (!drag) setRevealed(false)
  })

  // Polecenia i zdarzenia strony

  bridge.onShow((on) => {
    if (enabled === on) return
    enabled = on
    if (on) void refresh()
    else {
      sketching++
      sketch = null
      schedule()
    }
  })

  bridge.onCommand((command) => {
    if (command.type === 'jump') jump(command.index)
    else reportOutline(true)
  })

  const setTools = (change: Partial<typeof tools>): void => {
    tools = { ...tools, ...change }
    if (busy()) setRevealed(false)
    schedule()
  }
  bridge.onMode((mode) => setTools({ mode: mode !== null }))
  bridge.onPointer((on) => setTools({ pointer: on }))
  bridge.onMarker((color) => setTools({ marker: color !== null }))
  bridge.onShaper((tool) => setTools({ shaper: tool !== null }))

  window.addEventListener(
    'scroll',
    () => {
      reportIndex()
      schedule()
    },
    { capture: true, passive: true }
  )
  // Skok ze spisu trzyma swój rozdział, aż użytkownik sam ruszy dokument.
  for (const type of ['wheel', 'keydown', 'touchstart', 'pointerdown'] as const) {
    window.addEventListener(type, (event) => event.isTrusted && release(), { capture: true, passive: true })
  }
  window.addEventListener('resize', () => {
    dpr = devicePixelRatio || 1
    scheduleRefresh()
    schedule()
  })
  window.visualViewport?.addEventListener('resize', schedule)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    setTimeout(() => {
      tone = pageTone()
      paperKey = ''
      schedule()
    }, THEME_SETTLE_MS)
  })
  setInterval(() => {
    if (enabled && sketch) readHits()
  }, HIT_CHECK_MS)

  document.addEventListener('toggle', scheduleRefresh, true)
  window.addEventListener('load', scheduleRefresh)
  void document.fonts.ready.then(scheduleRefresh)
  new ResizeObserver(scheduleRefresh).observe(document.documentElement)
  if (document.body) {
    new MutationObserver(scheduleRefresh).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open']
    })
  }
  void refresh()
}
