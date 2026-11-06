import { memo as memoComponent, type MouseEvent, type PointerEvent, type ReactNode, useMemo, useState } from 'react'
import type { Annotation } from '../../../shared/annotations'
import type { DocEntry, ProjectGroup } from '../../../shared/types'
import { rectIn } from '../motion/pill'
import { gripDown, gripLeave, gripMove, gripUp } from '../shell/edge'
import { toggleHome } from '../shell/home'
import { hideFly, holdFly, leaveFly, fly, showFly } from '../shell/keys'
import { cacheReveal, els, hoverPill, railHover, railPill, rope, selPill, setNav, setView, syncSel } from '../shell/layout'
import { load, rescan } from '../shell/library'
import { openCmd } from '../shell/palette'
import { libraryRows, revealInTree, toggleFold, toggleSort } from '../shell/panel'
import { openDoc, openNote, peekDoc } from '../shell/sheets'
import {
  data,
  memo,
  notify,
  type PanelView,
  plural,
  replied,
  STATUS,
  toneOf,
  ui,
  useShell,
  visibleDocs,
  visibleProjects,
  waiting
} from '../shell/state'
import { toggleMode } from '../shell/theme'
import { displayName, inboxDocs, type LibraryRow, relativeTime, type Tone } from '../tree'
import { FormatSeg } from './FormatSeg'
import { useSynced } from './hooks'
import { Icon } from './icons'
import { Windowed } from './Windowed'

const VIEWS: { id: PanelView; label: string; icon: string }[] = [
  { id: 'library', label: 'Biblioteka', icon: 'layers' },
  { id: 'inbox', label: 'Skrzynka', icon: 'inbox' },
  { id: 'notes', label: 'Uwagi', icon: 'bubble' },
  { id: 'review', label: 'Niepewne', icon: 'unsure' }
]

/** Wysokość wiersza z podpisem w skrzynce i w niepewnych. */
const TWO_H = 46

const openNoteList = (): Annotation[] => data.annotations.filter((note) => note.status === 'open')
const inbox = memo(
  () => [data.library] as const,
  (library): DocEntry[] => inboxDocs(library?.projects ?? [])
)
const review = (): DocEntry[] => data.library?.review ?? []
const docTitle = (docId: string): string => {
  const doc = data.entries.get(docId)
  return doc ? displayName(doc) : 'Dokument poza biblioteką'
}

function openFromRow(e: MouseEvent, docId: string): void {
  if (e.ctrlKey || e.metaKey) peekDoc(docId)
  else openDoc(docId)
}

function Rail(): React.JSX.Element {
  useShell()
  const docs = inbox()
  const notes = openNoteList()
  const mark = (id: PanelView): React.JSX.Element | null => {
    if ((id === 'inbox' && docs.some(waiting)) || (id === 'notes' && notes.some(replied))) {
      return <i className="decide" />
    }
    if ((id === 'inbox' && docs.length > 0) || (id === 'review' && review().length > 0)) return <i />
    return null
  }
  const pick = (view: PanelView, e: MouseEvent<HTMLElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    setView(view, r.top + r.height / 2)
  }
  const over = (e: PointerEvent<HTMLElement>): void => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('.rb')
    if (!button) return
    railHover.to(rectIn(button, e.currentTarget))
    const view = button.dataset.view
    if (view && view !== 'folders' && !ui.nav) showFly(view, button)
  }
  const leave = (): void => {
    railHover.hide()
    leaveFly()
  }
  return (
    <div className="rail" id="rail" onPointerOver={over} onPointerLeave={leave}>
      <i className="rail-hover" ref={railHover.bind} />
      <i className="rail-pill" ref={railPill.bind} />
      <button className="logo" id="homeBtn" aria-label="Ekran startowy" onClick={toggleHome}>
        <Icon name="logo" />
      </button>
      <button className="rb" data-open-cmd aria-label="Szukaj" onClick={openCmd}>
        <Icon name="search" />
      </button>
      <span className="rail-gap" />
      {VIEWS.map((view) => (
        <button
          key={view.id}
          className="rb"
          data-view={view.id}
          aria-label={view.label}
          aria-current={ui.view === view.id}
          onClick={(e) => pick(view.id, e)}
        >
          <Icon name={view.icon} />
          {mark(view.id)}
        </button>
      ))}
      <span className="rail-sep" />
      <button
        className="rb"
        data-view="folders"
        aria-label="Foldery"
        aria-current={ui.view === 'folders'}
        onClick={(e) => pick('folders', e)}
      >
        <Icon name="folder" />
      </button>
      <button className="rb" id="railMode" aria-label="Przełącz motyw" onClick={toggleMode}>
        <Icon name={ui.mode === 'dark' ? 'sun' : 'moon'} />
      </button>
    </div>
  )
}

