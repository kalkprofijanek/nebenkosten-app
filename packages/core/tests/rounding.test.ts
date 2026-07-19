import { describe, expect, it } from 'vitest'
import { roundCentsHalfAwayFromZero } from '../src/rounding'

describe('Cent-Rundung', () => {
  it.each([
    [100.49, 100],
    [100.5, 101],
    [-100.49, -100],
    [-100.5, -101],
  ])('rundet %s auf %s Cent', (value, expected) => {
    expect(roundCentsHalfAwayFromZero(value)).toBe(expected)
  })

  it('weist nicht-endliche Ergebnisse zurück', () => {
    expect(() => roundCentsHalfAwayFromZero(Number.NaN)).toThrowError(
      /endliche Zahl/,
    )
  })

  it('bewahrt bereits ganze Cent und normalisiert negative Null', () => {
    expect(roundCentsHalfAwayFromZero(123)).toBe(123)
    expect(Object.is(roundCentsHalfAwayFromZero(-0), -0)).toBe(false)
  })

  it('weist Ergebnisse außerhalb des sicheren Integerbereichs zurück', () => {
    expect(() =>
      roundCentsHalfAwayFromZero(Number.MAX_SAFE_INTEGER + 1),
    ).toThrowError(/sicheren Integerbereich/)
  })
})
