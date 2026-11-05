import { useEffect, useMemo, useState } from 'react'
import type { Annotation, Audience } from '../../shared/annotations'
import type { DocEntry, LibrarySnapshot, SearchHit } from '../../shared/types'
import { buildTree, displayName, inboxDocs, relativeTime, type TreeNode } from './tree'

export type SidebarView = 'library' | 'inbox' | 'notes' | 'review'

const SEARCH_DELAY_MS = 150

const Chevron = ({ open }: { open: boolean }): React.JSX.Element => (
  <svg className={open ? 'chevron open' : 'chevron'} viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M6 4l4 4-4 4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

function rowClass(doc: DocEntry, selectedId: string | null): string {
  return ['row', 'doc', doc.id === selectedId && 'selected', doc.status === 'archived' && 'archived']
    .filter(Boolean)
    .join(' ')
}

const StatusMark = ({ doc }: { doc: DocEntry }): React.JSX.Element | null => {
  if (doc.status === 'to-read') return <span className="mark unread" title="Do przeczytania" />
  if (doc.status === 'to-decide') return <span className="mark decide" title="Do decyzji" />
  return null
}

interface TreeProps {
  nodes: TreeNode[]
  depth: number
  selectedId: string | null
  collapsed: Set<string>
  onToggle: (key: string) => void
  onSelect: (doc: DocEntry) => void
}

function Tree({ nodes, depth, ...props }: TreeProps): React.JSX.Element {
  const { selectedId, collapsed, onToggle, onSelect } = props
  const indent = { paddingLeft: 10 + depth * 14 }

  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'doc') {
          return (
            <button
              key={node.key}
              className={rowClass(node.doc, selectedId)}
              style={indent}
              title={node.doc.path}
              onClick={() => onSelect(node.doc)}
            >
              <span className="label">{displayName(node.doc)}</span>
              {node.doc.missing && <span className="tag">kopia</span>}
              <StatusMark doc={node.doc} />
            </button>
          )
        }
        const open = !collapsed.has(node.key)
        const pullRequest = node.branch?.pullRequest
        return (
          <div key={node.key}>
            <button
              className={node.branch ? 'row branch' : 'row folder'}
              style={indent}
              aria-expanded={open}
              onClick={() => onToggle(node.key)}
            >
              <Chevron open={open} />
              <span className="label">{node.name}</span>
              {pullRequest && (
                <span className="tag" title={`${pullRequest.title} (${pullRequest.state})`}>
                  #{pullRequest.number}
                </span>
              )}
            </button>
            {open && <Tree nodes={node.children} depth={depth + 1} {...props} />}
          </div>
        )
      })}
    </>
  )
}

interface DocListProps {
  docs: DocEntry[]
  selectedId: string | null
  empty: string
  detail: (doc: DocEntry) => string
  onSelect: (doc: DocEntry) => void
}

function DocList({ docs, selectedId, empty, detail, onSelect }: DocListProps): React.JSX.Element {
  if (docs.length === 0) return <p className="muted tree-empty">{empty}</p>
  return (
    <>
      {docs.map((doc) => (
        <button
          key={doc.id}
          className={`${rowClass(doc, selectedId)} two-line`}
          title={doc.path}
          onClick={() => onSelect(doc)}
        >
          <span className="line">
            <span className="label">{displayName(doc)}</span>
            <StatusMark doc={doc} />
          </span>
          <span className="sub">{detail(doc)}</span>
        </button>
      ))}
    </>
  )
}

function SearchResults({
  query,
  selectedId,
  onSelect
}: {
  query: string
  selectedId: string | null
  onSelect: (doc: DocEntry) => void
}): React.JSX.Element {
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      void window.api.search(query).then((results) => {
        if (current) setHits(results)
      })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  if (hits === null) return <p className="muted tree-empty">Szukam…</p>
  if (hits.length === 0) return <p className="muted tree-empty">Brak wyników.</p>
  return (
    <>
      {hits.map(({ doc, before, match, after }) => (
        <button
          key={doc.id}
          className={`${rowClass(doc, selectedId)} two-line`}
          title={doc.path}
          onClick={() => onSelect(doc)}
        >
          <span className="line">
            <span className="label">{displayName(doc)}</span>
          </span>
          <span className="snippet">
            {before}
            <mark>{match}</mark>
            {after}
          </span>
        </button>
      ))}
    </>
  )
}

