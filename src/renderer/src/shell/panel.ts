import { followFor } from '../motion/spring'
import { buildLibrary, flattenLibrary, type LibraryModel, type LibraryRows, ROW_H, type SortMode } from '../tree'
import { els, hoverPill, syncSel } from './layout'
import { data, isClosed, memo, notify, saveCollapsed, saveSort, toneOf, ui, visibleProjects } from './state'

/*
 * Biblioteka to płaska lista wierszy, a na ekranie jest tylko jej wycinek. Wiersze stoją na
 * `transform`, więc zmiana kolejności czy zwinięcie folderu to ten sam ruch: każdy jedzie
 * na swoje nowe miejsce. Zwijane wiersze przez chwilę zostają jako duchy pod rodzicem.
 */

const FOLD_MS = 620
/** Tyle duch zdąża dojechać pod rodzica i zniknąć. */
const GHOST_MS = 320

const model = memo(
  () => [visibleProjects(), data.annotations, ui.sort] as const,
  (projects, _notes, sort): LibraryModel => buildLibrary(projects, { sort, toneOf })
)

const flatRows = memo(
  () => [model(), ui.folds] as const,
  (library): LibraryRows => flattenLibrary(library, isClosed, ui.closing)
)

export const libraryRows = (): LibraryRows => flatRows()

function setClosed(key: string, closed: boolean): void {
  if (closed) {
    ui.closed.add(key)
    ui.opened.delete(key)
  } else {
    ui.closed.delete(key)
    ui.opened.add(key)
  }
}

export function toggleFold(key: string): void {
  const closing = !isClosed(key, model().defaults.has(key))
  setClosed(key, closing)
  if (closing) {
    ui.closing.add(key)
    window.setTimeout(() => {
      ui.closing.delete(key)
      ui.folds++
      notify()
    }, GHOST_MS)
  } else {
    ui.closing.delete(key)
    ui.unfolded = key
    requestAnimationFrame(() => {
      ui.unfolded = null
    })
  }
  ui.folds++
  saveCollapsed()
  hoverPill.hide()
  notify()
  followFor(FOLD_MS, () => syncSel(true))
}

export function toggleSort(): void {
  const sort: SortMode = ui.sort === 'recent' ? 'name' : 'recent'
  ui.sort = sort
  saveSort(sort)
  notify()
  followFor(FOLD_MS, () => syncSel(true))
}

/** Otwarty dokument ma swój wiersz na ekranie, nawet gdy leżał w zwiniętym folderze. */
export function revealInTree(docId: string | null): void {
  const library = model()
  const chain = docId ? library.chains.get(docId) : undefined
  if (!chain) return
  const hidden = chain.filter((key) => isClosed(key, library.defaults.has(key)))
  if (hidden.length > 0) {
    for (const key of hidden) setClosed(key, false)
    ui.folds++
    saveCollapsed()
    notify()
  }
  if (ui.view !== 'library') return
  requestAnimationFrame(() => {
    const row = libraryRows().rows.find((item) => item.type === 'doc' && item.doc.id === docId)
    const list = els.scroll.querySelector('.vl')
    if (!row || !list) return
    const { scroll } = els
    const y = list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop + row.y
    if (y >= scroll.scrollTop && y + ROW_H <= scroll.scrollTop + scroll.clientHeight) return
    scroll.scrollTo({ top: y - scroll.clientHeight / 2, behavior: 'smooth' })
  })
}
