import { ipcRenderer, type IpcRendererEvent, webFrame } from 'electron'
import type { OverlayEvent, OverlayItem, OverlayMode, ShapeTool, StickyColor } from '../shared/annotations'
import { isLocalHref, type LinkOutcome, type LinkPreview, type OpenMode, openModeOf } from '../shared/links'
import { type Language, setLanguage, t } from '../shared/i18n'
import { startCamera } from './camera'
import { type LinkPreviewHandle, startLinkPreview } from './linkPreview'
import type { FindCommand, TextQuery, TextSpan } from '../shared/textSearch'
import { FIND_STYLE, startFind } from './find'
import type { OutlineCommand } from '../shared/outline'
import type { PickKind, PresentState, RouteFrame } from '../shared/presentation'
import { startMinimap } from './minimap'
import { guardPointerEvents, startOverlay } from './overlay'

/*
 * Działa w odizolowanym świecie dokumentu, więc kod dokumentu nie ma dostępu do IPC.
 * Linki otwieramy tylko po prawdziwym kliknięciu użytkownika. Dzięki temu skrypt dokumentu
 * nie wyśle danych ani nie otworzy pliku, ustawiając `location` lub wywołując `window.open`.
 *
 * Strona dokumentu ma adres `/`, więc przeglądarka zgubiłaby `..` w linkach. Dlatego do procesu
 * głównego idzie surowy `href`, a ten rozwiązuje go względem prawdziwego miejsca pliku.
 */
const pointerGuard = guardPointerEvents()
/** O tym, czy to arkusz, decyduje proces główny, więc dokument HTML nie może tego udawać. */
let isSheet = false
void ipcRenderer.invoke('doc:is-sheet').then((answer: boolean) => {
  isSheet = answer
})
let linkPreview: LinkPreviewHandle | null = null

function openLocalLink(link: HTMLAnchorElement, href: string, mode: OpenMode): void {
  void ipcRenderer.invoke('doc:open-link', href, mode).then((outcome: LinkOutcome) => {
    if (outcome === 'missing') linkPreview?.say(link, t('Nie ma takiego pliku'))
  })
}

/** Link obsługiwany na miejscu: do własnej strony, np. `?strona=2`, do nazwanej ramki i w tekście do edycji. */
const staysInDocument = (link: HTMLAnchorElement): boolean =>
  link.pathname === '/' || link.isContentEditable || (link.target !== '' && !link.target.startsWith('_'))

/**
 * Dokument HTML może obsłużyć kliknięcie sam, np. własnym routerem, więc decydujemy po jego nasłuchach.
 * Nasłuch dodany w trakcie zdarzenia jest na `window` ostatni. Gdy dokument zatrzyma zdarzenie,
 * zostaje timer, a domyślną nawigację poza stronę dokumentu zatrzymuje `will-navigate`.
 */
function followHtmlLink(event: MouseEvent, link: HTMLAnchorElement): void {
  const decide = (current: Event = event): void => {
    if (current !== event) return
    window.removeEventListener('click', decide)
    clearTimeout(timer)
    const href = (link.getAttribute('href') ?? '').trim()
    if (event.defaultPrevented || !isLocalHref(href) || staysInDocument(link)) return
    event.preventDefault()
    openLocalLink(link, href, openModeOf(event))
  }
  window.addEventListener('click', decide)
  const timer = window.setTimeout(decide)
}

window.addEventListener(
  'click',
  (event) => {
    if (!event.isTrusted || event.button !== 0) return
    const link = event.composedPath().find((target) => target instanceof HTMLAnchorElement)
    if (!(link instanceof HTMLAnchorElement)) return
    const href = link.getAttribute('href') ?? ''
    if (isSheet && isLocalHref(href)) {
      event.preventDefault()
      openLocalLink(link, href, openModeOf(event))
      return
    }
    if (link.protocol === 'https:' || link.protocol === 'http:') {
      event.preventDefault()
      ipcRenderer.send('doc:open-external', link.href)
    } else if (!isSheet) {
      followHtmlLink(event, link)
    }
  },
  true
)

function subscribe<Payload>(channel: string, listener: (payload: Payload) => void): void {
  ipcRenderer.on(channel, (_event: IpcRendererEvent, payload: Payload) => listener(payload))
}

subscribe<Language>('overlay:language', setLanguage)

/** Ramki przepuszczają mysz do rodzica, bo inaczej ręka zatrzymałaby się na ich krawędzi. */
const PRESENTING_CSS = `
  html, html *, html *::before, html *::after { cursor: none !important; }
  iframe, embed, object { pointer-events: none !important; }
`
let presentingCss: string | null = null

