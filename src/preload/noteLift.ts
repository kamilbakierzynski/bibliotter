import { clamp, connectLoop, Spring, wake } from '../renderer/src/motion/spring'

/*
 * Komentarz i karteczkę można przenieść: przeciągnąć albo odkleić przyciskiem w wątku i kliknąć
 * nowe miejsce. Karteczka odkleja się jak prawdziwa. Klej jest u góry, więc pierwszy odchodzi
 * dolny róg, a potem cała kartka unosi się nad stronę i kołysze za ręką. Przy przyklejaniu
 * pierwsza dotyka górna krawędź, a dół dociska się chwilę później. Pinezka unosi się, przechyla
 * i wbija z małym odbiciem. Ten sam ruch przykleja uwagę przy pierwszym postawieniu.
 *
 * Wszystko to sprężyny, więc ruch można przerwać w dowolnej chwili. Znacznik należy wtedy do tego
 * modułu, a warstwa przestaje go układać, dopóki uwaga znowu nie leży płasko.
 */

export type Movable = 'comment' | 'sticky'

export interface Point {
  x: number
  y: number
}

export interface LiftHost {
  /** Znacznik uwagi w warstwie. Przerysowanie warstwy potrafi go podmienić w trakcie ruchu. */
  node(id: string): HTMLElement | undefined
  /** Rodzaj uwagi, którą można przenieść, albo `null`. */
  kind(id: string): Movable | null
  /** Punkt kotwicy w układzie okna strony albo `null`, gdy tego miejsca nie ma w tej wersji. */
  anchorAt(id: string): Point | null
  /** Odwrotność powiększenia kamery, o którą znaczniki skalują się, żeby zostać w swoim rozmiarze. */
  unzoom(): number
  /** Pokazuje element, na który uwaga spadnie. `null` chowa obrys. */
  outline(at: Point | null): void
  /** Uwaga spadła w punkcie. Warstwa liczy z niego kotwicę i zapisuje ją. */
  drop(id: string, at: Point): void
  /** Uwaga wisi przy kursorze albo już leży (`null`). */
  carrying(id: string | null): void
  /** Klatka ruchu. Wątki na ścianie idą wtedy za znacznikiem. */
  painted(): void
  /** Uwaga leży płasko, więc warstwa znowu ją układa. */
  released(): void
  /** Wysokość doku nad dołem widoku, w pikselach strony. */
  foot: number
}

export interface NoteLift {
  /** Wciśnięcie na znaczniku. Przeniesienie zaczyna się dopiero po kilku pikselach ruchu. */
  press(id: string, event: PointerEvent): void
  move(x: number, y: number, held: boolean): void
  /** Puszczenie przycisku. Zwraca `true`, gdy kończy przeciągnięcie, a nie kliknięcie. */
  release(x: number, y: number): boolean
  /** Odkleja uwagę, która potem idzie za kursorem. `null` odkłada ją na miejsce. */
  carry(id: string | null): void
  /** Kliknięcie przy uwadze niesionej za kursorem. */
  place(x: number, y: number): void
  /** Uwaga wraca tam, skąd ją wzięto. */
  cancel(): void
  /**
   * Nowa uwaga przykleja się na swoim miejscu. `held` znaczy, że karteczka już tam wisiała uniesiona
   * jako szkic powłoki, płasko i bez zawiniętego rogu, więc nie wyłania się od zera, tylko od razu siada.
   */
  arrive(id: string, held?: boolean): void
  /** Uwaga zmieniła miejsce poza tym dokumentem, np. po cofnięciu, więc przelatuje z punktu `from`. */
  relocate(id: string, from: Point): void
  /** Zapomina uwagi, których warstwa już nie pokazuje. */
  keep(ids: Set<string>): void
  paint(): void
  owns(id: string): boolean
  /** Uwaga jest w ręce: przeciągana albo niesiona za kursorem. */
  readonly busy: boolean
  readonly carried: boolean
  /** Kliknięcie tuż po przeciągnięciu nie otwiera wątku. */
  swallowsClick(): boolean
}

type Phase = 'held' | 'carried' | 'flying' | 'settling'

