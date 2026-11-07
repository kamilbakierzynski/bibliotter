import { type PointerEvent, useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import './terminal.css'
import { t } from '../../../shared/i18n'
import { ui, useShell } from '../shell/state'
import { closeTerminal, dragEdge, endDrag, flipSide, mountTerminal, syncTerminalTheme, togglePin } from '../shell/terminal'
import { bindTerminal, term, termShown } from '../shell/terminalLayout'
import { Icon } from './icons'

const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path

function Grip(): React.JSX.Element {
  const dragging = useRef(false)
  const move = (e: PointerEvent<HTMLElement>): void => {
    if (dragging.current) dragEdge(e.clientX, e.clientY)
  }
  return (
    <button
      className="term-grip"
      aria-label={t('Zmień rozmiar terminala')}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
      }}
      onPointerMove={move}
      onPointerUp={() => {
        if (!dragging.current) return
        dragging.current = false
        endDrag()
      }}
    >
      <i />
    </button>
  )
}

/** Terminal obok dokumentów. Stoi zawsze w drzewie, a układ sceny decyduje, ile go widać. */
export function TerminalPanel(): React.JSX.Element {
  useShell()
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!body.current) return
    return mountTerminal(body.current)
  }, [])
  useEffect(() => syncTerminalTheme(ui.mode), [ui.mode])
  const right = term.side === 'right'
  return (
    <section
      ref={bindTerminal}
      className="term"
      id="term"
      data-side={term.side}
      data-shown={termShown() ? 'on' : undefined}
      data-pinned={term.pinned ? 'on' : undefined}
      aria-label={t('Terminal')}
    >
      <Grip />
      <header className="term-head">
        <span className="term-title" title={term.cwd}>
          <Icon name="term" />
          <span>{term.cwd ? folderName(term.cwd) : t('Terminal')}</span>
          {term.cwd && <span className="term-cwd">{term.cwd}</span>}
        </span>
        <span className="term-actions">
          <button
            className="mini"
            data-act="term-side"
            aria-label={right ? t('Terminal pod dokumentem') : t('Terminal obok dokumentu')}
            title={right ? t('Terminal pod dokumentem') : t('Terminal obok dokumentu')}
            onClick={flipSide}
          >
            <Icon name={right ? 'split-row' : 'split'} />
          </button>
          <button
            className={term.pinned ? 'mini on' : 'mini'}
            data-act="term-pin"
            aria-pressed={term.pinned}
            aria-label={term.pinned ? t('Odepnij terminal') : t('Przypnij terminal')}
            title={term.pinned ? t('Odepnij terminal') : t('Przypnij terminal')}
            onClick={togglePin}
          >
            <Icon name="pin" />
          </button>
          <button className="mini" data-act="term-close" aria-label={t('Zamknij terminal')} onClick={closeTerminal}>
            <Icon name="x" />
          </button>
        </span>
      </header>
      <div className="term-body">
        <div className="term-screen" ref={body} />
      </div>
    </section>
  )
}
