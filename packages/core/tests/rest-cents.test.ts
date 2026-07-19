import { describe, expect, it } from 'vitest'
import { allocateLargestRemainder } from '../src/rest-cents'

describe('allocateLargestRemainder', () => {
  it('verteilt positive Restcents nach dem größten Nachkomma-Rest', () => {
    const result = allocateLargestRemainder([
      { id: 'c', exactCents: 1.2 },
      { id: 'b', exactCents: 1.4 },
      { id: 'a', exactCents: 1.4 },
    ])

    expect(result).toEqual([
      { id: 'c', cents: 1 },
      { id: 'b', cents: 1 },
      { id: 'a', cents: 2 },
    ])
    expect(result.reduce((sum, { cents }) => sum + cents, 0)).toBe(4)
  })

  it('löst gleiche Reste deterministisch über die ID auf', () => {
    const first = allocateLargestRemainder([
      { id: 'tenant-b', exactCents: 95_604.5 },
      { id: 'tenant-a', exactCents: 95_604.5 },
    ])
    const second = allocateLargestRemainder([
      { id: 'tenant-a', exactCents: 95_604.5 },
      { id: 'tenant-b', exactCents: 95_604.5 },
    ])

    expect(first).toEqual([
      { id: 'tenant-b', cents: 95_604 },
      { id: 'tenant-a', cents: 95_605 },
    ])
    expect(second).toEqual([
      { id: 'tenant-a', cents: 95_605 },
      { id: 'tenant-b', cents: 95_604 },
    ])
  })

  it('verwendet bei Gleichstand eine locale-freie Codepoint-Reihenfolge', () => {
    const result = allocateLargestRemainder([
      { id: 'tenant_a', exactCents: 1.5 },
      { id: 'tenant-A', exactCents: 1.5 },
    ])

    expect(result).toEqual([
      { id: 'tenant_a', cents: 1 },
      { id: 'tenant-A', cents: 2 },
    ])
  })

  it('verteilt auch negative Beträge summenerhaltend', () => {
    const result = allocateLargestRemainder([
      { id: 'a', exactCents: -1.6 },
      { id: 'b', exactCents: -1.6 },
    ])

    expect(result).toEqual([
      { id: 'a', cents: -1 },
      { id: 'b', cents: -2 },
    ])
    expect(result.reduce((sum, { cents }) => sum + cents, 0)).toBe(-3)
  })

  it('verändert die Eingabeliste nicht', () => {
    const input = Object.freeze([
      Object.freeze({ id: 'a', exactCents: 1.25 }),
      Object.freeze({ id: 'b', exactCents: 1.25 }),
    ])

    expect(() => allocateLargestRemainder(input)).not.toThrow()
    expect(input).toEqual([
      { id: 'a', exactCents: 1.25 },
      { id: 'b', exactCents: 1.25 },
    ])
  })

  it('weist nicht endliche Beträge zurück', () => {
    expect(() =>
      allocateLargestRemainder([{ id: 'a', exactCents: Number.NaN }]),
    ).toThrowError(/endliche Centbeträge/)
  })
})
