import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '../src/main/classify'
import { extractLinks } from '../src/main/docLinks'
import { renderMarkdown } from '../src/main/markdown'
import { markdownPage } from '../src/main/markdownPage'
import { renderMath } from '../src/main/mathPage'

/** Oznacza wzory, więc test widzi, co składnia uznała za wzór i w jakim trybie. */
const marked = (source: string): string =>
  renderMarkdown(source, (tex, display) => `[${display ? 'blok' : 'wiersz'}:${tex}]`).html

describe('składnia wzorów', () => {
  it.each([
    ['$a^2$', '[wiersz:a^2]'],
    ['\\(a^2\\)', '[wiersz:a^2]'],
    ['$`a^2`$', '[wiersz:a^2]'],
    ['tekst $$a^2$$ tekst', '[blok:a^2]']
  ])('rozpoznaje %s w tekście', (source, expected) => {
    expect(marked(source)).toContain(expected)
  })

  it.each([
    ['$$\na^2\n$$'],
    ['$$a^2$$'],
    ['\\[\na^2\n\\]'],
    ['```math\na^2\n```'],
    ['  $$\n  a^2\n  $$']
  ])('rozpoznaje blok %j', (source) => {
    expect(marked(source)).toContain('<p>[blok:a^2]</p>')
  })

  it('przerywa akapit blokiem bez pustego wiersza', () => {
    expect(marked('Wzór:\n$$\na\n- b\n$$\nDalej.')).toBe('<p>Wzór:</p>\n<p>[blok:a\n- b]</p>\n<p>Dalej.</p>\n')
  })

  it('składa kilka wzorów w jednym wierszu osobno', () => {
    expect(marked('$$a$$ $$b$$')).toBe('<p>[blok:a] [blok:b]</p>\n')
    expect(marked('$a$ i $b$')).toBe('<p>[wiersz:a] i [wiersz:b]</p>\n')
  })

  it('nie czyta wnętrza wzoru jako Markdownu', () => {
    const html = marked('$a_1 * b_2 * c_3$ oraz $x<y$ i $\\$5$')

    expect(html).toContain('[wiersz:a_1 * b_2 * c_3]')
    expect(html).toContain('[wiersz:x<y]')
    expect(html).toContain('[wiersz:\\$5]')
    expect(html).not.toContain('<em>')
  })

  it('działa w nagłówku, liście, cytacie i tabeli', () => {
    expect(marked('## Wzór $a$')).toContain('[wiersz:a]</h2>')
    expect(marked('- $a$\n- b')).toContain('<li>[wiersz:a]</li>')
    expect(marked('> $$\n> a\n> $$')).toContain('[blok:a]')
    expect(marked('| A |\n|---|\n| $a$ |')).toContain('<td>[wiersz:a]</td>')
  })

  it.each([
    ['ceny', 'Koszt to $5 albo $10 miesięcznie.'],
    ['zakres cen', 'Od $50–$100 za sztukę.'],
    ['walutę po słowie', 'Mamy US$5 i CA$6 w kasie.'],
    ['zmienne powłoki', 'Ustaw $HOME i $PATH przed startem.'],
    ['przypis z nawiasem', '\\[1\\] Autor, tytuł.'],
    ['ucieczkę', 'To \\$a\\$ zostaje tekstem.'],
    ['samotne $$', '$$ jeden\n\ni $$ drugi'],
    ['kod w tekście', 'Zapis `$a$` zostaje kodem.'],
    ['blok kodu', '```\n$a$\n$$\nb\n$$\n```']
  ])('nie myli ze wzorem: %s', (_, source) => {
    expect(marked(source)).not.toMatch(/\[(?:wiersz|blok):/)
  })
})

describe('tytuł i tekst dokumentu z wzorem', () => {
  it('trzyma w tytule kod wzoru zamiast HTML', () => {
    const { title, html } = renderMarkdown('# Energia $E=mc^2$', renderMath)

    expect(title).toBe('Energia E=mc^2')
    expect(html).toContain('<h1 id="energia-emc2">')
    expect(html).toContain('class="katex"')
  })

  it('zostawia skanowi kod wzoru, bez KaTeX', () => {
    const { text } = analyzeDocument('markdown', 'Pole to $\\pi r^2$ oraz\n\n$$\n\\int_0^1 x\n$$\n')

    expect(text).toContain('\\pi r^2')
    expect(text).toContain('\\int_0^1 x')
  })

  it('nie gubi linków obok wzorów', () => {
    expect(extractLinks('markdown', '$a$ [cel](cel.md) $b$').map(({ href }) => href)).toEqual(['cel.md'])
  })
})

describe('skład wzorów', () => {
  it('składa wzór bez MathML i podaje jego kod czytnikowi ekranu', () => {
    const html = renderMath('a < b', false)

    expect(html).toContain('role="math"')
    expect(html).toContain('aria-label="a &lt; b"')
    expect(html).not.toContain('<math')
  })

  it('zostawia błędny wzór widoczny jako kod', () => {
    const html = renderMath('\\frac{a', true)

    expect(html).toContain('class="katex-error"')
    expect(html).toContain('\\frac{a')
  })

  it('nie wpuszcza linków ani HTML przez polecenia TeX', () => {
    const html = renderMath('\\href{javascript:alert(1)}{x} \\htmlId{a}{b}', false)

    expect(html).not.toContain('<a ')
    expect(html).not.toContain('id="a"')
  })
})

describe('markdownPage z wzorami', () => {
  it('osadza czcionki tylko na stronie z wzorem', () => {
    expect(markdownPage('# Plan\n\ntekst', 'plan.md')).not.toContain('KaTeX_Main')

    const page = markdownPage('# Plan\n\n$a^2$', 'plan.md')
    expect(page).toContain('KaTeX_Main')
    expect(page).toContain('url(data:font/woff2;base64,')
    expect(page).not.toContain('url(fonts/')
    expect(page).not.toContain('url(undefined)')
  })

  it('dodaje style także wtedy, gdy jedyny wzór jest błędny', () => {
    expect(markdownPage('$$\\frac{a$$', 'plan.md')).toContain('.katex-error')
  })
})
