import { Marked, type Token, type Tokens } from 'marked'
import { WIKI_PREFIX } from '../shared/links'
import { codeKey } from './codePaths'
import { escapeHtml, type MathRenderer, mathExtension, plainMath } from './markdownMath'

export interface RenderedMarkdown {
  title: string | null
  html: string
}

const FRONT_MATTER = /^---\r?\n([\w-]+:[\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const FRONT_MATTER_TITLE = /^title:[ \t]*(.+?)[ \t]*$/m
const WIKILINK = /^!?\[\[([^[\]\n]+)\]\]/

/** Ta sama postać identyfikatora co na GitHubie, bo tam agenci zwykle układają spisy treści. */
export function slugOf(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

/**
 * Link Obsidiana staje się zwykłym tokenem linku, więc tytuły, identyfikatory nagłówków
 * i tekst do wyszukiwania działają jak dla `[a](b)`. Osadzenie `![[x]]` też jest linkiem,
 * bo obrazek leży zwykle poza katalogiem dokumentu, a tam dokument nie sięga.
 */
function wikilinkToken(raw: string, inner: string): Tokens.Link | undefined {
  const embed = raw.startsWith('!')
  const pipe = inner.indexOf('|')
  const target = (pipe < 0 ? inner : inner.slice(0, pipe)).trim()
  const alias = pipe < 0 || embed ? '' : inner.slice(pipe + 1).trim()
  const hash = target.indexOf('#')
  const file = (hash < 0 ? target : target.slice(0, hash)).trim()
  const heading = hash < 0 ? '' : target.slice(hash + 1).trim()
  if (!file && !heading) return undefined
  const text = alias || (file && heading ? `${file} › ${heading}` : file || heading)
  const href = file ? `${WIKI_PREFIX}${target}` : `#${slugOf(heading)}`
  return { type: 'link', raw, href, title: null, text, tokens: [{ type: 'text', raw: text, text }] }
}

const wikilinks = {
  name: 'wikilink',
  level: 'inline' as const,
  start(source: string): number | undefined {
    const at = source.search(/!?\[\[/)
    return at < 0 ? undefined : at
  },
  tokenizer(source: string): Tokens.Link | undefined {
    const match = WIKILINK.exec(source)
    return match ? wikilinkToken(match[0], match[1] as string) : undefined
  }
}

function frontMatterTitle(block: string | undefined): string | null {
  const value = block && FRONT_MATTER_TITLE.exec(block)?.[1]
  return value ? value.replace(/^(["'])(.*)\1$/, '$2') || null : null
}

/** Kod wewnątrz linku zostaje kodem, bo link w linku przeglądarka i tak rozbiłaby na dwa. */
function codeInLinks(token: Token, inside: WeakSet<Token>): void {
  if (token.type !== 'link' || !('tokens' in token) || !token.tokens) return
  const mark = (children: Token[]): void => {
    for (const child of children) {
      inside.add(child)
      if ('tokens' in child && child.tokens) mark(child.tokens)
    }
  }
  mark(token.tokens)
}

/**
 * Zamienia Markdown na treść strony. Tytuł pochodzi z nagłówka pliku albo z pierwszego `#`.
 * `codeLinks` to kod, który wskazuje istniejący plik, i adres linku do niego (zob. `codePaths.ts`).
 */
export function renderMarkdown(
  source: string,
  renderMath: MathRenderer = plainMath,
  codeLinks: ReadonlyMap<string, string> = new Map()
): RenderedMarkdown {
  const text = source.replace(/^﻿/, '')
  const frontMatter = FRONT_MATTER.exec(text)
  let title = frontMatterTitle(frontMatter?.[1])
  const used = new Map<string, number>()
  // Tytuł i identyfikator nagłówka to tekst, a nie HTML, więc wzór zostaje w nich swoim kodem.
  let inPlainText = false
  const linked = new WeakSet<Token>()

  const marked = new Marked({
    gfm: true,
    extensions: [wikilinks],
    walkTokens: codeLinks.size > 0 ? (token) => codeInLinks(token, linked) : undefined,
    renderer: {
      codespan(token) {
        const href = linked.has(token) ? undefined : codeLinks.get(codeKey(token.text))
        return href === undefined ? false : `<a class="code-path" href="${escapeHtml(href)}"><code>${escapeHtml(token.text)}</code></a>`
      },
      heading(token) {
        inPlainText = true
        const plain = this.parser.parseInline(token.tokens, this.parser.textRenderer)
        inPlainText = false
        if (token.depth === 1) title ??= plain.trim() || null
        const slug = slugOf(plain)
        const seen = used.get(slug) ?? 0
        used.set(slug, seen + 1)
        const id = seen === 0 ? slug : `${slug}-${seen}`
        return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`
      }
    }
  }, mathExtension(text, (tex, display) => (inPlainText ? tex : renderMath(tex, display))))

  const html = marked.parse(frontMatter ? text.slice(frontMatter[0].length) : text, { async: false })
  return { title, html }
}
