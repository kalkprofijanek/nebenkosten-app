import { describe, expect, it } from 'vitest'
import type {
  AppDataFile,
  ClimateFactor,
  ConsumptionBenchmark,
} from '@nebenkosten/schema'
import { buildTenantStatement } from '../src/tenant-statement'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

const text = (value: unknown) =>
  JSON.stringify(value).replace(
    new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'gu'),
    ' ',
  )

const statement = (appData: AppDataFile) =>
  text(
    buildTenantStatement(buildFixtureTenantStatementContext(appData)).content,
  )

/** Fiktive Klassengrenzen; keine Werte einer echten Heizspiegel-Ausgabe. */
const BENCHMARK: ConsumptionBenchmark = {
  source: 'Heizspiegel für Deutschland (co2online)',
  referenceYear: 2024,
  category: 'Heizöl, fiktive Kategorie',
  includesHotWater: false,
  lowMaxKwhPerSqmYear: 100,
  mediumMaxKwhPerSqmYear: 200,
  elevatedMaxKwhPerSqmYear: 300,
}

/** Fiktiver Klimafaktor; kein Wert einer echten DWD-Liste. */
const climate = (year: number, factor: number): ClimateFactor => ({
  postalCode: '00000',
  factor,
  periodStart: `${year}-01-01`,
  periodEnd: `${year}-12-31`,
  source: 'DWD, Klimafaktoren',
})

/**
 * Fiktives Heizöl-Haus (Fall 06): 2.500 l à 10 kWh = 25.000 kWh, Mieter T1
 * 40 m² mit 40 von 100 Einheiten und einer von drei Personen.
 */
function base(): AppDataFile {
  return buildFixtureAppData('case-06-heating-oil-fifo')
}

function withCentralHotWater(appData: AppDataFile): AppDataFile {
  for (const circuit of appData.billingData.heatingCircuits) {
    circuit.hasCentralHotWater = true
    circuit.hotWaterSharePercent = 20
  }
  return appData
}

/**
 * Vorjahr im System mit eigenem Heizkreis: 2.200 l = 22.000 kWh, gleiche
 * Mietparteien und Einheiten wie im Abrechnungsjahr.
 */
function withPreviousYear(
  appData: AppDataFile,
  options: { withCircuit?: boolean } = {},
): AppDataFile {
  const { billingData } = appData
  const period = billingData.billingPeriods[0]!
  const year = period.year - 1
  billingData.billingPeriods.push({
    ...period,
    id: 'previous-period',
    year,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    climateFactor: null,
  })
  billingData.occupancyPeriods.push(
    ...billingData.occupancyPeriods.map((occupancy) => ({
      ...occupancy,
      id: `${occupancy.id}-previous`,
      billingPeriodId: 'previous-period',
    })),
  )
  if (options.withCircuit === false) return appData
  const [circuit] = billingData.heatingCircuits
  const [source] = billingData.energySources
  const [stock] = billingData.fuelStocks
  const [delivery] = billingData.fuelDeliveries
  billingData.heatingCircuits.push({
    ...circuit!,
    id: 'previous-circuit',
    billingPeriodId: 'previous-period',
    consumptionBenchmark: null,
  })
  billingData.energySources.push({
    ...source!,
    id: 'previous-source',
    heatingCircuitId: 'previous-circuit',
  })
  billingData.fuelStocks.push({
    ...stock!,
    id: 'previous-stock',
    energySourceId: 'previous-source',
    billingPeriodId: 'previous-period',
  })
  billingData.fuelDeliveries.push({
    ...delivery!,
    id: 'previous-delivery',
    energySourceId: 'previous-source',
    billingPeriodId: 'previous-period',
    date: `${year}-03-01`,
    quantity: { value: 1_700, unit: 'l' },
  })
  return appData
}

function withClimateFactors(
  appData: AppDataFile,
  current: number,
  previous: number | null,
): AppDataFile {
  for (const period of appData.billingData.billingPeriods) {
    const factor = period.id === 'previous-period' ? previous : current
    period.climateFactor = factor === null ? null : climate(period.year, factor)
  }
  return appData
}

