import { describe, expect, it } from 'vitest'
import { analyzeDocument, classify } from '../src/main/classify'
import { MARKDOWN_CSP } from '../src/main/docPolicy'
import { renderMarkdown } from '../src/main/markdown'

const prose = 'Zdanie opisujące decyzję w dokumencie. '.repeat(30)
const planMd = `# Plan prac\n\n## Cel\n\n${prose}\n\n## Ryzyka\n\n${prose}\n`
const context = { relPath: 'docs/plan.md', siblings: 3, format: 'markdown' } as const

describe('renderMarkdown', () => {
  it('bierze tytuł z pierwszego nagłówka bez składni', () => {
    expect(renderMarkdown('wstęp\n\n# Plan **Q3** `v2`\n\n# Drugi').title).toBe('Plan Q3 v2')
  })

  it('woli tytuł z nagłówka pliku i nie pokazuje go w treści', () => {
    const { title, html } = renderMarkdown('---\ntitle: "Raport: Q3"\nautor: agent\n---\n\n# Inny\n')

    expect(title).toBe('Raport: Q3')
    expect(html).not.toContain('autor')
    expect(html).toContain('Inny')
  })

  it('nie myli linii poziomej z nagłówkiem pliku', () => {
    const { html } = renderMarkdown('---\n\ntekst\n\n---\n')

    expect(html).toContain('tekst')
    expect(html).toContain('<hr>')
  })

  it('radzi sobie z BOM i końcami linii z Windows', () => {
    expect(renderMarkdown('\uFEFF---\r\ntitle: Plan\r\n---\r\n\r\n# Tekst\r\n').title).toBe('Plan')
  })

  it('nadaje nagłówkom identyfikatory jak GitHub, także przy powtórkach', () => {
    const { html } = renderMarkdown('## Żółta Gęś!\n\n## Żółta Gęś!')

    expect(html).toContain('<h2 id="żółta-gęś">')
    expect(html).toContain('<h2 id="żółta-gęś-1">')
  })

  describe('linki Obsidiana', () => {
    it('zamienia nazwę w link, także z aliasem i nagłówkiem', () => {
      expect(renderMarkdown('[[force-atlas-2]]').html).toContain('<a href="wiki:force-atlas-2">force-atlas-2</a>')
      expect(renderMarkdown('[[cel|inny tekst]]').html).toContain('<a href="wiki:cel">inny tekst</a>')
      expect(renderMarkdown('[[cel#Sekcja dalej]]').html).toContain('<a href="wiki:cel#Sekcja%20dalej">cel › Sekcja dalej</a>')
    })

    it('zamienia nagłówek w tym samym pliku w kotwicę', () => {
      expect(renderMarkdown('[[#Cel prac]]').html).toContain('<a href="#cel-prac">Cel prac</a>')
    })

    it('rozumie link w całym zdaniu, na liście i w tabeli', () => {
      const { html } = renderMarkdown('- [[a]] — opis [[b]]\n\n| x |\n|---|\n| [[c\\|d]] |\n')

      expect(html).toContain('href="wiki:a"')
      expect(html).toContain('href="wiki:b"')
      expect(html).toContain('<a href="wiki:c">d</a>')
    })

    it('zostawia kod w spokoju', () => {
      const { html } = renderMarkdown('`[[a]]`\n\n```\n[[b]]\n```\n')

      expect(html).not.toContain('<a ')
    })

    it('pokazuje osadzenie jako link, bez szerokości z aliasu', () => {
      expect(renderMarkdown('![[wykres.png|300]]').html).toContain('<a href="wiki:wykres.png">wykres.png</a>')
    })

    it('nie psuje tytułu ani identyfikatora nagłówka', () => {
      const { title, html } = renderMarkdown('# Plan [[cel|celu]]\n')

      expect(title).toBe('Plan celu')
      expect(html).toContain('<h1 id="plan-celu">')
    })

    it('ignoruje puste nawiasy', () => {
      expect(renderMarkdown('[[ ]] i [[]]').html).not.toContain('<a ')
    })

    it('nie wpuszcza HTML przez alias', () => {
      const { html } = renderMarkdown('[[cel|<img src=x onerror=alert(1)>]]')

      expect(html).not.toContain('<img')
    })
  })

  it('obsługuje tabele i listy zadań', () => {
    const { html } = renderMarkdown('| A |\n|---|\n| 1 |\n\n- [x] gotowe\n')

    expect(html).toContain('<table>')
    expect(html).toContain('type="checkbox"')
  })
})

describe('analyzeDocument', () => {
  it('liczy nagłówki i tekst bez składni Markdownu', () => {
    const features = analyzeDocument('markdown', planMd)

    expect(features.title).toBe('Plan prac')
    expect(features.headings).toBe(3)
    expect(features.text).toContain('Zdanie opisujące')
    expect(features.text).not.toContain('##')
  })
})

describe('classify dla Markdownu', () => {
  const run = (source: string, overrides = {}) =>
    classify(analyzeDocument('markdown', source), { ...context, ...overrides }).classification

  it('uznaje plik z treścią i strukturą za dokument', () => {
    expect(run(planMd)).toBe('document')
  })

  it('pomija pliki opisujące repozytorium', () => {
    for (const relPath of ['README.md', 'docs/readme.pl.md', 'CHANGELOG.md', 'CLAUDE.md', 'skills/a/SKILL.md']) {
      expect(run(planMd, { relPath })).toBe('ignored')
    }
  })

  it('pomija krótkie notatki i foldery bez dokumentów', () => {
    expect(run('# Mało\n\ntekst')).toBe('ignored')
    expect(run(planMd, { relPath: 'tmp/plan.md' })).toBe('ignored')
  })

  it('nie traktuje dużego folderu notatek jak wyniku generatora', () => {
    expect(run(planMd, { siblings: 200 })).toBe('document')
  })

  it('odkłada do przejrzenia treść bez struktury', () => {
    expect(run(prose)).toBe('review')
  })
})

describe('MARKDOWN_CSP', () => {
  it('nie wpuszcza skryptów ani ramek', () => {
    expect(MARKDOWN_CSP).toContain("default-src 'none'")
    expect(MARKDOWN_CSP).not.toContain('script-src')
    expect(MARKDOWN_CSP).not.toContain('frame-src')
  })
})
