import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import {
  compareTenantWithConsumptionBenchmark,
  weatherAdjustPreviousPeriod,
} from '@nebenkosten/core'
import { buildTenantStatement } from '../src/tenant-statement'
import {
  energyCarrierMixLabel,
  energyCarrierShares,
  fuelAccountTable,
} from '../src/heating-summary'
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

/**
 * Fiktiver gemischter Heizkreis: Flüssiggas (Tank mit Bestand, eine
 * Rechnung ohne Liefermenge) und Wärmepumpenstrom (Jahresrechnung aus dem
 * Folgejahr).
 */
function mixedCircuit(): AppDataFile {
  const appData = buildFixtureAppData('case-06-heating-oil-fifo')
  const period = appData.billingData.billingPeriods[0]!
  const [propane] = appData.billingData.energySources
  appData.billingData.energySources = [
    {
      ...propane!,
      name: 'Flüssiggas (Propan)',
      sourceType: 'Flüssiggas (Propan)',
      calorificValueKwhPerUnit: 6.57,
    },
    {
      id: 'es-B1-wp',
      heatingCircuitId: propane!.heatingCircuitId,
      key: 'wp_strom',
      name: 'Wärmepumpe',
      sourceType: 'Strom',
      calorificValueKwhPerUnit: null,
      co2FactorKgPerKwh: 0,
    },
  ]
  appData.billingData.fuelDeliveries.push(
    {
      id: 'fd-B1-propan-fracht',
      energySourceId: propane!.id,
      billingPeriodId: period.id,
      date: `${period.year}-11-28`,
      quantity: { value: 0, unit: 'l' },
      amountCents: 3_726,
      description: 'Fracht und Gefahrgutzuschlag',
    },
    {
      id: 'fd-B1-wp-1',
      energySourceId: 'es-B1-wp',
      billingPeriodId: period.id,
      date: `${period.year + 1}-02-17`,
      quantity: { value: 5_000, unit: 'kWh' },
      amountCents: 150_000,
      description: `Jahresabrechnung Verbrauchszeitraum 01.01.–31.12.${period.year}`,
    },
  )
  return appData
}

function circuitOf(appData: AppDataFile) {
  return buildFixtureCalculation(appData).heating.trace.circuits[0]!
}

describe('Energierechnungen statt Brennstoffkonto bei Strom', () => {
  it('weist Wärmepumpenstrom als Rechnung mit Verbrauchszeitraum aus', () => {
    const appData = mixedCircuit()
    const table = text(fuelAccountTable(appData, circuitOf(appData)))

    expect(table).toContain('Brennstoffkonto bzw. Energierechnungen')
    expect(table).toContain(
      'Rechnung vom 17.02.2025: Jahresabrechnung Verbrauchszeitraum 01.01.–31.12.2024',
    )
    expect(table).toContain('= Energiekosten laut Rechnungen')
    expect(table).toContain('5.000,00 kWh')
    expect(table).not.toContain('Lieferung 17.02.2025')
    // Nur das Flüssiggas-Konto hat Anfangs- und Endbestand.
    expect(table.match(/Anfangsbestand/gu)).toHaveLength(1)
    expect(table.match(/FIFO/gu)).toHaveLength(1)
  })

  it('benennt Kosten ohne Liefermenge nicht als Lieferung', () => {
    const appData = mixedCircuit()
    const table = text(fuelAccountTable(appData, circuitOf(appData)))

    expect(table).toContain(
      '+ Rechnung vom 28.11.2024 ohne Liefermenge: Fracht und Gefahrgutzuschlag',
    )
    expect(table).not.toContain('+ Lieferung 28.11.2024')
  })

  it('nennt Rechnungen ohne Beschreibung und Datum neutral', () => {
    const appData = mixedCircuit()
    for (const delivery of appData.billingData.fuelDeliveries) {
      delivery.description = null
      if (delivery.id === 'fd-B1-wp-1') delivery.date = null
    }
    const table = text(fuelAccountTable(appData, circuitOf(appData)))
    expect(table).toContain('Rechnung ohne Datum')
    expect(table).toContain('+ Rechnung vom 28.11.2024 ohne Liefermenge"')
  })

  it('überschreibt nur Energierechnungen, wenn alle Quellen leitungsgebunden sind', () => {
    const appData = mixedCircuit()
    appData.billingData.energySources =
      appData.billingData.energySources.filter(({ id }) => id === 'es-B1-wp')
    appData.billingData.fuelStocks = []
    appData.billingData.fuelDeliveries =
      appData.billingData.fuelDeliveries.filter(
        ({ energySourceId }) => energySourceId === 'es-B1-wp',
      )
    const circuit = circuitOf(appData)
    const table = text(fuelAccountTable(appData, circuit))
    expect(table).toContain('"Energierechnungen"')
    expect(table).not.toContain('Anfangsbestand')
  })
})

