import { type MouseEvent, useEffect, useState } from 'react'
import type { DocLink, DocLinks, LinkKind } from '../../../shared/links'
import type { DocEntry } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { setInsp } from '../shell/notes'
import { openDoc, peekDoc } from '../shell/sheets'
import { data, useShell } from '../shell/state'
import { displayName } from '../tree'
import { Icon } from './icons'
import { SkeletonList } from './Skeleton'

const ICONS: Record<LinkKind, string> = { doc: 'file', file: 'folder', external: 'reveal', missing: 'unsure' }
/** Najpierw to, co apka otworzy sama. Martwe linki zamykają listę. */
const ORDER: Record<LinkKind, number> = { doc: 0, file: 1, external: 2, missing: 3 }

interface Row {
  key: string
  icon: string
  title: string
  sub: string
  /** Martwy link nie ma dokąd zaprowadzić. */
  open: ((peek: boolean) => void) | null
}

const docPlace = (doc: DocEntry): string => `${doc.projectName} · ${doc.relPath}`
const fileName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

function hostOf(href: string): string {
  try {
    return new URL(href).host
  } catch {
    return href
  }
}

function outgoingRow(docId: string, link: DocLink): Row {
  const target = link.docId ? data.entries.get(link.docId) : undefined
  const name = link.path ? fileName(link.path) : hostOf(link.href)
  const follow = (peek: boolean): void => void window.api.followLink(docId, link.href, peek)
  if (link.kind === 'doc' && target) {
    return { key: link.href, icon: ICONS.doc, title: displayName(target), sub: docPlace(target), open: follow }
  }
  const sub = link.kind === 'missing' ? t('Nie ma takiego pliku') : name
  return {
    key: link.href,
    icon: ICONS[link.kind],
    title: link.text || name,
    sub,
    open: link.kind === 'missing' ? null : follow
  }
}

function incomingRow(doc: DocEntry): Row {
  return {
    key: doc.id,
    icon: ICONS.doc,
    title: displayName(doc),
    sub: docPlace(doc),
    open: (peek) => (peek ? peekDoc(doc.id) : openDoc(doc.id))
  }
}

function LinkRow({ row }: { row: Row }): React.JSX.Element {
  const { open } = row
  return (
    <button
      className="link-row"
      disabled={!open}
      title={row.sub}
      onClick={(event: MouseEvent) => open?.(event.ctrlKey || event.metaKey)}
    >
      <Icon name={row.icon} />
      <span className="lr-text">
        <span className="lr-title">{row.title}</span>
        <span className="lr-sub">{row.sub}</span>
      </span>
    </button>
  )
}

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty: string }): React.JSX.Element {
  return (
    <section>
      <h3 className="links-head">
        {title} <span>{rows.length || ''}</span>
      </h3>
      {rows.map((row) => (
        <LinkRow key={row.key} row={row} />
      ))}
      {rows.length === 0 && <p className="empty">{empty}</p>}
    </section>
  )
}

/** Odpowiedź dotyczy jednego dokumentu, więc po zmianie fokusu stara lista nie zostaje na ekranie. */
function useDocLinks(docId: string | null): DocLinks | null {
  const [state, setState] = useState<{ docId: string; links: DocLinks } | null>(null)
  const { library } = data

  useEffect(() => {
    if (!docId) return
    let live = true
    window.api
      .docLinks(docId)
      .then((links) => {
        if (live) setState({ docId, links })
      })
      .catch(() => {
        // Dokument mógł właśnie zniknąć z biblioteki, a wtedy panel i tak się przełączy.
      })
    return () => {
      live = false
    }
  }, [docId, library])

  return state?.docId === docId ? state.links : null
}

export function LinksPanel({ docId }: { docId: string | null }): React.JSX.Element {
  useShell()
  const links = useDocLinks(docId)
  const outgoing = docId
    ? [...(links?.outgoing ?? [])]
        .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
        .map((link) => outgoingRow(docId, link))
    : []
  const incoming = (links?.incoming ?? [])
    .flatMap((id) => data.entries.get(id) ?? [])
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(incomingRow)

  return (
    <>
      <header className="insp-head">
        <strong>
          {t('Linki')} <span>{outgoing.length + incoming.length || ''}</span>
        </strong>
        <button className="mini" aria-label={t('Zamknij linki')} onClick={() => setInsp(false)}>
          <Icon name="x" />
        </button>
      </header>
      <div className="links-list" id="linksList">
        {docId && !links ? (
          <SkeletonList shape="two" count={4} />
        ) : (
          <>
            <Section title={t('Z tego dokumentu')} rows={outgoing} empty={t('Ten dokument do niczego nie linkuje.')} />
            <Section title={t('Do tego dokumentu')} rows={incoming} empty={t('Żaden dokument tu nie linkuje.')} />
          </>
        )}
      </div>
    </>
  )
}
