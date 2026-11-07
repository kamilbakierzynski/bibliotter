import { type KeyboardEvent, useEffect } from 'react'
import type { Annotation, ShapeType } from '../../../shared/annotations'
import { t } from '../../../shared/i18n'
import { type PickKind, type PresentationStep, shotOwner, type StepCamera, type StepRest } from '../../../shared/presentation'
import { drawings } from '../shell/drawings'
import { noteNumber, setInsp } from '../shell/notes'
import { startPresentation } from '../shell/present'
import {
  addStep,
  flushRoute,
  holdCamera,
  leaveRoute,
  loadRoute,
  removeStep,
  renameStep,
  restoreStep,
  route,
  routeLoaded,
  selectedIndex,
  selectStep,
  setRest,
  shiftStep,
  startPick,
  stepLabel,
  stepsOf,
  syncFrames,
  toggleShown,
  togglePreview
} from '../shell/route'
import { data, noteText, ui, useShell } from '../shell/state'
import { Icon } from './icons'
import { SkeletonList } from './Skeleton'

const QUOTE_LENGTH = 60

const cameraChoices = (): { id: StepCamera['kind']; label: string }[] => [
  { id: 'hold', label: t('Bez ruchu') },
  { id: 'place', label: t('Miejsce') },
  { id: 'area', label: t('Obszar') }
]

const restChoices = (): { id: StepRest; label: string }[] => [
  { id: 'normal', label: t('Normalnie') },
  { id: 'dim', label: t('Przygaszona') },
  { id: 'hide', label: t('Ukryta') }
]

const shapeNames = (): Record<ShapeType, string> => ({
  arrow: t('Strzałka'),
  rect: t('Prostokąt'),
  ellipse: t('Elipsa'),
  line: t('Linia')
})

const clip = (text: string): string => (text.length > QUOTE_LENGTH ? `${text.slice(0, QUOTE_LENGTH - 1).trimEnd()}…` : text)

/** Uwagi i kształty dokumentu, które krok może pokazać, w kolejności powstania. */
function showable(docId: string): { note: Annotation; icon: string; label: string }[] {
  const notes = data.annotations.filter((note) => note.docId === docId && note.status === 'open')
  const shapes = drawings.shapes.filter((shape) => shape.docId === docId)
  return [...notes, ...shapes]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((note) => {
      if (note.kind === 'shape' && note.shape) {
        return { note, icon: `shape-${note.shape.type}`, label: shapeNames()[note.shape.type] }
      }
      const text = clip(noteText(note))
      if (note.kind === 'comment') {
        return { note, icon: 'comment', label: t('Komentarz {n}: {text}', { n: noteNumber(note.id) ?? '', text }) }
      }
      return { note, icon: note.kind === 'highlight' ? 'marker' : 'sticky', label: text }
    })
}

function cameraText(steps: PresentationStep[], index: number, missing: boolean, picking: PickKind | null): string {
  if (picking === 'place') return t('Kliknij element w dokumencie. Esc anuluje.')
  if (picking === 'area') return t('Przeciągnij po dokumencie, żeby zaznaczyć obszar. Esc anuluje.')
  const camera = (steps[index] as PresentationStep).camera
  if (camera.kind === 'hold') {
    const owner = shotOwner(steps, index)
    return owner < 0 ? t('Kamera pokazuje cały dokument.') : t('Kamera stoi jak w kroku {n}.', { n: owner + 1 })
  }
  if (missing) return t('Tego miejsca nie ma już w dokumencie, więc prezentacja pominie ten krok. Wskaż kadr od nowa.')
  // Element bez tekstu, np. wykres, rozpoznaje się po rozdziale, w którym stoi.
  const quote = clip(camera.anchor.quote)
  const heading = clip(camera.anchor.heading ?? '')
  if (camera.kind === 'place') {
    if (quote) return t('Kamera pokaże element „{quote}”.', { quote })
    return heading ? t('Kamera pokaże element w części „{heading}”.', { heading }) : t('Kamera pokaże wskazany element.')
  }
  if (quote) return t('Kamera pokaże obszar przy „{quote}”.', { quote })
  return heading ? t('Kamera pokaże obszar w części „{heading}”.', { heading }) : t('Kamera pokaże wskazany obszar.')
}

