import { describe, expect, it } from 'vitest'

import { parseEuroCents, parseOptionalNumber } from './form-parsers'

describe('form parsers', () => {
  it.each([
    ['1.234,56', 123456],
    ['12,5', 1250],
    ['0,01', 1],
    ['-0,01', -1],
  ])('parses German euro input %s', (input, expected) => {
    expect(parseEuroCents(input)).toBe(expected)
  })

  it.each(['', 'abc', '1,234', '1.2.3,00'])(
    'rejects invalid euro input %s',
    (input) => expect(() => parseEuroCents(input)).toThrow(),
  )

  it('parses optional finite decimal numbers', () => {
    expect(parseOptionalNumber('')).toBeNull()
    expect(parseOptionalNumber('12,5')).toBe(12.5)
    expect(() => parseOptionalNumber('NaN')).toThrow()
  })
})
