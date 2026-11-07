import { DatabaseSync, type StatementSync } from 'node:sqlite'
import type { PullRequest } from '../shared/types'
import type { HtmlFeatures } from './classify'
import { normalizeText, queryTerms } from '../shared/textNormalize'
import type { IndexedText } from '../shared/textSearch'

const SCHEMA_VERSION = 2
const SNIPPET_CONTEXT = 70
const MAX_RESULTS = 60

const SCHEMA = `
  CREATE TABLE files (
    path TEXT PRIMARY KEY,
    mtime REAL NOT NULL,
    size INTEGER NOT NULL,
    sha TEXT NOT NULL,
    title TEXT,
    headings INTEGER NOT NULL,
    inline_css INTEGER NOT NULL,
    local_scripts INTEGER NOT NULL,
    app_mount INTEGER NOT NULL,
    text_length INTEGER NOT NULL
  );
  CREATE TABLE doc_text (doc_id TEXT PRIMARY KEY, sha TEXT NOT NULL, text TEXT NOT NULL);
  CREATE VIRTUAL TABLE doc_fts USING fts5(doc_id UNINDEXED, title, path, body);
  CREATE TABLE pull_requests (
    repo TEXT NOT NULL,
    branch TEXT NOT NULL,
    fetched_at REAL NOT NULL,
    data TEXT,
    PRIMARY KEY (repo, branch)
  );
`

export interface CachedFile {
  mtimeMs: number
  size: number
  sha: string
  /** Cechy bez tekstu. Do klasyfikacji wystarcza jego długość. */
  features: Omit<HtmlFeatures, 'text'>
}

interface FileRow {
  mtime: number
  size: number
  sha: string
  title: string | null
  headings: number
  inline_css: number
  local_scripts: number
  app_mount: number
  text_length: number
}

export interface DocText {
  docId: string
  sha: string
  title: string
  path: string
  text: string
}

export interface SearchMatch {
  docId: string
  before: string
  match: string
  after: string
}

export function buildSnippet(text: string, terms: string[]): Omit<SearchMatch, 'docId'> {
  const normalized = normalizeText(text)
  for (const term of terms) {
    const start = normalized.indexOf(term)
    if (start >= 0) {
      const end = start + term.length
      const from = Math.max(0, start - SNIPPET_CONTEXT)
      const to = Math.min(text.length, end + SNIPPET_CONTEXT)
      return {
        before: `${from > 0 ? '…' : ''}${text.slice(from, start)}`,
        match: text.slice(start, end),
        after: `${text.slice(end, to)}${to < text.length ? '…' : ''}`
      }
    }
  }
  return { before: '', match: '', after: text.slice(0, SNIPPET_CONTEXT * 2) }
}

/**
 * Przegląda tekst całej biblioteki na osobnym połączeniu do odczytu. Indeks FTS znajduje tylko
 * początki słów, a szukanie w treści ma widzieć każdy fragment. `folded` to tekst po `normalizeText`.
 */
export function* indexedTexts(db: DatabaseSync, folded: boolean): Generator<IndexedText> {
  const original = db.prepare('SELECT text FROM doc_text WHERE rowid = ?')
  const rows = db
    .prepare(
      folded
        ? 'SELECT rowid AS id, doc_id AS docId, body AS source FROM doc_fts'
        : 'SELECT rowid AS id, doc_id AS docId, text AS source FROM doc_text'
    )
    .iterate() as Iterable<unknown> as Iterable<{ id: number; docId: string; source: string }>
  for (const { id, docId, source } of rows) {
    yield { docId, source, text: () => (folded ? (original.get(id) as { text: string }).text : source) }
  }
}

