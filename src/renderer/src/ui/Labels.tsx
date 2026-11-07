import type { KeyboardEvent, PointerEvent } from 'react'
import { type LabelTone, MAX_LABEL_LENGTH } from '../../../shared/labels'
import type { DocEntry } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { clamp } from '../motion/spring'
import { autoLabelDoc, chooseLabel, closeLabelPop, labelRows, picker } from '../shell/labels'
import { labelPill } from '../shell/layout'
import { colorAttr, focusedDoc, labelToneOf, notify, ui, useShell } from '../shell/state'
import { useSynced } from './hooks'
import { Icon } from './icons'

export function LabelTags({ doc, max }: { doc: DocEntry; max: number }): React.JSX.Element {
  const rest = doc.labels.length - max
  return (
    <>
      {doc.labels.slice(0, max).map((name) => (
        <span key={name} className="tag label" data-color={colorAttr(name)} title={name}>
          {name}
        </span>
      ))}
      {rest > 0 && <span className="tag">+{rest}</span>}
    </>
  )
}

const tones = (): { tone: LabelTone; name: string }[] => [
  { tone: 'none', name: t('Bez koloru') },
  { tone: 'yellow', name: t('Żółty') },
  { tone: 'sand', name: t('Piaskowy') },
  { tone: 'pink', name: t('Różowy') },
  { tone: 'lilac', name: t('Liliowy') },
  { tone: 'blue', name: t('Niebieski') },
  { tone: 'mint', name: t('Miętowy') },
  { tone: 'green', name: t('Zielony') }
]

/** Kolor pada od razu z nazwy, a tu użytkownik może go zmienić albo zdjąć. */
export function LabelSwatches({ name }: { name: string }): React.JSX.Element {
  const current = labelToneOf(name)
  return (
    <div className="label-swatches rv" role="radiogroup" aria-label={t('Kolor etykiety')}>
      {tones().map(({ tone, name: title }) => (
        <button
          key={tone}
          role="radio"
          aria-checked={tone === current}
          aria-label={title}
          title={title}
          data-color={tone === 'none' ? undefined : tone}
          onClick={() => void window.api.setLabelColor(name, tone)}
        />
      ))}
    </div>
  )
}

/** Wybierak stoi nad dokiem. Zostaje otwarty po wyborze, bo dokument zwykle dostaje kilka etykiet. */
export function LabelPop(): React.JSX.Element {
  useShell()
  const doc = focusedDoc()
  const rows = doc && ui.labelPop ? labelRows(doc) : []
  const idx = clamp(picker.idx, 0, Math.max(0, rows.length - 1))
  const reading = doc !== null && doc !== undefined && ui.autoLabel.pending.includes(doc.id)

  useSynced(() => {
    const box = document.getElementById('labelRows')
    const row = box?.querySelector<HTMLElement>(`[data-l="${idx}"]`)
    if (!box || !row) {
      labelPill.hide()
      return
    }
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight
    }
    labelPill.to({ x: row.offsetLeft, y: row.offsetTop, w: row.offsetWidth, h: row.offsetHeight })
  })

  const select = (i: number): void => {
    picker.idx = clamp(i, 0, Math.max(0, rows.length - 1))
    notify()
  }

  const key = (e: KeyboardEvent<HTMLInputElement>): void => {
    const row = rows[idx]
    if (e.key === 'ArrowDown') select(idx + 1)
    else if (e.key === 'ArrowUp') select(idx - 1)
    else if (e.key === 'Enter' && doc && row) chooseLabel(doc, row)
    else if (e.key === 'Escape') closeLabelPop()
    else return
    // Klawisz należy do pola, więc nie może dojść do skrótów apki.
    e.preventDefault()
    e.stopPropagation()
  }

  const moved = (e: PointerEvent<HTMLElement>): void => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-l]')
    if (row && Number(row.dataset.l) !== idx) select(Number(row.dataset.l))
  }

  return (
    <div
      className={ui.labelPop ? 'pop label-pop on' : 'pop label-pop'}
      id="labelPop"
      role="dialog"
      aria-label={t('Etykiety dokumentu')}
      style={{ left: picker.left, bottom: picker.bottom }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).id !== 'labelInput') e.preventDefault()
      }}
    >
      <div className="label-rows" id="labelRows" onPointerMove={moved}>
        <i className="pop-pill" ref={labelPill.bind} />
        {rows.map((row, i) => (
          <button
            key={row.name}
            data-l={i}
            role="menuitemcheckbox"
            aria-checked={row.on}
            data-color={row.create ? undefined : colorAttr(row.name)}
            onClick={() => doc && chooseLabel(doc, row)}
          >
            <Icon name="tag" />
            <span>{row.create ? t('Utwórz „{name}”', { name: row.name }) : row.name}</span>
            {row.on && <Icon name="check" />}
          </button>
        ))}
        {rows.length === 0 && <p className="label-hint">{t('Wpisz nazwę, np. Plan albo PROJ-123.')}</p>}
      </div>
      {picker.note && (
        <p className="label-hint" role="status">
          {picker.note}
        </p>
      )}
      <div className="label-foot">
        <input
          id="labelInput"
          type="text"
          placeholder={t('Szukaj lub dodaj etykietę')}
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_LABEL_LENGTH}
          aria-label={t('Szukaj lub dodaj etykietę')}
          value={picker.query}
          onChange={(e) => {
            picker.query = e.target.value
            picker.idx = 0
            notify()
          }}
          onKeyDown={key}
        />
        <button
          className="ask"
          id="autoLabelBtn"
          disabled={reading}
          title={t('Haiku czyta dokument i wybiera z Twoich etykiet')}
          onClick={() => {
            picker.note = ''
            if (doc) void autoLabelDoc(doc)
          }}
        >
          <span>{reading ? t('Czytam') : 'Auto'}</span>
        </button>
      </div>
    </div>
  )
}
