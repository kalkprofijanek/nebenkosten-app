import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import { buildTenantStatement } from '../src/tenant-statement'
import { buildCombinedCostStatement } from '../src/combined-cost-statement'
import {
  heatingOperatingCostLines,
  meteringFeeCents,
} from '../src/heating-summary'
import {
  circuitMeterReadingTables,
  formatMeterValue,
  hasReading,
  readingDifference,
  readingWithDate,
} from '../src/meter-readings'
import { meteringFeesText } from '../src/legal-texts'
import {
  buildFixtureAppData,
  buildFixtureCalculation,
  buildFixtureCombinedContext,
  buildFixtureTenantStatementContext,
} from './fixture'

const text = (document: { content: unknown }) =>
  JSON.stringify(document.content).replace(
    new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'gu'),
    ' ',
  )

function firstTenant(appData: AppDataFile) {
  return appData.billingData.occupancyPeriods.find(
    ({ kind }) => kind === 'tenant',
  )!
}

/** Fiktive Heizungs-Betriebskosten für Haus Nord (B1). */
function withHeatingOperatingCosts(appData: AppDataFile): AppDataFile {
  const billingPeriodId = appData.billingData.billingPeriods[0]!.id
  appData.billingData.costCategories.push(
    {
      id: 'heat-op-1',
      billingPeriodId,
      kind: 'heating',
      label: 'Heizungsnebenkosten',
      scope: { kind: 'building', buildingId: 'B1' },
    },
    {
      id: 'heat-op-2',
      billingPeriodId,
      kind: 'heating',
      label: 'Wartung pauschal',
      totalAmountCents: 10_000,
      scope: { kind: 'building', buildingId: 'B1' },
    },
  )
  appData.billingData.costEntries.push(
    {
      id: 'heat-op-entry-1',
      costCategoryId: 'heat-op-1',
      date: '2024-03-01',
      description: 'Miete Wärmezähler',
      amountCents: 12_000,
    },
    {
      id: 'heat-op-entry-2',
      costCategoryId: 'heat-op-1',
      date: '2024-12-15',
      description: 'Ablesung und Abrechnung',
      amountCents: 8_000,
      allocablePercent: 50,
    },
    {
      id: 'heat-op-entry-3',
      costCategoryId: 'heat-op-1',
      date: '2024-06-01',
      description: 'Brennerreinigung',
      amountCents: 5_001,
    },
  )
  return appData
}

