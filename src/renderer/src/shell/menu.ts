import type { MouseEvent } from 'react'
import type { DocEntry, ProjectGroup } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { displayName, type FolderNode, lastSegment, projectFolders } from '../tree'
import { hideFly, hideTip, type KeyLike } from './keys'
import { els, menuPill } from './layout'
import { load } from './library'
import { cover, focusLive, uncover } from './native'
import { hideFolders } from './panel'
import { inPocket, togglePocket } from './pocket'
import { openDoc, peekDoc } from './sheets'
import { data, notify, ticketHref } from './state'

/*
 * Menu wiersza w panelu. Stoi pod kursorem, więc zwykle nachodzi na arkusz i jak status czy podgląd
 * z szyny rysuje się w powłoce nad zrzutem. Zmiana nazwy działa tylko w apce: plik na dysku zostaje
 * taki, jaki zapisał go agent, a pusta nazwa wraca do oryginalnej.
 */

export type MenuTarget =
  | { kind: 'doc'; doc: DocEntry }
  | { kind: 'folder'; node: FolderNode }
  | { kind: 'project'; project: ProjectGroup }

export interface MenuItem {
  title: string
  icon: string
  run: () => void
  /** Potwierdzenie w wierszu. Menu zostaje wtedy chwilę otwarte. */
  done?: string
  /** Kreska nad wierszem. */
  gap?: boolean
}

interface RenameTarget {
  key: string
  /** Nazwa nadana wcześniej, pusta przy oryginalnej. */
  alias: string
  original: string
  save: (name: string) => Promise<void>
}

/** Tyle widać potwierdzenie, zanim menu zniknie. */
const DONE_MS = 520
/** Odstęp menu od krawędzi okna. */
const EDGE = 8

export const menu = {
  on: false,
  x: 0,
  y: 0,
  items: [] as MenuItem[],
  idx: -1,
  done: null as MenuItem | null
}

export const rename = {
  current: null as (RenameTarget & { saving: boolean }) | null
}

let anchor: HTMLElement | null = null
let doneTimer = 0

/** Układa grupy akcji i rozdziela je kreską. Pusta grupa nie zostawia po sobie śladu. */
const grouped = (...lists: MenuItem[][]): MenuItem[] =>
  lists
    .filter((list) => list.length > 0)
    .flatMap((list, i) => list.map((item, at) => ({ ...item, gap: i > 0 && at === 0 })))

function startRename(target: RenameTarget): void {
  rename.current = { ...target, saving: false }
  notify()
}

function renameItems(target: RenameTarget): MenuItem[] {
  const restore = { icon: 'undo', title: t('Przywróć nazwę'), run: () => load(() => target.save('')) }
  return [{ icon: 'pencil', title: t('Zmień nazwę'), run: () => startRename(target) }, ...(target.alias ? [restore] : [])]
}

const copyItem = (title: string, text: string): MenuItem => ({
  icon: 'copy',
  title,
  done: t('Skopiowano'),
  run: () => window.api.copyText(text)
})

const revealItem = (path: string): MenuItem => ({
  icon: 'reveal',
  title: t('Pokaż w Eksploratorze'),
  run: () => void window.api.revealFolder(path)
})

/** Wybrany folder obejmuje często wiele repozytoriów, więc ukrycie go opróżniłoby bibliotekę. */
function hideItems(key: string, title: string, paths: string[]): MenuItem[] {
  const roots = data.library?.roots ?? []
  if (paths.length === 0 || paths.some((path) => roots.includes(path))) return []
  return [{ icon: 'hide', title, run: () => hideFolders(key, paths) }]
}

function docItems(doc: DocEntry): MenuItem[] {
  const reveal = { icon: 'reveal', title: t('Pokaż w Eksploratorze'), run: () => void window.api.revealDoc(doc.id) }
  const tickets = doc.labels.flatMap((name) => {
    const href = ticketHref(name)
    return href ? [{ icon: 'reveal', title: t('Otwórz {code} w Jira', { code: name }), run: () => void window.api.openExternal(href) }] : []
  })
  return grouped(
    [
      { icon: 'file', title: t('Otwórz'), run: () => openDoc(doc.id) },
      { icon: 'split', title: t('Zerknij'), run: () => peekDoc(doc.id) },
      { icon: 'pocket', title: inPocket(doc.id) ? t('Wyjmij z kieszeni') : t('Włóż do kieszeni'), run: () => togglePocket(doc.id) }
    ],
    // Niepewny plik nie ma jeszcze trwałych danych, w których nazwa mogłaby zostać.
    doc.classification === 'document'
      ? renameItems({
          key: doc.id,
          alias: doc.alias ?? '',
          original: displayName({ ...doc, alias: null }),
          save: (name) => window.api.renameDoc(doc.id, name)
        })
      : [],
    tickets,
    [...(doc.missing ? [] : [reveal]), copyItem(t('Kopiuj ścieżkę'), doc.path)]
  )
}

