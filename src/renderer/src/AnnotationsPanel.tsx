import { useEffect, useRef, useState } from 'react'
import { type Annotation, type Audience, STICKY_COLORS, type StickyColor } from '../../shared/annotations'
import type { DocEntry } from '../../shared/types'
import type { Draft } from './App'
import { relativeTime } from './tree'

const AUTHOR_LABELS = { user: 'Ty', agent: 'Agent' }
const COLOR_LABELS: Record<StickyColor, string> = {
  yellow: 'Żółta',
  blue: 'Niebieska',
  green: 'Zielona',
  pink: 'Różowa'
}

function AudienceSwitch({ value, onChange }: { value: Audience; onChange: (next: Audience) => void }): React.JSX.Element {
  return (
    <div className="switch" role="radiogroup" aria-label="Odbiorca uwagi">
      {(['agent', 'me'] as const).map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={value === option}
          className={value === option ? 'active' : ''}
          onClick={() => onChange(option)}
        >
          {option === 'agent' ? 'Dla agenta' : 'Dla mnie'}
        </button>
      ))}
    </div>
  )
}

interface ComposerProps {
  draft: Draft
  onSubmit: (text: string, audience: Audience, color: StickyColor | null) => void
  onCancel: () => void
}

function Composer({ draft, onSubmit, onCancel }: ComposerProps): React.JSX.Element {
  const [text, setText] = useState('')
  const [audience, setAudience] = useState<Audience>(draft.kind === 'sticky' ? 'me' : 'agent')
  const [color, setColor] = useState<StickyColor>('yellow')
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => input.current?.focus(), [])

  const submit = (): void => {
    if (text.trim()) onSubmit(text, audience, draft.kind === 'sticky' ? color : null)
  }

  return (
    <section className="composer">
      <strong>{draft.kind === 'sticky' ? 'Nowa karteczka' : draft.anchor ? 'Nowy komentarz' : 'Uwaga do całego dokumentu'}</strong>
      {draft.anchor?.quote && <blockquote>{draft.anchor.quote}</blockquote>}
      <textarea
        ref={input}
        rows={3}
        aria-label="Treść uwagi"
        placeholder={draft.kind === 'sticky' ? 'Co chcesz zapamiętać?' : 'Co trzeba zmienić lub wyjaśnić?'}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit()
          if (event.key === 'Escape') onCancel()
        }}
      />
      <AudienceSwitch value={audience} onChange={setAudience} />
      {draft.kind === 'sticky' && (
        <div className="colors" role="radiogroup" aria-label="Kolor karteczki">
          {STICKY_COLORS.map((option) => (
            <button
              key={option}
              role="radio"
              aria-checked={color === option}
              aria-label={COLOR_LABELS[option]}
              className={`swatch ${option}${color === option ? ' active' : ''}`}
              onClick={() => setColor(option)}
            />
          ))}
        </div>
      )}
      <div className="composer-actions">
        <button className="primary" disabled={!text.trim()} onClick={submit}>
          Zapisz
        </button>
        <button className="ghost" onClick={onCancel}>
          Anuluj
        </button>
      </div>
    </section>
  )
}

interface ThreadProps {
  annotation: Annotation
  number: number | null
  selected: boolean
  orphaned: boolean
  outdated: boolean
  onSelect: () => void
}

