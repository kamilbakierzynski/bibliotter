import { STICKY_COLORS, type StickyColor } from '../shared/annotations'
import { t } from '../shared/i18n'
import { zoom } from './zoom'

/*
 * Menu zaznaczonego tekstu. Wyrasta przy końcu zaznaczenia, gdy użytkownik puści przycisk myszy,
 * i pod kursorem po prawym kliknięciu w zaznaczenie. Żyje w warstwie dokumentu, bo stoi przy
 * tekście i musi przewijać się razem z nim, a powłoka narysowałaby je tylko nad zrzutem.
 *
 * Kliknięcie w menu nie zabiera zaznaczenia: strażnik kliknięć zatrzymuje wciśnięcie na warstwie,
 * zanim przeglądarka zdąży je skasować. Dzięki temu Kopiuj i szukanie widzą ten sam tekst.
 */

export type SelectionMenuAction = 'copy' | 'comment' | 'sticky' | 'highlight' | 'step' | 'find' | 'search'

export interface SelectionMenuOptions {
  /** Czy menu ma teraz milczeć, bo mysz należy do narzędzia albo trwa prezentacja. */
  blocked: () => boolean
  unzoom: () => number
  run: (action: SelectionMenuAction, range: Range, color: StickyColor) => void
}

export interface SelectionMenu {
  element: HTMLElement
  /** Kliknięcie w warstwę. Zwraca `true`, gdy trafiło w menu. */
  click(x: number, y: number, hit: Element | null): boolean
  close(): void
  /** Przewinięcie albo zmiana skali przesuwa menu za zaznaczeniem. */
  layout(): void
}

/** Odstęp menu od zaznaczenia i od brzegów widoku, w pikselach ekranu. */
const GAP = 8
const EDGE = 10
/** Dok pływa nad dołem arkusza, więc menu tam nie schodzi. */
const FOOT = 84
/** Tyle widać potwierdzenie w wierszu, zanim menu zniknie. */
const DONE_MS = 620
/** Drugie kliknięcie podwójnego zaznacza słowo, więc menu czeka chwilę na koniec gestu. */
const SETTLE_MS = 40

const SVG = 'http://www.w3.org/2000/svg'

/** Kreski ikon z `ui/icons.tsx`. Warstwa dokumentu nie widzi sprite'a powłoki. */
const GLYPHS: Record<string, string> = {
  copy: '<rect x="7.4" y="7.4" width="9.2" height="9.2" rx="2"/><path d="M12.6 7.4V5.2a1.8 1.8 0 0 0-1.8-1.8H5.2a1.8 1.8 0 0 0-1.8 1.8v5.6a1.8 1.8 0 0 0 1.8 1.8h2.2"/>',
  comment: '<path d="M10 3.4a6.6 6.6 0 0 1 0 13.2H3.4V10A6.6 6.6 0 0 1 10 3.4Z"/>',
  sticky:
    '<path d="M4.6 3.4h10.8A1.6 1.6 0 0 1 17 5v7.2l-4.6 4.6H4.6A1.6 1.6 0 0 1 3 15.2V5a1.6 1.6 0 0 1 1.6-1.6Z"/><path d="M12.4 16.8v-3a1.6 1.6 0 0 1 1.6-1.6h3"/>',
  marker:
    '<path d="M12.6 3.5 16.5 7.4a1.3 1.3 0 0 1 0 1.8l-5.7 5.7-5.7-5.7 5.7-5.7a1.3 1.3 0 0 1 1.8 0Z"/><path d="M5.1 9.2 3.4 13l3.6 3.6 3.8-1.7"/><path d="m6.9 11 2.1 2.1"/><path d="M3.2 16.8h3"/>',
  route:
    '<circle cx="5.2" cy="15" r="1.9"/><circle cx="14.8" cy="5" r="1.9"/><path d="M7 14.4c3.4-1 1.6-4.4 4.6-5.6"/><path d="M11.6 8.8l1.6-2.2"/>',
  textsearch:
    '<circle cx="12.3" cy="12" r="3.7"/><path d="M3.4 5h13.2"/><path d="M3.4 9h4.3"/><path d="M3.4 13h2.9"/><path d="m15 14.7 2.3 2.3"/>',
  search: '<circle cx="9" cy="9" r="5.25"/><path d="m13 13 3.75 3.75"/>',
  check: '<path d="m4.6 10.6 3.6 3.6 7.2-8.4"/>'
}

