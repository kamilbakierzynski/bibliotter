import { useSyncExternalStore } from 'react'
import { els } from './layout'
import { menu } from './menu'
import { cover, uncover } from './native'
import { ui } from './state'

/*
 * Podgląd wiersza z panelu zamiast systemowej podpowiedzi ze ścieżką. Karta wisi tuż za panelem,
 * na wysokości wiersza, i jedzie za kursorem z wiersza na wiersz. Pierwsza pojawia się po chwili,
 * kolejne od razu, jak podpowiedzi w systemie. Nachodzi na arkusz, więc jak menu wiersza rysuje się
 * w powłoce nad zrzutem dokumentu. Myszy nie łapie, bo to tylko podpowiedź.
 */

export type CardTarget =
  | { kind: 'doc'; id: string }
  | { kind: 'folder'; key: string }
  | { kind: 'project'; key: string }
  /** Trafienie z panelu szukania, jako numer w `searchModel().hits`. */
  | { kind: 'hit'; at: number }

/** Tyle kursor musi postać na wierszu, zanim karta pojawi się pierwszy raz. */
const SHOW_MS = 520
/** Przejście przez szczelinę między wierszami nie może zgasić karty. */
const HIDE_MS = 140
/** Tyle po zgaśnięciu karta wraca od razu, bez czekania. */
const WARM_MS = 700
const GAP = 10

export const card = {
  on: false,
  /** Karta stała już na ekranie, więc jedzie do nowego wiersza, zamiast pojawić się na nim. */
  glide: false,
  target: null as CardTarget | null,
  left: 0,
  /** Górna krawędź wiersza w układzie okna apki. */
  rowTop: 0
}

let version = 0
const listeners = new Set<() => void>()
let current: HTMLElement | null = null
let showTimer = 0
let hideTimer = 0
let warmUntil = 0

function changed(): void {
  version++
  for (const listener of listeners) listener()
}

/** Karta rysuje się sama, bez przerysowania całej powłoki przy każdym wierszu. */
export function useCard(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version
  )
}

function targetOf(row: HTMLElement): CardTarget | null {
  const { doc, folder, project, hit } = row.dataset
  if (hit) return { kind: 'hit', at: Number(hit) }
  if (doc) return { kind: 'doc', id: doc }
  if (folder) return { kind: 'folder', key: folder }
  if (project) return { kind: 'project', key: project }
  return null
}

const sameTarget = (a: CardTarget | null, b: CardTarget): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b)

function show(row: HTMLElement, target: CardTarget): void {
  if (!row.isConnected || menu.on || ui.cmd || !ui.nav) return
  const app = els.app.getBoundingClientRect()
  card.glide = card.on
  card.on = true
  card.target = target
  card.left = els.panel.getBoundingClientRect().right - app.left + GAP
  card.rowTop = row.getBoundingClientRect().top - app.top
  if (target.kind === 'doc') window.api.requestThumbs([target.id])
  cover('card')
  changed()
}

export function hideCard(): void {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  current = null
  if (!card.on) return
  card.on = false
  warmUntil = performance.now() + WARM_MS
  uncover('card')
  changed()
}

/**
 * Kliknięcie, przewinięcie albo menu chowają kartę, a ten sam wiersz nie wywoła jej znowu,
 * dopóki kursor z niego nie zejdzie.
 */
export function dismissCard(): void {
  const row = current
  hideCard()
  warmUntil = 0
  current = row
}

/** Wołane przy każdym ruchu kursora nad panelem, więc bez zmiany wiersza nic nie robi. */
export function hoverRow(row: HTMLElement | null): void {
  if (row === current) return
  current = row
  clearTimeout(showTimer)
  const target = row ? targetOf(row) : null
  if (!row || !target) {
    clearTimeout(hideTimer)
    if (card.on) hideTimer = window.setTimeout(hideCard, HIDE_MS)
    return
  }
  clearTimeout(hideTimer)
  if (card.on && sameTarget(card.target, target)) return
  if (card.on || performance.now() < warmUntil) show(row, target)
  else showTimer = window.setTimeout(() => show(row, target), SHOW_MS)
}