function Thread({ annotation, number, selected, orphaned, outdated, onSelect }: ThreadProps): React.JSX.Element {
  const [reply, setReply] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const element = useRef<HTMLElement>(null)
  const [first, ...rest] = annotation.messages

  useEffect(() => {
    if (selected) element.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const send = (): void => {
    if (!reply.trim()) return
    void window.api.replyAnnotation(annotation.id, reply)
    setReply('')
  }

  const lastAuthor = annotation.messages.at(-1)?.author
  const classes = ['thread', selected && 'selected', annotation.status === 'resolved' && 'resolved']

  return (
    <article ref={element} className={classes.filter(Boolean).join(' ')}>
      <button className="thread-head" aria-expanded={selected} onClick={onSelect}>
        {annotation.kind === 'sticky' ? (
          <span className={`swatch small ${annotation.color ?? 'yellow'}`} aria-hidden="true" />
        ) : (
          <span className="badge">{number ?? '•'}</span>
        )}
        <span className="thread-text">{first?.text}</span>
      </button>
      <div className="thread-meta">
        <span>{annotation.audience === 'agent' ? 'Dla agenta' : 'Dla mnie'}</span>
        {first && <span>{relativeTime(Date.parse(first.createdAt))}</span>}
        {rest.length > 0 && <span>{rest.length === 1 ? '1 odpowiedź' : `Odpowiedzi: ${rest.length}`}</span>}
        {lastAuthor === 'agent' && annotation.status === 'open' && <span className="flag">Agent odpisał</span>}
        {orphaned && <span className="flag">Nie ma tego miejsca w tej wersji</span>}
        {outdated && !orphaned && <span className="flag">Do starszej wersji</span>}
      </div>

      {selected && (
        <div className="thread-body">
          {annotation.anchor?.heading && <p className="muted thread-context">{annotation.anchor.heading}</p>}
          {rest.map((message) => (
            <div key={message.id} className={`message ${message.author}`}>
              <span className="message-author">{AUTHOR_LABELS[message.author]}</span>
              <p>{message.text}</p>
            </div>
          ))}
          <textarea
            rows={2}
            aria-label="Odpowiedź"
            placeholder="Odpowiedz"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send()
            }}
          />
          <div className="thread-actions">
            <button className="ghost outlined" disabled={!reply.trim()} onClick={send}>
              Wyślij
            </button>
            <button
              className="ghost"
              onClick={() =>
                void window.api.setAnnotationAudience(annotation.id, annotation.audience === 'agent' ? 'me' : 'agent')
              }
            >
              {annotation.audience === 'agent' ? 'Tylko dla mnie' : 'Pokaż agentowi'}
            </button>
            <button
              className="ghost"
              onClick={() =>
                void window.api.setAnnotationStatus(annotation.id, annotation.status === 'open' ? 'resolved' : 'open')
              }
            >
              {annotation.status === 'open' ? 'Zamknij' : 'Otwórz ponownie'}
            </button>
            <button
              className="ghost danger"
              onClick={() => {
                if (confirmDelete) void window.api.deleteAnnotation(annotation.id)
                else setConfirmDelete(true)
              }}
            >
              {confirmDelete ? 'Na pewno?' : 'Usuń'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

interface AnnotationsPanelProps {
  doc: DocEntry
  annotations: Annotation[]
  docSha: string | null
  draft: Draft | null
  selectedId: string | null
  orphans: Set<string>
  onSelect: (id: string | null) => void
  onSubmitDraft: (text: string, audience: Audience, color: StickyColor | null) => void
  onCancelDraft: () => void
  onDocumentNote: () => void
}

export function AnnotationsPanel(props: AnnotationsPanelProps): React.JSX.Element {
  const { doc, annotations, docSha, draft, selectedId, orphans } = props
  const { onSelect, onSubmitDraft, onCancelDraft, onDocumentNote } = props
  const [showResolved, setShowResolved] = useState(false)

  const comments = annotations.filter((item) => item.kind === 'comment')
  const visible = annotations.filter((item) => showResolved || item.status === 'open')
  const resolved = annotations.length - annotations.filter((item) => item.status === 'open').length

  return (
    <aside className="notes" aria-label="Uwagi">
      <header className="notes-head">
        <strong>Uwagi</strong>
        {resolved > 0 && (
          <button className="link" onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? 'Ukryj zamknięte' : `Zamknięte: ${resolved}`}
          </button>
        )}
      </header>
      <div className="notes-list">
        {draft && (
          <Composer key={`${doc.id}:${draft.kind}`} draft={draft} onSubmit={onSubmitDraft} onCancel={onCancelDraft} />
        )}
        {visible.map((annotation) => (
          <Thread
            key={annotation.id}
            annotation={annotation}
            number={annotation.kind === 'comment' ? comments.indexOf(annotation) + 1 : null}
            selected={annotation.id === selectedId}
            orphaned={orphans.has(annotation.id)}
            outdated={docSha !== null && annotation.docSha !== docSha}
            onSelect={() => onSelect(annotation.id === selectedId ? null : annotation.id)}
          />
        ))}
        {!draft && visible.length === 0 && (
          <p className="muted notes-empty">
            Kliknij Komentarz (C) lub Karteczka (N), a potem miejsce w dokumencie. Możesz też najpierw zaznaczyć tekst.
          </p>
        )}
      </div>
      <footer className="notes-foot">
        <button className="ghost outlined" disabled={draft !== null} onClick={onDocumentNote}>
          Uwaga do całego dokumentu
        </button>
      </footer>
    </aside>
  )
}
