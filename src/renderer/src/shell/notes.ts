import type { Anchor, Audience, NoteKind, OverlayEvent, OverlayRect, ShapeType, StickyColor } from '../../../shared/annotations'
import { rectIn } from '../motion/pill'
import { clamp, followFor, Spring, wake } from '../motion/spring'
import { inLayer } from './layer'
import { drawings, findShape, revealDrawings, setShapeType } from './drawings'
import { applyLayout, els, G, sheets, toolPill, trayW, viewPill } from './layout'
import { refreshFrame, touch } from './native'
import { endPick } from './route'
import { focusPane } from './sheets'
import { data, findNote, focusedId, notify, openNotes, pinned, type InspView, type Tool, ui } from './state'

/*
 * Uwagi łączą dwa tryby. Przy zamkniętym panelu wątek wyrasta spod pinezki, a otwarcie panelu
 * wiesza wątki na ścianie, na wysokości cytatu. Wątek i szkic rysuje powłoka nad zrzutem,
 * bo tekst pisany w dokumencie trafiałby do jego skryptów.
 */

interface Hang {
  y: Spring
  el: HTMLElement | null
}

const hangs = new Map<string, Hang>()
const HANG_GAP = 8
let tracked: string | null = null

/** Wątki wiszą na wolnej ścianie. Szereg i wąskie okno jej nie mają, więc uwagi stają wtedy na panelu. */
export const canWall = (): boolean => !G.overlay && pinned() < 3
export const onWall = (): boolean => ui.inspView === 'notes' && ui.notesView === 'wall' && canWall()

export function syncPanelMode(): void {
  document.documentElement.dataset.panel = onWall() ? 'wall' : 'list'
  els.insp.classList.toggle('no-wall', !canWall())
}

export function syncViewSeg(instant = false): void {
  const seg = document.getElementById('viewSeg')
  const on = seg?.querySelector(`[data-view-mode="${ui.notesView}"]`)
  if (seg && on) viewPill.to(rectIn(on, seg), instant)
}

/** Karty przejeżdżają między ścianą a listą na tych samych sprężynach. */
function moveThreads(change: () => void): void {
  const threads = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#threads .thread')]
  const before = new Map(threads().map((el) => [el.dataset.thread, el.getBoundingClientRect().top]))
  change()
  syncPanelMode()
  syncViewSeg()
  bindHangs()
  for (const el of threads()) {
    el.style.transform = 'none'
    const hang = hangs.get(el.dataset.thread ?? '')
    const top = before.get(el.dataset.thread)
    if (hang && top !== undefined) hang.y.set(top - el.getBoundingClientRect().top)
  }
  applyLayout()
  hang()
}

export function setNotesView(view: 'wall' | 'list'): void {
  if (ui.notesView === view) return
  moveThreads(() => {
    ui.notesView = view
  })
  notify()
}

export function toggleNotesView(): void {
  showPanel('notes')
  if (canWall()) setNotesView(ui.notesView === 'wall' ? 'list' : 'wall')
}

export function bindHangs(): void {
  const cards = [...document.querySelectorAll<HTMLElement>('#threads .thread')]
  const present = new Set(cards.map((el) => el.dataset.thread ?? ''))
  for (const id of hangs.keys()) if (!present.has(id)) hangs.delete(id)
  cards.forEach((el, i) => {
    const id = el.dataset.thread ?? ''
    let entry = hangs.get(id)
    if (!entry) {
      entry = { y: new Spring(0, 165, 0.76), el }
      hangs.set(id, entry)
    }
    entry.el = el
    entry.y.k = Math.max(60, 165 - 28 * i)
  })
}

export function renderHangs(): void {
  if (!ui.insp) return
  const wall = onWall()
  for (const entry of hangs.values()) {
    if (!entry.el) continue
    entry.el.style.transform = wall || Math.abs(entry.y.x) > 0.05 ? `translateY(${entry.y.x.toFixed(1)}px)` : ''
  }
}

/** Wątek staje przy swoim cytacie, a sąsiedzi rozsuwają się od wybranego w obie strony. */
export function hang(instant = false): void {
  if (!ui.insp) return
  bindHangs()
  if (!onWall()) {
    for (const entry of hangs.values()) entry.y.to(0)
    return
  }
  const docId = focusedId()
  const list = document.getElementById('threads')
  const sheet = sheets[ui.focus]?.box
  if (!docId || !list || !sheet) return
  const positions = data.positions.get(docId)
  const top = list.getBoundingClientRect().top
  const sheetTop = sheet.getBoundingClientRect().top
  const H = list.clientHeight
  const cards = [...list.querySelectorAll<HTMLElement>('.thread')]
    .map((el) => {
      const id = el.dataset.thread ?? ''
      const rect = positions?.get(id)
      return { id, h: el.offsetHeight, want: rect ? rect.y + sheetTop - top - 6 : 0, y: 0 }
    })
    .sort((a, b) => a.want - b.want)
  if (cards.length === 0) return
  const at = Math.max(0, cards.findIndex((card) => card.id === ui.selNote))
  const anchor = cards[at] as (typeof cards)[number]
  anchor.y = anchor.want
  for (let i = at + 1; i < cards.length; i++) {
    const card = cards[i] as (typeof cards)[number]
    const prev = cards[i - 1] as (typeof cards)[number]
    card.y = Math.max(card.want, prev.y + prev.h + HANG_GAP)
  }
  for (let i = at - 1; i >= 0; i--) {
    const card = cards[i] as (typeof cards)[number]
    const next = cards[i + 1] as (typeof cards)[number]
    card.y = Math.min(card.want, next.y - card.h - HANG_GAP)
  }
  for (const card of cards) {
    const y = clamp(card.y, 24 - card.h, H - 24)
    const spring = hangs.get(card.id)?.y
    if (instant) spring?.set(y)
    else spring?.to(y)
  }
}

