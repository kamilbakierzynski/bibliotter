import { Trail } from './presenterTrail'

/*
 * Linia rysowana palcem wskaźnika. Leży na dokumencie, a nie na oknie, więc jedzie razem
 * z przewijaniem i zostaje na zrzucie arkusza. Kolor to bursztyn podkreśleń cytatów: to ślad
 * użytkownika na treści, a nie Sygnał. Połysk buduje się jak na rurce: ciemniejszy brzeg,
 * bursztyn i jasny środek przesunięty ku światłu, które pada na arkusz z lewej góry.
 */

const SVG = 'http://www.w3.org/2000/svg'
const AMBER = '#f2ab2e'
const AMBER_EDGE = '#d9860a'
const GONE_MS = 240
const HOT_SCALE = 0.5
/** Długość błysku w pikselach. Biegnie stałym tempem, a widełki trzymają krótkie i długie linie. */
const GLINT = 42
const GLINT_PX_PER_MS = 1.5
const GLINT_MIN_MS = 460
const GLINT_MAX_MS = 1200

/** Warstwy linii od spodu, każda ze swoją grubością. */
const LAYERS = [
  { name: 'halo', scale: 1 },
  { name: 'shade', scale: 1 },
  { name: 'edge', scale: 1 },
  { name: 'amber', scale: 0.66 },
  { name: 'core', scale: 0.24 }
]

export const PEN_STYLE = `
  .pen { position: absolute; top: 0; left: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  .pen.off { display: none; }
  .pen g { transition: opacity .22s ease-out; }
  .pen g.gone { opacity: 0; }
  .pen .halo { fill: ${AMBER}; stroke: ${AMBER}; stroke-width: 7px; stroke-linejoin: round; opacity: .42; filter: blur(5px); }
  .pen .shade { fill: #000; opacity: .24; transform: translate(1px, 2px); filter: blur(1.2px); }
  .pen .edge { fill: ${AMBER_EDGE}; }
  .pen .amber { fill: ${AMBER}; }
  .pen .core { fill: #fff1c9; transform: translate(-.4px, -.5px); }
  .pen .hot { fill: #fff; opacity: .8; transition: opacity .35s ease-out; }
  .pen .done .hot { opacity: 0; }
  .pen .glint {
    fill: none; stroke: #fff; stroke-width: 2.2px; stroke-linecap: round; stroke-linejoin: round;
    filter: drop-shadow(0 0 2px #fff); animation: glint linear both;
  }
  @keyframes glint { from { stroke-dashoffset: var(--from); } to { stroke-dashoffset: var(--to); } }
  @media (prefers-reduced-motion: reduce) {
    .pen .glint { display: none; }
  }
`

interface Line {
  trail: Trail
  group: SVGGElement
  layers: { path: SVGPathElement; scale: number }[]
  hot: SVGPathElement
}

export interface Pen {
  element: SVGSVGElement
  begin(x: number, y: number, time: number): void
  extend(x: number, y: number, time: number): void
  /** Rysuje to, co przyszło od ostatniej klatki. Ścieżkę parsuje się w całości, więc nie przy każdym ruchu. */
  flush(): void
  end(): void
  erase(): void
  show(on: boolean): void
}

function inkPath(name: string): SVGPathElement {
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('class', name)
  return path
}

export function createPen(): Pen {
  const element = document.createElementNS(SVG, 'svg')
  element.setAttribute('class', 'pen off')
  element.setAttribute('aria-hidden', 'true')

  let line: Line | null = null
  let dirty = false

  const paint = (): void => {
    if (!line) return
    dirty = false
    const { trail, layers, hot } = line
    const full = trail.outline(1)
    for (const { path, scale } of layers) {
      path.setAttribute('d', scale === 1 ? full : trail.outline(scale))
    }
    hot.setAttribute('d', trail.comet(HOT_SCALE))
  }

  /** Błysk przebiega raz po skończonej linii, żeby nie rozpraszał w trakcie prezentacji. */
  const glint = ({ group, trail }: Line): void => {
    const path = inkPath('glint')
    const ms = Math.min(Math.max(trail.length / GLINT_PX_PER_MS, GLINT_MIN_MS), GLINT_MAX_MS)
    path.setAttribute('d', trail.d)
    path.setAttribute('stroke-dasharray', `${GLINT} ${trail.length + GLINT}`)
    path.style.setProperty('--from', `${GLINT}px`)
    path.style.setProperty('--to', `${-trail.length}px`)
    path.style.animationDuration = `${ms}ms`
    path.addEventListener('animationend', () => path.remove())
    group.append(path)
  }

  return {
    element,
    begin(x, y, time) {
      const group = document.createElementNS(SVG, 'g')
      const layers = LAYERS.map(({ name, scale }) => ({ path: inkPath(name), scale }))
      const hot = inkPath('hot')
      group.append(...layers.map(({ path }) => path), hot)
      element.append(group)
      line = { trail: new Trail(x, y, time), group, layers, hot }
      dirty = true
    },
    extend(x, y, time) {
      if (!line) return
      line.trail.add(x, y, time)
      dirty = true
    },
    flush() {
      if (dirty) paint()
    },
    end() {
      if (!line) return
      line.trail.finish()
      paint()
      // Samo stuknięcie niczego nie rysuje.
      if (line.trail.points < 2) line.group.remove()
      else {
        line.group.classList.add('done')
        glint(line)
      }
      line = null
    },
    erase() {
      line = null
      dirty = false
      for (const group of element.children) {
        group.classList.add('gone')
        setTimeout(() => group.remove(), GONE_MS)
      }
    },
    show(on) {
      element.classList.toggle('off', !on)
    }
  }
}
