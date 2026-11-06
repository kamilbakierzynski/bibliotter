/*
 * Jedna zasada ruchu: krawędź prowadząca ciągnie, a reszta podąża z opóźnieniem.
 * Wszystko jest sprężyną przerywalną, więc zmiana zdania w połowie ruchu zachowuje prędkość.
 * Stan klatki trafia do DOM przez style, z pominięciem Reacta.
 */

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))
export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t

export interface Body {
  step(dt: number): void
  snap(): void
  readonly rest: boolean
  /** Ciało zatrzymane czeka, aż arkusze przejdą na zrzuty. */
  held?: boolean
}

export interface SpringOptions {
  k?: number
  z?: number
  v?: number
}

const STEP = 1 / 240
const MAX_GAP_MS = 64

const bodies = new Set<Body>()
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
let raf = 0
let lastTime = 0
let followUntil = 0
let follow: (() => void) | null = null
let onFrame: () => void = () => {}
let onSettle: () => void = () => {}

export function addBody(body: Body): void {
  bodies.add(body)
}

export function wake(): void {
  if (!raf) raf = requestAnimationFrame(tick)
}

/** Podpina rysowanie klatki i zakończenie ruchu. */
export function connectLoop(frame: () => void, settle: () => void): void {
  onFrame = frame
  onSettle = settle
}

/** Przez chwilę woła funkcję co klatkę, np. gdy układ zależy od animacji CSS. */
export function followFor(ms: number, fn: () => void): void {
  followUntil = performance.now() + ms
  follow = fn
  wake()
}

function tick(now: number): void {
  raf = 0
  const gap = now - lastTime
  lastTime = now
  if (reduced) {
    for (const body of bodies) if (!body.held) body.snap()
  } else {
    const dt = gap > MAX_GAP_MS ? 1 / 60 : gap / 1000
    for (let t = 0; t < dt; t += STEP) {
      for (const body of bodies) if (!body.held) body.step(STEP)
    }
  }
  if (now < followUntil && follow) follow()
  onFrame()
  let moving = now < followUntil
  if (!moving) {
    for (const body of bodies) {
      if (body.held || !body.rest) {
        moving = true
        break
      }
    }
  }
  if (moving) {
    wake()
    return
  }
  for (const body of bodies) body.snap()
  onFrame()
  onSettle()
}

export class Spring implements Body {
  x: number
  t: number
  v = 0
  k: number
  z: number
  held = false

  constructor(x = 0, k = 180, z = 0.82) {
    this.x = x
    this.t = x
    this.k = k
    this.z = z
    addBody(this)
  }

  to(target: number, options: SpringOptions = {}): this {
    if (options.k) this.k = options.k
    if (options.z) this.z = options.z
    if (options.v !== undefined) this.v = options.v
    this.t = target
    wake()
    return this
  }

  set(value: number): this {
    this.x = value
    this.t = value
    this.v = 0
    wake()
    return this
  }

  step(h: number): void {
    const damping = 2 * this.z * Math.sqrt(this.k)
    this.v += (this.k * (this.t - this.x) - damping * this.v) * h
    this.x += this.v * h
  }

  snap(): void {
    this.x = this.t
    this.v = 0
  }

  get rest(): boolean {
    return Math.abs(this.t - this.x) < 0.002 && Math.abs(this.v) < 0.02
  }
}

/** Prawdziwa krzywa sprężyny dla przejść CSS. */
export function springCurve(k: number, z: number, seconds = 1): string {
  let x = 0
  let v = 0
  const damping = 2 * z * Math.sqrt(k)
  const dt = 1 / 240
  const steps = Math.round(seconds / dt)
  const every = Math.round(steps / 56)
  const points: number[] = []
  for (let i = 0; i <= steps; i++) {
    if (i % every === 0) points.push(Number(x.toFixed(4)))
    v += (k * (1 - x) - damping * v) * dt
    x += v * dt
  }
  points[points.length - 1] = 1
  return `linear(${points.join(',')})`
}