describe('Vergleich mit dem Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4 HeizKV)', () => {
  it('gibt Wert, Klasse und Grenzen auf eigener Fläche aus', () => {
    const appData = base()
    appData.billingData.heatingCircuits[0]!.consumptionBenchmark = BENCHMARK
    const serialized = statement(appData)
    expect(serialized).toContain(
      'Vergleich mit dem Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4 HeizKV)',
    )
    // 25.000 kWh × 40/100 Einheiten = 10.000 kWh ÷ 40 m² = 250 kWh/m²·a.
    expect(serialized).toContain(
      '250,0 kWh je m² und Jahr – Einstufung „erhöht“',
    )
    expect(serialized).toContain(
      'Ihr Energieverbrauch für Heizwärme: 10.000 kWh',
    )
    expect(serialized).toContain(
      'niedrig bis 4.000 kWh, mittel bis 8.000 kWh, erhöht bis 12.000 kWh, darüber zu hoch',
    )
    expect(serialized).toContain(
      'Vergleichswerte: Heizspiegel für Deutschland (co2online), Kategorie „Heizöl, fiktive Kategorie“, Bezugsjahr 2024 (nur Heizung).',
    )
    expect(serialized).toContain(
      'als Ihr Anteil am Energieeinsatz des Gebäudes',
    )
    expect(serialized).not.toContain('hochgerechnet: Heizwärme')
    // Der Mittelwert des Heizkreises bleibt stehen.
    expect(serialized).toContain('Mittlerer Verbrauch im Heizkreis')
  })

  it('weist Warmwasser getrennt aus', () => {
    const appData = withCentralHotWater(base())
    appData.billingData.heatingCircuits[0]!.consumptionBenchmark = {
      ...BENCHMARK,
      includesHotWater: true,
    }
    const serialized = statement(appData)
    // Heizwärme 20.000 × 40 % = 8.000 kWh, Warmwasser 5.000 ÷ 3 = 1.667 kWh.
    expect(serialized).toContain(
      'Ihr Energieverbrauch: 9.667 kWh (Heizwärme 8.000 kWh, Warmwasser 1.667 kWh)',
    )
    expect(serialized).toContain('241,7 kWh je m² und Jahr')
    expect(serialized).toContain('(Heizung und Warmwasser)')
  })

  it('rechnet bei Teilzeitraum nach Gradtagszahlen hoch', () => {
    const appData = base()
    appData.billingData.heatingCircuits[0]!.consumptionBenchmark = BENCHMARK
    appData.billingData.occupancyPeriods[0]!.from = '2024-07-01'
    const serialized = statement(appData)
    expect(serialized).toContain(
      'Ihr Verbrauch ist auf ein Jahr hochgerechnet: Heizwärme nach Gradtagszahlen (VDI 2067), Warmwasser nach Tagen.',
    )
  })

  it('gibt ohne Vergleichswerte keine Zeile aus', () => {
    expect(statement(base())).not.toContain('Durchschnittsnutzer')
  })
})

describe('Vorjahresvergleich in Verbrauchseinheiten', () => {
  function unitsOnly(): AppDataFile {
    const appData = withPreviousYear(base(), { withCircuit: false })
    appData.billingData.occupancyPeriods.find(
      ({ id }) => id === 'op-t1-previous',
    )!.consumptionUnits = { value: 100, unit: 'einheiten' }
    return appData
  }

  it('bereinigt mit passenden Klimafaktoren beider Jahre', () => {
    const serialized = statement(withClimateFactors(unitsOnly(), 1.1, 0.9))
    // 100 × 0,9 = 90 gegen 40 × 1,1 = 44 → −51,1 %.
    expect(serialized).toContain('"90,00 Einheiten"')
    expect(serialized).toContain('"44,00 Einheiten"')
    expect(serialized).toContain(
      'Witterungsbereinigt mit Klimafaktoren des Deutschen Wetterdienstes (Postleitzahl 00000, Faktor Vorjahr 0,90, Abrechnungsjahr 1,10).',
    )
    expect(serialized).toContain('Veränderung gegenüber dem Vorjahr: -51,1 %.')
    expect(serialized).not.toContain('ohne Witterungsbereinigung')
  })

  it('bleibt ohne Faktor des Vorjahres unbereinigt und nennt fehlendes Warmwasser', () => {
    const serialized = statement(withClimateFactors(unitsOnly(), 1.1, null))
    expect(serialized).toContain('"100,00 Einheiten"')
    expect(serialized).toContain('ohne Witterungsbereinigung')
    expect(serialized).toContain(
      'das Warmwasser ist nicht enthalten, weil der Energieeinsatz in kWh oder Ihr Verbrauch für eines der Jahre nicht ermittelbar ist.',
    )
  })

  it('bereinigt den übernommenen Vorjahresverbrauch mit seinem Faktor', () => {
    const appData = withClimateFactors(base(), 1.1, null)
    appData.billingData.occupancyPeriods[0]!.previousConsumption = {
      year: 2023,
      value: 50,
      source: 'Abrechnung des Voreigentümers',
      climateFactor: 1.2,
    }
    const serialized = statement(appData)
    expect(serialized).toContain('"60,00 Einheiten"')
    expect(serialized).toContain('Faktor Vorjahr 1,20, Abrechnungsjahr 1,10')
    expect(serialized).toContain(
      'weil für das Vorjahr nur der übernommene Heizverbrauch vorliegt.',
    )
    expect(serialized).toContain('Vorjahreswert: Abrechnung des Voreigentümers')
  })
})

