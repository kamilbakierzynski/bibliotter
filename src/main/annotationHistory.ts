import type {
  Anchor,
  Annotation,
  AnnotationKind,
  AnnotationMessage,
  AnnotationStatus,
  Audience,
  NewAnnotation
} from '../shared/annotations'
import { t } from '../shared/i18n'
import type { AnnotationStore } from './annotationStore'

const MAX_STEPS = 100

const NOUN: Record<AnnotationKind, string> = {
  comment: 'komentarza',
  sticky: 'karteczki',
  highlight: 'zakreślenia',
  shape: 'kształtu'
}

/**
 * Zmiany są odwrotnościami, a nie zdjęciami całej uwagi. Agent pisze do tych samych plików,
 * więc przywrócenie zdjęcia skasowałoby to, co dopisał w międzyczasie.
 */
type Change =
  /** `replies` to odpowiedzi agenta znane użytkownikowi, gdy decydował o usunięciu. */
  | { type: 'remove'; id: string; replies: number }
  | { type: 'restore'; note: Annotation }
  | { type: 'status'; id: string; status: AnnotationStatus }
  | { type: 'audience'; id: string; audience: Audience }
  | { type: 'unsay'; id: string; messageId: string }
  | { type: 'say'; id: string; message: AnnotationMessage }
  | { type: 'anchor'; id: string; anchor: Anchor | null }

interface Step {
  label: string
  change: Change
}

interface Stacks {
  undo: Step[]
  redo: Step[]
}

/** Agent odpisał od tamtej pory, więc zniknięcie uwagi skasowałoby pracę, której użytkownik nie widział. */
const KEPT = Symbol('kept')

const sameAnchor = (a: Anchor | null, b: Anchor | null): boolean => JSON.stringify(a) === JSON.stringify(b)

const agentReplies = (note: Annotation): number =>
  note.messages.filter(({ author }) => author === 'agent').length

/**
 * Cofanie i przywracanie działań użytkownika, osobno dla każdego dokumentu, żeby `Ctrl+Z`
 * nie zmieniało czegoś, czego nie widać. Agent pisze w innym procesie, więc jego zmian tu nie ma.
 * Stosy żyją tylko do zamknięcia apki.
 */
