import { describe, expect, it } from 'vitest'
import { euroToCents, euroToCentsLostPrecision } from '../src'

describe('euroToCents (verbindliche Migrationsregel euro_to_cents)', () => {
  it('konvertiert exakte Beträge verlustfrei', () => {
    expect(euroToCents(0)).toBe(0)
    expect(euroToCents(1)).toBe(100)
    expect(euroToCents(26.32)).toBe(2632)
    expect(euroToCents(2632)).toBe(263200)
    expect(euroToCents(-26.32)).toBe(-2632)
  })

  it('rundet halbe Cent kaufmännisch weg von Null — auch negativ', () => {
    expect(euroToCents(0.005)).toBe(1)
    expect(euroToCents(-0.005)).toBe(-1)
    expect(euroToCents(1.125)).toBe(113)
    expect(euroToCents(-1.125)).toBe(-113)
  })

  it('ist robust gegen binäre Fließkomma-Artefakte', () => {
    // 1.005 * 100 === 100.49999999999999 — naives Math.round ergäbe 100.
    expect(euroToCents(1.005)).toBe(101)
    expect(euroToCents(-1.005)).toBe(-101)
    // 0.1 + 0.2 === 0.30000000000000004
    expect(euroToCents(0.1 + 0.2)).toBe(30)
  })

  it('liefert niemals -0', () => {
    expect(Object.is(euroToCents(-0), 0)).toBe(true)
    expect(Object.is(euroToCents(-0.001), 0)).toBe(true)
  })

  it('lehnt nicht-endliche Beträge ab', () => {
    expect(() => euroToCents(Number.NaN)).toThrowError(RangeError)
    expect(() => euroToCents(Number.POSITIVE_INFINITY)).toThrowError(RangeError)
  })

  it('erkennt echten Präzisionsverlust, aber keine gewollte Rundung', () => {
    // exakte Beträge und Float-Artefakte: kein Verlust
    expect(euroToCentsLostPrecision(26.32)).toBe(false)
    expect(euroToCentsLostPrecision(1.005)).toBe(false)
    expect(euroToCentsLostPrecision(-1.005)).toBe(false)
    // Sub-Cent-Anteile jenseits von ,5: echter Verlust → warning
    expect(euroToCentsLostPrecision(0.0012)).toBe(true)
    expect(euroToCentsLostPrecision(1.0301)).toBe(true)
  })
})
