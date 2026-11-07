import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import { type FileAnalysis, type FileAnalyzer } from './analysis'
import type { AnalysisTask } from './analysisWorker'

const MAX_THREADS = 4
/** Bezczynna pula oddaje pamięć. Ponowne uruchomienie kosztuje ułamek sekundy, w tle. */
const IDLE_MS = 8000

interface Thread {
  worker: Worker
  waiting: Map<number, (analysis: FileAnalysis | null) => void>
}

/** Wątki do analizy plików. Powstają przy pierwszym zadaniu i znikają, gdy nie mają pracy. */
export class AnalysisPool {
  private readonly size = Math.min(MAX_THREADS, Math.max(1, availableParallelism() - 2))
  private threads: Thread[] = []
  private nextId = 0
  private idleTimer: NodeJS.Timeout | null = null

  constructor(private readonly script: string) {}

  readonly analyze: FileAnalyzer = (path, format) =>
    new Promise((done) => {
      if (this.idleTimer) clearTimeout(this.idleTimer)
      this.idleTimer = null
      const thread = this.leastBusy()
      const id = this.nextId++
      thread.waiting.set(id, done)
      const task: AnalysisTask = { id, path, format }
      thread.worker.postMessage(task)
    })

  private leastBusy(): Thread {
    const free = this.threads.reduce<Thread | null>(
      (best, thread) => (!best || thread.waiting.size < best.waiting.size ? thread : best),
      null
    )
    if (free && (free.waiting.size === 0 || this.threads.length >= this.size)) return free
    return this.start()
  }

  private start(): Thread {
    const worker = new Worker(this.script)
    const thread: Thread = { worker, waiting: new Map() }
    worker.on('message', ({ id, analysis }: { id: number; analysis: FileAnalysis | null }) => {
      thread.waiting.get(id)?.(analysis)
      thread.waiting.delete(id)
      if (this.threads.every((item) => item.waiting.size === 0)) this.idle()
    })
    const lost = (): void => {
      // Uszkodzony wątek nie może zatrzymać skanu, więc jego pliki traktujemy jak nieczytelne.
      this.threads = this.threads.filter((item) => item !== thread)
      for (const done of thread.waiting.values()) done(null)
      thread.waiting.clear()
    }
    worker.on('error', lost)
    worker.on('exit', lost)
    this.threads.push(thread)
    return thread
  }

  private idle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.close(), IDLE_MS)
    this.idleTimer.unref()
  }

  close(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    const threads = this.threads
    this.threads = []
    for (const { worker } of threads) void worker.terminate()
  }
}
