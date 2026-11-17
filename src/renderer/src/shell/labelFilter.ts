import { hasLabel, sameLabel } from '../../../shared/labels'
import type { DocEntry, ProjectGroup } from '../../../shared/types'
import { followFor } from '../motion/spring'
import { hoverPill, setView, syncSel } from './layout'
import { labelCatalog, memo, notify, readStored, ui, visibleProjects, writeStored } from './state'

/*
 * Filtr etykiet zawęża tylko drzewo biblioteki. Ściana ma własny filtr formatu, a widok Etykiety
 * i tak pokazuje dokumenty jednej etykiety. Wybrane etykiety łączy „lub”, bo dokument zwykle ma
 * jedną albo dwie, a „i” szybko kończyłoby się pustą listą. Etykieta, której już nie ma, nie
 * filtruje, żeby zmiana nazwy czy zdjęcie z ostatniego dokumentu nie zostawiły pustej biblioteki.
 */

/** Umowna nazwa dla dokumentów bez etykiet. Prawdziwa etykieta nie zaczyna się od zera. */
export const UNLABELED = '\u0000none'

const FILTER_KEY = 'labelFilter'
/** Tyle pozostaje na zmianę układu drzewa, zanim zaznaczenie przestanie za nim jechać. */
const FOLLOW_MS = 620

function readFilter(): string[] {
  try {
    const parsed: unknown = JSON.parse(readStored(FILTER_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export const labelFilter = {
  /** Zmiana podmienia tablicę, bo model biblioteki porównuje zależności. */
  names: readFilter(),
  /** Pasek z etykietami jest rozwinięty. */
  open: false
}

/** Wybór bez etykiet, które zniknęły z biblioteki. */
export const activeFilter = memo(
  () => [labelFilter.names, labelCatalog()] as const,
  (names, catalog): string[] =>
    names.filter((name) => name === UNLABELED || catalog.some((label) => sameLabel(label.name, name)))
)

const matches = (doc: DocEntry, names: string[]): boolean =>
  names.some((name) => (name === UNLABELED ? doc.labels.length === 0 : hasLabel(doc.labels, name)))

export const filteredProjects = memo(
  () => [visibleProjects(), activeFilter()] as const,
  (projects, names): ProjectGroup[] => {
    if (names.length === 0) return projects
    return projects
      .map((project) => ({ ...project, docs: project.docs.filter((doc) => matches(doc, names)) }))
      .filter((project) => project.docs.length > 0)
  }
)

function changed(): void {
  writeStored(FILTER_KEY, JSON.stringify(labelFilter.names))
  hoverPill.hide()
  notify()
  followFor(FOLLOW_MS, () => syncSel(true))
}

export function toggleFilterLabel(name: string): void {
  const on = labelFilter.names.some((item) => sameLabel(item, name))
  labelFilter.names = on ? labelFilter.names.filter((item) => !sameLabel(item, name)) : [...labelFilter.names, name]
  changed()
}

/** Z menu wiersza: zastępuje filtr i pokazuje drzewo, nawet gdy menu otwarto w innym widoku. */
export function setLabelFilter(names: string[]): void {
  labelFilter.names = [...names]
  changed()
  if (ui.view !== 'library') setView('library')
}

export function clearLabelFilter(): void {
  labelFilter.names = []
  changed()
}

export function toggleLabelBar(): void {
  labelFilter.open = !labelFilter.open
  notify()
}
