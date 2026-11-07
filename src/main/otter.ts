import { OTTER_ROWS } from './otterArt'

/**
 * Ukryte `bibliotter otter`: znak apki z pikseli i fakt o wydrach. Tekst jest po angielsku jak cały CLI,
 * a polecenia nie ma w USAGE, bo agenci czytają pomoc i nie powinni płacić tokenami za żart.
 */

export interface OtterFact {
  text: string
  source: string
}

export const OTTER_FACTS: readonly OtterFact[] = [
  { text: 'Otters juggle stones more often when they are hungry.', source: 'University of Exeter, 2020' },
  {
    text: 'Sea otters sleep floating on their backs and wrap themselves in kelp so they do not drift away.',
    source: 'National Park Service'
  },
  {
    text: 'A sea otter keeps a favourite stone in a pouch of loose skin under its forearm and uses it to crack shells.',
    source: 'National Geographic'
  },
  {
    text: 'Sea otters have the densest fur of any animal, up to a million hairs per square inch.',
    source: 'National Geographic'
  },
  { text: 'The Eurasian otter hunts mostly at night and at dusk.', source: 'Wildlife Online' },
  { text: 'Sea otters rest together in groups called rafts.', source: 'USGS' },
  { text: 'World Otter Day falls on the last Wednesday of May.', source: 'IUCN Otter Specialist Group' }
]

/** Losowość przychodzi z zewnątrz, żeby test mógł wybrać konkretny fakt. */
export function pickFact(random: () => number): OtterFact {
  const index = Math.floor(random() * OTTER_FACTS.length)
  return OTTER_FACTS[Math.min(Math.max(index, 0), OTTER_FACTS.length - 1)] as OtterFact
}

type Rgb = readonly [number, number, number]
/** `null` to piksel przezroczysty: dostaje tło terminala, a nie kolor. */
export type Pixel = Rgb | null

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const DEFAULT_BG = '\x1b[49m'
const fg = ([r, g, b]: Rgb): string => `\x1b[38;2;${r};${g};${b}m`
const bg = ([r, g, b]: Rgb): string => `\x1b[48;2;${r};${g};${b}m`

/** Rozpakowuje wiersze z `otterArt.ts`: 6 znaków hex na piksel, kropki to przezroczystość. */
export function decodeRows(rows: readonly string[]): Pixel[][] {
  return rows.map((row) =>
    Array.from({ length: row.length / 6 }, (_, index): Pixel => {
      const hex = row.slice(index * 6, index * 6 + 6)
      if (hex === '......') return null
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
    })
  )
}

/**
 * Komórka terminala niesie dwa piksele w pionie. Znak ▀ ma kolor górnego piksela, a tło dolnego.
 * Gdy górny jest przezroczysty, rysuje ▄ w kolorze dolnego, bo ▀ musiałby udawać tło terminala.
 */
function cell(top: Pixel, bottom: Pixel): [code: string, char: string] {
  if (top && bottom) return [fg(top) + bg(bottom), '▀']
  if (top) return [fg(top) + DEFAULT_BG, '▀']
  if (bottom) return [fg(bottom) + DEFAULT_BG, '▄']
  return [RESET, ' ']
}

/** Piksele na linie z kodami ANSI: dwie spacje wcięcia, kolor tylko przy zmianie, reset na końcu każdej linii. */
export function renderPixels(pixels: readonly (readonly Pixel[])[]): string[] {
  const lines: string[] = []
  for (let y = 0; y < pixels.length; y += 2) {
    const top = pixels[y] ?? []
    const bottom = pixels[y + 1] ?? []
    let line = '  '
    let current = RESET
    for (let x = 0; x < top.length; x++) {
      const [code, char] = cell(top[x] ?? null, bottom[x] ?? null)
      if (code !== current) line += code
      current = code
      line += char
    }
    lines.push(line + RESET)
  }
  return lines
}

/** Tyle ze strumienia wyjścia, ile trzeba do decyzji. Strumień do pliku albo potoku nie ma `hasColors`. */
export interface OtterTarget {
  isTTY?: boolean
  hasColors?(count: number, env?: object): boolean
}

/**
 * Rysuje tylko terminal z pełnym kolorem, bo piksele idą w truecolor. Projekt nie ma własnego wykrywania
 * koloru, więc zostaje to Node: `hasColors` zna FORCE_COLOR, TERM=dumb, COLORTERM i Windows.
 * NO_COLOR sprawdzamy sami, żeby wygrywał nawet z FORCE_COLOR.
 */
export function canDrawOtter(target: OtterTarget, env: NodeJS.ProcessEnv): boolean {
  if (!target.isTTY || env.NO_COLOR) return false
  return target.hasColors?.(2 ** 24, env) ?? false
}

export function otterText({ draw, random }: { draw: boolean; random: () => number }): string {
  const fact = pickFact(random)
  if (!draw) return `${fact.text}\n— ${fact.source}`
  return [...renderPixels(decodeRows(OTTER_ROWS)), '', `  ${fact.text}`, `  ${DIM}— ${fact.source}${RESET}`].join('\n')
}