interface Lift {
  id: string
  kind: Movable
  phase: Phase
  /** Punkt kotwicy w układzie okna strony. */
  x: Spring
  y: Spring
  /** 0 to uwaga płasko na stronie, 1 to uniesiona nad nią. Ujemna wartość dociska ją do strony. */
  rise: Spring
  /** Uniesienie dolnego rogu karteczki. */
  peel: Spring
  /** Kołysanie za ręką, w stopniach. */
  sway: Spring
  seen: Spring
  /** Gdzie ręka trzyma uwagę względem punktu kotwicy, w pikselach strony. */
  grip: Point
  /** Środek obrotu i skali w pikselach znacznika, liczony od jego punktu zaczepienia. */
  pivot: Point
  pointerId: number | null
  node: HTMLElement | null
  /** Przed tą chwilą nowa uwaga wisi jeszcze nad stroną. */
  hold: number
}

/** Tyle pikseli trzeba przeciągnąć, żeby kliknięcie w znacznik stało się przeniesieniem. */
const SLOP = 4
const RISE_UP = { k: 260, z: 0.62 }
const STICKY_DOWN = { k: 380, z: 0.52 }
const PIN_DOWN = { k: 560, z: 0.42 }
/** Róg odskakuje prawie do końca, a potem karteczka zwisa w ręce do połowy. */
const PEEL_UP = { k: 300, z: 0.42, v: 16 }
/** Dół dociska się wolniej niż spada góra, więc krawędź z klejem dotyka strony pierwsza. */
const PEEL_DOWN = { k: 140, z: 0.72 }
const SWAY = { k: 150, z: 0.58 }
const FOLLOW = { k: 420, z: 0.84 }
const GLIDE = { k: 170, z: 0.78 }
const SEEN = { k: 420, z: 1 }
const HELD_PEEL = 0.55
const STICKY_GROW = 0.045
/** Pinezka pod kursorem jest już powiększona przez `:hover`, więc sama rośnie mniej. */
const PIN_GROW = 0.14
const PIN_TILT = 9
const PEEL_X = 22
const PEEL_Y = 7
const PERSPECTIVE = 360
/** Bok zawiniętego rogu karteczki przy pełnym odklejeniu, w pikselach znacznika. */
const CURL = 30
const SWAY_PER_PX = 0.35
const MAX_SWAY = 8
const SWAY_REST_MS = 80
/** Uwaga w locie siada, gdy jest tak blisko swojego miejsca. */
const LAND_REACH = 24
const ARRIVE_HOLD_MS = 110
/** Ile trwa ochrona przed kliknięciem, które przychodzi zaraz po puszczeniu przycisku. */
const SWALLOW_MS = 350
const EDGE = 44
const EDGE_SPEED = 18
/** Karteczkę bez chwytu trzyma się za środek górnej krawędzi, a pinezkę za główkę. */
const STICKY_HOLD: Point = { x: 74, y: 6 }
const PIN_HOLD: Point = { x: 11, y: -12 }

/** Przy ograniczonym ruchu sprężyny przeskakują do celu, więc uwaga nie ma po co wisieć nad stroną. */
const still = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

const pool: Spring[] = []

function take(value: number): Spring {
  const spring = pool.pop() ?? new Spring(value)
  spring.set(value)
  return spring
}

const springsOf = (lift: Lift): Spring[] => [lift.x, lift.y, lift.rise, lift.peel, lift.sway, lift.seen]

const clearStyle = (node: HTMLElement): void => {
  node.classList.remove('lifted', 'held', 'carried')
  node.style.transform = ''
  node.style.filter = ''
  node.style.opacity = ''
  node.style.removeProperty('--peel')
  node.style.removeProperty('--curl')
}

