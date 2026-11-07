import { useEffect, useLayoutEffect, useRef } from 'react'
import { t } from '../../../shared/i18n'
import { clamp } from '../motion/spring'
import { askHitShot, hitShot } from '../shell/hitPreview'
import { card, useCard } from '../shell/hoverCard'
import { els } from '../shell/layout'
import { askLinkShot, linkCardRow, linkShot } from '../shell/linkShots'
import { libraryRows } from '../shell/panel'
import { search, searchModel } from '../shell/search'
import { countDocs, data, STATUS, toneOf, useShell } from '../shell/state'
import { displayName, type LibraryRow, relativeTime } from '../tree'
import { Icon } from './icons'
import { LabelTags } from './Labels'

/** Odstęp karty od krawędzi okna i jej wysunięcie nad górną krawędź wiersza. */
const EDGE = 8
const LIFT = 10

const rowOf = (key: string): LibraryRow | undefined => libraryRows().rows.find((row) => row.key === key)

function DocCard({ id }: { id: string }): React.JSX.Element | null {
  const doc = data.entries.get(id)
  if (!doc) return null
  const thumb = data.thumbs.get(doc.id)
  const tone = toneOf(doc)
  return (
    <>
      <div className="thumb hc-thumb" data-format={doc.format}>
        {thumb && <img src={thumb.url} alt="" draggable={false} />}
      </div>
      <p className="hc-title">{displayName(doc)}</p>
      <p className="hc-path">
        <span>{doc.projectName}</span>
        {doc.branch && <span> · {doc.branch}</span>}
        <br />
        {doc.relPath}
      </p>
      <p className="hc-meta">
        <i className={`dot ${tone === 'none' ? STATUS[doc.status].tone : tone}`} />
        <span>{STATUS[doc.status].label}</span>
        <span>·</span>
        <span>{relativeTime(doc.mtimeMs)}</span>
        {doc.missing && <span className="tag">{t('kopia')}</span>}
      </p>
      {doc.labels.length > 0 && (
        <p className="hc-tags">
          <LabelTags doc={doc} max={4} />
        </p>
      )}
    </>
  )
}

function FolderCard({ row }: { row: Extract<LibraryRow, { type: 'folder' }> }): React.JSX.Element {
  const { node } = row
  const pullRequest = node.branch?.pullRequest
  const [path, ...more] = node.paths
  return (
    <>
      <p className="hc-title">
        <Icon name={node.archive ? 'archive' : node.branch ? 'branch' : 'folder'} />
        <span>{node.name}</span>
      </p>
      {path && (
        <p className="hc-path">
          {path}
          {more.length > 0 && <span> {t('i {n} więcej', { n: more.length })}</span>}
        </p>
      )}
      {pullRequest && (
        <p className="hc-text">
          #{pullRequest.number} {pullRequest.title} <span className="hc-quiet">({pullRequest.state})</span>
        </p>
      )}
      <p className="hc-meta">
        <span>{countDocs(node.count)}</span>
        <span>·</span>
        <span>{relativeTime(node.latest)}</span>
      </p>
    </>
  )
}

function ProjectCard({ row }: { row: Extract<LibraryRow, { type: 'project' }> }): React.JSX.Element {
  const { model } = row
  return (
    <>
      <p className="hc-title">{model.project.name}</p>
      <p className="hc-path">{model.project.path}</p>
      <p className="hc-meta">
        <span>{countDocs(model.count)}</span>
        <span>·</span>
        <span>{relativeTime(model.latest)}</span>
      </p>
    </>
  )
}