describe('Anteile der Energieträger (§ 6a HeizKV)', () => {
  it('berechnet Anteile am Energieeinsatz mit Summe 100 %', () => {
    const appData = mixedCircuit()
    const shares = energyCarrierShares(appData, circuitOf(appData))!
    expect(shares.map(({ label, percent }) => [label, percent])).toEqual([
      ['Flüssiggas (Propan)', 77],
      ['Strom', 23],
    ])
    expect(text(energyCarrierMixLabel(appData, circuitOf(appData)))).toBe(
      '"Flüssiggas (Propan) 77 %, Strom 23 % (Anteil am Energieeinsatz in kWh)"',
    )
  })

  it('gibt ohne Menge einer kostenbehafteten Quelle keine Anteile aus', () => {
    const appData = mixedCircuit()
    const delivery = appData.billingData.fuelDeliveries.find(
      ({ id }) => id === 'fd-B1-wp-1',
    )!
    delivery.quantity = null
    const circuit = circuitOf(appData)
    expect(energyCarrierShares(appData, circuit)).toBeNull()
    expect(energyCarrierMixLabel(appData, circuit)).toBe(
      'Flüssiggas (Propan), Strom',
    )
  })

  it('verteilt Rundungsreste nach dem größten Rest', () => {
    const appData = mixedCircuit()
    const circuit = circuitOf(appData)
    const thirds = {
      ...circuit,
      energySources: [0, 1, 2].map((index) => ({
        ...circuit.energySources[0]!,
        energySourceId: `third-${index}`,
        energyKwh: 1,
      })),
    }
    appData.billingData.energySources.push(
      ...[0, 1, 2].map((index) => ({
        ...appData.billingData.energySources[0]!,
        id: `third-${index}`,
        sourceType: `Träger ${index}`,
      })),
    )
    expect(
      energyCarrierShares(appData, thirds)!.map(({ percent }) => percent),
    ).toEqual([34, 33, 33])
  })
})