/*
 * Kolory i cienie z `.row-menu` powłoki. Dokument ma własne fonty, więc menu bierze krój systemowy,
 * jak pinezki. Skala `--unzoom` trzyma rozmiar pod kamerą, a kręci się wokół rogu przy tekście.
 */
export const SELECTION_MENU_STYLE = `
  .sm {
    --sm-ink: #131316; --sm-ink-2: #55555c; --sm-ink-3: #93939b; --sm-on: rgb(19 19 22 / .06);
    --sm-hair: rgb(19 19 22 / .07); --sm-key: rgb(19 19 22 / .045);
    position: absolute; top: 0; left: 0; width: 252px; padding: 5px;
    color: var(--sm-ink); background: #fff; border-radius: 14px;
    box-shadow: 0 0 0 .5px rgb(0 0 0 / .07), 0 6px 14px rgb(0 0 0 / .06), 0 26px 56px -12px rgb(0 0 0 / .2);
    font: 400 12.5px/1 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
    scale: var(--unzoom, 1); transform-origin: var(--sm-origin, 0 0);
    pointer-events: auto; user-select: none; cursor: default;
    visibility: hidden; opacity: 0; transform: scale(.94);
    transition: opacity .12s, transform .12s, visibility 0s .12s;
  }
  .sm.on {
    visibility: visible; opacity: 1; transform: none;
    transition: opacity .14s, transform .38s cubic-bezier(.2, 1.3, .3, 1);
  }
  .sm-row {
    display: flex; align-items: center; gap: 9px; width: 100%; height: 30px; padding: 0 6px 0 8px;
    color: inherit; font: inherit; text-align: left; background: none; border: 0; border-radius: 9px;
  }
  .sm-row:hover, .sm-row.done { background: var(--sm-on); }
  .sm-row svg {
    flex: none; width: 16px; height: 16px; color: var(--sm-ink-3);
    fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round;
  }
  .sm-row.done svg { color: var(--sm-ink); }
  .sm-row > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sm-keys { display: flex; flex: none; gap: 3px; }
  .sm-keys kbd {
    display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px;
    color: var(--sm-ink-2); font: 500 10.5px/1 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
    background: var(--sm-key); border-radius: 5px; box-shadow: inset 0 0 0 .5px var(--sm-hair);
  }
  .sm-inks { display: flex; flex: none; gap: 5px; padding-right: 2px; }
  .sm-inks b {
    width: 15px; height: 15px; border-radius: 4px 4px 7px 4px; box-shadow: inset 0 0 0 .5px rgb(0 0 0 / .12);
    transition: scale .3s cubic-bezier(.2, 1.3, .3, 1), box-shadow .2s;
  }
  .sm-inks b:hover { scale: 1.18; }
  .sm-inks b.on { box-shadow: inset 0 0 0 .5px rgb(0 0 0 / .12), 0 0 0 1.5px var(--sm-ink-3); }
  .sm-inks .yellow { background: #f7e7a0; }
  .sm-inks .blue { background: #cfe3f7; }
  .sm-inks .green { background: #d4ebcc; }
  .sm-inks .pink { background: #f7d5df; }
  .sm hr { height: 1px; margin: 4px 8px; background: var(--sm-hair); border: 0; }
  @media (prefers-color-scheme: dark) {
    .sm {
      --sm-ink: #f4f4f5; --sm-ink-2: #a9a9b0; --sm-ink-3: #6e6e76; --sm-on: rgb(255 255 255 / .09);
      --sm-hair: rgb(255 255 255 / .07); --sm-key: rgb(255 255 255 / .06);
      background: #1c1c1f;
      box-shadow: inset 0 .5px 0 rgb(255 255 255 / .1), 0 0 0 .5px rgb(255 255 255 / .07), 0 28px 60px -12px rgb(0 0 0 / .85);
    }
  }
  @media (prefers-reduced-motion: reduce) { .sm, .sm.on { transition: none; } }
`

interface Row {
  action: SelectionMenuAction
  icon: string
  label: string
  keys?: string[]
  done?: string
  /** Kreska nad wierszem. */
  gap?: boolean
}

