import { connectLoop, Spring, wake } from '../renderer/src/motion/spring'
import { createPen, PEN_STYLE } from './presenterPen'
import { restingFoot, retreat, stickAngle } from './presenterRig'
import { fitScreen, onZoom, screenSize, toScreen, zoom } from './zoom'

/*
 * Wskaźnik prezentera: rękawiczka na kijku, wysunięta spod dolnej krawędzi arkusza. Żyje wewnątrz
 * dokumentu, więc widok sam ją przycina i nigdy nie wchodzi na resztę interfejsu.
 *
 * Czubek palca stoi dokładnie pod kursorem, a kijek za nim podąża. Wysokość nad kartką niesie
 * jedna sprężyna: to ona rozsuwa rękę i cień, a jej zero to moment uderzenia. Przytrzymany
 * przycisk zostawia palec na kartce, a ruch palca rysuje linię, którą kasuje prawy przycisk.
 */

/** Rysunek ma ok. 160 px wysokości, licząc od czubka palca do mankietu. */
const SCALE = 0.9
/** O tyle ręka maleje, gdy dotyka kartki, bo oddala się od oka. */
const PRESSED_SCALE = 0.84
/** Cień przy pełnej wysokości nad kartką. Światło pada z lewej i z góry. */
const CAST_X = 30
const CAST_Y = 36
const FAR_SHADOW = 0.25
const NEAR_SHADOW = 0.5
const SQUASH_WIDE = 0.07
const SQUASH_TALL = 0.11
/** Uderzenie zatrzymuje się poniżej zera, więc ręka dochodzi do kartki z pełną prędkością. */
const STRIKE = { k: 1500, z: 1 }
const STRIKE_TARGET = -0.4
const RISE = { k: 260, z: 0.5 }
const SQUASH_BACK = { k: 420, z: 0.42 }
/** Kijek drga po uderzeniu i kołysze się za ręką. */
const STICK_KICK = 760
const FOOT = { k: 95, z: 0.46 }
const ENTER = { k: 240, z: 0.8 }
const LEAVE = { k: 300, z: 0.9 }
const BURST_MS = 700
const TICKS: [number, number][] = [
  [-118, 0.8],
  [-78, 1],
  [-42, 0.86],
  [-8, 1.08],
  [30, 0.84],
  [68, 1],
  [108, 0.78]
]

const INK = '#131316'
const HALO = 'rgb(255 255 255 / 55%)'
/** Grubość konturu rysunku. */
const LINE = 4.6

/*
 * Rysunek według wzoru od użytkownika. Początek układu to czubek palca, więc to on stoi pod
 * kursorem i wokół niego obraca się cała ręka.
 */
const GLOVE =
  'M-23.5 94.5C-18.5 81-18.2 68-20 57C-20.6 46-21.8 39-21.8 30C-21.8 12-9 2.2 .2 2.2C6.5 2.2 10.6 6.5 10.2 12.8C9.4 22 8.7 31 8.7 43L9 45.5C19 43.5 33 48 38.5 59.5C48 60.5 58 66 61.4 84C63 96 58 122 35 142C27 148 0 147.5-8.5 143.5C-15 141-24 132-37.5 119C-40 116.5-42 114-44 113.7C-52 113-72 107-72.3 98.5C-72.6 96.5-71.8 94.6-70.6 93C-66 84.5-59 80.5-51.5 80.5C-42 80.5-32 87-23.5 94.5Z'
const CUFF = 'M-18.6 139C-22 146-18 151-10.5 155.5C-2 160.5 24 161.5 31.5 156C37 152.5 39.5 148 36.5 142.5Z'
const STICK = 'M9 150H18V3400H9Z'
const COLLAR = 'M6 159.5H21A2 2 0 0 1 23 161.5V169A2.5 2.5 0 0 1 20.5 171.5H6.5A2.5 2.5 0 0 1 4 169V161.5A2 2 0 0 1 6 159.5Z'
/** Kreski między palcami zwężają się do punktu, więc są wypełnieniem, a nie linią. */
const CREASES = 'M6.4 43C6.4 56 8.5 66 14.5 74.7C11.5 66 11 55 11 47ZM36.3 59.5C38.8 66 40.5 72 44.3 76.8C42.8 72 42.2 67 41.6 62.2Z'
const DARTS = 'M5.8 114.3C5.9 121 5.9 127 5.2 133.7M22.9 106C21.2 116 20.6 124 18.1 134.3M36.8 115.2C34.6 121.6 33.6 126 29 134.5'

const SHAPES = `<path d="${STICK}"/><path d="${CUFF}"/><path d="${GLOVE}"/>`

