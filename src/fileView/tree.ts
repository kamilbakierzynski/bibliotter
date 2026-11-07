/*
 * Drzewo plików obok arkusza, wzorowane na panelu plików w Claude Code: filtr na górze, foldery
 * rozwijane strzałką, zmienione pliki z literą gita, a pominięte przez `.gitignore` przygaszone.
 * Stan niesie masa, nie kolor, jak w reszcie apki: zmieniony plik ma grubszą nazwę i literę,
 * folder ze zmianami kropkę, a otwarty plik pigułkę z kreską.
 *
 * Wiersz pliku to zwykły link z pełną ścieżką, więc kliknięcie idzie tą samą drogą co link
 * w dokumencie: proces główny otwiera plik w tym arkuszu, a dokument z biblioteki jako dokument.
 */
import type { FileTreeEntry, FileTreeInfo } from '../shared/fileView'

const SVG = 'http://www.w3.org/2000/svg'
/** Filtr pokazuje tyle trafień. Dalej i tak trzeba dopisać litery. */
const MAX_HITS = 200

const PATHS = {
  chev: 'M6 4.2 9.8 8 6 11.8',
  file: 'M4.2 2.4h4.9l2.7 2.7v8.5H4.2z M9 2.6v2.7h2.6',
  search: 'M7.1 11.6a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z M10.4 10.4 13.6 13.6'
}

function icon(name: keyof typeof PATHS, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', className)
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', PATHS[name])
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.35')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.append(path)
  return svg
}

/** Foldery od korzenia do wskazanego miejsca, z korzeniem jako pustą ścieżką. */
export function ancestors(rel: string | null, includeSelf: boolean): string[] {
  if (rel === null) return ['']
  const parts = rel.split('/').filter(Boolean)
  const upto = includeSelf ? parts.length : parts.length - 1
  const out = ['']
  for (let i = 1; i <= upto; i++) out.push(parts.slice(0, i).join('/'))
  return out
}

/**
 * Trafienie filtra: najpierw kawałek nazwy, potem kawałek ścieżki, na końcu litery po kolei.
 * Zwraca pozycje liter w nazwie do pogrubienia albo `null`, gdy ścieżka nie pasuje.
 */
export function matchPath(path: string, query: string): { score: number; marks: number[] } | null {
  const lower = path.toLowerCase()
  const slash = lower.lastIndexOf('/')
  const name = lower.slice(slash + 1)
  const at = name.indexOf(query)
  if (at >= 0) return { score: (at === 0 ? 0 : 1) + name.length / 1000, marks: [...query].map((_, i) => at + i) }
  if (lower.includes(query)) return { score: 2 + lower.length / 1000, marks: [] }
  let from = 0
  const marks: number[] = []
  for (const char of query) {
    const found = lower.indexOf(char, from)
    if (found < 0) return null
    if (found > slash) marks.push(found - slash - 1)
    from = found + 1
  }
  return { score: 3 + lower.length / 1000, marks }
}

export interface Tree {
  setShown(shown: boolean): void
}

