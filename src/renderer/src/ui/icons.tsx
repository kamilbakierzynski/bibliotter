const p = (...list: string[]): string => list.map((d) => `<path d="${d}"/>`).join('')
const FRAME = '<rect x="3" y="4" width="14" height="12" rx="2.4"/>'
const TILE = (x: number, y: number): string =>
  `M${x + 1.3} ${y}h3.2a1.3 1.3 0 0 1 1.3 1.3v3.2a1.3 1.3 0 0 1-1.3 1.3h-3.2a1.3 1.3 0 0 1-1.3-1.3v-3.2a1.3 1.3 0 0 1 1.3-1.3Z`

/** Ikona to bryła, szczegóły na bryle i zwykłe linie. Bryłę widać tylko na wybranej ikonie. */
const GLYPHS: Record<string, [string, string?, string?]> = {
  search: ['<circle cx="9" cy="9" r="5.25"/>', '', p('m13 13 3.75 3.75')],
  layers: [p('M10 3.2 3.4 6.6 10 10l6.6-3.4L10 3.2Z'), '', p('m3.4 10 6.6 3.4 6.6-3.4', 'm3.4 13.4 6.6 3.4 6.6-3.4')],
  inbox: [p('M3.2 11v3.3a1.6 1.6 0 0 0 1.6 1.6h10.4a1.6 1.6 0 0 0 1.6-1.6V11h-3.7l-1 1.9H7.9l-1-1.9H3.2Z'), '', p('M3.2 11 5.1 5.2a1.6 1.6 0 0 1 1.5-1.1h6.8a1.6 1.6 0 0 1 1.5 1.1l1.9 5.8')],
  bubble: [p('M4.6 3.9h10.8A1.6 1.6 0 0 1 17 5.5v6.9a1.6 1.6 0 0 1-1.6 1.6H9.2l-3.4 2.7V14H4.6A1.6 1.6 0 0 1 3 12.4V5.5a1.6 1.6 0 0 1 1.6-1.6Z')],
  unsure: ['<rect x="3.6" y="3.1" width="12.8" height="13.8" rx="2.6" stroke-dasharray="2.4 2.6"/>', p('M8.1 8.3a1.95 1.95 0 1 1 3 1.65c-.72.46-1.12.85-1.12 1.55', 'M10 13.7v.01')],
  folder: [p('M3 6.4a1.6 1.6 0 0 1 1.6-1.6h3.1c.46 0 .9.2 1.2.55l.9 1.05h5.6A1.6 1.6 0 0 1 17 8v6.4a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 14.4v-8Z')],
  sun: ['<circle cx="10" cy="10" r="3.1"/>', '', p('M10 3.2v1.4M10 15.4v1.4M3.2 10h1.4M15.4 10h1.4M5.2 5.2l1 1M13.8 13.8l1 1M14.8 5.2l-1 1M6.2 13.8l-1 1')],
  moon: [p('M16.4 11.6a6.6 6.6 0 0 1-8-8 6.6 6.6 0 1 0 8 8Z')],
  cursor: [p('m4.2 3.7 12 4.6-5.2 1.9-1.9 5.3-4.9-11.8Z')],
  comment: [p('M10 3.4a6.6 6.6 0 0 1 0 13.2H3.4V10A6.6 6.6 0 0 1 10 3.4Z')],
  sticky: [p('M4.6 3.4h10.8A1.6 1.6 0 0 1 17 5v7.2l-4.6 4.6H4.6A1.6 1.6 0 0 1 3 15.2V5a1.6 1.6 0 0 1 1.6-1.6Z'), p('M12.4 16.8v-3a1.6 1.6 0 0 1 1.6-1.6h3')],
  split: [FRAME, p('M10 4v12')],
  right: [FRAME, p('M12.6 4v12')],
  gallery: [p(TILE(3.2, 3.2), TILE(11, 3.2), TILE(3.2, 11), TILE(11, 11))],
  index: ['<rect x="4" y="3" width="12" height="14" rx="2.4"/>', p('M7 7.2h6', 'M7 10h6', 'M7 12.8h3.6')],
  wall: [p('M4.4 3.4h4.2A1.4 1.4 0 0 1 10 4.8v10.4a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 15.2V4.8a1.4 1.4 0 0 1 1.4-1.4Z', 'M13.4 4.6h2.2A1.4 1.4 0 0 1 17 6v1.6A1.4 1.4 0 0 1 15.6 9h-2.2A1.4 1.4 0 0 1 12 7.6V6a1.4 1.4 0 0 1 1.4-1.4Z', 'M13.4 11h2.2a1.4 1.4 0 0 1 1.4 1.4V14a1.4 1.4 0 0 1-1.4 1.4h-2.2A1.4 1.4 0 0 1 12 14v-1.6a1.4 1.4 0 0 1 1.4-1.4Z')],
  left: [FRAME, p('M7.4 4v12')],
  refresh: ['', '', p('M16 10a6 6 0 1 1-1.9-4.4', 'M16.2 3.4v3.4h-3.4')],
  reveal: ['', '', p('M11.6 3.8h4.6v4.6', 'm16 4-6.4 6.4', 'M15.6 12v2.6a1.6 1.6 0 0 1-1.6 1.6H5.4a1.6 1.6 0 0 1-1.6-1.6V6a1.6 1.6 0 0 1 1.6-1.6H8')],
  chev: ['', '', p('m7.6 5 5 5-5 5')],
  prev: ['', '', p('m12.4 5-5 5 5 5')],
  keyboard: ['<rect x="2.6" y="4.6" width="14.8" height="10.8" rx="2.4"/>', p('M5.9 8h.01M8.6 8h.01M11.4 8h.01M14.1 8h.01M7 12.2h6')],
  up: ['', '', p('m5 12.4 5-5 5 5')],
  branch: ['', '', `<circle cx="6" cy="4.8" r="1.7"/><circle cx="6" cy="15.2" r="1.7"/><circle cx="14" cy="6.8" r="1.7"/>${p('M6 6.5v7', 'M14 8.5c0 3.6-8 1.8-8 5')}`],
  file: [p('M5.8 3h5.7l3.9 3.9V16a1.4 1.4 0 0 1-1.4 1.4H5.8A1.4 1.4 0 0 1 4.4 16V4.4A1.4 1.4 0 0 1 5.8 3Z'), p('M11.2 3.2v3.2a.9.9 0 0 0 .9.9h3.1')],
  x: ['', '', p('m5.5 5.5 9 9M14.5 5.5l-9 9')],
  check: ['', '', p('m4.6 10.6 3.6 3.6 7.2-8.4')],
  term: [FRAME, p('m6.4 8 2.4 2-2.4 2', 'M10.6 12.4h3')],
  me: ['<circle cx="10" cy="7" r="3.2"/>', '', p('M4 16.6c.7-3 3-4.4 6-4.4s5.3 1.4 6 4.4')],
  clock: ['', '', `<circle cx="10" cy="10" r="6.7"/>${p('M10 6.2V10l2.6 1.7')}`],
  sort: ['', '', p('M4 5.8h12', 'M4 10h8', 'M4 14.2h4')],
  archive: [p('M3.8 7.6h12.4v7.1a1.7 1.7 0 0 1-1.7 1.7h-9a1.7 1.7 0 0 1-1.7-1.7V7.6Z'), p('M8 10.8h4'), '<rect x="2.8" y="3.6" width="14.4" height="4" rx="1.2"/>'],
  min: ['', '', p('M4 10h12')],
  max: ['', '', '<rect x="4.5" y="4.5" width="11" height="11" rx="2"/>']
}

const LOGO =
  '<symbol id="i-logo" viewBox="0 0 24 24"><rect x="4" y="3.5" width="11" height="14.5" rx="2.6" opacity=".42"/><rect x="9" y="6" width="11" height="14.5" rx="2.6"/></symbol>'

const SPRITE =
  LOGO +
  Object.entries(GLYPHS)
    .map(([name, [body, detail = '', line = '']]) => {
      const plate = body ? `<g class="ic-plate">${body}</g>` : ''
      const marks = detail ? `<g class="ic-d">${detail}</g>` : ''
      return `<symbol id="i-${name}" viewBox="0 0 20 20">${plate}${body}${marks}${line}</symbol>`
    })
    .join('')

export function IconSprite(): React.JSX.Element {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs dangerouslySetInnerHTML={{ __html: SPRITE }} />
    </svg>
  )
}

export function Icon({ name, className = '' }: { name: string; className?: string }): React.JSX.Element {
  return (
    <svg className={`ic ${className}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}

export function Keys({ keys }: { keys: string[] }): React.JSX.Element {
  return (
    <>
      {keys.map((key, i) => (
        <kbd key={i}>{key}</kbd>
      ))}
    </>
  )
}
