import { describe, expect, it } from 'vitest'
import { analyzeHtml, classify } from '../src/main/classify'
import { normalizeText, queryTerms } from '../src/main/textNormalize'

const prose = 'Zdanie opisujące decyzję w dokumencie. '.repeat(30)
const documentHtml = `<!doctype html><html><head><title>Plan  prac</title><style>h1{color:red}</style></head>
<body><h1>Plan</h1><h2>Cel</h2><p>${prose}</p><h2>Ryzyka</h2><script>console.log('niewidoczne')</script></body></html>`

const context = { relPath: 'docs/plan.html', siblings: 3, format: 'html' } as const

describe('analyzeHtml', () => {
  it('wyciąga tytuł, nagłówki i tekst bez kodu', () => {
    const features = analyzeHtml(documentHtml)

    expect(features.title).toBe('Plan prac')
    expect(features.headings).toBe(3)
    expect(features.inlineCss).toBe(true)
    expect(features.text).toContain('Zdanie opisujące')
    expect(features.text).not.toContain('niewidoczne')
    expect(features.text).not.toContain('color:red')
  })

  it('rozpoznaje punkt wejścia aplikacji i lokalne skrypty', () => {
    const features = analyzeHtml('<div id="root"></div><script type="module" src="/src/main.tsx"></script>')

    expect(features.appMount).toBe(true)
    expect(features.localScripts).toBe(1)
  })

  it('nie traktuje skryptu z CDN jako lokalnego', () => {
    expect(analyzeHtml('<script src="https://cdn.jsdelivr.net/npm/d3"></script>').localScripts).toBe(0)
  })
})

describe('classify', () => {
  const run = (html: string, overrides = {}) =>
    classify(analyzeHtml(html), { ...context, ...overrides }).classification

  it('uznaje samodzielny plik z treścią za dokument', () => {
    expect(run(documentHtml)).toBe('document')
  })

  it('pomija wyniki testów, foldery tymczasowe i strony publiczne', () => {
    expect(run(documentHtml, { relPath: 'output/pytest-final/a.html' })).toBe('ignored')
    expect(run(documentHtml, { relPath: 'tmp/a.html' })).toBe('ignored')
    expect(run(documentHtml, { relPath: 'web/public/legal/a.html' })).toBe('ignored')
  })

  it('pomija masowy wynik generatora', () => {
    expect(run(documentHtml, { siblings: 47 })).toBe('ignored')
  })

  it('pomija aplikacje i strony bez treści', () => {
    expect(run('<div id="app"></div>')).toBe('ignored')
    expect(run('<style>a{}</style><h1>Mało</h1>')).toBe('ignored')
  })

  it('odkłada do przejrzenia przypadki pośrednie', () => {
    const dependent = documentHtml.replace('</body>', '<script src="chart.js"></script></body>')
    const flat = `<style>p{}</style><p>${prose}</p>`

    expect(run(dependent)).toBe('review')
    expect(run(flat)).toBe('review')
  })

  it('pomija zwykłą stronę bez własnego stylu', () => {
    expect(run(`<h1>Polityka</h1><p>${prose}</p>`)).toBe('ignored')
  })
})

describe('normalizeText', () => {
  it('składa polskie znaki, także ł', () => {
    expect(normalizeText('Łamigłówki Żółtej Gęśi')).toBe('lamiglowki zoltej gesi')
  })

  it('zachowuje długość tekstu', () => {
    const text = 'Łódź 🚀 ﬁ'
    expect(normalizeText(text)).toHaveLength(text.length)
  })
})

describe('queryTerms', () => {
  it('dzieli zapytanie i usuwa znaki specjalne', () => {
    expect(queryTerms('  Łączność, "AND" (test)* ')).toEqual(['lacznosc', 'and', 'test'])
  })
})
