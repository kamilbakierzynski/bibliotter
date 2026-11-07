import { ipcRenderer, type IpcRendererEvent, webFrame } from 'electron'
import type { OverlayEvent, OverlayItem, OverlayMode, ShapeTool, StickyColor } from '../shared/annotations'
import { isLocalHref, type LinkOutcome, type OpenMode, openModeOf } from '../shared/links'
import { type Language, setLanguage, t } from '../shared/i18n'
import { startCamera } from './camera'
import { startLightbox } from './lightbox'
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

/** Kursor powiększania wygrywa z kursorem dokumentu, a pod narzędziem nie pojawia się wcale. */
const ZOOM_CURSOR_CSS = 'img:hover { cursor: zoom-in !important; }'
let zoomCursorCss: string | null = null
// Przed warstwą uwag, żeby Esc przy powiększeniu nie zamykał arkusza.
const lightbox = startLightbox({
  busy: () => pointerGuard.onClick !== null || pointerGuard.onPress !== null,
  setCursor: (on) => {
    if (zoomCursorCss) webFrame.removeInsertedCSS(zoomCursorCss)
    zoomCursorCss = on ? webFrame.insertCSS(ZOOM_CURSOR_CSS, { cssOrigin: 'user' }) : null
  }
})
/** O tym, czy to arkusz, decyduje proces główny, więc dokument HTML nie może tego udawać. */
let isSheet = false
/** Arkusz pliku nie należy do biblioteki, więc uwag nie ma gdzie zapisać. */
let takesNotes = true
void ipcRenderer.invoke('doc:is-sheet').then((answer: boolean | { sheet: boolean; notes: boolean }) => {
  isSheet = typeof answer === 'boolean' ? answer : answer.sheet
  takesNotes = typeof answer === 'boolean' ? true : answer.notes
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
// Tryb uwag, narzędzie albo krok prezentacji zmienia to, co jest pod powiększeniem, więc ono ustępuje.
subscribe<OverlayMode>('overlay:mode', (mode) => mode !== null && lightbox.close())
subscribe<boolean>('overlay:pointer', (on) => on && lightbox.close())
subscribe<StickyColor | null>('overlay:marker', (color) => color !== null && lightbox.close())
subscribe<ShapeTool | null>('overlay:shaper', (tool) => tool !== null && lightbox.close())
subscribe<PresentState | null>('overlay:present', () => lightbox.close())
subscribe<string | null>('overlay:carry', (id) => id !== null && lightbox.close())

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
      takesNotes: () => takesNotes,
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
    // Kartę rysuje powłoka nad dokumentem, więc dokument HTML też ją ma, choć danych celu nie widzi.
    linkPreview = startLinkPreview((href, rect) => ipcRenderer.send('doc:link-hover', href, rect))
  },
  { once: true }
)
