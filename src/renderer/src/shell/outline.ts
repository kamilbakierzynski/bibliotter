import type { OverlayEvent } from '../../../shared/annotations'
import type { OutlineHeading } from '../../../shared/outline'
import { G } from './layout'
import { setInsp } from './notes'
import { focusedId, notify, readStored, ui, writeStored } from './state'

/*
 * Spis treści i minimapa. Nagłówki zbiera strona dokumentu, bo tylko ona wie, co widać,
 * a powłoka trzyma ostatni spis każdego dokumentu i rysuje go w panelu obok Uwag i Linków.
 * Minimapa rysuje się w samym dokumencie, więc tutaj jest tylko jej przełącznik.
 */

const MINIMAP_KEY = 'minimap'

export interface DocOutline {
  headings: OutlineHeading[]
  /** Rozdział przy linii czytania albo `-1` przed pierwszym nagłówkiem. */
  current: number
}

export const outline = {
  minimap: readStored(MINIMAP_KEY) !== 'off',
  docs: new Map<string, DocOutline>()
}

type OutlineEvent = Extract<OverlayEvent, { type: 'outline' | 'outline-at' }>

export const isOutlineEvent = (event: OverlayEvent): event is OutlineEvent =>
  event.type === 'outline' || event.type === 'outline-at'

const showing = (docId: string): boolean => ui.insp && ui.inspView === 'outline' && focusedId() === docId

export function handleOutlineEvent(docId: string, event: OutlineEvent): void {
  const known = outline.docs.get(docId)
  if (event.type === 'outline') {
    outline.docs.set(docId, { headings: event.headings, current: known?.current ?? -1 })
  } else {
    if (known?.current === event.index) return
    outline.docs.set(docId, { headings: known?.headings ?? [], current: event.index })
  }
  if (showing(docId)) notify()
}

/** Spis mógł przyjść, zanim powłoka zaczęła słuchać, np. po jej przeładowaniu. */
export function requestOutline(docId: string): void {
  window.api.outlineDoc(docId, { type: 'report' })
}

export function jumpToHeading(index: number): void {
  const docId = focusedId()
  if (!docId) return
  const known = outline.docs.get(docId)
  if (known) outline.docs.set(docId, { ...known, current: index })
  window.api.outlineDoc(docId, { type: 'jump', index })
  // W wąskim oknie panel stoi nad arkuszem, więc po wyborze ustępuje, jak szybkie menu.
  if (G.overlay) setInsp(false)
  else notify()
  window.api.focusDoc(docId)
}

export function setMinimap(on: boolean): void {
  outline.minimap = on
  writeStored(MINIMAP_KEY, on ? 'on' : 'off')
  window.api.setMinimap(on)
  notify()
}

export const toggleMinimap = (): void => setMinimap(!outline.minimap)

/** Proces główny nie pamięta wyboru, więc powłoka mówi mu o nim po starcie. */
export const syncMinimap = (): void => window.api.setMinimap(outline.minimap)