function DocRow({ doc, sub }: { doc: DocEntry; sub?: string }): React.JSX.Element {
  const tone = toneOf(doc)
  const dot = tone === 'none' ? null : <i className={`dot ${tone}`} title={STATUS[doc.status].label} />
  const copy = doc.missing ? <span className="tag">kopia</span> : null
  const label = <span className="lbl">{displayName(doc)}</span>
  const archived = doc.status === 'archived' ? ' archived' : ''
  if (sub) {
    return (
      <button className={`row two rv${archived}`} data-doc={doc.id} title={doc.path} onClick={(e) => openFromRow(e, doc.id)}>
        <span className="line">
          {label}
          {copy}
          {dot}
        </span>
        <span className="sub">{sub}</span>
      </button>
    )
  }
  return (
    <button className={`row rv${archived}`} data-doc={doc.id} title={doc.path} onClick={(e) => openFromRow(e, doc.id)}>
      {label}
      {copy}
      {dot}
    </button>
  )
}

function Slot({
  y,
  from = 0,
  ghost = false,
  enter = false,
  children
}: {
  y: number
  from?: number
  ghost?: boolean
  enter?: boolean
  children: ReactNode
}): React.JSX.Element {
  const className = `vr${ghost ? ' ghost' : ''}${enter ? ' enter' : ''}`
  return (
    <div className={className} style={{ '--y': `${y}px`, '--from': `${from}px` } as React.CSSProperties}>
      {children}
    </div>
  )
}

function FoldSignal({ tone, closed }: { tone: Tone; closed: boolean }): React.JSX.Element | null {
  return closed && tone !== 'none' ? <i className={`dot ${tone}`} /> : null
}

function FolderRow({ row }: { row: Extract<LibraryRow, { type: 'folder' }> }): React.JSX.Element {
  const { node, closed } = row
  const pullRequest = node.branch?.pullRequest
  return (
    <button
      className={`row rv${closed ? ' closed' : ''}${node.archive ? ' quiet' : ''}`}
      aria-expanded={!closed}
      onClick={() => toggleFold(node.key)}
    >
      <Icon name={node.archive ? 'archive' : node.branch ? 'branch' : 'folder'} />
      <span className="lbl">{node.name}</span>
      {pullRequest && (
        <span className="tag" title={`${pullRequest.title} (${pullRequest.state})`}>
          #{pullRequest.number}
        </span>
      )}
      <FoldSignal tone={node.tone} closed={closed} />
      {(closed || node.archive) && <span className="num">{node.count}</span>}
    </button>
  )
}

function ProjectRow({ row }: { row: Extract<LibraryRow, { type: 'project' }> }): React.JSX.Element {
  const { model, closed } = row
  return (
    <button
      className={`row head rv${closed ? ' closed' : ''}${model.stale ? ' quiet' : ''}`}
      title={model.project.path}
      aria-expanded={!closed}
      onClick={() => toggleFold(model.project.id)}
    >
      <Icon name="chev" className="chev" />
      <span className="lbl">{model.project.name}</span>
      <FoldSignal tone={model.tone} closed={closed} />
      <span className="num">{model.count}</span>
    </button>
  )
}

const TreeRow = memoComponent(function TreeRow({ row }: { row: LibraryRow }): React.JSX.Element {
  // Klasa liczy się tylko przy pojawieniu się wiersza, więc nie może śledzić kolejnych rozwinięć.
  const [enter] = useState(() => ui.unfolded !== null && row.chain.includes(ui.unfolded))
  return (
    <Slot y={row.y} from={row.from} ghost={row.ghost} enter={enter}>
      {row.guides.map((x) => (
        <i className="tg" key={x} style={{ left: x }} />
      ))}
      {row.elbow !== null && <i className="te" style={{ left: row.elbow }} />}
      <span className="row-at" style={{ marginLeft: row.indent }}>
        {row.type === 'project' ? (
          <ProjectRow row={row} />
        ) : row.type === 'folder' ? (
          <FolderRow row={row} />
        ) : (
          <DocRow doc={row.doc} />
        )}
      </span>
    </Slot>
  )
})

function ListTools(): React.JSX.Element {
  const recent = ui.sort === 'recent'
  const label = recent ? 'Sortowanie: ostatnie zmiany' : 'Sortowanie: nazwa'
  return (
    <div className="list-tools rv">
      <FormatSeg />
      <button className="mini" aria-label={label} title={label} onClick={toggleSort}>
        <Icon name={recent ? 'clock' : 'sort'} />
      </button>
    </div>
  )
}

function LibraryList(): React.JSX.Element {
  const { rows, height } = libraryRows()
  return (
    <>
      <ListTools />
      <Windowed rows={rows} height={height} render={(row) => <TreeRow key={row.key} row={row} />} />
    </>
  )
}

