import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SHAPE_TYPES, type ShapeType, STICKY_COLORS, type StickyColor } from '../../../shared/annotations'
import { DOC_STATUSES } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { wake } from '../motion/spring'
import { drawings } from '../shell/drawings'
import { dockHover, dockLeave, togglePop } from '../shell/keys'
import { toggleLabelPop } from '../shell/labels'
import { camW, els, popPill, toolPill } from '../shell/layout'
import { setDocStatus } from '../shell/library'
import { cancelDraft, chooseShape, setAudience, setColor, setTool, submitDraft, togglePanel } from '../shell/notes'
import { openCmd } from '../shell/palette'
import { focusLive } from '../shell/native'
import {
  addedCount,
  checkPresentation,
  goToStep,
  playableSteps,
  presentTool,
  show,
  startNote,
  stepBy,
  stopPresentation
} from '../shell/present'
import { stepLabel, stepsOf } from '../shell/route'
import { copyReference } from '../shell/reference'
import { closePeek, focusPane } from '../shell/sheets'
import { canAnnotate, data, type Draft, focusedDoc, MOD, pinned, STATUS, type Tool, ui, useShell } from '../shell/state'
import { useSynced } from './hooks'
import { Icon, Keys } from './icons'
import { AudienceSwitch } from './Notes'
import { Palette } from './Palette'

const tools = (): { id: Tool; label: string; key: string; icon: string }[] => [
  { id: 'move', label: t('Interakcja'), key: 'V', icon: 'cursor' },
  { id: 'comment', label: t('Komentarz'), key: 'C', icon: 'comment' },
  { id: 'sticky', label: t('Karteczka'), key: 'N', icon: 'sticky' },
  { id: 'highlight', label: t('Zakreślacz'), key: 'M', icon: 'marker' },
  { id: 'shape', label: t('Kształt'), key: 'A', icon: 'shape' },
  { id: 'pointer', label: t('Wskaźnik'), key: 'P', icon: 'point' }
]

const colorLabels = (): Record<StickyColor, string> => ({
  yellow: t('Żółta'),
  blue: t('Niebieska'),
  green: t('Zielona'),
  pink: t('Różowa')
})

const shapeLabels = (): Record<ShapeType, string> => ({
  arrow: t('Strzałka'),
  rect: t('Prostokąt'),
  ellipse: t('Elipsa'),
  line: t('Linia')
})