function branchItems(node: FolderNode): MenuItem[] {
  const pullRequest = node.branch?.pullRequest
  const open = pullRequest && { icon: 'reveal', title: t('Otwórz pull request'), run: () => void window.api.openExternal(pullRequest.url) }
  return [copyItem(t('Kopiuj nazwę gałęzi'), node.name), ...(open ? [open] : [])]
}

function folderItems(node: FolderNode): MenuItem[] {
  if (node.branch) return branchItems(node)
  const [path] = node.paths
  if (!path) return []
  return grouped(
    renameItems({
      key: node.key,
      alias: node.renamed ? node.name : '',
      original: node.renamed ? lastSegment(path) : node.name,
      save: (name) => window.api.renameFolder(node.paths, name)
    }),
    [revealItem(path), copyItem(t('Kopiuj ścieżkę'), path)],
    hideItems(node.key, t('Ukryj folder'), node.paths)
  )
}

function projectItems(project: ProjectGroup): MenuItem[] {
  const renamed = data.library?.folderNames[project.path] !== undefined
  return grouped(
    renameItems({
      key: project.id,
      alias: renamed ? project.name : '',
      original: renamed ? lastSegment(project.path) : project.name,
      save: (name) => window.api.renameFolder([project.path], name)
    }),
    [revealItem(project.path), copyItem(t('Kopiuj ścieżkę'), project.path)],
    hideItems(project.id, t('Ukryj projekt'), projectFolders(project))
  )
}

function itemsFor(target: MenuTarget): MenuItem[] {
  if (target.kind === 'doc') return docItems(target.doc)
  return target.kind === 'folder' ? folderItems(target.node) : projectItems(target.project)
}

export function closeRowMenu(): void {
  if (!menu.on) return
  clearTimeout(doneTimer)
  menu.on = false
  menu.idx = -1
  menu.done = null
  anchor?.classList.remove('menu-on')
  anchor = null
  menuPill.hide()
  uncover('menu')
  notify()
}

export function openRowMenu(e: MouseEvent<HTMLElement>, target: MenuTarget): void {
  e.preventDefault()
  const items = itemsFor(target)
  closeRowMenu()
  if (items.length === 0) return
  hideFly()
  hideTip()
  anchor = e.currentTarget
  anchor.classList.add('menu-on')
  menu.on = true
  menu.items = items
  menu.x = e.clientX
  menu.y = e.clientY
  // Strzałki mają sterować menu, a nie dokumentem, nawet gdy klawiatura była w arkuszu.
  window.api.focusDoc(null)
  cover('menu')
  notify()
}

/** Menu stoi pod kursorem, a przy krawędzi okna przechodzi na drugą stronę i stamtąd wyrasta. */
export function placeMenu(box: HTMLElement): void {
  const app = els.app.getBoundingClientRect()
  const { offsetWidth: width, offsetHeight: height } = box
  const left = menu.x + width + EDGE > app.right
  const up = menu.y + height + EDGE > app.bottom
  box.style.left = `${(left ? menu.x - width : menu.x) - app.left}px`
  box.style.top = `${Math.max(EDGE, up ? menu.y - height : menu.y) - app.top}px`
  box.style.transformOrigin = `${left ? 100 : 0}% ${up ? 100 : 0}%`
}

export function selectMenuItem(i: number): void {
  menu.idx = i
  const row = document.querySelector<HTMLElement>(`#rowMenu [data-i="${i}"]`)
  if (row) menuPill.to({ x: row.offsetLeft, y: row.offsetTop, w: row.offsetWidth, h: row.offsetHeight })
}

export function clearMenuItem(): void {
  menu.idx = -1
  menuPill.hide()
}

export function pickMenuItem(item: MenuItem): void {
  item.run()
  if (!item.done) {
    closeRowMenu()
    return
  }
  menu.done = item
  notify()
  doneTimer = window.setTimeout(closeRowMenu, DONE_MS)
}

/** Otwarte menu przejmuje klawiaturę, także skróty apki. */
export function menuKey(e: KeyLike): boolean {
  if (!menu.on) return false
  e.preventDefault()
  const count = menu.items.length
  const item = menu.items[menu.idx]
  if (e.key === 'Escape') closeRowMenu()
  else if (e.key === 'ArrowDown') selectMenuItem((menu.idx + 1) % count)
  else if (e.key === 'ArrowUp') selectMenuItem(menu.idx <= 0 ? count - 1 : menu.idx - 1)
  else if (e.key === 'Enter' && item) pickMenuItem(item)
  return true
}

export function cancelRename(): void {
  rename.current = null
  notify()
  focusLive()
}

/** Pole znika dopiero po skanie, żeby wiersz nie mignął starą nazwą. */
export function commitRename(value: string): void {
  const edit = rename.current
  if (!edit || edit.saving) return
  const name = value.trim()
  const alias = name === edit.original ? '' : name
  if (alias === edit.alias) {
    cancelRename()
    return
  }
  edit.saving = true
  load(
    () => edit.save(alias),
    () => {
      rename.current = null
      focusLive()
    }
  )
}
