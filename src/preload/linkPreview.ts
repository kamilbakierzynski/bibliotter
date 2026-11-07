import { locale, t } from '../shared/i18n'
import { isLocalHref, type LinkPreview } from '../shared/links'
import { DOC_FOOT, MAX_Z_INDEX } from './overlay'

const HOVER_DELAY_MS = 280
const NOTICE_MS = 1800
const LINK_GAP = 8
const EDGE = 12

/* Karta należy do języka apki: czarno-biała, z Geist Mono w metadanych. Fonty przychodzą z arkusza. */
const STYLE = `
  * { box-sizing: border-box; }
  .card {
    position: fixed; top: 0; left: 0; display: none; gap: 12px; width: 340px; padding: 10px;
    color: var(--ink); background: var(--solid);
    font: 400 12.5px/1.42 Geist, 'Segoe UI', system-ui, sans-serif; text-align: left; overflow-wrap: anywhere;
    border-radius: 12px; box-shadow: 0 0 0 .5px var(--hair), 0 14px 34px -10px rgb(0 0 0 / 34%);
    --ink: #17181a; --ink-3: #85878d; --solid: #ffffff; --hair: rgb(19 19 22 / 18%); --well: #f5f5f6;
    transform-origin: 18px 0; animation: grow .32s cubic-bezier(.2, 1.3, .3, 1) both;
  }
  @media (prefers-color-scheme: dark) {
    .card { --ink: #f4f4f5; --ink-3: #85858d; --solid: #232326; --hair: rgb(255 255 255 / 14%); --well: #2c2c30; }
  }
  @keyframes grow { from { opacity: 0; transform: scale(.96) translateY(-3px); } to { opacity: 1; transform: none; } }
  .card.on { display: flex; }
  .card.notice { width: auto; max-width: 340px; padding: 6px 10px; }
  .thumb { flex: none; width: 84px; height: 110px; object-fit: cover; object-position: top; background: var(--well); border-radius: 6px; box-shadow: 0 0 0 .5px var(--hair); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .title { font-size: 13.5px; font-weight: 600; letter-spacing: -.006em; }
  .excerpt { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .meta { margin-top: auto; padding-top: 3px; color: var(--ink-3); font: 400 10.5px/1.4 'Geist Mono', Consolas, monospace; }
`

export interface LinkPreviewHandle {
  /** Krótka informacja przy linku, np. że kliknięty plik nie istnieje. */
  say(link: Element, text: string): void
}

function line(className: string, text: string): HTMLElement {
  const element = document.createElement('span')
  element.className = className
  element.textContent = text
  return element
}

function contentOf(preview: LinkPreview): Node[] {
  const text = document.createElement('div')
  text.className = 'text'
  text.append(line('title', preview.title))
  if (preview.excerpt) text.append(line('excerpt', preview.excerpt))
  const place = [preview.project ?? t('Poza biblioteką'), preview.path].join(' · ')
  text.append(line('meta', `${place}\n${new Date(preview.mtimeMs).toLocaleDateString(locale())}`))
  text.lastElementChild?.setAttribute('style', 'white-space: pre-line')
  if (!preview.thumb) return [text]
  const thumb = document.createElement('img')
  thumb.className = 'thumb'
  thumb.alt = ''
  thumb.src = preview.thumb
  return [thumb, text]
}

/** Prostokąt linku pod wskaźnikiem. Link złamany na dwie linie ma ich kilka. */
function rectAt(link: Element, y: number): DOMRect {
  const rects = [...link.getClientRects()]
  return rects.find((rect) => y >= rect.top && y <= rect.bottom) ?? rects[0] ?? link.getBoundingClientRect()
}

/**
 * Karta żyje w dokumencie, bo widok dokumentu leży nad całą powłoką. Stoi w zamkniętym cieniu,
 * a tekst trafia do niej tylko przez `textContent`, więc treść pliku nie zmieni jej w HTML.
 */
export function startLinkPreview(load: (href: string) => Promise<LinkPreview | null>): LinkPreviewHandle {
  const host = document.createElement('bibliotter-link-preview')
  host.style.cssText = `all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: ${MAX_Z_INDEX}; pointer-events: none;`
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = STYLE
  const card = document.createElement('div')
  card.className = 'card'
  root.append(style, card)
  document.documentElement.append(host)

  const cache = new Map<string, Promise<LinkPreview | null>>()
  let current: Element | null = null
  let timer = 0
  let noticeTimer = 0
  let pointerY = 0

  const hide = (): void => {
    clearTimeout(timer)
    clearTimeout(noticeTimer)
    current = null
    card.className = 'card'
  }

  const show = (link: Element, content: Node[], notice = false): void => {
    card.replaceChildren(...content)
    card.className = notice ? 'card on notice' : 'card on'
    const rect = rectAt(link, pointerY)
    const height = card.offsetHeight
    const roomBelow = rect.bottom + LINK_GAP + height <= innerHeight - DOC_FOOT
    const above = !roomBelow && rect.top - LINK_GAP - height > EDGE
    const top = above ? rect.top - LINK_GAP - height : rect.bottom + LINK_GAP
    const left = Math.max(EDGE, Math.min(rect.left, innerWidth - card.offsetWidth - EDGE))
    card.style.translate = `${left}px ${top}px`
    card.style.transformOrigin = above ? '18px 100%' : '18px 0'
  }

  const preview = (link: Element, href: string): void => {
    let pending = cache.get(href)
    if (!pending) {
      pending = load(href).catch(() => null)
      cache.set(href, pending)
    }
    void pending.then((found) => {
      if (found && current === link) show(link, contentOf(found))
    })
  }

  document.addEventListener('pointerover', (event) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return
    const link = event.target.closest('a[href]')
    if (link === current) return
    hide()
    const href = link?.getAttribute('href') ?? ''
    if (!link || !isLocalHref(href)) return
    current = link
    pointerY = event.clientY
    timer = window.setTimeout(() => preview(link, href), HOVER_DELAY_MS)
  })
  document.documentElement.addEventListener('pointerleave', hide)
  window.addEventListener('blur', hide)
  window.addEventListener('scroll', hide, { capture: true, passive: true })
  window.addEventListener('pointerdown', hide, true)
  window.addEventListener('keydown', hide, true)

  return {
    say(link, text) {
      hide()
      show(link, [line('text', text)], true)
      noticeTimer = window.setTimeout(hide, NOTICE_MS)
    }
  }
}