const rows = (): Row[] => [
  { action: 'copy', icon: 'copy', label: t('Kopiuj'), keys: ['Ctrl', 'C'], done: t('Skopiowano') },
  { action: 'comment', icon: 'comment', label: t('Skomentuj'), keys: ['C'] },
  { action: 'sticky', icon: 'sticky', label: t('Karteczka'), keys: ['N'] },
  { action: 'highlight', icon: 'marker', label: t('Zakreśl') },
  { action: 'step', icon: 'route', label: t('Dodaj krok prezentacji'), done: t('Dodano krok'), gap: true },
  { action: 'find', icon: 'textsearch', label: t('Znajdź w dokumencie'), keys: ['Ctrl', 'F'], gap: true },
  { action: 'search', icon: 'search', label: t('Szukaj w bibliotece'), keys: ['Ctrl', 'Shift', 'F'] }
]

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('aria-hidden', 'true')
  // Stała z kodu apki, bez danych dokumentu.
  svg.innerHTML = GLYPHS[name] ?? ''
  return svg
}

const isEditable = (node: Node | null): boolean => {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  return element?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') != null
}

/** Zaznaczenie w treści dokumentu, a nie w polu formularza. */
function liveRange(): Range | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  if (!selection.toString().trim()) return null
  const range = selection.getRangeAt(0)
  if (isEditable(range.commonAncestorContainer) || isEditable(document.activeElement)) return null
  return range
}

/** Zaznaczenie przeciągnięte w górę kończy się na początku, więc menu staje nad nim. */
function backwards(selection: Selection): boolean {
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection
  if (!anchorNode || !focusNode) return false
  if (anchorNode === focusNode) return focusOffset < anchorOffset
  return (anchorNode.compareDocumentPosition(focusNode) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
}

const inside = (rects: Iterable<DOMRect>, x: number, y: number): boolean => {
  for (const rect of rects) {
    if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) return true
  }
  return false
}

