import katex from 'katex'
import katexSheet from 'katex/dist/katex.min.css?raw'
import { escapeHtml, type MathRenderer } from './markdownMath'

const FONT_FOLDER = '../../node_modules/katex/dist/fonts/'
const fonts = import.meta.glob<string>('../../node_modules/katex/dist/fonts/*.woff2', {
  eager: true,
  exhaustive: true,
  import: 'default',
  query: '?inline'
})

/** Fonty idą w treści strony, bo dokument czyta tylko pliki ze swojego katalogu. */
const inlinedSheet = katexSheet.replace(
  /src:url\(fonts\/([\w-]+\.woff2)\)[^;}]*/g,
  (_, file: string) => `src:url(${fonts[FONT_FOLDER + file]}) format("woff2")`
)

/* KaTeX ma własny rozmiar, dobrany pod krój szeryfowy, a przy Geist wzór wyszedłby za duży. */
export const MATH_SHEET = `${inlinedSheet}
.katex { font-size: 1.1em; }
.katex-display { padding: .1em 0; overflow: auto hidden; scrollbar-width: thin; }
.katex-error { font-family: 'Geist Mono', Consolas, monospace; font-size: .875em; text-decoration: underline dotted var(--hair-2); text-underline-offset: .18em; }
`

/**
 * Składa wzór bez MathML: jego ukryty tekst psułby cytaty uwag, które szukają zaznaczenia w tekście
 * strony. Czytnikowi ekranu wzór podaje swój kod. Błędny wzór zostaje widoczny jako kod.
 */
export const renderMath: MathRenderer = (tex, display) => {
  const html = katex.renderToString(tex, {
    displayMode: display,
    errorColor: 'var(--ink-2)',
    output: 'html',
    strict: false,
    throwOnError: false
  })
  return `<span role="math" aria-label="${escapeHtml(tex)}">${html}</span>`
}