describe('Vergleich mit dem normierten Durchschnittsnutzer (§ 6a HeizKV)', () => {
  function withBenchmark(
    caseId = 'case-06-heating-oil-fifo',
    includesHotWater = false,
  ) {
    const appData = buildFixtureAppData(caseId)
    const circuit = appData.billingData.heatingCircuits[0]!
    circuit.consumptionBenchmark = {
      source: 'Fiktive Vergleichsquelle',
      sourceUrl: 'https://example.invalid/benchmark',
      referenceYear: 2025,
      category: 'Fiktiver Energieträger, Baualtersklasse X',
      includesHotWater,
      lowMaxKwhPerSqmYear: 70,
      mediumMaxKwhPerSqmYear: 130,
      elevatedMaxKwhPerSqmYear: 200,
    }
    return appData
  }

  it('prints the calculated class, source, category, year and scaled ranges', () => {
    const context = buildFixtureTenantStatementContext(withBenchmark())
    const output = text(buildTenantStatement(context).content)

    expect(output).toContain(
      'Vergleich mit dem Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4 HeizKV)',
    )
    expect(output).toContain('kWh je m² und Jahr')
    expect(output).toContain('250,00 kWh je m² und Jahr (zu hoch)')
    expect(output).toContain('Fiktive Vergleichsquelle')
    expect(output).toContain('Fiktiver Energieträger, Baualtersklasse X')
    expect(output).toContain('2025')
    expect(output).toContain('Vergleichswerte enthalten kein Warmwasser')
    expect(output).toContain(
      'Klassengrenzen: niedrig bis 70,00; mittel bis 130,00; erhöht bis 200,00; darüber zu hoch kWh je m² und Jahr.',
    )
    expect(output).toContain(
      'Für Ihre Fläche und Nutzungsdauer: niedrig bis 2.800,00 kWh; mittel bis 5.200,00 kWh; erhöht bis 8.000,00 kWh; darüber zu hoch.',
    )
    expect(output).toContain('https://example.invalid/benchmark')
    expect(output).toContain('Heizoel 100 %')
  })

  it('does not print a comparison or imply compliance when core comparison is unavailable', () => {
    const appData = withBenchmark()
    const occupancy = appData.billingData.occupancyPeriods.find(
      ({ kind }) => kind === 'tenant',
    )!
    occupancy.consumptionUnits = null
    const context = buildFixtureTenantStatementContext(appData)
    const output = text(buildTenantStatement(context).content)

    expect(output).not.toContain(
      'Vergleich mit dem Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4 HeizKV)',
    )
    expect(output).not.toContain('Vergleichsklasse')
  })

  it('marks a partial occupancy comparison as annualized', () => {
    const appData = withBenchmark()
    const period = appData.billingData.billingPeriods[0]!
    const occupancy = appData.billingData.occupancyPeriods.find(
      ({ kind }) => kind === 'tenant',
    )!
    occupancy.from = `${period.year}-07-01`
    const context = buildFixtureTenantStatementContext(appData)
    const partialContext = {
      ...context,
      calculation: buildFixtureCalculation(appData),
    }
    const output = text(buildTenantStatement(partialContext).content)

    expect(output).toContain('Ihr Wert wurde auf ein Jahr hochgerechnet.')
  })

  it('includes the tenant allocated hot-water energy when the benchmark covers hot water', () => {
    const appData = withBenchmark('case-10-central-hot-water', true)
    const context = buildFixtureTenantStatementContext(appData)
    const heatingCircuit = appData.billingData.heatingCircuits[0]!
    const comparison = compareTenantWithConsumptionBenchmark(
      context.calculation,
      context.occupancyPeriod.id,
      heatingCircuit,
    )
    const output = text(buildTenantStatement(context).content)

    expect(comparison.status).toBe('compared')
    if (comparison.status !== 'compared') return
    expect(comparison.hotWaterKwh).toBeGreaterThan(0)
    expect(output).toContain(
      `${comparison.kwhPerSqmYear.toFixed(2).replace('.', ',')} kWh je m² und Jahr`,
    )
    expect(output).toContain('Die Vergleichswerte enthalten Warmwasser.')
  })
})

