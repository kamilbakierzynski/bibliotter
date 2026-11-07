import type { DocClass, DocFormat } from '../shared/types'
import { renderMarkdown } from './markdown'

export interface HtmlFeatures {
  title: string | null
  text: string
  textLength: number
  headings: number
  inlineCss: boolean
  localScripts: number
  appMount: boolean
}

const NON_CONTENT = /<(style|script|svg|noscript|template)\b[\s\S]*?<\/\1\s*>/gi
const COMMENT = /<!--[\s\S]*?-->/g
const TAG = /<[^>]+>/g
const ENTITY = /&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/gi
const HEADING = /<h[1-3][\s>]/gi
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i
const LOCAL_SCRIPT = /<script\b[^>]*\ssrc=["'](?!https?:|\/\/)/gi
const APP_MOUNT = /<div\b[^>]*\bid=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i

const ENTITY_TEXT: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
}

export function analyzeHtml(html: string): HtmlFeatures {
  const title = TITLE.exec(html)?.[1]?.replace(/\s+/g, ' ').trim() || null
  const text = html
    .replace(COMMENT, ' ')
    .replace(NON_CONTENT, ' ')
    .replace(/<head\b[\s\S]*?<\/head\s*>/i, ' ')
    .replace(TAG, ' ')
    .replace(ENTITY, (entity) => ENTITY_TEXT[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    title,
    text,
    textLength: text.length,
    headings: html.match(HEADING)?.length ?? 0,
    inlineCss: /<style[\s>]/i.test(html),
    localScripts: html.match(LOCAL_SCRIPT)?.length ?? 0,
    appMount: APP_MOUNT.test(html)
  }
}

/** Markdown przechodzi przez tę samą analizę co HTML, ale tytuł bierze z własnej składni. */
export function analyzeDocument(format: DocFormat, source: string): HtmlFeatures {
  if (format === 'html') return analyzeHtml(source)
  const { title, html } = renderMarkdown(source)
  return { ...analyzeHtml(html), title }
}

const NON_DOCUMENT_FOLDERS = new Set([
  'tmp',
  'temp',
  'public',
  'static',
  'fixtures',
  'testdata',
  '__snapshots__',
  'templates'
])
const TEST_OUTPUT_FOLDER = /^(pytest-|test_|test-results)/i

const MIN_DOCUMENT_TEXT = 800
const MIN_DOCUMENT_HEADINGS = 3
const MIN_PAGE_TEXT = 400
/** Tyle plików HTML w jednym folderze oznacza masowy wynik generatora. */
const BULK_FOLDER_SIZE = 20
/** Pliki, które ma każde repozytorium. Opisują kod, więc nie są dokumentami do przeczytania. */
const REPO_FILE =
  /^(?:readme|changelog|changes|history|license|licence|notice|copying|authors|contributing|code_of_conduct|security|support|pull_request_template|issue_template|claude|agents|gemini|skill)(?:\.[\w-]+)?\.(?:md|markdown)$/i

export interface ClassifyContext {
  /** Ścieżka względem projektu, z ukośnikami `/`. */
  relPath: string
  /** Liczba plików tego samego formatu w tym samym folderze. */
  siblings: number
  format: DocFormat
}

export interface Classification {
  classification: DocClass
  reason: string
}

const ignored = (reason: string): Classification => ({ classification: 'ignored', reason })
const review = (reason: string): Classification => ({ classification: 'review', reason })

type Features = Omit<HtmlFeatures, 'text' | 'title'>

/** Markdown nie ma własnego stylu, więc dokument poznajemy po ilości treści i jej strukturze. */
function classifyMarkdown({ textLength, headings }: Features): Classification {
  if (textLength < MIN_PAGE_TEXT) return ignored('Za mało treści')
  if (textLength >= MIN_DOCUMENT_TEXT && headings >= MIN_DOCUMENT_HEADINGS) {
    return { classification: 'document', reason: 'Dokument Markdown' }
  }
  return review('Ma treść, ale mało struktury')
}

/** Werdykt z samej ścieżki. Taki plik nie wymaga czytania, a w repozytoriach to ponad połowa plików. */
export function classifyByPath({ relPath, siblings, format }: ClassifyContext): Classification | null {
  const folders = relPath.split('/').slice(0, -1)
  if (folders.some((folder) => NON_DOCUMENT_FOLDERS.has(folder.toLowerCase()))) {
    return ignored('Folder z plikami tymczasowymi lub stroną publiczną')
  }
  if (folders.some((folder) => TEST_OUTPUT_FOLDER.test(folder))) {
    return ignored('Wynik testów')
  }
  if (format === 'markdown') {
    return REPO_FILE.test(relPath.split('/').at(-1) ?? '') ? ignored('Plik opisujący repozytorium') : null
  }
  // Duży folder Markdownów to zwykle notatki albo dokumentacja, a nie wynik generatora.
  return siblings >= BULK_FOLDER_SIZE ? ignored('Masowy wynik generatora') : null
}

/** Dzieli pliki na dokumenty, niepewne i pomijane na podstawie ich budowy. */
export function classify(features: Features, context: ClassifyContext): Classification {
  const byPath = classifyByPath(context)
  if (byPath) return byPath
  if (context.format === 'markdown') return classifyMarkdown(features)
  if (features.appMount) return ignored('Punkt wejścia aplikacji')

  const { textLength } = features
  if (textLength < MIN_PAGE_TEXT) return ignored('Za mało treści')

  const structured = textLength >= MIN_DOCUMENT_TEXT && features.headings >= MIN_DOCUMENT_HEADINGS
  if (structured && features.inlineCss && features.localScripts === 0) {
    return { classification: 'document', reason: 'Samodzielny dokument' }
  }
  if (structured) return review('Ma treść dokumentu, ale zależy od zewnętrznych plików')
  if (features.localScripts > 0) return ignored('Strona zależna od lokalnych skryptów')
  if (features.inlineCss) return review('Ma własny styl, ale mało struktury')
  return ignored('Zwykła strona bez własnego stylu')
}
