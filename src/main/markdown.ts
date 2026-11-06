import { Marked } from 'marked'

export interface RenderedMarkdown {
  title: string | null
  html: string
}

const FRONT_MATTER = /^---\r?\n([\w-]+:[\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const FRONT_MATTER_TITLE = /^title:[ \t]*(.+?)[ \t]*$/m

/** Ta sama postać identyfikatora co na GitHubie, bo tam agenci zwykle układają spisy treści. */
function slugOf(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

function frontMatterTitle(block: string | undefined): string | null {
  const value = block && FRONT_MATTER_TITLE.exec(block)?.[1]
  return value ? value.replace(/^(["'])(.*)\1$/, '$2') || null : null
}

/** Zamienia Markdown na treść strony. Tytuł pochodzi z nagłówka pliku albo z pierwszego `#`. */
export function renderMarkdown(source: string): RenderedMarkdown {
  const text = source.replace(/^﻿/, '')
  const frontMatter = FRONT_MATTER.exec(text)
  let title = frontMatterTitle(frontMatter?.[1])
  const used = new Map<string, number>()

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(token) {
        const plain = this.parser.parseInline(token.tokens, this.parser.textRenderer)
        if (token.depth === 1) title ??= plain.trim() || null
        const slug = slugOf(plain)
        const seen = used.get(slug) ?? 0
        used.set(slug, seen + 1)
        const id = seen === 0 ? slug : `${slug}-${seen}`
        return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`
      }
    }
  })

  const html = marked.parse(frontMatter ? text.slice(frontMatter[0].length) : text, { async: false })
  return { title, html }
}
