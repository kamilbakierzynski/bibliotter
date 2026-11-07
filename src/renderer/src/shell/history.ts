import { openDoc } from './sheets'
import { data, focusedId, notify, ui } from './state'

/*
 * Historia dokumentów jak w przeglądarce, wspólna dla wszystkich arkuszy. Krok to dokument, który
 * dostał fokus. Cofnięcie otwiera poprzedni w bieżącym arkuszu albo przenosi fokus na arkusz,
 * w którym ten dokument już stoi. Nowy dokument po cofnięciu ucina kroki do przodu.
 */

const LIMIT = 80

let trail: string[] = []
let at = -1

export type Step = -1 | 1

/** Woła ją `syncFocus`. Zerknięcie i ekran startowy nie są krokami, a ten sam dokument drugi raz też nie. */
export function recordVisit(): void {
  if (ui.home || (ui.peek !== null && ui.peek === ui.focus)) return
  const id = focusedId()
  if (!id || trail[at] === id) return
  trail = [...trail.slice(0, at + 1), id].slice(-LIMIT)
  at = trail.length - 1
}

/** Na ekranie startowym wstecz wraca do ostatniego dokumentu, a nie do przedostatniego. */
function targetOf(step: Step): number {
  const start = ui.home && step < 0 ? at : at + step
  for (let i = start; i >= 0 && i < trail.length; i += step) {
    const id = trail[i]
    if (id && data.entries.has(id) && (ui.home || id !== focusedId())) return i
  }
  return -1
}

export function historyTarget(step: Step): string | null {
  const i = targetOf(step)
  return i >= 0 ? (trail[i] ?? null) : null
}

export function walkHistory(step: Step): boolean {
  if (ui.setup || ui.presenting) return false
  const i = targetOf(step)
  const id = trail[i]
  if (i < 0 || !id) return false
  at = i
  openDoc(id)
  notify()
  return true
}
