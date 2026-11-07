import { useLayoutEffect, useRef } from 'react'
import { t } from '../../../shared/i18n'
import { clamp } from '../motion/spring'
import { card, useCard } from '../shell/hoverCard'
import { els } from '../shell/layout'
import { libraryRows } from '../shell/panel'
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

function CardBody(): React.JSX.Element | null {
  const target = card.target
  if (!target) return null
  if (target.kind === 'doc') return <DocCard id={target.id} />
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
    const height = els.app.clientHeight
    el.style.top = `${clamp(card.rowTop - LIFT, EDGE, Math.max(EDGE, height - el.offsetHeight - EDGE))}px`
  })
  const className = `hcard${card.on ? ' on' : ''}${card.on && card.glide ? ' glide' : ''}`
  return (
    <div className={className} id="hoverCard" ref={box} style={{ left: card.left }} aria-hidden="true">
      <CardBody />
    </div>
  )
}