export function startTree(info: FileTreeInfo, labels: Record<string, string>, folder: boolean): Tree {
  const host = document.getElementById('file-tree') as HTMLElement
  const cache = new Map<string, FileTreeEntry[] | null>()
  const expanded = new Set<string>(ancestors(info.current ?? info.reveal, info.current === null))
  let all: Promise<{ files: string[]; truncated: boolean } | null> | null = null
  let query = ''

  const head = document.createElement('div')
  head.className = 'ft-head'
  const filter = document.createElement('label')
  filter.className = 'ft-filter'
  const input = document.createElement('input')
  input.type = 'search'
  input.placeholder = labels.filter ?? ''
  input.spellcheck = false
  input.autocomplete = 'off'
  filter.append(icon('search', ''), input)
  const rootName = document.createElement('div')
  rootName.className = 'ft-root'
  rootName.textContent = info.name
  head.append(filter, rootName)
  const list = document.createElement('div')
  list.className = 'ft-list'
  list.setAttribute('role', 'tree')
  host.append(head, list)
  if (folder) {
    const pick = document.createElement('div')
    pick.className = 'ft-pick'
    pick.textContent = labels.pick ?? ''
    document.body.append(pick)
  }

  const load = async (rel: string): Promise<FileTreeEntry[] | null> => {
    if (cache.has(rel)) return cache.get(rel) ?? null
    const response = await fetch(`/__tree?dir=${encodeURIComponent(rel)}`).catch(() => null)
    const entries = response?.ok ? ((await response.json()) as FileTreeEntry[]) : null
    cache.set(rel, entries)
    return entries
  }

  const note = (text: string): HTMLElement => {
    const element = document.createElement('div')
    element.className = 'ft-note'
    element.textContent = text
    return element
  }

  const row = (entry: FileTreeEntry, depth: number): HTMLElement => {
    const element = entry.dir ? document.createElement('button') : document.createElement('a')
    element.className = 'ft-row'
    element.dataset.rel = entry.rel
    element.style.setProperty('--depth', String(depth))
    element.setAttribute('role', 'treeitem')
    const name = document.createElement('span')
    name.className = 'ft-name'
    name.textContent = entry.name
    if (entry.dir) {
      element.classList.add('dir')
      element.setAttribute('aria-expanded', String(expanded.has(entry.rel)))
      element.append(icon('chev', 'ft-chev'), name)
      if (entry.changed) {
        const dot = document.createElement('span')
        dot.className = 'ft-dot'
        element.append(dot)
      }
    } else {
      ;(element as HTMLAnchorElement).href = entry.href
      element.append(icon('file', 'ft-icon'), name)
      if (entry.rel === info.current) element.classList.add('on')
      if (entry.mark) {
        element.dataset.mark = entry.mark
        const mark = document.createElement('span')
        mark.className = 'ft-mark'
        mark.textContent = entry.mark
        element.title = labels[entry.mark] ?? ''
        element.append(mark)
      }
    }
    if (entry.ignored) {
      element.classList.add('ignored')
      element.title = labels.ignored ?? ''
    }
    return element
  }

  const addRows = (rel: string, depth: number, into: DocumentFragment): void => {
    const entries = cache.get(rel)
    if (!entries) return
    if (entries.length === 0 && depth === 0) into.append(note(labels.empty ?? ''))
    for (const entry of entries) {
      into.append(row(entry, depth))
      if (entry.dir && expanded.has(entry.rel)) addRows(entry.rel, depth + 1, into)
    }
  }

  const renderTree = (): void => {
    const rows = document.createDocumentFragment()
    addRows('', 0, rows)
    list.replaceChildren(rows)
  }

  const hitRow = (path: string, marks: number[]): HTMLElement => {
    const slash = path.lastIndexOf('/')
    const element = document.createElement('a')
    element.className = 'ft-row'
    element.href = `${host.dataset.base ?? ''}${path.split('/').map(encodeURIComponent).join('/')}`
    if (path === info.current) element.classList.add('on')
    const name = document.createElement('span')
    name.className = 'ft-name'
    const base = path.slice(slash + 1)
    let open = -1
    for (let i = 0; i < base.length; i++) {
      if (marks.includes(i)) {
        if (open < 0) open = i
        continue
      }
      if (open >= 0) {
        const bold = document.createElement('b')
        bold.textContent = base.slice(open, i)
        name.append(bold)
        open = -1
      }
      name.append(base[i] as string)
    }
    if (open >= 0) {
      const bold = document.createElement('b')
      bold.textContent = base.slice(open)
      name.append(bold)
    }
    element.append(icon('file', 'ft-icon'), name)
    if (slash > 0) {
      const where = document.createElement('span')
      where.className = 'ft-path'
      where.textContent = path.slice(0, slash)
      element.append(where)
    }
    return element
  }

  const renderHits = async (): Promise<void> => {
    const wanted = query
    all ??= fetch('/__files')
      .then((response) => (response.ok ? (response.json() as Promise<{ files: string[]; truncated: boolean }>) : null))
      .catch(() => null)
    const found = await all
    if (wanted !== query) return
    const hits = (found?.files ?? [])
      .flatMap((path) => {
        const match = matchPath(path, wanted)
        return match ? [{ path, ...match }] : []
      })
      .sort((a, b) => a.score - b.score)
    const rows = document.createDocumentFragment()
    for (const hit of hits.slice(0, MAX_HITS)) rows.append(hitRow(hit.path, hit.marks))
    if (hits.length === 0) rows.append(note(labels.none ?? ''))
    if (hits.length > MAX_HITS) rows.append(note((labels.more ?? '').replace('$', String(MAX_HITS))))
    list.replaceChildren(rows)
  }

  list.addEventListener('click', (event) => {
    const button = (event.target as Element).closest('button.ft-row')
    if (!(button instanceof HTMLElement)) return
    const rel = button.dataset.rel ?? ''
    if (expanded.has(rel)) {
      expanded.delete(rel)
      renderTree()
      return
    }
    expanded.add(rel)
    void load(rel).then(() => {
      renderTree()
      list.querySelector<HTMLElement>(`[data-rel="${CSS.escape(rel)}"]`)?.focus({ preventScroll: true })
    })
  })

  input.addEventListener('input', () => {
    query = input.value.trim().toLowerCase()
    if (query) void renderHits()
    else renderTree()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      list.querySelector<HTMLElement>('a.ft-row')?.click()
      event.preventDefault()
    } else if (event.key === 'Escape' && input.value) {
      input.value = ''
      query = ''
      renderTree()
      event.stopPropagation()
    } else if (event.key === 'ArrowDown') {
      list.querySelector<HTMLElement>('.ft-row')?.focus()
      event.preventDefault()
    }
  })
  // Strzałki chodzą po wierszach, a w lewo i w prawo zwijają i rozwijają folder, jak w Eksploratorze.
  list.addEventListener('keydown', (event) => {
    const current = (event.target as Element).closest('.ft-row')
    if (!(current instanceof HTMLElement)) return
    const rows = [...list.querySelectorAll<HTMLElement>('.ft-row')]
    const index = rows.indexOf(current)
    const open = current.getAttribute('aria-expanded')
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)]
      if (next) next.focus()
      else if (event.key === 'ArrowUp') input.focus()
    } else if ((event.key === 'ArrowRight' && open === 'false') || (event.key === 'ArrowLeft' && open === 'true')) {
      current.click()
    } else {
      return
    }
    event.preventDefault()
  })

  // Pełna ścieżka korzenia przychodzi w każdym wierszu, więc trafienia filtra składają z niej linki.
  const learnBase = (): void => {
    const sample = cache.get('')?.[0]
    if (!sample || host.dataset.base) return
    host.dataset.base = sample.href.slice(0, sample.href.lastIndexOf('/') + 1)
  }

  void Promise.all([...expanded].map((rel) => load(rel))).then(() => {
    learnBase()
    if (query) return
    renderTree()
    const on = list.querySelector<HTMLElement>('.ft-row.on') ?? list.querySelector<HTMLElement>(`[data-rel="${CSS.escape(info.reveal ?? '')}"]`)
    on?.scrollIntoView({ block: 'center' })
  })

  return {
    setShown(shown) {
      if (!folder) document.documentElement.dataset.tree = shown ? 'on' : 'off'
    }
  }
}
