import type { ViewerBounds } from '../../../shared/types'

/*
 * Dok pływa nad dokumentami, a dokument to natywny widok nad powłoką. Dlatego dok mieszka na
 * osobnej, przezroczystej stronie w widoku na samej górze. Strona działa w tym samym wątku co
 * powłoka, więc React rysuje na niej przez portal, a `layout.ts` pisze style wprost.
 *
 * Strona ma rozmiar okna, więc jej współrzędne to współrzędne okna. Widać ją tylko przez
 * wycięcie, a pod nim nie da się kliknąć dokumentu, więc wycięcie obejmuje dok i jego drogę.
 */

const PAGE_NAME = 'dock-layer'

let page: Window & typeof globalThis
let host: HTMLElement
let cutout: ViewerBounds = { x: 0, y: 0, width: 0, height: 0 }

export const layerWindow = (): Window & typeof globalThis => page
export const layerDocument = (): Document => page.document
export const layerHost = (): HTMLElement => host

/** Element doku albo palety. */
export const inLayer = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  page.document.getElementById(id) as T | null

/** Czy klawiatura pisze w polu. Każda strona pamięta swój aktywny element, więc liczą się te z fokusem. */
export const typesInField = (): boolean =>
  [page.document, document].some((doc) => doc.hasFocus() && ['INPUT', 'TEXTAREA'].includes(doc.activeElement?.tagName ?? ''))

/** Atrybuty korzenia niosą motyw i stan powłoki, od których zależą style doku. */
function mirrorRoot(page: Window): void {
  const from = document.documentElement
  const to = page.document.documentElement
  const copy = (): void => {
    for (const { name, value } of [...from.attributes]) to.setAttribute(name, value)
  }
  copy()
  new MutationObserver(copy).observe(from, { attributes: true })
}

function copyStyle(page: Window, node: Element): Promise<void> | null {
  const copy = page.document.importNode(node, true) as HTMLStyleElement | HTMLLinkElement
  if (!(node instanceof HTMLLinkElement)) {
    page.document.head.append(copy)
    return null
  }
  const link = copy as HTMLLinkElement
  link.href = node.href
  const loaded = new Promise<void>((done) => {
    link.onload = () => done()
    link.onerror = () => done()
  })
  page.document.head.append(link)
  return loaded
}

/** Vite podmienia style w miejscu, więc w trybie dev warstwa idzie za powłoką. */
function followStyles(page: Window): void {
  const id = 'data-vite-dev-id'
  new MutationObserver(() => {
    for (const style of document.head.querySelectorAll(`style[${id}]`)) {
      const twin = page.document.head.querySelector(`style[${id}="${CSS.escape(style.getAttribute(id) ?? '')}"]`)
      if (!twin) copyStyle(page, style)
      else if (twin.textContent !== style.textContent) twin.textContent = style.textContent
    }
  }).observe(document.head, { childList: true, characterData: true, subtree: true })
}

/** Otwiera pustą stronę warstwy z motywem i stylami powłoki. Proces główny wpuszcza tylko znane nazwy. */
export async function openLayerPage(name: string, url = ''): Promise<Window & typeof globalThis> {
  const opened = window.open(url, name)
  if (!opened) throw new Error(`Nie można otworzyć warstwy ${name}`)
  const layer = opened as Window & typeof globalThis
  layer.document.head.replaceChildren()
  layer.document.body.replaceChildren()
  mirrorRoot(layer)
  const styles = [...document.head.querySelectorAll('style, link[rel="stylesheet"]')]
  await Promise.all(styles.map((style) => copyStyle(layer, style)))
  if (import.meta.hot) followStyles(layer)
  return layer
}

/** Otwiera stronę warstwy. Dok mierzy się przy starcie, więc style muszą już być wczytane. */
export async function openLayer(): Promise<void> {
  page = await openLayerPage(PAGE_NAME)
  const { document: doc } = page
  doc.body.className = 'dock-page'
  host = doc.createElement('div')
  host.className = 'dock-room'
  doc.body.append(host)
}

const same = (a: ViewerBounds, b: ViewerBounds): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const holds = (a: ViewerBounds, b: ViewerBounds): boolean =>
  a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height

/** W ruchu wystarczy, że wycięcie mieści dok. W spoczynku dochodzi dokładnie do niego. */
export function placeLayer(box: ViewerBounds, exact: boolean): void {
  if (exact ? same(box, cutout) : holds(cutout, box)) return
  cutout = box
  window.api.placeLayer(box)
}
