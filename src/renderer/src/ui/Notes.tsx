import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Annotation, Audience } from '../../../shared/annotations'
import { t } from '../../../shared/i18n'
import { clamp } from '../motion/spring'
import { G, insRope, type Sheet, viewPill } from '../shell/layout'
import { closeThread, cancelDraft, documentNote, hang, noteNumber, selectNote, setInsp, setNotesView, submitDraft, syncViewSeg } from '../shell/notes'
import { data, type Draft, focusedId, MOD, noteText, notify, ui, useShell } from '../shell/state'
import { relativeTime } from '../tree'
import { useSynced } from './hooks'
import { Icon, Keys } from './icons'
import { LinksPanel } from './Links'
import { OutlinePanel } from './Outline'
import { RoutePanel } from './Route'

const BUBBLE_W = 272
const BUBBLE_H = 128
const BUBBLE_GAP = 30
const THREAD_W = 300
const THREAD_INSET = 12

/** Dolna granica dymków w arkuszu. Dok pływa nad nim, więc miejsce kończy się nad dokiem. */
const roomBelow = (height: number): number => height - G.dockZone - THREAD_INSET

function AudienceSwitch({ value, onChange }: { value: Audience; onChange: (next: Audience) => void }): React.JSX.Element {
  return (
    <div className="seg" role="radiogroup" aria-label={t('Odbiorca uwagi')}>
      {(['agent', 'me'] as const).map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={value === option}
          className={value === option ? 'on' : ''}
          onClick={() => onChange(option)}
        >
          {option === 'agent' ? t('Dla agenta') : t('Dla mnie')}
        </button>
      ))}
    </div>
  )
}

function Composer({ draft, className }: { draft: Draft; className?: string }): React.JSX.Element {
  const [text, setText] = useState('')
  const [audience, setAudience] = useState(draft.audience)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.api.focusDoc(null)
    input.current?.focus()
  }, [])

  const submit = (): void => submitDraft(text, audience, draft.color)
  const heading = draft.kind === 'sticky' ? t('Co chcesz zapamiętać?') : t('Co trzeba zmienić lub wyjaśnić?')

  return (
    <div className={`bubble ${className ?? ''}`}>
      <textarea
        ref={input}
        rows={2}
        aria-label={t('Treść uwagi')}
        placeholder={draft.anchor ? heading : t('Uwaga do całego dokumentu')}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            submit()
          }
          if (event.key === 'Escape') {
            event.stopPropagation()
            cancelDraft()
          }
        }}
      />
      <div className="bubble-foot">
        <AudienceSwitch
          value={audience}
          onChange={(next) => {
            setAudience(next)
            input.current?.focus()
          }}
        />
        <button className="hint" aria-label={t('Zapisz')} disabled={!text.trim()} onClick={submit}>
          <Keys keys={[MOD, '↵']} />
        </button>
      </div>
    </div>
  )
}

/** Szkic stoi w miejscu kliknięcia, nad zrzutem. Dymek odchyla się od krawędzi arkusza. */
export function DraftBubble({ draft, sheet }: { draft: Draft; sheet: Sheet }): React.JSX.Element | null {
  const rect = draft.rect
  if (!rect) return null
  const width = sheet.box?.clientWidth ?? sheet.wide
  const height = sheet.box?.clientHeight ?? 0
  const flip = rect.x + BUBBLE_GAP + BUBBLE_W > width - THREAD_INSET
  const place = {
    left: flip ? -(BUBBLE_GAP + BUBBLE_W) : BUBBLE_GAP,
    top: clamp(-36, THREAD_INSET - rect.y, Math.max(THREAD_INSET - rect.y, roomBelow(height) - BUBBLE_H - rect.y)),
    transformOrigin: flip ? '100% 24px' : '0 24px'
  }
  return (
    <div className="draft" style={{ left: rect.x, top: rect.y }}>
      {draft.kind === 'comment' ? <span className="pin free">+</span> : <span className={`stick mark ${draft.color}`} />}
      <div className="bubble-at" style={place}>
        <Composer draft={draft} />
      </div>
    </div>
  )
}

