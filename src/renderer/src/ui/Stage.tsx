import { type PointerEvent, useRef } from 'react'
import type { DocEntry } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { clamp } from '../motion/spring'
import { closeThread, cancelDraft, togglePanel } from '../shell/notes'
import { drawingsHidden, hasDrawings, toggleDrawings } from '../shell/drawings'
import { els, ratio, type Sheet, sheets } from '../shell/layout'
import { openTicket, showLabel } from '../shell/labels'
import { classifyDoc } from '../shell/library'
import { touch } from '../shell/native'
import { find, toggleFind } from '../shell/find'
import { closePeek, closeSheet, focusPane, pinPeek, reloadSheet, splitKey } from '../shell/sheets'
import { colorAttr, data, findNote, pinned, ticketHref, ui, useShell } from '../shell/state'
import { blockedLabel, displayName, relativeTime } from '../tree'
import { FindBar } from './Find'
import { Home } from './Home'
import { Icon } from './icons'
import { DraftBubble, ThreadPop } from './Notes'
import { PairLink } from './Pair'
import { SkeletonSheet } from './Skeleton'

const pullRequestOf = (doc: DocEntry): { number: number; title: string; url: string } | undefined =>
  doc.branch ? data.library?.projects.find((project) => project.name === doc.projectName)?.pullRequests[doc.branch] : undefined

function Meta({ doc }: { doc: DocEntry }): React.JSX.Element {
  const pullRequest = pullRequestOf(doc)
  return (
    <span className="pl-meta">
      <PairLink doc={doc} />
      {doc.labels.map((name) =>
        ticketHref(name) ? (
          <button key={name} className="tag label link" data-color={colorAttr(name)} title={t('Otwórz {code} w Jira', { code: name })} onClick={() => openTicket(name)}>
            {name}
          </button>
        ) : (
          <button key={name} className="tag label" data-color={colorAttr(name)} title={t('Pokaż dokumenty z tą etykietą')} onClick={() => showLabel(name)}>
            {name}
          </button>
        )
      )}
      <span>{doc.projectName}</span>
      {doc.branch && (
        <>
          <Icon name="branch" />
          <span>{doc.branch}</span>
        </>
      )}
      {doc.commit && <span title={doc.commit}>{doc.commit.slice(0, 7)}</span>}
      {pullRequest && (
        <button className="pl-link" title={pullRequest.title} onClick={() => void window.api.openExternal(pullRequest.url)}>
          PR #{pullRequest.number}
        </button>
      )}
      <span>{relativeTime(doc.mtimeMs)}</span>
    </span>
  )
}

function Placard({ i, doc }: { i: number; doc: DocEntry | undefined }): React.JSX.Element {
  if (!doc) return <header className="placard" />
  const viewer = data.viewers.get(doc.id)
  const outdated = data.opened.has(doc.id) && data.opened.get(doc.id) !== doc.mtimeMs
  const notes = data.annotations.filter((note) => note.docId === doc.id && note.status === 'open').length
  const blocked = viewer?.blockedRequests ?? 0
  const hidden = drawingsHidden(doc.id)
  return (
    <header className="placard">
      <div className="pl-text">
        <span className="pl-title" title={doc.path}>
          {displayName(doc)}
        </span>
        <Meta doc={doc} />
        {doc.missing && <span className="notice">{t('Oryginał zniknął, to zachowana kopia')}</span>}
        {blocked > 0 && (
          <span className="notice" title={viewer?.blockedHosts.join('\n')}>
            {blockedLabel(blocked)}
          </span>
        )}
      </div>
      {find.open && find.docId === doc.id && ui.panes[ui.focus] === doc.id && <FindBar />}
      <div className="pl-actions">
        <span className="pl-moved">
          {(hidden || hasDrawings(doc.id)) && (
            <button
              className={hidden ? 'mini on' : 'mini'}
              data-moved="drawings"
              aria-pressed={hidden}
              aria-label={hidden ? t('Pokaż rysunki') : t('Schowaj rysunki')}
              onClick={() => toggleDrawings(doc.id)}
            >
              <Icon name={hidden ? 'eye-off' : 'shape'} />
            </button>
          )}
          <button className="mini" data-moved="find" aria-label={t('Szukaj w dokumencie')} onClick={toggleFind}>
            <Icon name="textsearch" />
          </button>
          <button className={pinned() > 1 ? 'mini on' : 'mini'} data-moved="split" aria-label={t('Podziel widok')} onClick={splitKey}>
            <Icon name="split" />
          </button>
          <button className={ui.insp && ui.inspView === 'notes' ? 'mini on' : 'mini'} data-moved="insp" aria-label={t('Uwagi')} onClick={() => togglePanel('notes')}>
            <Icon name="bubble" />
            {notes > 0 && <em>{notes}</em>}
          </button>
          <button className={ui.insp && ui.inspView === 'links' ? 'mini on' : 'mini'} data-moved="links" aria-label={t('Linki')} onClick={() => togglePanel('links')}>
            <Icon name="link" />
          </button>
          <button className={ui.insp && ui.inspView === 'outline' ? 'mini on' : 'mini'} data-moved="outline" aria-label={t('Spis treści')} onClick={() => togglePanel('outline')}>
            <Icon name="toc" />
          </button>
        </span>
        {doc.classification === 'review' && (
          <>
            <button className="ask pl-solid" onClick={() => classifyDoc(doc.id, 'document')}>
              <span>{t('Dodaj do biblioteki')}</span>
            </button>
            <button className="ask" onClick={() => classifyDoc(doc.id, 'ignored')}>
              <span>{t('Pomiń')}</span>
            </button>
          </>
        )}
        {outdated ? (
          <button className="ask pl-solid" data-act="refresh" onClick={() => reloadSheet(doc.id)}>
            <Icon name="refresh" />
            <span>{t('Pokaż nową wersję')}</span>
          </button>
        ) : (
          <button className="mini" data-act="refresh" aria-label={t('Odśwież dokument')} onClick={() => reloadSheet(doc.id)}>
            <Icon name="refresh" />
          </button>
        )}
        {!doc.missing && (
          <button className="mini" data-act="reveal" aria-label={t('Pokaż w folderze')} onClick={() => void window.api.revealDoc(doc.id)}>
            <Icon name="reveal" />
          </button>
        )}
        <button className="ask pl-pin" onClick={pinPeek}>
          <Icon name="split" />
          <span>{t('Przypnij obok')}</span>
        </button>
        <button className="mini pl-close" aria-label={t('Zamknij arkusz')} onClick={() => closeSheet(i)}>
          <Icon name="x" />
        </button>
      </div>
    </header>
  )
}