describe('Vorjahresvergleich (§ 6a HeizKV)', () => {
  function withPreviousPeriod(appData: AppDataFile): AppDataFile {
    const period = appData.billingData.billingPeriods[0]!
    appData.billingData.billingPeriods.push({
      ...period,
      id: 'previous-period',
      year: period.year - 1,
      periodStart: `${period.year - 1}-01-01`,
      periodEnd: `${period.year - 1}-12-31`,
    })
    return appData
  }

  const tenantOf = (appData: AppDataFile) =>
    appData.billingData.occupancyPeriods.find(({ kind }) => kind === 'tenant')!

  it('nennt ohne Vorjahresabrechnung den Eigentümer- bzw. Abrechnungswechsel', () => {
    const serialized = text(
      buildTenantStatement(
        buildFixtureTenantStatementContext(
          buildFixtureAppData('case-06-heating-oil-fifo'),
        ),
      ).content,
    )
    expect(serialized).toContain(
      'weil für diesen Zeitraum keine Verbrauchsdaten vorliegen (Eigentümer- bzw. Abrechnungswechsel).',
    )
  })

  it('unterscheidet fehlende Nutzung im Vorjahr', () => {
    const appData = withPreviousPeriod(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
    )
    expect(serialized).toContain(
      'weil Sie die Wohnung in diesem Zeitraum noch nicht genutzt haben.',
    )
  })

  it('unterscheidet fehlende Verbrauchswerte im Vorjahr', () => {
    const appData = withPreviousPeriod(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    appData.billingData.occupancyPeriods.push({
      ...tenantOf(appData),
      id: 'previous-occupancy',
      billingPeriodId: 'previous-period',
      consumptionUnits: null,
    })
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
    )
    expect(serialized).toContain(
      'weil für Ihre Nutzung in diesem Zeitraum keine Verbrauchswerte erfasst sind.',
    )
  })

  it('stellt vorhandene Vorjahreswerte grafisch dar', () => {
    const appData = withPreviousPeriod(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    const period = appData.billingData.billingPeriods[0]!
    appData.billingData.occupancyPeriods.push({
      ...tenantOf(appData),
      id: 'previous-occupancy',
      billingPeriodId: 'previous-period',
      consumptionUnits: { value: 100, unit: 'einheiten' },
    })
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
    )
    expect(serialized).toContain('"canvas":[{"type":"rect"')
    expect(serialized).toContain(
      `Ihr Verbrauch im Vorjahr (${period.year - 1})`,
    )
    expect(serialized).toContain(`Ihr Verbrauch (${period.year})`)
    expect(serialized).toContain('"w":200')
    expect(serialized).toContain('"w":80')
    expect(serialized).toContain('ohne Witterungsbereinigung')
  })

  it('nutzt ohne Vorjahresabrechnung den gespeicherten Vorjahreswert mit Quelle', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const period = appData.billingData.billingPeriods[0]!
    tenantOf(appData).previousConsumption = {
      year: period.year - 1,
      value: 100,
      source: 'Heizkostenabrechnung des Voreigentümers',
    }
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
    )
    expect(serialized).toContain(
      `Ihr Verbrauch im Vorjahr (${period.year - 1})`,
    )
    expect(serialized).toContain(
      'Vorjahreswert: Heizkostenabrechnung des Voreigentümers',
    )
    expect(serialized).not.toContain('Eigentümer- bzw. Abrechnungswechsel')
  })

  it('ignoriert gespeicherte Vorjahreswerte eines anderen Jahres', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const period = appData.billingData.billingPeriods[0]!
    tenantOf(appData).previousConsumption = {
      year: period.year - 2,
      value: 100,
    }
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
    )
    expect(serialized).toContain('Eigentümer- bzw. Abrechnungswechsel')
  })

  it('nennt bei Einzug im Abrechnungsjahr ohne Vorjahresabrechnung die fehlende Nutzung', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const period = appData.billingData.billingPeriods[0]!
    tenantOf(appData).from = `${period.year}-07-01`
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
    )
    expect(serialized).toContain(
      'weil Sie die Wohnung in diesem Zeitraum noch nicht genutzt haben.',
    )
  })
})

