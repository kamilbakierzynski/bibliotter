import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { AgentApi } from '../src/main/agentApi'
import { runCli, USAGE } from '../src/main/agentCli'
import { quoteFinder } from '../src/main/agentPresentation'
import { PresentationStore } from '../src/main/presentationStore'
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

    expect(result.tools).toHaveLength(11)
    expect(result.tools.every((tool: any) => tool.inputSchema.type === 'object')).toBe(true)
    expect(writing).toEqual(['label_document', 'reply_comment', 'resolve_comment', 'set_presentation'])
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

const plan = `<!doctype html><title>Plan</title><body>
<h1>Plan migracji</h1><p>Wstęp opisuje cel i zakres zmiany.</p>
<h2>Ryzyka</h2><p>Największe ryzyko to <strong>utrata danych</strong> przy przenosinach.</p>
<img id="wykres" src="wykres.png">
<h2>Kroki</h2><p>Najpierw kopia zapasowa, potem migracja.</p>
</body>`

const addHtmlDoc = async (id: string): Promise<void> => {
  const path = join(dataDir, `${id}.html`)
  await writeFile(path, plan)
  await mkdir(join(dataDir, 'library', id), { recursive: true })
  await writeFile(
    join(dataDir, 'library', id, 'meta.json'),
    JSON.stringify({ id, path, title: 'Plan', firstSeenAt: '2026-11-07T10:00:00.000Z', status: 'to-read', sha: 'abc', mtimeMs: 1, projectPath: null, branch: null, commit: null, versions: [] })
  )
}

const toolJson = async (name: string, args: unknown): Promise<any> => {
  const result = await callTool(name, args)
  if (result.isError) throw new Error(result.content[0].text)
  return JSON.parse(result.content[0].text)
}

const stored = (): Promise<any> => new PresentationStore(join(dataDir, 'library')).read('d1')

