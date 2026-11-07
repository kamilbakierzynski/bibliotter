import type { PointerEvent as ReactPointerEvent } from 'react'
import { followFor } from '../motion/spring'
import { type LibraryRow, type ManualOrder, PROJECTS_KEY, ROW_H } from '../tree'
import { dismissCard } from './hoverCard'
import { els, hoverPill, syncSel } from './layout'
import { closeRowMenu, rename } from './menu'
import { arranging, FOLD_MS, GHOST_MS, libraryRows } from './panel'
import { notify, saveManual, saveSort, ui } from './state'

/*
 * Ręczna kolejność w bibliotece. Wiersz chwyta się i przesuwa wśród rodzeństwa, a reszta rozstępuje
 * się na swoich sprężynach, bo podgląd to zwykła zmiana kolejności w modelu. Przenosić między
 * folderami nie można: apka niczego nie zmienia na dysku. Branche, foldery i dokumenty zostają
 * w swoich grupach, a archiwum zawsze stoi na końcu projektu.
 *
 * Pierwsze ułożenie w innym trybie przełącza na Ręcznie, a sortowanie, z którego przyszło, rządzi
 * dalej tym, czego nikt nie ruszał. Dlatego poza przeciąganym rodzicem nic nie zmienia miejsca.
 */

/** Tyle trzeba przesunąć kursor, żeby kliknięcie stało się chwytem. */
const START_PX = 5
/** Pas przy krawędzi panelu, w którym lista sama się przewija. */
const EDGE_PX = 44
const SCROLL_PX = 16
/** Kliknięcie po upuszczeniu nie może otworzyć dokumentu ani zwinąć folderu. */
const SWALLOW_MS = 80
const ARCHIVE = 3

interface Block {
  key: string
  top: number
  height: number
}

interface Drag {
  key: string
  parent: string
  group: number
  pointerId: number
  startY: number
  clientY: number
  started: boolean
  /** Odległość kursora od górnej krawędzi wiersza. */
  grab: number
  /** Pozostałe rodzeństwo w układzie bez przeciąganego wiersza. */
  others: Block[]
  /** Od-do, w którym wiersz może się poruszać: obszar rodzeństwa tej samej grupy. */
  low: number
  high: number
  from: number
  index: number
  /** Folder rozwinięty przed chwytem wraca do siebie po upuszczeniu. */
  reopen: boolean
  frame: number
}

let drag: Drag | null = null
let swallowUntil = 0

/** Klucz wiersza, który właśnie jedzie za kursorem. */
export const liftedKey = (): string | null => (drag?.started ? drag.key : null)
export const isArranging = (): boolean => drag?.started === true

const parentOf = (row: LibraryRow): string => (row.type === 'project' ? PROJECTS_KEY : (row.chain.at(-1) ?? ''))

function groupOf(row: LibraryRow): number {
  if (row.type === 'project') return 0
  if (row.type === 'doc') return 2
  return row.node.archive ? ARCHIVE : row.node.branch ? 0 : 1
}

const listEl = (): HTMLElement | null => els.scroll.querySelector<HTMLElement>('.vl')
const slotEl = (key: string): HTMLElement | null => els.scroll.querySelector<HTMLElement>(`.vr[data-key="${CSS.escape(key)}"]`)

function siblingsOf(rows: LibraryRow[], parent: string, group: number): LibraryRow[] {
  return rows.filter((row) => !row.ghost && parentOf(row) === parent && groupOf(row) === group)
}

/** Wiersz z całym widocznym poddrzewem. Przeciągany folder jest zwinięty, więc ma jeden wiersz. */
function blocksOf(rows: LibraryRow[], siblings: LibraryRow[]): Block[] {
  const at = new Map(rows.map((row, i) => [row, i]))
  return siblings.map((row) => {
    let end = (at.get(row) as number) + 1
    while (end < rows.length && (rows[end] as LibraryRow).chain.includes(row.key)) end++
    const below = rows.slice((at.get(row) as number) + 1, end).filter((item) => !item.ghost).length
    return { key: row.key, top: row.y, height: (below + 1) * ROW_H }
  })
}

/** Podgląd: zapisana kolejność rodzica z rodzeństwem grupy w nowym porządku. Inne grupy go nie czują. */
function previewOrder(d: Drag): ManualOrder {
  const keys = d.others.map((block) => block.key)
  keys.splice(d.index, 0, d.key)
  const base = ui.sort === 'manual' ? ui.manual : {}
  const moved = new Set(keys)
  return { ...base, [d.parent]: [...keys, ...(base[d.parent] ?? []).filter((key) => !moved.has(key))] }
}

function place(d: Drag): void {
  const list = listEl()
  if (!list) return
  const y = Math.min(Math.max(d.clientY - list.getBoundingClientRect().top - d.grab, d.low), d.high)
  slotEl(d.key)?.style.setProperty('--dy', `${y}px`)
  const center = y + ROW_H / 2
  let index = 0
  for (const block of d.others) {
    if (center > block.top + block.height / 2) index++
    else break
  }
  if (index === d.index) return
  d.index = index
  arranging.order = previewOrder(d)
  notify()
  followFor(FOLD_MS, () => syncSel(true))
}