/** Indeks odtwarzalny z plików. Źródłem prawdy pozostają dokumenty i ich `meta.json`. */
export class SearchIndex {
  private readonly db: DatabaseSync
  private readonly statements = new Map<string, StatementSync>()

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    try {
      this.prepareSchema()
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  private prepareSchema(): void {
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
    const { user_version: version } = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    if (version !== SCHEMA_VERSION) {
      this.db.exec(`
        DROP TABLE IF EXISTS files;
        DROP TABLE IF EXISTS doc_text;
        DROP TABLE IF EXISTS doc_fts;
        DROP TABLE IF EXISTS pull_requests;
        ${SCHEMA}
        PRAGMA user_version = ${SCHEMA_VERSION};
      `)
    }
  }

  close(): void {
    this.db.close()
  }

  /** Skan pyta o każdy plik, więc przygotowane zapytania nie mogą powstawać za każdym razem. */
  private sql(query: string): StatementSync {
    let statement = this.statements.get(query)
    if (!statement) {
      statement = this.db.prepare(query)
      this.statements.set(query, statement)
    }
    return statement
  }

  transaction(run: () => void): void {
    this.db.exec('BEGIN')
    try {
      run()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getFile(path: string): CachedFile | null {
    const row = this.sql('SELECT * FROM files WHERE path = ?').get(path) as FileRow | undefined
    if (!row) return null
    return {
      mtimeMs: row.mtime,
      size: row.size,
      sha: row.sha,
      features: {
        title: row.title,
        headings: row.headings,
        inlineCss: row.inline_css === 1,
        localScripts: row.local_scripts,
        appMount: row.app_mount === 1,
        textLength: row.text_length
      }
    }
  }

  putFile(path: string, mtimeMs: number, size: number, sha: string, features: HtmlFeatures): void {
    this
      .sql(
        `INSERT OR REPLACE INTO files
         (path, mtime, size, sha, title, headings, inline_css, local_scripts, app_mount, text_length)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        path,
        mtimeMs,
        size,
        sha,
        features.title,
        features.headings,
        features.inlineCss ? 1 : 0,
        features.localScripts,
        features.appMount ? 1 : 0,
        features.textLength
      )
  }

  /** Usuwa wpisy plików, których skan już nie znalazł. */
  retainFiles(paths: Set<string>): void {
    const known = this.sql('SELECT path FROM files').all() as { path: string }[]
    const remove = this.sql('DELETE FROM files WHERE path = ?')
    for (const { path } of known) {
      if (!paths.has(path)) remove.run(path)
    }
  }

  hasDocText(docId: string, sha: string): boolean {
    return this.sql('SELECT 1 FROM doc_text WHERE doc_id = ? AND sha = ?').get(docId, sha) !== undefined
  }

  putDocText({ docId, sha, title, path, text }: DocText): void {
    this.deleteDocText(docId)
    const { lastInsertRowid } = this.sql('INSERT INTO doc_text (doc_id, sha, text) VALUES (?, ?, ?)').run(docId, sha, text)
    this.sql('INSERT INTO doc_fts (rowid, doc_id, title, path, body) VALUES (?, ?, ?, ?, ?)')
      .run(lastInsertRowid, docId, normalizeText(title), normalizeText(path), normalizeText(text))
  }

  /** Wpis w FTS ma ten sam `rowid` co tekst, bo szukanie po `doc_id` przegląda cały indeks. */
  deleteDocText(docId: string): void {
    const row = this.sql('SELECT rowid FROM doc_text WHERE doc_id = ?').get(docId) as { rowid: number } | undefined
    if (!row) return
    this.sql('DELETE FROM doc_fts WHERE rowid = ?').run(row.rowid)
    this.sql('DELETE FROM doc_text WHERE rowid = ?').run(row.rowid)
  }

  search(query: string): SearchMatch[] {
    const terms = queryTerms(query)
    if (terms.length === 0) return []
    const match = terms.map((term) => `"${term}"*`).join(' ')
    const rows = this.db
      .prepare(
        `SELECT doc_fts.doc_id AS docId, doc_text.text AS text
         FROM doc_fts JOIN doc_text ON doc_text.doc_id = doc_fts.doc_id
         WHERE doc_fts MATCH ?
         ORDER BY bm25(doc_fts, 0, 10, 2, 1)
         LIMIT ?`
      )
      .all(match, MAX_RESULTS) as { docId: string; text: string }[]
    return rows.map(({ docId, text }) => ({ docId, ...buildSnippet(text, terms) }))
  }

  getPullRequest(repo: string, branch: string): { fetchedAt: number; pullRequest: PullRequest | null } | null {
    const row = this.sql('SELECT fetched_at, data FROM pull_requests WHERE repo = ? AND branch = ?')
      .get(repo, branch) as { fetched_at: number; data: string | null } | undefined
    if (!row) return null
    return {
      fetchedAt: row.fetched_at,
      pullRequest: row.data ? (JSON.parse(row.data) as PullRequest) : null
    }
  }

  putPullRequest(repo: string, branch: string, fetchedAt: number, pullRequest: PullRequest | null): void {
    this.sql('INSERT OR REPLACE INTO pull_requests (repo, branch, fetched_at, data) VALUES (?, ?, ?, ?)')
      .run(repo, branch, fetchedAt, pullRequest ? JSON.stringify(pullRequest) : null)
  }
}
