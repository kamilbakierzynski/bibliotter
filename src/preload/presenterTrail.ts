/*
 * Geometria linii rysowanej palcem. Linia to wypełniona wstęga, a nie kreska o stałej grubości:
 * cienieje przy szybkim ruchu i zwęża się na końcach, jak pociągnięcie pisakiem. Punkty myszy
 * niosą drżenie ręki i schodki pikseli, więc wygładzanie ma dwa etapy. Stabilizacja idzie za
 * palcem i nie może zostawać w tyle, a ułożenie poprawia punkty już narysowane, w obie strony.
 */

/** Krótsze kroki myszy tylko postrzępiłyby linię. */
const MIN_STEP = 2
/** Przy spokojnym ruchu linia odcina wszystko powyżej tej częstotliwości, czyli drżenie i schodki. */
const CALM_CUTOFF_HZ = 1.6
/** O tyle herców na każdy piksel na sekundę filtr luzuje, żeby szybkie łuki nie traciły kształtu. */
const CUTOFF_PER_SPEED = 0.012
/** Sama prędkość też drga, a od niej zależy siła filtra i grubość linii. */
const SPEED_CUTOFF_HZ = 4
/** Na tyle pikseli drogi w każdą stronę sięga ułożenie linii. Dobrane na symulacji drżącej myszy. */
const SETTLE_REACH = 32
/** Grubość linii przy spokojnym ruchu. */
const NIB = 6.5
/** Przy takiej prędkości w pikselach na milisekundę linia jest najcieńsza i traci tyle grubości. */
const FAST_SPEED = 2.4
const THINNING = 0.38
/** Na takiej drodze grubość dochodzi do celu, bo mysz podaje prędkość skokami. */
const WIDTH_SETTLE = 24
const TAPER_IN = 14
const TAPER_OUT = 36
/** Najcieńszy koniec linii jako ułamek pełnej grubości. */
const THIN_END = 0.2
/** Długość jasnego klina przy palcu. */
const COMET = 70
/** Tyle punktów w każdą stronę wyznacza kierunek linii, bo pojedyncze drgają. */
const TANGENT_REACH = 2
/** Zakręt mierzy się na tylu krokach w każdą stronę. */
const TURN_REACH = 3
/** Przy zakręcie ostrzejszym niż ten cosinus wspólna wstęga by się zapadła, więc linia się tam dzieli. */
const SHARP_TURN = 0.4

interface Point {
  x: number
  y: number
}

interface Sample extends Point {
  width: number
  distance: number
}

const round = (value: number): number => Math.round(value * 10) / 10
/** Dla indeksów, które wynikają z długości listy. */
const at = <T>(list: T[], index: number): T => list[index] as T
const midpoint = (a: Point, b: Point): string => `${round((a.x + b.x) / 2)} ${round((a.y + b.y) / 2)}`

/** Ile nowej wartości wchodzi do filtra dolnoprzepustowego po `ms` milisekundach. */
const blend = (cutoffHz: number, ms: number): number => ms / (ms + 1000 / (2 * Math.PI * cutoffHz))

/**
 * Filtr 1€: im wolniej idzie ręka, tym mocniej wygładza. Przy wolnym ruchu widać drżenie,
 * a opóźnienia nie, przy szybkim odwrotnie. Opóźnienie nie przekracza kilkunastu pikseli.
 */
class Steady {
  x: number
  y: number
  /** W pikselach na milisekundę. */
  speed = 0
  private rawX: number
  private rawY: number

  constructor(
    x: number,
    y: number,
    private time: number
  ) {
    this.x = this.rawX = x
    this.y = this.rawY = y
  }

  follow(x: number, y: number, time: number): void {
    const ms = Math.max(time - this.time, 1)
    const moved = Math.hypot(x - this.rawX, y - this.rawY) / ms
    this.speed += (moved - this.speed) * blend(SPEED_CUTOFF_HZ, ms)
    const pull = blend(CALM_CUTOFF_HZ + CUTOFF_PER_SPEED * this.speed * 1000, ms)
    this.x += (x - this.x) * pull
    this.y += (y - this.y) * pull
    this.rawX = x
    this.rawY = y
    this.time = time
  }
}

