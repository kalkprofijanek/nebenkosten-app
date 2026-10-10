import { describe, expect, it } from 'vitest'
import {
  DEGREE_DAY_PERMILLE,
  SUMMER_DEGREE_DAY_PERMILLE,
  degreeDayPermille,
  splitByDegreeDays,
} from '../src'

const close = (value: number, expected: number) =>
  expect(value).toBeCloseTo(expected, 9)

describe('Gradtagszahlen nach VDI 2067', () => {
  it('ergibt für ein Jahr 1.000 ‰, auch im Schaltjahr', () => {
    expect(
      DEGREE_DAY_PERMILLE.reduce((sum, value) => sum + value, 0) +
        SUMMER_DEGREE_DAY_PERMILLE,
    ).toBe(1_000)
    close(degreeDayPermille('2025-01-01', '2025-12-31'), 1_000)
    close(degreeDayPermille('2024-01-01', '2024-12-31'), 1_000)
    close(degreeDayPermille('2024-07-01', '2025-06-30'), 1_000)
  })

  it('rechnet ganze Monate und den Sommerblock', () => {
    close(degreeDayPermille('2025-01-01', '2025-03-31'), 450)
    close(degreeDayPermille('2025-10-01', '2025-12-31'), 360)
    close(degreeDayPermille('2025-06-01', '2025-08-31'), 40)
    // Juli: 31 von 92 Sommertagen
    close(degreeDayPermille('2025-07-01', '2025-07-31'), (40 * 31) / 92)
  })

  it('verteilt innerhalb des Monats je Tag, Februar im Schaltjahr 29 Tage', () => {
    close(degreeDayPermille('2025-01-01', '2025-01-01'), 170 / 31)
    close(degreeDayPermille('2025-02-15', '2025-02-28'), (150 * 14) / 28)
    close(degreeDayPermille('2024-02-15', '2024-02-29'), (150 * 15) / 29)
  })

  it('lehnt ungültige Zeiträume ab', () => {
    expect(() => degreeDayPermille('2025-02-30', '2025-03-01')).toThrow(
      RangeError,
    )
    expect(() => degreeDayPermille('2025-03-01', '2025-02-01')).toThrow(
      RangeError,
    )
    expect(() => degreeDayPermille('01.01.2025', '2025-02-01')).toThrow(
      RangeError,
    )
  })
})

describe('Aufteilung nach Gradtagszahlen (§ 9b Abs. 2 HeizKV)', () => {
  it('teilt bei Auszug zum 31.03. im Verhältnis 450 : 550', () => {
    // Handrechnung: 1.000 Einheiten × 450 ‰ = 450; Rest 550
    expect(
      splitByDegreeDays(1_000, [
        { id: 'vor', from: '2025-01-01', to: '2025-03-31' },
        { id: 'nach', from: '2025-04-01', to: '2025-12-31' },
      ]),
    ).toEqual([
      { id: 'vor', permille: 450, value: 450 },
      { id: 'nach', permille: 550, value: 550 },
    ])
  })

  it('verteilt den Rundungsrest auf den größten Anteil', () => {
    const shares = splitByDegreeDays(100, [
      { id: 'a', from: '2025-01-01', to: '2025-01-10' },
      { id: 'b', from: '2025-01-11', to: '2025-07-15' },
      { id: 'c', from: '2025-07-16', to: '2025-12-31' },
    ])
    expect(shares.reduce((sum, { value }) => sum + value, 0)).toBeCloseTo(
      100,
      9,
    )
    for (const { value } of shares)
      expect(Math.round(value * 1_000)).toBe(value * 1_000)
  })

  it('lehnt negative Verbräuche und leere Listen ab', () => {
    expect(() =>
      splitByDegreeDays(-1, [
        { id: 'a', from: '2025-01-01', to: '2025-12-31' },
      ]),
    ).toThrow(RangeError)
    expect(() => splitByDegreeDays(1, [])).toThrow(RangeError)
  })
})
