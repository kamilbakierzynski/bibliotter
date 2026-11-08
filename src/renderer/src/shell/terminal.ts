import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { type ITheme, Terminal } from '@xterm/xterm'
import { applyLayout, G, placeTerminalEdges, sL, sR } from './layout'
import { focusLive } from './native'
import { focusedId, notify, ui } from './state'
import {
  claimKeyboard,
  KEPT_KEY,
  saveSide,
  saveSize,
  term,
  termHeight,
  termSettled,
  termShown,
  termWidth,
  tR,
  type TermSide
} from './terminalLayout'

/*
 * Jeden terminal na okno. Proces powłoki żyje w procesie głównym, a tu stoi xterm, który go rysuje.
 * Schowanie terminala nie kończy sesji, więc po powrocie do dokumentu historia jest na miejscu.
 * Kończy ją dopiero krzyżyk albo `exit` w samej powłoce.
 */

const FONT = "'Geist Mono Variable', 'Cascadia Code', Consolas, ui-monospace, monospace"
const FONT_SIZE = 13
/** Szerokość znaku Geist Mono jako część rozmiaru fontu. */
const ADVANCE = 0.6

/**
 * WebGL ustawia znaki w komórkach o całych pikselach ekranu i zaokrągla szerokość w dół. Geist Mono
 * przy 13 px ma 7,8 px, więc komórka wychodziła na 7 px i litery nachodziły na siebie. Rozmiar fontu
 * idzie więc lekko w górę albo w dół, tak żeby znak miał całą liczbę pikseli przy danej skali ekranu.
 */
export function fontSizeFor(dpr: number): number {
  const scale = dpr > 0 && Number.isFinite(dpr) ? dpr : 1
  const device = Math.max(1, Math.round(ADVANCE * FONT_SIZE * scale))
  // Odrobina zapasu, bo pomiar fontu daje 7,99998 zamiast 8, a to zaokrąglenie w dół zjadłoby piksel.
  return Math.round(((device + 0.02) / (ADVANCE * scale)) * 1000) / 1000
}
/** Przeciąganie krawędzi i ruch sceny zmieniają rozmiar co klatkę, a powłoka przelicza się po każdej zmianie. */
const FIT_MS = 90
/**
 * Powłoka startuje dopiero, gdy panel się wysunął i stanął. Inaczej dostałaby szerokość z połowy
 * animacji, a PowerShell zapamiętuje pozycję kursora z tej chwili i po zmianie rozmiaru pisze
 * pierwsze znaki na samym początku wiersza, po znaku zachęty.
 */
const SIZE_WAIT_MS = 1500
const SIZE_POLL_MS = 32

const LIGHT: ITheme = {
  background: '#ffffff',
  foreground: '#1d1d22',
  cursor: '#131316',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(45, 91, 208, 0.16)',
  selectionInactiveBackground: 'rgba(19, 19, 22, 0.08)',
  scrollbarSliderBackground: 'rgba(19, 19, 22, 0.12)',
  scrollbarSliderHoverBackground: 'rgba(19, 19, 22, 0.22)',
  scrollbarSliderActiveBackground: 'rgba(19, 19, 22, 0.3)',
  overviewRulerBorder: 'transparent',
  black: '#1d1d22',
  red: '#c8331e',
  green: '#2f7d32',
  yellow: '#9a6a00',
  blue: '#2d5bd0',
  magenta: '#9b3fb5',
  cyan: '#1d7f8c',
  white: '#8a8a92',
  brightBlack: '#63636b',
  brightRed: '#e0482f',
  brightGreen: '#3d9a40',
  brightYellow: '#b07c00',
  brightBlue: '#4672e6',
  brightMagenta: '#b552cf',
  brightCyan: '#2595a3',
  brightWhite: '#b4b4bb'
}

const DARK: ITheme = {
  background: '#141417',
  foreground: '#e6e6ea',
  cursor: '#f2f2f4',
  cursorAccent: '#141417',
  selectionBackground: 'rgba(122, 162, 255, 0.26)',
  selectionInactiveBackground: 'rgba(255, 255, 255, 0.1)',
  scrollbarSliderBackground: 'rgba(255, 255, 255, 0.1)',
  scrollbarSliderHoverBackground: 'rgba(255, 255, 255, 0.2)',
  scrollbarSliderActiveBackground: 'rgba(255, 255, 255, 0.28)',
  overviewRulerBorder: 'transparent',
  black: '#2a2a30',
  red: '#ff6b57',
  green: '#7bd17f',
  yellow: '#f2c75c',
  blue: '#7aa2ff',
  magenta: '#d68cf0',
  cyan: '#6fd3df',
  white: '#d0d0d6',
  brightBlack: '#6e6e78',
  brightRed: '#ff8a7a',
  brightGreen: '#98e09b',
  brightYellow: '#ffd878',
  brightBlue: '#9bb9ff',
  brightMagenta: '#e3a8f5',
  brightCyan: '#8fe2ec',
  brightWhite: '#ffffff'
}

