import { addBody, type Body, clamp, lerp, Spring, wake } from './spring'

interface RopeGeometry {
  base: number
  top: number
  bottom: number
  r: number
}

/** Krawędź jak lina: najbliższy punkt rusza pierwszy, dalsze podążają, a sąsiedzi wygładzają kształt. */
export class Rope implements Body {
  readonly n = 17
  readonly xs = new Float64Array(this.n)
  readonly vs = new Float64Array(this.n)
  path: SVGPathElement | null = null
  target = 0
  pull = 0.05
  k = 235
  z = 0.64
  couple = 1300
  readonly bump = new Spring(0, 340, 0.62)
  bumpY = 0
  T = 0
  B = 1

  constructor(
    private readonly side: 'left' | 'right',
    private readonly geometry: () => RopeGeometry
  ) {
    addBody(this)
  }

  place(x: number): void {
    this.xs.fill(x)
    this.vs.fill(0)
    this.target = x
  }

  setPull(y: number): void {
    const { top, bottom } = this.geometry()
    this.pull = clamp((y - top) / (bottom - top))
  }

  to(x: number, pullY?: number): void {
    if (pullY !== undefined) this.setPull(pullY)
    this.target = x
    wake()
  }

  step(h: number): void {
    const { n, xs, vs, target, pull, k, z, couple } = this
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i / (n - 1) - pull)
      const stiffness = k * (1 - 0.64 * d)
      const damping = 2 * (z + 0.1 * d) * Math.sqrt(stiffness)
      const x = xs[i] ?? 0
      const lap = (i ? (xs[i - 1] ?? x) : x) + (i < n - 1 ? (xs[i + 1] ?? x) : x) - 2 * x
      vs[i] = (vs[i] ?? 0) + (stiffness * (target - x) - damping * (vs[i] ?? 0) + couple * lap) * h
    }
    for (let i = 0; i < n; i++) xs[i] = (xs[i] ?? 0) + (vs[i] ?? 0) * h
  }

  snap(): void {
    this.xs.fill(this.target)
    this.vs.fill(0)
  }

  get rest(): boolean {
    for (let i = 0; i < this.n; i++) {
      if (Math.abs((this.xs[i] ?? 0) - this.target) > 0.08 || Math.abs(this.vs[i] ?? 0) > 0.6) return false
    }
    return true
  }

  get mean(): number {
    return ((this.xs[0] ?? 0) + (this.xs[this.n - 1] ?? 0)) / 2
  }

  /** Najdalej wysunięty punkt krawędzi. Dopóki sięga arkusza, arkusz musi być zrzutem. */
  get reach(): number {
    let max = -Infinity
    for (let i = 0; i < this.n; i++) max = Math.max(max, this.xs[i] ?? 0)
    return max
  }

  get least(): number {
    let min = Infinity
    for (let i = 0; i < this.n; i++) min = Math.min(min, this.xs[i] ?? 0)
    return min
  }

  edgeAt(y: number): number {
    const u = clamp((y - this.T) / Math.max(1, this.B - this.T)) * (this.n - 1)
    const i = Math.floor(u)
    const j = Math.min(i + 1, this.n - 1)
    return lerp(this.xs[i] ?? 0, this.xs[j] ?? 0, u - i)
  }

  render(): void {
    if (!this.path) return
    const { base, top, bottom, r } = this.geometry()
    const s = this.side === 'right' ? 1 : -1
    const n = this.n
    const f = (v: number): string => v.toFixed(2)
    const K = 0.42
    const R = Math.min(r, Math.abs(this.mean - base) / 2)
    const T = top + R
    const B = bottom - R
    this.T = T
    this.B = B
    const points: [number, number][] = []
    for (let i = 0; i < n; i++) {
      const y = T + ((B - T) * i) / (n - 1)
      const dy = (y - this.bumpY) / 62
      points.push([(this.xs[i] ?? 0) + s * this.bump.x * Math.exp(-dy * dy), y])
    }
    const a = points[0] as [number, number]
    const z = points[n - 1] as [number, number]
    let d = `M${f(base + s * R)} ${f(top)}L${f(a[0] - s * R)} ${f(top)}C${f(a[0] - s * R * K)} ${f(top)} ${f(a[0])} ${f(top + R * K)} ${f(a[0])} ${f(T)}`
    for (let i = 0; i < n - 1; i++) {
      const p1 = points[i] as [number, number]
      const p0 = points[i - 1] ?? p1
      const p2 = points[i + 1] as [number, number]
      const p3 = points[i + 2] ?? p2
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
    }
    d += `C${f(z[0])} ${f(bottom - R * K)} ${f(z[0] - s * R * K)} ${f(bottom)} ${f(z[0] - s * R)} ${f(bottom)}L${f(base + s * R)} ${f(bottom)}C${f(base + s * R * K)} ${f(bottom)} ${f(base)} ${f(bottom - R * K)} ${f(base)} ${f(B)}L${f(base)} ${f(T)}C${f(base)} ${f(top + R * K)} ${f(base + s * R * K)} ${f(top)} ${f(base + s * R)} ${f(top)}Z`
    this.path.setAttribute('d', d)
    this.path.style.opacity = String(clamp(Math.abs(this.mean - base) / 10))
  }
}
