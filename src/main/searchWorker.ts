import { DatabaseSync } from 'node:sqlite'
import { parentPort, workerData } from 'node:worker_threads'
import {
  createMatcher,
  type ContentDoc,
  type ContentSearch,
  scanDocument,
  type TextMatcher,
  type TextQuery,
  type TextSpan
} from '../shared/textSearch'
import { indexedTexts } from './searchIndex'

/** Resztę pokazuje dokument, a panel nie ma po co nieść tysięcy wierszy z jednego pliku. */
const HITS_PER_DOC = 30

export type SearchTask = { type: 'library'; query: TextQuery } | { type: 'page'; query: TextQuery; text: string }

export type SearchReply = { id: number; search: ContentSearch } | { id: number; spans: TextSpan[] | null }

const port = parentPort
if (!port) throw new Error('Szukanie działa tylko jako osobny wątek')

const { indexPath } = workerData as { indexPath: string }
let db: DatabaseSync | null = null

function open(): DatabaseSync {
  db ??= new DatabaseSync(indexPath, { readOnly: true })
  return db
}

function searchLibrary(query: TextQuery): ContentSearch {
  let matcher: TextMatcher | null
  try {
    matcher = createMatcher(query)
  } catch {
    return { docs: [], failure: 'pattern' }
  }
  if (!matcher) return { docs: [] }
  const docs: ContentDoc[] = []
  try {
    for (const row of indexedTexts(open(), matcher.folded)) {
      const found = scanDocument(row, matcher, HITS_PER_DOC)
      if (found) docs.push(found)
    }
  } catch {
    // Pierwszy skan jeszcze nie założył indeksu, a stare połączenie nie zobaczy nowych tabel.
    db?.close()
    db = null
    return { docs: [], failure: 'index' }
  }
  return { docs }
}

function searchPage(text: string, query: TextQuery): TextSpan[] | null {
  try {
    return createMatcher(query)?.find(text) ?? []
  } catch {
    return null
  }
}

port.on('message', (job: SearchTask & { id: number }) => {
  port.postMessage(
    job.type === 'library'
      ? { id: job.id, search: searchLibrary(job.query) }
      : { id: job.id, spans: searchPage(job.text, job.query) }
  )
})