let xterm: Terminal | null = null
let fit: FitAddon | null = null
/** Terminal, który już stoi w DOM i zmierzył znaki. Przed otwarciem jego wymiary nic nie znaczą. */
let opened: Terminal | null = null
let titleEl: HTMLElement | null = null
let fitTimer = 0
let starting = false
/** Wyjście sesji, która powstaje, zanim proces główny poda jej numer. */
const early = new Map<number, string>()

interface Kept {
  want: boolean
  side: TermSide
  pinned: boolean
  owner: string | null
  session: number | null
}

function keep(): void {
  const { want, side, pinned, owner, session } = term
  try {
    sessionStorage.setItem(KEPT_KEY, JSON.stringify({ want, side, pinned, owner, session } satisfies Kept))
  } catch {
    // Bez pamięci strony terminal po przeładowaniu po prostu zaczyna od nowa.
  }
}

function readKept(): Kept | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEPT_KEY) ?? 'null') as Kept | null
  } catch {
    return null
  }
}

function changed(): void {
  keep()
  notify()
  applyLayout()
}

export const themeFor = (mode: string): ITheme => (mode === 'dark' ? DARK : LIGHT)

function refit(): void {
  clearTimeout(fitTimer)
  fitTimer = window.setTimeout(() => {
    if (!xterm || !fit || !termShown()) return
    const size = fit.proposeDimensions()
    if (!size || !Number.isFinite(size.cols) || !Number.isFinite(size.rows) || size.cols < 2 || size.rows < 2) return
    if (size.cols === xterm.cols && size.rows === xterm.rows) return
    fit.fit()
    if (term.session !== null) window.api.resizeTerminal(term.session, xterm.cols, xterm.rows)
  }, FIT_MS)
}

const terminalFocused = (): boolean => document.hasFocus() && !!document.activeElement?.closest('.term')

export function focusTerminal(): void {
  const grab = (): void => {
    if (!document.hasFocus()) window.api.focusDoc(null)
    xterm?.focus()
  }
  claimKeyboard()
  grab()
  // Terminal dopiero się wysuwa albo xterm czeka jeszcze na font, więc fokus spróbuje w pierwszej klatce z panelem.
  if (!document.activeElement?.closest('.term')) claimKeyboard(grab)
}

/** Klawisze, które xterm oddaje przeglądarce albo apce zamiast powłoce. */
function terminalKey(event: KeyboardEvent): boolean {
  if (event.type !== 'keydown') return true
  const mod = event.ctrlKey || event.metaKey
  if (mod && event.code === 'Backquote') {
    event.preventDefault()
    toggleTerminalKey()
    return false
  }
  const k = event.key.toLowerCase()
  // Wklejanie robi przeglądarka, a xterm odbiera je jako zdarzenie `paste`.
  if (mod && k === 'v') return false
  if (mod && k === 'c' && (event.shiftKey || xterm?.hasSelection())) {
    const text = xterm?.getSelection() ?? ''
    if (text) window.api.copyText(text)
    xterm?.clearSelection()
    event.preventDefault()
    return false
  }
  return true
}

function attachEarly(id: number): void {
  const data = early.get(id)
  early.clear()
  if (data) xterm?.write(data)
}

interface Size {
  cols: number
  rows: number
}

function validSize(size: { cols: number; rows: number } | undefined): Size | null {
  if (!size || !Number.isFinite(size.cols) || !Number.isFinite(size.rows) || size.cols < 2 || size.rows < 2) return null
  return { cols: size.cols, rows: size.rows }
}

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Rozmiar w znakach, gdy panel stanął: ten sam w dwóch kolejnych pomiarach. Najdłużej czeka `SIZE_WAIT_MS`. */
async function settledSize(): Promise<Size> {
  const until = performance.now() + SIZE_WAIT_MS
  let last = ''
  for (;;) {
    const ready = xterm !== null && opened === xterm && termShown() && termSettled()
    const size = ready ? validSize(fit?.proposeDimensions()) : null
    if (size) {
      const key = `${size.cols}x${size.rows}`
      if (key === last) return size
      last = key
    }
    if (performance.now() > until) return size ?? { cols: xterm?.cols ?? 80, rows: xterm?.rows ?? 24 }
    await pause(SIZE_POLL_MS)
  }
}

async function ensureSession(docId: string | null): Promise<void> {
  if (term.session !== null || starting) return
  starting = true
  try {
    const { cols, rows } = await settledSize()
    if (xterm && (xterm.cols !== cols || xterm.rows !== rows)) xterm.resize(cols, rows)
    const session = await window.api.startTerminal(docId, cols, rows)
    term.session = session.id
    term.cwd = session.cwd
    xterm?.reset()
    attachEarly(session.id)
  } finally {
    starting = false
  }
  changed()
  refit()
}

