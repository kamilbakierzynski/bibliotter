import { ipcRenderer, type IpcRendererEvent } from 'electron'
import { boxWithin, type CameraShot, type CameraView, type CameraViewport, type PageRect } from '../shared/camera'
import { resolveAnchor, resolvePlace } from './anchor'
import { DOC_FOOT } from './overlay'

/*
 * Strona dokumentu po stronie kamery. Powiększenie ustawia proces główny, bo skala strony nie
 * ma API w DOM. Tutaj zostaje to, co wymaga dokumentu: odnalezienie kadru, ustawienie widoku
 * na jego środku i odczyt tego, co widać. Odpowiedź idzie z odizolowanego świata, więc skrypty
 * dokumentu nie widzą ani kadrów, ani kotwic.
 */

type CameraCommand =
  | { id: number; type: 'measure'; shot: CameraShot | null }
  | { id: number; type: 'center'; x: number; y: number }
  | { id: number; type: 'pan'; x: number; y: number; ms: number }
  | { id: number; type: 'settle' }

export interface CameraMeasure {
  view: CameraView
  viewport: CameraViewport
  /** Kadr na stronie albo `null`, gdy kotwicy nie ma już w dokumencie. */
  target: PageRect | null
  page: { width: number; height: number }
}

const nextFrame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()))
/** Przejazd rusza i staje łagodnie, bo zaczyna się i kończy w bezruchu kamery na zrzutach. */
const glide = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2

function view(): CameraView {
  const visual = window.visualViewport
  if (!visual) return { left: scrollX, top: scrollY, scale: 1 }
  return { left: visual.pageLeft, top: visual.pageTop, scale: visual.scale }
}

function pageRectOf(element: Element): PageRect {
  const rect = element.getBoundingClientRect()
  return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height }
}

/** Kadr bez pudełka to Miejsce, więc kamera bierze cały blok, jak ramka trasy. */
function targetOf(shot: CameraShot): PageRect | null {
  if ('rect' in shot) return shot.rect
  const element = shot.box ? resolveAnchor(shot.anchor) : resolvePlace(shot.anchor)
  return element ? boxWithin(pageRectOf(element), shot.box) : null
}

/** Pusty punkt na stronie. Przewinięcie go na środek przesuwa oba okna strony naraz. */
let mark: HTMLElement | null = null

function markAt(x: number, y: number): HTMLElement {
  if (!mark?.isConnected) {
    mark = document.createElement('bibliotter-camera')
    mark.style.cssText = 'all: initial; position: absolute; left: 0; top: 0; width: 1px; height: 1px; visibility: hidden; pointer-events: none;'
    document.documentElement.append(mark)
  }
  mark.style.left = '0px'
  mark.style.top = '0px'
  // Korzeń dokumentu może mieć margines albo własne pozycjonowanie, więc mierzymy, gdzie wypadło zero.
  const origin = pageRectOf(mark)
  mark.style.left = `${x - origin.x}px`
  mark.style.top = `${y - origin.y}px`
  return mark
}

/**
 * Przesuwa punkt w środek widoku co klatkę. Początek układu mierzymy raz, bo w trakcie przejazdu
 * układ strony stoi, a pomiar co klatkę wymuszałby jej przeliczenie.
 */
function mover(): (x: number, y: number) => void {
  const node = markAt(0, 0)
  const baseX = parseFloat(node.style.left)
  const baseY = parseFloat(node.style.top)
  return (x, y) => {
    node.style.left = `${x + baseX}px`
    node.style.top = `${y + baseY}px`
    node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
  }
}

/** Płynny przejazd żywego widoku w tej samej skali, od środka widoku do punktu. */
async function pan(x: number, y: number, ms: number): Promise<{ from: CameraView; to: CameraView }> {
  const from = view()
  const visual = window.visualViewport
  const startX = from.left + (visual?.width ?? innerWidth) / 2
  const startY = from.top + (visual?.height ?? innerHeight) / 2
  const move = mover()
  await new Promise<void>((done) => {
    let started: number | null = null
    const tick = (now: number): void => {
      started ??= now
      const t = ms > 0 ? Math.min(1, (now - started) / ms) : 1
      const at = glide(t)
      move(startX + (x - startX) * at, startY + (y - startY) * at)
      if (t < 1) requestAnimationFrame(tick)
      else done()
    }
    requestAnimationFrame(tick)
  })
  await nextFrame()
  return { from, to: view() }
}

async function run(command: CameraCommand): Promise<CameraMeasure | CameraView | { from: CameraView; to: CameraView }> {
  switch (command.type) {
    case 'measure': {
      const root = document.documentElement
      return {
        view: view(),
        viewport: { width: root.clientWidth, height: root.clientHeight, foot: DOC_FOOT },
        target: command.shot ? targetOf(command.shot) : null,
        page: { width: root.scrollWidth, height: root.scrollHeight }
      }
    }
    case 'center':
      markAt(command.x, command.y).scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      await nextFrame()
      await nextFrame()
      return view()
    case 'pan':
      return pan(command.x, command.y, command.ms)
    case 'settle':
      await nextFrame()
      await nextFrame()
      return view()
  }
}

export function startCamera(): void {
  ipcRenderer.on('camera:command', (_event: IpcRendererEvent, command: CameraCommand) => {
    void run(command).then(
      (result) => ipcRenderer.send('camera:reply', command.id, result),
      () => ipcRenderer.send('camera:reply', command.id, null)
    )
  })
}
