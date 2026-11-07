import type { Audience } from '../../../shared/annotations'
import type { AutoLabelOptions } from '../../../shared/autoLabel'
import { cleanLabel, ticketLink, ticketTemplate } from '../../../shared/labels'
import { type AgentSetup, type AppInfo, parseHost, type PluginState } from '../../../shared/options'
import { t } from '../../../shared/i18n'
import { versionName } from '../../../shared/otter'
import { toggleHome } from './home'
import { hoverPill, setView } from './layout'
import { data, notify, plural, saveAudience, saveStartView, type StartView, ui } from './state'

/*
 * Motyw i start zapisuje powłoka, tak jak inne ustawienia widoku. Autostart należy do systemu,
 * a dozwolone adresy do konfiguracji, bo sprawdza je proces główny.
 */

export type OptionsPage = 'main' | 'ai' | 'jira' | 'agent' | 'hosts'

export const options = {
  page: 'main' as OptionsPage,
  info: null as AppInfo | null,
  agent: null as AgentSetup | null,
  /** Status pluginu sprawdza osobny proces, więc nie ma sensu pytać dwa razy naraz. */
  checking: false
}

const pluginState = (state: PluginState): string =>
  ({
    enabled: t('Plugin działa'),
    disabled: t('Plugin wyłączony'),
    absent: t('Plugin niezainstalowany'),
    unknown: t('Nie znaleziono Claude Code')
  })[state]

export const pluginLabel = (agent: AgentSetup | null): string => (agent ? pluginState(agent.plugin) : t('Sprawdzam…'))

export function countHosts(): string {
  const n = options.info?.allowedHosts.length ?? 0
  return `${n} ${plural(n, 'adres', 'adresy', 'adresów')}`
}

export const aiLabel = (): string => (ui.autoLabel.newFiles ? t('Etykietuje nowe pliki') : t('Tylko na żądanie'))

/** Kod przykładowy tylko pokazuje, dokąd poprowadzi link. */
export const ticketSample = (): string | null => ticketLink(data.library?.ticketUrl, 'PROJ-123')

export function jiraLabel(): string {
  const sample = ticketSample()
  return sample ? new URL(sample).host : t('Bez adresu')
}

/** Zwraca `false`, gdy to nie wygląda na adres, a pole zostaje wtedy do poprawy. */
export function saveTicketUrl(value: string): boolean {
  const template = ticketTemplate(value)
  if (template === null) return false
  void window.api.setTicketUrl(template)
  return true
}

export function optionsHeading(): { title: string; sub: string } {
  if (options.page === 'ai') return { title: 'AI', sub: aiLabel() }
  if (options.page === 'jira') return { title: 'Jira', sub: jiraLabel() }
  if (options.page === 'agent') return { title: 'Agent', sub: pluginLabel(options.agent) }
  if (options.page === 'hosts') return { title: t('Dozwolone adresy'), sub: countHosts() }
  const { info } = options
  if (!info) return { title: t('Opcje'), sub: '' }
  const name = versionName(info.version)
  const sub = name
    ? t('Wersja {version} „{name}”, Electron {electron}', { version: info.version, name, electron: info.electron })
    : t('Wersja {version}, Electron {electron}', { version: info.version, electron: info.electron })
  return { title: t('Opcje'), sub }
}

export function showPage(page: OptionsPage): void {
  options.page = page
  // Wiersz pod kursorem właśnie zniknął, a nowa strona ma inny układ.
  hoverPill.hide()
  notify()
}

export async function loadInfo(): Promise<void> {
  options.info = await window.api.appInfo()
  notify()
}

/** Polecenie uruchamia się w terminalu, więc wynik widać dopiero po powrocie do apki. */
export async function loadAgent(): Promise<void> {
  if (options.checking) return
  options.checking = true
  try {
    options.agent = await window.api.agentSetup()
    notify()
  } finally {
    options.checking = false
  }
}

/** Ponowny wybór tego samego widoku zwija panel, a tu ma on po prostu stać otwarty. */
export function openOptions(page: OptionsPage = 'main'): void {
  options.page = page
  if (ui.view === 'options' && ui.nav) notify()
  else setView('options')
}

export const toggleOptions = (): void => setView('options')

export function setStartView(start: StartView): void {
  ui.start = start
  saveStartView(start)
  notify()
}

/** Wybór działa od razu na następny komentarz, a przełącznik w doku zmienia tylko bieżącą sesję. */
export function setDefaultAudience(audience: Audience): void {
  ui.aud = audience
  saveAudience(audience)
  notify()
}

export async function setOpenAtLogin(on: boolean): Promise<void> {
  const openAtLogin = await window.api.setOpenAtLogin(on)
  if (options.info) options.info = { ...options.info, openAtLogin }
  notify()
}

async function saveHosts(hosts: string[]): Promise<void> {
  const allowedHosts = await window.api.setAllowedHosts(hosts)
  if (options.info) options.info = { ...options.info, allowedHosts }
  notify()
}

/** Zwraca fałsz, gdy z wpisanego tekstu nie da się wyciągnąć nazwy hosta. */
export function addHost(input: string): boolean {
  const host = parseHost(input)
  if (!host) return false
  void saveHosts([...(options.info?.allowedHosts ?? []), host])
  return true
}

export function removeHost(host: string): void {
  void saveHosts((options.info?.allowedHosts ?? []).filter((item) => item !== host))
}

/** Zmiana wraca przez stan etykietowania, tak jak postęp kolejki. */
export const setAutoLabel = (change: Partial<AutoLabelOptions>): void => void window.api.setAutoLabelOptions(change)

export function addStarter(input: string): void {
  const name = cleanLabel(input)
  if (name) setAutoLabel({ starters: [...ui.autoLabel.starters, name] })
}

export function removeStarter(name: string): void {
  setAutoLabel({ starters: ui.autoLabel.starters.filter((starter) => starter !== name) })
}

/** Układ z poprzedniej sesji wraca tą samą drogą co klawisz `H`. */
export function resumeLast(): void {
  if (ui.start === 'last' && ui.last && ui.home && !ui.setup) toggleHome()
}