/** Sesja po przeładowaniu strony dalej działa w procesie głównym, więc terminal wraca do niej. */
async function restore(owner: Terminal): Promise<void> {
  const kept = readKept()
  if (!kept || kept.session === null) return
  const session = await window.api.attachTerminal(kept.session)
  if (xterm !== owner) return
  if (!session) {
    keep()
    return
  }
  Object.assign(term, { want: kept.want, side: kept.side, pinned: kept.pinned, owner: kept.owner })
  term.session = session.id
  term.cwd = session.cwd
  owner.write(session.backlog)
  changed()
  refit()
}

/** Tytuł, który ustawia program w powłoce, na przykład Claude Code. Ścieżka do powłoki nic nie mówi. */
function showTitle(title: string): void {
  const el = titleEl
  if (!el) return
  const task = /^[a-z]:[\\/]|^\/|\.exe$/i.test(title.trim()) ? '' : title.trim()
  if (el.textContent !== task) el.textContent = task
  el.closest('.term')?.classList.toggle('has-task', task !== '')
}

/** Tytuł zmienia się nawet kilka razy na sekundę, więc idzie prosto do DOM, z pominięciem Reacta. */
export function bindTerminalTitle(element: HTMLElement | null): void {
  titleEl = element
}

function ended(): void {
  term.session = null
  term.want = false
  term.pinned = false
  term.cwd = ''
  showTitle('')
  xterm?.reset()
  changed()
  focusLive()
}

let fontsPadded = false

/**
 * Atlas znaków WebGL składa font jako `${kursywa} ${grubość} …`, więc bez kursywy ciąg zaczyna się od
 * spacji. Chromium w tym Electronie taki ciąg odrzuca i płótno zostaje przy `10px sans-serif`, przez
 * co terminal pisał zwykłym bezszeryfowym fontem w komórkach od Geist Mono. Setter obcina więc
 * spację z przodu, i to tylko wtedy, gdy przeglądarka faktycznie się na niej wykłada.
 */
function acceptPaddedFonts(): void {
  if (fontsPadded) return
  fontsPadded = true
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return
  probe.font = ' 12px monospace'
  if (probe.font.startsWith('12px')) return
  const proto = CanvasRenderingContext2D.prototype
  const font = Object.getOwnPropertyDescriptor(proto, 'font')
  const set = font?.set
  if (!font || !set) return
  Object.defineProperty(proto, 'font', {
    ...font,
    set(this: CanvasRenderingContext2D, value: unknown) {
      set.call(this, typeof value === 'string' ? value.trimStart() : value)
    }
  })
}

/**
 * Terminal rysuje się w WebGL. Domyślne rysowanie w DOM zmienia przy każdej klatce programu setki
 * elementów w dokumencie powłoki, a każda taka zmiana przelicza style całej powłoki. Przy Claude Code,
 * który przerysowuje ekran kilkanaście razy na sekundę, to było widać jako opóźnienie.
 */
function useGpu(own: Terminal): void {
  acceptPaddedFonts()
  try {
    const gpu = new WebglAddon()
    // Utrata kontekstu WebGL wraca terminal do rysowania w DOM, zamiast zostawić pusty ekran.
    gpu.onContextLoss(() => gpu.dispose())
    own.loadAddon(gpu)
  } catch {
    // Bez WebGL xterm rysuje w DOM, wolniej, ale poprawnie.
  }
}

function bufferText(own: Terminal): string {
  const buffer = own.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
  return lines.join('\n')
}