export class AnnotationHistory {
  private readonly stacks = new Map<string, Stacks>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly store: AnnotationStore,
    private readonly onChange: () => Promise<void>
  ) {}

  /**
   * Zakreślenie zapisuje się w tle, więc klawisz potrafi je wyprzedzić. Rozesłanie zmiany
   * należy do kolejki: inaczej dokument mógłby nigdy nie zobaczyć zakreślenia cofniętego od razu
   * i zostać ze szkicem, który czeka na jego zapis.
   */
  private inOrder<Result>(task: () => Promise<Result>): Promise<Result> {
    const run = this.queue.then(async () => {
      const result = await task()
      await this.onChange()
      return result
    })
    this.queue = run.catch(() => {})
    return run
  }

  private stacksOf(docId: string): Stacks {
    let stacks = this.stacks.get(docId)
    if (!stacks) {
      stacks = { undo: [], redo: [] }
      this.stacks.set(docId, stacks)
    }
    return stacks
  }

  private record(docId: string, label: string, change: Change): void {
    const stacks = this.stacksOf(docId)
    stacks.undo.push({ label, change })
    if (stacks.undo.length > MAX_STEPS) stacks.undo.shift()
    stacks.redo = []
  }

  create(docId: string, docSha: string, input: NewAnnotation): Promise<Annotation> {
    return this.inOrder(async () => {
      const note = await this.store.create(docId, docSha, input)
      this.record(docId, `dodanie ${NOUN[note.kind]}`, { type: 'remove', id: note.id, replies: 0 })
      return note
    })
  }

  reply(id: string, text: string): Promise<Annotation> {
    return this.inOrder(async () => {
      const note = await this.store.addMessage(id, 'user', text)
      const message = note.messages.at(-1) as AnnotationMessage
      this.record(note.docId, 'odpowiedź', { type: 'unsay', id, messageId: message.id })
      return note
    })
  }

  setStatus(id: string, status: AnnotationStatus): Promise<void> {
    return this.inOrder(async () => {
      const before = await this.store.get(id)
      if (before.status === status) return
      await this.store.setStatus(id, status)
      const label = status === 'resolved' ? 'zamknięcie uwagi' : 'ponowne otwarcie uwagi'
      this.record(before.docId, label, { type: 'status', id, status: before.status })
    })
  }

  setAudience(id: string, audience: Audience): Promise<void> {
    return this.inOrder(async () => {
      const before = await this.store.get(id)
      if (before.audience === audience) return
      await this.store.setAudience(id, audience)
      this.record(before.docId, 'zmiana odbiorcy', { type: 'audience', id, audience: before.audience })
    })
  }

  /** Przenieść można tylko komentarz i karteczkę. Zakreślenie i kształt mają geometrię związaną z miejscem. */
  setAnchor(id: string, anchor: Anchor): Promise<void> {
    return this.inOrder(async () => {
      const before = await this.store.get(id)
      if (before.kind !== 'comment' && before.kind !== 'sticky') throw new Error('Only comments and sticky notes can be moved')
      if (sameAnchor(before.anchor, anchor)) return
      await this.store.setAnchor(id, anchor)
      this.record(before.docId, `przeniesienie ${NOUN[before.kind]}`, { type: 'anchor', id, anchor: before.anchor })
    })
  }

  delete(id: string): Promise<void> {
    return this.inOrder(async () => {
      const note = await this.store.get(id)
      await this.store.delete(id)
      this.record(note.docId, `usunięcie ${NOUN[note.kind]}`, { type: 'restore', note })
    })
  }

  /** Wykonuje zmianę i zwraca jej odwrotność. `null` znaczy, że agent już doprowadził uwagę do tego stanu. */
  private async apply(docId: string, change: Change): Promise<Change | typeof KEPT | null> {
    if (change.type === 'restore') {
      await this.store.restore(change.note)
      return { type: 'remove', id: change.note.id, replies: agentReplies(change.note) }
    }
    const note = (await this.store.listForDoc(docId)).find(({ id }) => id === change.id)
    if (!note) return null
    switch (change.type) {
      case 'remove':
        if (agentReplies(note) > change.replies) return KEPT
        await this.store.delete(note.id)
        return { type: 'restore', note }
      case 'status':
        if (note.status === change.status) return null
        await this.store.setStatus(note.id, change.status)
        return { type: 'status', id: note.id, status: note.status }
      case 'audience':
        if (note.audience === change.audience) return null
        await this.store.setAudience(note.id, change.audience)
        return { type: 'audience', id: note.id, audience: note.audience }
      case 'unsay': {
        const message = note.messages.find(({ id }) => id === change.messageId)
        if (!message) return null
        await this.store.removeMessage(note.id, message.id)
        return { type: 'say', id: note.id, message }
      }
      case 'say':
        await this.store.restoreMessage(note.id, change.message)
        return { type: 'unsay', id: note.id, messageId: change.message.id }
      case 'anchor':
        if (sameAnchor(note.anchor, change.anchor)) return null
        await this.store.setAnchor(note.id, change.anchor)
        return { type: 'anchor', id: note.id, anchor: note.anchor }
    }
  }

  private move(docId: string, from: 'undo' | 'redo', verb: string): Promise<string | null> {
    return this.inOrder(async () => {
      const stacks = this.stacksOf(docId)
      const source = stacks[from]
      const target = stacks[from === 'undo' ? 'redo' : 'undo']
      for (let step = source.at(-1); step; step = source.at(-1)) {
        // Błąd zapisu zostawia krok na stosie, żeby można było spróbować ponownie.
        const inverse = await this.apply(docId, step.change)
        source.pop()
        if (inverse === KEPT) return t('Agent odpisał na tę uwagę, więc zostaje')
        if (!inverse) continue
        target.push({ label: step.label, change: inverse })
        return `${t(verb)}: ${t(step.label)}`
      }
      return null
    })
  }

  /** Zwraca komunikat dla użytkownika, a `null`, gdy nie ma czego cofnąć. */
  undo(docId: string): Promise<string | null> {
    return this.move(docId, 'undo', 'Cofnięto')
  }

  redo(docId: string): Promise<string | null> {
    return this.move(docId, 'redo', 'Przywrócono')
  }
}
