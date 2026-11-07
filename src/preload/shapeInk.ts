import type { ShapeType } from '../shared/annotations'

/*
 * Geometria kształtów rysowanych tuszem. Kształt jest równy, bo układa go apka z przeciągnięcia,
 * ale linia ma charakter pióra jak wskaźnik i zakreślacz: wchodzi cienko, trzyma grubość, lekko
 * nią oddycha i cienieje na końcu. Prostokąt i elipsa to jedno pociągnięcie, które kończy się
 * kawałek za swoim początkiem, jak domknięte ręką. Strzałka to łuk i dwa krótkie pociągnięcia grotu.
 *
 * Moduł nie zna DOM. Punkty są w pikselach strony, a wynik to wypełnione wstęgi SVG.
 */

export interface Point {
  x: number
  y: number
}

/** Linia środkowa jednego pociągnięcia i długość jego zwężeń na obu końcach. */
export interface InkStroke {
  points: Point[]
  taperIn: number
  taperOut: number
}

/** Pełna grubość linii w pikselach strony. */
const NIB = 3.6
/** Grubość oddycha o tyle w górę i w dół, co tyle pikseli drogi. */
const WOBBLE = 0.1
const WOBBLE_PERIOD = 26
/** Najcieńszy koniec linii jako ułamek pełnej grubości, jak u wskaźnika. */
const THIN_END = 0.2
/** Krok próbkowania linii w pikselach. */
const STEP = 3
/** Zaokrąglenie rogów prostokąta, jak w ruchu pióra. */
const CORNER = 10
/** O tyle prostokąt i elipsa zachodzą na swój początek. */
const OVERLAP = 18
const ELLIPSE_START = -1.9
const ELLIPSE_TURNS = 1.06
/** Strzałka wygina się lekko, jak pociągnięta jednym ruchem nadgarstka. */
const BEND = 0.04
const MAX_BEND = 14
const HEAD_ANGLE = 0.5
const HEAD_SHARE = 0.18
const MIN_HEAD = 9
const MAX_HEAD = 20
/** Shift przyciąga linię do wielokrotności tego kąta. */
const SNAP_ANGLE = Math.PI / 12
/** Krótsze przeciągnięcie to tylko kliknięcie. */
export const MIN_SHAPE = 8

const round = (value: number): number => Math.round(value * 10) / 10
const at = <T>(list: T[], index: number): T => list[index] as T

function segment(from: Point, to: Point, into: Point[]): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / STEP))
  for (let i = into.length === 0 ? 0 : 1; i <= steps; i++) {
    const t = i / steps
    into.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
  }
}

function arc(cx: number, cy: number, radius: number, from: number, to: number, into: Point[]): void {
  const steps = Math.max(2, Math.ceil((Math.abs(to - from) * radius) / STEP))
  for (let i = 1; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps
    into.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) })
  }
}

function quadratic(from: Point, control: Point, to: Point): Point[] {
  const length = Math.hypot(control.x - from.x, control.y - from.y) + Math.hypot(to.x - control.x, to.y - control.y)
  const steps = Math.max(2, Math.ceil(length / STEP))
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    points.push({
      x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y
    })
  }
  return points
}

function lengthOf(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(at(points, i).x - at(points, i - 1).x, at(points, i).y - at(points, i - 1).y)
  }
  return total
}

/** Zwężenie na odcinku końcowym: `progress` 0 to sam koniec, 1 to pełna grubość. */
function narrowing(progress: number): number {
  const eased = Math.min(Math.max(progress, 0), 1)
  return THIN_END + (1 - THIN_END) * eased * (2 - eased)
}

/** Zamknięty, obły obrys przez środki boków, jak w śladzie wskaźnika. */
function closedCurve(points: Point[]): string {
  const middle = (a: Point, b: Point): string => `${round((a.x + b.x) / 2)} ${round((a.y + b.y) / 2)}`
  let path = `M${middle(at(points, points.length - 1), at(points, 0))}`
  points.forEach((point, index) => {
    path += `Q${round(point.x)} ${round(point.y)} ${middle(point, at(points, (index + 1) % points.length))}`
  })
  return `${path}Z`
}

/** Kółko ma ten sam obieg co wstęga, więc reguła wypełnienia nie wycina nakładek. */
function dot({ x, y }: Point, radius: number): string {
  const r = round(Math.max(radius, 0.1))
  return `M${round(x - r)} ${round(y)}a${r} ${r} 0 1 0 ${round(r * 2)} 0a${r} ${r} 0 1 0 ${round(-r * 2)} 0Z`
}

