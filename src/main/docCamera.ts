import type { WebContents } from 'electron'
import {
  type CameraLeg,
  type CameraMove,
  type CameraPlan,
  type CameraShot,
  type CameraView,
  type CameraViewport,
  fitShot,
  MAX_CAMERA_SCALE,
  type PageRect,
  parseCameraView
} from '../shared/camera'

/*
 * Kamera po stronie procesu głównego. Skala strony nie ma API w DOM, więc ustawia ją protokół
 * DevTools (`Emulation.setPageScaleFactor`). To ten sam mechanizm, którego używa gest szczypania:
 * układ strony się nie zmienia, tekst jest rysowany od nowa w nowej skali, a kliknięcia trafiają
 * w te same elementy co bez powiększenia. Próba z 2026-11-07 opisana w `design/PRESENTATION.md`
 * odrzuciła pozostałe drogi.
 *
 * Debugger podpinamy tylko na czas powiększenia, a przy powrocie do skali 1 odpinamy.
 */

/** Dokument, który nie odpowiada, nie może zatrzymać ruchu kamery. */
const REPLY_LIMIT_MS = 1500
/** Różnica skali, poniżej której kamera nie zmienia powiększenia. */
const SAME_SCALE = 1e-3
const PROTOCOL = '1.3'

interface Measure {
  view: CameraView
  viewport: CameraViewport
  target: PageRect | null
  /** Rozmiar strony, żeby plan nie wyprowadził widoku poza jej krawędź. */
  page: { width: number; height: number } | null
}

interface Waiting {
  sender: number
  done: (value: unknown) => void
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function parseMeasure(value: unknown): Measure | null {
  if (typeof value !== 'object' || value === null) return null
  const { view, viewport, target } = value as Record<string, unknown>
  const parsedView = parseCameraView(view)
  const size = (viewport ?? {}) as Record<string, unknown>
  if (!parsedView || !finite(size.width) || !finite(size.height) || !finite(size.foot)) return null
  const box = (target ?? null) as Record<string, unknown> | null
  const parsedTarget =
    box && finite(box.x) && finite(box.y) && finite(box.width) && finite(box.height)
      ? { x: box.x, y: box.y, width: box.width, height: box.height }
      : null
  const page = (value as Record<string, unknown>).page as Record<string, unknown> | undefined
  return {
    view: parsedView,
    viewport: { width: size.width, height: size.height, foot: size.foot },
    target: parsedTarget,
    page: page && finite(page.width) && finite(page.height) ? { width: page.width, height: page.height } : null
  }
}

function parseMove(value: unknown): CameraMove | null {
  if (typeof value !== 'object' || value === null) return null
  const { from, to } = value as Record<string, unknown>
  const start = parseCameraView(from)
  const end = parseCameraView(to)
  return start && end ? { from: start, to: end } : null
}

/** Widok o danej skali z punktem w środku, przy krawędzi strony dosunięty do niej, jak przy przewinięciu. */
function viewAround(x: number, y: number, scale: number, measure: Measure): CameraView {
  const width = measure.viewport.width / scale
  const height = measure.viewport.height / scale
  const room = (size: number, seen: number): number => Math.max(0, size - seen)
  const clampTo = (value: number, size: number | undefined, seen: number): number =>
    Math.max(0, size === undefined ? value : Math.min(value, room(size, seen)))
  return {
    left: clampTo(x - width / 2, measure.page?.width, width),
    top: clampTo(y - height / 2, measure.page?.height, height),
    scale
  }
}

export class DocCamera {
  private readonly waiting = new Map<number, Waiting>()
  private nextId = 1
  /** Dokumenty, w których kamera trzyma debugger. */
  private readonly zoomed = new Set<number>()
  /** Strony, którym już podpięliśmy nasłuch odpięcia debuggera. */
  private readonly hooked = new Set<number>()

  /** Odpowiedź warstwy w dokumencie. Liczy się tylko od strony, która dostała pytanie. */
  reply(sender: WebContents, id: unknown, result: unknown): void {
    const entry = typeof id === 'number' ? this.waiting.get(id) : undefined
    if (!entry || entry.sender !== sender.id) return
    this.waiting.delete(id as number)
    entry.done(result)
  }