function DocList({ docs, sub }: { docs: DocEntry[]; sub: (doc: DocEntry) => string }): React.JSX.Element {
  const rows = useMemo(() => docs.map((doc, i) => ({ key: doc.id, y: i * TWO_H, doc })), [docs])
  return (
    <Windowed
      rows={rows}
      height={rows.length * TWO_H}
      render={(row) => (
        <Slot key={row.key} y={row.y}>
          <span className="row-at">
            <DocRow doc={row.doc} sub={sub(row.doc)} />
          </span>
        </Slot>
      )}
    />
  )
}

function NotesView(): React.JSX.Element {
  const notes = openNoteList()
    .filter((note) => note.audience === ui.notesAud)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const setAudience = (audience: 'me' | 'agent'): void => {
    ui.notesAud = audience
    notify()
  }
  return (
    <>
      <div className="seg rv" role="radiogroup" aria-label="Filtr uwag">
        {(['me', 'agent'] as const).map((audience) => (
          <button
            key={audience}
            role="radio"
            aria-checked={ui.notesAud === audience}
            className={ui.notesAud === audience ? 'on' : ''}
            onClick={() => setAudience(audience)}
          >
            {audience === 'me' ? 'Dla mnie' : 'Dla agenta'}
          </button>
        ))}
      </div>
      {notes.length === 0 && <p className="empty rv">Brak otwartych uwag.</p>}
      {notes.map((note) => (
        <button key={note.id} className="row two rv" data-open-note={note.id} onClick={() => openNote(note.id)}>
          <span className="line">
            {note.kind === 'sticky' && <span className={`note-mark ${note.color ?? 'yellow'}`} />}
            <span className="lbl">{note.messages[0]?.text}</span>
          </span>
          <span className="sub">{docTitle(note.docId)}</span>
        </button>
      ))}
    </>
  )
}