export function createSelectionMenu(options: SelectionMenuOptions): SelectionMenu {
  const element = document.createElement('div')
  element.className = 'sm'
  element.setAttribute('role', 'menu')

  let open = false
  /** Punkt prawego kliknięcia. Bez niego menu stoi przy końcu zaznaczenia. */
  let cursor: { x: number; y: number } | null = null
  let color: StickyColor = 'yellow'
  let doneTimer = 0
  let settleTimer = 0
  let list: Row[] = []

  const build = (): void => {
    list = rows()
    element.replaceChildren()
    for (const row of list) {
      if (row.gap) element.append(document.createElement('hr'))
      const button = document.createElement('button')
      button.className = 'sm-row'
      button.dataset.action = row.action
      button.setAttribute('role', 'menuitem')
      button.tabIndex = -1
      const label = document.createElement('span')
      label.textContent = row.label
      button.append(icon(row.icon), label)
      if (row.action === 'highlight') {
        const inks = document.createElement('i')
        inks.className = 'sm-inks'
        for (const ink of STICKY_COLORS) {
          const swatch = document.createElement('b')
          swatch.className = ink === color ? `${ink} on` : ink
          swatch.dataset.color = ink
          inks.append(swatch)
        }
        button.append(inks)
      } else if (row.keys) {
        const keys = document.createElement('i')
        keys.className = 'sm-keys'
        for (const key of row.keys) {
          const kbd = document.createElement('kbd')
          kbd.textContent = key
          keys.append(kbd)
        }
        button.append(keys)
      }
      element.append(button)
    }
  }

  const close = (): void => {
    clearTimeout(doneTimer)
    clearTimeout(settleTimer)
    doneTimer = 0
    if (!open) return
    open = false
    cursor = null
    element.classList.remove('on')
  }

  /** Róg menu przy tekście stoi w punkcie `at`, a skala kręci się wokół niego. */
  const layout = (): void => {
    if (!open) return
    const range = liveRange()
    if (!range) {
      close()
      return
    }
    const unzoom = options.unzoom()
    element.style.setProperty('--unzoom', String(unzoom))
    const width = element.offsetWidth
    const height = element.offsetHeight
    const view = zoom()
    const viewWidth = window.visualViewport?.width ?? innerWidth
    const viewHeight = window.visualViewport?.height ?? innerHeight
    const gap = GAP * unzoom
    const edge = EDGE * unzoom
    const screenW = width * unzoom
    const screenH = height * unzoom
    const top = view.top + edge
    const bottom = view.top + viewHeight - Math.max(edge, FOOT * unzoom)

    const fits = (y: number, under: boolean): boolean => (under ? y + screenH <= bottom : y - screenH >= top)
    let x: number
    let y: number
    let below: boolean
    if (cursor) {
      x = cursor.x
      below = fits(cursor.y, true)
      y = cursor.y
    } else {
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0)
      const selection = window.getSelection()
      const up = selection ? backwards(selection) : false
      const first = rects[0] ?? range.getBoundingClientRect()
      const last = rects.at(-1) ?? first
      const under = last.bottom + gap
      const over = first.top - gap
      // Menu staje przy końcu, w którym puszczono mysz, a bez miejsca przechodzi na drugą stronę tekstu.
      below = up ? !fits(over, false) && fits(under, true) : fits(under, true) || !fits(over, false)
      y = below ? under : over
      x = (below ? last.right : first.left) - 2 * EDGE * unzoom
    }
    const left = Math.max(view.left + edge, Math.min(x, view.left + viewWidth - edge - screenW))
    // Róg przy tekście stoi w miejscu, a skala kręci się wokół niego, więc menu nad tekstem liczy się od dołu.
    const corner = below ? Math.min(y, Math.max(top, bottom - screenH)) : Math.max(y, top + screenH)
    element.style.setProperty('--sm-origin', below ? '0 0' : '0 100%')
    const pageY = (below ? corner : corner - height) + window.scrollY
    element.style.translate = `${Math.round(left + window.scrollX)}px ${Math.round(pageY)}px`
  }

  const show = (at: { x: number; y: number } | null): void => {
    // Prawe kliknięcie tuż po zaznaczeniu wyprzedza otwarcie przy końcu tekstu, które jeszcze czeka.
    clearTimeout(settleTimer)
    if (options.blocked() || !liveRange()) return
    clearTimeout(doneTimer)
    doneTimer = 0
    cursor = at
    build()
    const fresh = !open
    open = true
    if (fresh) element.classList.remove('on')
    layout()
    if (!open) return
    // Pierwsza klatka stoi w miejscu docelowym, żeby wyrastało stamtąd, a nie przelatywało przez stronę.
    if (fresh) requestAnimationFrame(() => open && element.classList.add('on'))
    else element.classList.add('on')
  }

  const finish = (button: HTMLElement, row: Row): void => {
    if (!row.done) {
      close()
      return
    }
    button.classList.add('done')
    button.replaceChildren(icon('check'))
    const label = document.createElement('span')
    label.textContent = row.done
    button.append(label)
    doneTimer = window.setTimeout(close, DONE_MS)
  }

  window.addEventListener(
    'pointerup',
    (event) => {
      if (!event.isTrusted || event.button !== 0) return
      clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        if (liveRange()) show(null)
      }, SETTLE_MS)
    },
    true
  )
  // Wciśnięcie poza warstwą zaczyna nowe zaznaczenie albo zwykłe kliknięcie. Wciśnięcia na warstwie
  // zatrzymuje strażnik, zanim tu dojdą.
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (event.isTrusted && event.button === 0) close()
    },
    true
  )
  window.addEventListener(
    'contextmenu',
    (event) => {
      if (!event.isTrusted || options.blocked()) return
      const range = liveRange()
      if (!range || !inside(range.getClientRects(), event.clientX, event.clientY)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      show({ x: event.clientX, y: event.clientY })
    },
    true
  )
  window.addEventListener(
    'keydown',
    (event) => {
      if (!open || !event.isTrusted) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        close()
        return
      }
      // Klawisz zmienia zaznaczenie albo robi z nim coś sam, więc menu ustępuje.
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) close()
    },
    true
  )
  document.addEventListener('selectionchange', () => {
    if (open && doneTimer === 0 && !liveRange()) close()
  })
  window.addEventListener('blur', close)

  return {
    element,
    close,
    layout,
    click(_x, _y, hit) {
      if (!open) return false
      if (!hit || !element.contains(hit)) {
        close()
        return false
      }
      const button = hit.closest<HTMLElement>('.sm-row')
      const row = list.find((item) => item.action === button?.dataset.action)
      const range = liveRange()
      if (!button || !row || doneTimer !== 0) return true
      if (!range) {
        close()
        return true
      }
      const swatch = hit.closest<HTMLElement>('[data-color]')
      if (swatch && STICKY_COLORS.includes(swatch.dataset.color as StickyColor)) color = swatch.dataset.color as StickyColor
      options.run(row.action, range, color)
      finish(button, row)
      return true
    }
  }
}