function Pane({ sheet }: { sheet: Sheet }): React.JSX.Element {
  const { i } = sheet
  const id = ui.panes[i] ?? null
  const doc = id ? data.entries.get(id) : undefined
  const thumb = id ? data.thumbs.get(id) : undefined
  const status = id ? data.viewers.get(id)?.status : undefined
  const failed = status === 'error'
  // Miniatura sama jest podglądem, a gotowy dokument stoi już nad powłoką.
  const opening = id !== null && !thumb && !failed && status !== 'ready'
  const note =ui.selNote && i === ui.focus && !ui.insp && ui.threadRect ? findNote(ui.selNote) : undefined
  // W prezentacji szkic dostaje pole nad dokiem, a nie dymek nad arkuszem.
  const draft = ui.draft?.rect && ui.draft.docId === id && ui.presenting !== id ? ui.draft : null

  const press = (e: PointerEvent<HTMLElement>): void => {
    if (ui.peek !== null && ui.peek !== i) {
      closePeek()
      return
    }
    if ((e.target as HTMLElement).closest('.sheet')) focusPane(i)
    else if (ui.focus !== i) focusPane(i)
  }

  const clickSheet = (e: React.MouseEvent<HTMLElement>): void => {
    const target = e.target as HTMLElement
    if (target.closest('.th-pop, .draft')) return
    if (ui.selNote) closeThread()
    const text = e.currentTarget.querySelector<HTMLTextAreaElement>('.bubble textarea')
    if (text && !text.value.trim()) cancelDraft()
  }

  return (
    <section
      ref={(element) => {
        sheet.el = element
      }}
      className="pane"
      data-pane={i}
      aria-label={t('Dokument')}
      onPointerDown={press}
    >
      <Placard i={i} doc={doc} />
      <div
        ref={(element) => {
          sheet.box = element
        }}
        className="sheet"
        data-format={doc?.format}
        onClick={clickSheet}
      >
        {thumb && <img className="sheet-thumb" src={thumb.url} alt="" draggable={false} />}
        {opening && <SkeletonSheet />}
        <div className="sheet-stack" />
        {failed && <p className="sheet-note">{t('Nie udało się otworzyć dokumentu.')}</p>}
        {note && <ThreadPop key={note.id} note={note} sheet={sheet} />}
        {draft && <DraftBubble key={`${draft.docId}:${draft.rect?.x}:${draft.rect?.y}`} draft={draft} sheet={sheet} />}
      </div>
    </section>
  )
}

function SplitHandle(): React.JSX.Element {
  const dragging = useRef(false)
  const move = (e: PointerEvent<HTMLElement>): void => {
    if (!dragging.current) return
    const r = els.stage.getBoundingClientRect()
    ratio.to(clamp((e.clientX - r.left) / r.width, 0.28, 0.72))
    touch()
  }
  return (
    <button
      className="split-handle"
      id="splitHandle"
      aria-label={t('Zmień proporcje widoku')}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
      }}
      onPointerMove={move}
      onPointerUp={() => {
        dragging.current = false
      }}
    >
      <i />
    </button>
  )
}

export function Stage(): React.JSX.Element {
  useShell()
  const press = (e: PointerEvent<HTMLElement>): void => {
    if ((e.target as HTMLElement).closest('.pane')) return
    if (ui.home && ui.peek !== null) {
      els.home.dataset.skip = '1'
      closePeek()
    }
  }
  return (
    <main className="stage" id="stage" onPointerDown={press}>
      <Home />
      <SplitHandle />
      {sheets.map((sheet) => (
        <Pane key={sheet.i} sheet={sheet} />
      ))}
    </main>
  )
}
