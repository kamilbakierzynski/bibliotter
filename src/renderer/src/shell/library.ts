import type { DocStatus, LibrarySnapshot } from '../../../shared/types'
import { homeDocs } from './home'
import { centerDock, els, navT, setNav, syncChrome, syncSel } from './layout'
import { dropMissing } from './sheets'
import { countDocs, data, libraryDocs, notify, readLastDocs, ui } from './state'

const FRESH_MS = 2400
const SCAN_GAP_MS = 170
const SCAN_TOTAL_MS = 1800
const SCAN_TAIL_MS = 330

let first = true
let freshTimer = 0
let scanTimers: number[] = []

/** Układ z poprzedniego uruchomienia czeka pod `H`, ale start zawsze pokazuje ścianę. */
function restoreLast(): void {
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

/** Pierwsze skanowanie: kartka znika, a dokumenty wieszają się jeden po drugim. */
function playScan(): void {
  for (const timer of scanTimers) clearTimeout(timer)
  const { home } = els
  const count = homeDocs().length
  const gap = Math.min(SCAN_GAP_MS, SCAN_TOTAL_MS / Math.max(1, count))
  const after = (ms: number, step: () => void): void => {
    scanTimers.push(window.setTimeout(step, ms))
  }
  home.classList.add('scan')
  home.style.setProperty('--gap', `${gap}ms`)
  freshWall(count * gap + FRESH_MS)
  ui.scanned = 0
  for (let i = 1; i <= count; i++) {
    after(i * gap, () => {
      ui.scanned = i
      notify()
    })
  }
  after(SCAN_TAIL_MS + count * gap, () => {
    home.classList.remove('scan')
    home.style.removeProperty('--gap')
    ui.scanned = null
    notify()
    if (!ui.nav) setNav(true)
  })
}

export function setLibrary(snapshot: LibrarySnapshot): void {
  const wasFirst = first
  const wasSetup = ui.setup
  first = false
  data.library = snapshot
  const docs = [...snapshot.projects.flatMap((project) => project.docs), ...snapshot.review]
  data.entries = new Map(docs.map((doc) => [doc.id, doc]))
  ui.setup = snapshot.roots.length === 0 ? 'first' : libraryDocs().length === 0 ? 'empty' : null
  if (wasFirst) restoreLast()
  dropMissing()
  syncChrome()
  if (wasFirst && !ui.setup) freshWall(FRESH_MS)
  notify()
  syncSel(true)
  if (wasFirst && !ui.setup) setNav(true, navT.x + 30)
  else if (wasFirst) centerDock()
  else if (wasSetup && !ui.setup) playScan()
  else if (!wasSetup && ui.setup && ui.nav) setNav(false)
}

export function load(request: () => Promise<LibrarySnapshot>): void {
  data.scanning = true
  notify()
  request()
    .then(setLibrary)
    .finally(() => {
      data.scanning = false
      notify()
    })
    .catch(() => {})
}

export const rescan = (): void => load(window.api.rescan)
export const setDocStatus = (docId: string, status: DocStatus): void =>
  load(() => window.api.setStatus(docId, status))
export const classifyDoc = (docId: string, classification: 'document' | 'ignored'): void =>
  load(() => window.api.setClassification(docId, classification))

/** Foldery upuszczone na ścianę przy pierwszym uruchomieniu. */
export function dropFolders(files: FileList): void {
  const paths = [...files].map((file) => window.api.pathForFile(file)).filter(Boolean)
  if (paths.length > 0) load(() => window.api.addPaths(paths))
}

export const scanLabel = (n: number): string => (n === 0 ? 'Szukam dokumentów' : `Szukam, ${countDocs(n)}`)
