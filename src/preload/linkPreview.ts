import type { OverlayRect } from '../shared/annotations'
import { isLocalHref } from '../shared/links'
import { DOC_FOOT, MAX_Z_INDEX } from './overlay'
import { onScreen } from './zoom'

const HOVER_DELAY_MS = 280
const NOTICE_MS = 1800
const LINK_GAP = 8
const EDGE = 12

/* Krótka informacja przy linku. Fonty przychodzą z arkusza. */
const STYLE = `
  * { box-sizing: border-box; }
  .notice {
    position: fixed; top: 0; left: 0; display: none; max-width: 340px; padding: 6px 10px;
    color: var(--ink); background: var(--solid);
    font: 400 12.5px/1.42 Geist, 'Segoe UI', system-ui, sans-serif; text-align: left; overflow-wrap: anywhere;
    border-radius: 12px; box-shadow: 0 0 0 .5px var(--hair), 0 14px 34px -10px rgb(0 0 0 / 34%);
    --ink: #17181a; --solid: #ffffff; --hair: rgb(19 19 22 / 18%);
    transform-origin: 18px 0; animation: grow .32s cubic-bezier(.2, 1.3, .3, 1) both;
  }
  @media (prefers-color-scheme: dark) {
    .notice { --ink: #f4f4f5; --solid: #232326; --hair: rgb(255 255 255 / 14%); }
  }
  @keyframes grow { from { opacity: 0; transform: scale(.96) translateY(-3px); } to { opacity: 1; transform: none; } }
  .notice.on { display: block; }
`

export interface LinkPreviewHandle {
  /** Krótka informacja przy linku, np. że kliknięty plik nie istnieje. */
  say(link: Element, text: string): void
}

/** Prostokąt linku pod wskaźnikiem. Link złamany na dwie linie ma ich kilka. */
function rectAt(link: Element, y: number): DOMRect {
  const rects = [...link.getClientRects()]
  return rects.find((rect) => y >= rect.top && y <= rect.bottom) ?? rects[0] ?? link.getBoundingClientRect()
}

/**
 * Dokument mówi tylko, nad którym linkiem stoi wskaźnik i gdzie ten link widać. Kartę z danymi
 * celu rysuje powłoka w warstwie nad dokumentami, więc nic o innych dokumentach tu nie trafia.
 * `hover(null)` chowa kartę.
 *
 * Informacja przy linku żyje w dokumencie, w zamkniętym cieniu, a tekst trafia do niej tylko
 * przez `textContent`, więc treść pliku nie zmieni jej w HTML.
 */
export function startLinkPreview(hover: (href: string | null, rect: OverlayRect | null) => void): LinkPreviewHandle {
  const host = document.createElement('bibliotter-link-preview')
  host.style.cssText = `all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: ${MAX_Z_INDEX}; pointer-events: none;`
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = STYLE
  const notice = document.createElement('div')
  notice.className = 'notice'
  root.append(style, notice)
  document.documentElement.append(host)

  let current: Element | null = null
  let shown = false
  let timer = 0
  let noticeTimer = 0
  let pointerY = 0

  const hideNotice = (): void => {
    clearTimeout(noticeTimer)
    notice.className = 'notice'
  }

  const hide = (): void => {
    clearTimeout(timer)
    current = null
    hideNotice()
    if (!shown) return
    shown = false
    hover(null, null)
  }

  const show = (link: Element, href: string): void => {
    if (current !== link || !link.isConnected) return
    const { x, y, width, height } = rectAt(link, pointerY)
    shown = true
    hover(href, onScreen({ x, y, width, height }))
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
    timer = window.setTimeout(() => show(link, href), HOVER_DELAY_MS)
  })
  document.documentElement.addEventListener('pointerleave', hide)
  window.addEventListener('blur', hide)
  window.addEventListener('scroll', hide, { capture: true, passive: true })
  window.addEventListener('pointerdown', hide, true)
  window.addEventListener('keydown', hide, true)

  return {
    say(link, text) {
      hide()
      notice.textContent = text
      notice.className = 'notice on'
      const rect = rectAt(link, pointerY)
      const height = notice.offsetHeight
      const roomBelow = rect.bottom + LINK_GAP + height <= innerHeight - DOC_FOOT
      const above = !roomBelow && rect.top - LINK_GAP - height > EDGE
      const top = above ? rect.top - LINK_GAP - height : rect.bottom + LINK_GAP
      const left = Math.max(EDGE, Math.min(rect.left, innerWidth - notice.offsetWidth - EDGE))
      notice.style.translate = `${left}px ${top}px`
      notice.style.transformOrigin = above ? '18px 100%' : '18px 0'
      noticeTimer = window.setTimeout(hideNotice, NOTICE_MS)
    }
  }
}