export function createNoteLift(host: LiftHost): NoteLift {
  const lifts = new Map<string, Lift>()
  let pending: { id: string; pointerId: number; x: number; y: number } | null = null
  let pointer: Point | null = null
  let lastX = 0
  let swayTimer = 0
  let swallowUntil = 0
  let scrollFrame = 0

  const inHand = (): Lift | undefined => {
    for (const lift of lifts.values()) if (lift.phase === 'held' || lift.phase === 'carried') return lift
    return undefined
  }

  const lift = (id: string, kind: Movable, phase: Phase, at: Point, grip: Point, pivot: Point): Lift => {
    const known = lifts.get(id)
    if (known) {
      // Uwaga jeszcze siada po poprzednim ruchu, więc przejmujemy ją z prędkością, jaką ma.
      Object.assign(known, { phase, grip, pivot, hold: 0 })
      return known
    }
    const fresh: Lift = {
      id,
      kind,
      phase,
      x: take(at.x),
      y: take(at.y),
      rise: take(0),
      peel: take(0),
      sway: take(0),
      seen: take(1),
      grip,
      pivot,
      pointerId: null,
      node: null,
      hold: 0
    }
    lifts.set(id, fresh)
    return fresh
  }

  const peelUp = (target: Lift): void => {
    target.rise.to(1, RISE_UP)
    if (target.kind === 'sticky') target.peel.to(HELD_PEEL, PEEL_UP)
  }

  const land = (target: Lift): void => {
    target.phase = 'settling'
    target.rise.to(0, target.kind === 'sticky' ? STICKY_DOWN : PIN_DOWN)
    target.peel.to(0, PEEL_DOWN)
    target.sway.to(0, SWAY)
  }

  const letGo = (target: Lift): void => {
    if (target.pointerId !== null) {
      try {
        target.node?.releasePointerCapture(target.pointerId)
      } catch {
        // Przechwycenie mogło już wygasnąć razem z podmienionym znacznikiem.
      }
    }
    target.pointerId = null
  }

  const finish = (target: Lift): void => {
    lifts.delete(target.id)
    const node = host.node(target.id)
    if (node) clearStyle(node)
    for (const spring of springsOf(target)) {
      spring.snap()
      pool.push(spring)
    }
    host.released()
  }

  const stopScroll = (): void => {
    cancelAnimationFrame(scrollFrame)
    scrollFrame = 0
  }

  /** Przy górnej i dolnej krawędzi widoku strona przewija się sama, żeby uwagę dało się przenieść daleko. */
  const edgeSpeed = (y: number): number => {
    const bottom = innerHeight - host.foot - EDGE
    if (y < EDGE) return -EDGE_SPEED * clamp((EDGE - y) / EDGE)
    if (y > bottom) return EDGE_SPEED * clamp((y - bottom) / EDGE)
    return 0
  }

  const scrollTick = (): void => {
    scrollFrame = 0
    const held = inHand()
    if (!held || held.phase !== 'held' || !pointer) return
    const speed = edgeSpeed(pointer.y)
    if (speed === 0) return
    window.scrollBy(0, speed)
    host.outline({ x: pointer.x - held.grip.x, y: pointer.y - held.grip.y })
    scrollFrame = requestAnimationFrame(scrollTick)
  }

  const draw = (target: Lift): void => {
    const node = host.node(target.id)
    if (!node) return
    if (node !== target.node) {
      target.node = node
      // Przerysowanie warstwy podmieniło znacznik w trakcie przeciągania, a mysz ma dalej trafiać do niego.
      if (target.pointerId !== null) {
        try {
          node.setPointerCapture(target.pointerId)
        } catch {
          // Przycisk puszczono, zanim nowy znacznik stanął.
        }
      }
    }
    if (target.phase === 'flying' || target.phase === 'settling') {
      const home = host.anchorAt(target.id)
      if (home) {
        if (target.x.t !== home.x || target.y.t !== home.y) {
          target.x.to(home.x, GLIDE)
          target.y.to(home.y, GLIDE)
        }
        const near = Math.hypot(target.x.x - home.x, target.y.x - home.y) < LAND_REACH
        if (target.phase === 'flying' && near && performance.now() >= target.hold) land(target)
      } else if (target.seen.t !== 0) {
        // Miejsca nie ma w tej wersji dokumentu, więc uwaga nie ma gdzie usiąść i gaśnie.
        target.seen.to(0, SEEN)
      }
    }

    const scale = host.unzoom()
    const rise = target.rise.x
    const up = Math.max(rise, 0)
    const peel = Math.max(target.peel.x, 0)
    const px = target.pivot.x / scale
    const py = target.pivot.y / scale
    const around = (inner: string): string => `translate(${px}px, ${py}px) ${inner} translate(${-px}px, ${-py}px)`
    node.classList.remove('hidden')
    node.classList.add('lifted')
    node.classList.toggle('held', target.phase === 'held')
    node.classList.toggle('carried', target.phase === 'carried')
    node.style.translate = `${(target.x.x + scrollX).toFixed(1)}px ${(target.y.x + scrollY).toFixed(1)}px`
    if (target.kind === 'sticky') {
      const half = node.offsetWidth / 2
      node.style.transform =
        around(`rotate(${target.sway.x.toFixed(2)}deg) scale(${(1 + STICKY_GROW * rise).toFixed(4)})`) +
        ` translateX(${half}px) perspective(${PERSPECTIVE}px) rotateX(${(PEEL_X * peel).toFixed(2)}deg)` +
        ` rotateY(${(-PEEL_Y * peel).toFixed(2)}deg) translateX(${-half}px)`
      node.style.setProperty('--peel', peel.toFixed(3))
      node.style.setProperty('--curl', `${(CURL * peel).toFixed(1)}px`)
      node.style.filter =
        up > 0.005 ? `drop-shadow(0 ${(2 + 12 * up).toFixed(1)}px ${(3 + 12 * up).toFixed(1)}px rgb(0 0 0 / ${(0.2 * up).toFixed(3)}))` : ''
    } else {
      node.style.transform = around(
        `rotate(${(target.sway.x + PIN_TILT * up).toFixed(2)}deg) scale(${(1 + PIN_GROW * rise).toFixed(4)})`
      )
      node.style.filter =
        up > 0.005 ? `drop-shadow(0 ${(1 + 7 * up).toFixed(1)}px ${(2 + 6 * up).toFixed(1)}px rgb(0 0 0 / ${(0.22 * up).toFixed(3)}))` : ''
    }
    node.style.opacity = target.seen.x < 0.999 ? clamp(target.seen.x).toFixed(3) : ''

    const quiet = springsOf(target).every((spring) => spring.rest)
    if (target.phase === 'settling' && quiet) finish(target)
    else if (target.phase === 'flying' && !host.anchorAt(target.id) && target.seen.x < 0.01) finish(target)
  }

  const paint = (): void => {
    for (const target of lifts.values()) draw(target)
  }

  connectLoop(
    () => {
      if (lifts.size === 0) return
      paint()
      host.painted()
    },
    () => {}
  )

  const begin = (press: NonNullable<typeof pending>): void => {
    pending = null
    const kind = host.kind(press.id)
    const at = host.anchorAt(press.id)
    if (!kind || !at) return
    const grip = { x: press.x - at.x, y: press.y - at.y }
    const scale = host.unzoom()
    const held = lift(press.id, kind, 'held', at, grip, { x: grip.x / scale, y: grip.y / scale })
    held.pointerId = press.pointerId
    peelUp(held)
    try {
      host.node(press.id)?.setPointerCapture(press.pointerId)
    } catch {
      // Bez przechwycenia mysz i tak idzie przez nasłuch na oknie.
    }
    host.outline(at)
  }

  const relax = (target: Lift): void => {
    clearTimeout(swayTimer)
    swayTimer = window.setTimeout(() => {
      if (target.phase === 'held' || target.phase === 'carried') target.sway.to(0, SWAY)
    }, SWAY_REST_MS)
  }

  const putBack = (target: Lift): void => {
    letGo(target)
    const wasCarried = target.phase === 'carried'
    target.phase = 'flying'
    target.hold = 0
    stopScroll()
    host.outline(null)
    if (wasCarried) host.carrying(null)
    wake()
  }

  const release = (x: number, y: number): boolean => {
    if (pending) {
      pending = null
      return false
    }
    const target = inHand()
    if (!target || target.phase !== 'held') return false
    letGo(target)
    stopScroll()
    host.outline(null)
    target.phase = 'flying'
    target.hold = 0
    swallowUntil = performance.now() + SWALLOW_MS
    host.drop(target.id, { x: x - target.grip.x, y: y - target.grip.y })
    wake()
    return true
  }

  const move = (x: number, y: number, held: boolean): void => {
    const step = x - lastX
    lastX = x
    pointer = { x, y }
    if (pending) {
      if (!held) pending = null
      else if (Math.hypot(x - pending.x, y - pending.y) > SLOP) begin(pending)
    }
    const target = inHand()
    if (!target) return
    // Puszczenie przycisku mogło nie dojść do dokumentu, np. poza oknem. Uwaga siada tam, gdzie jest.
    if (target.phase === 'held' && !held) {
      release(x, y)
      return
    }
    const at = { x: x - target.grip.x, y: y - target.grip.y }
    if (target.phase === 'held') {
      target.x.set(at.x)
      target.y.set(at.y)
      if (!scrollFrame && edgeSpeed(y) !== 0) scrollFrame = requestAnimationFrame(scrollTick)
    } else if (target.seen.t === 0) {
      // Uwaga bez miejsca w tej wersji pojawia się dopiero przy kursorze.
      target.x.set(at.x)
      target.y.set(at.y)
      target.seen.to(1, SEEN)
    } else {
      target.x.to(at.x, FOLLOW)
      target.y.to(at.y, FOLLOW)
    }
    target.sway.to(clamp(step * SWAY_PER_PX, -MAX_SWAY, MAX_SWAY), SWAY)
    relax(target)
    host.outline(at)
  }

  return {
    press(id, event) {
      if (inHand()) return
      pending = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    },

    move,
    release,

    carry(id) {
      const current = inHand()
      if (current && current.id !== id) putBack(current)
      if (id === null) return
      const kind = host.kind(id)
      if (!kind) {
        host.carrying(null)
        return
      }
      const at = host.anchorAt(id)
      // Kursor wskazuje róg karteczki i czubek pinezki, jak przy stawianiu nowej uwagi.
      const carried = lift(id, kind, 'carried', at ?? pointer ?? { x: innerWidth / 2, y: innerHeight / 2 }, { x: 0, y: 0 }, { x: 0, y: 0 })
      if (!at) carried.seen.set(0)
      peelUp(carried)
      host.carrying(id)
      if (pointer) move(pointer.x, pointer.y, false)
    },

    place(x, y) {
      const target = inHand()
      if (!target || target.phase !== 'carried') return
      target.phase = 'flying'
      target.hold = 0
      if (target.seen.t === 0) {
        target.x.set(x)
        target.y.set(y)
        target.seen.to(1, SEEN)
      }
      host.outline(null)
      host.carrying(null)
      host.drop(target.id, { x, y })
      wake()
    },

    cancel() {
      pending = null
      const target = inHand()
      if (target) putBack(target)
    },

    arrive(id, held = false) {
      if (still()) return
      const kind = host.kind(id)
      const at = host.anchorAt(id)
      if (!kind || !at || lifts.has(id) || !host.node(id)) return
      const fresh = lift(id, kind, 'flying', at, { x: 0, y: 0 }, kind === 'sticky' ? STICKY_HOLD : PIN_HOLD)
      fresh.rise.set(1)
      if (!held) {
        if (kind === 'sticky') fresh.peel.set(HELD_PEEL)
        fresh.seen.set(0).to(1, SEEN)
      }
      fresh.hold = performance.now() + ARRIVE_HOLD_MS
      // Gdy nic innego się nie rusza, pętla mogłaby zasnąć, zanim uwaga zacznie siadać.
      window.setTimeout(wake, ARRIVE_HOLD_MS + 16)
    },

    relocate(id, from) {
      if (still()) return
      const kind = host.kind(id)
      const at = host.anchorAt(id)
      if (!kind || !at || lifts.has(id) || !host.node(id) || Math.hypot(at.x - from.x, at.y - from.y) < 2) return
      const moved = lift(id, kind, 'flying', from, { x: 0, y: 0 }, kind === 'sticky' ? STICKY_HOLD : PIN_HOLD)
      peelUp(moved)
    },

    keep(ids) {
      if (pending && !ids.has(pending.id)) pending = null
      for (const target of [...lifts.values()]) {
        if (ids.has(target.id)) continue
        if (target.phase === 'carried') host.carrying(null)
        if (target.phase === 'held' || target.phase === 'carried') {
          stopScroll()
          host.outline(null)
        }
        // Znacznika już nie ma, więc wystarczy oddać sprężyny.
        lifts.delete(target.id)
        for (const spring of springsOf(target)) {
          spring.snap()
          pool.push(spring)
        }
      }
    },

    paint,
    owns: (id) => lifts.has(id),
    get busy() {
      return pending !== null || inHand() !== undefined
    },
    get carried() {
      return inHand()?.phase === 'carried'
    },
    swallowsClick: () => performance.now() < swallowUntil
  }
}
