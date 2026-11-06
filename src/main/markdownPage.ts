import geistLatinExt from '../../node_modules/@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?inline'
import geistLatin from '../../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?inline'
import monoLatinExt from '../../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-ext-wght-normal.woff2?inline'
import monoLatin from '../../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?inline'
import { renderMarkdown } from './markdown'

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'

const fontFace = (family: string, url: string, range: string): string =>
  `@font-face { font-family: '${family}'; font-weight: 100 900; font-display: block; src: url(${url}) format('woff2'); unicode-range: ${range}; }`

/** Fonty idą w treści strony, bo dokument czyta tylko pliki ze swojego katalogu. */
const FONTS = [
  fontFace('Geist', geistLatin, LATIN),
  fontFace('Geist', geistLatinExt, LATIN_EXT),
  fontFace('Geist Mono', monoLatin, LATIN),
  fontFace('Geist Mono', monoLatinExt, LATIN_EXT)
].join('\n')

/* Arkusz w języku apki: czarno-biały, bez Sygnału, z Geist Mono przy kodzie. */
const SHEET = `
:root { color-scheme: light; --ink: #17181a; --ink-2: #55585e; --hair: #e4e5e8; --tint: #f5f5f6; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; color: var(--ink); background: #fff; font: 400 15.5px/1.68 Geist, 'Segoe UI', system-ui, sans-serif; overflow-wrap: break-word; }
main { max-width: 760px; margin: 0 auto; padding: 64px clamp(24px, 7vw, 72px) 96px; }
main > :first-child { margin-top: 0; }
main > :last-child { margin-bottom: 0; }
h1, h2, h3, h4, h5, h6 { margin: 2em 0 .6em; font-weight: 600; line-height: 1.22; letter-spacing: -.012em; scroll-margin-top: 24px; }
h1 { margin-bottom: .8em; font-size: 32px; letter-spacing: -.022em; }
h2 { padding-bottom: .35em; font-size: 22px; border-bottom: 1px solid var(--hair); }
h3 { font-size: 18px; }
h4 { font-size: 15.5px; }
h5, h6 { color: var(--ink-2); font-size: 14px; }
p, ul, ol, dl, table, pre, blockquote, details { margin: 0 0 1.1em; }
ul, ol { padding-left: 1.5em; }
li { margin: .25em 0; }
li > ul, li > ol, li > p { margin-bottom: .25em; }
li:has(> input[type='checkbox']) { list-style: none; margin-left: -1.4em; }
input[type='checkbox'] { margin: 0 .55em 0 0; accent-color: var(--ink); vertical-align: -1px; }
a { color: inherit; text-decoration: underline; text-decoration-color: #b4b6bb; text-underline-offset: .18em; }
a:hover { text-decoration-color: currentColor; }
strong { font-weight: 600; }
hr { height: 1px; margin: 2.4em 0; border: 0; background: var(--hair); }
img, video { display: block; max-width: 100%; height: auto; border-radius: 8px; }
blockquote { padding-left: 1.1em; color: var(--ink-2); border-left: 2px solid var(--hair); }
code, kbd, samp, pre { font-family: 'Geist Mono', Consolas, monospace; font-size: .875em; }
:not(pre) > code { padding: .14em .36em; background: var(--tint); border-radius: 5px; }
kbd { padding: .1em .4em; background: var(--tint); border-radius: 5px; box-shadow: inset 0 0 0 1px var(--hair); }
pre { padding: 16px 18px; overflow-x: auto; line-height: 1.55; background: var(--tint); border-radius: 10px; }
pre code { font-size: 13px; }
table { display: block; width: fit-content; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 14px 8px 0; text-align: left; vertical-align: top; border-bottom: 1px solid var(--hair); }
th { font-weight: 600; border-bottom-color: #c9cbd0; }
th:last-child, td:last-child { padding-right: 0; }
`

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Składa z Markdownu kompletną stronę arkusza. */
export function markdownPage(source: string, fallbackTitle: string): string {
  const { title, html } = renderMarkdown(source)
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title ?? fallbackTitle)}</title>
<style>${FONTS}${SHEET}</style>
</head>
<body><main>${html}</main></body>
</html>`
}
