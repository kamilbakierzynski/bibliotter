import { existsSync, renameSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../shared/i18n'
import { type LabelColors, parseLabelColors, ticketTemplate } from '../shared/labels'
import type { FolderLink } from '../shared/types'

export const DEFAULT_ALLOWED_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com'
]

/** Rodzaje, które Haiku może nadać, zanim użytkownik utworzy własne etykiety. */
export const DEFAULT_LABEL_STARTERS = ['PR review', 'Explainer', 'Plan', 'Idea']

export interface AppConfig {
  roots: string[]
  allowedHosts: string[]
  folderLinks: FolderLink[]
  /** Foldery pomijane przy skanowaniu. Pliki zostają na dysku. */
  hiddenFolders: string[]
  /** Nazwy folderów i projektów nadane w apce, według ścieżki. */
  folderNames: Record<string, string>
  /** Treść dokumentu idzie wtedy do modelu, więc użytkownik sam to włącza. */
  autoLabelNew: boolean
  autoLabelTickets: boolean
  /** Znikają ze spisu razem z usuniętą etykietą, żeby Haiku jej nie przywracał. */
  labelStarters: string[]
  labelColors: LabelColors
  /** Szablon adresu zgłoszenia. Bez niego kody są zwykłymi etykietami. */
  ticketUrl: string
  language: Language
}

/** Przed zmianą nazwy na Bibliotter dane leżały tutaj, a zmienna nazywała się HTMLDOCS_HOME. */
const legacyDataDir = (): string => join(homedir(), 'HtmlDocs')
const homeDataDir = (): string => join(homedir(), 'Bibliotter')
const chosenDataDir = (): string | undefined => process.env.BIBLIOTTER_HOME ?? process.env.HTMLDOCS_HOME

/** CLI i MCP czytają stary folder, dopóki apka go nie przeniesie, więc widzą te same dane co ona. */
export function dataDir(): string {
  const chosen = chosenDataDir()
  if (chosen) return chosen
  return existsSync(homeDataDir()) || !existsSync(legacyDataDir()) ? homeDataDir() : legacyDataDir()
}

/** Apka przenosi stary folder przy starcie. Gdy coś go trzyma, zostaje na miejscu do następnego startu. */
export function moveLegacyDataDir(): void {
  if (chosenDataDir() || existsSync(homeDataDir()) || !existsSync(legacyDataDir())) return
  try {
    renameSync(legacyDataDir(), homeDataDir())
  } catch {
    // dataDir() dalej wskazuje stary folder, więc nic nie ginie.
  }
}

function configPath(directory = dataDir()): string {
  return join(directory, 'config.json')
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

function nameMap(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

export function parseConfig(raw: string): AppConfig {
  const parsed: unknown = JSON.parse(raw)
  const source = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
  return {
    roots: stringArray(source.roots) ?? [],
    allowedHosts: stringArray(source.allowedHosts) ?? DEFAULT_ALLOWED_HOSTS,
    folderLinks: folderLinks(source.folderLinks),
    hiddenFolders: stringArray(source.hiddenFolders) ?? [],
    folderNames: nameMap(source.folderNames),
    autoLabelNew: source.autoLabelNew === true,
    autoLabelTickets: source.autoLabelTickets !== false,
    labelStarters: stringArray(source.labelStarters) ?? DEFAULT_LABEL_STARTERS,
    labelColors: parseLabelColors(source.labelColors),
    ticketUrl: ticketTemplate(source.ticketUrl) ?? '',
    language: isLanguage(source.language) ? source.language : DEFAULT_LANGUAGE
  }
}

export async function loadConfig(directory?: string): Promise<AppConfig> {
  try {
    return parseConfig(await readFile(configPath(directory), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return parseConfig('{}')
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
