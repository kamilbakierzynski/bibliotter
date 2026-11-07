import { playable, shotAt, stepFrom, stepState } from '../../../shared/presentation'
import { aimCamera } from './camera'
import { drawings } from './drawings'
import { closeLabelPop } from './labels'
import { applyLayout, edgeMotion, reflow, SHUT } from './layout'
import { closeThread, setInsp, setTool, showPanel } from './notes'
import { outline } from './outline'
import { closeCmd } from './palette'
import { endPick, flushRoute, loadRoute, route, routeLoaded, selectedIndex, stepsOf, syncFrames } from './route'
import { closePeek, syncFocus } from './sheets'
import { data, focusedId, notify, openPane, pinned, ui } from './state'

/*
 * Odtwarzanie trasy. Dokument staje się prezentacją: szyna i panele schodzą, arkusz bierze całe
 * okno, a dok zamienia się w pilota. Każdy krok to jedno naciśnięcie: kamera jedzie do kadru,
 * maska kładzie się wokół niego, a kształty kroku rysują się, gdy kamera stanie.
 *
 * Szybkie naciśnięcia nie ustawiają się w kolejce: licznik w doku idzie od razu, a kamera jedzie
 * do ostatniego wybranego kroku, gdy skończy poprzedni ruch.
 */

/** Tyle czekamy, aż dokument zgłosi kroki bez kadru. Bez odpowiedzi prezentacja i tak rusza. */
const MISSING_WAIT_MS = 400

interface Saved {
  nav: boolean
  insp: boolean
  order: number[]
  docs: (string | null)[]
  minimap: boolean
}

export const show = {
  /** Krok na trasie, który widać albo do którego kamera właśnie jedzie. */
  index: -1,
  /** Przełącznik rysunków odsłania wszystkie uwagi dokumentu. */
  reveal: false
}

let saved: Saved | null = null
/** Uwagi, które dokument pokazuje. Kształt spoza tej listy rysuje się na oczach widzów. */
let visible = new Set<string>()
let wanted: number | null = null
let running = false

const missingOf = (docId: string): ReadonlySet<string> => route.missing.get(docId) ?? new Set()

/** Kroki do pokazania w otwartej prezentacji. */
export function playableSteps(): number[] {
  const docId = ui.presenting
  return docId ? playable(stepsOf(docId), missingOf(docId)) : []
}

const shapeIds = (docId: string): string[] =>
  drawings.shapes.filter((shape) => shape.docId === docId).map(({ id }) => id)

/** Wszystko, co dokument może pokazać, gdy przełącznik rysunków odsłania uwagi. */
function everything(docId: string): string[] {
  const notes = data.annotations.filter((note) => note.docId === docId && note.status === 'open').map(({ id }) => id)
  return [...notes, ...shapeIds(docId)]
}

async function present(index: number): Promise<void> {
  const docId = ui.presenting
  const pane = docId ? openPane(docId) : -1
  if (!docId || pane < 0) return
  const steps = stepsOf(docId)
  const missing = missingOf(docId)
  const state = stepState(steps, index, show.reveal, missing)
  const now = new Set(state.reveal ? everything(docId) : state.show)
  const shapes = new Set(shapeIds(docId))
  const pending = [...now].filter((id) => shapes.has(id) && !visible.has(id))
  visible = now
  const send = (waiting: string[]): void => window.api.setPresent(docId, { ...state, pending: waiting })
  // Maska i uwagi zmieniają się między zrzutami kamery, więc przenikają razem z jej przelotem.
  await aimCamera(pane, shotAt(steps, index, missing), { before: () => send(pending) })
  if (ui.presenting === docId && pending.length > 0) send([])
}

async function pump(): Promise<void> {
  if (running) return
  running = true
  try {
    while (wanted !== null && ui.presenting) {
      const index = wanted
      wanted = null
      await present(index)
    }
  } finally {
    running = false
  }
}

export function goToStep(index: number): void {
  if (!ui.presenting || index < 0 || index >= stepsOf(ui.presenting).length) return
  show.index = index
  wanted = index
  notify()
  void pump()
}

export function stepBy(direction: 1 | -1): void {
  const docId = ui.presenting
  if (!docId) return
  const next = stepFrom(stepsOf(docId), show.index, direction, missingOf(docId))
  if (next !== null) goToStep(next)
}

