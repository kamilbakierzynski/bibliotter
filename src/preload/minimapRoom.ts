import { HEADING_SELECTOR, makeClipper, MEDIA, type Sketch, visiblePart } from './pageSketch'

/*
 * Miejsce na minimapę. Pas leży nad dokumentem, więc trzeba wiedzieć, co jest pod nim.
 *
 * Tekst i obrazy to treść: gdy któreś jest w oknie pod pasem, minimapa ustępuje i czeka
 * w szufladzie przy krawędzi. Liczy się to, co widać teraz, bo jedna stopka na końcu nie może
 * zabrać mapy z piętnastu ekranów tekstu. Tła pasów na całą szerokość, ramki sekcji, linie
 * i tła bloków kodu, które biegną daleko w lewo, to dekoracja: minimapa zostaje, tylko kładzie
 * pod szkic własny papier. Dekoracja liczy się dla całego dokumentu, żeby papier nie mrugał
 * przy przewijaniu. Przyklejony pasek nawigacji nie jest ani jednym, ani drugim: pas zaczyna
 * się pod nim.
 */

export interface Room {
  /** Gdzieś pod pasem leży dekoracja, więc szkic potrzebuje własnego papieru. */
  decor: boolean
  /** Strona przewija się w bok, więc pas zawsze leżałby na treści. */
  wide: boolean
  /** Przedziały wysokości strony, w których pod pas sięga treść: góra i dół, posortowane. */
  content: number[]
}

export const EMPTY_ROOM: Room = { decor: false, wide: false, content: [] }

/** Treść tak blisko siebie to jedno miejsce, inaczej mapa migałaby między linijkami. */
const JOIN = 48

export interface Bars {
  /** Ile okna u góry i u dołu zajmują przyklejone paski, które przecinają pas. */
  top: number
  bottom: number
  /** Paski nie przewijają się z dokumentem, więc nie należą do szkicu. */
  skip: Set<Element>
}

/** Wyższy pasek to już panel, a nie nawigacja. */
const MAX_BAR = 160
const MAX_BAR_SHARE = 0.25
/** Pasek przyklejony dalej od krawędzi okna to element treści, np. dymek albo panel. */
const BAR_ZONE = 0.2
/** Przyklejony nagłówek sekcji jest węższy, a pasek nawigacji biegnie przez stronę. */
const MIN_STICKY_SHARE = 0.4

export function parseColor(value: string): [number, number, number, number] | null {
  const match = /rgba?\(([^)]+)\)/.exec(value)
  if (!match?.[1]) return null
  const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  const [r = 0, g = 0, b = 0, a = 1] = parts
  return [r, g, b, a]
}

/** Element maluje coś pod pasem: tło inne niż strona, obraz albo ramkę. */
export function paints(style: CSSStyleDeclaration, paper: string): boolean {
  if (style.backgroundImage !== 'none') return true
  const bg = parseColor(style.backgroundColor)
  if (bg && bg[3] > 0.04 && `rgb(${bg[0]} ${bg[1]} ${bg[2]})` !== paper) return true
  return ['top', 'right', 'bottom', 'left'].some((side) => {
    if (!(parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0)) return false
    if (style.getPropertyValue(`border-${side}-style`) === 'none') return false
    const border = parseColor(style.getPropertyValue(`border-${side}-color`))
    return border !== null && border[3] > 0.04
  })
}

/**
 * Paski przyklejone do górnej albo dolnej krawędzi okna, które przecinają pas: nawigacja,
 * nagłówek strony, przycisk „do góry”. `column` to szerokość pasa razem z odstępem od treści.
 */
