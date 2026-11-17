import { sameLabel } from '../../../shared/labels'
import { t } from '../../../shared/i18n'
import { activeFilter, clearLabelFilter, labelFilter, toggleFilterLabel, toggleLabelBar, UNLABELED } from '../shell/labelFilter'
import { colorAttr, kindCatalog } from '../shell/state'
import { Icon } from './icons'

/** Bez żadnej etykiety w bibliotece nie ma czego filtrować, więc przycisku nie widać. */
export function LabelFilterButton(): React.JSX.Element | null {
  const active = activeFilter().length
  if (kindCatalog().length === 0 && active === 0) return null
  const label = t('Filtruj po etykietach')
  return (
    <button
      className={labelFilter.open || active > 0 ? 'mini on' : 'mini'}
      id="labelFilterBtn"
      aria-label={label}
      aria-expanded={labelFilter.open}
      title={label}
      onClick={toggleLabelBar}
    >
      <Icon name="tag" />
      {active > 0 && <em>{active}</em>}
    </button>
  )
}

function Chip({ name, title, on }: { name: string; title: string; on: boolean }): React.JSX.Element {
  return (
    <button
      className="lf-chip"
      aria-pressed={on}
      data-color={name === UNLABELED ? undefined : colorAttr(name)}
      title={title}
      onClick={() => toggleFilterLabel(name)}
    >
      {title}
    </button>
  )
}

/**
 * Rozwinięty pasek pokazuje wszystkie etykiety, a zwinięty tylko wybrane, żeby było widać, czemu
 * drzewo jest krótsze. Klik w wybraną etykietę zdejmuje ją z filtra.
 */
export function LabelFilterBar(): React.JSX.Element | null {
  const active = activeFilter()
  if (!labelFilter.open && active.length === 0) return null
  const isOn = (name: string): boolean => active.some((item) => sameLabel(item, name))
  const chosen = active.filter((name) => name !== UNLABELED)
  // Kod zgłoszenia trafia tu tylko z menu wiersza, więc rozwinięty pasek dokłada go do zwykłych etykiet.
  const kinds = kindCatalog().map(({ name }) => name)
  const names = labelFilter.open ? [...kinds, ...chosen.filter((name) => !kinds.some((kind) => sameLabel(kind, name)))] : chosen
  const unlabeled = labelFilter.open || isOn(UNLABELED)
  return (
    <div className="label-filter" role="group" aria-label={t('Filtruj po etykietach')}>
      {names.map((name) => (
        <Chip key={name} name={name} title={name} on={isOn(name)} />
      ))}
      {unlabeled && <Chip name={UNLABELED} title={t('Bez etykiet')} on={isOn(UNLABELED)} />}
      {active.length > 0 && (
        <button className="lf-clear" aria-label={t('Wyczyść filtr')} title={t('Wyczyść filtr')} onClick={clearLabelFilter}>
          <Icon name="x" />
        </button>
      )}
    </div>
  )
}