const HAND = `<svg aria-hidden="true">
  <g stroke-linejoin="round" stroke-linecap="round">
    <g fill="${HALO}" stroke="${HALO}" stroke-width="${LINE + 4}">${SHAPES}</g>
    <path d="${STICK}" fill="#fff" stroke="${INK}" stroke-width="3.6"/>
    <path d="${COLLAR}" fill="${INK}"/>
    <path d="${CUFF}" fill="#fff" stroke="${INK}" stroke-width="${LINE}"/>
    <path d="${GLOVE}" fill="#fff" stroke="${INK}" stroke-width="${LINE}"/>
    <path d="${CREASES}" fill="${INK}"/>
    <path d="${DARTS}" fill="none" stroke="${INK}" stroke-width="${LINE}"/>
  </g>
</svg>`

const CAST = `<svg aria-hidden="true"><g fill="#000" stroke="#000" stroke-width="${LINE}" stroke-linejoin="round">${SHAPES}</g></svg>`

const BURST = [
  '<i class="dent"></i><i class="ring"></i><i class="ring late"></i>',
  ...TICKS.map(([angle, size]) => `<b class="tick" style="--a:${angle}deg;--s:${size}"></b>`)
].join('')

export const PRESENTER_STYLE = `
  .pointing > * { pointer-events: none; }
  .presenter {
    position: fixed; inset: 0; overflow: clip; contain: strict;
    pointer-events: none; visibility: hidden;
  }
  .presenter.on { visibility: visible; }
  .rig { position: absolute; top: 0; left: 0; width: 0; height: 0; transform-origin: 0 0; will-change: transform; }
  .rig svg { position: absolute; top: 0; left: 0; width: 1px; height: 1px; overflow: visible; }
  .cast { opacity: 0; will-change: transform, opacity; }
  .cast.far { filter: blur(12px); }
  .cast.near { filter: blur(2.5px); }
  .burst { position: absolute; top: 0; left: 0; width: 0; height: 0; }
  .burst > * { position: absolute; display: block; }
  .dent {
    top: -96px; left: -96px; width: 192px; height: 192px; border-radius: 50%;
    background: radial-gradient(closest-side, rgb(128 128 128 / 34%), rgb(128 128 128 / 14%) 44%, rgb(128 128 128 / 0) 74%);
    animation: dent .52s cubic-bezier(.16, .84, .3, 1) both;
  }
  /* Odwrócone tło daje czarny ślad na jasnym dokumencie i biały na ciemnym. */
  .ring, .tick { backdrop-filter: grayscale(1) invert(1) contrast(4); }
  .ring {
    top: -46px; left: -46px; width: 92px; height: 92px; border-radius: 50%;
    mask: radial-gradient(closest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px));
    animation: ring .46s cubic-bezier(.14, .82, .3, 1) both;
  }
  .ring.late { animation-delay: .06s; animation-duration: .56s; }
  .tick {
    top: 0; left: -2.5px; width: 5px; height: 22px; border-radius: 3px;
    rotate: var(--a); transform-origin: 50% 0;
    animation: tick .4s cubic-bezier(.12, .8, .3, 1) both;
  }
  @keyframes dent { from { opacity: 1; transform: scale(.35); } to { opacity: 0; transform: scale(1.3); } }
  @keyframes ring { from { opacity: .9; transform: scale(.16); } to { opacity: 0; transform: scale(1.34); } }
  @keyframes tick {
    from { opacity: 1; transform: translateY(-26px) scaleY(.2); }
    38% { opacity: 1; transform: translateY(calc(-62px * var(--s))) scaleY(var(--s)); }
    to { opacity: 0; transform: translateY(calc(-92px * var(--s))) scaleY(.1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .tick, .ring.late { display: none; }
  }
  ${PEN_STYLE}
`

export interface Presenter {
  element: HTMLElement
  /** Linie leżą osobno, bo przewijają się z dokumentem i zostają, gdy ręka znika. */
  ink: SVGSVGElement
  setActive(on: boolean): void
  /** `held` mówi, czy lewy przycisk jest wciśnięty, bo puszczenie mogło umknąć dokumentowi. */
  move(x: number, y: number, held: boolean, time: number): void
  leave(): void
  press(down: boolean): void
  erase(): void
  /** Znika od razu, np. przed zrzutem arkusza. Wraca przy następnym ruchu myszy. */
  withdraw(): void
}

function layerWith(markup: string, className: string): HTMLElement {
  const node = document.createElement('div')
  node.className = className
  node.innerHTML = markup
  return node
}

