import type { MouseEvent } from 'react'
import type { DocEntry, DocStatus, ProjectGroup } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { displayName, type FolderNode, lastSegment, projectFolders } from '../tree'
import { hideFly, hideTip, type KeyLike } from './keys'
import { els, menuPill } from './layout'
import { setLabelFilter } from './labelFilter'
import { autoLabelDoc } from './labels'
import { load } from './library'
import { cover, focusLive, uncover } from './native'
import { hideFolders } from './panel'
import { inPocket, togglePocket } from './pocket'
import { openDoc, peekDoc } from './sheets'
import { colorAttr, countDocs, data, notify, ticketHref, ui } from './state'

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
  /** Menu zostaje otwarte, bo wybór tylko zmienia jego treść. */
  keep?: boolean
  /** Pole wyboru: zaznaczone dostaje znacznik na końcu wiersza. */
  on?: boolean
  /** Kolor etykiety dla ikony. */
  color?: string
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

/** Wszystkie dokumenty pod węzłem, także w zwiniętych podfolderach. */
const docsUnder = (node: FolderNode): DocEntry[] =>
  node.children.flatMap((child) => (child.kind === 'doc' ? [child.doc] : docsUnder(child)))

/**
 * Archiwum z pierwszego skanu łapie też ważne pliki, więc każdy da się z niego wyjąć. Folder w drzewie
 * trzyma same bieżące albo same zarchiwizowane dokumenty, więc zwykle widać jedną z dwóch akcji.
 * Wyjęty dokument nie wraca do skrzynki, bo użytkownik właśnie go wskazał.
 */
function archiveItems(docs: DocEntry[]): MenuItem[] {
  const known = docs.filter((doc) => doc.classification === 'document')
  const archived = known.filter((doc) => doc.status === 'archived').map((doc) => doc.id)
  const active = known.filter((doc) => doc.status !== 'archived').map((doc) => doc.id)
  const move = (ids: string[], status: DocStatus): void => load(() => window.api.setStatuses(ids, status))
  return [
    ...(active.length > 0 ? [{ icon: 'archive', title: t('Przenieś do archiwum'), run: () => move(active, 'archived') }] : []),
    ...(archived.length > 0 ? [{ icon: 'unarchive', title: t('Odarchiwizuj'), run: () => move(archived, 'read') }] : [])
  ]
}

/** Wybrany folder obejmuje często wiele repozytoriów, więc ukrycie go opróżniłoby bibliotekę. */
function hideItems(key: string, title: string, paths: string[]): MenuItem[] {
  const roots = data.library?.roots ?? []
  if (paths.length === 0 || paths.some((path) => roots.includes(path))) return []
  return [{ icon: 'hide', title, run: () => hideFolders(key, paths) }]
}

/** Do przeczytania to też dokumenty, które dopiero czekają w skrzynce. Do decyzji zostają, bo przeczytanie decyzji nie podejmuje. */
function readItems(docs: DocEntry[], single: boolean): MenuItem[] {
  const unread = docs.filter((doc) => doc.classification === 'document' && doc.status === 'to-read').map((doc) => doc.id)
  if (unread.length > 0) {
    const title = single ? t('Oznacz jako przeczytane') : t('Oznacz {docs} jako przeczytane', { docs: countDocs(unread.length) })
    return [{ icon: 'check', title, run: () => load(() => window.api.setStatuses(unread, 'read')) }]
  }
  const [doc] = docs
  if (!single || !doc || doc.classification !== 'document' || doc.status !== 'read') return []
  return [{ icon: 'undo', title: t('Oznacz jako nieprzeczytane'), run: () => load(() => window.api.setStatuses([doc.id], 'to-read')) }]
}

/** Haiku czyta tylko dokumenty z dysku. W folderze bierze te bez etykiet, jak przycisk w Opcjach. */
function autoLabelItems(docs: DocEntry[], single: boolean): MenuItem[] {
  const ready = docs.filter((doc) => doc.classification === 'document' && !doc.missing && !doc.file)
  const [doc] = ready
  if (single) {
    if (!doc) return []
    const busy = ui.autoLabel.pending.includes(doc.id)
    return [{ icon: 'tag', title: busy ? t('Czytam') : t('Etykietuj automatycznie (AI)'), run: () => void (busy || autoLabelDoc(doc)) }]
  }
  const todo = ready.filter((item) => item.status !== 'archived' && item.labels.length === 0).map((item) => item.id)
  if (todo.length === 0) return []
  return [{ icon: 'tag', title: t('Etykietuj {docs} automatycznie (AI)', { docs: countDocs(todo.length) }), run: () => void window.api.autoLabel(todo) }]
}

/** Druga strona menu: etykiety dokumentu do zaznaczenia i Zastosuj. */
function filterPicker(names: string[], chosen: string[]): MenuItem[] {
  const show = (next: string[]): void => {
    menu.items = filterPicker(names, next)
    notify()
  }
  const rows = names.map((name): MenuItem => {
    const on = chosen.includes(name)
    return { icon: 'tag', title: name, color: colorAttr(name), on, keep: true, run: () => show(on ? chosen.filter((item) => item !== name) : [...chosen, name]) }
  })
  const apply: MenuItem = chosen.length > 0
    ? { icon: 'check', title: t('Zastosuj'), gap: true, run: () => setLabelFilter(chosen) }
    : { icon: 'x', title: t('Wybierz etykiety'), gap: true, keep: true, run: () => undefined }
  return [...rows, apply]
}

function filterItems(doc: DocEntry): MenuItem[] {
  const names = doc.labels
  const [only] = names
  if (!only) return []
  if (names.length === 1) {
    return [{ icon: 'tag', title: t('Filtruj „{name}”', { name: only }), color: colorAttr(only), run: () => setLabelFilter([only]) }]
  }
  const open = (): void => {
    menu.items = filterPicker(names, [...names])
    clearMenuItem()
    notify()
  }
  return [{ icon: 'tag', title: t('Filtruj po etykietach…'), keep: true, run: open }]
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
    [...readItems([doc], true), ...autoLabelItems([doc], true)],
    [...filterItems(doc), ...tickets],
    [...(doc.missing ? [] : [reveal]), copyItem(t('Kopiuj ścieżkę'), doc.path)],
    archiveItems([doc])
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
    [...readItems(docsUnder(node), false), ...autoLabelItems(docsUnder(node), false)],
    [revealItem(path), copyItem(t('Kopiuj ścieżkę'), path)],
    [...archiveItems(docsUnder(node)), ...hideItems(node.key, t('Ukryj folder'), node.paths)]
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
    [...readItems(project.docs, false), ...autoLabelItems(project.docs, false)],
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
  if (item.keep) return
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
