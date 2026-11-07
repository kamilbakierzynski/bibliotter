import { type KeyboardEvent, memo as memoComponent, type MouseEvent, type PointerEvent, type ReactNode, useMemo, useState } from 'react'
import type { Annotation } from '../../../shared/annotations'
import { cleanLabel, isTicket, type LabelCount, MAX_LABEL_LENGTH, type TicketRow } from '../../../shared/labels'
import type { DocEntry, ProjectGroup } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { isOtterDay } from '../../../shared/otter'
import { laneIn, rectIn } from '../motion/pill'
import { isArranging, liftedKey, pressRow } from '../shell/arrange'
import { gripDown, gripLeave, gripMove, gripUp } from '../shell/edge'
import { dismissCard, hideCard, hoverRow } from '../shell/hoverCard'
import { hideFly, holdFly, leaveFly, fly, showFly } from '../shell/keys'
import { closeTickets, foundTickets, openLabel, searchTickets, showingTickets, showLabel, showTickets } from '../shell/labels'
import { cacheReveal, els, hoverPill, railHover, railPill, rope, selPill, setNav, setView, syncSel } from '../shell/layout'
import { load, rescan } from '../shell/library'
import { closeRowMenu, openRowMenu } from '../shell/menu'
import { bindLogo, logoClick, logoDown, logoMove, logoUp } from '../shell/mascot'
import { aimAt } from '../shell/native'
import { openCmd } from '../shell/palette'
import { openOptions, optionsHeading } from '../shell/options'
import { clearPocket, pocket, pocketDocs } from '../shell/pocket'
import { libraryRows, revealInTree, toggleFold, toggleSort } from '../shell/panel'
import { hitPill, searchModel } from '../shell/search'
import { openAs, openDoc, openNote } from '../shell/sheets'
import { openModeOf } from '../../../shared/links'
import {
  colorAttr,
  countDocs,
  data,
  kindCatalog,
  labelCatalog,
  labelDocs,
  libraryDocs,
  memo,
  MOD,
  noteText,
  notify,
  type PanelView,
  plural,
  replied,
  STATUS,
  ticketCatalog,
  ticketHref,
  toneOf,
  ui,
  useShell,
  visibleDocs,
  visibleProjects,
  waiting
} from '../shell/state'
import { toggleMode } from '../shell/theme'
import { displayName, inboxDocs, type LibraryRow, relativeTime, type Tone } from '../tree'
import { FoldAll, SearchField, searchHeading, SearchList } from './Find'
import { FormatSeg } from './FormatSeg'
import { useSynced } from './hooks'
import { Icon } from './icons'
import { LabelSwatches, LabelTags } from './Labels'
import { LogoMark } from './LogoMark'
import { Otter } from './Otter'
import { OptionsView } from './Options'
import { RenameField } from './RowMenu'
import { SkeletonLine, SkeletonList, type SkeletonShape } from './Skeleton'
import { Windowed } from './Windowed'

const views = (): { id: PanelView; label: string; icon: string }[] => [
  { id: 'library', label: t('Biblioteka'), icon: 'layers' },
  { id: 'search', label: t('Szukaj w treści'), icon: 'textsearch' },
  { id: 'inbox', label: t('Skrzynka'), icon: 'inbox' },
  { id: 'pocket', label: t('Kieszeń'), icon: 'pocket' },
  { id: 'notes', label: t('Uwagi'), icon: 'bubble' },
  { id: 'labels', label: t('Etykiety'), icon: 'tag' },
  { id: 'review', label: t('Niepewne'), icon: 'unsure' }
]

/** Wysokość wiersza z podpisem w skrzynce i w niepewnych. */
const TWO_H = 46

/** Dokument z ukrytego folderu nie ma skąd się otworzyć, więc jego uwagi nie mogą czekać na szynie. */
const openNoteList = (): Annotation[] => data.annotations.filter((note) => note.status === 'open' && data.entries.has(note.docId))
const inbox = memo(
  () => [data.library] as const,
  (library): DocEntry[] => inboxDocs(library?.projects ?? [])
)
const review = (): DocEntry[] => data.library?.review ?? []
const docTitle = (docId: string): string => {
  const doc = data.entries.get(docId)
  return doc ? displayName(doc) : t('Dokument poza biblioteką')
}

