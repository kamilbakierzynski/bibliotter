import { Spring } from './spring'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface PillOptions {
  fast?: number
  slow?: number
  z?: number
}

const pills = new Set<Pill>()

export function renderPills(): void {
  for (const pill of pills) pill.render()
}

/** Pozycja elementu względem pojemnika, razem z jego przewinięciem. */
export function rectIn(element: Element, box: Element): Box {
  const a = element.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  return { x: a.left - b.left + box.scrollLeft, y: a.top - b.top + box.scrollTop, w: a.width, h: a.height }
}

/** Znacznik wyboru: krawędź w stronę ruchu jest szybka, tylna wolna, więc w ruchu się rozciąga. */
export class Pill {
  el: HTMLElement | null = null
  private readonly fast: number
  private readonly slow: number
  private readonly z: number
  private readonly a = new Spring(0)
  private readonly b = new Spring(0)
  private c0 = 0
  private c1 = 0
  on = false
  /** Do użycia jako `ref` elementu znacznika. */
  readonly bind = (el: HTMLElement | null): void => {
    this.el = el
  }

  constructor(
    private readonly axis: 'x' | 'y' = 'y',
    options: PillOptions = {}
  ) {
    this.fast = options.fast ?? 640
    this.slow = options.slow ?? 250
    this.z = options.z ?? 0.86
    pills.add(this)
  }

  to(box: Box, instant = false): void {
    const [a, b, c0, c1] =
      this.axis === 'y' ? [box.y, box.y + box.h, box.x, box.w] : [box.x, box.x + box.w, box.y, box.h]
    this.c0 = c0
    this.c1 = c1
    if (this.el) this.el.style.opacity = '1'
    if (instant || !this.on) {
      this.a.set(a)
      this.b.set(b)
      this.on = true
      return
    }
    const forward = a + b > this.a.t + this.b.t
    this.a.to(a, { k: forward ? this.slow : this.fast, z: this.z })
    this.b.to(b, { k: forward ? this.fast : this.slow, z: this.z })
  }

  hide(): void {
    this.on = false
    if (this.el) this.el.style.opacity = '0'
  }

  render(): void {
    if (!this.el) return
    const a = this.a.x
    const b = Math.max(a, this.b.x)
    const style = this.el.style
    if (this.axis === 'y') {
      style.transform = `translate(${this.c0}px,${a}px)`
      style.width = `${this.c1}px`
      style.height = `${b - a}px`
    } else {
      style.transform = `translate(${a}px,${this.c0}px)`
      style.width = `${b - a}px`
      style.height = `${this.c1}px`
    }
  }
}
