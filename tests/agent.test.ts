import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentApi } from '../src/main/agentApi'
import { runCli, USAGE } from '../src/main/agentCli'
import { handleLine, PROTOCOL_VERSIONS, serveMcp } from '../src/main/mcpServer'

let dataDir: string
let api: AgentApi

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'htmldocs-agent-'))
  api = new AgentApi(dataDir)
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

const addNote = (audience: 'agent' | 'me', text: string) =>
  api.annotations.create('d1', 'sha', { kind: 'comment', audience, color: null, anchor: null, text })

const rpc = async (method: string, params?: unknown, id: number | undefined = 1): Promise<any> =>
  handleLine(api, JSON.stringify({ jsonrpc: '2.0', id, method, params }))

const callTool = async (name: string, args: unknown = {}): Promise<any> => {
  const { result } = await rpc('tools/call', { name, arguments: args })
  return result
}

describe('runCli', () => {
  it('bez komendy pokazuje pomoc', async () => {
    expect(await runCli([], api)).toBe(USAGE)
  })

  it('odrzuca nieznaną komendę i brak argumentu', async () => {
    await expect(runCli(['usuń'], api)).rejects.toThrow('Nieznana komenda')
    await expect(runCli(['reply', 'a1'], api)).rejects.toThrow('Brakuje argumentu')
  })

  it('pomija uwagi prywatne, chyba że użyto --personal', async () => {
    await addNote('agent', 'Popraw tabelę')
    await addNote('me', 'Na spotkanie')

    const visible = await runCli(['comments'], api)
    const all = await runCli(['comments', '--personal'], api)

    expect(visible).toContain('Popraw tabelę')
    expect(visible).not.toContain('Na spotkanie')
    expect(all).toContain('Na spotkanie')
  })

  it('odpowiedź i zamknięcie zmieniają wątek', async () => {
    const note = await addNote('agent', 'Popraw tabelę')

    await runCli(['reply', note.id, 'Które kolumny?'], api)
    await runCli(['resolve', note.id, 'Gotowe'], api)

    const saved = await api.annotations.get(note.id)
    expect(saved?.status).toBe('resolved')
    expect(saved?.messages.map((item) => [item.author, item.text])).toEqual([
      ['user', 'Popraw tabelę'],
      ['agent', 'Które kolumny?'],
      ['agent', 'Gotowe']
    ])
    expect(await runCli(['comments'], api)).toBe('Brak uwag.')
  })

  it('zgłasza, że nic nie jest otwarte', async () => {
    expect(await runCli(['current'], api)).toBe('W apce nie jest otwarty żaden dokument.')
    expect(JSON.parse(await runCli(['current', '--json'], api))).toBeNull()
    await expect(runCli(['read', 'current'], api)).rejects.toThrow('nie jest otwarty')
  })
})

describe('serwer MCP', () => {
  it('uzgadnia wersję protokołu', async () => {
    const known = await rpc('initialize', { protocolVersion: '2024-11-05' })
    const unknown = await rpc('initialize', { protocolVersion: '1999-01-01' })

    expect(known.result.protocolVersion).toBe('2024-11-05')
    expect(unknown.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0])
    expect(known.result.capabilities).toEqual({ tools: {} })
  })

  it('nie odpowiada na powiadomienia', async () => {
    expect(await handleLine(api, '{"jsonrpc":"2.0","method":"notifications/initialized"}')).toBeNull()
  })

  it('zgłasza błędy protokołu', async () => {
    const parse: any = await handleLine(api, '{nie json')
    const method = await rpc('nieznana')
    const tool = await rpc('tools/call', { name: 'nieznane' })
    const param = await rpc('tools/call', { name: 'reply_comment', arguments: { id: 'a1' } })

    expect(parse.error.code).toBe(-32700)
    expect(parse.id).toBeNull()
    expect(method.error.code).toBe(-32601)
    expect(tool.error.code).toBe(-32602)
    expect(param.error.code).toBe(-32602)
  })

  it('obsługuje paczkę żądań', async () => {
    const line = JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'ping' }
    ])

    expect(await handleLine(api, line)).toEqual([
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 2, result: {} }
    ])
  })

  it('każde narzędzie ma schemat i oznaczenie zapisu', async () => {
    const { result } = await rpc('tools/list')
    const writing = result.tools.filter((tool: any) => !tool.annotations.readOnlyHint).map((tool: any) => tool.name)

    expect(result.tools).toHaveLength(7)
    expect(result.tools.every((tool: any) => tool.inputSchema.type === 'object')).toBe(true)
    expect(writing).toEqual(['reply_comment', 'resolve_comment'])
  })

  it('błąd wykonania wraca jako wynik narzędzia', async () => {
    const result = await callTool('reply_comment', { id: 'abrak', text: 'x' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBeTruthy()
  })

  it('prywatne uwagi wymagają wyraźnej prośby', async () => {
    await addNote('me', 'Na spotkanie')

    const hidden = await callTool('list_comments')
    const shown = await callTool('list_comments', { include_personal: true })

    expect(JSON.parse(hidden.content[0].text)).toEqual([])
    expect(JSON.parse(shown.content[0].text)).toHaveLength(1)
  })

  it('stdout zawiera tylko odpowiedzi rozdzielone nowymi liniami', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const chunks: string[] = []
    output.on('data', (chunk) => chunks.push(String(chunk)))

    const served = serveMcp(api, input, output)
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\r\n')
    input.write('\n')
    input.end('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    await served

    expect(chunks.join('')).toBe('{"jsonrpc":"2.0","id":1,"result":{}}\n')
  })
})
