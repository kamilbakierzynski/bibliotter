import { ipcRenderer, type IpcRendererEvent } from 'electron'
import { boxWithin, type CameraShot, type CameraView, type CameraViewport, type PageRect } from '../shared/camera'
import { resolveAnchor } from './anchor'
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
  | { id: number; type: 'settle' }

export interface CameraMeasure {
  view: CameraView
  viewport: CameraViewport
  /** Kadr na stronie albo `null`, gdy kotwicy nie ma już w dokumencie. */
  target: PageRect | null
}

const nextFrame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()))

function view(): CameraView {
  const visual = window.visualViewport
  if (!visual) return { left: scrollX, top: scrollY, scale: 1 }
  return { left: visual.pageLeft, top: visual.pageTop, scale: visual.scale }
}

function pageRectOf(element: Element): PageRect {
  const rect = element.getBoundingClientRect()
  return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height }
}

function targetOf(shot: CameraShot): PageRect | null {
  if ('rect' in shot) return shot.rect
  const element = resolveAnchor(shot.anchor)
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

async function run(command: CameraCommand): Promise<CameraMeasure | CameraView> {
  switch (command.type) {
    case 'measure': {
      const root = document.documentElement
      return {
        view: view(),
        viewport: { width: root.clientWidth, height: root.clientHeight, foot: DOC_FOOT },
        target: command.shot ? targetOf(command.shot) : null
      }
    }
    case 'center':
      markAt(command.x, command.y).scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      await nextFrame()
      await nextFrame()
      return view()
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
