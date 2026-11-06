import { DOC_FORMATS, FORMAT_LABELS } from '../../../shared/types'
import { setFormat } from '../shell/home'
import { type FormatFilter, hasBothFormats, ui } from '../shell/state'

const OPTIONS: { id: FormatFilter; label: string }[] = [
  { id: 'all', label: 'Wszystkie' },
  ...DOC_FORMATS.map((id) => ({ id, label: FORMAT_LABELS[id] }))
]

/** Ten sam filtr stoi na ścianie i w bibliotece, bo panel bywa zwinięty. */
export function FormatSeg(): React.JSX.Element | null {
  if (!hasBothFormats()) return null
  return (
    <div className="seg format-seg" role="radiogroup" aria-label="Format dokumentów">
      {OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          role="radio"
          aria-checked={ui.format === id}
          className={ui.format === id ? 'on' : ''}
          onClick={() => setFormat(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