export function createPresenter(): Presenter {
  const element = layerWith('', 'presenter')
  const marks = document.createElement('div')
  const far = layerWith(CAST, 'rig cast far')
  const near = layerWith(CAST, 'rig cast near')
  const rig = layerWith(HAND, 'rig')
  element.append(marks, far, near, rig)
  const pen = createPen()

  const foot = new Spring(0, FOOT.k, FOOT.z)
  const shown = new Spring(0, ENTER.k, ENTER.z)
  const lift = new Spring(1, RISE.k, RISE.z)
  const squash = new Spring(0, SQUASH_BACK.k, SQUASH_BACK.z)

  let active = false
  let inside = false
  let pressed = false
  let striking = false
  /** Kursor w układzie okna strony. Ręka stoi w pikselach ekranu, więc nie rośnie z powiększeniem. */
  let x = 0
  let y = 0
  let movedAt = 0
  let { width, height } = screenSize()

  const measure = (): void => {
    ;({ width, height } = screenSize())
  }

  /** Stopa kijka spoczywa pod kursorem na ekranie. */
  const footAt = (): number => {
    const tip = toScreen(x, y)
    return restingFoot(tip.x, tip.y, width, height)
  }

  const rise = (): void => {
    lift.to(1, RISE)
  }

  const burst = (angle: number): void => {
    const node = layerWith(BURST, 'burst')
    const tip = toScreen(x, y)
    node.style.translate = `${tip.x}px ${tip.y}px`
    node.style.rotate = `${angle}rad`
    marks.append(node)
    setTimeout(() => node.remove(), BURST_MS)
  }

  const land = (angle: number): void => {
    striking = false
    lift.set(0)
    squash.set(1)
    squash.to(0, SQUASH_BACK)
    foot.v -= STICK_KICK
    burst(angle)
    if (!pressed) rise()
  }

  const draw = (): void => {
    const at = zoom()
    fitScreen(element, at)
    const tip = toScreen(x, y, at)
    const angle = stickAngle(tip.x, tip.y, foot.x, height)
    if (striking && lift.x <= 0) land(angle)
    const air = Math.max(lift.x, 0)
    const away = (1 - shown.x) * retreat(tip.y, height, angle)
    const left = tip.x - Math.sin(angle) * away
    const top = tip.y + Math.cos(angle) * away
    const size = SCALE * (PRESSED_SCALE + (1 - PRESSED_SCALE) * air)
    const pose = `rotate(${angle}rad) scale(${size * (1 + SQUASH_WIDE * squash.x)}, ${size * (1 - SQUASH_TALL * squash.x)})`
    rig.style.transform = `translate(${left}px, ${top}px) ${pose}`
    const cast = `translate(${left + CAST_X * air}px, ${top + CAST_Y * air}px) ${pose}`
    far.style.transform = cast
    near.style.transform = cast
    const seen = Math.max(shown.x, 0)
    far.style.opacity = String(FAR_SHADOW * Math.min(air, 1) * seen)
    near.style.opacity = String(NEAR_SHADOW * Math.max(1 - air, 0) * seen)
    element.classList.toggle('on', shown.x > 0.004 || marks.childElementCount > 0)
    pen.flush()
  }

  connectLoop(draw, () => {})

  const enter = (): void => {
    measure()
    if (shown.t === 0 && shown.x < 0.02) foot.set(footAt())
    shown.to(1, ENTER)
  }

  const press = (down: boolean): void => {
    if (down === pressed) return
    pressed = down
    if (down) {
      pen.begin(x + scrollX, y + scrollY, movedAt)
      if (!striking) {
        striking = true
        lift.to(STRIKE_TARGET, STRIKE)
      }
    } else {
      pen.end()
      if (!striking) rise()
    }
  }

  const hide = (): void => {
    press(false)
    shown.to(0, LEAVE)
  }

  const remeasure = (): void => {
    measure()
    wake()
  }
  addEventListener('resize', remeasure)
  onZoom(remeasure)

  return {
    element,
    ink: pen.element,
    setActive(on) {
      active = on
      pen.show(on)
      if (on && inside) enter()
      if (!on) hide()
    },
    move(nextX, nextY, held, time) {
      x = nextX
      y = nextY
      movedAt = time
      inside = true
      if (!active) return
      if (shown.t !== 1) enter()
      if (pressed && !held) press(false)
      if (pressed) pen.extend(x + scrollX, y + scrollY, time)
      foot.to(footAt())
    },
    leave() {
      inside = false
      if (active) hide()
    },
    press,
    erase: pen.erase,
    withdraw() {
      inside = false
      pressed = false
      striking = false
      pen.end()
      shown.set(0)
      lift.set(1)
      element.classList.remove('on')
      draw()
    }
  }
}

