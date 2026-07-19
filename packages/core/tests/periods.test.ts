import { describe, expect, it } from 'vitest'
import {
  calculateMonthlyOccupancyFactor,
  calculateOccupancyDays,
  calculatePeriodDays,
  daysInYear,
} from '../src/periods'

describe('Abrechnungszeiträume', () => {
  it('zählt Start- und Endtag einschließlich', () => {
    expect(calculatePeriodDays('2025-01-01', '2025-12-31')).toBe(365)
    expect(calculatePeriodDays('2024-01-01', '2024-12-31')).toBe(366)
  })

  it('erkennt Schaltjahre nach dem gregorianischen Kalender', () => {
    expect(daysInYear(2000)).toBe(366)
    expect(daysInYear(2100)).toBe(365)
  })

  it('schneidet einen Nutzungszeitraum an der Abrechnungsperiode ab', () => {
    expect(
      calculateOccupancyDays(
        '2025-01-01',
        '2025-12-31',
        '2024-12-15',
        '2025-06-30',
      ),
    ).toBe(181)
  })

  it('liefert null Tage für einen vollständig außerhalb liegenden Zeitraum', () => {
    expect(
      calculateOccupancyDays(
        '2025-01-01',
        '2025-12-31',
        '2024-01-01',
        '2024-12-31',
      ),
    ).toBe(0)
  })

  it('behandelt fehlende Nutzungsgrenzen als gesamte Abrechnungsperiode', () => {
    expect(
      calculateOccupancyDays('2025-01-01', '2025-12-31', undefined, undefined),
    ).toBe(365)
  })

  it('berechnet monatliche Vorauszahlungen für Teilmonate wie die Legacy-App', () => {
    expect(
      calculateMonthlyOccupancyFactor(
        '2025-01-01',
        '2025-12-31',
        '2025-01-16',
        '2025-02-14',
      ),
    ).toBeCloseTo(16 / 31 + 14 / 28, 12)
  })

  it('berechnet Monatsanteile UTC- und DST-unabhängig über Monatsgrenzen', () => {
    expect(
      calculateMonthlyOccupancyFactor(
        '2024-01-01',
        '2024-12-31',
        '2024-02-29',
        '2024-03-31',
      ),
    ).toBeCloseTo(1 / 29 + 1, 12)
  })

  it('weist ungültige Abrechnungszeiträume verständlich zurück', () => {
    expect(() => calculatePeriodDays('2025-12-31', '2025-01-01')).toThrowError(
      /Abrechnungszeitraum/,
    )
  })

  it.each(['2025-02-29', '01.01.2025', ''])(
    'weist das ungültige ISO-Datum %j zurück',
    (date) => {
      expect(() => calculatePeriodDays(date, '2025-12-31')).toThrowError(
        /ISO-Datum/,
      )
    },
  )
})
