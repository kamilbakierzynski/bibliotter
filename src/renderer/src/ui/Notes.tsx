import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Annotation, Audience } from '../../../shared/annotations'
import { t } from '../../../shared/i18n'
import { clamp } from '../motion/spring'
import { G, insRope, type Sheet, viewPill } from '../shell/layout'
import {
  closeThread,
  cancelDraft,
  commitDraft,
  documentNote,
  hang,
  noteNumber,
  selectNote,
  setInsp,
  setNotesView,
  submitDraft,
  syncViewSeg,
  typeDraft
} from '../shell/notes'
import { data, type Draft, focusedId, MOD, noteText, notify, ui, useShell } from '../shell/state'
import { carryNote } from '../shell/keys'
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

export function AudienceSwitch({ value, onChange }: { value: Audience; onChange: (next: Audience) => void }): React.JSX.Element {
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

/**
 * Dymek nad arkuszem kończy się klikiem obok, jak po Ctrl Enter: wpisany tekst zapisuje, a pusty
 * szkic porzuca. Tekst zna też `commitDraft`, bo klik w narzędzie doku przychodzi spoza tej strony.
 */
function useCommitAway(box: RefObject<HTMLElement | null>, text: string, audience: Audience, on: boolean): void {
  useEffect(() => {
    if (on) typeDraft(text, audience)
  }, [on, text, audience])

  useEffect(() => {
    if (!on) return
    const away = (event: PointerEvent): void => {
      if (!box.current?.contains(event.target as Node)) commitDraft()
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [on])
}

function Composer({ draft, className, away = false }: { draft: Draft; className?: string; away?: boolean }): React.JSX.Element {
  const [text, setText] = useState('')
  const [audience, setAudience] = useState(draft.audience)
  const input = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useCommitAway(box, text, audience, away)

  useEffect(() => {
    window.api.focusDoc(null)
    input.current?.focus()
  }, [])

  const submit = (): void => submitDraft(text, audience, draft.color)
  const heading = draft.kind === 'sticky' ? t('Co chcesz zapamiętać?') : t('Co trzeba zmienić lub wyjaśnić?')

  return (
    <div ref={box} className={`bubble ${className ?? ''}`}>
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

/**
 * Karteczkę pisze się w niej samej, jak w Miro. Papier stoi tam, gdzie przyklei się zapisana
 * karteczka (`.note` w `preload/overlay.ts`), więc tekst po zapisie zostaje na miejscu.
 * Kliknięcie obok zapisuje jak przy komentarzu, a odbiorca i skrót czekają w pasku pod kartką.
 */
function StickyDraft({ draft, bar }: { draft: Draft; bar: { left: number; up: boolean } }): React.JSX.Element {
  const [text, setText] = useState('')
  const [audience, setAudience] = useState(draft.audience)
  const input = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useCommitAway(box, text, audience, true)

  useEffect(() => {
    window.api.focusDoc(null)
    input.current?.focus()
  }, [])

  const submit = (): void => submitDraft(text, audience, draft.color)

  return (
    <div ref={box} className="paper-at">
      <div className={`bubble paper ${draft.color}`} onClick={() => input.current?.focus()}>
        <textarea
          ref={input}
          rows={1}
          aria-label={t('Treść uwagi')}
          placeholder={t('Co chcesz zapamiętać?')}
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
      </div>
      {/* Pasek nie bierze fokusu, żeby pisanie trwało dalej po zmianie odbiorcy. */}
      <div
        className={bar.up ? 'paper-bar up' : 'paper-bar'}
        style={{ left: bar.left }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <AudienceSwitch value={audience} onChange={setAudience} />
        <button className="hint" aria-label={t('Zapisz')} disabled={!text.trim()} onClick={submit}>
          <Keys keys={[MOD, '↵']} />
        </button>
      </div>
    </div>
  )
}

/** Wymiary papieru karteczki, jak `.note` z warstwy dokumentu, i paska pod nim. */
const PAPER_MAX_H = 108
const PAPER_BAR_W = 196
const PAPER_BAR_H = 34
const PAPER_BAR_GAP = 10

/** Szkic stoi w miejscu kliknięcia, nad zrzutem. Dymek odchyla się od krawędzi arkusza. */
export function DraftBubble({ draft, sheet }: { draft: Draft; sheet: Sheet }): React.JSX.Element | null {
  const rect = draft.rect
  if (!rect) return null
  const width = sheet.box?.clientWidth ?? sheet.wide
  const height = sheet.box?.clientHeight ?? 0
  if (draft.kind === 'sticky') {
    // Warstwa mierzy szkic jak pinezkę 24 px, której czubek (1, 24) to róg przyszłej karteczki.
    const at = { x: rect.x + rect.width / 24, y: rect.y + rect.height }
    const up = at.y + PAPER_MAX_H + PAPER_BAR_GAP + PAPER_BAR_H > roomBelow(height) && at.y - PAPER_BAR_GAP - PAPER_BAR_H > THREAD_INSET
    const room = Math.max(width - THREAD_INSET - PAPER_BAR_W - at.x, THREAD_INSET - at.x)
    return (
      <div className="draft" style={{ left: at.x, top: at.y }}>
        <StickyDraft draft={draft} bar={{ left: clamp(0, THREAD_INSET - at.x, room), up }} />
      </div>
    )
  }
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
        <Composer draft={draft} away />
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
  // Zakreślenie i kształt mają geometrię związaną z tekstem, więc przenosi się tylko komentarz i karteczkę.
  const movable = open && note.anchor !== null && (note.kind === 'comment' || note.kind === 'sticky')

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
            {movable && <button onClick={() => carryNote(note.id)}>{t('Przenieś')}</button>}
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
  // Po prezentacji panel pokazuje najpierw to, co w niej dopisano, także zamknięte już uwagi.
  const added = ui.added?.docId === docId ? new Set(ui.added.ids) : null
  const fresh = added ? all.filter((note) => added.has(note.id)) : null
  const visible = fresh ?? (ui.showResolved ? all : open)
  const resolved = all.length - open.length
  const draft = ui.draft && !ui.draft.rect && ui.draft.docId === docId ? ui.draft : null

  useSynced(() => {
    syncViewSeg(true)
    hang()
  })

  return (
    <>
      <header className="insp-head">
        <strong id="notesTitle">
          {fresh ? t('Dodane podczas prezentacji') : t('Uwagi')} <span>{(fresh ? fresh.length : open.length) || ''}</span>
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
        ) : fresh ? (
          <div className="insp-acts">
            <button
              className="ask"
              id="showAllNotes"
              onClick={() => {
                ui.added = null
                notify()
              }}
            >
              <span>{t('Pokaż wszystkie uwagi')}</span>
            </button>
          </div>
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