function FoldersView(): React.JSX.Element {
  const library = data.library
  const roots = library?.roots ?? []
  const links = library?.folderLinks ?? []
  const unavailable = new Set(library?.unavailableRoots ?? [])
  return (
    <div className="folders">
      <p className="f-lead rv">
        Apka szuka dokumentów HTML i Markdown w tych folderach i ich podfolderach, a nowe pliki wykrywa sama. Niczego nie zmienia ani
        nie przenosi. Kopie dokumentów trzyma w folderze HtmlDocs.
      </p>
      {roots.map((root) => (
        <div className="f-row rv" key={root}>
          <span className="lbl" title={root}>
            {root}
            {unavailable.has(root) && <em> (niedostępny)</em>}
          </span>
          <button className="mini" aria-label={`Usuń ${root}`} onClick={() => load(() => window.api.removeRoot(root))}>
            <Icon name="x" />
          </button>
        </div>
      ))}
      <button className="ask f-action rv" onClick={() => load(window.api.addRoot)}>
        <Icon name="folder" />
        <span>Dodaj foldery</span>
      </button>
      {roots.length > 0 && (
        <>
          <h2 className="f-head rv">Foldery przypisane do repozytoriów</h2>
          <p className="f-lead rv">
            Dokumenty z takiego folderu trafiają do projektu repozytorium i dostają branch z chwili powstania, ale nie trafiają
            do samego repozytorium.
          </p>
          {links.map((link) => (
            <div className="f-row rv" key={link.folder}>
              <span className="lbl" title={`${link.folder} → ${link.repo}`}>
                {link.folder}
                <small>{link.repo}</small>
              </span>
              <button
                className="mini"
                aria-label={`Odłącz ${link.folder}`}
                onClick={() => load(() => window.api.unlinkFolder(link.folder))}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
          <button className="ask f-action rv" onClick={() => load(window.api.linkFolder)}>
            <Icon name="branch" />
            <span>Przypisz folder do repozytorium</span>
          </button>
        </>
      )}
    </div>
  )
}

function panelHeading(): { title: string; sub: string } {
  const projects = visibleProjects().length
  const docs = visibleDocs().length
  const roots = data.library?.roots.length ?? 0
  switch (ui.view) {
    case 'library':
      return {
        title: 'Biblioteka',
        sub: ui.setup
          ? 'Nie ma jeszcze dokumentów'
          : `${docs} ${plural(docs, 'dokument', 'dokumenty', 'dokumentów')}, ${projects} ${plural(projects, 'projekt', 'projekty', 'projektów')}`
      }
    case 'inbox': {
      const n = inbox().length
      return { title: 'Skrzynka', sub: `${n} ${plural(n, 'czeka', 'czekają', 'czeka')} na Ciebie` }
    }
    case 'notes': {
      const n = openNoteList().length
      return { title: 'Uwagi', sub: `${n} ${plural(n, 'otwarta', 'otwarte', 'otwartych')}` }
    }
    case 'review':
      return { title: 'Niepewne', sub: 'Dodaj do biblioteki albo pomiń' }
    case 'folders':
      return { title: 'Foldery', sub: `${roots} ${plural(roots, 'folder', 'foldery', 'folderów')}` }
  }
}

function PanelItems(): React.JSX.Element {
  switch (ui.view) {
    case 'library':
      if (!data.library) return <p className="empty rv">Skanuję foldery…</p>
      return <LibraryList />
    case 'inbox': {
      const docs = inbox()
      if (docs.length === 0) return <p className="empty rv">Skrzynka jest pusta.</p>
      return <DocList docs={docs} sub={(doc) => `${doc.projectName} · ${relativeTime(doc.mtimeMs)}`} />
    }
    case 'notes':
      return <NotesView />
    case 'review': {
      const docs = review()
      if (docs.length === 0) return <p className="empty rv">Nie ma niepewnych plików.</p>
      return <DocList docs={docs} sub={(doc) => `${doc.projectName} · ${doc.reason}`} />
    }
    case 'folders':
      return <FoldersView />
  }
}

function Panel(): React.JSX.Element {
  useShell()
  const { title, sub } = panelHeading()
  useSynced(() => syncSel(true))
  const focused = ui.home ? null : (ui.panes[ui.focus] ?? null)
  useSynced(() => revealInTree(focused), [focused])
  const moved = (e: PointerEvent<HTMLElement>): void => {
    const row = (e.target as HTMLElement).closest('.row')
    if (row) hoverPill.to(rectIn(row, e.currentTarget))
    else hoverPill.hide()
  }
  return (
    <div className="nav-clip" id="navClip">
      <div className="panel" id="panel">
        <div className="panel-head rv">
          <div>
            <strong>{title}</strong>
            <span>{sub}</span>
          </div>
          <button className="mini" aria-label="Skanuj foldery" aria-busy={data.scanning} onClick={rescan}>
            <Icon name="refresh" />
          </button>
        </div>
        <div
          className="panel-scroll"
          id="panelScroll"
          onPointerMove={moved}
          onPointerLeave={() => hoverPill.hide()}
          onScroll={() => {
            if (els.nav.classList.contains('moving')) cacheReveal()
          }}
        >
          <i className="hover-pill rv" ref={hoverPill.bind} />
          <i className="sel-pill rv" ref={selPill.bind} />
          <div id="panelItems" className="swap" key={ui.view}>
            <PanelItems />
          </div>
        </div>
      </div>
    </div>
  )
}

export function Nav(): React.JSX.Element {
  return (
    <div className="nav" id="nav">
      <svg className="shape" aria-hidden="true">
        <path
          id="navPath"
          ref={(element) => {
            rope.path = element
          }}
        />
      </svg>
      <Rail />
      <Panel />
      <div
        className="nav-grip"
        id="navGrip"
        onPointerDown={gripDown}
        onPointerMove={gripMove}
        onPointerUp={gripUp}
        onPointerLeave={gripLeave}
      />
      <button className="nav-chev" id="navChev" aria-label="Zwiń lub rozwiń nawigację" onClick={() => setNav(!ui.nav)}>
        <Icon name="prev" />
      </button>
    </div>
  )
}

function flyRows(view: string): { key: string; title: string; open: () => void }[] {
  const doc = (item: DocEntry): { key: string; title: string; open: () => void } => ({
    key: item.id,
    title: displayName(item),
    open: () => openDoc(item.id)
  })
  if (view === 'inbox') return inbox().map(doc)
  if (view === 'review') return review().map(doc)
  if (view === 'notes') {
    return openNoteList().map((note) => ({
      key: note.id,
      title: note.messages[0]?.text ?? '',
      open: () => openNote(note.id)
    }))
  }
  return [...visibleDocs()].sort((a, b) => b.mtimeMs - a.mtimeMs).map(doc)
}

/** Podgląd widoku na zwiniętej szynie. Ta sama treść co w panelu, tylko pierwsze pozycje. */
export function Flyout(): React.JSX.Element {
  useShell()
  const view = fly.view
  const label = VIEWS.find((item) => item.id === view)?.label
  const rows = view ? flyRows(view).slice(0, 5) : []
  return (
    <div
      className="flyout"
      id="flyout"
      style={{ left: fly.left, top: fly.top }}
      onPointerEnter={holdFly}
      onPointerLeave={leaveFly}
    >
      <header>{label}</header>
      {rows.map((row) => (
        <button
          key={row.key}
          className="row"
          onClick={() => {
            row.open()
            hideFly()
          }}
        >
          <span className="lbl">{row.title}</span>
        </button>
      ))}
    </div>
  )
}