/** Miejsce trafienia z podświetleniem. Zanim przyjdzie zrzut, i gdy go nie będzie, stoi sam cytat. */
function HitCard({ at }: { at: number }): React.JSX.Element | null {
  // Karta mogła stanąć bez wejścia kursora na wiersz, np. gdy pod nim zmieniły się wyniki.
  useEffect(() => askHitShot(at))
  const item = searchModel().hits[at]
  if (!item) return null
  const { doc, hit } = item
  const shot = hitShot(at)
  const found = search.docs.find((entry) => entry.docId === doc.id)
  const index = found ? found.hits.indexOf(hit) : -1
  const before = hit.before.trimStart()
  const after = hit.after.trimEnd()
  return (
    <>
      <div className={shot === undefined ? 'hc-shot wait' : 'hc-shot'} data-format={doc.format}>
        <p className="hc-quote">
          {before && `…${before}`}
          <mark>{hit.match}</mark>
          {after && `${after}…`}
        </p>
        {shot && <img src={shot} alt="" draggable={false} />}
      </div>
      <p className="hc-title">{displayName(doc)}</p>
      <p className="hc-meta">
        <span>{doc.projectName}</span>
        {found && index >= 0 && (
          <>
            <span>·</span>
            <span>{t('{done} z {total}', { done: index + 1, total: found.count })}</span>
          </>
        )}
      </p>
    </>
  )
}

/**
 * Wiersz panelu Linki: cel na kotwicy albo miejsce, z którego inny dokument tu linkuje.
 * Zanim przyjdzie zrzut, link na początek dokumentu pokazuje miniaturę, bo to ten sam kadr.
 */
function LinkCard({ id }: { id: string }): React.JSX.Element | null {
  useEffect(() => askLinkShot(id))
  const row = linkCardRow(id)
  const doc = row && data.entries.get(row.docId)
  if (!row || !doc) return null
  const shot = linkShot(id)
  const thumb = row.request.kind === 'outgoing' && !row.fragment ? data.thumbs.get(doc.id) : undefined
  const place =
    row.request.kind === 'incoming' ? t('Linkuje tutaj') : row.fragment ? `#${row.fragment}` : relativeTime(doc.mtimeMs)
  return (
    <>
      {(shot !== null || thumb) && (
        <div className={shot === undefined ? 'hc-shot wait' : 'hc-shot'} data-format={doc.format}>
          {shot ? <img src={shot} alt="" draggable={false} /> : thumb && <img className="hc-top" src={thumb.url} alt="" draggable={false} />}
        </div>
      )}
      <p className="hc-title">{displayName(doc)}</p>
      <p className="hc-meta">
        <span>{doc.projectName}</span>
        <span>·</span>
        <span className="hc-place">{place}</span>
      </p>
    </>
  )
}

function CardBody(): React.JSX.Element | null {
  const target = card.target
  if (!target) return null
  if (target.kind === 'doc') return <DocCard id={target.id} />
  if (target.kind === 'link') return <LinkCard id={target.key} />
  if (target.kind === 'hit') return <HitCard at={target.at} />
  const row = rowOf(target.key)
  if (row?.type === 'folder') return <FolderCard row={row} />
  if (row?.type === 'project') return <ProjectCard row={row} />
  return null
}

/** Podgląd wiersza z panelu. Rysuje się nad zrzutem arkusza, tak jak menu wiersza. */
export function HoverCard(): React.JSX.Element {
  // Miniatura dochodzi przez zwykłe `notify()`, a zmiana wiersza przez własny sygnał karty.
  useShell()
  useCard()
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !card.on) return
    // Szeroka karta trafienia nie może wyjść za krawędź wąskiego okna.
    el.style.maxWidth = `${Math.max(0, card.before ? card.left - EDGE : els.app.clientWidth - card.left - EDGE)}px`
    el.style.left = `${card.before ? Math.max(EDGE, card.left - el.offsetWidth) : card.left}px`
    const height = els.app.clientHeight
    el.style.top = `${clamp(card.rowTop - LIFT, EDGE, Math.max(EDGE, height - el.offsetHeight - EDGE))}px`
  })
  const wide = card.target?.kind === 'hit' || card.target?.kind === 'link'
  const className = `hcard${wide ? ' wide' : ''}${card.before ? ' before' : ''}${card.on ? ' on' : ''}${card.on && card.glide ? ' glide' : ''}`
  return (
    <div className={className} id="hoverCard" ref={box} aria-hidden="true">
      <CardBody />
    </div>
  )
}
