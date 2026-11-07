import { type KeyboardEvent, useEffect, useState } from 'react'
import {
  type AgentSetup,
  buildCommand,
  cliCommand,
  ENABLE_COMMAND,
  installCommands,
  mcpConfig,
  type PluginContents,
  type PluginState
} from '../../../shared/options'
import { language, LANGUAGES, t } from '../../../shared/i18n'
import type { ThemeChoice } from '../../../shared/types'
import type { Audience } from '../../../shared/annotations'
import {
  addHost,
  addStarter,
  aiLabel,
  countHosts,
  jiraLabel,
  loadAgent,
  loadInfo,
  type OptionsPage,
  options,
  pluginLabel,
  removeHost,
  removeStarter,
  saveTicketUrl,
  setAutoLabel,
  setDefaultAudience,
  setOpenAtLogin,
  setStartView,
  showPage,
  ticketSample
} from '../shell/options'
import { changeLanguage } from '../shell/language'
import { autoLabelVisible } from '../shell/labels'
import { openMap } from '../shell/palette'
import { data, type StartView, ui, unlabeledDocs } from '../shell/state'
import { setTheme } from '../shell/theme'
import { Icon, Keys } from './icons'
import { SkeletonList } from './Skeleton'

const COPIED_MS = 1400

const themes = (): { value: ThemeChoice; label: string }[] => [
  { value: 'system', label: t('Systemowy') },
  { value: 'light', label: t('Jasny') },
  { value: 'dark', label: t('Ciemny') }
]
const starts = (): { value: StartView; label: string }[] => [
  { value: 'home', label: t('Ekran startowy') },
  { value: 'last', label: t('Ostatni układ') }
]
const audiences = (): { value: Audience; label: string }[] => [
  { value: 'agent', label: t('Dla agenta') },
  { value: 'me', label: t('Dla mnie') }
]

