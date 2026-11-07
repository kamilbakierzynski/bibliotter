/*
 * Strona arkusza pliku. CodeMirror pokazuje plik albo jego zmiany względem HEAD, tylko do czytania,
 * w tym samym języku co arkusz Markdownu: papier, Geist Mono, czerń i szarości. Stan zmian niesie
 * masa, nie kolor: dodany wiersz ma pełną kreskę i tło, usunięty przerywaną kreskę i przygaszony tekst.
 */
import { cpp } from '@codemirror/lang-cpp'
import { css } from '@codemirror/lang-css'
import { go } from '@codemirror/lang-go'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { php } from '@codemirror/lang-php'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { unifiedMergeView } from '@codemirror/merge'
import { EditorState, type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, GutterMarker, gutterLineClass, highlightSpecialChars, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { type FileMode, type FileViewData, type LineRange, parseFileFragment } from '../shared/fileView'

const LANGUAGES: Record<string, () => Extension> = {
  typescript: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  javascript: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  json: () => json(),
  css: () => css(),
  html: () => html(),
  markdown: () => markdown(),
  python: () => python(),
  rust: () => rust(),
  go: () => go(),
  java: () => java(),
  cpp: () => cpp(),
  sql: () => sql(),
  yaml: () => yaml(),
  xml: () => xml(),
  php: () => php()
}

/** Składnia jak w listingach kitu explain: słowa kluczowe mają masę, komentarze i napisy są szarsze. */
const ink = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.modifier], fontWeight: '650' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: 'var(--ink-3)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character], color: 'var(--ink-2)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--ink-2)' },
  { tag: [tags.typeName, tags.className, tags.namespace], fontWeight: '550' },
  { tag: [tags.function(tags.definition(tags.variableName)), tags.definition(tags.propertyName)], fontWeight: '550' },
  { tag: [tags.meta, tags.processingInstruction, tags.annotation], color: 'var(--ink-3)' },
  { tag: tags.tagName, fontWeight: '600' },
  { tag: tags.attributeName, color: 'var(--ink-2)' },
  { tag: tags.heading, fontWeight: '650' },
  { tag: tags.strong, fontWeight: '650' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, textDecoration: 'underline', textDecorationColor: 'var(--hair-2)' },
  { tag: tags.url, color: 'var(--ink-2)' },
  { tag: tags.strikethrough, textDecoration: 'line-through' }
])

const MONO = "'Geist Mono', Consolas, monospace"

