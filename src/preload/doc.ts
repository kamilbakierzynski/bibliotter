import { ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OverlayEvent, OverlayItem, OverlayMode } from '../shared/annotations'
import { guardPointerEvents, startOverlay } from './overlay'

/*
 * Działa w odizolowanym świecie dokumentu, więc kod dokumentu nie ma dostępu do IPC.
 * Linki zewnętrzne otwieramy tylko po prawdziwym kliknięciu użytkownika. Dzięki temu
 * skrypt dokumentu nie wyśle danych, ustawiając `location` lub wywołując `window.open`.
 */
window.addEventListener(
  'click',
  (event) => {
    if (!event.isTrusted || event.button !== 0) return
    const link = event.composedPath().find((target) => target instanceof HTMLAnchorElement)
    if (!(link instanceof HTMLAnchorElement)) return
    if (link.protocol !== 'https:' && link.protocol !== 'http:') return
    event.preventDefault()
    ipcRenderer.send('doc:open-external', link.href)
  },
  true
)

function subscribe<Payload>(channel: string, listener: (payload: Payload) => void): void {
  ipcRenderer.on(channel, (_event: IpcRendererEvent, payload: Payload) => listener(payload))
}

const pointerGuard = guardPointerEvents()

window.addEventListener(
  'DOMContentLoaded',
  () => {
    startOverlay(
      {
      send: (event: OverlayEvent) => ipcRenderer.send('overlay:event', event),
      onMode: (listener) => subscribe<OverlayMode>('overlay:mode', listener),
      onItems: (listener) => subscribe<OverlayItem[]>('overlay:items', listener),
      onFocus: (listener) => subscribe<string | null>('overlay:focus', listener)
      },
      pointerGuard
    )
    ipcRenderer.send('overlay:ready')
  },
  { once: true }
)
