import { t } from '../../../shared/i18n'
import {
  MAX_STEPS,
  moveStep,
  nextStep,
  type PickKind,
  type Presentation,
  type PresentationStep,
  type PresentState,
  shotAt,
  shotOwner,
  type StepCamera,
  type StepRest,
  stepState
} from '../../../shared/presentation'
import { aimCamera } from './camera'
import { drawings } from './drawings'
import { setTool } from './notes'
import { data, focusedId, notify, openPane, ui } from './state'

/*
 * Trasa prezentacji w powłoce. Formularz zmienia trasę od razu na ekranie, a zapis idzie za nim:
 * tytuł po krótkiej przerwie w pisaniu, reszta od razu. Trasę może też zapisać agent, więc zmiana
 * na dysku wraca do formularza, o ile użytkownik nie ma właśnie niezapisanej zmiany.
 *
 * Przy otwartym formularzu dokument pokazuje przerywaną ramką kadr wybranego kroku. Podgląd
 * pokazuje krok tak, jak zobaczą go widzowie: kamera jedzie do kadru, maska kładzie się wokół
 * niego, a dokument pokazuje tylko uwagi kroku. Nowa uwaga albo kształt narysowany przy otwartym
 * podglądzie trafia do wybranego kroku, bo inaczej zniknąłby zaraz po narysowaniu.
 */

/** Tyle czeka zapis tytułu, żeby nie pisać pliku przy każdej literze. */
const TITLE_SAVE_MS = 400

export interface PickState {
  docId: string
  stepId: string
  kind: PickKind
}

export const route = {
  docs: new Map<string, Presentation>(),
  selected: new Map<string, string>(),
  /** Kroki, których kadru nie ma w dokumencie. Zgłasza je warstwa dokumentu. */
  missing: new Map<string, Set<string>>(),
  picking: null as PickState | null,
  /**
   * Podgląd kroku przypięty kliknięciem oka. Bez niego kamera stoi, bo układanie trasy nie powinno
   * od razu przybliżać dokumentu. Zmiana dokumentu albo zamknięcie formularza odpina podgląd.
   */
  preview: false,
  /** Kursor stoi na oku, więc podgląd pokazuje krok tylko na tę chwilę. */
  peek: false,
  /** Ostatnio usunięty krok, do cofnięcia przyciskiem w formularzu. */
  removed: null as { docId: string; step: PresentationStep; index: number } | null
}

/** Ostatnia trasa znana z dysku, żeby własny zapis nie wracał do formularza jako cudza zmiana. */
const saved = new Map<string, string>()
const timers = new Map<string, number>()
const inFlight = new Map<string, number>()
/** Dokument, który pokazuje teraz kadry. */
let framed: string | null = null