export function stepToEnd(last: boolean): void {
  const list = playableSteps()
  const index = last ? list[list.length - 1] : list[0]
  if (index !== undefined) goToStep(index)
}

/** W prezentacji przełącznik rysunków odsłania resztę uwag dokumentu, a drugi raz je chowa. */
export function toggleReveal(): void {
  show.reveal = !show.reveal
  goToStep(show.index)
}

/** Dokument zgłasza kroki bez kadru po swoim pierwszym ułożeniu, więc chwilę na to czekamy. */
async function missingKnown(docId: string): Promise<void> {
  const started = performance.now()
  while (!route.missing.has(docId) && performance.now() - started < MISSING_WAIT_MS) {
    await new Promise((done) => setTimeout(done, 30))
  }
}

/**
 * Zaczyna prezentację dokumentu, który ma fokus. `fromSelected` zaczyna od kroku wybranego
 * w formularzu trasy, a bez niego od pierwszego. Dokument bez trasy otwiera formularz.
 */
export async function startPresentation(fromSelected = false): Promise<void> {
  if (ui.presenting || (ui.home && ui.peek === null)) return
  const docId = focusedId()
  if (!docId) return
  if (!routeLoaded(docId)) await loadRoute(docId)
  if (ui.presenting || focusedId() !== docId) return
  const steps = stepsOf(docId)
  if (steps.length === 0) {
    showPanel('route')
    return
  }
  const from = fromSelected ? selectedIndex(docId) : 0
  flushRoute(docId)
  endPick()
  closeCmd()
  setTool('move')
  closeLabelPop()
  if (ui.selNote) closeThread()
  // Podejrzany dokument wraca na miejsce, a prezentacja zaczyna się od dokumentu pod nim.
  if (ui.peek !== null) closePeek()
  if (focusedId() !== docId) return

  saved = {
    nav: ui.nav,
    insp: ui.insp,
    order: [...ui.order],
    docs: ui.order.map((i) => ui.panes[i] ?? null),
    minimap: outline.minimap
  }
  ui.presenting = docId
  show.index = -1
  show.reveal = false
  visible = new Set()
  route.preview = false
  document.documentElement.classList.add('presenting')
  if (ui.insp) setInsp(false)
  if (pinned() > 1) {
    reflow(() => {
      ui.order = [ui.focus]
    }, SHUT)
    syncFocus()
  }
  ui.nav = false
  edgeMotion()
  if (outline.minimap) window.api.setMinimap(false)
  applyLayout()
  syncFrames()
  notify()

  await missingKnown(docId)
  if (ui.presenting !== docId) return
  const list = playableSteps()
  const first = list.find((i) => i >= from) ?? list[0]
  if (first === undefined) {
    // Żaden krok nie ma już swojego kadru, a formularz trasy mówi, które trzeba wskazać od nowa.
    stopPresentation()
    showPanel('route')
    return
  }
  goToStep(first)
}

export function stopPresentation(): void {
  const docId = ui.presenting
  if (!docId) return
  ui.presenting = null
  wanted = null
  show.index = -1
  show.reveal = false
  visible = new Set()
  window.api.setPresent(docId, null)
  const pane = openPane(docId)
  if (pane >= 0) void aimCamera(pane, null)
  if (ui.tool !== 'move') setTool('move')
  document.documentElement.classList.remove('presenting')
  const restore = saved
  saved = null
  if (restore) {
    if (restore.minimap) window.api.setMinimap(true)
    // Wracają tylko te arkusze, które wciąż pokazują swoje dokumenty.
    const back = restore.order.filter((i, at) => ui.panes[i] === restore.docs[at])
    if (back.length > 1 && back.includes(ui.focus)) {
      reflow(() => {
        ui.order = back
      })
      syncFocus()
    }
    ui.nav = restore.nav
    edgeMotion()
    if (restore.insp) setInsp(true)
  }
  applyLayout()
  syncFrames()
  notify()
}

/** Dokument zniknął z arkusza, więc nie ma już czego prezentować. */
export function checkPresentation(): void {
  if (ui.presenting && openPane(ui.presenting) < 0) stopPresentation()
}
