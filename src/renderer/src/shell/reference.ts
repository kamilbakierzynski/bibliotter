import { documentReference } from '../../../shared/reference'
import { notify, ui } from './state'

const COPIED_MS = 1400

let copiedTimer = 0

/** Schowek idzie przez główny proces, bo przy fokusie w dokumencie powłoka nie może go zapisać. */
export function copyReference(doc: { id: string; title: string | null }): void {
  window.api.copyText(documentReference(doc))
  ui.refCopied = true
  notify()
  clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    ui.refCopied = false
    notify()
  }, COPIED_MS)
}
