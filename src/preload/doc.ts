import { ipcRenderer } from 'electron'

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
