import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentApi } from '../src/main/agentApi'
import { runCli, USAGE } from '../src/main/agentCli'
import { handleLine, PROTOCOL_VERSIONS, serveMcp } from '../src/main/mcpServer'
import { watchSignal } from '../src/main/signals'

let dataDir: string
let api: AgentApi

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'bibliotter-agent-'))
  api = new AgentApi(dataDir)
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

const addNote = (audience: 'agent' | 'me', text: string) =>
  api.annotations.create('d1', 'sha', { kind: 'comment', audience, color: null, anchor: null, text })

const addDoc = async (id: string, title: string): Promise<void> => {
  const path = join(dataDir, `${id}.md`)
  await writeFile(path, `# ${title}\n`)
  await mkdir(join(dataDir, 'library', id), { recursive: true })
  await writeFile(
    join(dataDir, 'library', id, 'meta.json'),
    JSON.stringify({ id, path, title, firstSeenAt: '2026-11-06T10:00:00.000Z', status: 'to-read', sha: 'abc', mtimeMs: 1, projectPath: null, branch: null, commit: null, versions: [] })
  )
}

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
    await expect(runCli(['usuń'], api)).rejects.toThrow('Unknown command')
    await expect(runCli(['reply', 'a1'], api)).rejects.toThrow('Missing argument')
    await expect(runCli(['label', 'd1'], api)).rejects.toThrow('Missing argument')
  })

  it('dodaje, filtruje i zdejmuje etykiety', async () => {
    await addDoc('d1', 'Plan migracji')
    await addDoc('d2', 'Pomysł')

    expect(await runCli(['label', 'd1', 'Plan', 'PAY-1'], api)).toBe('Plan, PAY-1')
    expect(await runCli(['list', '--label', 'plan'], api)).toContain('Plan migracji')
    expect(await runCli(['list', '--label', 'plan'], api)).not.toContain('Pomysł')
    expect(await runCli(['list'], api)).toContain('labels: Plan, PAY-1')
    expect(await runCli(['labels'], api)).toBe('PAY-1  (1)\nPlan  (1)')
    expect(await runCli(['unlabel', 'd1', 'Plan', 'PAY-1'], api)).toBe('The document has no labels.')
    expect(await runCli(['labels'], api)).toBe('No labels.')
  })

  it('etykieta od agenta budzi otwartą apkę', async () => {
    await addDoc('d1', 'Plan')
    const onChange = vi.fn()
    const stop = watchSignal(join(dataDir, 'library'), 'labels', onChange)

    await runCli(['label', 'd1', 'Plan'], api)

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 3000 })
    stop()
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
    expect(await runCli(['comments'], api)).toBe('No comments.')
  })

  it('czyta Markdown jako źródło i szuka w jego treści', async () => {
    const path = join(dataDir, 'plan.md')
    const meta = {
      id: 'dmarkdown',
      path,
      title: 'Plan',
      firstSeenAt: '2026-11-06T10:00:00.000Z',
      status: 'to-read',
      sha: 'abc',
      mtimeMs: 1,
      projectPath: null,
      branch: null,
      commit: null,
      versions: []
    }
    await writeFile(path, '# Plan\n\n**Jednorożec** w treści\n')
    await mkdir(join(dataDir, 'library', meta.id), { recursive: true })
    await writeFile(join(dataDir, 'library', meta.id, 'meta.json'), JSON.stringify(meta))

    expect(await runCli(['read', meta.id], api)).toContain('**Jednorożec**')
    expect((await api.search('jednorożec'))[0]?.snippet).toBe('Plan Jednorożec w treści')
  })

  it('czyta dokument po odnośniku ze skróconym id', async () => {
    const addDocument = async (id: string): Promise<void> => {
      const path = join(dataDir, `${id}.md`)
      const meta = { id, path, title: id, firstSeenAt: '', status: 'to-read', sha: 'abc', mtimeMs: 1 }
      await writeFile(path, `# ${id}\n`)
      await mkdir(join(dataDir, 'library', id), { recursive: true })
      await writeFile(
        join(dataDir, 'library', id, 'meta.json'),
        JSON.stringify({ ...meta, projectPath: null, branch: null, commit: null, versions: [] })
      )
    }
    await addDocument('d1234567aaaa')
    await addDocument('d1234567bbbb')

    expect((await api.readDocument('bibliotter:d1234567aa')).title).toBe('d1234567aaaa')
    expect((await api.readDocument('d1234567bb')).title).toBe('d1234567bbbb')
    // Odnośniki sprzed zmiany nazwy na Bibliotter.
    expect((await api.readDocument('htmldocs:d1234567bb')).title).toBe('d1234567bbbb')
    await expect(api.readDocument('bibliotter:d1234567')).rejects.toThrow('several documents')
    await expect(api.readDocument('bibliotter:d123')).rejects.toThrow('No document')
  })

  it('zgłasza, że nic nie jest otwarte', async () => {
    expect(await runCli(['current'], api)).toBe('No document is open in the app.')
    expect(JSON.parse(await runCli(['current', '--json'], api))).toBeNull()
    await expect(runCli(['read', 'current'], api)).rejects.toThrow('No document is open')
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

    expect(result.tools).toHaveLength(9)
    expect(result.tools.every((tool: any) => tool.inputSchema.type === 'object')).toBe(true)
    expect(writing).toEqual(['label_document', 'reply_comment', 'resolve_comment'])
  })

  it('agent nadaje etykiety i widzi je na liście', async () => {
    await addDoc('d1', 'Plan')

    const added = await callTool('label_document', { document: 'd1', add: ['Plan', 'PAY-1'] })
    await callTool('label_document', { document: 'd1', add: ['plan'], remove: ['PAY-1'] })
    const listed = await callTool('list_documents', { label: 'PLAN' })
    const labels = await callTool('list_labels')

    expect(JSON.parse(added.content[0].text)).toEqual({ labels: ['Plan', 'PAY-1'] })
    expect(JSON.parse(listed.content[0].text)[0].labels).toEqual(['Plan'])
    expect(JSON.parse(labels.content[0].text)).toEqual([{ name: 'Plan', count: 1 }])
  })

  it('label_document odrzuca etykiety, które nie są listą tekstów', async () => {
    const { error } = await rpc('tools/call', { name: 'label_document', arguments: { document: 'd1', add: 'Plan' } })

    expect(error.message).toContain('add')
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
