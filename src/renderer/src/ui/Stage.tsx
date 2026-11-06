import { type PointerEvent, useRef } from 'react'
import type { DocEntry } from '../../../shared/types'
import { clamp } from '../motion/spring'
import { closeThread, cancelDraft, setInsp } from '../shell/notes'
import { els, ratio, type Sheet, sheets } from '../shell/layout'
import { classifyDoc } from '../shell/library'
import { touch } from '../shell/native'
import { closePeek, closeSheet, focusPane, pinPeek, reloadSheet, splitKey } from '../shell/sheets'
import { data, findNote, pinned, ui, useShell } from '../shell/state'
import { blockedLabel, displayName, relativeTime } from '../tree'
import { Home } from './Home'
import { Icon } from './icons'
import { DraftBubble, ThreadPop } from './Notes'

const pullRequestOf = (doc: DocEntry): { number: number; title: string; url: string } | undefined =>
  doc.branch ? data.library?.projects.find((project) => project.name === doc.projectName)?.pullRequests[doc.branch] : undefined

function Meta({ doc }: { doc: DocEntry }): React.JSX.Element {
  const pullRequest = pullRequestOf(doc)
  return (
    <span className="pl-meta">
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
  return (
    <header className="placard">
      <div className="pl-text">
        <span className="pl-title" title={doc.path}>
          {displayName(doc)}
        </span>
        <Meta doc={doc} />
        {doc.missing && <span className="notice">Oryginał zniknął, to zachowana kopia</span>}
        {blocked > 0 && (
          <span className="notice" title={viewer?.blockedHosts.join('\n')}>
            {blockedLabel(blocked)}
          </span>
        )}
      </div>
      <div className="pl-actions">
        <span className="pl-moved">
          <button className={pinned() > 1 ? 'mini on' : 'mini'} data-moved="split" aria-label="Podziel widok" onClick={splitKey}>
            <Icon name="split" />
          </button>
          <button className={ui.insp ? 'mini on' : 'mini'} data-moved="insp" aria-label="Uwagi" onClick={() => setInsp(!ui.insp)}>
            <Icon name="bubble" />
            {notes > 0 && <em>{notes}</em>}
          </button>
        </span>
        {doc.classification === 'review' && (
          <>
            <button className="ask pl-solid" onClick={() => classifyDoc(doc.id, 'document')}>
              <span>Dodaj do biblioteki</span>
            </button>
            <button className="ask" onClick={() => classifyDoc(doc.id, 'ignored')}>
              <span>Pomiń</span>
            </button>
          </>
        )}
        {outdated ? (
          <button className="ask pl-solid" data-act="refresh" onClick={() => reloadSheet(doc.id)}>
            <Icon name="refresh" />
            <span>Pokaż nową wersję</span>
          </button>
        ) : (
          <button className="mini" data-act="refresh" aria-label="Odśwież dokument" onClick={() => reloadSheet(doc.id)}>
            <Icon name="refresh" />
          </button>
        )}
        {!doc.missing && (
          <button className="mini" data-act="reveal" aria-label="Pokaż w folderze" onClick={() => void window.api.revealDoc(doc.id)}>
            <Icon name="reveal" />
          </button>
        )}
        <button className="ask pl-pin" onClick={pinPeek}>
          <Icon name="split" />
          <span>Przypnij obok</span>
        </button>
        <button className="mini pl-close" aria-label="Zamknij arkusz" onClick={() => closeSheet(i)}>
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
  const failed = id ? data.viewers.get(id)?.status === 'error' : false
  const note = ui.selNote && i === ui.focus && !ui.insp && ui.threadRect ? findNote(ui.selNote) : undefined
  const draft = ui.draft?.rect && ui.draft.docId === id ? ui.draft : null

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
      aria-label="Dokument"
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
        <div className="sheet-stack" />
        {failed && <p className="sheet-note">Nie udało się otworzyć dokumentu.</p>}
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
      aria-label="Zmień proporcje widoku"
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
