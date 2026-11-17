import { type Dirent, existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import {
  type AgentSetup,
  PLUGIN_ID,
  PLUGIN_NAME,
  type PluginContents,
  type PluginInstallResult,
  type PluginSkill,
  type PluginState
} from '../shared/options'
import type { GitRunner } from './git'
import { toolNames } from './mcpServer'

const MARKETPLACE_FOLDER = 'plugin'

/** Zbudowana apka leży głębiej niż projekt, a o ile głębiej, zależy od sposobu uruchomienia. */
export function findProject(from: string): string | null {
  for (let folder = from; ; folder = dirname(folder)) {
    if (existsSync(join(folder, MARKETPLACE_FOLDER, '.claude-plugin', 'marketplace.json'))) return folder
    if (dirname(folder) === folder) return null
  }
}

/** Plugin nie musi mieć każdego rodzaju rozszerzeń, więc brak folderu to pusta lista. */
const entries = (folder: string): Promise<Dirent[]> => readdir(folder, { withFileTypes: true }).catch(() => [])

async function markdownNames(folder: string): Promise<string[]> {
  const files = await entries(folder)
  return files.filter((file) => file.isFile() && file.name.endsWith('.md')).map((file) => parse(file.name).name)
}

function skillSummary(text: string): string {
  const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
  const about = /^description:\s*(.+)$/m.exec(header)?.[1] ?? ''
  return about.trim().replace(/^(["'])(.*)\1$/, '$2')
}

async function readSkills(folder: string): Promise<PluginSkill[]> {
  const skills = await Promise.all(
    (await entries(folder))
      .filter((entry) => entry.isDirectory())
      .map(async ({ name }): Promise<PluginSkill[]> => {
        const text = await readFile(join(folder, name, 'SKILL.md'), 'utf8').catch(() => null)
        return text === null ? [] : [{ name, about: skillSummary(text) }]
      })
  )
  return skills.flat()
}

async function readHooks(file: string): Promise<string[]> {
  try {
    const { hooks } = JSON.parse(await readFile(file, 'utf8')) as { hooks?: Record<string, unknown> }
    return Object.keys(hooks ?? {})
  } catch {
    return []
  }
}

export async function readPluginContents(plugin: string): Promise<PluginContents> {
  const [skills, hooks, commands, agents] = await Promise.all([
    readSkills(join(plugin, 'skills')),
    readHooks(join(plugin, 'hooks', 'hooks.json')),
    markdownNames(join(plugin, 'commands')),
    markdownNames(join(plugin, 'agents'))
  ])
  return { tools: toolNames(), skills, hooks, commands, agents }
}

/** Claude Code zna też pluginy z innych zakresów, więc szukamy po pełnym identyfikatorze. */
export function pluginStatus(output: string): { plugin: PluginState; version: string | null } {
  const list: unknown = JSON.parse(output)
  const found = Array.isArray(list)
    ? (list as { id?: unknown; enabled?: unknown; version?: unknown }[]).find((item) => item?.id === PLUGIN_ID)
    : undefined
  if (!found) return { plugin: 'absent', version: null }
  return {
    plugin: found.enabled === false ? 'disabled' : 'enabled',
    version: typeof found.version === 'string' ? found.version : null
  }
}

export interface SetupTools {
  claude: GitRunner
  /** `where` albo `which`. Plik `.cmd` z npm nie uruchomi się przez `execFile`. */
  locate: GitRunner
}

export async function readAgentSetup(from: string, { claude, locate }: SetupTools, packaged = false): Promise<AgentSetup> {
  const home = homedir()
  const project = findProject(from)
  const marketplace = project && join(project, MARKETPLACE_FOLDER)
  const plugin = marketplace && join(marketplace, PLUGIN_NAME)
  const server = plugin && join(plugin, 'server', 'mcp.cjs')
  const [contents, status, cli] = await Promise.all([
    plugin ? readPluginContents(plugin) : { tools: [], skills: [], hooks: [], commands: [], agents: [] },
    claude(['plugin', 'list', '--json'], home).then(pluginStatus, () => ({ plugin: 'unknown' as const, version: null })),
    locate(['bibliotter'], home).then(
      () => true,
      () => false
    )
  ])
  return { project, marketplace, server, serverBuilt: server !== null && existsSync(server), ...status, cli, contents, packaged }
}

/** Z błędu `execFile` zostaje ostatni niepusty wiersz, bo tam Claude Code pisze powód. */
function lastLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? text
  )
}

/**
 * Robi to samo co kroki z panelu: dodaje folder pluginu jako marketplace i instaluje z niego plugin,
 * a wyłączony tylko włącza. Oba polecenia Claude Code są powtarzalne. Dodanie marketplace o tej samej
 * nazwie z innego folderu przepina jednak źródło, więc działający plugin zostaje nietknięty.
 */
export async function installPlugin(from: string, claude: GitRunner): Promise<PluginInstallResult> {
  const project = findProject(from)
  if (!project) return { ok: false, error: 'no-folder' }
  const marketplace = join(project, MARKETPLACE_FOLDER)
  if (!existsSync(join(marketplace, PLUGIN_NAME, 'server', 'mcp.cjs'))) return { ok: false, error: 'no-server' }
  const home = homedir()
  try {
    const { plugin } = pluginStatus(await claude(['plugin', 'list', '--json'], home))
    if (plugin === 'disabled') await claude(['plugin', 'enable', PLUGIN_ID], home)
    if (plugin === 'absent') {
      await claude(['plugin', 'marketplace', 'add', marketplace], home)
      await claude(['plugin', 'install', PLUGIN_ID], home)
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: lastLine(error) }
  }
}
