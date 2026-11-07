import { FitAddon } from '@xterm/addon-fit'
import { type ITheme, Terminal } from '@xterm/xterm'
import { clamp } from '../motion/spring'
import { applyLayout, G, sL } from './layout'
import { focusLive } from './native'
import { focusedId, notify, ui } from './state'
import { claimKeyboard, KEPT_KEY, saveSide, saveSize, term, termShown, tR, type TermSide } from './terminalLayout'

/*
 * Jeden terminal na okno. Proces powłoki żyje w procesie głównym, a tu stoi xterm, który go rysuje.
 * Schowanie terminala nie kończy sesji, więc po powrocie do dokumentu historia jest na miejscu.
 * Kończy ją dopiero krzyżyk albo `exit` w samej powłoce.
 */

const FONT = "'Geist Mono Variable', 'Cascadia Code', Consolas, ui-monospace, monospace"
/** Przeciąganie krawędzi i ruch sceny zmieniają rozmiar co klatkę, a powłoka przelicza się po każdej zmianie. */
const FIT_MS = 90

const LIGHT: ITheme = {
  background: '#ffffff',
  foreground: '#1d1d22',
  cursor: '#131316',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(19, 19, 22, 0.14)',
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
  selectionBackground: 'rgba(255, 255, 255, 0.18)',
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

async function ensureSession(docId: string | null): Promise<void> {
  if (term.session !== null || starting) return
  starting = true
  const size = fit?.proposeDimensions()
  const cols = size && Number.isFinite(size.cols) && size.cols > 1 ? size.cols : (xterm?.cols ?? 80)
  const rows = size && Number.isFinite(size.rows) && size.rows > 1 ? size.rows : (xterm?.rows ?? 24)
  try {
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

function ended(): void {
  term.session = null
  term.want = false
  term.pinned = false
  term.cwd = ''
  xterm?.reset()
  changed()
  focusLive()
}

/** Montuje xterm w elemencie panelu. Zwraca sprzątanie, bo React w trybie dev montuje dwa razy. */
export function mountTerminal(element: HTMLElement): () => void {
  const own = new Terminal({
    fontFamily: FONT,
    fontSize: 12.5,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollback: 5000,
    minimumContrastRatio: 4.5,
    theme: themeFor(ui.mode)
  })
  const addon = new FitAddon()
  own.loadAddon(addon)
  own.attachCustomKeyEventHandler(terminalKey)
  own.onData((data) => {
    if (term.session !== null) window.api.writeTerminal(term.session, data)
  })
  xterm = own
  fit = addon
  // Szerokość znaku xterm mierzy przy otwarciu, więc font musi już być wczytany.
  void document.fonts.load(`12.5px ${FONT}`).finally(() => {
    if (xterm !== own) return
    own.open(element)
    refit()
  })
  const observer = new ResizeObserver(refit)
  observer.observe(element)
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
    offData()
    offExit()
    if (xterm === own) {
      xterm = null
      fit = null
    }
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

/** Krawędź terminala przeciągnięta do punktu w oknie. */
export function dragEdge(x: number, y: number): void {
  if (term.side === 'right') {
    term.size.right = Math.round(clamp(tR.t - x - G.stageGap / 2, 0, tR.t - sL.t))
  } else {
    term.size.bottom = Math.round(clamp(G.H - G.stageBot - y - G.stageGap / 2, 0, G.H))
  }
  applyLayout()
}

export function endDrag(): void {
  saveSize()
  keep()
  refit()
}
