import type { OpenMode } from '../../../shared/links'
import { syncFind } from './find'
import { recordVisit } from './history'
import { goHome, openHome, thumbOf } from './home'
import { applyLayout, paintGlow, reflow, SHUT, OFF, sheets, sL, sR, syncCam, syncChrome, syncSel } from './layout'
import { clearFrames, dropView, ensureView, syncCurrent, viewIsOpen } from './native'
import { afterFocusChange, closeThread, setSelNote, setTool } from './notes'
import { data, findNote, focusedId, isOpen, notify, openPane, pinned, saveLastDocs, ui } from './state'

const NEUTRAL_GLOW: [string, string, string] = ['#e7c9a0', '#9fb4d6', '#d8a8a0']

export function applyGlow(): void {
  const docId = focusedId()
  paintGlow((docId && data.thumbs.get(docId)?.glow) || NEUTRAL_GLOW)
}

/** Stawia dokument na miejscu. Otwarcie dokumentu zaczyna się tu, a nie w Reakcie. */
export function setPane(i: number, id: string): void {
  if (ui.panes[i] === id) return
  ui.panes[i] = id
  ensureView(id)
}

export function syncFocus(): void {
  syncChrome()
  applyGlow()
  syncSel()
  syncCam()
  syncCurrent()
  afterFocusChange()
  syncFind()
  rememberLayout()
  recordVisit()
  notify()
}

function rememberLayout(): void {
  if (ui.home) return
  saveLastDocs(ui.order.flatMap((slot) => ui.panes[slot] ?? []))
}

export function focusPane(i: number): void {
  if (ui.focus === i) return
  ui.focus = i
  syncFocus()
}

export function openDoc(id: string, pane = ui.focus): void {
  if (!data.entries.has(id) || ui.setup) return
  if (ui.home && ui.peek === null) {
    openHome(id, thumbOf(id))
    return
  }
  const at = openPane(id)
  if (at >= 0) {
    focusPane(at)
    return
  }
  ui.focus = pane
  closeThread()
  setSelNote(null)
  // Prezentacja, zakreślanie i kształty idą dalej przez kolejne dokumenty, a uwaga należy do tego, który się zamyka.
  if (ui.tool !== 'pointer' && ui.tool !== 'highlight' && ui.tool !== 'shape') setTool('move')
  setPane(pane, id)
  syncFocus()
  applyLayout()
}

export function freeSheet(): number | null {
  const free = sheets.filter((s) => !isOpen(s.i) && !ui.last?.order.includes(s.i))
  const pick = free.find((s) => s.o.x < 0.02) ?? free[0]
  return pick?.i ?? null
}

/** Zerknięcie: Ctrl + klik albo Ctrl Enter, układ pod spodem zostaje bez zmian. */
export function peekDoc(id: string): void {
  if (ui.setup) return
  if (ui.peek !== null) {
    openDoc(id, ui.peek)
    return
  }
  const at = openPane(id)
  if (at >= 0) {
    focusPane(at)
    return
  }
  const i = freeSheet()
  if (i === null) {
    openDoc(id)
    return
  }
  clearFrames(i)
  setPane(i, id)
  const sheet = sheets[i]
  sheet?.el?.classList.add('peek')
  if (sheet) sheet.floating = true
  reflow(
    () => {
      ui.peek = i
      ui.back = ui.focus
      ui.focus = i
    },
    { k: 170, z: 0.72 }
  )
  syncFocus()
}

/** Ctrl Shift + klik: dokument staje od razu obok bieżącego arkusza, bez zerknięcia po drodze. */
export function splitDoc(id: string): void {
  if (!data.entries.has(id) || ui.setup) return
  const at = openPane(id)
  if (at >= 0 && at !== ui.peek) {
    focusPane(at)
    return
  }
  if (ui.peek !== null) {
    openDoc(id, ui.peek)
    pinPeek()
    return
  }
  const i = ui.home ? null : freeSheet()
  if (i === null) {
    openDoc(id)
    return
  }
  clearFrames(i)
  setPane(i, id)
  reflow(() => {
    ui.order.splice(ui.order.indexOf(ui.focus) + 1, 0, i)
    ui.focus = i
  })
  syncFocus()
}