describe('Vorjahresvergleich des Energieverbrauchs (§ 6a Abs. 3 Satz 2 HeizKV)', () => {
  it('vergleicht Heizwärme witterungsbereinigt in kWh', () => {
    const serialized = statement(
      withClimateFactors(withPreviousYear(base()), 1.1, 0.9),
    )
    // Vorjahr 22.000 × 40 % = 8.800 × 0,9 = 7.920 kWh,
    // Abrechnungsjahr 10.000 × 1,1 = 11.000 kWh → +38,9 %.
    expect(serialized).toContain('Ihr Energieverbrauch im Vorjahr (2023)')
    expect(serialized).toContain('"7.920 kWh"')
    expect(serialized).toContain('"11.000 kWh"')
    expect(serialized).toContain('"w":200')
    expect(serialized).toContain(
      '2023: Heizwärme 8.800 kWh × Klimafaktor 0,90 = 7.920 kWh',
    )
    expect(serialized).toContain(
      'Das Warmwasser wird nicht über die Heizungsanlage bereitet',
    )
    expect(serialized).toContain(
      'Witterungsbereinigt mit Klimafaktoren des Deutschen Wetterdienstes (Postleitzahl 00000, Faktor Vorjahr 0,90, Abrechnungsjahr 1,10).',
    )
    expect(serialized).toContain('Veränderung gegenüber dem Vorjahr: +38,9 %.')
  })

  it('addiert Warmwasser unbereinigt als eigenen Balkenanteil', () => {
    const serialized = statement(
      withClimateFactors(
        withPreviousYear(withCentralHotWater(base())),
        1.1,
        0.9,
      ),
    )
    // Vorjahr: Heizwärme 17.600 × 40 % = 7.040 × 0,9 = 6.336 kWh,
    // Warmwasser 4.400 ÷ 3 = 1.467 kWh → 7.803 kWh.
    // Abrechnungsjahr: 8.000 × 1,1 = 8.800 + 1.667 = 10.467 kWh.
    expect(serialized).toContain('"7.803 kWh"')
    expect(serialized).toContain('"10.467 kWh"')
    expect(serialized).toContain('"color":"#b8c4ce"')
    expect(serialized).toContain('Warmwasser 1.467 kWh')
    expect(serialized).toContain(
      'Bereinigt ist nur die Heizwärme; das Warmwasser hängt nicht von der Witterung ab',
    )
  })

  it('vergleicht ohne Klimafaktoren unbereinigt in kWh', () => {
    const serialized = statement(withPreviousYear(base()))
    expect(serialized).toContain('"8.800 kWh"')
    expect(serialized).toContain('"10.000 kWh"')
    expect(serialized).toContain(
      'Darstellung ohne Witterungsbereinigung, weil nicht für beide Jahre ein passender Klimafaktor',
    )
    expect(serialized).toContain('Veränderung gegenüber dem Vorjahr: +13,6 %.')
  })
})
