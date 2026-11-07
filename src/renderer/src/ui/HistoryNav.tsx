import { t } from '../../../shared/i18n'
import { historyTarget, type Step, walkHistory } from '../shell/history'
import { sheetTipLeave, sheetTipOver, sheetTipPress } from '../shell/sheetTips'
import { data } from '../shell/state'
import { displayName } from '../tree'
import { Icon } from './icons'

function StepButton({ step }: { step: Step }): React.JSX.Element {
  const id = historyTarget(step)
  const doc = id ? data.entries.get(id) : undefined
  const back = step < 0
  return (
    <button
      className="mini"
      data-nav={back ? 'back' : 'forward'}
      disabled={!doc}
      aria-label={back ? t('Wstecz') : t('Dalej')}
      data-tip={doc ? (back ? t('Wróć do: {name}', { name: displayName(doc) }) : t('Przejdź do: {name}', { name: displayName(doc) })) : undefined}
      data-keys={back ? 'Alt ←' : 'Alt →'}
      onClick={() => walkHistory(step)}
    >
      <Icon name={back ? 'back' : 'forward'} />
    </button>
  )
}

/** Wstecz i dalej po ostatnio oglądanych dokumentach, na początku nagłówka arkusza. */
export function HistoryNav(): React.JSX.Element {
  return (
    <span className="pl-nav" onPointerOver={(e) => sheetTipOver(e.target)} onPointerLeave={sheetTipLeave} onPointerDown={sheetTipPress}>
      <StepButton step={-1} />
      <StepButton step={1} />
    </span>
  )
}