function syncTracking(): void {
  const next = ui.insp ? focusedId() : null
  if (next === tracked) return
  if (tracked) window.api.trackOverlay(tracked, false)
  tracked = next
  if (next) window.api.trackOverlay(next, true)
}

export function setInsp(open: boolean): void {
  ui.insp = open
  // Lista dodanych w prezentacji żyje do zamknięcia panelu.
  if (!open) ui.added = null
  els.insp.classList.toggle('open', open)
  ui.threadRect = null
  applyLayout()
  syncTracking()
  notify()
  if (open) hang(true)
  else if (ui.selNote) {
    const docId = focusedId()
    if (docId) window.api.focusAnnotation(docId, ui.selNote)
  }
  touch()
}

export function showPanel(view: InspView): void {
  ui.inspView = view
  if (ui.insp) {
    syncPanelMode()
    applyLayout()
    notify()
    touch()
  } else {
    setInsp(true)
  }
}

/** Uwagi i linki dzielą jeden panel. Klawisz drugiego widoku przełącza panel, zamiast go zamykać. */
export function togglePanel(view: InspView): void {
  if (ui.insp && ui.inspView === view) setInsp(false)
  else showPanel(view)
}

export function closeThread(): void {
  if (!ui.selNote) return
  ui.threadRect = null
  setSelNote(null)
}

export function selectNote(id: string): void {
  setSelNote(ui.selNote === id ? null : id)
}

export function setSelNote(id: string | null): void {
  if (ui.selNote === id) return
  const docId = focusedId()
  if (id && ui.insp) showPanel('notes')
  ui.selNote = id
  ui.threadRect = null
  if (docId) window.api.focusAnnotation(docId, id)
  if (ui.insp) followFor(620, () => hang())
  notify()
  touch()
}

/** Czy arkusz musi zostać zrzutem, bo nad nim wisi wątek albo szkic. */
export function sheetHoldsNote(i: number): boolean {
  // W prezentacji pole wpisu stoi nad dokiem, więc dokument zostaje żywy i szkic da się przestawić.
  if (ui.draft?.rect && ui.draft.docId === ui.panes[i] && ui.presenting !== ui.draft.docId) return true
  return i === ui.focus && ui.selNote !== null && !ui.insp && ui.threadRect !== null
}

export function afterFocusChange(): void {
  syncTracking()
  if (ui.insp) {
    hang(true)
    if (document.documentElement.dataset.panel !== (onWall() ? 'wall' : 'list')) moveThreads(() => {})
  }
}

export function syncTools(instant = false): void {
  const box = inLayer('tools')
  const button = box?.querySelector(`.tb[data-tool="${ui.tool}"]`)
  if (box && button) toolPill.to(rectIn(button, box), instant)
}

/** Taca pokazuje tylko to, co ma sens w tej chwili. */
function trayKind(): string {
  if (ui.tool === 'pointer') return ''
  if (ui.tool === 'sticky') return 'sticky'
  if (ui.tool === 'highlight') return 'highlight'
  if (ui.tool === 'shape') return 'shape'
  if (ui.tool === 'comment') return 'comment'
  return ui.sel ? 'sel' : ''
}

export function syncTray(): void {
  const kind = trayKind()
  const { tray, trayIn } = els
  if (kind) trayIn.dataset.tray = kind
  tray.classList.toggle('open', kind !== '')
  trayW.to(kind ? trayIn.offsetWidth : 0)
}

export function setTool(tool: Tool): void {
  if (ui.tool === tool && tool === 'move') return
  ui.tool = tool
  els.app.dataset.tool = tool
  const pointer = tool === 'pointer'
  const marker = tool === 'highlight'
  const shaping = tool === 'shape'
  const docId = focusedId()
  if (docId) window.api.setOverlayMode(docId, tool === 'comment' || tool === 'sticky' ? tool : null)
  window.api.setPointer(pointer)
  window.api.setMarker(marker ? ui.color : null)
  syncShaper()
  if (shaping) revealDrawings(docId)
  if (pointer || marker || shaping) {
    // Oba żyją tylko na żywym dokumencie, a wątek i panel nad arkuszem trzymają go na zrzucie.
    closeThread()
    if (ui.insp && G.overlay) setInsp(false)
  }
  if (tool !== 'move') {
    cancelDraft()
    // Narzędzie zabiera mysz, więc formularz trasy przestaje czekać na wskazanie kadru.
    endPick()
  }
  syncTools()
  syncTray()
  notify()
}

