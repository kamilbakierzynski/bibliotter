import type { StickyColor } from '../shared/annotations'
import { clamp, connectLoop, Spring, wake } from '../renderer/src/motion/spring'
import type { Ink } from './markerInk'
import { fitScreen, onZoom, toScreen, zoom } from './zoom'

/*
 * Zakreślacz zastępuje kursor. Czubek końcówki stoi dokładnie pod myszą, a marker unosi się nad
 * kartką jak rysik: cień odsuwa się od niego w powietrzu, a przy dotknięciu zbiega do końcówki.
 * Wtedy widać, że to przedmiot oparty o papier, bo cień rozchodzi się od punktu styku pod innym
 * kątem niż korpus. Wysokość nad kartką niesie jedna sprężyna, a korpus chwieje się za ruchem.
 */

/** Pochylenie korpusu w stopniach. Ścięcie końcówki jest przy nim ustawione w poprzek zwykłego ruchu. */
const ANGLE = 34
/** O tyle cień odchodzi od korpusu, licząc od punktu styku. */
const CAST_FAN = 24
/** Przesunięcie cienia przy pełnej wysokości nad kartką. Światło pada z lewej i z góry. */
const CAST_X = 16
const CAST_Y = 22
const FAR_SHADOW = 0.2
const NEAR_SHADOW = 0.36
/** Rysunek ma ok. 190 px długości, licząc od czubka końcówki. */
const SCALE = 0.9
/** O tyle marker maleje, gdy dotyka kartki, bo oddala się od oka. */
const PRESSED_SCALE = 0.94
const HIDDEN_SCALE = 0.82
const DOWN = { k: 620, z: 0.82 }
const UP = { k: 280, z: 0.52 }
const ENTER = { k: 240, z: 0.8 }
const LEAVE = { k: 300, z: 0.9 }
const SWAY = { k: 150, z: 0.58 }
const SWAY_PER_PX = 0.9
const MAX_SWAY = 9
/** Po takiej przerwie w ruchu korpus wraca do swojego pochylenia. */
const SWAY_REST_MS = 90

/*
 * Rysunek: początek układu to środek ściętej krawędzi końcówki, a korpus idzie w górę.
 * Kształt to płaski zakreślacz z czarną szyjką, poszerzający się ku tyłowi.
 */
const NIB = 'M-8.6 -5.8L8.6 6.2L9.6 -24H-9.6Z'
const NIB_FACE = 'M-4 -13L4 -8L4.6 -24H-4.6Z'
const COLLAR = 'M-10 -23H10L11.4 -33L16 -37.5L17.6 -56H-17.6L-16 -37.5L-11.4 -33Z'
const COLLAR_RIDGE = 'M-16 -37.5H16'
const BODY = 'M-17.6 -54L-23.6 -160Q-24.8 -190-9.5-191H9.5Q24.8-190 23.6-160L17.6-54Z'
const BODY_SHADE = 'M17.6 -54L23.6 -160Q24.8-190 9.5-191H6.5Q18.6-189 17.6-160L11.6-54Z'
const BODY_LIGHT = 'M-14.2 -66L-18.6 -158Q-19 -176-11.6-182'
const BODY_EDGE = 'M4.5 -191L3.2 -54'
const END = 'M-10.5 -190.6Q-1 -193.6 10.5 -190.6'

const SILHOUETTE = `<path d="${NIB}"/><path d="${COLLAR}"/><path d="${BODY}"/>`

const MODEL = `<svg aria-hidden="true">
  <g stroke-linejoin="round" stroke-linecap="round">
    <path d="${BODY}" fill="var(--body)" stroke="var(--edge)" stroke-width="1.5"/>
    <path d="${BODY_SHADE}" fill="var(--edge)" opacity=".34"/>
    <path d="${BODY_EDGE}" fill="none" stroke="var(--edge)" stroke-width="1" opacity=".5"/>
    <path d="${BODY_LIGHT}" fill="none" stroke="#fff" stroke-width="5.5" opacity=".62"/>
    <path d="${END}" fill="none" stroke="var(--edge)" stroke-width="1.6" opacity=".8"/>
    <path d="${NIB}" fill="var(--nib)" stroke="var(--edge)" stroke-width="1.4"/>
    <path d="${NIB_FACE}" fill="#fff" opacity=".42"/>
    <path d="${COLLAR}" fill="#16171a" stroke="#404146" stroke-width="1"/>
    <path d="${COLLAR_RIDGE}" fill="none" stroke="#fff" stroke-width="1" opacity=".2"/>
  </g>
</svg>`

const CAST = `<svg aria-hidden="true"><g fill="#000">${SILHOUETTE}</g></svg>`

