import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DocMeta, MetaStore } from '../src/main/metaStore'

let workspace: string
let store: MetaStore

const meta = (change: Partial<DocMeta> = {}): DocMeta => ({
  id: 'd1',
  path: join(workspace, 'plan.html'),
  title: 'Plan',
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  status: 'to-read',
  sha: 'abc',
  mtimeMs: 1,
  projectPath: null,
  branch: null,
  commit: null,
  versions: [],
  ...change
})

const onDisk = async (id = 'd1'): Promise<DocMeta> =>
  JSON.parse(await readFile(join(workspace, 'library', id, 'meta.json'), 'utf8')) as DocMeta

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'meta-'))
  store = new MetaStore(join(workspace, 'library'))
  await store.load()
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('MetaStore', () => {
  it('zmiana jest od razu w pamięci, a na dysku po flush', async () => {
    store.stage(meta())

    expect(store.get('d1')?.status).toBe('to-read')
    await expect(onDisk()).rejects.toThrow()

    await store.flush()

    expect((await onDisk()).status).toBe('to-read')
  })

  it('kolejne zmiany w trakcie zapisu kończą się najświeższym stanem', async () => {
    store.stage(meta())
    const first = store.flush()
    store.stage(meta({ status: 'read' }))
    store.stage(meta({ status: 'decided' }))
    await first
    await store.flush()

    expect((await onDisk()).status).toBe('decided')
  })

  it('robi kopię wersji, zanim zapisze odwołanie do niej', async () => {
    const path = join(workspace, 'plan.html')
    await writeFile(path, '<h1>A</h1>')

    store.stage(store.planVersion(meta({ path }), path, 'abc123456789000', new Date('2026-01-01')))
    await store.flush()

    const { versions } = await onDisk()
    expect(versions).toHaveLength(1)
    expect(await readdir(join(workspace, 'library', 'd1', 'versions'))).toEqual([versions[0]?.file])
  })

  it('nie powtarza wersji o tej samej treści', () => {
    const path = join(workspace, 'plan.html')
    const first = store.planVersion(meta({ path }), path, 'abc', new Date())

    expect(store.planVersion(first, path, 'abc', new Date())).toBe(first)
  })

  it('plik, który zniknął przed kopią, nie zostawia wersji bez kopii', async () => {
    const path = join(workspace, 'nie-ma.html')

    store.stage(store.planVersion(meta({ path }), path, 'abc', new Date()))
    await store.flush()

    expect((await onDisk()).versions).toEqual([])
    expect(store.get('d1')?.versions).toEqual([])
  })
})
