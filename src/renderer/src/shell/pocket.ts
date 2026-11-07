import { parsePocket, POCKET_MAX, togglePocketId } from '../../../shared/pocket'
import { t } from '../../../shared/i18n'
import type { DocEntry } from '../../../shared/types'
import { flash } from './palette'
import { openDoc } from './sheets'
import { data, notify, readStored, ui, writeStored } from './state'

/*
 * Kieszeń: kilka dokumentów pod ręką i przełączanie między nimi skrótem. Pamięta zawartość po
 * restarcie. Dokument, który chwilowo zniknął z biblioteki, zostaje w niej i wraca po skanie.
 */

const POCKET_KEY = 'pocket'
const BUMP_MS = 420

export const pocket = { ids: parsePocket(readStored(POCKET_KEY)), bump: 0 }

let bumpTimer = 0

function save(): void {
  writeStored(POCKET_KEY, JSON.stringify(pocket.ids))
}

export const inPocket = (id: string): boolean => pocket.ids.includes(id)

export function pocketDocs(): DocEntry[] {
  return pocket.ids.flatMap((id) => {
    const doc = data.entries.get(id)
    return doc ? [doc] : []
  })
}

/** Ikona w pasku podskakuje, gdy coś wpada do kieszeni, bo inaczej wkładanie z klawiatury nic by nie pokazało. */
function bump(): void {
  pocket.bump++
  clearTimeout(bumpTimer)
  bumpTimer = window.setTimeout(() => {
    pocket.bump = 0
    notify()
  }, BUMP_MS)
}

export function togglePocket(id: string): void {
  const change = togglePocketId(pocket.ids, id)
  if (change.result === 'full') {
    flash(t('Kieszeń mieści {n} dokumentów. Wyjmij któryś, żeby zrobić miejsce.', { n: POCKET_MAX }))
    return
  }
  pocket.ids = change.ids
  save()
  if (change.result === 'added') bump()
  notify()
}

export function clearPocket(): void {
  pocket.ids = []
  save()
  notify()
}

/** Ctrl z cyfrą otwiera dokument z tego miejsca w kieszeni, licząc tylko te, które są w bibliotece. */
export function openPocket(index: number): boolean {
  const doc = pocketDocs()[index]
  if (!doc) return false
  ui.kbd = true
  openDoc(doc.id)
  return true
}
