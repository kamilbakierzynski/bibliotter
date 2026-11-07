import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findProject, pluginStatus, readAgentSetup, readPluginContents } from '../src/main/agentSetup'
import {
  buildCommand,
  cleanHosts,
  cliCommand,
  installCommands,
  MARKETPLACE_NAME,
  mcpConfig,
  parseHost,
  PLUGIN_ID,
  PLUGIN_NAME
} from '../src/shared/options'

const repository = resolve(__dirname, '..')

describe('dozwolone adresy', () => {
  it('z wklejonego linku zostaje sama nazwa hosta', () => {
    expect(parseHost('https://Fonts.GoogleApis.com/css2?family=Geist')).toBe('fonts.googleapis.com')
    expect(parseHost('  cdn.example.com/lib.js ')).toBe('cdn.example.com')
    expect(parseHost('cdn.example.com')).toBe('cdn.example.com')
  })

  it('odrzuca to, czego polityka dokumentów i tak nie dopasuje', () => {
    for (const input of ['', 'localhost', '*.example.com', 'dwa słowa.pl', 'https://', 'example.com.']) {
      expect(parseHost(input), input).toBeNull()
    }
  })

  it('czyści listę z dokumentu konfiguracji i usuwa powtórki', () => {
    expect(cleanHosts(['a.pl', 'https://a.pl/x', 7, 'zły adres', 'b.pl'])).toEqual(['a.pl', 'b.pl'])
    expect(cleanHosts('a.pl')).toEqual([])
  })
})

describe('polecenia instalacji', () => {
  const folder = 'C:\\Users\\kamil\\moje projekty\\html-docs-app'

  it('ścieżka ze spacją zostaje jednym argumentem', () => {
    expect(installCommands(`${folder}\\plugin`)[0]).toBe(`claude plugin marketplace add "${folder}\\plugin"`)
    expect(buildCommand(folder)).toContain(`"${folder}"`)
    expect(cliCommand(folder)).toBe(`npm install -g "${folder}"`)
  })

  it('konfiguracja MCP to poprawny JSON z pełną ścieżką do serwera', () => {
    const server = `${folder}\\plugin\\bibliotter\\server\\mcp.cjs`
    const parsed = JSON.parse(mcpConfig(server)) as { mcpServers: Record<string, { args: string[] }> }
    expect(parsed.mcpServers[PLUGIN_NAME]?.args).toEqual([server])
  })

  it('stałe zgadzają się z manifestem pluginu w repozytorium', async () => {
    const file = join(repository, 'plugin', '.claude-plugin', 'marketplace.json')
    const manifest = JSON.parse(await readFile(file, 'utf8')) as { name: string; plugins: { name: string }[] }
    expect(manifest.name).toBe(MARKETPLACE_NAME)
    expect(manifest.plugins.map((plugin) => plugin.name)).toContain(PLUGIN_NAME)
  })
})

describe('status pluginu', () => {
  it('rozpoznaje plugin po pełnym identyfikatorze', () => {
    const list = [{ id: 'inny@zrodlo', enabled: true }, { id: PLUGIN_ID, enabled: true, version: '0.2.0' }]
    expect(pluginStatus(JSON.stringify(list))).toEqual({ plugin: 'enabled', version: '0.2.0' })
  })

  it('odróżnia plugin wyłączony od nieobecnego', () => {
    expect(pluginStatus(JSON.stringify([{ id: PLUGIN_ID, enabled: false }])).plugin).toBe('disabled')
    expect(pluginStatus('[]').plugin).toBe('absent')
  })
})

describe('zawartość pluginu', () => {
  let folder: string

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'bibliotter-opcje-'))
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it('pusty plugin ma same narzędzia MCP', async () => {
    const contents = await readPluginContents(folder)
    expect(contents.tools).toContain('current_document')
    expect(contents).toMatchObject({ skills: [], hooks: [], commands: [], agents: [] })
  })

  it('nowy skill, hook i polecenie pojawiają się same', async () => {
    await mkdir(join(folder, 'skills', 'czytanie'), { recursive: true })
    await writeFile(
      join(folder, 'skills', 'czytanie', 'SKILL.md'),
      '---\nname: czytanie\ndescription: "Czyta dokumenty"\n---\n\nTreść.\n'
    )
    await mkdir(join(folder, 'skills', 'bez-pliku'))
    await mkdir(join(folder, 'hooks'))
    await writeFile(join(folder, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { SessionStart: [], Stop: [] } }))
    await mkdir(join(folder, 'commands'))
    await writeFile(join(folder, 'commands', 'uwagi.md'), 'Treść.')

    const contents = await readPluginContents(folder)
    expect(contents.skills).toEqual([{ name: 'czytanie', about: 'Czyta dokumenty' }])
    expect(contents.hooks).toEqual(['SessionStart', 'Stop'])
    expect(contents.commands).toEqual(['uwagi'])
  })

  it('uszkodzony hooks.json nie wywraca panelu', async () => {
    await mkdir(join(folder, 'hooks'))
    await writeFile(join(folder, 'hooks', 'hooks.json'), '{')
    expect((await readPluginContents(folder)).hooks).toEqual([])
  })
})

describe('odczyt stanu agenta', () => {
  const failing = (): Promise<string> => Promise.reject(new Error('ENOENT'))

  it('znajduje projekt z głębi zbudowanej apki', () => {
    expect(findProject(join(repository, 'out', 'main'))).toBe(repository)
    expect(findProject(tmpdir())).toBeNull()
  })

  it('brak Claude Code i CLI to stan, a nie błąd', async () => {
    const setup = await readAgentSetup(repository, { claude: failing, locate: failing })
    expect(setup).toMatchObject({ project: repository, plugin: 'unknown', version: null, cli: false })
    expect(setup.marketplace).toBe(join(repository, 'plugin'))
    expect(setup.server).toBe(join(repository, 'plugin', PLUGIN_NAME, 'server', 'mcp.cjs'))
  })

  it('apka bez folderu pluginu nie ma czego proponować', async () => {
    const setup = await readAgentSetup(tmpdir(), { claude: failing, locate: failing })
    expect(setup).toMatchObject({ project: null, marketplace: null, server: null, serverBuilt: false })
    expect(setup.contents.tools).toEqual([])
  })
})
