import { t } from '../../../shared/i18n'
import {
  MAX_STEPS,
  moveStep,
  nextStep,
  type PickKind,
  type Presentation,
  type PresentationStep,
  shotAt,
  shotOwner,
  type StepCamera,
  type StepRest
} from '../../../shared/presentation'
import { aimCamera } from './camera'
import { setTool } from './notes'
import { focusedId, notify, ui } from './state'

/*
 * Trasa prezentacji w powłoce. Formularz zmienia trasę od razu na ekranie, a zapis idzie za nim:
 * tytuł po krótkiej przerwie w pisaniu, reszta od razu. Trasę może też zapisać agent, więc zmiana
 * na dysku wraca do formularza, o ile użytkownik nie ma właśnie niezapisanej zmiany.
 *
 * Przy otwartym formularzu dokument pokazuje przerywaną ramką kadr wybranego kroku, a podgląd
 * ustawia na nim kamerę, tak jak zrobi to prezentacja.
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
  preview: false,
  /** Ostatnio usunięty krok, do cofnięcia przyciskiem w formularzu. */
  removed: null as { docId: string; step: PresentationStep; index: number } | null
}

/** Ostatnia trasa znana z dysku, żeby własny zapis nie wracał do formularza jako cudza zmiana. */
const saved = new Map<string, string>()
const timers = new Map<string, number>()
const inFlight = new Map<string, number>()
/** Dokument, który pokazuje teraz kadry. */
let framed: string | null = null
/** Arkusz i kadr, na które patrzy kamera podglądu. */
let aimed: { pane: number; key: string } | null = null

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
  syncFrames()
  notify()
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
  }
  framed = docId
  syncPreview(presenting ? null : docId)
  if (!docId) return
  const steps = stepsOf(docId)
  const owner = shotOwner(steps, selectedIndex(docId))
  window.api.setRouteFrames(docId, {
    frames: steps.map((step, i) => ({ id: step.id, camera: step.camera, label: stepLabel(step, i) })),
    selected: presenting ? null : (steps[owner]?.id ?? null)
  })
}

/** Podgląd ustawia kamerę na kadrze wybranego kroku, a wyłączenie podglądu wraca do całej strony. */
function syncPreview(docId: string | null): void {
  const on = route.preview && docId !== null
  const shot = on ? shotAt(stepsOf(docId), selectedIndex(docId)) : null
  const key = JSON.stringify(shot)
  if (on && aimed?.pane === ui.focus && aimed.key === key) return
  // Podgląd mógł patrzeć na inny arkusz, a ten musi wrócić do całej strony.
  if (aimed && (!on || aimed.pane !== ui.focus)) void aimCamera(aimed.pane, null)
  aimed = on ? { pane: ui.focus, key } : null
  if (on) void aimCamera(ui.focus, shot)
}

/** Formularz zniknął z ekranu: dokument chowa kadry, a kamera wraca do całej strony. */
export function leaveRoute(): void {
  flushRoute(framed)
  endPick()
  route.preview = false
  syncFrames()
}
