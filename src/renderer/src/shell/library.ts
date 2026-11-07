import type { DocStatus, LibrarySnapshot, ScanProgress } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { centerDock, els, navT, setNav, syncChrome, syncSel } from './layout'
import { dropStaleViews } from './native'
import { keepFiles } from './files'
import { dropMissing } from './sheets'
import { countDocs, data, libraryDocs, notify, readLastDocs, ui } from './state'

const FRESH_MS = 1400

let shown = ''
let restored = false
let freshTimer = 0

/** Układ z poprzedniego uruchomienia czeka pod `H`, ale start zawsze pokazuje ścianę. */
function restoreLast(): void {
  if (restored || data.entries.size === 0) return
  restored = true
  const docs = readLastDocs()
    .filter((id) => data.entries.has(id))
    .slice(0, ui.panes.length)
  if (docs.length === 0) return
  ui.last = { order: docs.map((_, i) => i), docs, focus: 0 }
}

/** Świeżo zawieszone kartki wjeżdżają po kolei. Później nowe dokumenty po prostu się pojawiają. */
function freshWall(ms: number): void {
  const { home } = els
  home.classList.add('fresh')
  clearTimeout(freshTimer)
  freshTimer = window.setTimeout(() => home.classList.remove('fresh'), ms)
}

/** Szkielet, który zdążył się pokazać, stoi już tam, gdzie zawisną kartki, więc nie wieszają się drugi raz. */
function skeletonShown(): boolean {
  const wall = els.home.querySelector('.sk-wall')
  return wall !== null && getComputedStyle(wall).opacity !== '0'
}

/** Migawka przychodzi jako tekst, bo pod wpływem skanu zmienia się wiele razy na sekundę. */
export function setLibrary(json: string): void {
  if (json === shown) return
  const wasFirst = shown === ''
  shown = json
  const snapshot = JSON.parse(json) as LibrarySnapshot
  const wasSetup = ui.setup
  const addedRoot = snapshot.roots.length > (data.library?.roots.length ?? snapshot.roots.length)
  data.library = snapshot
  const docs = [...snapshot.projects.flatMap((project) => project.docs), ...snapshot.review]
  data.entries = new Map(docs.map((doc) => [doc.id, doc]))
  keepFiles()
  ui.setup = snapshot.roots.length === 0 ? 'first' : libraryDocs().length === 0 ? 'empty' : null
  ui.streaming ||= addedRoot || (wasSetup !== null && ui.setup === null)
  restoreLast()
  dropMissing()
  dropStaleViews()
  syncChrome()
  if (ui.streaming || (wasFirst && !ui.setup && !skeletonShown())) freshWall(FRESH_MS)
  notify()
  syncSel(true)
  if (wasFirst && !ui.setup) setNav(true, navT.x + 30)
  else if (wasFirst) centerDock()
  else if (wasSetup && !ui.setup) setNav(true)
  else if (!wasSetup && ui.setup && ui.nav) setNav(false)
}

export function setScanProgress(progress: ScanProgress): void {
  const changed = progress.active !== data.scan.active
  data.scan = progress
  if (!progress.active) ui.streaming = false
  // Liczby widać tylko na pustej ścianie, a reszta powłoki nie musi rysować się przy każdej z nich.
  if (changed || ui.setup) notify()
}

/** Skutki poleceń wracają jako nowa migawka, więc nie ma tu na co czekać. */
export function load(request: () => Promise<unknown>, done?: () => void): void {
  request()
    .catch(() => {})
    .finally(() => {
      done?.()
      notify()
    })
}

export const rescan = (): void => load(window.api.rescan)
export const setDocStatus = (docId: string, status: DocStatus): void => load(() => window.api.setStatus(docId, status))
export const classifyDoc = (docId: string, classification: 'document' | 'ignored'): void =>
  load(() => window.api.setClassification(docId, classification))

/** Foldery upuszczone na ścianę przy pierwszym uruchomieniu. */
export function dropFolders(files: FileList): void {
  const paths = [...files].map((file) => window.api.pathForFile(file)).filter(Boolean)
  if (paths.length > 0) load(() => window.api.addPaths(paths))
}

export const scanLabel = (n: number): string => (n === 0 ? t('Szukam dokumentów') : t('Szukam, {docs}', { docs: countDocs(n) }))