/** Montuje xterm w elemencie panelu. Zwraca sprzątanie, bo React w trybie dev montuje dwa razy. */
export function mountTerminal(element: HTMLElement): () => void {
  const own = new Terminal({
    fontFamily: FONT,
    fontSize: fontSizeFor(devicePixelRatio),
    fontWeightBold: 600,
    lineHeight: 1.25,
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorWidth: 2,
    cursorInactiveStyle: 'outline',
    scrollback: 10000,
    smoothScrollDuration: 90,
    minimumContrastRatio: 4.5,
    drawBoldTextInBrightColors: false,
    allowProposedApi: true,
    theme: themeFor(ui.mode)
  })
  const addon = new FitAddon()
  own.loadAddon(addon)
  // Szerokości emoji i znaków, którymi rysują programy w rodzaju Claude Code, według Unicode 11.
  own.loadAddon(new Unicode11Addon())
  own.unicode.activeVersion = '11'
  own.loadAddon(
    new WebLinksAddon((event, uri) => {
      event.preventDefault()
      void window.api.openExternal(uri)
    })
  )
  own.attachCustomKeyEventHandler(terminalKey)
  own.onData((data) => {
    if (term.session !== null) window.api.writeTerminal(term.session, data)
  })
  own.onTitleChange(showTitle)
  xterm = own
  fit = addon
  // W WebGL tekst nie stoi w DOM, więc testy i debugowanie czytają go stąd.
  Object.defineProperty(element, 'terminalText', { configurable: true, get: () => bufferText(own) })
  // Szerokość znaku xterm mierzy przy otwarciu, więc font musi już być wczytany.
  void document.fonts.load(`${fontSizeFor(devicePixelRatio)}px ${FONT}`).finally(() => {
    if (xterm !== own) return
    own.open(element)
    useGpu(own)
    opened = own
    refit()
  })
  const observer = new ResizeObserver(refit)
  observer.observe(element)
  // Powiększenie okna albo przeniesienie na inny ekran zmienia skalę, a z nią rozmiar fontu w całych pikselach.
  let scale: MediaQueryList | null = null
  const rescale = (): void => {
    scale?.removeEventListener('change', rescale)
    scale = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
    scale.addEventListener('change', rescale)
    const size = fontSizeFor(devicePixelRatio)
    if (own.options.fontSize !== size) {
      own.options.fontSize = size
      refit()
    }
  }
  rescale()
  const offData = window.api.onTerminalData(({ id, data }) => {
    if (id === term.session) own.write(data)
    else if (term.session === null && starting) early.set(id, (early.get(id) ?? '') + data)
  })
  const offExit = window.api.onTerminalExit((id) => {
    if (id === term.session) ended()
  })
  void restore(own)
  return () => {
    observer.disconnect()
    scale?.removeEventListener('change', rescale)
    offData()
    offExit()
    if (xterm === own) {
      xterm = null
      fit = null
    }
    if (opened === own) opened = null
    own.dispose()
  }
}

export function syncTerminalTheme(mode: string): void {
  if (xterm) xterm.options.theme = themeFor(mode)
}

export function showTerminal(side?: TermSide, docId: string | null = focusedId()): void {
  if (ui.home || ui.presenting || ui.setup !== null) return
  if (side && side !== term.side) {
    term.side = side
    saveSide()
  }
  term.want = true
  if (!term.pinned && docId) term.owner = docId
  changed()
  void ensureSession(docId)
  focusTerminal()
}

export function hideTerminal(): void {
  if (!term.want) return
  term.want = false
  changed()
  focusLive()
}

/** Przycisk na tabliczce dokumentu chowa terminal tego dokumentu albo go pokazuje. */
export function toggleTerminal(docId: string | null = focusedId()): void {
  if (termShown()) hideTerminal()
  else showTerminal(undefined, docId)
}

/** Ctrl `: pokazuje terminal, przenosi do niego klawiaturę, a z klawiaturą w nim chowa go. */
export function toggleTerminalKey(): void {
  if (!termShown()) showTerminal()
  else if (terminalFocused()) hideTerminal()
  else focusTerminal()
}

export function closeTerminal(): void {
  if (term.session !== null) window.api.killTerminal(term.session)
  term.session = null
  term.want = false
  term.pinned = false
  term.cwd = ''
  showTitle('')
  xterm?.reset()
  changed()
  focusLive()
}

/** Przypięty terminal stoi przy każdym dokumencie, a odpięty zostaje z dokumentem, który jest teraz na wierzchu. */
export function togglePin(): void {
  term.pinned = !term.pinned
  if (!term.pinned) term.owner = focusedId() ?? term.owner
  changed()
}

export function setSide(side: TermSide): void {
  if (term.side === side) return
  term.side = side
  saveSide()
  changed()
  refit()
}

export function flipSide(): void {
  setSide(term.side === 'right' ? 'bottom' : 'right')
}


/**
 * Krawędź terminala przeciągnięta do punktu w oknie. Uchwyt stoi w odstępie przed terminalem,
 * więc jego środek to brzeg terminala minus pół odstępu. Krawędź idzie za ręką bez sprężyny,
 * a dokumenty zostają żywe, jak przy uchwycie podziału. Zdjęte na zrzuty odświeżałyby się skokami.
 */
export function dragEdge(x: number, y: number): void {
  if (term.side === 'right') {
    const base = G.W - G.stageRight
    const panel = tR.t - sR.t
    term.size.right = termWidth(base - panel - sL.t, base - x - G.stageGap / 2)
  } else {
    term.size.bottom = termHeight(G.H - G.stageTop - G.stageBot, G.H - G.stageBot - y - G.stageGap / 2)
  }
  placeTerminalEdges()
}

export function endDrag(): void {
  saveSize()
  keep()
  applyLayout()
  refit()
}
