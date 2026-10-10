import { describe, expect, it } from 'vitest'
import type { AppDataFile, HeatMeterReading } from '@nebenkosten/schema'
import { buildTenantStatement } from '../src/tenant-statement'
import {
  circuitMeterReadingTables,
  formatMeterValue,
  hasReplacement,
  readingCells,
  readingRows,
  REPLACEMENT_INVALID_HINT,
} from '../src/meter-readings'
import {
  buildFixtureAppData,
  buildFixtureCalculation,
  buildFixtureTenantStatementContext,
} from './fixture'

const text = (value: unknown) =>
  JSON.stringify(value).replace(
    new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'gu'),
    ' ',
  )

function firstTenant(appData: AppDataFile) {
  return appData.billingData.occupancyPeriods.find(
    ({ kind }) => kind === 'tenant',
  )!
}

/** Fiktiver Tausch zur Jahresmitte; Gesamtverbrauch = `units`. */
function replacedReading(units: number): HeatMeterReading {
  const first = Math.round(units / 2)
  return {
    meterNumber: 'TEST-ALT',
    startValue: 1000,
    startDate: '2024-01-01',
    endValue: units - first,
    endDate: '2024-12-31',
    replacements: [
      {
        date: '2024-06-30',
        removedEndValue: 1000 + first,
        installedMeterNumber: 'TEST-NEU',
        installedStartValue: 0,
      },
    ],
  }
}

describe('Zählertausch – Zeilen je Abschnitt (ADR-0008)', () => {
  it('bleibt ohne Tausch bei genau einer Zeile', () => {
    const reading: HeatMeterReading = {
      meterNumber: 'TEST-1',
      startValue: 1,
      endValue: 3,
      replacements: [],
    }
    expect(hasReplacement(reading)).toBe(false)
    expect(readingRows(reading, 'Einheiten')).toEqual([
      readingCells(reading, 'Einheiten'),
    ])
  })

  it('zeigt je Abschnitt Nummer, Stände mit Datum, Verbrauch und die Summe', () => {
    const rows = readingRows(
      {
        meterNumber: 'TEST-ALT',
        startValue: 100,
        startDate: '2024-01-01',
        endValue: 30.5,
        endDate: '2024-12-31',
        replacements: [
          {
            date: '2024-05-15',
            removedEndValue: 220,
            installedMeterNumber: null,
            installedStartValue: 0,
          },
        ],
      },
      'kWh',
    )
    expect(text(rows)).toBe(
      text([
        [
          'TEST-ALT',
          { text: '100 (01.01.2024)' },
          { text: '220 (15.05.2024)' },
          { text: '120 kWh', alignment: 'right', noWrap: true },
        ],
        [
          '–',
          { text: '0 (15.05.2024)' },
          { text: '30,5 (31.12.2024)' },
          { text: '30,5 kWh', alignment: 'right', noWrap: true },
        ],
        [
          { text: 'Verbrauch gesamt', colSpan: 3, bold: true },
          {},
          {},
          { text: '150,5 kWh', alignment: 'right', noWrap: true, bold: true },
        ],
      ]),
    )
  })

  it('zeigt bei widersprüchlichen Tauschangaben einen Hinweis statt Zahl', () => {
    const rows = readingRows(
      {
        startValue: 1,
        startDate: '2024-01-01',
        endValue: 2,
        endDate: '2024-12-31',
        replacements: [
          {
            date: '2025-02-01',
            removedEndValue: 5,
            installedStartValue: 0,
          },
        ],
      },
      'Einheiten',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]![3]).toEqual({
      text: REPLACEMENT_INVALID_HINT,
      alignment: 'right',
      noWrap: true,
    })
    const incomplete = readingRows(
      {
        startValue: 1,
        replacements: [
          { date: '2024-03-01', removedEndValue: 2, installedStartValue: 0 },
        ],
      },
      'Einheiten',
    )
    expect(incomplete).toHaveLength(1)
    expect(incomplete[0]![3]).toMatchObject({ text: '–' })
  })
})

describe('Einzelabrechnung – Ihre Verbrauchserfassung mit Zählertausch', () => {
  it('druckt beide Zähler, die Summenzeile und die Summenrechnung', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const occupancy = firstTenant(appData)
    const units = occupancy.consumptionUnits?.value ?? 0
    occupancy.heatMeterReading = replacedReading(units)
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
    )
    const first = Math.round(units / 2)
    for (const expected of [
      'TEST-ALT',
      'TEST-NEU',
      '1.000 (01.01.2024)',
      `${formatMeterValue(1000 + first)} (30.06.2024)`,
      '0 (30.06.2024)',
      'Verbrauch gesamt',
      `Verbrauch gesamt (Zählertausch) = ${formatMeterValue(first)} + ${formatMeterValue(units - first)} = ${formatMeterValue(units)}`,
    ])
      expect(serialized).toContain(expected)
    expect(serialized).not.toContain('Verbrauch = Stand neu − Stand alt')
    expect(serialized).not.toContain('Abgerechnet werden')
  })
})

describe('Gesamtabrechnung – Zählertausch je Heizkreis', () => {
  it('listet die Abschnitte und die Summenzeile mit Verbrauchseinheiten', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const calculation = buildFixtureCalculation(appData)
    const occupancy = firstTenant(appData)
    const units = occupancy.consumptionUnits?.value ?? 0
    occupancy.heatMeterReading = replacedReading(units)
    const serialized = text(
      circuitMeterReadingTables(
        appData,
        calculation,
        appData.billingData.occupancyPeriods,
        appData.masterData.units,
      ),
    )
    expect(serialized).toContain('TEST-ALT')
    expect(serialized).toContain('TEST-NEU')
    expect(serialized).toContain(
      `{"text":"Verbrauch gesamt","colSpan":3,"bold":true},{},{},{"text":"${formatMeterValue(units)}","alignment":"right","noWrap":true,"bold":true}`,
    )
    expect(serialized).not.toContain(' !"')
  })

  it('weist widersprüchliche Tauschangaben als Hinweis aus', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const calculation = buildFixtureCalculation(appData)
    firstTenant(appData).heatMeterReading = {
      meterNumber: 'TEST-1',
      startValue: 0,
      startDate: '2024-01-01',
      endValue: 5,
      endDate: '2024-12-31',
      replacements: [
        { date: '2023-12-01', removedEndValue: 2, installedStartValue: 0 },
      ],
    }
    const serialized = text(
      circuitMeterReadingTables(
        appData,
        calculation,
        appData.billingData.occupancyPeriods,
        appData.masterData.units,
      ),
    )
    expect(serialized).toContain(REPLACEMENT_INVALID_HINT)
    expect(serialized).not.toContain('Verbrauch gesamt')
  })
})