describe('Einzelabrechnung – Ihre Verbrauchserfassung', () => {
  it('zeigt Zählerstände mit Datum und die vollständige Rechnung', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const occupancy = firstTenant(appData)
    const units = occupancy.consumptionUnits?.value ?? 0
    occupancy.heatMeterReading = {
      meterNumber: 'HZ-0042',
      startValue: 1000,
      startDate: '2024-01-01',
      endValue: 1000 + units,
      endDate: '2024-12-31',
    }
    const context = buildFixtureTenantStatementContext(appData)
    const serialized = text(buildTenantStatement(context))

    for (const expected of [
      'Ihre Verbrauchserfassung',
      'Zähler-Nr.',
      'Stand alt (Datum)',
      'Stand neu (Datum)',
      'HZ-0042',
      '1.000 (01.01.2024)',
      `(31.12.2024)`,
      'Verbrauch = Stand neu − Stand alt = ',
      'Verbrauchskosten = ',
      '€ je Einheit × ',
      'Grundkosten = ',
      '€ je m² × ',
      'Heizkosten gesamt = Grundkosten + Verbrauchskosten = ',
    ])
      expect(serialized).toContain(expected)
    expect(serialized).not.toContain('Abgerechnet werden')
    expect(serialized).not.toContain('Warmwasser')
  })

  it('zeigt die Erläuterung auch bei gemessenem Verbrauch und hält den Abschnitt zusammen', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const occupancy = firstTenant(appData)
    occupancy.heatMeterReading = { meterNumber: 'HZ-7', startValue: 1 }
    occupancy.consumptionUnitsEstimated = false
    occupancy.consumptionUnitsEstimateReason =
      'Stand zum 31.12. abgeleitet aus der Vorjahresabrechnung.'
    const document = buildTenantStatement(
      buildFixtureTenantStatementContext(appData),
    )
    const serialized = text(document)
    expect(serialized).toContain(
      'Stand zum 31.12. abgeleitet aus der Vorjahresabrechnung.',
    )
    expect(serialized).not.toContain('Ihr Verbrauch wurde geschätzt')
    expect(serialized).toMatch(
      /"stack":\[\{"text":"Ihre Verbrauchserfassung"[^]*?"unbreakable":true/u,
    )
  })

  it('weist abweichende Zählerdifferenz und fehlende Stände aus', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    firstTenant(appData).heatMeterReading = { startValue: 0, endValue: 1 }
    const deviating = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )
    expect(deviating).toContain('Abgerechnet werden ')

    firstTenant(appData).heatMeterReading = { meterNumber: 'HZ-1' }
    const incomplete = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )
    expect(incomplete).toContain('HZ-1')
    expect(incomplete).toContain('Verbrauch laut Erfassung = ')
  })

  it('zeigt ohne Zählerdaten nur die Rechnung mit Einheiten', () => {
    const context = buildFixtureTenantStatementContext(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    const serialized = text(buildTenantStatement(context))
    expect(serialized).toContain('Ihre Verbrauchserfassung')
    expect(serialized).toContain('Verbrauch laut Erfassung = ')
    expect(serialized).not.toContain('Zähler-Nr.')
  })

  it('nennt bei Schätzung den Schätzgrund statt der Zählerstände', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    Object.assign(firstTenant(appData), {
      consumptionUnitsEstimated: true,
      consumptionUnitsEstimateReason: 'Gerät defekt (fiktiv)',
      heatMeterReading: { meterNumber: 'HZ-9', startValue: 1, endValue: 2 },
    })
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )
    expect(serialized).toContain('Grund der Schätzung: Gerät defekt (fiktiv)')
    expect(serialized).toContain('Verbrauch (geschätzt) = ')
    expect(serialized).not.toContain('HZ-9')
  })

  it('druckt den Schätzgrund nur einmal und verweist vorne darauf', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    Object.assign(firstTenant(appData), {
      consumptionUnitsEstimated: true,
      consumptionUnitsEstimateReason: 'Gerät defekt (fiktiv)',
    })
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )
    expect(serialized.split('Gerät defekt (fiktiv)')).toHaveLength(2)
    expect(serialized).toContain(
      'Die Begründung finden Sie unter „Ihre Verbrauchserfassung“.',
    )
  })

  it('rechnet den CO2-Mieteranteil nachvollziehbar vor', () => {
    const context = buildFixtureTenantStatementContext(
      buildFixtureAppData('case-12-co2-split'),
    )
    const serialized = text(buildTenantStatement(context))
    expect(serialized).toContain('CO2-Kosten Mieteranteil des Heizkreises = ')
    expect(serialized).toContain('CO2-Grundanteil = ')
    expect(serialized).toContain('CO2-Verbrauchsanteil = ')
    expect(serialized).toContain('Ihr CO2-Kostenanteil = ')
  })

  it('zeigt Warmwasser nur bei konfigurierter Warmwasserabgrenzung', () => {
    const serialized = text(
      buildTenantStatement(
        buildFixtureTenantStatementContext(
          buildFixtureAppData('case-10-central-hot-water'),
        ),
      ),
    )
    expect(serialized).toContain(
      'Heizkosten gesamt = Grundkosten + Verbrauchskosten + Warmwasser',
    )
    expect(serialized).not.toContain('Eine zentrale Warmwasserbereitung')
  })
})