/** Zwężenie na odcinku końcowym: `progress` 0 to sam koniec, 1 to pełna grubość. */
function narrowing(progress: number): number {
  const eased = Math.min(Math.max(progress, 0), 1)
  return THIN_END + (1 - THIN_END) * eased * (2 - eased)
}

/** Cosinus zakrętu w punkcie: 1 to prosta, -1 to zawrót w miejscu. */
function bend(samples: Sample[], index: number): number {
  const before = at(samples, Math.max(index - TURN_REACH, 0))
  const here = at(samples, index)
  const after = at(samples, Math.min(index + TURN_REACH, samples.length - 1))
  const inX = here.x - before.x
  const inY = here.y - before.y
  const outX = after.x - here.x
  const outY = after.y - here.y
  const span = Math.hypot(inX, inY) * Math.hypot(outX, outY)
  return span > 0 ? (inX * outX + inY * outY) / span : 1
}

/** Dzieli linię w wierzchołkach ostrych zakrętów. */
function legs(samples: Sample[]): Sample[][] {
  const parts: Sample[][] = []
  let start = 0
  for (let index = 1; index < samples.length - 1; index++) {
    const here = bend(samples, index)
    if (here >= SHARP_TURN || here > bend(samples, index - 1) || here >= bend(samples, index + 1)) continue
    parts.push(samples.slice(start, index + 1))
    start = index
  }
  parts.push(samples.slice(start))
  return parts
}

/** Waga, która tnie drgania, a nie zgniata łuków: ujemne brzegi znoszą ściąganie do środka. */
function settleWeight(offset: number): number {
  const square = offset * offset
  return 3 - 10 * square + 7 * square * square
}

/** Układa odcinek w obie strony, więc nie dodaje opóźnienia. Okno kurczy się ku końcom, które stoją. */
function settle(samples: Sample[]): Sample[] {
  const start = at(samples, 0).distance
  const end = at(samples, samples.length - 1).distance
  return samples.map((sample, index) => {
    const reach = Math.min(SETTLE_REACH, sample.distance - start, end - sample.distance)
    if (reach <= 0) return sample
    let first = index
    while (first > 0 && sample.distance - at(samples, first - 1).distance < reach) first--
    let x = 0
    let y = 0
    let total = 0
    for (let other = first; other < samples.length; other++) {
      const point = at(samples, other)
      const offset = (point.distance - sample.distance) / reach
      if (offset >= 1) break
      const weight = settleWeight(offset)
      x += point.x * weight
      y += point.y * weight
      total += weight
    }
    return { ...sample, x: x / total, y: y / total }
  })
}

/** Kółko ma ten sam kierunek co wstęga, więc reguła wypełnienia nie wycina nakładek. */
function dot({ x, y }: Point, radius: number): string {
  const r = round(radius)
  return `M${round(x - r)} ${round(y)}a${r} ${r} 0 1 0 ${round(r * 2)} 0a${r} ${r} 0 1 0 ${round(-r * 2)} 0Z`
}

function closedCurve(points: Point[]): string {
  let path = `M${midpoint(at(points, points.length - 1), at(points, 0))}`
  points.forEach((point, index) => {
    const next = at(points, (index + 1) % points.length)
    path += `Q${round(point.x)} ${round(point.y)} ${midpoint(point, next)}`
  })
  return `${path}Z`
}

function strip(samples: Sample[], radiusOf: (sample: Sample) => number): string {
  const left: Point[] = []
  const right: Point[] = []
  samples.forEach((sample, index) => {
    const before = at(samples, Math.max(index - TANGENT_REACH, 0))
    const after = at(samples, Math.min(index + TANGENT_REACH, samples.length - 1))
    const run = Math.hypot(after.x - before.x, after.y - before.y) || 1
    const radius = radiusOf(sample)
    const offsetX = (-(after.y - before.y) / run) * radius
    const offsetY = ((after.x - before.x) / run) * radius
    left.push({ x: sample.x + offsetX, y: sample.y + offsetY })
    right.push({ x: sample.x - offsetX, y: sample.y - offsetY })
  })
  const first = at(samples, 0)
  const last = at(samples, samples.length - 1)
  return closedCurve([...left, ...right.reverse()]) + dot(first, radiusOf(first)) + dot(last, radiusOf(last))
}

