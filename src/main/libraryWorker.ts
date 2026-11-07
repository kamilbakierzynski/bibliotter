import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { AnalysisPool } from './analysisPool'
import { findCodePaths } from './codePaths'
import { FolderWatcher } from './folderWatcher'
import { commandRunner } from './git'
import { Library, type LibraryConfig } from './library'
import type { LibraryCall, LibraryCommands, LibraryInit, LibraryMessage } from './libraryProtocol'
import { markdownPage } from './markdownPage'

/** Tyle zamykana apka czeka na zapisy. Czego nie zdąży, to następny skan odtworzy. */
const QUIT_WAIT_MS = 500

const port = parentPort
if (!port) throw new Error('Biblioteka działa tylko jako osobny wątek')

const { dataDir, config: initialConfig } = workerData as LibraryInit
let config: LibraryConfig = initialConfig

const send = (message: LibraryMessage): void => port.postMessage(message)

const pool = new AnalysisPool(join(__dirname, 'analysisWorker.js'))
const opening = Library.open({
  dataDir,
  git: commandRunner('git'),
  gh: commandRunner('gh'),
  getConfig: () => config,
  analyze: pool.analyze,
  onChange: (_snapshot, json) => send({ type: 'changed', json }),
  onNewDocs: (docIds) => send({ type: 'new-docs', docIds }),
  onProgress: (progress) => send({ type: 'progress', progress })
})

function scan(refreshGit: boolean): void {
  // Skan powtórzy się przy następnej zmianie, a pojedyncza porażka nie może zamknąć wątku.
  void opening.then((library) => library.scan({ refreshGit })).catch((error: unknown) => console.error(error))
}

const watcher = new FolderWatcher(() => scan(false))

const commands: LibraryCommands = {
  configure(next, refreshGit) {
    config = next
    if (refreshGit) watcher.watch(next.roots)
    scan(refreshGit)
  },
  settings: async (next) => {
    config = next
    ;(await opening).applyConfig()
  },
  scan,
  setStatus: async (docId, status) => {
    await (await opening).setStatus(docId, status)
  },
  setStatuses: async (docIds, status) => {
    await (await opening).setStatuses(docIds, status)
  },
  renameDoc: async (docId, name) => {
    await (await opening).renameDoc(docId, name)
  },
  markOpened: async (docId) => (await opening).markOpened(docId),
  setClassification: async (docId, classification) => {
    await (await opening).setClassification(docId, classification)
  },
  setLabels: async (docId, labels) => (await opening).setLabels(docId, labels),
  addLabels: async (docId, names) => (await opening).addLabels(docId, names),
  documentText: async (docId) => (await opening).documentText(docId),
  labelChoices: async () => (await opening).labelChoices(),
  renameLabel: async (from, to) => (await opening).renameLabel(from, to),
  deleteLabel: async (name) => (await opening).deleteLabel(name),
  reloadLabels: async () => (await opening).reloadLabels(),
  search: async (query) => (await opening).search(query),
  renderMarkdown: async (docPath) => {
    const source = await readFile(docPath, 'utf8')
    return markdownPage(source, basename(docPath), await findCodePaths(source, docPath))
  },
  shutdown: async () => {
    watcher.close()
    const library = await opening
    await Promise.race([library.idle(), new Promise((done) => setTimeout(done, QUIT_WAIT_MS))])
    pool.close()
    library.close()
  }
}

port.on('message', ({ id, command, args }: LibraryCall) => {
  const run = commands[command] as (...values: unknown[]) => unknown
  Promise.resolve()
    .then(() => run(...args))
    .then(
      (result) => send({ type: 'reply', id, result }),
      (error: unknown) => send({ type: 'reply', id, error: error instanceof Error ? error.message : String(error) })
    )
})

watcher.watch(config.roots)
scan(false)
