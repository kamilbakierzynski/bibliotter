import { Worker } from 'node:worker_threads'
import type { DocClass, DocEntry, DocStatus, LibrarySnapshot, ScanProgress, SearchHit } from '../shared/types'
import type { LabelChoice } from './autoLabel'
import type { LibraryConfig } from './library'
import type { LibraryCall, LibraryCommands, LibraryInit, LibraryMessage } from './libraryProtocol'

/** Wątek, który pada zaraz po starcie, padłby i po kolejnym, więc próby są policzone. */
const RESTART_LIMIT = 2
const SHUTDOWN_LIMIT_MS = 1000

interface PendingCall {
  done: (result: never) => void
  fail: (error: Error) => void
}

export interface LibraryClientOptions {
  script: string
  init: () => LibraryInit
  onChange: (json: string) => void
  onProgress: (progress: ScanProgress) => void
  onNewDocs: (docIds: string[]) => void
}

/**
 * Biblioteka działa w osobnym wątku, a główny wątek obsługuje okno. Migawka przychodzi jako tekst
 * i w tej postaci idzie dalej do powłoki. Parsujemy ją tylko, gdy ktoś pyta tu o dokument.
 */
export class LibraryClient {
  private worker!: Worker
  private nextId = 0
  private restarts = 0
  private closing = false
  private json: string | null = null
  private snapshot: LibrarySnapshot | null = null
  private entries: Map<string, DocEntry> | null = null
  private readonly calls = new Map<number, PendingCall>()
  private firstSnapshot: ((json: string) => void)[] = []

  constructor(private readonly options: LibraryClientOptions) {
    this.start()
  }

  private start(): void {
    this.worker = new Worker(this.options.script, { workerData: this.options.init() })
    this.worker.on('message', (message: LibraryMessage) => this.receive(message))
    this.worker.on('error', (error) => console.error('Wątek biblioteki zgłosił błąd', error))
    this.worker.on('exit', () => this.lost())
  }

  private receive(message: LibraryMessage): void {
    if (message.type === 'progress') {
      this.options.onProgress(message.progress)
    } else if (message.type === 'changed') {
      this.json = message.json
      this.snapshot = null
      this.entries = null
      for (const waiting of this.firstSnapshot) waiting(message.json)
      this.firstSnapshot = []
      this.options.onChange(message.json)
    } else if (message.type === 'new-docs') {
      this.options.onNewDocs(message.docIds)
    } else {
      const call = this.calls.get(message.id)
      this.calls.delete(message.id)
      if (message.error === undefined) call?.done(message.result as never)
      else call?.fail(new Error(message.error))
    }
  }

  private lost(): void {
    for (const { fail } of this.calls.values()) fail(new Error('Wątek biblioteki zakończył pracę'))
    this.calls.clear()
    if (this.closing || this.restarts >= RESTART_LIMIT) return
    this.restarts += 1
    this.start()
  }

  private call<Name extends keyof LibraryCommands>(
    command: Name,
    ...args: Parameters<LibraryCommands[Name]>
  ): Promise<Awaited<ReturnType<LibraryCommands[Name]>>> {
    return new Promise((done, fail) => {
      const id = this.nextId++
      this.calls.set(id, { done, fail })
      const call: LibraryCall = { id, command, args }
      this.worker.postMessage(call)
    })
  }

  /** Migawka w postaci gotowej do wysłania. Czeka tylko przy starcie, ułamek sekundy. */
  snapshotJson(): Promise<string> {
    if (this.json !== null) return Promise.resolve(this.json)
    return new Promise((done) => this.firstSnapshot.push(done))
  }

  getSnapshot(): LibrarySnapshot | null {
    if (!this.snapshot && this.json !== null) this.snapshot = JSON.parse(this.json) as LibrarySnapshot
    return this.snapshot
  }

  private lookup(): Map<string, DocEntry> {
    if (!this.entries) {
      const snapshot = this.getSnapshot()
      const docs = snapshot ? [...snapshot.projects.flatMap((project) => project.docs), ...snapshot.review] : []
      this.entries = new Map(docs.map((doc) => [doc.id, doc]))
    }
    return this.entries
  }

  getEntry(docId: string): DocEntry | undefined {
    return this.lookup().get(docId)
  }

  /** Plik do wyświetlenia: oryginał albo ostatnia kopia, gdy oryginał zniknął. */
  getServedPath(docId: string): string | undefined {
    const entry = this.getEntry(docId)
    return entry?.copyPath ?? entry?.path
  }

  configure(config: LibraryConfig, refreshGit: boolean): Promise<void> {
    return this.call('configure', config, refreshGit)
  }

  /** Ustawienia, które nie zmieniają zawartości folderów, więc nie potrzebują skanu. */
  settings(config: LibraryConfig): Promise<void> {
    return this.call('settings', config)
  }

  scan(refreshGit: boolean): Promise<void> {
    return this.call('scan', refreshGit)
  }

  setStatus(docId: string, status: DocStatus): Promise<void> {
    return this.call('setStatus', docId, status)
  }

  setStatuses(docIds: string[], status: DocStatus): Promise<void> {
    return this.call('setStatuses', docIds, status)
  }

  renameDoc(docId: string, name: string): Promise<void> {
    return this.call('renameDoc', docId, name)
  }

  markOpened(docId: string): Promise<void> {
    return this.call('markOpened', docId)
  }

  setClassification(docId: string, classification: Exclude<DocClass, 'review'>): Promise<void> {
    return this.call('setClassification', docId, classification)
  }

  setLabels(docId: string, labels: unknown): Promise<void> {
    return this.call('setLabels', docId, labels)
  }

  addLabels(docId: string, names: string[]): Promise<string[]> {
    return this.call('addLabels', docId, names)
  }

  documentText(docId: string): Promise<string> {
    return this.call('documentText', docId)
  }

  labelChoices(): Promise<LabelChoice[]> {
    return this.call('labelChoices')
  }

  renameLabel(from: string, to: unknown): Promise<void> {
    return this.call('renameLabel', from, to)
  }

  deleteLabel(name: string): Promise<void> {
    return this.call('deleteLabel', name)
  }

  reloadLabels(): Promise<void> {
    return this.call('reloadLabels')
  }

  search(query: string): Promise<SearchHit[]> {
    return this.call('search', query)
  }

  renderMarkdown(docPath: string): Promise<string> {
    return this.call('renderMarkdown', docPath)
  }

  /** Daje wątkowi chwilę na zapisy. Po tym czasie kończymy i tak, bo wszystko da się odtworzyć. */
  async close(): Promise<void> {
    this.closing = true
    const timeout = new Promise((done) => setTimeout(done, SHUTDOWN_LIMIT_MS))
    await Promise.race([this.call('shutdown').catch(() => {}), timeout])
    await this.worker.terminate()
  }
}
