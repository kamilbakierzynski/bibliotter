import type { OverlayEvent } from '../../../shared/annotations'
import { openFind } from './find'
import { addStepAt } from './route'
import { openSearch } from './search'
import { focusPane } from './sheets'
import { ui } from './state'

/*
 * Menu zaznaczonego tekstu stoi w dokumencie, a tutaj trafia to, czego dokument nie zrobi sam:
 * krok trasy i szukanie. Szukanie bierze tekst z zaznaczenia tak samo jak Ctrl F, więc menu
 * zostawia zaznaczenie w dokumencie.
 */

type SelectionMenuEvent = Extract<OverlayEvent, { type: 'add-step' | 'selection-find' }>

export function handleSelectionMenu(docId: string, event: SelectionMenuEvent): void {
  const slot = ui.panes.indexOf(docId)
  if (slot >= 0 && slot !== ui.focus) focusPane(slot)
  if (event.type === 'add-step') void addStepAt(docId, event.camera, event.title)
  else if (event.scope === 'doc') openFind()
  else openSearch()
}