const newId = (): string => `s${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
const busy = (docId: string): boolean => timers.has(docId) || (inFlight.get(docId) ?? 0) > 0

export const stepsOf = (docId: string | null): PresentationStep[] => (docId ? (route.docs.get(docId)?.steps ?? []) : [])
export const routeLoaded = (docId: string | null): boolean => docId !== null && route.docs.has(docId)

export function stepLabel(step: PresentationStep, index: number): string {
  return step.title.trim() || t('Krok {n}', { n: index + 1 })
}

export function selectedIndex(docId: string | null): number {
  const steps = stepsOf(docId)
  const id = docId ? route.selected.get(docId) : undefined
  const index = steps.findIndex((step) => step.id === id)
  return index >= 0 ? index : steps.length > 0 ? 0 : -1
}

export const selectedStep = (docId: string | null): PresentationStep | null =>
  stepsOf(docId)[selectedIndex(docId)] ?? null

async function flush(docId: string): Promise<void> {
  timers.delete(docId)
  const presentation = route.docs.get(docId)
  if (!presentation) return
  const json = JSON.stringify(presentation)
  if (json === saved.get(docId)) return
  saved.set(docId, json)
  inFlight.set(docId, (inFlight.get(docId) ?? 0) + 1)
  try {
    const stored = await window.api.savePresentation(docId, presentation)
    saved.set(docId, JSON.stringify(stored))
  } catch {
    // Dokument mógł właśnie zniknąć z biblioteki. Formularz i tak się wtedy zamknie.
  } finally {
    inFlight.set(docId, (inFlight.get(docId) ?? 1) - 1)
  }
}

function commit(docId: string, steps: PresentationStep[], soon = false): void {
  route.docs.set(docId, { steps })
  route.removed = null
  const timer = timers.get(docId)
  if (timer !== undefined) clearTimeout(timer)
  timers.set(
    docId,
    window.setTimeout(() => void flush(docId), soon ? TITLE_SAVE_MS : 0)
  )
  syncFrames()
  notify()
}

/** Formularz przy zamknięciu nie może zgubić tytułu, który czekał na zapis. */
export function flushRoute(docId: string | null): void {
  const timer = docId ? timers.get(docId) : undefined
  if (!docId || timer === undefined) return
  clearTimeout(timer)
  void flush(docId)
}

export async function loadRoute(docId: string): Promise<void> {
  let presentation: Presentation
  try {
    presentation = await window.api.getPresentation(docId)
  } catch {
    return
  }
  // Niezapisana zmiana z formularza jest nowsza niż to, co leży na dysku.
  if (busy(docId)) return
  const json = JSON.stringify(presentation)
  if (route.docs.has(docId) && json === saved.get(docId)) return
  saved.set(docId, json)
  route.docs.set(docId, presentation)
  syncFrames()
  notify()
}

export function reloadRoutes(): void {
  for (const docId of route.docs.keys()) void loadRoute(docId)
}

function update(docId: string, id: string, change: Partial<PresentationStep>, soon = false): void {
  commit(
    docId,
    stepsOf(docId).map((step) => (step.id === id ? { ...step, ...change } : step)),
    soon
  )
}

export function selectStep(docId: string, id: string): void {
  if (route.picking && route.picking.stepId !== id) endPick()
  route.selected.set(docId, id)
  syncFrames()
  notify()
}

/** Nowy krok staje za wybranym jako jego kopia, bo trasa zwykle idzie dalej od tego miejsca. */
export function addStep(docId: string): void {
  const steps = stepsOf(docId)
  if (steps.length >= MAX_STEPS) return
  const at = selectedIndex(docId)
  const step = nextStep(steps[at], newId())
  const next = [...steps]
  next.splice(at + 1, 0, step)
  route.selected.set(docId, step.id)
  commit(docId, next)
}

/**
 * Krok z menu zaznaczonego tekstu. Przy otwartym formularzu staje za wybranym, jak przycisk
 * w formularzu, a bez formularza na końcu trasy, bo dokument czyta się wtedy od góry do dołu.
 */
export async function addStepAt(docId: string, camera: StepCamera, title: string): Promise<void> {
  if (!route.docs.has(docId)) await loadRoute(docId)
  // Trasa, której nie udało się wczytać, nie może zostać nadpisana jednym krokiem.
  if (!route.docs.has(docId)) return
  const steps = stepsOf(docId)
  if (steps.length >= MAX_STEPS) return
  const editing = ui.insp && ui.inspView === 'route' && focusedId() === docId
  const at = editing ? selectedIndex(docId) : steps.length - 1
  const step = { ...nextStep(steps[at], newId()), title, camera }
  const next = [...steps]
  next.splice(at + 1, 0, step)
  route.selected.set(docId, step.id)
  commit(docId, next)
}

export function removeStep(docId: string, id: string): void {
  const steps = stepsOf(docId)
  const index = steps.findIndex((step) => step.id === id)
  if (index < 0) return
  if (route.picking?.stepId === id) endPick()
  const step = steps[index] as PresentationStep
  const next = steps.filter((item) => item.id !== id)
  const neighbour = next[Math.min(index, next.length - 1)]
  if (neighbour) route.selected.set(docId, neighbour.id)
  else route.selected.delete(docId)
  commit(docId, next)
  route.removed = { docId, step, index }
  notify()
}

export function restoreStep(): void {
  const removed = route.removed
  if (!removed) return
  const next = [...stepsOf(removed.docId)]
  next.splice(Math.min(removed.index, next.length), 0, removed.step)
  route.selected.set(removed.docId, removed.step.id)
  commit(removed.docId, next)
}

export function shiftStep(docId: string, id: string, delta: number): void {
  commit(docId, moveStep(stepsOf(docId), id, delta))
}

export const renameStep = (docId: string, id: string, title: string): void => update(docId, id, { title }, true)
export const setRest = (docId: string, id: string, rest: StepRest): void => update(docId, id, { rest })

export function toggleShown(docId: string, id: string, noteId: string): void {
  const step = stepsOf(docId).find((item) => item.id === id)
  if (!step) return
  const show = step.show.includes(noteId) ? step.show.filter((item) => item !== noteId) : [...step.show, noteId]
  update(docId, id, { show })
}

export function holdCamera(docId: string, id: string): void {
  endPick()
  update(docId, id, { camera: { kind: 'hold' } })
}

/** Dokument czeka na kliknięcie albo przeciągnięcie. Inne narzędzia muszą wtedy oddać mysz. */
export function startPick(kind: PickKind): void {
  const docId = focusedId()
  const step = selectedStep(docId)
  if (!docId || !step) return
  if (route.picking?.kind === kind && route.picking.stepId === step.id) {
    endPick()
    return
  }
  setTool('move')
  route.picking = { docId, stepId: step.id, kind }
  window.api.setRoutePicker(docId, kind)
  notify()
}

/** Kończy wskazywanie. Zwraca `true`, gdy było co kończyć, żeby `Esc` nie robił nic więcej. */
export function endPick(): boolean {
  const picking = route.picking
  if (!picking) return false
  route.picking = null
  window.api.setRoutePicker(picking.docId, null)
  notify()
  return true
}

export function handleRoutePick(docId: string, camera: StepCamera): void {
  const picking = route.picking
  if (!picking || picking.docId !== docId) return
  endPick()
  update(docId, picking.stepId, { camera })
}

export function setMissing(docId: string, ids: string[]): void {
  route.missing.set(docId, new Set(ids))
  notify()
}

export function togglePreview(): void {
  route.preview = !route.preview
  // Kliknięcie decyduje samo, więc odpięcie nie czeka, aż kursor zejdzie z oka.
  clearTimeout(peekTimer)
  route.peek = false
  syncFrames()
  notify()
}

/** Krótkie przejście kursorem przez oko, np. w drodze do zamknięcia panelu, nie rusza kamery. */
const PEEK_DELAY = 180
let peekTimer: ReturnType<typeof setTimeout> | undefined

export function peekPreview(on: boolean): void {
  clearTimeout(peekTimer)
  if (!on) {
    if (!route.peek) return
    route.peek = false
    syncFrames()
    notify()
    return
  }
  peekTimer = setTimeout(() => {
    route.peek = true
    syncFrames()
    notify()
  }, PEEK_DELAY)
}

/**
 * Kadry dla dokumentu z otwartym formularzem. Krok z kamerą „bez ruchu” pokazuje kadr kroku,
 * który kamerę ustawił, bo to właśnie ten kawałek zobaczą widzowie.
 */
export function syncFrames(): void {
  // Prezentacja nie pokazuje ramek, ale dokument musi sprawdzić, które kroki mają swój kadr.
  const presenting = ui.presenting !== null && !(ui.insp && ui.inspView === 'route')
  const docId = presenting ? ui.presenting : ui.insp && ui.inspView === 'route' ? focusedId() : null
  if (framed && framed !== docId) {
    window.api.setRouteFrames(framed, null)
    if (route.picking?.docId === framed) endPick()
    route.preview = false
    route.peek = false
    clearTimeout(peekTimer)
  }
  framed = docId
  void settlePreview()
  if (!docId) return
  const steps = stepsOf(docId)
  const owner = shotOwner(steps, selectedIndex(docId))
  window.api.setRouteFrames(docId, {
    frames: steps.map((step, i) => ({ id: step.id, camera: step.camera, label: stepLabel(step, i) })),
    selected: presenting ? null : (steps[owner]?.id ?? null)
  })
}

interface PreviewWant {
  pane: number
  docId: string
  /** Kadr, maska i uwagi osobno, bo tylko ruch kamery i zmiana maski potrzebują przelotu. */
  shot: string
  rest: StepRest
  state: Omit<PresentState, 'pending'>
}

/** Arkusz i krok, które pokazuje teraz podgląd. */
let aimed: PreviewWant | null = null
/** Kształty, które podgląd już pokazał. Kształt spoza tej listy rysuje się piórem po ruchu kamery. */
let drawn = new Set<string>()
/** Uwagi i kształty dokumentu znane podglądowi. Nowa uwaga to taka, której tu nie ma. */
let seen: { docId: string; ids: Set<string> } | null = null
let settling = false
let again = false

const shapeIds = (docId: string): string[] => drawings.shapes.filter((shape) => shape.docId === docId).map(({ id }) => id)
const noteIds = (docId: string): string[] => [
  ...data.annotations.filter((note) => note.docId === docId).map(({ id }) => id),
  ...shapeIds(docId)
]

/**
 * Krok, który podgląd powinien teraz pokazywać. Wskazywanie kadru potrzebuje całej strony bez
 * maski, a prezentacja ustawia dokument sama.
 */
function previewWant(): PreviewWant | null {
  if (!(route.preview || route.peek) || ui.presenting || route.picking || !ui.insp || ui.inspView !== 'route') return null
  const docId = focusedId()
  if (!docId) return null
  const pane = openPane(docId)
  const steps = stepsOf(docId)
  const index = selectedIndex(docId)
  if (pane < 0 || index < 0) return null
  const missing = route.missing.get(docId)
  const state = stepState(steps, index, false, missing)
  return { pane, docId, shot: JSON.stringify(shotAt(steps, index, missing)), rest: state.rest, state }
}

const sameWant = (a: PreviewWant | null, b: PreviewWant | null): boolean =>
  a !== null && b !== null && a.pane === b.pane && a.docId === b.docId && a.shot === b.shot && JSON.stringify(a.state) === JSON.stringify(b.state)

function sendLook(docId: string, state: Omit<PresentState, 'pending'> | null, pending: string[] = []): void {
  // Prezentacja tego dokumentu sama mówi mu, co pokazać.
  if (ui.presenting === docId) return
  window.api.setPresent(docId, state ? { ...state, pending, edit: true } : null)
}

/**
 * Ruch kamery ze zmianą w dokumencie. Zmiana przychodzi także wtedy, gdy kamera nie ruszyła.
 * `travel` to stan na czas przejazdu do dalekiego kadru.
 */
async function aimWith(pane: number, shot: string, change: () => void, travel?: () => void): Promise<void> {
  let done = false
  const run = (): void => {
    if (done) return
    done = true
    change()
  }
  await aimCamera(pane, JSON.parse(shot), travel ? { before: run, travel } : { before: run })
  run()
}

const WHOLE_PAGE = 'null'

/** Kamera i maska kroku. Bez kadru kamera pokazuje całą stronę, a maska nie ma wokół czego leżeć. */
const cameraLook = (want: PreviewWant | null): string =>
  want === null || want.shot === WHOLE_PAGE ? WHOLE_PAGE : `${want.shot} ${want.rest}`

async function previewStep(): Promise<void> {
  const want = previewWant()
  if (aimed && (!want || aimed.pane !== want.pane || aimed.docId !== want.docId)) {
    // Maska schodzi razem z oddaleniem kamery, a dokument wraca do wszystkich uwag.
    const old = aimed
    aimed = null
    drawn = new Set()
    seen = null
    // Prezentacja sama jedzie do pierwszego kroku, więc kamera nie musi najpierw wracać do całej strony.
    // Bez kadru kamera już pokazuje całą stronę, więc uwagi wracają od razu, bez zamrażania dokumentu.
    if (cameraLook(old) === WHOLE_PAGE) sendLook(old.docId, null)
    else if (ui.presenting !== old.docId) await aimWith(old.pane, WHOLE_PAGE, () => sendLook(old.docId, null))
  }
  if (!want || sameWant(aimed, want)) return
  if (seen?.docId !== want.docId) seen = { docId: want.docId, ids: new Set(noteIds(want.docId)) }
  const shapes = new Set(shapeIds(want.docId))
  const pending = want.state.show.filter((id) => shapes.has(id) && !drawn.has(id))
  drawn = new Set(want.state.show.filter((id) => shapes.has(id)))
  const moves = cameraLook(aimed) !== cameraLook(want)
  aimed = want
  if (!moves) {
    // Ta sama kamera i maska: uwagi pojawiają się od razu, a nowy kształt kroku rysuje się piórem.
    sendLook(want.docId, want.state, pending)
    if (pending.length > 0) sendLook(want.docId, want.state)
    return
  }
  await aimWith(
    want.pane,
    want.shot,
    () => sendLook(want.docId, want.state, pending),
    () => sendLook(want.docId, { ...want.state, rest: 'normal' }, pending)
  )
  if (pending.length > 0 && sameWant(aimed, want)) sendLook(want.docId, want.state)
}

/** Podgląd idzie za stanem formularza. Szybkie zmiany nie tworzą kolejki ruchów kamery. */
async function settlePreview(): Promise<void> {
  if (settling) {
    again = true
    return
  }
  settling = true
  try {
    do {
      again = false
      await previewStep()
    } while (again)
  } finally {
    settling = false
  }
}

/**
 * Lista uwag przyszła od nowa. Uwaga albo kształt, który powstał przy otwartym podglądzie, trafia
 * do wybranego kroku i zostaje na ekranie bez ponownego rysowania.
 */
export function routeNotesChanged(): void {
  const docId = seen?.docId
  if (!seen || !docId || aimed?.docId !== docId || route.picking) return
  const fresh = noteIds(docId).filter((id) => !(seen as { ids: Set<string> }).ids.has(id))
  if (fresh.length === 0) return
  for (const id of fresh) seen.ids.add(id)
  const step = selectedStep(docId)
  if (!step) return
  const shapes = new Set(shapeIds(docId))
  for (const id of fresh) if (shapes.has(id)) drawn.add(id)
  update(docId, step.id, { show: [...new Set([...step.show, ...fresh])] })
}

/** Formularz zniknął z ekranu: dokument chowa kadry i maskę, a kamera wraca do całej strony. */
export function leaveRoute(): void {
  flushRoute(framed)
  endPick()
  syncFrames()
}
