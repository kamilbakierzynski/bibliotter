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