describe('trasa prezentacji dla agenta', () => {
  it('cytat szuka się bez znaczników i odstępów, a nagłówek to najbliższy wcześniejszy', () => {
    const find = quoteFinder(plan)

    expect(find('ryzyko to utrata danych')).toEqual({ heading: 'Ryzyka', repeated: false })
    expect(find('Wstęp opisuje cel')).toEqual({ heading: 'Plan migracji', repeated: false })
    expect(find('Ryzyka')).toEqual({ heading: 'Ryzyka', repeated: false })
    expect(find('migracj')).toEqual({ heading: 'Plan migracji', repeated: true })
    expect(find('Tego zdania nie ma')).toBeUndefined()
  })

  it('agent układa trasę z cytatów i selektorów, a kształty powstają w dokumencie', async () => {
    await addHtmlDoc('d1')

    const saved = await toolJson('set_presentation', {
      document: 'd1',
      steps: [
        { title: 'Wstęp' },
        {
          title: 'Ryzyko',
          camera: { kind: 'place', quote: 'Największe ryzyko to utrata danych' },
          rest: 'dim',
          shapes: [{ type: 'ellipse', at: { quote: 'utrata danych' } }]
        },
        {
          title: 'Wykres',
          camera: { kind: 'area', selector: '#wykres', box: { x: 0, y: 0, width: 0.5, height: 1 } },
          rest: 'hide',
          shapes: [{ type: 'arrow', color: 'blue', from: { quote: 'Najpierw kopia', x: 0 }, to: { selector: '#wykres', x: 0.5, y: 0 } }]
        }
      ]
    })

    expect(saved.steps.map((step: any) => step.title)).toEqual(['Wstęp', 'Ryzyko', 'Wykres'])
    expect(saved.steps[0].camera).toEqual({ kind: 'hold' })
    expect(saved.steps[1].camera).toEqual({ kind: 'place', quote: 'Największe ryzyko to utrata danych', selector: '', heading: 'Ryzyka' })
    expect(saved.steps[2].camera).toMatchObject({ kind: 'area', selector: '#wykres', box: { width: 0.5 } })
    expect(saved.created).toHaveLength(2)
    expect(saved.steps[1].show).toEqual([saved.created[0]])
    expect(saved.steps[2].show).toEqual([saved.created[1]])

    const shapes = (await api.annotations.listAll()).filter((note) => note.kind === 'shape')
    expect(shapes.map((shape) => [shape.audience, shape.color, shape.shape?.type])).toEqual([
      ['me', 'pink', 'ellipse'],
      ['me', 'blue', 'arrow']
    ])
    expect(shapes[0]?.shape).toEqual({ type: 'ellipse', box: { x: -0.15, y: -0.35, width: 1.3, height: 1.7 } })
    expect(shapes[1]?.anchor).toMatchObject({ selector: '', quote: 'Najpierw kopia', offsetX: 0, offsetY: 0.5, heading: 'Kroki' })

    expect((await stored()).steps).toHaveLength(3)
    const read = await toolJson('get_presentation', { document: 'd1' })
    expect(read.steps).toEqual(saved.steps)
    expect(read.items.map((item: any) => item.shape)).toEqual(['ellipse', 'arrow'])
  })

  it('cytat, który stoi w dokumencie kilka razy, przechodzi z ostrzeżeniem, a z selektorem bez niego', async () => {
    await addHtmlDoc('d1')

    const saved = await toolJson('set_presentation', {
      document: 'd1',
      steps: [
        { title: 'Migracja', camera: { kind: 'place', quote: 'migracj' } },
        { title: 'Kroki', camera: { kind: 'place', quote: 'migracj', selector: 'body > p:nth-of-type(3)' } }
      ]
    })

    expect(saved.steps).toHaveLength(2)
    expect(saved.warnings).toEqual([
      'steps[0].camera: the quote appears more than once in the document, so the app uses the first place. A longer quote picks one place.'
    ])
  })

  it('zły cytat odrzuca cały zapis i niczego nie tworzy', async () => {
    await addHtmlDoc('d1')

    const result = await callTool('set_presentation', {
      document: 'd1',
      steps: [
        { title: 'Dobry', shapes: [{ type: 'rect', at: { quote: 'Wstęp opisuje' } }] },
        { title: 'Zły', camera: { kind: 'place', quote: 'Tego zdania nie ma w dokumencie' } }
      ]
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('steps[1].camera')
    expect(await api.annotations.listAll()).toEqual([])
    expect((await stored()).steps).toEqual([])
  })

  it('kroki oddane bez zmian zachowują kadr z widoku strony, a nieznane uwagi wypadają z ostrzeżeniem', async () => {
    await addHtmlDoc('d1')
    // Kotwica z kliknięcia niesie tekst z widoku strony, np. po zmianie wielkości liter w CSS.
    const anchor = { selector: 'body > p:nth-of-type(2)', offsetX: 0.3, offsetY: 0.6, quote: 'NAJWIĘKSZE RYZYKO', heading: 'Ryzyka' }
    await new PresentationStore(join(dataDir, 'library')).write('d1', {
      steps: [{ id: 's1', title: 'Od użytkownika', camera: { kind: 'place', anchor }, rest: 'dim', show: [] }]
    })

    const before = await toolJson('get_presentation', { document: 'd1' })
    const saved = await toolJson('set_presentation', {
      document: 'd1',
      steps: [{ ...before.steps[0], show: ['brak'] }, { title: 'Nowy' }]
    })
    const after = await stored()

    expect(after.steps[0]).toEqual({ id: 's1', title: 'Od użytkownika', camera: { kind: 'place', anchor }, rest: 'dim', show: [] })
    expect(after.steps[1]?.id).toMatch(/^s[0-9a-f]{10}$/)
    expect(saved.warnings).toEqual(['steps[0]: no note or shape brak in the document, so the step skips it'])
  })

  it('agent usuwa swój kształt, a jego id znika z kroków', async () => {
    await addHtmlDoc('d1')
    const first = await toolJson('set_presentation', {
      document: 'd1',
      steps: [{ title: 'Ryzyko', shapes: [{ type: 'rect', at: { quote: 'utrata danych' } }] }]
    })
    const [shape] = first.created

    const second = await toolJson('set_presentation', { document: 'd1', steps: first.steps, delete_shapes: [shape] })

    expect(second.steps[0].show).toEqual([])
    expect(second.warnings).toEqual([])
    expect(await api.annotations.listAll()).toEqual([])
    const wrong = await callTool('set_presentation', { document: 'd1', steps: [], delete_shapes: ['a123'] })
    expect(wrong.content[0].text).toBe('No shape a123 in the document')
  })

  it('prywatna karteczka w kroku nie zdradza treści bez prośby', async () => {
    await addHtmlDoc('d1')
    const note = await api.annotations.create('d1', 'abc', {
      kind: 'sticky',
      audience: 'me',
      color: 'yellow',
      anchor: { selector: '', offsetX: 0.5, offsetY: 0.5, quote: 'Wstęp opisuje', heading: 'Plan migracji' },
      text: 'Powiedz o terminie'
    })
    await toolJson('set_presentation', { document: 'd1', steps: [{ title: 'Wstęp', show: [note.id] }] })

    const hidden = await toolJson('get_presentation', { document: 'd1' })
    const shown = await toolJson('get_presentation', { document: 'd1', include_personal: true })

    expect(hidden.items).toEqual([
      { id: note.id, kind: 'sticky', status: 'open', quote: 'Wstęp opisuje', heading: 'Plan migracji', color: 'yellow', private: true }
    ])
    expect(shown.items[0].text).toBe('Powiedz o terminie')
  })

  it('CLI pokazuje trasę i zapisuje ją z pliku JSON', async () => {
    await addHtmlDoc('d1')
    const file = join(dataDir, 'steps.json')
    await writeFile(
      file,
      JSON.stringify({
        steps: [{ title: 'Ryzyko', camera: { kind: 'place', quote: 'utrata danych' }, rest: 'dim', shapes: [{ type: 'rect', at: { quote: 'utrata danych' } }] }]
      })
    )

    const saved = await runCli(['presentation', 'd1', '--set', file], api)
    const shown = await runCli(['presentation', 'd1'], api)
    const fromStdin = await runCli(['presentation', 'd1', '--set', '-', '--json'], api, async (source) => {
      expect(source).toBe('-')
      return '[]'
    })

    expect(saved).toMatch(/^Presentation saved: 1 step\.\nNew shapes: a[0-9a-f]{8}$/)
    expect(shown).toMatch(/^1\. Ryzyko {2}\[s[0-9a-f]{10}\] {2}frames "utrata danych" under Ryzyka, rest dim\n {3}shows a[0-9a-f]{8} \(pink rect\)$/)
    expect(JSON.parse(fromStdin).steps).toEqual([])
    expect(await runCli(['presentation', 'd1'], api)).toBe('The document has no presentation.')
    await expect(readFile(join(dataDir, 'library', 'd1', 'presentation.json'))).rejects.toThrow()
  })

  it('CLI zgłasza zły plik kroków', async () => {
    await addHtmlDoc('d1')

    await expect(runCli(['presentation', 'd1', '--set', '-'], api, async () => 'nie json')).rejects.toThrow('Cannot read steps from stdin')
    await expect(runCli(['presentation', 'd1', '--set', '-'], api, async () => '{"steps": 3}')).rejects.toThrow('steps must be a list')
  })
})
