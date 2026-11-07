import { language } from '../../../shared/i18n'
import { followFor } from '../motion/spring'
import { buildLibrary, flattenLibrary, type LibraryModel, type LibraryRows, type ManualOrder, ROW_H, type SortMode } from '../tree'
import { els, hoverPill, syncSel } from './layout'
import { load } from './library'
import { data, isClosed, memo, notify, saveCollapsed, saveSort, type ShellSort, toneOf, ui, visibleProjects } from './state'

/*
 * Biblioteka to płaska lista wierszy, a na ekranie jest tylko jej wycinek. Wiersze stoją na
 * `transform`, więc zmiana kolejności czy zwinięcie folderu to ten sam ruch: każdy jedzie
 * na swoje nowe miejsce. Zwijane wiersze przez chwilę zostają jako duchy pod rodzicem.
 */

export const FOLD_MS = 620
/** Tyle duch zdąża dojechać pod rodzica i zniknąć. */
export const GHOST_MS = 320

/** Przeciąganie w toku: kolejność na podgląd i folder zwinięty na czas ruchu. Pisze je `arrange.ts`. */
export const arranging = {
  order: null as ManualOrder | null,
  closed: null as string | null
}

const baseSort = (): SortMode => (ui.sort === 'manual' ? ui.sortBase : ui.sort)
const manualOrder = (): ManualOrder | undefined => arranging.order ?? (ui.sort === 'manual' ? ui.manual : undefined)

const model = memo(
  () => [visibleProjects(), data.annotations, baseSort(), manualOrder(), data.library?.folderNames, language()] as const,
  (projects, _notes, sort, order, names): LibraryModel => buildLibrary(projects, { sort, toneOf, names, order })
)

const closedNow = (key: string, byDefault: boolean): boolean => key === arranging.closed || isClosed(key, byDefault)

const flatRows = memo(
  () => [model(), ui.folds] as const,
  (library): LibraryRows => flattenLibrary(library, closedNow, ui.closing, ui.leaving)
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

/** Ręcznie wchodzi do kolejki dopiero, gdy coś ułożono, i dziedziczy sortowanie, z którego przyszło. */
export function toggleSort(): void {
  const arranged = Object.keys(ui.manual).length > 0
  const sort: ShellSort = ui.sort === 'recent' ? 'name' : ui.sort === 'name' && arranged ? 'manual' : 'recent'
  if (sort !== 'manual') ui.sortBase = sort
  ui.sort = sort
  saveSort(sort)
  notify()
  followFor(FOLD_MS, () => syncSel(true))
}

/** Wiersz znika od razu, a skan dużej biblioteki zdejmuje dokumenty z reszty apki chwilę później. */
export function hideFolders(key: string, paths: string[]): void {
  ui.leaving.add(key)
  ui.folds++
  hoverPill.hide()
  load(
    () => window.api.hideFolders(paths),
    () => {
      ui.leaving.delete(key)
      ui.folds++
    }
  )
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