function StepEditor({ docId, steps, index }: { docId: string; steps: PresentationStep[]; index: number }): React.JSX.Element {
  const step = steps[index] as PresentationStep
  const missing = route.missing.get(docId)?.has(step.id) === true
  const picking = route.picking?.stepId === step.id ? route.picking.kind : null
  const kind = picking ?? step.camera.kind
  const items = showable(docId)

  return (
    <section className="rt-edit" aria-label={stepLabel(step, index)} data-editing={step.id}>
      <div className="rt-edit-head">
        <strong>{t('Krok {n}', { n: index + 1 })}</strong>
        <div className="rt-acts">
          <button
            className="mini"
            aria-label={t('Przesuń krok wyżej')}
            data-tip={t('Wyżej')}
            disabled={index === 0}
            onClick={() => shiftStep(docId, step.id, -1)}
          >
            <Icon name="up" />
          </button>
          <button
            className="mini"
            aria-label={t('Przesuń krok niżej')}
            data-tip={t('Niżej')}
            disabled={index === steps.length - 1}
            onClick={() => shiftStep(docId, step.id, 1)}
          >
            <Icon name="down" />
          </button>
          <button className="mini" aria-label={t('Usuń krok')} data-tip={t('Usuń')} onClick={() => removeStep(docId, step.id)}>
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <label className="o-label" htmlFor="rtTitle">
        {t('Nazwa')}
      </label>
      <input
        id="rtTitle"
        className="rt-input"
        type="text"
        value={step.title}
        placeholder={stepLabel({ ...step, title: '' }, index)}
        maxLength={120}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => renameStep(docId, step.id, event.target.value)}
        onBlur={() => flushRoute(docId)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') (event.target as HTMLInputElement).blur()
        }}
      />

      <span className="o-label">{t('Kadr')}</span>
      <div className="seg" role="radiogroup" aria-label={t('Kadr')}>
        {cameraChoices().map(({ id, label }) => (
          <button
            key={id}
            role="radio"
            aria-checked={kind === id}
            className={kind === id ? 'on' : ''}
            data-camera={id}
            onClick={() => (id === 'hold' ? holdCamera(docId, step.id) : startPick(id))}
          >
            {label}
          </button>
        ))}
      </div>
      <p className={missing && !picking ? 'rt-hint warn' : picking ? 'rt-hint live' : 'rt-hint'} aria-live="polite">
        {missing && !picking && <Icon name="warn" />}
        <span>{cameraText(steps, index, missing, picking)}</span>
      </p>

      <span className="o-label">{t('Reszta dokumentu')}</span>
      <div className="seg" role="radiogroup" aria-label={t('Reszta dokumentu')}>
        {restChoices().map(({ id, label }) => (
          <button
            key={id}
            role="radio"
            aria-checked={step.rest === id}
            className={step.rest === id ? 'on' : ''}
            data-rest={id}
            onClick={() => setRest(docId, step.id, id)}
          >
            {label}
          </button>
        ))}
      </div>

      <span className="o-label">{t('Pokaż w tym kroku')}</span>
      {items.length === 0 ? (
        <p className="rt-none">{t('Dokument nie ma jeszcze uwag ani kształtów. Dodaj je narzędziami w doku.')}</p>
      ) : (
        <div className="rt-show" role="group" aria-label={t('Pokaż w tym kroku')}>
          {items.map(({ note, icon, label }) => {
            const on = step.show.includes(note.id)
            return (
              <button
                key={note.id}
                className="rt-item"
                role="checkbox"
                aria-checked={on}
                data-show={note.id}
                onClick={() => toggleShown(docId, step.id, note.id)}
              >
                <i className="rt-box">{on && <Icon name="check" />}</i>
                <Icon name={icon} className={note.color ? `rt-ink ${note.color}` : 'rt-ink'} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function RoutePanel({ docId }: { docId: string | null }): React.JSX.Element {
  useShell()
  const steps = stepsOf(docId)
  const index = selectedIndex(docId)
  const loaded = routeLoaded(docId)
  const missing = docId ? route.missing.get(docId) : undefined

  useEffect(() => {
    if (docId) void loadRoute(docId)
  }, [docId])

  // Panel bywa schowany, a nie odmontowany, więc kadry w dokumencie idą za jego stanem.
  useEffect(() => {
    syncFrames()
  }, [docId, ui.insp, loaded])

  useEffect(() => () => leaveRoute(), [])

  const onListKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (!docId || index < 0 || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const delta = event.key === 'ArrowUp' ? -1 : 1
    const step = steps[index] as PresentationStep
    if (event.altKey) {
      shiftStep(docId, step.id, delta)
      return
    }
    const next = steps[Math.min(steps.length - 1, Math.max(0, index + delta))]
    if (!next) return
    selectStep(docId, next.id)
    event.currentTarget.querySelector<HTMLElement>(`[data-step="${next.id}"]`)?.focus()
  }

  return (
    <>
      <header className="insp-head">
        <strong>
          {t('Trasa')} <span>{steps.length || ''}</span>
        </strong>
        <div className="rt-acts">
          <button
            className={route.preview ? 'mini on' : 'mini'}
            id="rtPreview"
            aria-label={t('Podgląd kroku')}
            aria-pressed={route.preview}
            data-tip={t('Podgląd kroku')}
            disabled={steps.length === 0}
            onClick={togglePreview}
          >
            <Icon name="eye" />
          </button>
          <button className="mini" aria-label={t('Zamknij trasę')} onClick={() => setInsp(false)}>
            <Icon name="x" />
          </button>
        </div>
      </header>
      <div className="rt" id="routeForm">
        {docId && !loaded ? (
          <SkeletonList count={4} />
        ) : !docId ? (
          <p className="empty">{t('Otwórz dokument, żeby ułożyć jego trasę.')}</p>
        ) : steps.length === 0 ? (
          <p className="empty">
            {t('Trasa prowadzi przez dokument krok po kroku, jedno kliknięcie na krok. Dodaj pierwszy krok i wskaż jego kadr w dokumencie.')}
          </p>
        ) : (
          <>
            <ol className="rt-steps" aria-label={t('Kroki')} onKeyDown={onListKey}>
              {steps.map((step, i) => (
                <li key={step.id}>
                  <button
                    className={i === index ? 'rt-step on' : 'rt-step'}
                    data-step={step.id}
                    aria-current={i === index ? 'step' : undefined}
                    tabIndex={i === index ? 0 : -1}
                    onClick={() => selectStep(docId, step.id)}
                  >
                    <em>{i + 1}</em>
                    <span>{stepLabel(step, i)}</span>
                    {missing?.has(step.id) && step.camera.kind !== 'hold' ? (
                      <Icon name="warn" className="rt-warn" />
                    ) : (
                      <Icon name={`cam-${step.camera.kind}`} className="rt-kind" />
                    )}
                  </button>
                </li>
              ))}
            </ol>
            {index >= 0 && <StepEditor docId={docId} steps={steps} index={index} />}
          </>
        )}
      </div>
      {docId && loaded && (
        <footer className="insp-foot">
          <div className="insp-acts">
            <button className="ask" id="rtAdd" onClick={() => addStep(docId)}>
              <Icon name="plus" />
              <span>{t('Dodaj krok')}</span>
            </button>
            {route.removed?.docId === docId && (
              <button className="ask" id="rtRestore" onClick={restoreStep}>
                <Icon name="undo" />
                <span>{t('Przywróć krok')}</span>
              </button>
            )}
            <button
              className="ask pl-solid rt-play"
              id="rtPresent"
              data-tip={t('Prezentuj od pierwszego kroku')}
              disabled={steps.length === 0}
              onClick={() => void startPresentation()}
            >
              <Icon name="play" />
              <span>{t('Prezentuj')}</span>
            </button>
          </div>
        </footer>
      )}
    </>
  )
}
