import { afterEach, describe, expect, it, vi } from 'vitest'
import { findRange, resolveAnchor } from '../src/preload/anchor'

/** Tyle strony wystarczy, żeby przejść po węzłach tekstu bez prawdziwej przeglądarki. */
function pageWith(...chunks: string[]): Element {
  const nodes = chunks.map((data) => ({ data, textContent: data, parentElement: null }))
  const element = { textContent: chunks.join('') } as unknown as Element
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 })
  vi.stubGlobal('document', {
    body: { querySelectorAll: () => [] },
    querySelector: () => element,
    createTreeWalker: () => {
      let index = -1
      return { nextNode: () => nodes[++index] ?? null }
    },
    createRange: () => ({
      setStart(node: { data: string }, offset: number) {
        Object.assign(this, { from: node.data.slice(offset) })
      },
      setEnd(node: { data: string }, offset: number) {
        Object.assign(this, { to: node.data.slice(0, offset) })
      }
    })
  })
  return element
}

// Tak zaznaczenie opisuje wzór `E = mc²`: każda część wzoru to osobny element `inline-block`.
const SELECTED = 'przez E=mc 2 , a pierwiastki'
const FORMULA = ['Masa wiąże się przez ', 'E', '=', 'mc', '2', ', a pierwiastki to dalej.']

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cytat przechodzący przez wzór', () => {
  it('znajduje zaznaczenie mimo spacji, których nie ma w tekście strony', () => {
    expect(findRange(pageWith(...FORMULA), SELECTED)).toMatchObject({
      from: 'przez ',
      to: ', a pierwiastki'
    })
  })

  it('zostawia uwagę przy miejscu, zamiast uznać ją za osieroconą', () => {
    const element = pageWith(...FORMULA)
    const anchor = { selector: 'p', offsetX: 0, offsetY: 0, quote: SELECTED, heading: null }

    expect(resolveAnchor(anchor)).toBe(element)
  })

  it('dalej nie znajduje cytatu, którego w tekście nie ma', () => {
    expect(findRange(pageWith(...FORMULA), 'całkiem inne zdanie')).toBeNull()
  })
})
