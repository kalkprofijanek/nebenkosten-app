import { describe, expect, it } from 'vitest'
import {
  assessMeterReadingSeries,
  type MeterReadingPoint,
} from '../src/heating/meter-reading-series'

/** Fiktive Reihe: Jahresanfang, Jahresende, Januar, März. */
function series(...values: number[]): MeterReadingPoint[] {
  const dates = ['2024-12-31', '2025-12-31', '2026-01-31', '2026-03-31']
  return values.map((value, index) => ({
    id: `r${index + 1}`,
    date: dates[index]!,
    value,
  }))
}

describe('assessMeterReadingSeries', () => {
  it('meldet nichts bei plausibler, steigender Reihe', () => {
    // Jahr 1.000 ‰, Januar 170 ‰, Feb+März 280 ‰ von 1.450 ‰ gesamt.
    expect(
      assessMeterReadingSeries(series(1_000, 2_000, 2_170, 2_450)),
    ).toEqual([])
  })

  it('erkennt eine weggelassene Nachkommastelle (Faktor 10)', () => {
    const [finding] = assessMeterReadingSeries(
      series(1_200.5, 13_050, 1_400.2, 1_450),
    )
    expect(finding).toMatchObject({
      kind: 'digit_drop',
      readingIds: ['r2'],
      alternativeValues: [1_305],
      consumption: 249.5,
      alternativeConsumption: 249.5,
    })
  })

  it('erkennt einen zu kleinen Wert (Ziffer verloren)', () => {
    const [finding] = assessMeterReadingSeries(series(1_200, 130.5, 1_400))
    expect(finding).toMatchObject({
      kind: 'digit_drop',
      readingIds: ['r2'],
      alternativeValues: [1_305],
    })
  })

  it('erkennt vertauschte Spalten', () => {
    const [finding] = assessMeterReadingSeries(series(100, 300, 200, 400))
    expect(finding).toMatchObject({
      kind: 'swapped_columns',
      readingIds: ['r2', 'r3'],
      alternativeValues: [200, 300],
    })
  })

  it('meldet eine rückläufige Reihe ohne Erklärung', () => {
    const [finding] = assessMeterReadingSeries(series(500, 480))
    expect(finding).toMatchObject({
      kind: 'decreasing',
      readingIds: ['r1', 'r2'],
      alternativeValues: null,
      consumption: -20,
    })
  })

  it('meldet stehende Zähler erst ab zwei Perioden ohne Änderung', () => {
    expect(assessMeterReadingSeries(series(47, 47))).toEqual([])
    const [finding] = assessMeterReadingSeries(series(0, 0, 0))
    expect(finding).toMatchObject({
      kind: 'stalled',
      readingIds: ['r1', 'r2', 'r3'],
    })
    expect(
      assessMeterReadingSeries(series(10, 10, 10), { stalledPeriods: 3 }),
    ).toEqual([])
  })

  it('prüft den Teilverbrauch gegen die Gradtagszahlen', () => {
    // Januar mit 50 % statt rund 17 % des Gesamtverbrauchs.
    const findings = assessMeterReadingSeries(series(0, 1_000, 2_000))
    expect(findings).toHaveLength(2)
    expect(findings[1]).toMatchObject({
      kind: 'implausible_share',
      readingIds: ['r2', 'r3'],
      actualShare: 0.5,
    })
    expect(findings[1]!.expectedShare).toBeCloseTo(170 / 1_170, 3)
    // Mit großzügiger Toleranz kein Befund.
    expect(
      assessMeterReadingSeries(series(0, 1_000, 2_000), {
        shareTolerance: 0.4,
      }),
    ).toEqual([])
  })

  it('verändert die Eingabe nicht', () => {
    const input = series(100, 300, 200, 400)
    const before = structuredClone(input)
    assessMeterReadingSeries(input)
    expect(input).toEqual(before)
  })
})
