import type { PointerEvent } from 'react'
import { STICKY_COLORS, type StickyColor } from '../../../shared/annotations'
import { DOC_STATUSES } from '../../../shared/types'
import { dockHover, dockLeave, togglePop } from '../shell/keys'
import { camW, els, popPill, toolPill } from '../shell/layout'
import { setDocStatus } from '../shell/library'
import { selectionAction, setAudience, setColor, setTool } from '../shell/notes'
import { openCmd } from '../shell/palette'
import { closePeek, focusPane } from '../shell/sheets'
import { canAnnotate, focusedDoc, MOD, pinned, STATUS, type Tool, ui, useShell } from '../shell/state'
import { useSynced } from './hooks'
import { Icon, Keys } from './icons'
import { Palette } from './Palette'

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'move', label: 'Interakcja', key: 'V', icon: 'cursor' },
  { id: 'comment', label: 'Komentarz', key: 'C', icon: 'comment' },
  { id: 'sticky', label: 'Karteczka', key: 'N', icon: 'sticky' }
]

const COLOR_LABELS: Record<StickyColor, string> = {
  yellow: 'Żółta',
  blue: 'Niebieska',
  green: 'Zielona',
  pink: 'Różowa'
}

const SELECTION: { id: 'comment' | 'sticky' | 'copy'; label: string; icon: string }[] = [
  { id: 'comment', label: 'Skomentuj', icon: 'comment' },
  { id: 'sticky', label: 'Karteczka', icon: 'sticky' },
  { id: 'copy', label: 'Kopiuj', icon: 'file' }
]

function Tray(): React.JSX.Element {
  return (
    <div className="tray" id="tray">
      <div className="tray-in" id="trayIn">
        {STICKY_COLORS.map((color) => (
          <button
            key={color}
            className={`swatch ${color}${ui.color === color ? ' on' : ''}`}
            aria-label={COLOR_LABELS[color]}
            onClick={() => setColor(color)}
          />
        ))}
        <div className="tray-c">
          <span className="tray-hint">Kliknij miejsce w dokumencie</span>
          <div className="seg" role="radiogroup" aria-label="Odbiorca komentarza">
            {(['agent', 'me'] as const).map((audience) => (
              <button key={audience} className={ui.aud === audience ? 'on' : ''} onClick={() => setAudience(audience)}>
                {audience === 'agent' ? 'Dla agenta' : 'Dla mnie'}
              </button>
            ))}
          </div>
        </div>
        <div className="tray-s">
          {SELECTION.map((action) => (
            <button
              key={action.id}
              className="ask"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectionAction(action.id)}
            >
              <Icon name={action.icon} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Dock(): React.JSX.Element {
  useShell()
  const doc = focusedDoc()
  const at = ui.peek === null ? ui.focus : ui.back
  const status = doc ? STATUS[doc.status] : null

  useSynced(() => {
    camW.to(pinned() > 2 ? els.camIn.offsetWidth : 0)
  })

  const over = (e: PointerEvent<HTMLElement>): void => {
    dockHover((e.target as HTMLElement).closest<HTMLElement>('[data-tip]'))
  }

  return (
    <div className={ui.cmd ? 'dock wide' : 'dock'} id="dock" onPointerOver={over} onPointerLeave={dockLeave}>
      <div className="dock-bar" id="bar">
        <div className="bar-ctx" id="barCtx">
          <div className="bar-ctx-in" id="barCtxIn">
            <div className="tools" id="tools" role="toolbar" aria-label="Narzędzia">
              <i className="tool-pill" ref={toolPill.bind} />
              {TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  className={ui.tool === tool.id ? 'tb on' : 'tb'}
                  data-tool={tool.id}
                  data-tip={tool.label}
                  data-keys={tool.key}
                  aria-label={tool.label}
                  aria-pressed={ui.tool === tool.id}
                  onClick={() => setTool(ui.tool === tool.id ? 'move' : tool.id)}
                >
                  <Icon name={tool.icon} />
                </button>
              ))}
            </div>
            <Tray />
            <span className="sep" />
            <span className="cam-box" id="camBox">
              <span className="cam-in" id="camIn">
                <span className="cam" id="camMap" aria-label="Arkusze w szeregu">
                  {pinned() > 2 &&
                    ui.order.map((slot) => (
                      <i
                        key={slot}
                        className={slot === at ? 'on' : ''}
                        onClick={() => {
                          closePeek()
                          focusPane(slot)
                        }}
                      />
                    ))}
                </span>
                <span className="sep" />
              </span>
            </span>
            <button
              className="chip"
              id="statusBtn"
              data-tip="Status dokumentu"
              data-keys="S"
              aria-haspopup="true"
              onClick={(e) => {
                e.stopPropagation()
                togglePop()
              }}
            >
              <i className={`dot ${status?.tone ?? ''}`} />
              <span>{status?.label}</span>
              <Icon name="up" />
            </button>
            <span className="sep" />
          </div>
        </div>
        <button className="ask" id="cmdBtn" data-open-cmd onClick={openCmd}>
          <Icon name="search" />
          <span>Szukaj</span>
          <i className="keys">
            <Keys keys={[MOD, 'K']} />
          </i>
        </button>
      </div>
      <Palette />
    </div>
  )
}

export function StatusPop(): React.JSX.Element {
  useShell()
  const doc = focusedDoc()
  const over = (e: PointerEvent<HTMLElement>): void => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-status]')
    if (b) popPill.to({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight })
  }
  return (
    <div className="pop" id="statusPop" role="menu" aria-label="Status dokumentu" onPointerOver={over}>
      <i className="pop-pill" ref={popPill.bind} />
      <div id="popItems">
        {DOC_STATUSES.map((id) => (
          <button
            key={id}
            data-status={id}
            role="menuitemradio"
            aria-checked={doc?.status === id}
            onClick={() => {
              if (doc && canAnnotate(doc)) setDocStatus(doc.id, id)
              setTimeout(() => togglePop(false), 140)
            }}
          >
            <i className={`dot ${STATUS[id].tone}`} />
            <span>{STATUS[id].label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
