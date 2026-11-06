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
function mirrorRoot(): void {
  const from = document.documentElement
  const to = page.document.documentElement
  const copy = (): void => {
    for (const { name, value } of [...from.attributes]) to.setAttribute(name, value)
  }
  copy()
  new MutationObserver(copy).observe(from, { attributes: true })
}

function copyStyle(node: Element): Promise<void> | null {
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

/** Otwiera stronę warstwy. Dok mierzy się przy starcie, więc style muszą już być wczytane. */
export async function openLayer(): Promise<void> {
  const opened = window.open('', PAGE_NAME)
  if (!opened) throw new Error('Nie można otworzyć warstwy doku')
  page = opened as Window & typeof globalThis
  const { document: doc } = page
  doc.head.replaceChildren()
  doc.body.replaceChildren()
  doc.body.className = 'dock-page'
  host = doc.createElement('div')
  host.className = 'dock-room'
  doc.body.append(host)
  mirrorRoot()
  const styles = [...document.head.querySelectorAll('style, link[rel="stylesheet"]')]
  await Promise.all(styles.map(copyStyle))
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