export function setSelection(active: boolean): void {
  if (ui.sel === active) return
  ui.sel = active
  syncTray()
}

export function setColor(color: StickyColor): void {
  ui.color = color
  if (ui.tool === 'highlight') window.api.setMarker(color)
  syncShaper()
  notify()
}

/** Narzędzie kształtu żyje w dokumentach, więc każdą zmianę rodzaju i koloru trzeba im przekazać. */
function syncShaper(): void {
  window.api.setShaper(ui.tool === 'shape' ? { type: drawings.type, color: ui.color } : null)
}

export function chooseShape(type: ShapeType): void {
  setShapeType(type)
  syncShaper()
}

export function setAudience(audience: Audience): void {
  ui.aud = audience
  notify()
}

export function selectionAction(action: 'comment' | 'sticky' | 'copy'): void {
  const docId = focusedId()
  if (docId) window.api.selectionAction(docId, action)
}

function startDraft(docId: string, kind: NoteKind, anchor: Anchor | null, rect: OverlayRect | null): void {
  ui.tool = 'move'
  els.app.dataset.tool = 'move'
  ui.selNote = null
  ui.threadRect = null
  ui.draft = { docId, kind, anchor, rect, audience: kind === 'comment' ? ui.aud : 'me', color: ui.color }
  syncTools()
  syncTray()
  notify()
  touch()
}

/** Uwaga do całego dokumentu powstaje w panelu, bo nie ma miejsca, od którego mogłaby wyrosnąć. */
export function documentNote(): void {
  const docId = focusedId()
  if (docId) startDraft(docId, 'comment', null, null)
}

export function cancelDraft(): void {
  const draft = ui.draft
  if (!draft) return
  ui.draft = null
  window.api.setOverlayMode(draft.docId, null)
  notify()
  touch()
}

export function submitDraft(text: string, audience: Audience, color: StickyColor): void {
  const draft = ui.draft
  if (!draft || !text.trim()) return
  void window.api
    .createAnnotation(draft.docId, {
      kind: draft.kind,
      anchor: draft.anchor,
      audience,
      color: draft.kind === 'sticky' ? color : null,
      text
    })
    .then(cancelDraft)
}

export function handleOverlayEvent(docId: string, event: OverlayEvent): void {
  switch (event.type) {
    case 'place':
      startDraft(docId, event.kind, event.anchor, event.rect)
      break
    case 'highlight':
      void window.api.createAnnotation(docId, {
        kind: 'highlight',
        audience: 'me',
        color: event.color,
        anchor: event.anchor,
        strokes: event.strokes,
        anchorWidth: event.anchorWidth,
        text: ''
      })
      break
    case 'shape':
      // Rysunki mogły zostać schowane przy włączonym narzędziu, a nowy kształt ma być widać.
      revealDrawings(docId)
      void window.api.createAnnotation(docId, {
        kind: 'shape',
        audience: 'me',
        color: event.color,
        anchor: event.anchor,
        shape: event.shape,
        text: ''
      })
      break
    case 'erase': {
      // Prośba przychodzi z dokumentu, więc wolno mu usunąć tylko własne zakreślenie albo kształt.
      const note = findNote(event.id) ?? findShape(event.id)
      if (note?.docId === docId && (note.kind === 'highlight' || note.kind === 'shape')) void window.api.deleteAnnotation(note.id)
      break
    }
    case 'select': {
      const slot = ui.panes.indexOf(docId)
      if (slot >= 0) focusPane(slot)
      if (ui.insp) showPanel('notes')
      ui.selNote = event.id
      ui.threadRect = ui.insp ? null : event.rect
      if (ui.insp) followFor(620, () => hang())
      notify()
      touch()
      break
    }
    case 'focused':
      if (event.id !== ui.selNote) break
      if (!event.rect && !ui.insp) {
        showPanel('notes')
        break
      }
      ui.threadRect = ui.insp ? null : event.rect
      refreshFrame(ui.focus)
      notify()
      touch()
      break
    case 'orphans':
      data.orphans.set(docId, new Set(event.ids))
      notify()
      break
    case 'selection':
      if (docId === focusedId()) setSelection(event.active)
      break
    case 'positions':
      data.positions.set(docId, new Map(event.items.map(({ id, rect }) => [id, rect])))
      hang()
      wake()
      break
    case 'shortcut':
      // Skróty rozdziela `boot`, bo należą do całej powłoki.
      break
  }
}

/** Numer komentarza zgadza się z pinezką: liczą się też zamknięte. */
export function noteNumber(id: string): number | null {
  const note = findNote(id)
  if (note?.kind !== 'comment') return null
  const comments = data.annotations.filter((item) => item.docId === note.docId && item.kind === 'comment')
  return comments.indexOf(note) + 1
}

export const focusedNoteCount = (): number => {
  const docId = focusedId()
  return docId ? openNotes(docId).length : 0
}