/** Wypełniona wstęga wzdłuż linii środkowej. */
function ribbon({ points, taperIn, taperOut }: InkStroke): string {
  if (points.length < 2) return ''
  const distances = [0]
  for (let i = 1; i < points.length; i++) {
    const step = Math.hypot(at(points, i).x - at(points, i - 1).x, at(points, i).y - at(points, i - 1).y)
    distances.push(at(distances, i - 1) + step)
  }
  const total = at(distances, distances.length - 1)
  const radiusAt = (index: number): number => {
    const distance = at(distances, index)
    const breath = 1 + WOBBLE * Math.sin(distance / WOBBLE_PERIOD)
    return (NIB / 2) * breath * narrowing(distance / Math.max(taperIn, 0.01)) * narrowing((total - distance) / Math.max(taperOut, 0.01))
  }
  const left: Point[] = []
  const right: Point[] = []
  points.forEach((point, index) => {
    const before = at(points, Math.max(index - 1, 0))
    const after = at(points, Math.min(index + 1, points.length - 1))
    const run = Math.hypot(after.x - before.x, after.y - before.y) || 1
    const radius = radiusAt(index)
    const offsetX = (-(after.y - before.y) / run) * radius
    const offsetY = ((after.x - before.x) / run) * radius
    left.push({ x: point.x + offsetX, y: point.y + offsetY })
    right.push({ x: point.x - offsetX, y: point.y - offsetY })
  })
  const last = points.length - 1
  return closedCurve([...left, ...right.reverse()]) + dot(at(points, 0), radiusAt(0)) + dot(at(points, last), radiusAt(last))
}

/** Pociągnięcie z typowymi zwężeniami: krótkie wejście i dłuższe wyjście, ale nie dłuższe niż kawałek linii. */
function stroke(points: Point[], inShare: number, inMax: number, outShare: number, outMax: number): InkStroke {
  const length = lengthOf(points)
  return { points, taperIn: Math.min(length * inShare, inMax), taperOut: Math.min(length * outShare, outMax) }
}

function rectangle(from: Point, to: Point): InkStroke[] {
  const x0 = Math.min(from.x, to.x)
  const y0 = Math.min(from.y, to.y)
  const x1 = Math.max(from.x, to.x)
  const y1 = Math.max(from.y, to.y)
  const r = Math.min(CORNER, (x1 - x0) / 4, (y1 - y0) / 4)
  const points: Point[] = []
  segment({ x: x0 + r, y: y0 }, { x: x1 - r, y: y0 }, points)
  arc(x1 - r, y0 + r, r, -Math.PI / 2, 0, points)
  segment({ x: x1, y: y0 + r }, { x: x1, y: y1 - r }, points)
  arc(x1 - r, y1 - r, r, 0, Math.PI / 2, points)
  segment({ x: x1 - r, y: y1 }, { x: x0 + r, y: y1 }, points)
  arc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, points)
  segment({ x: x0, y: y1 - r }, { x: x0, y: y0 + r }, points)
  arc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, points)
  const overlap = Math.min(OVERLAP, (x1 - x0 - 2 * r) * 0.3)
  segment({ x: x0 + r, y: y0 }, { x: x0 + r + overlap, y: y0 }, points)
  return [stroke(points, 0.05, 16, 0.08, 28)]
}

function ellipse(from: Point, to: Point): InkStroke[] {
  const cx = (from.x + to.x) / 2
  const cy = (from.y + to.y) / 2
  const rx = Math.abs(to.x - from.x) / 2
  const ry = Math.abs(to.y - from.y) / 2
  // Obwód według Ramanujana wystarcza do gęstości próbek.
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
  const steps = Math.max(24, Math.ceil((perimeter * ELLIPSE_TURNS) / STEP))
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = ELLIPSE_START + (i / steps) * ELLIPSE_TURNS * Math.PI * 2
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
  }
  return [stroke(points, 0.05, 16, 0.08, 28)]
}

function line(from: Point, to: Point): InkStroke[] {
  const points: Point[] = []
  segment(from, to, points)
  return [stroke(points, 0.15, 14, 0.3, 30)]
}

