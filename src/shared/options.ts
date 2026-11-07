/** Plugin leży w repozytorium apki, więc marketplace to zwykły folder na dysku. */
export const PLUGIN_NAME = 'bibliotter'
export const MARKETPLACE_NAME = 'bibliotter-local'
export const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`

/** `unknown` to też brak Claude Code, bo oba przypadki kończą się tym samym wynikiem polecenia. */
export type PluginState = 'enabled' | 'disabled' | 'absent' | 'unknown'

export interface PluginSkill {
  name: string
  about: string
}

/** Stan folderu pluginu, a nie lista z kodu, żeby nowy skill czy hook pojawił się w panelu sam. */
export interface PluginContents {
  tools: string[]
  skills: PluginSkill[]
  hooks: string[]
  commands: string[]
  agents: string[]
}

export interface AgentSetup {
  /** Korzeń projektu apki. Bez niego nie ma skąd zainstalować pluginu ani CLI. */
  project: string | null
  marketplace: string | null
  server: string | null
  /** Serwer MCP powstaje przy budowaniu i nie trafia do repozytorium. */
  serverBuilt: boolean
  plugin: PluginState
  version: string | null
  /** Polecenie `bibliotter` jest dostępne na ścieżce systemowej. */
  cli: boolean
  contents: PluginContents
}

export interface AppInfo {
  version: string
  electron: string
  dataDir: string
  openAtLogin: boolean
  allowedHosts: string[]
}

export const installCommands = (marketplace: string): string[] => [
  `claude plugin marketplace add "${marketplace}"`,
  `claude plugin install ${PLUGIN_ID}`
]

export const ENABLE_COMMAND = `claude plugin enable ${PLUGIN_ID}`
export const buildCommand = (project: string): string => `npm --prefix "${project}" run build:plugin`
export const cliCommand = (project: string): string => `npm install -g "${project}"`

/** Format `mcpServers` czytają też agenci spoza Claude Code. */
export const mcpConfig = (server: string): string =>
  JSON.stringify({ mcpServers: { [PLUGIN_NAME]: { command: 'node', args: [server] } } }, null, 2)

const HOST_SHAPE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

/** Polityka dokumentów porównuje samą nazwę hosta, więc z wklejonego adresu zostaje tylko ona. */
export function parseHost(input: string): string | null {
  const text = input.trim().toLowerCase()
  if (!text || /\s/.test(text)) return null
  try {
    const { hostname } = new URL(text.includes('://') ? text : `https://${text}`)
    return HOST_SHAPE.test(hostname) ? hostname : null
  } catch {
    return null
  }
}

export function cleanHosts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const hosts = value.flatMap((item) => {
    const host = typeof item === 'string' ? parseHost(item) : null
    return host ? [host] : []
  })
  return [...new Set(hosts)]
}
