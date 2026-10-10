import { describe, expect, it } from 'vitest'
import type { HeatMeterReading } from '@nebenkosten/schema'
import { meterReadingConsumption, meterReadingTotal } from '../src'

/** Fiktive Zählerstände. */
const base: HeatMeterReading = {
  meterNumber: 'HKV-A',
  startValue: 100,
  startDate: '2025-01-01',
  endValue: 80,
  endDate: '2025-12-31',
}

describe('Verbrauch aus Zählerständen (ADR-0008)', () => {
  it('rechnet ohne Tausch Stand neu − Stand alt', () => {
    expect(meterReadingTotal({ ...base, endValue: 350.5 })).toBe(250.5)
  })

  it('summiert die Abschnitte bei Gerätetausch', () => {
    // Handrechnung: (400 − 100) + (80 − 0) = 380
    const result = meterReadingConsumption({
      ...base,
      replacements: [
        {
          date: '2025-06-15',
          removedEndValue: 400,
          installedMeterNumber: 'HKV-B',
          installedStartValue: 0,
        },
      ],
    })
    expect(result).toEqual({
      status: 'complete',
      total: 380,
      segments: [
        {
          meterNumber: 'HKV-A',
          from: '2025-01-01',
          to: '2025-06-15',
          startValue: 100,
          endValue: 400,
          consumption: 300,
        },
        {
          meterNumber: 'HKV-B',
          from: '2025-06-15',
          to: '2025-12-31',
          startValue: 0,
          endValue: 80,
          consumption: 80,
        },
      ],
    })
  })

  it('rechnet mehrere Tauschvorgänge mit Anfangsstand ungleich 0', () => {
    // (150 − 100) + (60 − 10) + (80 − 5) = 175
    expect(
      meterReadingTotal({
        ...base,
        replacements: [
          {
            date: '2025-03-01',
            removedEndValue: 150,
            installedStartValue: 10,
          },
          {
            date: '2025-09-01',
            removedEndValue: 60,
            installedMeterNumber: ' ',
            installedStartValue: 5,
          },
        ],
      }),
    ).toBe(175)
  })

  it('meldet fehlende Stände und unstimmige Tauschdaten', () => {
    expect(meterReadingConsumption(null)).toEqual({ status: 'incomplete' })
    expect(meterReadingConsumption({ ...base, endValue: null })).toEqual({
      status: 'incomplete',
    })
    const replacement = { removedEndValue: 1, installedStartValue: 0 }
    expect(
      meterReadingConsumption({
        ...base,
        replacements: [
          { ...replacement, date: '2025-09-01' },
          { ...replacement, date: '2025-03-01' },
        ],
      }),
    ).toEqual({ status: 'invalid', reason: 'replacement_order' })
    expect(
      meterReadingConsumption({
        ...base,
        replacements: [{ ...replacement, date: '2026-01-05' }],
      }),
    ).toEqual({ status: 'invalid', reason: 'replacement_outside' })
    expect(
      meterReadingConsumption({
        ...base,
        replacements: [{ ...replacement, date: '2024-12-31' }],
      }),
    ).toEqual({ status: 'invalid', reason: 'replacement_outside' })
    expect(
      meterReadingTotal({
        ...base,
        startDate: null,
        endDate: null,
        // ohne Ablesedaten keine Prüfung der Tauschtage: (100 − 100) + 80
        replacements: [
          { ...replacement, removedEndValue: 100, date: '2030-01-01' },
        ],
      }),
    ).toBe(80)
  })
})
