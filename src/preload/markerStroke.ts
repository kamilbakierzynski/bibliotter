import type { Trail } from './presenterTrail'

/*
 * Geometria zakreślacza. Końcówka jest ścięta, więc linia wychodzi szeroka w poprzek ścięcia
 * i wąska wzdłuż niego, jak prawdziwym markerem. Drogę końcówki wygładza ten sam ślad co u wskaźnika.
 *
 * Linia w pamięci to płaska lista `x, y, x, y…` w pikselach. Na dysku punkty są ułamkami rozmiaru
 * elementu kotwicy, bo dokument przelewa się przy zmianie szerokości arkusza.
 */

export type Line = number[]

export const lineOf = (trail: Trail): Line => trail.centerline.flatMap(({ x, y }) => [x, y])

/** Połowa ścięcia końcówki. Kierunek zgadza się z końcówką rysunku przy jego pochyleniu. */
const NIB_X = 5.2
const NIB_Y = 9.7

const tenth = (value: number): number => Math.round(value * 10) / 10
const fifth = (value: number): number => Math.round(value * 1e5) / 1e5

/** Czworokąt zamieciony końcówką między dwoma punktami. */
function sweep(ax: number, ay: number, bx: number, by: number): string {
  const corner = (x: number, y: number, sign: number): string =>
    `${tenth(x + sign * NIB_X)} ${tenth(y + sign * NIB_Y)}`
  // Wszystkie czworokąty mają ten sam obieg, inaczej wypełnienie wycięłoby miejsca, gdzie linia wraca po sobie.
  const clockwise = (bx - ax) * NIB_Y - (by - ay) * NIB_X > 0
  const start = corner(ax, ay, 1)
  const middle = clockwise ? [corner(bx, by, 1), corner(bx, by, -1)] : [corner(ax, ay, -1), corner(bx, by, -1)]
  const end = clockwise ? corner(ax, ay, -1) : corner(bx, by, 1)
  return `M${start}L${middle[0]}L${middle[1]}L${end}Z`
}

/** Pole, które zostawia końcówka na całej linii. */
export function chiselPath(line: Line): string {
  let path = ''
  for (let i = 2; i + 1 < line.length; i += 2) {
    path += sweep(line[i - 2] as number, line[i - 1] as number, line[i] as number, line[i + 1] as number)
  }
  return path
}

/** Czy punkt leży przy linii. Końcówka dociera dalej w pionie, ale do trafienia to wystarczy. */
export function nearLine(line: Line, x: number, y: number, reach: number): boolean {
  for (let i = 0; i + 1 < line.length; i += 2) {
    const ax = line[i] as number
    const ay = line[i + 1] as number
    const bx = line[i + 2] ?? ax
    const by = line[i + 3] ?? ay
    const dx = bx - ax
    const dy = by - ay
    const along = dx === 0 && dy === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)
    const t = Math.min(1, Math.max(0, along))
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= reach) return true
  }
  return false
}

interface TextRect {
  left: number
  right: number
  top: number
  bottom: number
}

/** Wiersze tekstu jako poziome pociągnięcia. Wiersz składa się często z kilku prostokątów. */
export function textBands(rects: Iterable<TextRect>): Line[] {
  const rows: TextRect[] = []
  for (const { left, right, top, bottom } of rects) {
    if (right - left < 1) continue
    const row = rows.find((known) => top < known.bottom && bottom > known.top)
    if (row) {
      row.left = Math.min(row.left, left)
      row.right = Math.max(row.right, right)
    } else {
      rows.push({ left, right, top, bottom })
    }
  }
  return rows.map(({ left, right, top, bottom }) => [left, (top + bottom) / 2, right, (top + bottom) / 2])
}

export function encodeLine(line: Line, left: number, top: number, width: number, height: number): string {
  return line.map((value, i) => (i % 2 === 0 ? fifth((value - left) / width) : fifth((value - top) / height))).join(' ')
}

export function decodeLine(stroke: string, width: number, height: number): Line {
  return stroke.split(' ').map((value, i) => Number(value) * (i % 2 === 0 ? width : height))
}