export const MARKER_STYLE = `
  .marker {
    position: fixed; inset: 0; overflow: clip; contain: strict;
    pointer-events: none; visibility: hidden;
  }
  .marker.on { visibility: visible; }
  .yellow { --body: #f6ec32; --nib: #fff36b; --edge: #a89a00; }
  .green { --body: #70e04e; --nib: #a6f58a; --edge: #2f8f19; }
  .pink { --body: #ff6db5; --nib: #ffa3d2; --edge: #c02a7c; }
  .blue { --body: #47c1f7; --nib: #94dcff; --edge: #1079ad; }
  .marker-rig { position: absolute; top: 0; left: 0; width: 0; height: 0; transform-origin: 0 0; will-change: transform; }
  .marker-rig svg { position: absolute; top: 0; left: 0; width: 1px; height: 1px; overflow: visible; }
  .marker-cast { opacity: 0; filter: blur(5px); will-change: transform, opacity; }
  /* Linia nie łapie myszy, bo leży na tekście, więc do wątku prowadzi znacznik nad jej końcem. */
  .dab {
    position: absolute; top: 0; left: 0; width: 12px; height: 12px; margin: -20px 0 0 -3px;
    transform-origin: 3px 20px; scale: var(--unzoom, 1);
    pointer-events: auto; cursor: pointer; user-select: none;
    background: var(--body); border-radius: 50%;
    box-shadow: 0 0 0 1.5px #fff, 0 2px 6px rgb(0 0 0 / 28%);
    transition: scale .36s cubic-bezier(.2, 1.3, .3, 1);
  }
  .dab:hover { scale: calc(var(--unzoom, 1) * 1.2); }
  .dab.selected { scale: calc(var(--unzoom, 1) * 1.3); }
`

export interface Marker {
  element: HTMLElement
  /** Kolor włącza narzędzie, a `null` je wyłącza. */
  setColor(color: StickyColor | null): void
  /** `held` mówi, czy lewy przycisk jest wciśnięty, bo puszczenie mogło umknąć dokumentowi. */
  move(x: number, y: number, held: boolean, time: number): void
  leave(): void
  press(down: boolean): void
  /** Znika od razu, np. przed zrzutem arkusza. Wraca przy następnym ruchu myszy. */
  withdraw(): void
}

function rigOf(markup: string, className: string): HTMLElement {
  const node = document.createElement('div')
  node.className = className
  node.innerHTML = markup
  return node
}

export function createMarker(ink: Ink): Marker {
  const element = document.createElement('div')
  element.className = 'marker'
  const cast = rigOf(CAST, 'marker-rig marker-cast')
  const rig = rigOf(MODEL, 'marker-rig')
  element.append(cast, rig)

  const shown = new Spring(0, ENTER.k, ENTER.z)
  const lift = new Spring(1, UP.k, UP.z)
  const sway = new Spring(0, SWAY.k, SWAY.z)

  let active = false
  let inside = false
  let pressed = false
  let x = 0
  let y = 0
  let movedAt = 0

  const draw = (): void => {
    if (sway.t !== 0 && performance.now() - movedAt > SWAY_REST_MS) sway.to(0, SWAY)
    ink.paint()
    const air = Math.max(lift.x, 0)
    const seen = clamp(shown.x)
    const size = SCALE * (PRESSED_SCALE + (1 - PRESSED_SCALE) * air) * (HIDDEN_SCALE + (1 - HIDDEN_SCALE) * seen)
    // Linia leży na stronie, ale sam marker stoi w pikselach ekranu, więc nie rośnie z powiększeniem.
    const at = zoom()
    fitScreen(element, at)
    const tip = toScreen(x, y, at)
    rig.style.transform = `translate(${tip.x}px, ${tip.y}px) rotate(${ANGLE + sway.x}deg) scale(${size})`
    rig.style.opacity = String(seen)
    cast.style.transform = `translate(${tip.x + CAST_X * air}px, ${tip.y + CAST_Y * air}px) rotate(${ANGLE + CAST_FAN + sway.x * 0.6}deg) scale(${size})`
    cast.style.opacity = String((NEAR_SHADOW + (FAR_SHADOW - NEAR_SHADOW) * Math.min(air, 1)) * seen)
    element.classList.toggle('on', shown.x > 0.004)
  }

  connectLoop(draw, () => {})
  onZoom(wake)

  const press = (down: boolean): void => {
    if (down === pressed) return
    pressed = down
    if (down) {
      ink.begin(x, y, movedAt)
      lift.to(0, DOWN)
    } else {
      ink.end()
      lift.to(1, UP)
    }
  }

  const hide = (): void => {
    press(false)
    shown.to(0, LEAVE)
  }

  return {
    element,
    setColor(color) {
      if (color) {
        ink.setColor(color)
        element.classList.remove('yellow', 'green', 'pink', 'blue')
        element.classList.add(color)
      } else {
        hide()
        ink.flush()
      }
      active = color !== null
      if (active && inside) shown.to(1, ENTER)
    },
    move(nextX, nextY, held, time) {
      const step = nextX - x
      x = nextX
      y = nextY
      inside = true
      if (!active) return
      if (shown.t !== 1) shown.to(1, ENTER)
      if (pressed && !held) press(false)
      if (pressed) ink.extend(x, y, time)
      sway.to(clamp(step * SWAY_PER_PX, -MAX_SWAY, MAX_SWAY), SWAY)
      movedAt = time
    },
    leave() {
      inside = false
      if (active) hide()
    },
    press,
    withdraw() {
      inside = false
      press(false)
      shown.set(0)
      lift.set(1)
      element.classList.remove('on')
      draw()
    }
  }
}