describe('Rechtliche Nachbesserungen', () => {
  it('druckt Rundungshinweis, neue Überschrift und Abrechnungseinheit', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const serialized = text(buildTenantStatement(context))
    expect(serialized).toContain(
      'Aufgrund der Berechnung mit ungerundeten Einzelwerten können Rundungsdifferenzen von wenigen Cent auftreten.',
    )
    expect(serialized).toContain('Liegenschafts- und Abrechnungsdaten')
    expect(serialized).not.toContain('Liegenschaftsdaten (§ 259 BGB)')
    expect(serialized).toContain(
      '["Abrechnungseinheit Betriebskosten","Objekt Beispielangabe"]',
    )
  })

  it('nennt bei Gebäude-Zuordnung den Gebäudenamen als Abrechnungseinheit', () => {
    const appData = buildFixtureAppData()
    firstTenant(appData).costScope = { kind: 'building', buildingId: 'B1' }
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )
    expect(serialized).toContain(
      '["Abrechnungseinheit Betriebskosten","Gebäude Haus Nord"]',
    )
  })

  it('weist erkannte Entgelte der Verbrauchserfassung aus', () => {
    const appData = withHeatingOperatingCosts(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    const billingPeriodId = appData.billingData.billingPeriods[0]!.id
    expect(meteringFeeCents(appData, billingPeriodId, 'B1')).toBe(20_000)
    expect(
      meteringFeeCents(
        {
          ...appData,
          billingData: {
            ...appData.billingData,
            costEntries: appData.billingData.costEntries.map((entry) => ({
              ...entry,
              description: 'Erwerberabrechnung Voreigentümer',
            })),
            costCategories: appData.billingData.costCategories.map(
              (category) => ({
                ...category,
                label: 'Wartung',
                statementText: null,
              }),
            ),
          },
        },
        billingPeriodId,
        'B1',
      ),
    ).toBeNull()
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )
    expect(serialized).toContain(
      'Entgelte für Verbrauchserfassung und Abrechnung (Gerätemiete, Ablesung, Abrechnung, Eichung): 200,00 €',
    )
  })

  it('verweist ohne erkennbare Entgelte auf die Betriebskosten der Heizung', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const billingPeriodId = appData.billingData.billingPeriods[0]!.id
    expect(meteringFeeCents(appData, billingPeriodId, 'B1')).toBeNull()
    expect(meteringFeesText(null)).toBe(
      'Die Entgelte für Verbrauchserfassung und Abrechnung sind in den Betriebskosten der Heizungsanlage enthalten.',
    )
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )
    expect(serialized).toContain(meteringFeesText(null))
  })

  it('erkennt Entgelte auch an der Bezeichnung der Kostenart', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const billingPeriodId = appData.billingData.billingPeriods[0]!.id
    appData.billingData.costCategories.push(
      {
        id: 'fee-1',
        billingPeriodId,
        kind: 'heating',
        label: 'Messdienst',
        totalAmountCents: 4_200,
        scope: { kind: 'building', buildingId: 'B1' },
      },
      {
        id: 'fee-2',
        billingPeriodId,
        kind: 'heating',
        label: 'Eichung Zähler',
        scope: { kind: 'building', buildingId: 'B1' },
      },
      {
        id: 'other',
        billingPeriodId,
        kind: 'heating',
        label: 'Wartung',
        scope: { kind: 'building', buildingId: 'B1' },
      },
    )
    appData.billingData.costEntries.push(
      { id: 'fee-2-entry', costCategoryId: 'fee-2', amountCents: 300 },
      { id: 'other-entry', costCategoryId: 'other', amountCents: 999 },
    )
    expect(meteringFeeCents(appData, billingPeriodId, 'B1')).toBe(4_500)
  })

  it('zeigt den Vorjahresverbrauch derselben Mietpartei, wenn vorhanden', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const period = appData.billingData.billingPeriods[0]!
    const occupancy = firstTenant(appData)
    appData.billingData.billingPeriods.push({
      ...period,
      id: 'previous-period',
      year: period.year - 1,
      periodStart: `${period.year - 1}-01-01`,
      periodEnd: `${period.year - 1}-12-31`,
    })
    appData.billingData.occupancyPeriods.push({
      ...occupancy,
      id: 'previous-occupancy',
      billingPeriodId: 'previous-period',
      consumptionUnits: { value: 321, unit: 'einheiten' },
    })
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )
    expect(serialized).toContain(
      `Ihr Verbrauch im Vorjahr (${period.year - 1})`,
    )
    expect(serialized).toContain('321,00')
    expect(serialized).not.toContain('Ein Vergleich mit dem Vorjahr ist nicht')
  })
})