export function findBars(column: number, maxScan: number): Bars {
  const bars: Bars = { top: 0, bottom: 0, skip: new Set() }
  const body = document.body
  if (!body) return bars
  const viewW = document.documentElement.clientWidth
  const viewH = innerHeight
  const left = viewW - column
  const tallest = Math.min(MAX_BAR, viewH * MAX_BAR_SHARE)
  const inBar = (element: Element): boolean => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) if (bars.skip.has(parent)) return true
    return false
  }
  let scanned = 0
  for (const element of body.querySelectorAll('*')) {
    if (++scanned > maxScan) break
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0 || rect.height > tallest || rect.right <= left || rect.left >= viewW) continue
    const style = getComputedStyle(element)
    if (style.position !== 'fixed' && style.position !== 'sticky') continue
    if (style.visibility !== 'visible' || style.opacity === '0' || inBar(element)) continue
    if (style.position === 'fixed') {
      if (rect.top <= viewH * BAR_ZONE) bars.top = Math.max(bars.top, rect.bottom)
      else if (rect.bottom >= viewH * (1 - BAR_ZONE)) bars.bottom = Math.max(bars.bottom, viewH - rect.top)
      else continue
    } else {
      // Przyklejony nagłówek rozdziału albo tabeli jest częścią dokumentu, a nie nawigacją.
      if (rect.width < viewW * MIN_STICKY_SHARE || element.matches(HEADING_SELECTOR) || element.closest('table')) continue
      const stuck = parseFloat(style.top)
      if (!(stuck >= 0) || stuck > viewH * BAR_ZONE) continue
      bars.top = Math.max(bars.top, stuck + rect.height)
    }
    bars.skip.add(element)
  }
  bars.top = Math.min(bars.top, viewH * MAX_BAR_SHARE)
  bars.bottom = Math.min(bars.bottom, viewH * MAX_BAR_SHARE)
  return bars
}

/** Co leży pod pasem w całym dokumencie. Treść zostaje jako przedziały, żeby sprawdzać ją przy przewijaniu. */
export function measureRoom(sketch: Sketch, paper: string, skip: ReadonlySet<Element>, column: number, maxScan: number): Room {
  const viewW = document.documentElement.clientWidth
  const scroller = document.scrollingElement ?? document.documentElement
  if (scroller.scrollWidth > viewW + 1) return { decor: false, wide: true, content: [] }
  const left = viewW - column + scrollX
  const right = viewW + scrollX
  const crosses = (x: number, width: number): boolean => x < right && x + width > left
  const spans: [number, number][] = []
  let decor = false
  const { lines, blocks } = sketch
  for (let i = 0; i < lines.length; i += 5) {
    const y = lines[i + 1] ?? 0
    if (crosses(lines[i] ?? 0, lines[i + 2] ?? 0)) spans.push([y, y + (lines[i + 3] ?? 0)])
  }
  for (let i = 0; i < blocks.length; i += 5) {
    if (!crosses(blocks[i] ?? 0, blocks[i + 2] ?? 0)) continue
    const y = blocks[i + 1] ?? 0
    // Obraz to treść, a tło bloku kodu i linia to tylko kształt strony.
    if (blocks[i + 4] === MEDIA) spans.push([y, y + (blocks[i + 3] ?? 0)])
    else decor = true
  }
  const body = document.body
  if (body) {
    const clipOf = makeClipper(skip)
    let scanned = 0
    for (const element of body.querySelectorAll('*')) {
      if (++scanned > maxScan) break
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0 || rect.right + scrollX <= left || rect.left + scrollX >= right) continue
      // Tło schowane w przewijanym bloku albo w niewidocznym dymku nie leży pod minimapą.
      const box = visiblePart(rect, clipOf(element))
      if (!box || box.r <= left || box.l >= right) continue
      if (!paints(getComputedStyle(element), paper)) continue
      // Tło, które biegnie daleko w lewo, to pas albo karta. Wąskie tuż przy krawędzi to przycisk
      // albo plakietka, czyli coś, w co się klika.
      if (box.l >= left - column) spans.push([box.t, box.b])
      else decor = true
    }
  }
  spans.sort((a, b) => a[0] - b[0])
  const content: number[] = []
  for (const [top, bottom] of spans) {
    const last = content.length - 1
    if (last > 0 && top - (content[last] ?? 0) < JOIN) content[last] = Math.max(content[last] ?? 0, bottom)
    else content.push(top, bottom)
  }
  return { decor, wide: false, content }
}

/** Czy pod pasem między `top` a `bottom` strony leży teraz treść. */
export function contentAt(room: Room, top: number, bottom: number): boolean {
  if (room.wide) return true
  const spans = room.content
  // Przedziały są posortowane, więc wystarczy znaleźć pierwszy, który kończy się pod `top`.
  let low = 0
  let high = spans.length / 2
  while (low < high) {
    const mid = (low + high) >> 1
    if ((spans[mid * 2 + 1] ?? 0) <= top) low = mid + 1
    else high = mid
  }
  return low < spans.length / 2 && (spans[low * 2] ?? 0) < bottom
}
