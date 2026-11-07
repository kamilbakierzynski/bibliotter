import { describe, expect, it } from 'vitest'
import { documentReference, referenceId } from '../src/shared/reference'

describe('documentReference', () => {
  it('skraca id i usuwa znaki psujące zapis', () => {
    expect(documentReference({ id: 'd937246bc59d34185d', title: 'Plan [v2] (draft)' })).toBe(
      '[Plan v2 draft](bibliotter:d937246bc5)'
    )
  })

  it('dokument bez tytułu też ma odnośnik', () => {
    expect(documentReference({ id: 'd937246bc59d', title: null })).toBe('[dokument](bibliotter:d937246bc5)')
    expect(documentReference({ id: 'd937246bc59d', title: '()' })).toBe('[dokument](bibliotter:d937246bc5)')
  })

  it('czyta odnośniki pod nową i starą nazwą', () => {
    expect(referenceId('bibliotter:d937246bc5')).toBe('d937246bc5')
    expect(referenceId('htmldocs:d937246bc5')).toBe('d937246bc5')
    expect(referenceId('d937246bc5')).toBe('d937246bc5')
  })
})
