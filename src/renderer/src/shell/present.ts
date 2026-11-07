import { playable, type PresentState, shotAt, stepFrom, stepState } from '../../../shared/presentation'
import { aimCamera } from './camera'
import { drawings } from './drawings'
import { closeLabelPop } from './labels'
import { applyLayout, edgeMotion, reflow, SHUT } from './layout'
import { cancelDraft, closeThread, setInsp, setTool, showPanel } from './notes'
import { outline } from './outline'
import { closeCmd } from './palette'
import { endPick, flushRoute, loadRoute, route, routeLoaded, selectedIndex, stepsOf, syncFrames } from './route'
import { closePeek, syncFocus } from './sheets'
import { canAnnotate, data, focusedId, notify, openPane, pinned, ui } from './state'

/*
 * Odtwarzanie trasy. Dokument staje się prezentacją: szyna i panele schodzą, arkusz bierze całe
 * okno, a dok zamienia się w pilota. Każdy krok to jedno naciśnięcie: kamera jedzie do kadru,
 * maska kładzie się wokół niego, a kształty kroku rysują się, gdy kamera stanie.
 *
 * Szybkie naciśnięcia nie ustawiają się w kolejce: licznik w doku idzie od razu, a kamera jedzie
 * do ostatniego wybranego kroku, gdy skończy poprzedni ruch.
 *
 * Uwaga dodana w trakcie nie wchodzi do trasy. Należy do kroku, na którym powstała, i jest na nim
 * widoczna do końca prezentacji. Po wyjściu panel uwag pokazuje listę dodanych.
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
/** Uwagi i kształty dokumentu sprzed prezentacji. Nowa uwaga to taka, której tu nie ma. */
let known = new Set<string>()
/** Uwagi dodane w trakcie i krok, na którym powstały. */
const added = new Map<string, number>()
/** Krok, który dokument pokazuje albo który dostanie po ruchu kamery. */
let shown = -1
/** Uwagi zmieniły się w trakcie ruchu kamery, więc po ruchu dokument dostaje stan od nowa. */
let dirty = false

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

/** Każda uwaga i każdy kształt dokumentu, także zamknięte. */
const allIds = (docId: string): string[] => [
  ...data.annotations.filter((note) => note.docId === docId).map(({ id }) => id),
  ...shapeIds(docId)
]

/** Stan kroku razem z uwagami, które powstały na nim w trakcie prezentacji. */
const stateFor = (docId: string, index: number): Omit<PresentState, 'pending'> =>
  stepState(stepsOf(docId), index, show.reveal, missingOf(docId), added)

const visibleIn = (docId: string, state: Omit<PresentState, 'pending'>): Set<string> =>
  new Set(state.reveal ? everything(docId) : state.show)

async function present(index: number): Promise<void> {
  const docId = ui.presenting
  const pane = docId ? openPane(docId) : -1
  if (!docId || pane < 0) return
  const steps = stepsOf(docId)
  const missing = missingOf(docId)
  const now = visibleIn(docId, stateFor(docId, index))
  const shapes = new Set(shapeIds(docId))
  const pending = [...now].filter((id) => shapes.has(id) && !visible.has(id))
  visible = now
  shown = index
  dirty = false
  // Ruch kamery czeka w kolejce, a prezentacja mogła się w tym czasie skończyć. Wtedy dokument
  // nie może dostać z powrotem maski. Stan liczy się w chwili wysyłki, bo w trakcie ruchu mogła
  // dojść nowa uwaga.
  const send = (waiting: string[]): void => {
    if (ui.presenting === docId) window.api.setPresent(docId, { ...stateFor(docId, index), pending: waiting })
  }
  // Maska i uwagi zmieniają się między zrzutami kamery, więc przenikają razem z jej przelotem.
  await aimCamera(pane, shotAt(steps, index, missing), {
    before: () => send(pending),
    skip: () => ui.presenting !== docId
  })
  if (pending.length > 0 || dirty) send([])
  dirty = false
}

/** Uwagi kroku zmieniły się bez ruchu kamery, więc dokument dostaje ten sam krok od nowa. */
function refresh(): void {
  const docId = ui.presenting
  if (!docId || shown < 0) return
  if (running) {
    dirty = true
    return
  }
  const state = stateFor(docId, shown)
  visible = visibleIn(docId, state)
  window.api.setPresent(docId, { ...state, pending: [] })
}

/**
 * Lista uwag przyszła od nowa. Uwaga, której nie było przed prezentacją, należy do kroku, który
 * widać w doku, i dokument pokazuje ją od razu.
 */
export function notesChanged(): void {
  const docId = ui.presenting
  if (!docId) return
  let fresh = false
  for (const id of allIds(docId)) {
    if (known.has(id)) continue
    known.add(id)
    added.set(id, Math.max(show.index, 0))
    fresh = true
  }
  if (!fresh) return
  notify()
  refresh()
}

/** Ile uwag i kształtów dodano w tej prezentacji. Usunięte w trakcie się nie liczą. */
export function addedCount(): number {
  const docId = ui.presenting
  if (!docId) return 0
  const ids = new Set(allIds(docId))
  return [...added.keys()].filter((id) => ids.has(id)).length
}

/**
 * Nowy komentarz albo karteczka w prezentacji. Dokument stawia szkic przy kadrze kroku, pole
 * wpisu staje nad dokiem, a kliknięcie w dokument przestawia szkic. Drugi raz ten sam rodzaj
 * zamyka szkic.
 */
export function startNote(kind: 'comment' | 'sticky'): void {
  const docId = ui.presenting
  if (!docId || !canAnnotate(data.entries.get(docId) ?? null)) return
  if (ui.draft?.docId === docId && ui.draft.kind === kind) {
    cancelDraft()
    return
  }
  if (ui.tool !== 'move') setTool('move')
  window.api.placeNote(docId, kind, ui.color)
}

/** Zakreślacz i kształt działają w prezentacji jak poza nią. Drugi raz to samo narzędzie je odkłada. */
export function presentTool(tool: 'highlight' | 'shape'): void {
  const docId = ui.presenting
  if (!docId || !canAnnotate(data.entries.get(docId) ?? null)) return
  setTool(ui.tool === tool ? 'move' : tool)
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
  // Szkic należy do miejsca w kroku, który właśnie znika.
  if (index !== show.index && ui.draft?.docId === ui.presenting) cancelDraft()
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
  ui.added = null
  show.index = -1
  show.reveal = false
  visible = new Set()
  known = new Set(allIds(docId))
  added.clear()
  shown = -1
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
  if (ui.draft?.docId === docId) cancelDraft()
  // Lista po wyjściu zbiera uwagi z panelu. Kształty nie są notatkami, więc ich na niej nie ma.
  const notes = new Set(data.annotations.filter((note) => note.docId === docId).map(({ id }) => id))
  const kept = [...added.keys()].filter((id) => notes.has(id))
  ui.presenting = null
  wanted = null
  show.index = -1
  show.reveal = false
  visible = new Set()
  added.clear()
  shown = -1
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
  if (kept.length > 0) {
    ui.added = { docId, ids: kept }
    showPanel('notes')
  }
  applyLayout()
  syncFrames()
  notify()
}

/** Dokument zniknął z arkusza, więc nie ma już czego prezentować. */
export function checkPresentation(): void {
  if (ui.presenting && openPane(ui.presenting) < 0) stopPresentation()
}
