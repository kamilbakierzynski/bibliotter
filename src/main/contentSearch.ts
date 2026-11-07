import { Worker } from 'node:worker_threads'
import type { ContentSearch, TextQuery, TextSpan } from '../shared/textSearch'
import type { SearchReply, SearchTask } from './searchWorker'

/** Wyrażenie regularne wpisane w pole może liczyć się w nieskończoność. Tyle ma na odpowiedź. */
const LIMIT_MS = 4000

interface Waiting {
  settle: (reply: SearchReply | null) => void
  timer: NodeJS.Timeout
}

/**
 * Pisanie w polu daje serię zapytań, a tylko ostatnie ma znaczenie. Wyrażenia nie da się przerwać
 * od środka, więc zajęty wątek ginie razem ze swoją pracą, a następne zapytanie stawia nowy.
 */
export class ContentSearcher {
  private worker: Worker | null = null
  private nextId = 0
  /** Ostatnie zadanie każdego rodzaju. Nowsze tego rodzaju je unieważnia. */
  private readonly latest: Record<SearchTask['type'], number> = { library: 0, page: 0 }
  private readonly waiting = new Map<number, Waiting>()

  constructor(
    private readonly script: string,
    private readonly indexPath: string
  ) {}

  private thread(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(this.script, { workerData: { indexPath: this.indexPath } })
    worker.on('message', (reply: SearchReply) => this.finish(reply.id, reply))
    worker.on('error', (error) => console.error('Wątek szukania zgłosił błąd', error))
    worker.on('exit', () => {
      if (this.worker !== worker) return
      this.worker = null
      this.abandon()
    })
    this.worker = worker
    return worker
  }

  private finish(id: number, reply: SearchReply | null): void {
    const job = this.waiting.get(id)
    if (!job) return
    clearTimeout(job.timer)
    this.waiting.delete(id)
    job.settle(reply)
  }

  private abandon(): void {
    for (const id of [...this.waiting.keys()]) this.finish(id, null)
  }

  private stop(): void {
    const worker = this.worker
    this.worker = null
    this.abandon()
    void worker?.terminate()
  }

  private ask(task: SearchTask): Promise<SearchReply | null> {
    if (this.waiting.has(this.latest[task.type])) this.stop()
    const id = (this.nextId += 1)
    this.latest[task.type] = id
    return new Promise((settle) => {
      const timer = setTimeout(() => this.stop(), LIMIT_MS)
      this.waiting.set(id, { settle, timer })
      this.thread().postMessage({ ...task, id })
    })
  }

  async search(query: TextQuery): Promise<ContentSearch> {
    const reply = await this.ask({ type: 'library', query })
    return reply && 'search' in reply ? reply.search : { docs: [], failure: 'slow' }
  }

  /** Wyrażenie w otwartym dokumencie liczy się tutaj, bo na stronie zawiesiłoby jej wątek. */
  async matchPage(text: string, query: TextQuery): Promise<TextSpan[] | 'pattern' | 'slow'> {
    const reply = await this.ask({ type: 'page', text, query })
    if (!reply || !('spans' in reply)) return 'slow'
    return reply.spans ?? 'pattern'
  }

  close(): void {
    this.stop()
  }
}
