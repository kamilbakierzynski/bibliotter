import { locale, t } from '../../../shared/i18n'
import type { LinkHoverCard, LinkPreview } from '../../../shared/links'
import { openLayerPage } from './layer'

/*
 * Karta linku z dokumentu. Dokument mówi tylko, gdzie stoi link, a kartę z danymi celu rysuje
 * powłoka na własnej, przezroczystej stronie nad dokumentami. Dzięki temu karta działa też
 * w dokumentach HTML ze skryptami, a dane innych dokumentów nie trafiają do ich procesu.
 *
 * Strona ma rozmiar okna i widać ją tylko przez wycięcie wokół karty. Wycięcie łapie mysz,
 * więc od strony linku nie wychodzi poza odstęp. Inaczej wskaźnik na linku trafiłby w kartę.
 */

const PAGE_NAME = 'card-layer'
const LINK_GAP = 8
const EDGE = 12
/** Tyle cienia wychodzi poza kartę. Od strony linku wycięcie kończy się przed nim. */
const SHADOW = 24

const STYLE = `
  .lh-page { margin: 0; background: none; overflow: hidden; }
  .lh {
    position: fixed; top: 0; left: 0; display: none; gap: 12px; width: 340px; padding: 10px;
    color: var(--ink); background: var(--solid);
    font: 400 12.5px/1.42 var(--font); text-align: left; overflow-wrap: anywhere;
    border-radius: 12px; box-shadow: 0 0 0 .5px var(--hair-2), 0 14px 34px -10px rgb(0 0 0 / 34%);
    transform-origin: 18px 0; animation: lh-grow .32s var(--spring-pop) both;
  }
  .lh.above { box-shadow: 0 0 0 .5px var(--hair-2), 0 -4px 30px -10px rgb(0 0 0 / 34%); transform-origin: 18px 100%; }
  .lh.on { display: flex; }
  @keyframes lh-grow { from { opacity: 0; transform: scale(.96) translateY(-3px); } to { opacity: 1; transform: none; } }
  .lh-thumb { flex: none; width: 84px; height: 110px; object-fit: cover; object-position: top; background: var(--well); border-radius: 6px; box-shadow: 0 0 0 .5px var(--hair-2); }
  .lh-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .lh-title { font-size: 13.5px; font-weight: 600; letter-spacing: -.006em; }
  .lh-excerpt { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .lh-meta { margin-top: auto; padding-top: 3px; color: var(--ink-3); font: 400 10.5px/1.4 var(--mono); white-space: pre-line; }
`

let page: (Window & typeof globalThis) | null = null
let card: HTMLElement | null = null
let shown = false

/** Strona kart. Wskazówki przycisków arkusza też na niej stoją, bo pod nagłówkiem leży dokument. */
export const cardPage = (): (Window & typeof globalThis) | null => page

function line(doc: Document, className: string, text: string): HTMLElement {
  const element = doc.createElement('span')
  element.className = className
  element.textContent = text
  return element
}

function contentOf(doc: Document, preview: LinkPreview): Node[] {
  const text = doc.createElement('div')
  text.className = 'lh-text'
  text.append(line(doc, 'lh-title', preview.title))
  if (preview.excerpt) text.append(line(doc, 'lh-excerpt', preview.excerpt))
  const place = [preview.project ?? t('Poza biblioteką'), preview.path].join(' · ')
  text.append(line(doc, 'lh-meta', `${place}\n${new Date(preview.mtimeMs).toLocaleDateString(locale())}`))
  if (!preview.thumb) return [text]
  const thumb = doc.createElement('img')
  thumb.className = 'lh-thumb'
  thumb.alt = ''
  thumb.src = preview.thumb
  return [thumb, text]
}

function hide(): void {
  if (!shown || !card) return
  shown = false
  card.className = 'lh'
  card.replaceChildren()
  window.api.placeCardLayer(null)
}

function show({ preview, link }: LinkHoverCard): void {
  if (!page || !card) return
  card.replaceChildren(...contentOf(page.document, preview))
  card.className = 'lh on'
  const width = card.offsetWidth
  const height = card.offsetHeight
  // Schowana strona warstwy potrafi mieć rozmiar zero, a powłoka zawsze ma rozmiar okna.
  const bottom = link.y + link.height
  const roomBelow = bottom + LINK_GAP + height <= innerHeight - EDGE
  const above = !roomBelow && link.y - LINK_GAP - height > EDGE
  const top = above ? link.y - LINK_GAP - height : bottom + LINK_GAP
  const left = Math.max(EDGE, Math.min(link.x, innerWidth - width - EDGE))
  card.classList.toggle('above', above)
  card.style.translate = `${left}px ${top}px`
  // Wycięcie obejmuje kartę z cieniem, ale nie wchodzi na link.
  const reach = LINK_GAP - 1
  const x = Math.floor(left - SHADOW)
  const y = Math.floor(above ? top - SHADOW : top - reach)
  const right = Math.ceil(left + width + SHADOW)
  const end = Math.ceil(above ? top + height + reach : top + height + SHADOW)
  shown = true
  window.api.placeCardLayer({ x, y, width: right - x, height: end - y })
}

/** Otwiera warstwę kart i słucha dokumentów. */
export async function openLinkCards(): Promise<void> {
  page = await openLayerPage(PAGE_NAME, `about:blank#${PAGE_NAME}`)
  const doc = page.document
  doc.body.className = 'lh-page'
  const style = doc.createElement('style')
  style.textContent = STYLE
  doc.head.append(style)
  card = doc.createElement('div')
  card.className = 'lh'
  doc.body.append(card)
  // Wskaźnik nad kartą zszedł z linku, a dokument może się o tym nie dowiedzieć.
  doc.addEventListener('pointerdown', hide)
  doc.documentElement.addEventListener('pointerleave', hide)
  window.api.onLinkHover((next) => (next ? show(next) : hide()))
}
