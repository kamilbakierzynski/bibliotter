import type { AutoLabelResult, AutoLabelState } from '../../../shared/autoLabel'
import { cleanLabel, hasLabel, isTicket, type LabelCount, sameLabel, type TicketRow } from '../../../shared/labels'
import type { DocEntry } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { hideTip, togglePop } from './keys'
import { inLayer } from './layer'
import { els, hoverPill, setView } from './layout'
import { cover, uncover } from './native'
import { flash, norm } from './palette'
import { canAnnotate, focusedDoc, labelCatalog, notify, ticketCatalog, ticketHref, ui, unlabeledDocs } from './state'

/*
 * Spis etykiet wynika z dokumentów, więc etykieta powstaje przy pierwszym użyciu i znika z ostatnim.
 * Etykietę można też dostać od Haiku: ten plik tylko je zamawia, a resztę robi proces główny.
 */

export interface LabelRow {
  name: string
  on: boolean
  /** Takiej etykiety jeszcze nie ma, więc wybór ją utworzy. */
  create: boolean
}

export const picker = { query: '', idx: 0, left: 0, bottom: 0, note: '' }

const inputEl = (): HTMLInputElement | null => document.getElementById('labelInput') as HTMLInputElement | null

/** Pasujące etykiety, a na końcu nowa nazwa, jeśli jeszcze jej nie ma. Cudze kody czekają na wpisanie. */
export function labelRows(doc: DocEntry): LabelRow[] {
  const query = cleanLabel(picker.query)
  const needle = norm(query)
  const rows = labelCatalog()
    .filter(({ name }) => (needle ? norm(name).includes(needle) : !isTicket(name) || hasLabel(doc.labels, name)))
    .map(({ name }): LabelRow => ({ name, on: hasLabel(doc.labels, name), create: false }))
  if (query && !rows.some(({ name }) => sameLabel(name, query))) rows.push({ name: query, on: false, create: true })
  return rows
}

/** Szybkie klikanie nie czeka na migawkę biblioteki, bo kolejna zmiana startowałaby ze starej listy. */
export function toggleLabel(doc: DocEntry, name: string): void {
  doc.labels = hasLabel(doc.labels, name) ? doc.labels.filter((label) => !sameLabel(label, name)) : [...doc.labels, name]
  notify()
  void window.api.setDocLabels(doc.id, doc.labels)
}

export function chooseLabel(doc: DocEntry, row: LabelRow): void {
  toggleLabel(doc, row.name)
  if (row.create) {
    picker.query = ''
    picker.idx = 0
    notify()
  }
  inputEl()?.focus()
}

export function closeLabelPop(): void {
  if (!ui.labelPop) return
  ui.labelPop = false
  inputEl()?.blur()
  uncover('labels')
  notify()
}

function openLabelPop(): void {
  const button = inLayer('labelBtn')
  if (!button || !canAnnotate(focusedDoc())) return
  togglePop(false)
  hideTip()
  const r = button.getBoundingClientRect()
  const a = els.app.getBoundingClientRect()
  picker.left = r.left - a.left + r.width / 2
  picker.bottom = a.bottom - r.top + 16
  picker.query = ''
  picker.idx = 0
  picker.note = ''
  ui.labelPop = true
  cover('labels')
  notify()
  window.api.focusDoc(null)
  inputEl()?.focus()
}

export function toggleLabelPop(): void {
  if (ui.labelPop) closeLabelPop()
  else openLabelPop()
}

export function connectAutoLabel(): void {
  const show = (state: AutoLabelState): void => {
    ui.autoLabel = state
    notify()
  }
  window.api.onAutoLabelState(show)
  void window.api.getAutoLabelState().then(show)
}

const outcome = ({ labels, error }: AutoLabelResult): string =>
  error ?? (labels.length > 0 ? t('Dodano: {labels}', { labels: labels.join(', ') }) : t('Nic tu nie pasuje'))

/** Wynik trafia tam, skąd padło polecenie: do wybieraka albo stopki palety. */
export async function autoLabelDoc(doc: DocEntry): Promise<void> {
  const text = outcome(await window.api.autoLabel([doc.id]))
  flash(text)
  picker.note = text
  notify()
}

export function autoLabelVisible(): void {
  void window.api.autoLabel(unlabeledDocs().map((doc) => doc.id))
}

/** Etykieta otwarta w panelu. Znika, gdy zdjęto ją z ostatniego dokumentu. */
export const openLabel = (): LabelCount | undefined => {
  const open = ui.label
  return open === null ? undefined : labelCatalog().find(({ name }) => sameLabel(name, open))
}

function showInPanel(): void {
  // Wiersz, nad którym stał kursor, właśnie znika razem ze spisem.
  hoverPill.hide()
  // Ponowny wybór tego samego widoku zwija panel, a tu ma on zostać otwarty.
  if (ui.view === 'labels' && ui.nav) notify()
  else setView('labels')
}

export function showLabel(name: string): void {
  ui.label = name
  ui.tickets = isTicket(name)
  showInPanel()
}

/** Spis kodów ma własny widok, bo jest ich dużo i przykryłyby zwykłe etykiety. */
export function showTickets(): void {
  ui.label = null
  ui.tickets = true
  ui.ticketQuery = ''
  showInPanel()
}

export function closeTickets(): void {
  ui.tickets = false
  ui.ticketQuery = ''
  hoverPill.hide()
  notify()
}

export const showingTickets = (): boolean => ui.tickets && ticketCatalog().length > 0

export function searchTickets(query: string): void {
  ui.ticketQuery = query
  hoverPill.hide()
  notify()
}

export function foundTickets(): TicketRow[] {
  const terms = norm(ui.ticketQuery).split(/\s+/).filter(Boolean)
  const rows = ticketCatalog()
  if (terms.length === 0) return rows
  return rows.filter(({ name, titles }) => {
    const text = norm(`${name}\n${titles}`)
    return terms.every((term) => text.includes(term))
  })
}

/** Kod na tabliczce dokumentu jest linkiem, a bez ustawionego adresu zachowuje się jak etykieta. */
export function openTicket(name: string): void {
  const href = ticketHref(name)
  if (href) void window.api.openExternal(href)
  else showLabel(name)
}