describe('Witterungsbereinigter Vorjahresvergleich (§ 6a HeizKV)', () => {
  function withStoredClimateComparison() {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const period = appData.billingData.billingPeriods[0]!
    const property = appData.masterData.properties[0]!
    property.address!.postalCodeAndCity = '12345 Fiktivstadt'
    period.climateFactor = {
      postalCode: '12345',
      factor: 0.9,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      source: 'Deutscher Wetterdienst',
    }
    const occupancy = appData.billingData.occupancyPeriods.find(
      ({ kind }) => kind === 'tenant',
    )!
    occupancy.previousConsumption = {
      year: period.year - 1,
      value: 100,
      source: 'Fiktive Vorjahresabrechnung',
      climateFactor: 1.2,
    }
    return appData
  }

  it('adjusts stored prior and current heating consumption with their respective core factors', () => {
    const appData = withStoredClimateComparison()
    const context = buildFixtureTenantStatementContext(appData)
    const expected = weatherAdjustPreviousPeriod(
      {
        value: context.occupancyPeriod.consumptionUnits!.value,
        climateFactor: 0.9,
      },
      { value: 100, climateFactor: 1.2 },
    )
    const output = text(buildTenantStatement(context).content)

    expect(expected.previous.adjusted).toBe(120)
    expect(expected.current.adjusted).toBe(36)
    expect(output).toContain('120,00 Einheiten')
    expect(output).toContain('36,00 Einheiten')
    expect(output).toContain(
      'Witterungsbereinigt mit Klimafaktoren des DWD (Postleitzahl 12345, Faktor Vorjahr 1,20, Abrechnungsjahr 0,90)',
    )
    expect(output).not.toContain('ohne Witterungsbereinigung')
  })

  it.each([
    ['postal-code mismatch', { postalCode: '54321' }],
    ['period mismatch', { periodStart: '2023-12-31' }],
  ])(
    'preserves the old unadjusted chart when current climate data has a %s',
    (_, patch) => {
      const appData = withStoredClimateComparison()
      Object.assign(
        appData.billingData.billingPeriods[0]!.climateFactor!,
        patch,
      )
      const output = text(
        buildTenantStatement(buildFixtureTenantStatementContext(appData))
          .content,
      )

      expect(output).toContain('100,00 Einheiten')
      expect(output).toContain('ohne Witterungsbereinigung')
      expect(output).not.toContain(
        'Witterungsbereinigt mit Klimafaktoren des DWD',
      )
    },
  )

  it('uses the previous billing period factor when that year is in the file', () => {
    const appData = withStoredClimateComparison()
    const period = appData.billingData.billingPeriods[0]!
    const previousPeriod = {
      ...period,
      id: 'previous-period',
      year: period.year - 1,
      periodStart: `${period.year - 1}-01-01`,
      periodEnd: `${period.year - 1}-12-31`,
      climateFactor: {
        postalCode: '12345',
        factor: 1.1,
        periodStart: `${period.year - 1}-01-01`,
        periodEnd: `${period.year - 1}-12-31`,
        source: 'Deutscher Wetterdienst',
      },
    }
    appData.billingData.billingPeriods.push(previousPeriod)
    const occupancy = appData.billingData.occupancyPeriods.find(
      ({ kind }) => kind === 'tenant',
    )!
    appData.billingData.occupancyPeriods.push({
      ...occupancy,
      id: 'previous-occupancy',
      billingPeriodId: previousPeriod.id,
      consumptionUnits: { value: 100, unit: 'einheiten' },
    })
    const output = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
    )

    expect(output).toContain('110,00 Einheiten')
    expect(output).toContain('Faktor Vorjahr 1,10, Abrechnungsjahr 0,90')
  })

  it('keeps the old unadjusted chart when the prior billing period factor does not match the object', () => {
    const appData = withStoredClimateComparison()
    const period = appData.billingData.billingPeriods[0]!
    const previousPeriod = {
      ...period,
      id: 'previous-period',
      year: period.year - 1,
      periodStart: `${period.year - 1}-01-01`,
      periodEnd: `${period.year - 1}-12-31`,
      climateFactor: {
        postalCode: '54321',
        factor: 1.1,
        periodStart: `${period.year - 1}-01-01`,
        periodEnd: `${period.year - 1}-12-31`,
        source: 'Deutscher Wetterdienst',
      },
    }
    appData.billingData.billingPeriods.push(previousPeriod)
    const occupancy = appData.billingData.occupancyPeriods.find(
      ({ kind }) => kind === 'tenant',
    )!
    appData.billingData.occupancyPeriods.push({
      ...occupancy,
      id: 'previous-occupancy',
      billingPeriodId: previousPeriod.id,
      consumptionUnits: { value: 100, unit: 'einheiten' },
    })
    const output = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
    )

    expect(output).toContain('100,00 Einheiten')
    expect(output).toContain('ohne Witterungsbereinigung')
    expect(output).not.toContain(
      'Witterungsbereinigt mit Klimafaktoren des DWD',
    )
  })
})
