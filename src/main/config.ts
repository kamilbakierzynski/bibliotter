import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { FolderLink } from '../shared/types'

export const DEFAULT_ALLOWED_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com'
]

export interface AppConfig {
  roots: string[]
  allowedHosts: string[]
  folderLinks: FolderLink[]
}

export function dataDir(): string {
  return process.env.HTMLDOCS_HOME ?? join(homedir(), 'HtmlDocs')
}

function configPath(): string {
  return join(dataDir(), 'config.json')
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null
}

function folderLinks(value: unknown): FolderLink[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is FolderLink =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as FolderLink).folder === 'string' &&
      typeof (item as FolderLink).repo === 'string'
  )
}

export function parseConfig(raw: string): AppConfig {
  const parsed: unknown = JSON.parse(raw)
  const source = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
  return {
    roots: stringArray(source.roots) ?? [],
    allowedHosts: stringArray(source.allowedHosts) ?? DEFAULT_ALLOWED_HOSTS,
    folderLinks: folderLinks(source.folderLinks)
  }
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    return parseConfig(await readFile(configPath(), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { roots: [], allowedHosts: DEFAULT_ALLOWED_HOSTS, folderLinks: [] }
    }
    throw error
  }
}

/** Zapis przez plik tymczasowy, żeby przerwany zapis nie uszkodził konfiguracji. */
export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(dataDir(), { recursive: true })
  const target = configPath()
  const temp = `${target}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}
