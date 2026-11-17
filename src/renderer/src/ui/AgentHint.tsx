import { useEffect } from 'react'
import { t } from '../../../shared/i18n'
import { agentHintShown, checkAgentLater, dismissAgentHint, installPlugin, openOptions, options } from '../shell/options'
import { Icon } from './icons'

/** Claude Code startuje około sekundy, więc pytanie o plugin czeka, aż apka skończy swój start. */
const CHECK_DELAY_MS = 4000

/**
 * Cicha linijka pod paskiem szukania, gdy plugin Claude Code da się zainstalować jednym kliknięciem.
 * Znika na zawsze po zamknięciu, a szczegóły i kroki ręczne zostają w Opcjach.
 */
export function AgentHint(): React.JSX.Element | null {
  useEffect(() => checkAgentLater(CHECK_DELAY_MS), [])
  if (!agentHintShown()) return null
  const { agent, installing, installError, installed } = options
  const done = installed && agent?.plugin === 'enabled'
  const enable = agent?.plugin === 'disabled'
  return (
    <div className="h-agent" role="status">
      <Icon name={done ? 'check' : 'term'} />
      <span className="h-agent-text">
        {done
          ? t('Plugin działa. Zacznij nową sesję Claude Code, żeby agent go zobaczył.')
          : (installError ?? t('Połącz Claude Code z biblioteką, a agent przeczyta dokumenty i Twoje uwagi.'))}
      </span>
      {!done && (
        <>
          <button className="h-agent-go" disabled={installing} onClick={() => void installPlugin()}>
            {installing ? t('Instaluję…') : enable ? t('Włącz plugin') : t('Zainstaluj plugin')}
          </button>
          <button className="h-agent-more" onClick={() => openOptions('agent')}>
            {t('Szczegóły')}
          </button>
        </>
      )}
      <button className="mini" aria-label={t('Nie pokazuj więcej')} title={t('Nie pokazuj więcej')} onClick={dismissAgentHint}>
        <Icon name="x" />
      </button>
    </div>
  )
}