function NotesList({
  annotations,
  docs,
  onOpen
}: {
  annotations: Annotation[]
  docs: DocEntry[]
  onOpen: (annotation: Annotation) => void
}): React.JSX.Element {
  const [audience, setAudience] = useState<Audience>('me')
  const titles = useMemo(() => new Map(docs.map((doc) => [doc.id, displayName(doc)])), [docs])
  const visible = annotations
    .filter((item) => item.status === 'open' && item.audience === audience)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <>
      <div className="switch wide" role="radiogroup" aria-label="Filtr uwag">
        {(['me', 'agent'] as const).map((option) => (
          <button
            key={option}
            role="radio"
            aria-checked={audience === option}
            className={audience === option ? 'active' : ''}
            onClick={() => setAudience(option)}
          >
            {option === 'me' ? 'Dla mnie' : 'Dla agenta'}
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="muted tree-empty">Brak otwartych uwag.</p>}
      {visible.map((annotation) => (
        <button key={annotation.id} className="row doc two-line" onClick={() => onOpen(annotation)}>
          <span className="line">
            {annotation.kind === 'sticky' && (
              <span className={`swatch small ${annotation.color ?? 'yellow'}`} aria-hidden="true" />
            )}
            <span className="label">{annotation.messages[0]?.text}</span>
          </span>
          <span className="sub">{titles.get(annotation.docId) ?? 'Dokument poza biblioteką'}</span>
        </button>
      ))}
    </>
  )
}

interface SidebarProps {
  library: LibrarySnapshot | null
  annotations: Annotation[]
  view: SidebarView
  selectedId: string | null
  collapsed: Set<string>
  scanning: boolean
  onView: (view: SidebarView) => void
  onToggle: (key: string) => void
  onSelect: (doc: DocEntry) => void
  onOpenNote: (annotation: Annotation) => void
  onShowFolders: () => void
  onRescan: () => void
}

export function Sidebar(props: SidebarProps): React.JSX.Element {
  const { library, annotations, view, selectedId, collapsed, scanning } = props
  const { onView, onToggle, onSelect, onOpenNote, onShowFolders, onRescan } = props
  const [query, setQuery] = useState('')

  const projects = library?.projects
  const inbox = useMemo(() => inboxDocs(projects ?? []), [projects])
  const review = library?.review ?? []
  const allDocs = useMemo(() => projects?.flatMap((project) => project.docs) ?? [], [projects])
  const openNotes = annotations.filter((item) => item.status === 'open').length
  const searching = query.trim().length > 0

  const tabs: { id: SidebarView; label: string; count: number | null }[] = [
    { id: 'library', label: 'Biblioteka', count: null },
    { id: 'inbox', label: 'Skrzynka', count: inbox.length },
    { id: 'notes', label: 'Uwagi', count: openNotes },
    { id: 'review', label: 'Niepewne', count: review.length }
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <input
          type="search"
          placeholder="Szukaj w treści dokumentów"
          aria-label="Szukaj w treści dokumentów"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!searching && (
          <div className="tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={view === tab.id}
                className={view === tab.id ? 'tab active' : 'tab'}
                onClick={() => onView(tab.id)}
              >
                {tab.label}
                {tab.count ? <span className="count">{tab.count}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="tree" aria-label="Dokumenty">
        {searching ? (
          <SearchResults query={query} selectedId={selectedId} onSelect={onSelect} />
        ) : view === 'inbox' ? (
          <DocList
            docs={inbox}
            selectedId={selectedId}
            empty="Skrzynka jest pusta."
            detail={(doc) => `${doc.projectName} · ${relativeTime(doc.mtimeMs)}`}
            onSelect={onSelect}
          />
        ) : view === 'notes' ? (
          <NotesList annotations={annotations} docs={allDocs} onOpen={onOpenNote} />
        ) : view === 'review' ? (
          <DocList
            docs={review}
            selectedId={selectedId}
            empty="Nie ma niepewnych plików."
            detail={(doc) => `${doc.projectName} · ${doc.reason}`}
            onSelect={onSelect}
          />
        ) : (
          <>
            {!library && <p className="muted tree-empty">Skanuję foldery…</p>}
            {(projects ?? []).map((project) => {
              const open = !collapsed.has(project.id)
              return (
                <div key={project.id}>
                  <button
                    className="row project"
                    title={project.path}
                    aria-expanded={open}
                    onClick={() => onToggle(project.id)}
                  >
                    <Chevron open={open} />
                    <span className="label">{project.name}</span>
                    <span className="count">{project.docs.length}</span>
                  </button>
                  {open && (
                    <Tree
                      nodes={buildTree(project)}
                      depth={1}
                      selectedId={selectedId}
                      collapsed={collapsed}
                      onToggle={onToggle}
                      onSelect={onSelect}
                    />
                  )}
                </div>
              )
            })}
            {!scanning && library && library.roots.length > 0 && library.projects.length === 0 && (
              <p className="muted tree-empty">Nie znaleziono dokumentów.</p>
            )}
          </>
        )}
      </nav>

      <footer className="sidebar-foot">
        <button className="ghost" onClick={onShowFolders}>
          Foldery
        </button>
        <span className="muted foot-note">
          {library && library.ignoredCount > 0 ? `Pominięto ${library.ignoredCount}` : ''}
        </span>
        <button className="ghost" disabled={scanning} onClick={onRescan}>
          {scanning ? 'Skanuję…' : 'Skanuj'}
        </button>
      </footer>
    </aside>
  )
}