function setPresenting(on: boolean): void {
  if (presentingCss) webFrame.removeInsertedCSS(presentingCss)
  presentingCss = on ? webFrame.insertCSS(PRESENTING_CSS, { cssOrigin: 'user' }) : null
}

/** Kształt rysuje się celownikiem, a ramki przepuszczają przeciągnięcie do rodzica. */
const DRAWING_CSS = `
  html, html *, html *::before, html *::after { cursor: crosshair !important; }
  iframe, embed, object { pointer-events: none !important; }
`
let drawingCss: string | null = null

function setDrawing(on: boolean): void {
  if (drawingCss) webFrame.removeInsertedCSS(drawingCss)
  drawingCss = on ? webFrame.insertCSS(DRAWING_CSS, { cssOrigin: 'user' }) : null
}

// Dokument można pokazać, gdy ma co pokazać. Na koniec wczytywania nie trzeba czekać.
new PerformanceObserver((entries, observer) => {
  if (entries.getEntriesByName('first-contentful-paint').length === 0) return
  observer.disconnect()
  ipcRenderer.send('doc:painted')
}).observe({ type: 'paint', buffered: true })

window.addEventListener(
  'DOMContentLoaded',
  () => {
    startOverlay(
      {
      send: (event: OverlayEvent) => ipcRenderer.send('overlay:event', event),
      onMode: (listener) => subscribe<OverlayMode>('overlay:mode', listener),
      onItems: (listener) => subscribe<OverlayItem[]>('overlay:items', listener),
      onFocus: (listener) => subscribe<string | null>('overlay:focus', listener),
      onTrack: (listener) => subscribe<boolean>('overlay:track', listener),
      onPointer: (listener) => subscribe<boolean>('overlay:pointer', listener),
      onMarker: (listener) => subscribe<StickyColor | null>('overlay:marker', listener),
      onPointerWithdraw: (listener) => subscribe<null>('overlay:pointer-withdraw', listener),
      onShaper: (listener) => subscribe<ShapeTool | null>('overlay:shaper', listener),
      onDrawings: (listener) => subscribe<boolean>('overlay:drawings', listener),
      onRoute: (listener) =>
        subscribe<{ frames: RouteFrame[]; selected: string | null } | null>('overlay:route', listener),
      onPick: (listener) => subscribe<PickKind | null>('overlay:pick', listener),
      onPresent: (listener) => subscribe<PresentState | null>('overlay:present', listener),
      onPlace: (listener) => subscribe<{ kind: 'comment' | 'sticky'; color: StickyColor }>('overlay:place', listener),
      onCarry: (listener) => subscribe<string | null>('overlay:carry', listener),
      setPresenting,
      setDrawing
      },
      pointerGuard
    )
    // Styl użytkownika daje poprawny `getComputedStyle`, ale Chromium go nie maluje.
    void webFrame.insertCSS(FIND_STYLE, { cssOrigin: 'author' })
    startFind({
      send: (event: OverlayEvent) => ipcRenderer.send('overlay:event', event),
      onCommand: (listener) => subscribe<FindCommand>('find:command', listener),
      matchPattern: (text: string, query: TextQuery) =>
        ipcRenderer.invoke('doc:find-pattern', text, query) as Promise<TextSpan[] | 'pattern' | 'slow'>
    })
    startCamera()
    // Po warstwie uwag, bo minimapa staje pod nią.
    startMinimap({
      send: (event: OverlayEvent) => ipcRenderer.send('overlay:event', event),
      onShow: (listener) => subscribe<boolean>('minimap:show', listener),
      onCommand: (listener) => subscribe<OutlineCommand>('outline:command', listener),
      onMode: (listener) => subscribe<OverlayMode>('overlay:mode', listener),
      onPointer: (listener) => subscribe<boolean>('overlay:pointer', listener),
      onMarker: (listener) => subscribe<StickyColor | null>('overlay:marker', listener),
      onShaper: (listener) => subscribe<ShapeTool | null>('overlay:shaper', listener)
    })
    ipcRenderer.send('overlay:ready')
    // Dokument HTML ma skrypty, więc karty z danymi innych dokumentów dostaje tylko arkusz.
    linkPreview = startLinkPreview((href) =>
      isSheet ? (ipcRenderer.invoke('doc:link-preview', href) as Promise<LinkPreview | null>) : Promise.resolve(null)
    )
  },
  { once: true }
)