  private ask(contents: WebContents, command: Record<string, unknown>, limit = REPLY_LIMIT_MS): Promise<unknown> {
    const id = this.nextId++
    return new Promise((done) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        done(null)
      }, limit)
      this.waiting.set(id, {
        sender: contents.id,
        done: (value) => {
          clearTimeout(timer)
          done(value)
        }
      })
      contents.send('camera:command', { ...command, id })
    })
  }

  private async attach(contents: WebContents): Promise<boolean> {
    if (this.zoomed.has(contents.id)) return true
    try {
      if (!contents.debugger.isAttached()) contents.debugger.attach(PROTOCOL)
    } catch {
      // Debugger trzyma już ktoś inny, np. otwarte DevTools. Dokument zostaje bez powiększenia.
      return false
    }
    this.zoomed.add(contents.id)
    if (!this.hooked.has(contents.id)) {
      const id = contents.id
      this.hooked.add(id)
      // Debugger może odebrać np. otwarcie DevTools. Strona wraca wtedy do skali 1 sama.
      contents.debugger.on('detach', () => this.zoomed.delete(id))
      contents.once('destroyed', () => {
        this.hooked.delete(id)
        this.zoomed.delete(id)
      })
    }
    await contents.setVisualZoomLevelLimits(1, MAX_CAMERA_SCALE)
    return true
  }

  private async setScale(contents: WebContents, scale: number): Promise<void> {
    await contents.debugger.sendCommand('Emulation.setPageScaleFactor', { pageScaleFactor: scale })
  }

  /** Wraca do skali 1 i oddaje debugger. Strona zostaje przewinięta tam, gdzie stała. */
  async release(contents: WebContents): Promise<void> {
    if (!this.zoomed.delete(contents.id) || contents.isDestroyed()) return
    try {
      await this.setScale(contents, 1)
      await contents.setVisualZoomLevelLimits(1, 1)
      if (contents.debugger.isAttached()) contents.debugger.detach()
    } catch {
      // Strona mogła zniknąć w trakcie. Nowa i tak zaczyna bez powiększenia.
    }
  }

  /**
   * Ustawia kamerę na kadrze, a `null` wraca do całej strony. Zwraca widok przed i po zmianie,
   * żeby powłoka mogła pokazać ruch na zrzutach. `null` w wyniku znaczy, że kamera nie ruszyła.
   */
  async aim(contents: WebContents, shot: CameraShot | null): Promise<CameraMove | null> {
    const measure = parseMeasure(await this.ask(contents, { type: 'measure', shot }))
    if (!measure) return null
    const from = measure.view

    if (!shot) {
      // Strona bez powiększenia już pokazuje całość, więc nie ma dokąd jechać.
      if (!this.zoomed.has(contents.id)) return null
      await this.release(contents)
      const to = parseCameraView(await this.ask(contents, { type: 'settle' }))
      return to ? { from, to } : null
    }

    if (!measure.target) return null
    const { scale, centerX, centerY } = fitShot(measure.target, measure.viewport)
    if (scale > 1 || this.zoomed.has(contents.id)) {
      if (!(await this.attach(contents))) return null
      try {
        await this.setScale(contents, scale)
      } catch {
        await this.release(contents)
        return null
      }
    }
    const to = parseCameraView(await this.ask(contents, { type: 'center', x: centerX, y: centerY }))
    return to ? { from, to } : null
  }

  /**
   * Widok teraz i widok w kadrze, bez ruszania kamery. Powłoka sprawdza na tym, czy kadry leżą
   * blisko siebie, czy kamera musi pojechać po stronie.
   */
  async plan(contents: WebContents, shot: CameraShot): Promise<CameraPlan | null> {
    const measure = parseMeasure(await this.ask(contents, { type: 'measure', shot }))
    if (!measure?.target) return null
    const { scale, centerX, centerY } = fitShot(measure.target, measure.viewport)
    return { from: measure.view, to: viewAround(centerX, centerY, scale, measure), viewport: measure.viewport }
  }

  /**
   * Odcinek podróży między odległymi kadrami. `pose` zmienia skalę wokół punktu, a `pan` przesuwa
   * żywy widok w tej samej skali. Wynik to widok przed odcinkiem i po nim.
   */
  async steer(contents: WebContents, leg: CameraLeg): Promise<CameraMove | null> {
    if (leg.type === 'pan') {
      return parseMove(await this.ask(contents, { type: 'pan', x: leg.x, y: leg.y, ms: leg.ms }, leg.ms + REPLY_LIMIT_MS))
    }
    const measure = parseMeasure(await this.ask(contents, { type: 'measure', shot: null }))
    if (!measure) return null
    if (Math.abs(leg.scale - measure.view.scale) > SAME_SCALE && (leg.scale > 1 || this.zoomed.has(contents.id))) {
      if (!(await this.attach(contents))) return null
      try {
        await this.setScale(contents, leg.scale)
      } catch {
        await this.release(contents)
        return null
      }
    }
    const to = parseCameraView(await this.ask(contents, { type: 'center', x: leg.x, y: leg.y }))
    return to ? { from: measure.view, to } : null
  }

  /** Widok zniknął albo wczytał stronę od nowa, więc jego powiększenie przepadło. */
  forget(contents: WebContents): void {
    if (!this.zoomed.has(contents.id)) return
    void this.release(contents)
  }
}