const sheet = EditorView.theme({
  '&': { color: 'var(--ink)', backgroundColor: 'transparent', fontSize: '12.75px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: MONO, lineHeight: '1.65' },
  '.cm-content': { padding: '0 32px 0 10px', caretColor: 'transparent' },
  '.cm-line': { padding: '0 0 0 4px' },
  '.cm-gutters': { backgroundColor: 'var(--paper)', color: 'var(--ink-3)', border: 'none', paddingLeft: '18px' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '34px', padding: '0 6px 0 0', fontVariantNumeric: 'tabular-nums' },
  '.cm-gutterElement.cm-target': { color: 'var(--ink)', fontWeight: '600' },
  '.cm-line.cm-target': { backgroundColor: 'var(--tint)', boxShadow: 'inset 2px 0 0 var(--ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--tint-2) !important' },
  '.cm-content ::selection': { backgroundColor: 'var(--hair-2)' },
  '.cm-specialChar': { color: 'var(--ink-3)' },

  // Zmiany: dodany wiersz to bryła (tło i pełna kreska), usunięty to przerywana kreska i przygaszony tekst.
  // Motyw nie zna `&light` i `&dark`, a motyw bazowy @codemirror/merge ma przez nie mocniejsze selektory,
  // więc kolory, które on ustawia, przebijamy `!important`.
  '&.cm-merge-b .cm-changedLine, & .cm-inlineChangedLine': { backgroundColor: 'var(--tint) !important', boxShadow: 'inset 2px 0 0 var(--ink)' },
  '&.cm-merge-b .cm-changedText': { background: 'var(--tint-2) !important', borderRadius: '2px', boxShadow: '0 1.5px 0 var(--ink-2)' },
  '& .cm-deletedChunk': {
    padding: '0 0 0 4px',
    color: 'var(--ink-3)',
    backgroundColor: 'transparent !important',
    backgroundImage: 'linear-gradient(var(--ink-3) 50%, transparent 50%)',
    backgroundSize: '2px 6px',
    backgroundRepeat: 'repeat-y'
  },
  '& .cm-deletedChunk .cm-deletedText, &.cm-merge-b .cm-deletedText': { background: 'none !important', textDecoration: 'line-through', textDecorationColor: 'var(--ink-3)' },
  '& .cm-deletedChunk .cm-deletedLine': { paddingLeft: '4px' },
  '& .cm-changeGutter': { width: '3px', paddingLeft: '0' },
  '&.cm-merge-b .cm-changedLineGutter': { background: 'var(--ink) !important' },
  '&.cm-merge-b .cm-deletedLineGutter': { background: 'var(--ink-3) !important' },
  '& .cm-collapsedLines': {
    margin: '6px 32px 6px 0',
    padding: '4px 12px',
    color: 'var(--ink-3) !important',
    background: 'var(--tint) !important',
    borderRadius: '6px',
    fontSize: '11.5px',
    transition: 'color .18s ease'
  },
  '& .cm-collapsedLines:hover': { color: 'var(--ink) !important' },
  '& .cm-collapsedLines::before, & .cm-collapsedLines::after': { content: '""', margin: '0' }
})

const setTarget = StateEffect.define<LineRange | null>()

/** Wiersze z linku: tło i pełna kreska, a ich numery w rynnie są czarne. */
const target = StateField.define<LineRange | null>({
  create: () => null,
  update: (value, tr) => tr.effects.reduce((at, effect) => (effect.is(setTarget) ? effect.value : at), value)
})

const targetLines = EditorView.decorations.compute([target, 'doc'], (state): DecorationSet => {
  const range = state.field(target)
  const builder = new RangeSetBuilder<Decoration>()
  if (!range) return builder.finish()
  const last = Math.min(range.to, state.doc.lines)
  for (let n = Math.min(range.from, last); n <= last; n++) {
    const line = state.doc.line(n)
    builder.add(line.from, line.from, Decoration.line({ class: 'cm-target' }))
  }
  return builder.finish()
})

const marked = new (class extends GutterMarker {
  elementClass = 'cm-target'
})()

const targetGutter = gutterLineClass.compute([target, 'doc'], (state) => {
  const range = state.field(target)
  const builder = new RangeSetBuilder<GutterMarker>()
  if (!range) return builder.finish()
  const last = Math.min(range.to, state.doc.lines)
  for (let n = Math.min(range.from, last); n <= last; n++) builder.add(state.doc.line(n).from, state.doc.line(n).from, marked)
  return builder.finish()
})

function readData(): FileViewData {
  const node = document.getElementById('file-data')
  return JSON.parse(node?.textContent ?? '{}') as FileViewData
}

const data = readData()
const root = document.getElementById('file-view') as HTMLElement
let view: EditorView | null = null
let mode: FileMode = data.mode

function extensions(diff: boolean): Extension[] {
  const language = LANGUAGES[data.language]
  return [
    lineNumbers(),
    highlightSpecialChars(),
    EditorView.lineWrapping,
    EditorState.readOnly.of(true),
    // Bez edycji klawisze trafiają do skrótów apki, a zaznaczanie i kopiowanie działa jak w dokumencie.
    EditorView.editable.of(false),
    EditorState.tabSize.of(4),
    EditorState.phrases.of(data.phrases ?? {}),
    syntaxHighlighting(ink),
    sheet,
    target,
    targetLines,
    targetGutter,
    language ? language() : [],
    diff && data.original !== null
      ? unifiedMergeView({
          original: data.original,
          mergeControls: false,
          highlightChanges: true,
          syntaxHighlightDeletions: true,
          gutter: true,
          collapseUnchanged: { margin: 3, minSize: 6 }
        })
      : []
  ]
}

function build(next: FileMode): void {
  view?.destroy()
  mode = next === 'diff' && data.original !== null ? 'diff' : 'file'
  view = new EditorView({ parent: root, state: EditorState.create({ doc: data.text, extensions: extensions(mode === 'diff') }) })
  document.documentElement.dataset.mode = mode
}

function aim(lines: LineRange | null): void {
  if (!view) return
  view.dispatch({ effects: setTarget.of(lines) })
  if (!lines) return
  const line = view.state.doc.line(Math.min(lines.from, view.state.doc.lines))
  view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }) })
}

function follow(): void {
  const { mode: wanted, lines } = parseFileFragment(decodeURIComponent(location.hash.slice(1)))
  if (!view || (wanted && wanted !== mode)) build(wanted ?? mode)
  aim(lines ?? data.lines)
}

window.addEventListener('hashchange', follow)
follow()