/** Przy krawędzi panelu lista przewija się sama, szybciej im bliżej brzegu. */
function frame(): void {
  const d = drag
  if (!d?.started) return
  const box = els.scroll.getBoundingClientRect()
  const top = box.top + EDGE_PX - d.clientY
  const bottom = d.clientY - (box.bottom - EDGE_PX)
  const step = top > 0 ? -Math.min(top, EDGE_PX) : bottom > 0 ? Math.min(bottom, EDGE_PX) : 0
  if (step !== 0) els.scroll.scrollTop += Math.round((step / EDGE_PX) * SCROLL_PX)
  place(d)
  d.frame = requestAnimationFrame(frame)
}

function start(d: Drag): void {
  const before = libraryRows().rows.find((row) => row.key === d.key)
  if (!before) return
  closeRowMenu()
  dismissCard()
  hoverPill.hide()
  // Rozwinięty folder jedzie zwinięty, bo inaczej jego dzieci skakałyby za nim po całej liście.
  d.reopen = before.type !== 'doc' && !before.closed
  if (d.reopen) {
    arranging.closed = d.key
    ui.closing.add(d.key)
    window.setTimeout(() => {
      ui.closing.delete(d.key)
      ui.folds++
      notify()
    }, GHOST_MS)
    ui.folds++
  }
  const rows = libraryRows().rows
  const siblings = siblingsOf(rows, d.parent, d.group)
  const blocks = blocksOf(rows, siblings)
  const from = blocks.findIndex((block) => block.key === d.key)
  const list = listEl()
  const self = blocks[from]
  if (from < 0 || !list || !self) return
  d.from = from
  d.index = from
  d.others = blocks.filter((_, i) => i !== from).map((block, i) => (i >= from ? { ...block, top: block.top - ROW_H } : block))
  const first = blocks[0] as Block
  const last = blocks.at(-1) as Block
  d.low = first.top
  d.high = last.top + last.height - ROW_H
  d.grab = d.clientY - list.getBoundingClientRect().top - self.top
  d.started = true
  els.scroll.setPointerCapture(d.pointerId)
  document.documentElement.classList.add('arranging')
  notify()
  d.frame = requestAnimationFrame(frame)
}

function commit(d: Drag): void {
  // Wiersze stoją już w nowym porządku podglądu, więc wystarczy je przepisać, razem z innymi grupami.
  const shown = libraryRows().rows.filter((row) => !row.ghost && parentOf(row) === d.parent && groupOf(row) !== ARCHIVE)
  const keys = shown.map((row) => row.key)
  const seen = new Set(keys)
  ui.manual = { ...ui.manual, [d.parent]: [...keys, ...(ui.manual[d.parent] ?? []).filter((key) => !seen.has(key))] }
  saveManual()
  if (ui.sort !== 'manual') {
    ui.sortBase = ui.sort
    ui.sort = 'manual'
  }
  saveSort(ui.sort)
}

function finish(keep: boolean): void {
  const d = drag
  if (!d) return
  drag = null
  window.removeEventListener('pointermove', move, true)
  window.removeEventListener('pointerup', up, true)
  window.removeEventListener('pointercancel', cancel, true)
  window.removeEventListener('keydown', key, true)
  if (!d.started) return
  cancelAnimationFrame(d.frame)
  if (els.scroll.hasPointerCapture(d.pointerId)) els.scroll.releasePointerCapture(d.pointerId)
  document.documentElement.classList.remove('arranging')
  swallowUntil = performance.now() + SWALLOW_MS
  if (keep && d.index !== d.from) commit(d)
  arranging.order = null
  if (arranging.closed === d.key) {
    arranging.closed = null
    ui.closing.delete(d.key)
    ui.unfolded = d.key
    requestAnimationFrame(() => {
      ui.unfolded = null
    })
  }
  ui.folds++
  notify()
  followFor(FOLD_MS, () => syncSel(true))
}

function move(e: PointerEvent): void {
  const d = drag
  if (!d || e.pointerId !== d.pointerId) return
  d.clientY = e.clientY
  if (!d.started && Math.abs(e.clientY - d.startY) > START_PX) start(d)
  if (d.started) place(d)
}

const up = (e: PointerEvent): void => {
  if (drag && e.pointerId === drag.pointerId) finish(true)
}

const cancel = (): void => finish(false)

function key(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !drag?.started) return
  e.preventDefault()
  e.stopPropagation()
  finish(false)
}

window.addEventListener(
  'click',
  (e) => {
    if (performance.now() > swallowUntil) return
    e.preventDefault()
    e.stopPropagation()
  },
  true
)

/** Naciśnięcie wiersza biblioteki. Chwyt zaczyna się dopiero po kilku pikselach ruchu, więc kliknięcie działa jak dawniej. */
export function pressRow(e: ReactPointerEvent<HTMLElement>): void {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || drag || rename.current) return
  const target = e.target as HTMLElement
  if (target.closest('input, .row-edit')) return
  const rowKey = target.closest<HTMLElement>('.vr[data-key]')?.dataset.key
  const row = rowKey ? libraryRows().rows.find((item) => item.key === rowKey) : undefined
  if (!row || row.ghost || groupOf(row) === ARCHIVE) return
  drag = {
    key: row.key,
    parent: parentOf(row),
    group: groupOf(row),
    pointerId: e.pointerId,
    startY: e.clientY,
    clientY: e.clientY,
    started: false,
    grab: 0,
    others: [],
    low: 0,
    high: 0,
    from: 0,
    index: 0,
    reopen: false,
    frame: 0
  }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', cancel, true)
  window.addEventListener('keydown', key, true)
}
