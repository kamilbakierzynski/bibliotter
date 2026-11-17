import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installPlugin } from '../src/main/agentSetup'
import { PLUGIN_ID } from '../src/shared/options'

/** Udaje Claude Code: zapisuje polecenia i zwraca podany stan pluginu. */
function fakeClaude(list: unknown[], fail?: string): { calls: string[][]; run: (args: string[]) => Promise<string> } {
  const calls: string[][] = []
  return {
    calls,
    run: (args) => {
      calls.push(args)
      if (fail && args.includes(fail)) return Promise.reject(new Error(`Command failed: claude ${args.join(' ')}\nError: ${fail} went wrong\n`))
      return Promise.resolve(args[1] === 'list' ? JSON.stringify(list) : '')
    }
  }
}

describe('instalacja pluginu z apki', () => {
  let project: string
  let from: string

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bib-install-'))
    await mkdir(join(project, 'plugin', '.claude-plugin'), { recursive: true })
    await writeFile(join(project, 'plugin', '.claude-plugin', 'marketplace.json'), '{}')
    await mkdir(join(project, 'plugin', 'bibliotter', 'server'), { recursive: true })
    await writeFile(join(project, 'plugin', 'bibliotter', 'server', 'mcp.cjs'), '')
    from = join(project, 'resources', 'app.asar', 'out', 'main')
  })

  afterEach(() => rm(project, { recursive: true, force: true }))

  it('brakujący plugin dodaje marketplace z folderu apki i instaluje', async () => {
    const claude = fakeClaude([])
    expect(await installPlugin(from, claude.run)).toEqual({ ok: true })
    expect(claude.calls).toEqual([
      ['plugin', 'list', '--json'],
      ['plugin', 'marketplace', 'add', join(project, 'plugin')],
      ['plugin', 'install', PLUGIN_ID]
    ])
  })

  it('wyłączony plugin tylko włącza, bez przepinania marketplace', async () => {
    const claude = fakeClaude([{ id: PLUGIN_ID, enabled: false }])
    expect(await installPlugin(from, claude.run)).toEqual({ ok: true })
    expect(claude.calls.slice(1)).toEqual([['plugin', 'enable', PLUGIN_ID]])
  })

  it('działający plugin zostaje nietknięty', async () => {
    const claude = fakeClaude([{ id: PLUGIN_ID, enabled: true }])
    expect(await installPlugin(from, claude.run)).toEqual({ ok: true })
    expect(claude.calls).toHaveLength(1)
  })

  it('bez zbudowanego serwera MCP nic nie uruchamia', async () => {
    await rm(join(project, 'plugin', 'bibliotter', 'server', 'mcp.cjs'))
    const claude = fakeClaude([])
    expect(await installPlugin(from, claude.run)).toEqual({ ok: false, error: 'no-server' })
    expect(claude.calls).toEqual([])
  })

  it('błąd Claude Code wraca jako jego ostatni wiersz', async () => {
    const claude = fakeClaude([], 'install')
    expect(await installPlugin(from, claude.run)).toEqual({ ok: false, error: 'Error: install went wrong' })
  })
})