function ThreadCard({ note, pop = false }: { note: Annotation; pop?: boolean }): React.JSX.Element {
  const [reply, setReply] = useState('')
  const [armed, setArmed] = useState(false)
  const element = useRef<HTMLElement>(null)
  const on = ui.selNote === note.id
  const highlight = note.kind === 'highlight'
  const first = note.messages[0]
  const rest = highlight ? note.messages : note.messages.slice(1)
  const fromAgent = note.messages.at(-1)?.author === 'agent'
  const open = note.status === 'open'
  const sha = data.entries.get(note.docId)?.sha ?? null
  const orphaned = data.orphans.get(note.docId)?.has(note.id) ?? false
  const outdated = sha !== null && note.docSha !== sha

  const send = (): void => {
    if (!reply.trim()) return
    void window.api.replyAnnotation(note.id, reply)
    setReply('')
  }

  useEffect(() => {
    if (on && !pop && document.documentElement.dataset.panel === 'list') element.current?.scrollIntoView({ block: 'nearest' })
  }, [on, pop])

  const classes = ['thread', on && 'on', !open && 'resolved'].filter(Boolean).join(' ')
  const mark =
    highlight ? (
      <span className={`th-mark dab ${note.color ?? 'yellow'}`} />
    ) : note.kind === 'sticky' ? (
      <span className={`th-mark sticky ${note.color ?? 'yellow'}`} />
    ) : (
      <span className={`th-mark${note.audience === 'me' ? ' me' : ''}${fromAgent && open ? ' hot' : ''}`}>{noteNumber(note.id)}</span>
    )

  return (
    <article ref={element} className={classes} data-thread={note.id}>
      <button className="th-head" aria-expanded={on} onClick={() => selectNote(note.id)}>
        {mark}
        <span className="th-text">{highlight ? note.anchor?.quote || t('Zakreślony obszar') : noteText(note)}</span>
      </button>
      <div className="th-meta">
        <span>{note.audience === 'agent' ? t('Dla agenta') : t('Dla mnie')}</span>
        <span>{relativeTime(Date.parse(first?.createdAt ?? note.createdAt))}</span>
        {fromAgent && open && <span className="th-flag">{t('Agent odpisał')}</span>}
        {orphaned && <span className="th-flag">{t('Nie ma tego miejsca w tej wersji')}</span>}
        {outdated && !orphaned && <span className="th-flag">{t('Do starszej wersji')}</span>}
      </div>
      <div className="th-body">
        <div>
          {note.anchor?.heading && <p className="th-context">{note.anchor.heading}</p>}
          {rest.map((message) => (
            <div className={`msg ${message.author}`} key={message.id}>
              <b>
                <Icon name={message.author === 'agent' ? 'term' : 'me'} />
                {message.author === 'agent' ? 'Agent' : t('Ty')}
              </b>
              {message.text}
            </div>
          ))}
          <div className="reply">
            <input
              type="text"
              placeholder={highlight && !first ? t('Dopisz notatkę') : t('Odpowiedz')}
              aria-label={t('Odpowiedź')}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') send()
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  closeThread()
                }
              }}
            />
            <button
              className="mini"
              aria-label={open ? t('Zamknij uwagę') : t('Otwórz ponownie')}
              onClick={() => void window.api.setAnnotationStatus(note.id, open ? 'resolved' : 'open')}
            >
              <Icon name={open ? 'check' : 'refresh'} />
            </button>
          </div>
          <div className="th-acts">
            <button onClick={() => void window.api.setAnnotationAudience(note.id, note.audience === 'agent' ? 'me' : 'agent')}>
              {note.audience === 'agent' ? t('Tylko dla mnie') : t('Pokaż agentowi')}
            </button>
            <button
              className="danger"
              onClick={() => {
                if (armed) void window.api.deleteAnnotation(note.id)
                else setArmed(true)
              }}
            >
              {armed ? t('Na pewno?') : t('Usuń')}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