function Choice<Value extends string>({
  label,
  value,
  items,
  pick
}: {
  label: string
  value: Value
  items: readonly { value: Value; label: string }[]
  pick: (value: Value) => void
}): React.JSX.Element {
  return (
    <div className="o-field rv">
      <span className="o-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {items.map((item) => (
          <button
            key={item.value}
            role="radio"
            aria-checked={item.value === value}
            className={item.value === value ? 'on' : ''}
            onClick={() => pick(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({
  label,
  on,
  flip
}: {
  label: string
  on: boolean
  flip: (on: boolean) => void
}): React.JSX.Element {
  return (
    <button className="o-toggle rv" role="switch" aria-checked={on} onClick={() => flip(!on)}>
      <span>{label}</span>
      <i />
    </button>
  )
}

function PageRow({
  page,
  icon,
  title,
  sub
}: {
  page: OptionsPage
  icon: string
  title: string
  sub: string
}): React.JSX.Element {
  return (
    <button className="row o-page rv" onClick={() => showPage(page)}>
      <Icon name={icon} />
      <span className="o-text">
        <span className="lbl">{title}</span>
        <span className="sub">{sub}</span>
      </span>
      <Icon name="chev" />
    </button>
  )
}

function MainPage(): React.JSX.Element {
  const { info, agent } = options
  return (
    <>
      <h2 className="f-head rv">{t('Wygląd')}</h2>
      <Choice label={t('Motyw')} value={ui.theme} items={themes()} pick={setTheme} />
      <Choice label={t('Język')} value={language()} items={LANGUAGES} pick={changeLanguage} />
      <h2 className="f-head rv">{t('Praca')}</h2>
      <Choice label={t('Po uruchomieniu')} value={ui.start} items={starts()} pick={setStartView} />
      <Choice label={t('Nowy komentarz')} value={ui.aud} items={audiences()} pick={setDefaultAudience} />
      <Toggle label={t('Uruchamiaj z systemem')} on={info?.openAtLogin ?? false} flip={(on) => void setOpenAtLogin(on)} />
      <h2 className="f-head rv">{t('Połączenia')}</h2>
      <PageRow page="ai" icon="tag" title="AI" sub={aiLabel()} />
      <PageRow page="jira" icon="link" title="Jira" sub={jiraLabel()} />
      <PageRow page="agent" icon="term" title="Agent" sub={pluginLabel(agent)} />
      <PageRow page="hosts" icon="link" title={t('Dozwolone adresy')} sub={countHosts()} />
      <h2 className="f-head rv">{t('Dane')}</h2>
      <p className="f-lead rv">{t('Uwagi, etykiety i kopie dokumentów leżą w jednym folderze, który możesz objąć własnym gitem.')}</p>
      {info && (
        <div className="f-row rv">
          <span className="lbl" title={info.dataDir}>
            {info.dataDir}
          </span>
          <button
            className="mini"
            aria-label={t('Pokaż folder danych w Eksploratorze')}
            title={t('Pokaż w Eksploratorze')}
            onClick={() => void window.api.revealFolder(info.dataDir)}
          >
            <Icon name="reveal" />
          </button>
        </div>
      )}
      <h2 className="f-head rv">{t('Pomoc')}</h2>
      <button className="row rv" onClick={openMap}>
        <Icon name="keyboard" />
        <span className="lbl">{t('Wszystkie skróty')}</span>
        <span className="keys">
          <Keys keys={['?']} />
        </span>
      </button>
    </>
  )
}

function Code({ text, label }: { text: string; label: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <div className="o-code rv">
      <code>{text}</code>
      <button
        className="mini"
        aria-label={copied ? t('Skopiowano') : label}
        title={copied ? t('Skopiowano') : t('Kopiuj')}
        onClick={() => {
          window.api.copyText(text)
          setCopied(true)
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
    </div>
  )
}

function Step({ title, text, label }: { title: string; text?: string; label?: string }): React.JSX.Element {
  return (
    <li className="o-step">
      <span className="o-step-text rv">{title}</span>
      {text && <Code text={text} label={label ?? title} />}
    </li>
  )
}

function InstallSteps({ agent }: { agent: AgentSetup }): React.JSX.Element {
  if (!agent.marketplace || !agent.project) {
    return <p className="f-lead rv">{t('Ta kopia apki nie ma folderu pluginu, więc nie ma skąd go zainstalować.')}</p>
  }
  if (agent.plugin === 'disabled') {
    return (
      <ol className="o-steps">
        <Step title={t('Włącz plugin.')} text={ENABLE_COMMAND} label={t('Kopiuj polecenie włączenia pluginu')} />
        <Step title={t('Zacznij nową sesję Claude Code.')} />
      </ol>
    )
  }
  const [addSource, install] = installCommands(agent.marketplace)
  return (
    <ol className="o-steps">
      {!agent.serverBuilt && (
        <Step title={t('Zbuduj serwer MCP.')} text={buildCommand(agent.project)} label={t('Kopiuj polecenie budowania')} />
      )}
      <Step title={t('Dodaj folder pluginu do Claude Code.')} text={addSource} label={t('Kopiuj polecenie dodania folderu')} />
      <Step title={t('Zainstaluj plugin.')} text={install} label={t('Kopiuj polecenie instalacji')} />
      <Step title={t('Zacznij nową sesję Claude Code.')} />
    </ol>
  )
}

const pluginTag = (state: PluginState): string =>
  ({ enabled: t('działa'), disabled: t('wyłączony'), absent: t('brak'), unknown: t('nieznany') })[state]

function Part({ label, count, children }: { label: string; count: number; children?: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <div className="o-part rv">
        <span>{label}</span>
        <span className="o-count">{count === 0 ? t('brak') : count}</span>
      </div>
      {count > 0 && <p className="o-names rv">{children}</p>}
    </>
  )
}

function Contents({ contents }: { contents: PluginContents }): React.JSX.Element {
  const { tools, skills, hooks, commands, agents } = contents
  return (
    <>
      <Part label={t('Narzędzia MCP')} count={tools.length}>
        {tools.join(', ')}
      </Part>
      <Part label={t('Skille')} count={skills.length}>
        {skills.map((skill) => skill.name).join(', ')}
      </Part>
      <Part label={t('Hooki')} count={hooks.length}>
        {hooks.join(', ')}
      </Part>
      {commands.length > 0 && (
        <Part label={t('Polecenia')} count={commands.length}>
          {commands.join(', ')}
        </Part>
      )}
      {agents.length > 0 && (
        <Part label={t('Agenci')} count={agents.length}>
          {agents.join(', ')}
        </Part>
      )}
    </>
  )
}

function Back(): React.JSX.Element {
  return (
    <div className="label-tools rv">
      <button className="mini" aria-label={t('Wszystkie opcje')} onClick={() => showPage('main')}>
        <Icon name="prev" />
      </button>
    </div>
  )
}

function AgentPage(): React.JSX.Element {
  const { agent } = options
  const [pressed, result] = t(
    'Naciśnij {key} przy otwartym dokumencie i wklej odnośnik do rozmowy. Agent sam przeczyta dokument i uwagi do niego.'
  ).split('{key}')
  useEffect(() => {
    addEventListener('focus', loadAgent)
    return () => removeEventListener('focus', loadAgent)
  }, [])
  return (
    <>
      <Back />
      <p className="f-lead rv">{t('Agent czyta dokumenty i Twoje uwagi dopiero wtedy, gdy o to poprosisz.')}</p>
      {!agent && <SkeletonList shape="two" count={4} />}
      {agent && (
        <>
          <h2 className="f-head o-head rv">
            {t('Plugin Claude Code')}
            <span className="tag">{agent.version ?? pluginTag(agent.plugin)}</span>
          </h2>
          {agent.plugin === 'unknown' && (
            <p className="f-lead rv">{t('Polecenie claude nie odpowiada. Zainstaluj Claude Code albo dodaj je do ścieżki systemowej.')}</p>
          )}
          <InstallSteps agent={agent} />
          <h2 className="f-head rv">{t('Co dostaje agent')}</h2>
          <Contents contents={agent.contents} />
          <h2 className="f-head rv">{t('Odnośnik do dokumentu')}</h2>
          <p className="f-lead rv">
            {pressed}
            <kbd>R</kbd>
            {result}
          </p>
          {agent.project && (
            <>
              <h2 className="f-head o-head rv">
                {t('CLI bibliotter')}
                <span className="tag">{agent.cli ? t('jest') : t('brak')}</span>
              </h2>
              <p className="f-lead rv">{t('Dla skryptów i agentów bez MCP. Pliki CLI powstają przy budowaniu apki.')}</p>
              <Code text={cliCommand(agent.project)} label={t('Kopiuj polecenie instalacji CLI')} />
            </>
          )}
          {agent.server && (
            <>
              <h2 className="f-head rv">{t('Inny agent')}</h2>
              <p className="f-lead rv">{t('Ta sama biblioteka działa z każdym agentem z MCP. Wklej to do jego konfiguracji.')}</p>
              <Code text={mcpConfig(agent.server)} label={t('Kopiuj konfigurację MCP')} />
            </>
          )}
        </>
      )}
    </>
  )
}

function StarterField(): React.JSX.Element {
  const key = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      addStarter(e.currentTarget.value)
      e.currentTarget.value = ''
    } else if (e.key === 'Escape') {
      e.currentTarget.value = ''
      e.currentTarget.blur()
    } else return
    // Klawisz należy do pola, więc nie może dojść do skrótów apki.
    e.stopPropagation()
  }
  return (
    <div className="label-tools o-host rv">
      <input type="text" placeholder={t('Dodaj etykietę, np. Postmortem')} spellCheck={false} aria-label={t('Nowa etykieta do wyboru')} onKeyDown={key} />
    </div>
  )
}

/** Same idą tylko nowe pliki i tylko po włączeniu, bo treść dokumentu trafia wtedy do modelu. */
function AiPage(): React.JSX.Element {
  const { newFiles, tickets, starters, done, total, error } = ui.autoLabel
  const todo = unlabeledDocs().length
  return (
    <>
      <Back />
      <p className="f-lead rv">
        {t('Haiku czyta początek dokumentu i wybiera pasujące etykiety. Działa przez Claude Code na tym komputerze, bez klucza API.')}
      </p>
      {options.agent?.plugin === 'unknown' && <p className="f-lead rv">{t('Nie znaleziono Claude Code, więc etykiety AI nie zadziałają.')}</p>}
      <h2 className="f-head rv">{t('Automatycznie')}</h2>
      <Toggle label={t('Etykietuj nowe pliki')} on={newFiles} flip={(on) => setAutoLabel({ newFiles: on })} />
      <Toggle label={t('Dodawaj kody zgłoszeń')} on={tickets} flip={(on) => setAutoLabel({ tickets: on })} />
      <h2 className="f-head rv">{t('Etykiety do wyboru')}</h2>
      <p className="f-lead rv">{t('Haiku wybiera z tej listy i z etykiet już używanych w bibliotece. Własnych nazw nie tworzy.')}</p>
      <StarterField />
      {starters.map((name) => (
        <div className="f-row rv" key={name}>
          <span className="lbl o-ltr" title={name}>
            {name}
          </span>
          <button className="mini" aria-label={t('Usuń {name}', { name })} onClick={() => removeStarter(name)}>
            <Icon name="x" />
          </button>
        </div>
      ))}
      <h2 className="f-head rv">{t('Na żądanie')}</h2>
      <p className="f-lead rv">{t('Widoczne dokumenty bez etykiet. Archiwum zostaje nietknięte.')}</p>
      {total > 0 ? (
        <button className="row rv" id="autoLabelStop" onClick={() => void window.api.stopAutoLabel()}>
          <Icon name="x" />
          <span className="lbl">{t('Zatrzymaj')}</span>
          <span className="num">{t('{done} z {total}', { done, total })}</span>
        </button>
      ) : (
        <button className="row rv" id="autoLabelAll" disabled={todo === 0} onClick={autoLabelVisible}>
          <Icon name="tag" />
          <span className="lbl">{t('Etykietuj nieoznaczone')}</span>
          <span className="num">{todo}</span>
        </button>
      )}
      {error && <p className="f-lead rv">{error}</p>}
    </>
  )
}

function HostField(): React.JSX.Element {
  const [wrong, setWrong] = useState(false)
  const key = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      const added = addHost(e.currentTarget.value)
      setWrong(!added)
      if (added) e.currentTarget.value = ''
    } else if (e.key === 'Escape') {
      e.currentTarget.value = ''
      e.currentTarget.blur()
    } else return
    // Klawisz należy do pola, więc nie może dojść do skrótów apki.
    e.stopPropagation()
  }
  return (
    <>
      <div className="label-tools o-host rv">
        <input
          type="text"
          placeholder={t('Dodaj adres, np. cdn.example.com')}
          spellCheck={false}
          aria-label={t('Nowy dozwolony adres')}
          aria-invalid={wrong}
          onChange={() => setWrong(false)}
          onKeyDown={key}
        />
      </div>
      {wrong && <p className="f-lead rv">{t('To nie wygląda na adres. Wpisz nazwę hosta albo wklej link.')}</p>}
    </>
  )
}

/** Pole bierze to, co użytkownik ma pod ręką, a pod spodem widać, jaki link z tego wyszedł. */
function JiraPage(): React.JSX.Element {
  const saved = data.library?.ticketUrl ?? ''
  const sample = ticketSample()
  const [wrong, setWrong] = useState(false)
  const save = (input: HTMLInputElement): void => {
    if (input.value.trim() !== saved) setWrong(!saveTicketUrl(input.value))
  }
  const key = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') save(e.currentTarget)
    else if (e.key === 'Escape') {
      e.currentTarget.value = saved
      setWrong(false)
      e.currentTarget.blur()
    } else return
    // Klawisz należy do pola, więc nie może dojść do skrótów apki.
    e.stopPropagation()
  }
  return (
    <>
      <Back />
      <p className="f-lead rv">
        {t('Kody takie jak PROJ-123 apka rozpoznaje sama i zbiera w panelu etykiet. Wklej adres swojej Jiry albo dowolnego zgłoszenia, a kody staną się linkami.')}
      </p>
      <div className="label-tools o-host rv">
        <input
          key={saved}
          id="ticketUrl"
          type="text"
          defaultValue={saved}
          placeholder={t('np. firma.atlassian.net')}
          spellCheck={false}
          aria-label={t('Adres Jira')}
          aria-invalid={wrong}
          onChange={() => setWrong(false)}
          onBlur={(e) => save(e.currentTarget)}
          onKeyDown={key}
        />
      </div>
      {wrong && <p className="f-lead rv">{t('To nie wygląda na adres strony.')}</p>}
      {sample && !wrong && <p className="f-lead o-sample rv">{t('PROJ-123 otworzy {url}', { url: sample })}</p>}
    </>
  )
}

function HostsPage(): React.JSX.Element {
  const hosts = options.info?.allowedHosts ?? []
  return (
    <>
      <Back />
      <p className="f-lead rv">
        {t(
          t('Dokument nie łączy się z siecią. Wyjątkiem są pliki z tych adresów pobierane przez https, np. fonty i biblioteki z CDN. Zmiana zadziała po ponownym wczytaniu dokumentu.')
        )}
      </p>
      <HostField />
      {hosts.map((host) => (
        <div className="f-row rv" key={host}>
          <span className="lbl o-ltr" title={host}>
            {host}
          </span>
          <button className="mini" aria-label={t('Usuń {name}', { name: host })} onClick={() => removeHost(host)}>
            <Icon name="x" />
          </button>
        </div>
      ))}
    </>
  )
}

export function OptionsView(): React.JSX.Element {
  useEffect(() => {
    void loadInfo()
    void loadAgent()
  }, [])
  return (
    <div className="folders options">
      {options.page === 'ai' ? (
        <AiPage />
      ) : options.page === 'jira' ? (
        <JiraPage />
      ) : options.page === 'agent' ? (
        <AgentPage />
      ) : options.page === 'hosts' ? (
        <HostsPage />
      ) : (
        <MainPage />
      )}
    </div>
  )
}