describe('Heizungs-Betriebskosten aufschlüsseln', () => {
  it('summiert die davon-Zeilen exakt auf die Zusammenstellung', () => {
    const appData = withHeatingOperatingCosts(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    const calculation = buildFixtureCalculation(appData)
    const circuit = calculation.heating.trace.circuits.find(
      ({ buildingId }) => buildingId === 'B1',
    )!
    const lines = heatingOperatingCostLines(
      appData,
      appData.billingData.billingPeriods[0]!.id,
      circuit,
    )
    expect(lines.map(({ kind }) => kind)).toEqual([
      'entry',
      'entry',
      'entry',
      'non_allocable',
      'category',
    ])
    expect(lines[0]).toMatchObject({
      date: '2024-03-01',
      label: 'Heizungsnebenkosten: Miete Wärmezähler',
      amountCents: 12_000,
    })
    expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(
      circuit.reconciliation.plusHeatingOperatingCostsCents,
    )

    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )
    expect(serialized).toContain(
      'davon 01.03.2024 Heizungsnebenkosten: Miete Wärmezähler',
    )
    expect(serialized).toContain('davon nicht umlagefähiger Anteil')
    expect(serialized).toContain('davon Wartung pauschal')
    const combined = text(
      buildCombinedCostStatement(buildFixtureCombinedContext(appData)),
    )
    expect(combined).toContain('davon 15.12.2024 Heizungsnebenkosten')
  })

  it('weist eine verbleibende Centdifferenz als Rundung aus', () => {
    const appData = withHeatingOperatingCosts(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    const circuit = buildFixtureCalculation(
      appData,
    ).heating.trace.circuits.find(({ buildingId }) => buildingId === 'B1')!
    const shifted = {
      ...circuit,
      reconciliation: {
        ...circuit.reconciliation,
        plusHeatingOperatingCostsCents:
          circuit.reconciliation.plusHeatingOperatingCostsCents + 1,
      },
    }
    const lines = heatingOperatingCostLines(
      appData,
      appData.billingData.billingPeriods[0]!.id,
      shifted,
    )
    expect(lines.at(-1)).toEqual({
      kind: 'rounding',
      date: null,
      label: 'Rundung',
      amountCents: 1,
    })
  })
})

describe('Gesamtabrechnung – Zählerstände je Heizkreis', () => {
  it('listet alle Zählerstände in der internen Fassung', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const tenants = appData.billingData.occupancyPeriods.filter(
      ({ kind }) => kind === 'tenant',
    )
    tenants[0]!.heatMeterReading = {
      meterNumber: 'HZ-A',
      startValue: 10,
      startDate: '2024-01-01',
      endValue: 15.5,
      endDate: '2024-12-31',
    }
    const internal = text(
      buildCombinedCostStatement(buildFixtureCombinedContext(appData)),
    )
    expect(internal).toContain(
      'Zählerstände je Heizkreis (Verbrauchserfassung)',
    )
    expect(internal).toContain('Heizkreis Haus Nord')
    expect(internal).toContain('HZ-A')
    expect(internal).toContain('15,5 (31.12.2024)')
    expect(internal).toContain('5,5')
    expect(internal).toContain(
      'Aufgrund der Berechnung mit ungerundeten Einzelwerten',
    )
    const forTenants = text(
      buildCombinedCostStatement(
        buildFixtureCombinedContext(appData, 'tenant'),
      ),
    )
    expect(forTenants).not.toContain('HZ-A')
  })

  it('entfällt ohne erfasste Zählerstände', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const calculation = buildFixtureCalculation(appData)
    expect(
      circuitMeterReadingTables(
        appData,
        calculation,
        appData.billingData.occupancyPeriods,
        appData.masterData.units,
      ),
    ).toEqual([])
  })

  it('kennzeichnet Abweichungen und Schätzungen, auch ohne Rechen-Trace', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const calculation = buildFixtureCalculation(appData)
    const tenants = appData.billingData.occupancyPeriods.filter(
      ({ kind }) => kind === 'tenant',
    )
    tenants[0]!.heatMeterReading = { startValue: 0, endValue: 1 }
    tenants[0]!.consumptionUnitsEstimated = true
    const withoutTrace = {
      ...calculation,
      tenants: calculation.tenants.map((tenant) => ({
        ...tenant,
        ownBasis: undefined,
      })),
    }
    const serialized = JSON.stringify(
      circuitMeterReadingTables(
        appData,
        withoutTrace,
        appData.billingData.occupancyPeriods,
        appData.masterData.units,
      ),
    )
    expect(serialized).toContain('(geschätzt) !')
  })
})

describe('Formatierung der Zählerstände', () => {
  it('formatiert Stände, Datum und Differenz', () => {
    expect(formatMeterValue(1234.5)).toBe('1.234,5')
    expect(readingWithDate(null, null)).toBe('–')
    expect(readingWithDate(null, '2024-01-01')).toBe('– (01.01.2024)')
    expect(readingWithDate(7, null)).toBe('7')
    expect(readingDifference({ startValue: 1.1, endValue: 2.3 })).toBe(1.2)
    expect(readingDifference({ startValue: 1 })).toBeNull()
    expect(hasReading(null)).toBe(false)
    expect(hasReading({ meterNumber: '  ' })).toBe(false)
    expect(hasReading({ endValue: 0 })).toBe(true)
  })
})
