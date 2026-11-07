import type { MarkedExtension, Token } from 'marked'

/** Zamienia kod TeX na HTML. Wynik ma być elementem liniowym, bo wzór może stać w środku akapitu. */
export type MathRenderer = (tex: string, display: boolean) => string

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Skan i agenci nie potrzebują składu, a kod wzoru da się przeszukać. */
export const plainMath: MathRenderer = (tex) => escapeHtml(tex)

/** Treść wzoru aż do znacznika. Pusty wiersz przerywa wzór, więc samotne `$$` nie połknie reszty pliku. */
const until = (close: string): string => String.raw`((?:(?!${close}|\n[ \t]*\n)[\s\S])+)${close}`

const DOLLARS = String.raw`\$\$`
const BLOCK_SOURCE = String.raw`^ {0,3}(?:${DOLLARS}${until(DOLLARS)}|\\\[${until(String.raw`\\\]`)})[ \t]*(?:\n|$)`
const BLOCK = new RegExp(BLOCK_SOURCE)
const BLOCK_ANYWHERE = new RegExp(BLOCK_SOURCE, 'm')
const BLANK_LINE = /\n[ \t]*\n/

/**
 * Pojedynczy `$` to w zwykłym tekście zwykle cena albo zmienna powłoki. Dlatego, jak w Pandocu,
 * wzór nie zaczyna się ani nie kończy spacją, a za `$` zamykającym nie stoi cyfra.
 */
const DOLLAR = /^\$(?![\s$])((?:\\[\s\S]|[^$\\])+?)(?<!\s)\$(?!\d)/
const LETTER_OR_DIGIT = /[\p{L}\p{N}]$/u

/** `\[` zostaje poza tą listą, bo w zwykłym Markdownie to częsty zapis nawiasu, np. `\[1\]`. */
const INLINE_FORMS = [
  { pattern: new RegExp(String.raw`^${DOLLARS}(?!\$)${until(DOLLARS)}`), display: true },
  { pattern: new RegExp(String.raw`^\\\(${until(String.raw`\\\)`)}`), display: false },
  { pattern: /^\$`([^`]+)`\$/, display: false },
  { pattern: DOLLAR, display: false }
]
const INLINE_START = /\$|\\\(/
const MATH_HINT = /\$|\\[([]|`math|~math/

/** Składnia wzorów: `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, `` $`…`$ `` i blok ` ```math `. */
export function mathExtension(source: string, render: MathRenderer): MarkedExtension {
  if (!MATH_HINT.test(source)) return {}

  const block = (tex: string): string => `<p>${render(tex.trim(), true)}</p>\n`

  return {
    extensions: [
      {
        name: 'mathBlock',
        level: 'block',
        // Marked pyta o to przy każdym akapicie, więc szukamy tylko w nim, a nie w reszcie pliku.
        start(src) {
          const end = src.search(BLANK_LINE)
          const at = (end < 0 ? src : src.slice(0, end)).search(BLOCK_ANYWHERE)
          return at < 0 ? undefined : at
        },
        tokenizer(src) {
          const match = BLOCK.exec(src)
          const tex = match?.[1] ?? match?.[2]
          return match && tex?.trim() ? { type: 'mathBlock', raw: match[0], tex } : undefined
        },
        renderer: (token) => block(token.tex as string)
      },
      {
        name: 'mathInline',
        level: 'inline',
        start(src) {
          const at = src.search(INLINE_START)
          return at < 0 ? undefined : at
        },
        tokenizer(src, tokens) {
          const before = (tokens.at(-1) as Token | undefined)?.raw ?? ''
          for (const { pattern, display } of INLINE_FORMS) {
            const match = pattern.exec(src)
            const tex = match?.[1]?.trim()
            if (!match || !tex || (pattern === DOLLAR && LETTER_OR_DIGIT.test(before))) continue
            return { type: 'mathInline', raw: match[0], tex, display }
          }
          return undefined
        },
        renderer: (token) => render(token.tex as string, token.display as boolean)
      }
    ],
    renderer: {
      code: (token) => (token.lang?.trim() === 'math' ? block(token.text) : false)
    }
  }
}