/** Wiersz listy, link i przełącznik pary otwierają dokument tak samo, zależnie od klawiszy przy kliknięciu. */
export function openAs(id: string, mode: OpenMode, pane = ui.focus): void {
  if (mode === 'peek') peekDoc(id)
  else if (mode === 'split') splitDoc(id)
  else openDoc(id, pane)
}

/** Link działa jak wiersz listy: klik otwiera na miejscu arkusza z linkiem. */
export function followLink(from: string, id: string, mode: OpenMode): void {
  const pane = ui.panes.indexOf(from)
  openAs(id, mode, pane >= 0 ? pane : ui.focus)
}

export function closePeek(): void {
  const i = ui.peek
  if (i === null) return
  reflow(() => {
    const sheet = sheets[i]
    if (sheet) sheet.l = sR.x - sL.x + OFF
    ui.peek = null
    ui.focus = ui.back
  }, SHUT)
  syncFocus()
}

/** Przypięty arkusz staje obok tego, z którego na niego zerknięto. */
export function pinPeek(): void {
  const i = ui.peek
  if (i === null) return
  sheets[i]?.el?.classList.remove('peek')
  reflow(
    () => {
      ui.peek = null
      if (ui.home) {
        ui.home = false
        ui.order = [i]
      } else {
        ui.order.splice(ui.order.indexOf(ui.back) + 1, 0, i)
      }
    },
    { k: 170, z: 0.76 }
  )
  syncFocus()
}

export function closeSheet(i: number): void {
  if (ui.peek === i) {
    closePeek()
    return
  }
  if (pinned() < 2) {
    goHome()
    return
  }
  const at = ui.order.indexOf(i)
  reflow(() => {
    ui.order.splice(at, 1)
    const next = ui.order[Math.min(at, pinned() - 1)] as number
    if (ui.focus === i) ui.focus = next
    if (ui.back === i) ui.back = next
  })
  syncFocus()
}

/** Ctrl \: zerknięcie przypina, kilka arkuszy składa do bieżącego, a kolejne naciśnięcie rozkłada je z powrotem. */
export function splitKey(): void {
  if (ui.peek !== null) {
    pinPeek()
    return
  }
  if (ui.home) return
  if (pinned() > 1) {
    ui.stash = { order: [...ui.order], docs: ui.order.map((i) => ui.panes[i] ?? null), focus: ui.focus }
    reflow(() => {
      ui.order = [ui.focus]
    }, SHUT)
    syncFocus()
    return
  }
  const stash = ui.stash
  const me = ui.panes[ui.focus]
  ui.stash = null
  const back = stash ? stash.order.filter((i, at) => i === ui.focus || stash.docs[at] !== me) : []
  if (stash && back.length > 1 && back.includes(ui.focus)) {
    for (const i of back) {
      const doc = stash.docs[stash.order.indexOf(i)]
      if (i !== ui.focus && doc && ui.panes[i] !== doc) {
        clearFrames(i)
        setPane(i, doc)
      }
    }
    reflow(() => {
      ui.order = back
    })
    syncFocus()
    return
  }
  const id = [...data.entries.keys()].find((key) => openPane(key) < 0)
  const i = freeSheet()
  if (!id || i === null) return
  clearFrames(i)
  setPane(i, id)
  reflow(() => {
    ui.order.push(i)
    ui.focus = i
  })
  syncFocus()
}

/** Dokument zniknął z biblioteki, więc jego arkusz schodzi ze sceny. */
export function dropMissing(): void {
  for (const s of sheets) {
    const id = ui.panes[s.i]
    if (!id || data.entries.has(id)) continue
    if (isOpen(s.i)) closeSheet(s.i)
    ui.panes[s.i] = null
    if (viewIsOpen(id)) dropView(id)
  }
  if (ui.last && ui.last.docs.some((id) => id && !data.entries.has(id))) ui.last = null
  if (ui.stash && ui.stash.docs.some((id) => id && !data.entries.has(id))) ui.stash = null
}

export function openNote(noteId: string): void {
  const note = findNote(noteId)
  if (!note || !data.entries.has(note.docId)) return
  openDoc(note.docId)
  setSelNote(note.id)
}

/** Czas pliku w chwili otwarcia zdejmuje oznaczenie nowej wersji. */
export function reloadSheet(docId: string): void {
  const doc = data.entries.get(docId)
  if (doc) data.opened.set(docId, doc.mtimeMs)
  void window.api.reloadDoc(docId)
  notify()
}