function Tray(): React.JSX.Element {
  return (
    <div className="tray" id="tray">
      <div className="tray-in" id="trayIn">
        <div className="tray-k" role="radiogroup" aria-label={t('Rodzaj kształtu')}>
          {SHAPE_TYPES.map((type) => (
            <button
              key={type}
              className={drawings.type === type ? 'tb on' : 'tb'}
              data-shape={type}
              role="radio"
              aria-checked={drawings.type === type}
              aria-label={shapeLabels()[type]}
              data-tip={shapeLabels()[type]}
              onClick={() => chooseShape(type)}
            >
              <Icon name={`shape-${type}`} />
            </button>
          ))}
        </div>
        {STICKY_COLORS.map((color) => (
          <button
            key={color}
            className={`swatch ${color}${ui.color === color ? ' on' : ''}`}
            aria-label={colorLabels()[color]}
            onClick={() => setColor(color)}
          />
        ))}
        <span className="tray-hint tray-h">{t('Prawy przycisk usuwa')}</span>
        <div className="tray-c">
          <span className="tray-hint">{t('Kliknij miejsce w dokumencie')}</span>
          <div className="seg" role="radiogroup" aria-label={t('Odbiorca komentarza')}>
            {(['agent', 'me'] as const).map((audience) => (
              <button key={audience} className={ui.aud === audience ? 'on' : ''} onClick={() => setAudience(audience)}>
                {audience === 'agent' ? t('Dla agenta') : t('Dla mnie')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Kropek nie ma przy długiej trasie, bo nie dałoby się w nie trafić. */
const MAX_DOTS = 16

/** Narzędzia uwag w prezentacji. Komentarz i karteczka od razu stawiają szkic przy kadrze kroku. */
const presentTools = (): { id: 'comment' | 'sticky' | 'highlight' | 'shape'; label: string; key: string; icon: string }[] => [
  { id: 'comment', label: t('Komentarz'), key: 'C', icon: 'comment' },
  { id: 'sticky', label: t('Karteczka'), key: 'N', icon: 'sticky' },
  { id: 'highlight', label: t('Zakreślacz'), key: 'M', icon: 'marker' },
  { id: 'shape', label: t('Kształt'), key: 'A', icon: 'shape' }
]

function presentToolOn(id: 'comment' | 'sticky' | 'highlight' | 'shape'): boolean {
  if (id === 'comment' || id === 'sticky') return ui.draft?.docId === ui.presenting && ui.draft?.kind === id
  return ui.tool === id
}

/** Dok w prezentacji: kroki, nazwa kroku, kropki do skoku, narzędzia uwag, licznik dodanych i wyjście. */
function PresentBar(): React.JSX.Element {
  const docId = ui.presenting
  const steps = stepsOf(docId)
  const list = playableSteps()
  const at = list.indexOf(show.index)
  const step = steps[show.index]
  const annotate = docId !== null && canAnnotate(data.entries.get(docId) ?? null)
  const added = addedCount()

  useEffect(() => {
    checkPresentation()
  })

  // Licznik i narzędzia zmieniają szerokość pilota, a dok mierzy ją w klatce ruchu.
  useLayoutEffect(() => {
    if (ui.ready) wake()
  }, [annotate, added > 0])

  return (
    <div className="bar-present" id="present" inert={!docId}>
      <div className="present-in" id="presentIn" role="toolbar" aria-label={t('Prezentacja')}>
        <button
          className="tb"
          id="presentPrev"
          aria-label={t('Poprzedni krok')}
          data-tip={t('Poprzedni krok')}
          data-keys="←"
          disabled={at <= 0}
          onClick={() => stepBy(-1)}
        >
          <Icon name="prev" />
        </button>
        <span className="present-n" id="presentCount" aria-live="polite">
          {t('{n} z {total}', { n: Math.max(at + 1, 1), total: list.length })}
        </span>
        <button
          className="tb"
          id="presentNext"
          aria-label={t('Następny krok')}
          data-tip={t('Następny krok')}
          data-keys="→"
          disabled={at < 0 || at >= list.length - 1}
          onClick={() => stepBy(1)}
        >
          <Icon name="chev" />
        </button>
        <span className="present-title" id="presentTitle">
          {step ? stepLabel(step, show.index) : ''}
        </span>
        {list.length > 1 && list.length <= MAX_DOTS && (
          <span className="present-dots" role="group" aria-label={t('Kroki')}>
            {list.map((index) => {
              const label = stepLabel(steps[index] as (typeof steps)[number], index)
              return (
                <button
                  key={index}
                  className={index === show.index ? 'on' : ''}
                  aria-label={label}
                  aria-current={index === show.index ? 'step' : undefined}
                  data-tip={label}
                  onClick={() => goToStep(index)}
                />
              )
            })}
          </span>
        )}
        <span className="sep" />
        {annotate &&
          presentTools().map((tool) => (
            <button
              key={tool.id}
              className={presentToolOn(tool.id) ? 'tb lit' : 'tb'}
              data-present-tool={tool.id}
              aria-label={tool.label}
              aria-pressed={presentToolOn(tool.id)}
              data-tip={tool.label}
              data-keys={tool.key}
              onClick={() => (tool.id === 'comment' || tool.id === 'sticky' ? startNote(tool.id) : presentTool(tool.id))}
            >
              <Icon name={tool.icon} />
            </button>
          ))}
        <button
          className={ui.tool === 'pointer' ? 'tb lit' : 'tb'}
          id="presentPointer"
          aria-label={t('Wskaźnik')}
          aria-pressed={ui.tool === 'pointer'}
          data-tip={t('Wskaźnik')}
          data-keys="P"
          onClick={() => setTool(ui.tool === 'pointer' ? 'move' : 'pointer')}
        >
          <Icon name="point" />
        </button>
        {added > 0 && (
          <span className="present-added" id="presentAdded" data-tip={t('Uwagi dodane w tej prezentacji')}>
            +{added}
          </span>
        )}
        <button className="ask" id="presentExit" onClick={stopPresentation}>
          <span>{t('Zakończ')}</span>
          <i className="keys">
            <Keys keys={['Esc']} />
          </i>
        </button>
      </div>
    </div>
  )
}

function NoteField({ draft }: { draft: Draft }): React.JSX.Element {
  const [text, setText] = useState('')
  const [audience, setAudience] = useState(draft.audience)
  const input = useRef<HTMLTextAreaElement>(null)

  // Kliknięcie w dokument przestawia szkic i zabiera klawiaturę, więc pole bierze ją z powrotem.
  useEffect(() => {
    window.api.focusLayer()
    input.current?.focus()
    const frame = requestAnimationFrame(() => input.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [draft])

  // Po zapisie albo anulowaniu klawiatura wraca do dokumentu, bo kroki może obsługiwać on sam.
  useEffect(
    () => () => {
      requestAnimationFrame(focusLive)
    },
    []
  )

  const submit = (): void => submitDraft(text, audience, draft.color)
  const heading = draft.kind === 'sticky' ? t('Co chcesz zapamiętać?') : t('Co trzeba zmienić lub wyjaśnić?')

  return (
    <div className="bubble present-bubble">
      <textarea
        ref={input}
        rows={2}
        aria-label={t('Treść uwagi')}
        placeholder={heading}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            cancelDraft()
          }
        }}
      />
      {/* Przyciski nie biorą fokusu, bo kliknięcie obok pola oddałoby klawiaturę dokumentowi. */}
      <div className="bubble-foot" onMouseDown={(event) => event.preventDefault()}>
        {draft.kind === 'comment' ? (
          <AudienceSwitch value={audience} onChange={setAudience} />
        ) : (
          <span className="present-note-hint">{t('Kliknij inne miejsce w dokumencie')}</span>
        )}
        <button className="hint" aria-label={t('Zapisz')} disabled={!text.trim()} onClick={submit}>
          <Keys keys={['↵']} />
        </button>
      </div>
    </div>
  )
}

/** Pole nowej uwagi w prezentacji. Stoi nad dokiem, a szkic czeka w dokumencie. */
export function PresentNote(): React.JSX.Element {
  useShell()
  const draft = ui.presenting !== null && ui.draft?.docId === ui.presenting ? ui.draft : null

  // Wycięcie warstwy musi objąć pole, zanim da się w nie kliknąć.
  useLayoutEffect(() => {
    if (ui.ready) wake()
  }, [draft !== null])

  return (
    <div className={draft ? 'present-note on' : 'present-note'} id="presentNote" inert={!draft}>
      {draft && <NoteField key={`${draft.docId} ${draft.kind}`} draft={draft} />}
    </div>
  )
}

export function Dock(): React.JSX.Element {
  useShell()
  const doc = focusedDoc()
  const at = ui.peek === null ? ui.focus : ui.back
  const status = doc ? STATUS[doc.status] : null
  const routeOpen = ui.insp && ui.inspView === 'route'

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
            <div className="tools" id="tools" role="toolbar" aria-label={t('Narzędzia')}>
              <i className="tool-pill" ref={toolPill.bind} />
              {tools().map((tool) => (
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
                <span className="cam" id="camMap" aria-label={t('Arkusze w szeregu')}>
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
              data-tip={t('Status dokumentu')}
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
            <button
              className={ui.labelPop ? 'tb lit' : 'tb'}
              id="labelBtn"
              data-tip={t('Etykiety')}
              data-keys="L"
              aria-label={t('Etykiety')}
              aria-haspopup="true"
              aria-expanded={ui.labelPop}
              onClick={(e) => {
                e.stopPropagation()
                toggleLabelPop()
              }}
            >
              <Icon name="tag" />
              {doc && doc.labels.length > 0 && <em>{doc.labels.length}</em>}
            </button>
            <button
              className="tb"
              id="refBtn"
              data-tip={ui.refCopied ? t('Skopiowano odnośnik') : t('Kopiuj odnośnik dla agenta')}
              data-keys="R"
              aria-label={t('Kopiuj odnośnik dla agenta')}
              disabled={!doc}
              onClick={() => {
                if (doc) copyReference(doc)
              }}
            >
              <Icon name={ui.refCopied ? 'check' : 'link'} />
            </button>
            <button
              className={routeOpen ? 'tb lit' : 'tb'}
              id="presentBtn"
              data-tip={t('Prezentacja')}
              data-keys="Shift P"
              aria-label={t('Prezentacja')}
              aria-pressed={routeOpen}
              disabled={!doc}
              onClick={() => togglePanel('route')}
            >
              <Icon name="play" />
            </button>
            <span className="sep" />
          </div>
        </div>
        <span className="cmd-box" id="cmdBox" inert={ui.presenting !== null}>
          <button className="ask" id="cmdBtn" data-open-cmd onClick={openCmd}>
            <Icon name="search" />
            <span>{t('Szukaj')}</span>
            <i className="keys">
              <Keys keys={[MOD, 'K']} />
            </i>
          </button>
        </span>
        <PresentBar />
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
    <div className="pop" id="statusPop" role="menu" aria-label={t('Status dokumentu')} onPointerOver={over}>
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