/** Ślad palca. Mysz podaje punkty łamane, więc linia idzie przez ich środki. */
export class Trail {
  private readonly samples: Sample[]
  private readonly steady: Steady
  private last: Sample
  private pointer: Point
  private finished = false
  /** Liczone raz na zmianę śladu, bo jedna klatka pyta o nie kilka razy. */
  private shape: Sample[][] | null = null

  constructor(x: number, y: number, time: number) {
    this.last = { x, y, width: 1, distance: 0 }
    this.samples = [this.last]
    this.steady = new Steady(x, y, time)
    this.pointer = { x, y }
  }

  get points(): number {
    return this.samples.length
  }

  get length(): number {
    return this.last.distance
  }

  /** Czas w milisekundach, bo krok myszy zależy od jej częstotliwości. */
  add(x: number, y: number, time: number): void {
    this.pointer = { x, y }
    this.shape = null
    this.steady.follow(x, y, time)
    this.extend(this.steady.x, this.steady.y)
  }

  /** Stabilizacja zostaje chwilę za palcem, więc koniec linii dociąga się do miejsca puszczenia. */
  finish(): void {
    this.extend(this.pointer.x, this.pointer.y)
    this.finished = true
    this.shape = null
  }

  private extend(x: number, y: number): void {
    const last = this.last
    const step = Math.hypot(x - last.x, y - last.y)
    if (step < MIN_STEP) return
    const target = 1 - Math.min(this.steady.speed / FAST_SPEED, 1) * THINNING
    const settled = 1 - Math.exp(-step / WIDTH_SETTLE)
    this.last = {
      x,
      y,
      width: last.width + (target - last.width) * settled,
      distance: last.distance + step
    }
    this.samples.push(this.last)
  }

  /** Ułożone punkty linii, dla narzędzia, które samo rysuje jej kształt. */
  get centerline(): Point[] {
    return this.shaped.flat()
  }

  /** Środek linii jako kreska, po której biegnie błysk. */
  get d(): string {
    const points = this.shaped.flat()
    const first = at(points, 0)
    const last = at(points, points.length - 1)
    let path = `M${round(first.x)} ${round(first.y)}`
    points.slice(1).forEach((point, index) => {
      const before = at(points, index)
      path += `Q${round(before.x)} ${round(before.y)} ${midpoint(before, point)}`
    })
    return `${path}L${round(last.x)} ${round(last.y)}`
  }

  /** W trakcie rysowania linia sięga palca, choć stabilizacja jest jeszcze za nim. */
  private get drawn(): Sample[] {
    if (this.finished) return this.samples
    const { x, y } = this.pointer
    const { width, distance } = this.last
    return [...this.samples, { x, y, width, distance: distance + Math.hypot(x - this.last.x, y - this.last.y) }]
  }

  /** Ostre zakręty dzielą linię przed ułożeniem, bo inaczej by się zaokrągliły. */
  private get shaped(): Sample[][] {
    this.shape ??= legs(this.drawn).map(settle)
    return this.shape
  }

  private radius(sample: Sample, scale: number): number {
    const end = this.finished ? narrowing((this.length - sample.distance) / TAPER_OUT) : 1
    return (NIB / 2) * scale * sample.width * end
  }

  /** Obrys linii. Koniec zwęża się dopiero po puszczeniu, wcześniej trzyma go palec. */
  outline(scale: number): string {
    const radiusOf = (sample: Sample): number => this.radius(sample, scale) * narrowing(sample.distance / TAPER_IN)
    return this.shaped.map((leg) => strip(leg, radiusOf)).join('')
  }

  /** Rozgrzany koniec linii: klin światła, który rośnie w stronę palca. */
  comet(scale: number): string {
    const start = this.length - COMET
    const radiusOf = (sample: Sample): number =>
      this.radius(sample, scale) * narrowing((sample.distance - start) / COMET)
    return this.shaped
      .map((leg) => leg.filter(({ distance }) => distance >= start))
      .filter((leg) => leg.length > 0)
      .map((leg) => strip(leg, radiusOf))
      .join('')
  }
}