/** Przy zamkniętym panelu wątek wyrasta spod pinezki, a nad zrzutem jest w całości w powłoce. */
export function ThreadPop({ note, sheet }: { note: Annotation; sheet: Sheet }): React.JSX.Element | null {
  const element = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)
  const rect = ui.threadRect
  const width = sheet.box?.clientWidth ?? sheet.wide
  const height = sheet.box?.clientHeight ?? 0

  useLayoutEffect(() => {
    if (!rect || !element.current) return
    const needed = element.current.offsetHeight
    setAbove(rect.y + rect.height + 8 + needed > roomBelow(height) && rect.y - 8 - needed > THREAD_INSET)
  })

  if (!rect) return null
  const left = clamp(rect.x - 2, THREAD_INSET, Math.max(THREAD_INSET, width - THREAD_W - THREAD_INSET))
  const place = above
    ? { left, bottom: height - rect.y + 8, transformOrigin: '12px 100%' }
    : { left, top: rect.y + rect.height + 8 }
  return (
    <div ref={element} className="th-pop" style={place}>
      <ThreadCard note={note} pop />
    </div>
  )
}

function NotesPanel(): React.JSX.Element {
  useShell()
  const docId = focusedId()
  const all = docId ? data.annotations.filter((note) => note.docId === docId) : []
  const open = all.filter((note) => note.status === 'open')
  const visible = ui.showResolved ? all : open
  const resolved = all.length - open.length
  const draft = ui.draft && !ui.draft.rect && ui.draft.docId === docId ? ui.draft : null

  useSynced(() => {
    syncViewSeg(true)
    hang()
  })

  return (
    <>
      <header className="insp-head">
        <strong>
          {t('Uwagi')} <span>{open.length || ''}</span>
        </strong>
        <div className="seg view-seg" id="viewSeg" role="radiogroup" aria-label={t('Układ uwag')}>
          <i className="view-pill" ref={viewPill.bind} />
          {(
            [
              ['wall', 'wall', t('Przy cytatach')],
              ['list', 'right', t('Lista w panelu')]
            ] as const
          ).map(([view, icon, label]) => (
            <button
              key={view}
              className={ui.notesView === view ? 'mini on' : 'mini'}
              data-view-mode={view}
              role="radio"
              aria-checked={ui.notesView === view}
              aria-label={label}
              onClick={() => setNotesView(view)}
            >
              <Icon name={icon} />
            </button>
          ))}
        </div>
        <button className="mini" aria-label={t('Zamknij uwagi')} onClick={() => setInsp(false)}>
          <Icon name="x" />
        </button>
      </header>
      <div className="threads" id="threads">
        {visible.map((note) => (
          <ThreadCard key={note.id} note={note} />
        ))}
        {visible.length === 0 && !draft && (
          <p className="empty">{t('Naciśnij C albo N i kliknij miejsce w dokumencie. Możesz też najpierw zaznaczyć tekst.')}</p>
        )}
      </div>
      <footer className="insp-foot">
        {draft ? (
          <Composer key={draft.docId} draft={draft} className="inline" />
        ) : (
          <div className="insp-acts">
            <button className="ask" disabled={docId === null} onClick={documentNote}>
              <span>{t('Uwaga do całego dokumentu')}</span>
            </button>
            {resolved > 0 && (
              <button
                className="ask"
                onClick={() => {
                  ui.showResolved = !ui.showResolved
                  notify()
                }}
              >
                <span>{ui.showResolved ? t('Ukryj zamknięte') : t('Zamknięte: {n}', { n: resolved })}</span>
              </button>
            )}
          </div>
        )}
      </footer>
    </>
  )
}

export function Insp(): React.JSX.Element {
  useShell()
  return (
    <aside
      className="insp"
      id="insp"
      aria-label={
        ui.inspView === 'links'
          ? t('Linki')
          : ui.inspView === 'outline'
            ? t('Spis treści')
            : ui.inspView === 'route'
              ? t('Trasa prezentacji')
              : t('Uwagi')
      }
    >
      <svg className="shape" aria-hidden="true">
        <path
          id="inspPath"
          ref={(element) => {
            insRope.path = element
          }}
        />
      </svg>
      <div className="insp-in" id="inspIn">
        {ui.inspView === 'links' ? (
          <LinksPanel docId={focusedId()} />
        ) : ui.inspView === 'outline' ? (
          <OutlinePanel docId={focusedId()} />
        ) : ui.inspView === 'route' ? (
          <RoutePanel docId={focusedId()} />
        ) : (
          <NotesPanel />
        )}
      </div>
    </aside>
  )
}