function arrow(from: Point, to: Point): InkStroke[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  const bend = Math.min(length * BEND, MAX_BEND)
  const control = { x: (from.x + to.x) / 2 + (dy / length) * bend, y: (from.y + to.y) / 2 - (dx / length) * bend }
  const shaft = quadratic(from, control, to)
  // Grot idzie wzdłuż końca łuku, a nie wzdłuż prostej między końcami.
  const tail = { x: to.x - control.x, y: to.y - control.y }
  const run = Math.hypot(tail.x, tail.y) || 1
  const head = Math.min(MAX_HEAD, Math.max(MIN_HEAD, length * HEAD_SHARE))
  const barb = (side: number): InkStroke => {
    const angle = Math.atan2(tail.y / run, tail.x / run) + Math.PI + side * HEAD_ANGLE
    const points: Point[] = []
    segment(to, { x: to.x + Math.cos(angle) * head, y: to.y + Math.sin(angle) * head }, points)
    // Grot zaczyna się pełną grubością w czubku i cienieje na zewnątrz.
    return { points, taperIn: 0.01, taperOut: head * 0.75 }
  }
  return [stroke(shaft, 0.15, 14, 0.05, 6), barb(1), barb(-1)]
}

/** Pociągnięcia kształtu rozpiętego między dwoma punktami. Zbyt mały kształt nie ma żadnego. */
export function shapeStrokes(type: ShapeType, from: Point, to: Point): InkStroke[] {
  const width = Math.abs(to.x - from.x)
  const height = Math.abs(to.y - from.y)
  if (type === 'rect' || type === 'ellipse') {
    if (width < MIN_SHAPE || height < MIN_SHAPE) return []
    return type === 'rect' ? rectangle(from, to) : ellipse(from, to)
  }
  if (Math.hypot(width, height) < MIN_SHAPE * 1.5) return []
  return type === 'arrow' ? arrow(from, to) : line(from, to)
}

/** Obrys wszystkich pociągnięć jako jedna ścieżka do wypełnienia. */
export const inkPath = (strokes: InkStroke[]): string => strokes.map(ribbon).join('')

/** Łączna długość linii środkowych. Od niej zależy, jak długo pióro rysuje kształt. */
export const inkLength = (strokes: InkStroke[]): number => strokes.reduce((sum, { points }) => sum + lengthOf(points), 0)

/** Początek linii do podanej długości. Ostatni punkt leży między dwoma punktami linii. */
function cut(points: Point[], distance: number): Point[] {
  const result = [at(points, 0)]
  let left = distance
  for (let i = 1; i < points.length; i++) {
    const a = at(points, i - 1)
    const b = at(points, i)
    const step = Math.hypot(b.x - a.x, b.y - a.y)
    if (step >= left) {
      const t = step === 0 ? 0 : left / step
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      return result
    }
    result.push(b)
    left -= step
  }
  return result
}

/**
 * Kształt w trakcie rysowania: pociągnięcia jedno po drugim, ostatnie urwane tam, gdzie stoi pióro.
 * Urwany koniec cienieje jak gotowy, więc wygląda jak czubek pióra, a na końcu wychodzi ten sam tusz.
 */
export function partialStrokes(strokes: InkStroke[], progress: number): InkStroke[] {
  if (progress >= 1) return strokes
  let left = inkLength(strokes) * Math.max(0, progress)
  const drawn: InkStroke[] = []
  for (const stroke of strokes) {
    if (left <= 0) break
    const length = lengthOf(stroke.points)
    if (left >= length) {
      drawn.push(stroke)
      left -= length
      continue
    }
    drawn.push({ ...stroke, points: cut(stroke.points, left) })
    break
  }
  return drawn
}

/** Czy punkt leży przy którymś pociągnięciu. Tak działa gumka pod prawym przyciskiem. */
export function nearInk(strokes: InkStroke[], x: number, y: number, reach: number): boolean {
  for (const { points } of strokes) {
    for (let i = 1; i < points.length; i++) {
      const a = at(points, i - 1)
      const b = at(points, i)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const along = dx === 0 && dy === 0 ? 0 : ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)
      const t = Math.min(1, Math.max(0, along))
      if (Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)) <= reach) return true
    }
  }
  return false
}

/**
 * Shift wyrównuje kształt: prostokąt staje się kwadratem, elipsa kołem, a linia i strzałka
 * przyciągają się do kroku 15 stopni. Punkt startu zostaje na miejscu.
 */
export function constrain(type: ShapeType, from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (type === 'rect' || type === 'ellipse') {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side }
  }
  const length = Math.hypot(dx, dy)
  const angle = Math.round(Math.atan2(dy, dx) / SNAP_ANGLE) * SNAP_ANGLE
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
}