function openFromRow(e: MouseEvent, docId: string): void {
  openAs(docId, openModeOf(e))
}

function Rail(): React.JSX.Element {
  useShell()
  const docs = inbox()
  const notes = openNoteList()
  const otterDay = isOtterDay(new Date())
  const mark = (id: PanelView): React.JSX.Element | null => {
    if ((id === 'inbox' && docs.some(waiting)) || (id === 'notes' && notes.some(replied))) {
      return <i className="decide" />
    }
    if ((id === 'inbox' && docs.length > 0) || (id === 'review' && review().length > 0)) return <i />
    if (id === 'pocket' && pocket.ids.length > 0) return <b className="pocket-count">{pocketDocs().length || null}</b>
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
    if (view && view !== 'folders' && view !== 'options' && view !== 'search' && !ui.nav) showFly(view, button)
  }
  const leave = (): void => {
    railHover.hide()
    leaveFly()
  }
  return (
    <div className="rail" id="rail" onPointerOver={over} onPointerLeave={leave}>
      <i className="rail-hover" ref={railHover.bind} />
      <i className="rail-pill" ref={railPill.bind} />
      <button
        ref={bindLogo}
        className={otterDay ? 'logo otter-day' : 'logo'}
        id="homeBtn"
        aria-label={t('Ekran startowy')}
        title={otterDay ? t('Dziś Światowy Dzień Wydry') : undefined}
        onClick={logoClick}
        onPointerDown={logoDown}
        onPointerMove={logoMove}
        onPointerUp={logoUp}
        onPointerCancel={logoUp}
      >
        <LogoMark />
      </button>
      <button className="rb" data-open-cmd aria-label={t('Szukaj')} onClick={openCmd}>
        <Icon name="search" />
      </button>
      <span className="rail-gap" />
      {views().map((view) => (
        <button
          key={view.id}
          className={view.id === 'pocket' && pocket.bump ? 'rb bump' : 'rb'}
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
        aria-label={t('Foldery')}
        aria-current={ui.view === 'folders'}
        onClick={(e) => pick('folders', e)}
      >
        <Icon name="folder" />
      </button>
      <button
        className="rb"
        id="railOptions"
        data-view="options"
        aria-label={t('Opcje')}
        aria-current={ui.view === 'options'}
        onClick={(e) => pick('options', e)}
      >
        <Icon name="gear" />
      </button>
      <button className="rb" id="railMode" aria-label={t('Przełącz motyw')} onClick={toggleMode}>
        <Icon name={ui.mode === 'dark' ? 'sun' : 'moon'} />
      </button>
    </div>
  )
}

function DocRow({ doc, sub }: { doc: DocEntry; sub?: string }): React.JSX.Element {
  const tone = toneOf(doc)
  const dot = tone === 'none' ? null : <i className={`dot ${tone}`} title={STATUS[doc.status].label} />
  const copy = (
    <>
      <LabelTags doc={doc} max={1} />
      {doc.missing && <span className="tag">{t('kopia')}</span>}
    </>
  )
  const label = <span className="lbl">{displayName(doc)}</span>
  const archived = doc.status === 'archived' ? ' archived' : ''
  const menu = (e: MouseEvent<HTMLElement>): void => openRowMenu(e, { kind: 'doc', doc })
  if (sub) {
    return (
      <button
        className={`row two rv${archived}`}
        data-doc={doc.id}
        onClick={(e) => openFromRow(e, doc.id)}
        onContextMenu={menu}
      >
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
    <button
      className={`row rv${archived}`}
      data-doc={doc.id}
      onClick={(e) => openFromRow(e, doc.id)}
      onContextMenu={menu}
    >
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
  lift = false,
  rowKey,
  children
}: {
  y: number
  from?: number
  ghost?: boolean
  enter?: boolean
  /** Wiersz chwycony do przestawienia. Jedzie za kursorem, a nie na swoje miejsce. */
  lift?: boolean
  rowKey?: string
  children: ReactNode
}): React.JSX.Element {
  const className = `vr${ghost ? ' ghost' : ''}${enter ? ' enter' : ''}${lift ? ' lift' : ''}`
  return (
    <div className={className} data-key={rowKey} style={{ '--y': `${y}px`, '--from': `${from}px` } as React.CSSProperties}>
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
      data-folder={node.key}
      aria-expanded={!closed}
      onClick={() => toggleFold(node.key)}
      onContextMenu={(e) => openRowMenu(e, { kind: 'folder', node })}
    >
      <Icon name={node.archive ? 'archive' : node.branch ? 'branch' : 'folder'} />
      <span className="lbl">{node.name}</span>
      {pullRequest && (
        <span className="tag">#{pullRequest.number}</span>
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
      data-project={model.project.id}
      aria-expanded={!closed}
      onClick={() => toggleFold(model.project.id)}
      onContextMenu={(e) => openRowMenu(e, { kind: 'project', project: model.project })}
    >
      <Icon name="chev" className="chev" />
      <span className="lbl">{model.project.name}</span>
      <FoldSignal tone={model.tone} closed={closed} />
      <span className="num">{model.count}</span>
    </button>
  )
}

/** Gdzie w wierszu zaczyna się nazwa, za ikoną i jej odstępem. */
const NAME_AT = { project: 22, folder: 24, doc: 1 }

const TreeRow = memoComponent(function TreeRow({ row, lifted }: { row: LibraryRow; lifted: boolean }): React.JSX.Element {
  // Klasa liczy się tylko przy pojawieniu się wiersza, więc nie może śledzić kolejnych rozwinięć.
  const [enter] = useState(() => ui.unfolded !== null && row.chain.includes(ui.unfolded))
  return (
    <Slot y={row.y} from={row.from} ghost={row.ghost} enter={enter} lift={lifted} rowKey={row.key}>
      {row.guides.map((x) => (
        <i className="tg" key={x} style={{ left: x }} />
      ))}
      {row.elbow !== null && <i className="te" style={{ left: row.elbow }} />}
      <span className="row-at" style={{ marginLeft: row.indent, '--indent': `${row.indent}px` } as React.CSSProperties}>
        {row.type === 'project' ? (
          <ProjectRow row={row} />
        ) : row.type === 'folder' ? (
          <FolderRow row={row} />
        ) : (
          <DocRow doc={row.doc} />
        )}
        <RenameField rowKey={row.key} offset={NAME_AT[row.type]} />
      </span>
    </Slot>
  )
})

const sortLabel = (): string =>
  ui.sort === 'recent'
    ? t('Sortowanie: ostatnie zmiany')
    : ui.sort === 'name'
      ? t('Sortowanie: nazwa')
      : t('Sortowanie: ręczne')

const SORT_ICON = { recent: 'clock', name: 'sort', manual: 'arrange' } as const

function ListTools(): React.JSX.Element {
  const label = sortLabel()
  return (
    <div className="list-tools rv">
      <FormatSeg />
      <button className="mini" aria-label={label} title={label} onClick={toggleSort}>
        <Icon name={SORT_ICON[ui.sort]} />
      </button>
    </div>
  )
}

function LibraryList(): React.JSX.Element {
  const { rows, height } = libraryRows()
  const lifted = liftedKey()
  return (
    <Windowed rows={rows} height={height} render={(row) => <TreeRow key={row.key} row={row} lifted={row.key === lifted} />} />
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
            <RenameField rowKey={row.key} />
          </span>
        </Slot>
      )}
    />
  )
}

/**
 * Przeczytanie zdejmuje ze skrzynki tylko dokumenty do przeczytania. Do decyzji zostają, bo
 * przeczytanie decyzji nie podejmuje. Cofnij wraca do tych, które zmieniło i których nikt od tej
 * pory nie przestawił. Pamięć ginie razem z widokiem, bo panel rysuje go od nowa po przełączeniu.
 */
function InboxView(): React.JSX.Element {
  const docs = inbox()
  const [undo, setUndo] = useState<string[] | null>(null)
  const unread = docs.filter((doc) => doc.status === 'to-read')
  const readAll = (): void => {
    const ids = unread.map((doc) => doc.id)
    setUndo(ids)
    load(() => window.api.setStatuses(ids, 'read'))
  }
  const restore = (): void => {
    const ids = (undo ?? []).filter((id) => data.entries.get(id)?.status === 'read')
    setUndo(null)
    if (ids.length > 0) load(() => window.api.setStatuses(ids, 'to-read'))
  }
  return (
    <>
      {undo ? (
        <div className="list-tools inbox-tools rv">
          <span className="inbox-done">{t('Przeczytano {docs}', { docs: countDocs(undo.length) })}</span>
          <button className="ask" id="inboxUndo" onClick={restore}>
            <Icon name="undo" />
            <span>{t('Cofnij')}</span>
          </button>
        </div>
      ) : (
        unread.length > 0 && (
          <div className="list-tools inbox-tools rv">
            <button className="ask" id="inboxReadAll" onClick={readAll}>
              <Icon name="check" />
              <span>{t('Oznacz wszystkie jako przeczytane')}</span>
            </button>
          </div>
        )
      )}
      {docs.length === 0 ? (
        <div className="empty-otter rv">
          <Otter pose="sleeping" />
          <p className="empty">{t('Skrzynka jest pusta.')}</p>
        </div>
      ) : (
        <DocList docs={docs} sub={(doc) => `${doc.projectName} · ${relativeTime(doc.mtimeMs)}`} />
      )}
    </>
  )
}

function PocketView(): React.JSX.Element {
  const docs = pocketDocs()
  if (docs.length === 0) {
    return (
      <div className="empty-otter rv">
        <Otter pose="portrait" className="pocket-otter" />
        <p className="empty">{t('Kieszeń jest pusta.')}</p>
        <p className="empty pocket-hint">{t('Otwórz dokument i naciśnij K albo wybierz „Włóż do kieszeni” z menu wiersza. Ctrl z cyfrą otworzy go jednym skrótem.')}</p>
      </div>
    )
  }
  const place = new Map(docs.map((doc, i) => [doc.id, i + 1]))
  return (
    <>
      <div className="list-tools rv">
        <button className="ask" id="pocketClear" onClick={clearPocket}>
          <Icon name="x" />
          <span>{t('Opróżnij kieszeń')}</span>
        </button>
      </div>
      <DocList docs={docs} sub={(doc) => `${MOD} ${place.get(doc.id)} · ${doc.projectName}`} />
    </>
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
      <div className="seg rv" role="radiogroup" aria-label={t('Filtr uwag')}>
        {(['me', 'agent'] as const).map((audience) => (
          <button
            key={audience}
            role="radio"
            aria-checked={ui.notesAud === audience}
            className={ui.notesAud === audience ? 'on' : ''}
            onClick={() => setAudience(audience)}
          >
            {audience === 'me' ? t('Dla mnie') : t('Dla agenta')}
          </button>
        ))}
      </div>
      {notes.length === 0 && (
        <div className="empty-otter rv">
          <Otter pose="sleeping" />
          <p className="empty">{t('Brak otwartych uwag.')}</p>
        </div>
      )}
      {notes.map((note) => (
        <button key={note.id} className="row two rv" data-open-note={note.id} onClick={() => openNote(note.id)}>
          <span className="line">
            {note.kind === 'sticky' && <span className={`note-mark ${note.color ?? 'yellow'}`} />}
            {note.kind === 'highlight' && <span className={`note-mark dab ${note.color ?? 'yellow'}`} />}
            <span className="lbl">{noteText(note)}</span>
          </span>
          <span className="sub">{docTitle(note.docId)}</span>
        </button>
      ))}
    </>
  )
}

function LabelTools({ name, count }: LabelCount): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [sure, setSure] = useState(false)
  const rename = (value: string): void => {
    setEditing(false)
    const next = cleanLabel(value)
    if (!next || next === name) return
    ui.label = next
    void window.api.renameLabel(name, next)
  }
  if (editing) {
    return (
      <div className="label-tools rv">
        <input
          autoFocus
          type="text"
          defaultValue={name}
          maxLength={MAX_LABEL_LENGTH}
          spellCheck={false}
          aria-label={t('Nowa nazwa etykiety')}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') rename(e.currentTarget.value)
            else if (e.key === 'Escape') setEditing(false)
            else return
            // Klawisz należy do pola, więc nie może dojść do skrótów apki.
            e.stopPropagation()
          }}
        />
      </div>
    )
  }
  return (
    <div className="label-tools rv">
      <button
        className="mini"
        aria-label={ui.tickets ? t('Wszystkie kody') : t('Wszystkie etykiety')}
        onClick={() => {
          ui.label = null
          notify()
        }}
      >
        <Icon name="prev" />
      </button>
      <button className="ask" onClick={() => setEditing(true)}>
        <span>{t('Zmień nazwę')}</span>
      </button>
      <button
        className="ask"
        onPointerLeave={() => setSure(false)}
        onClick={() => {
          if (sure) void window.api.deleteLabel(name)
          setSure(true)
        }}
      >
        <span>{sure ? t('Usuń z {count} {docs}', { count, docs: plural(count, 'dokumentu', 'dokumentów', 'dokumentów') }) : t('Usuń')}</span>
      </button>
    </div>
  )
}

function LabelDocs({ name }: { name: string }): React.JSX.Element {
  const all = libraryDocs()
  const docs = useMemo(() => labelDocs(all, name), [all, name])
  return <DocList docs={docs} sub={(doc) => `${doc.projectName} · ${relativeTime(doc.mtimeMs)}`} />
}

function TicketItem({ name, count, title }: TicketRow): React.JSX.Element {
  const href = ticketHref(name)
  const open = t('Otwórz {code} w Jira', { code: name })
  return (
    <div className="ticket rv">
      <button className="row two" data-color={colorAttr(name)} onClick={() => showLabel(name)}>
        <span className="line">
          <Icon name="tag" />
          <span className="lbl">{name}</span>
          {count > 1 && <span className="num">{count}</span>}
        </span>
        <span className="sub">{title}</span>
      </button>
      {href && (
        <button className="mini" title={open} aria-label={open} onClick={() => void window.api.openExternal(href)}>
          <Icon name="reveal" />
        </button>
      )}
    </div>
  )
}

/** Dłuższa lista i tak nie jest do przewijania, a każdy wiersz to kolejny kawałek DOM. */
const MAX_TICKET_ROWS = 200
const JIRA = 'Jira'

function TicketsView(): React.JSX.Element {
  const found = foundTickets()
  const key = (e: KeyboardEvent<HTMLInputElement>): void => {
    const [first] = found
    if (e.key === 'Enter' && first) showLabel(first.name)
    else if (e.key === 'Escape' && ui.ticketQuery) searchTickets('')
    else if (e.key === 'Escape') closeTickets()
    else return
    // Klawisz należy do pola, więc nie może dojść do skrótów apki.
    e.stopPropagation()
  }
  return (
    <>
      <div className="label-tools rv">
        <button className="mini" aria-label={t('Wszystkie etykiety')} onClick={closeTickets}>
          <Icon name="prev" />
        </button>
        <input
          id="ticketSearch"
          type="text"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={t('Szukaj kodu lub tematu')}
          aria-label={t('Szukaj kodu lub tematu')}
          value={ui.ticketQuery}
          onChange={(e) => searchTickets(e.target.value)}
          onKeyDown={key}
        />
      </div>
      {found.length === 0 && (
        <div className="empty-otter rv">
          <Otter pose="swimming" />
          <p className="label-hint">{t('Nic nie pasuje. Spróbuj innego słowa.')}</p>
        </div>
      )}
      {found.slice(0, MAX_TICKET_ROWS).map((row) => (
        <TicketItem key={row.name} {...row} />
      ))}
      {found.length > MAX_TICKET_ROWS && (
        <p className="label-hint rv">{t('Pokazuję {shown} z {total}. Zawęź wyszukiwanie.', { shown: MAX_TICKET_ROWS, total: found.length })}</p>
      )}
    </>
  )
}

function TicketLink({ name }: { name: string }): React.JSX.Element {
  const href = ticketHref(name)
  if (href) {
    return (
      <button className="row rv" id="ticketOpen" onClick={() => void window.api.openExternal(href)}>
        <Icon name="reveal" />
        <span className="lbl">{t('Otwórz w Jira')}</span>
      </button>
    )
  }
  return (
    <button className="row quiet rv" id="ticketSetup" onClick={() => openOptions('jira')}>
      <Icon name="link" />
      <span className="lbl">{t('Ustaw adres Jira')}</span>
    </button>
  )
}

function LabelsView(): React.JSX.Element {
  const kinds = kindCatalog()
  const tickets = ticketCatalog()
  const open = openLabel()
  if (open) {
    return (
      <>
        <LabelTools key={open.name} {...open} />
        {isTicket(open.name) && <TicketLink name={open.name} />}
        <LabelSwatches name={open.name} />
        <LabelDocs name={open.name} />
      </>
    )
  }
  if (showingTickets()) return <TicketsView />
  return (
    <>
      {ui.autoLabel.error && <p className="label-hint rv">{ui.autoLabel.error}</p>}
      {kinds.length + tickets.length === 0 && <p className="empty rv">{t('Nie ma jeszcze etykiet. Otwórz dokument i naciśnij L.')}</p>}
      {kinds.map(({ name, count }) => (
        <button key={name} className="row rv" data-color={colorAttr(name)} onClick={() => showLabel(name)}>
          <Icon name="tag" />
          <span className="lbl">{name}</span>
          <span className="num">{count}</span>
        </button>
      ))}
      {tickets.length > 0 && (
        <button className="row rv" id="ticketsRow" onClick={showTickets}>
          <Icon name="layers" />
          <span className="lbl">{JIRA}</span>
          <span className="num">{tickets.length}</span>
        </button>
      )}
    </>
  )
}

function FoldersView(): React.JSX.Element {
  const library = data.library
  const roots = library?.roots ?? []
  const links = library?.folderLinks ?? []
  const hidden = library?.hiddenFolders ?? []
  const unavailable = new Set(library?.unavailableRoots ?? [])
  return (
    <div className="folders">
      <p className="f-lead rv">
        {t(
          t('Apka szuka dokumentów HTML i Markdown w tych folderach i ich podfolderach, a nowe pliki wykrywa sama. Niczego nie zmienia ani nie przenosi. Kopie dokumentów trzyma w folderze Bibliotter.')
        )}
      </p>
      {roots.map((root) => (
        <div className="f-row rv" key={root}>
          <span className="lbl" title={root}>
            {root}
            {unavailable.has(root) && <em> ({t('niedostępny')})</em>}
          </span>
          <button className="mini" aria-label={t('Usuń {name}', { name: root })} onClick={() => load(() => window.api.removeRoot(root))}>
            <Icon name="x" />
          </button>
        </div>
      ))}
      <button className="ask f-action rv" onClick={() => load(window.api.addRoot)}>
        <Icon name="folder" />
        <span>{t('Dodaj foldery')}</span>
      </button>
      {roots.length > 0 && (
        <>
          <h2 className="f-head rv">{t('Foldery przypisane do repozytoriów')}</h2>
          <p className="f-lead rv">
            {t(
              t('Dokumenty z takiego folderu trafiają do projektu repozytorium i dostają branch z chwili powstania, ale nie trafiają do samego repozytorium.')
            )}
          </p>
          {links.map((link) => (
            <div className="f-row rv" key={link.folder}>
              <span className="lbl" title={`${link.folder} → ${link.repo}`}>
                {link.folder}
                <small>{link.repo}</small>
              </span>
              <button
                className="mini"
                aria-label={t('Odłącz {name}', { name: link.folder })}
                onClick={() => load(() => window.api.unlinkFolder(link.folder))}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
          <button className="ask f-action rv" onClick={() => load(window.api.linkFolder)}>
            <Icon name="branch" />
            <span>{t('Przypisz folder do repozytorium')}</span>
          </button>
        </>
      )}
      {hidden.length > 0 && (
        <>
          <h2 className="f-head rv">{t('Ukryte foldery')}</h2>
          <p className="f-lead rv">
            {t(
              t('Apka pomija je przy skanowaniu, więc ich dokumentów nie ma w bibliotece, w skrzynce ani w wyszukiwarce, a agent nie dostaje ich przez CLI i MCP. Pliki zostają na dysku, a po przywróceniu wracają ze statusem i uwagami.')
            )}
          </p>
          {hidden.map((folder) => (
            <div className="f-row rv" key={folder}>
              <span className="lbl" title={folder}>
                {folder}
              </span>
              <button
                className="mini"
                aria-label={t('Przywróć {name}', { name: folder })}
                title={t('Przywróć')}
                onClick={() => load(() => window.api.showFolder(folder))}
              >
                <Icon name="eye" />
              </button>
            </div>
          ))}
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
        title: t('Biblioteka'),
        sub: ui.setup
          ? t('Nie ma jeszcze dokumentów')
          : `${docs} ${plural(docs, 'dokument', 'dokumenty', 'dokumentów')}, ${projects} ${plural(projects, 'projekt', 'projekty', 'projektów')}`
      }
    case 'inbox': {
      const n = inbox().length
      return { title: t('Skrzynka'), sub: t('{n} {waits} na Ciebie', { n, waits: plural(n, 'czeka', 'czekają', 'czeka') }) }
    }
    case 'pocket':
      return { title: t('Kieszeń'), sub: t('Dokumenty pod ręką') }
    case 'notes': {
      const n = openNoteList().length
      return { title: t('Uwagi'), sub: `${n} ${plural(n, 'otwarta', 'otwarte', 'otwartych')}` }
    }
    case 'labels': {
      const open = openLabel()
      if (open) return { title: open.name, sub: countDocs(open.count) }
      if (showingTickets()) {
        const codes = ticketCatalog().length
        return { title: JIRA, sub: `${codes} ${plural(codes, 'kod', 'kody', 'kodów')}` }
      }
      const n = labelCatalog().length
      return { title: t('Etykiety'), sub: `${n} ${plural(n, 'etykieta', 'etykiety', 'etykiet')}` }
    }
    case 'review':
      return { title: t('Niepewne'), sub: t('Dodaj do biblioteki albo pomiń') }
    case 'search':
      return { title: t('Szukaj w treści'), sub: searchHeading() }
    case 'folders':
      return { title: t('Foldery'), sub: `${roots} ${plural(roots, 'folder', 'foldery', 'folderów')}` }
    case 'options':
      return optionsHeading()
  }
}

/** Te widoki liczą z biblioteki, więc przed pierwszą migawką nie mają czego pokazać. */
const awaitsLibrary = (): boolean => !data.library && ui.view !== 'search' && ui.view !== 'options'

const SKELETON_SHAPES: Partial<Record<PanelView, SkeletonShape>> = { inbox: 'two', pocket: 'two', notes: 'two', review: 'two' }

function PanelItems(): React.JSX.Element {
  if (awaitsLibrary()) {
    return <SkeletonList shape={ui.view === 'library' ? 'tree' : SKELETON_SHAPES[ui.view]} />
  }
  switch (ui.view) {
    case 'library':
      return <LibraryList />
    case 'inbox':
      return <InboxView />
    case 'pocket':
      return <PocketView />
    case 'notes':
      return <NotesView />
    case 'labels':
      return <LabelsView />
    case 'review': {
      const docs = review()
      if (docs.length === 0) return <p className="empty rv">{t('Nie ma niepewnych plików.')}</p>
      return <DocList docs={docs} sub={(doc) => `${doc.projectName} · ${t(doc.reason)}`} />
    }
    case 'search':
      return <SearchList />
    case 'folders':
      return <FoldersView />
    case 'options':
      return <OptionsView />
  }
}

function Panel(): React.JSX.Element {
  useShell()
  const { title, sub } = panelHeading()
  useSynced(() => {
    syncSel(true)
    // Wiersz dorysowany, gdy lina już jedzie, maska chowałaby w całości aż do jej zatrzymania.
    if (els.nav.classList.contains('moving')) cacheReveal()
  })
  const focused = ui.home ? null : (ui.panes[ui.focus] ?? null)
  useSynced(() => revealInTree(focused), [focused])
  const moved = (e: PointerEvent<HTMLElement>): void => {
    if (isArranging()) return
    const row = (e.target as HTMLElement).closest<HTMLElement>('.row')
    if (row) hoverPill.to(laneIn(row, e.currentTarget))
    else hoverPill.hide()
    aimAt(row?.dataset.doc ?? null)
    hoverRow(row)
  }
  return (
    <div className="nav-clip" id="navClip">
      <div className="panel" id="panel">
        <div className="panel-head rv">
          <div>
            <strong>{title}</strong>
            <span>{awaitsLibrary() ? <SkeletonLine /> : sub}</span>
          </div>
          {ui.view === 'search' && searchModel().docs > 1 && <FoldAll />}
          {ui.view !== 'options' && ui.view !== 'search' && (
            <button className="mini" aria-label={t('Skanuj foldery')} aria-busy={data.scan.active} onClick={rescan}>
              <Icon name="refresh" />
            </button>
          )}
        </div>
        {ui.view === 'search' && <SearchField />}
        {/* Filtr i sortowanie stoją nad przewijaną listą, żeby nie uciekały z widoku. */}
        {ui.view === 'library' && <ListTools />}
        <div
          className="panel-scroll"
          id="panelScroll"
          onPointerMove={moved}
          onPointerDown={(e) => {
            dismissCard()
            if (ui.view === 'library') pressRow(e)
          }}
          onContextMenuCapture={dismissCard}
          onPointerLeave={() => {
            hoverPill.hide()
            aimAt(null)
            hoverRow(null)
          }}
          onScroll={() => {
            closeRowMenu()
            if (!isArranging()) hideCard()
            if (els.nav.classList.contains('moving')) cacheReveal()
          }}
        >
          <i className="hover-pill rv" ref={hoverPill.bind} />
          <i className="sel-pill rv" ref={selPill.bind} />
          <i className="sel-pill rv" ref={hitPill.bind} />
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
      <button className="nav-chev" id="navChev" aria-label={t('Zwiń lub rozwiń nawigację')} onClick={() => setNav(!ui.nav)}>
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
  if (view === 'pocket') return pocketDocs().map(doc)
  if (view === 'review') return review().map(doc)
  if (view === 'labels') {
    const kinds = kindCatalog().map(({ name }) => ({ key: name, title: name, open: () => showLabel(name) }))
    return ticketCatalog().length > 0 ? [...kinds, { key: 'jira', title: JIRA, open: showTickets }] : kinds
  }
  if (view === 'notes') {
    return openNoteList().map((note) => ({
      key: note.id,
      title: noteText(note),
      open: () => openNote(note.id)
    }))
  }
  return [...visibleDocs()].sort((a, b) => b.mtimeMs - a.mtimeMs).map(doc)
}

/** Podgląd widoku na zwiniętej szynie. Ta sama treść co w panelu, tylko pierwsze pozycje. */
export function Flyout(): React.JSX.Element {
  useShell()
  const view = fly.view
  const label = views().find((item) => item.id === view)?.label
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
      {view && !data.library && <SkeletonList count={3} />}
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
