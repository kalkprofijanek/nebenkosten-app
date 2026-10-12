import { describe, expect, it } from 'vitest'
import type {
  AppDataFile,
  HeatingCircuit,
  OccupancyPeriod,
} from '@nebenkosten/schema'
import type { HeatingCircuitTrace } from '@nebenkosten/core'
import { buildTenantStatement } from '../src/tenant-statement'
import { co2PriceText } from '../src/heating-summary'
import { energyCarrierDisplayName } from '../src/energy-carrier-label'
import { section9bOwnNote } from '../src/section9b-note'
import {
  co2DistributionSentence,
  consumptionBenchmarkFootnote,
} from '../src/legal-texts'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

const text = (value: unknown) =>
  JSON.stringify(value).replace(
    new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'gu'),
    ' ',
  )

const cents = (value: string) =>
  Math.round(Number(value.split('.').join('').replace(',', '.')) * 100)

/** Fiktiver Heizkreis mit Warmwasser nach § 9 Abs. 2 HeizKV (Flächenformel). */
function section9Data(patch: Partial<HeatingCircuit>): AppDataFile {
  const data = buildFixtureAppData('case-10-central-hot-water')
  Object.assign(data.billingData.heatingCircuits[0]!, {
    co2: { mode: 'auto', co2PricePerTonCents: 4_500 },
    hotWaterEnergy: { method: 'area_formula', reason: 'nicht messbar' },
    ...patch,
  })
  return data
}

function co2Lines(data: AppDataFile) {
  const context = buildFixtureTenantStatementContext(data)
  const serialized = text(buildTenantStatement(context).content)
  const tenant = context.calculation.tenants.find(
    ({ id }) => id === context.occupancyPeriod.id,
  )!
  return { serialized, tenant }
}

describe('CO2-Rechenweg im § 9-Verfahren (Warmwasser getrennt)', () => {
  for (const allocation of [
    { key: 'area' },
    { key: 'persons' },
    { key: 'consumption', consumptionSharePercent: 70 },
  ] as const) {
    it(`summiert Warmwasser-, Grund- und Verbrauchsanteil auf den Cent (${allocation.key})`, () => {
      const data = section9Data({ hotWaterAllocation: allocation })
      data.billingData.occupancyPeriods.forEach((occupancy, index) => {
        occupancy.warmWater = { value: 10 + index * 5, unit: 'm3' }
      })
      const { serialized, tenant } = co2Lines(data)
      expect(tenant.costBreakdown.hotWaterCo2Cents).toBeDefined()
      expect(serialized).toContain('CO2 Warmwasser')
      expect(serialized).toContain('CO2-Grundanteil Heizung = ')
      expect(serialized).toContain('CO2-Verbrauchsanteil Heizung = ')
      expect(serialized).toContain(
        'Der Mieteranteil wird nach den Schlüsseln für Heizung und Warmwasser getrennt verteilt',
      )
      const match =
        /Ihr CO2-Kostenanteil = ([\d.,]+) € \+ ([\d.,]+) € \+ ([\d.,]+) €(?: ([+−]) Rundungsausgleich ([\d.,]+) €)? = ([\d.,]+) €/u.exec(
          serialized,
        )
      expect(match).not.toBeNull()
      const [, hotWater, base, consumption, sign, rounding, total] = match!
      const adjustment = rounding
        ? (sign === '−' ? -1 : 1) * cents(rounding)
        : 0
      expect(
        cents(hotWater!) + cents(base!) + cents(consumption!) + adjustment,
      ).toBe(cents(total!))
      expect(cents(total!)).toBe(tenant.costBreakdown.heatingCo2Cents)
      expect(Math.abs(adjustment)).toBeLessThanOrEqual(2)
    })
  }

  it('rechnet die Heizungspreise aus dem Topf ohne Warmwasser', () => {
    const data = section9Data({ hotWaterAllocation: { key: 'area' } })
    const context = buildFixtureTenantStatementContext(data)
    const serialized = text(buildTenantStatement(context).content)
    const circuit = context.calculation.heating.trace.circuits[0]!
    const heatingPool =
      circuit.co2.tenantCents - circuit.warmWater.costSplit!.co2TenantCents
    const euro = (value: number) =>
      (value / 100).toLocaleString('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    expect(serialized).toContain(
      `CO2-Grundanteil Heizung = ${euro(heatingPool)} € × 30 %`,
    )
  })
})

describe('Anmerkung bei § 9b Abs. 3 HeizKV ohne Doppelnennung', () => {
  const generated =
    'Keine Zwischenablesung möglich: Mieter verzogen. Aufteilung nach Gradtagszahlen (§ 9b Abs. 3 HeizKV, VDI 2067), Zeitraum 01.01.2024 bis 31.03.2024: 1.000 Einheiten × 450 ‰ ÷ 1.000 ‰ = 450 Einheiten.'

  it('entfernt den automatisch erzeugten Rechenweg aus dem gespeicherten Text', () => {
    expect(section9bOwnNote(generated)).toBe('Mieter verzogen.')
    expect(
      section9bOwnNote(
        'Keine Zwischenablesung möglich (Mieter beim Auszug nicht erreichbar). Aufteilung nach Gradtagszahlen (§ 9b Abs. 3 HeizKV, VDI 2067): 1.120 Einheiten × 610 ‰ ÷ 1.000 ‰ = 683,2 Einheiten',
      ),
    ).toBe('Mieter beim Auszug nicht erreichbar.')
    expect(
      section9bOwnNote(
        'Keine Zwischenablesung möglich: x. Zeitanteilige Aufteilung (§ 9b Abs. 3 HeizKV), Zeitraum …',
      ),
    ).toBe('x.')
    expect(section9bOwnNote('Keine Zwischenablesung möglich.')).toBeNull()
    expect(section9bOwnNote('  ')).toBeNull()
    expect(section9bOwnNote('Mieter war nicht erreichbar')).toBe(
      'Mieter war nicht erreichbar.',
    )
  })

  function changeData(reason: string): AppDataFile {
    const appData = buildFixtureAppData('case-12-co2-split')
    const tenant = appData.billingData.occupancyPeriods.find(
      ({ kind }) => kind === 'tenant',
    )!
    tenant.to = '2024-03-31'
    tenant.consumptionUnits = { value: 450, unit: 'einheiten' }
    tenant.consumptionUnitsEstimateReason = reason
    tenant.section9bAllocation = 'degree_days'
    const vacancy: OccupancyPeriod = {
      id: 'vacancy-9b',
      billingPeriodId: tenant.billingPeriodId,
      unitId: tenant.unitId,
      kind: 'vacancy',
      from: '2024-04-01',
      consumptionUnits: { value: 550, unit: 'einheiten' },
      section9bAllocation: 'degree_days',
    }
    appData.billingData.occupancyPeriods.push(vacancy)
    return appData
  }

  it('druckt den Rechenweg einmal und den Grund nur als Anmerkung', () => {
    const serialized = text(
      buildTenantStatement(
        buildFixtureTenantStatementContext(changeData(generated)),
      ).content,
    )
    expect(serialized).toContain('Anmerkung: Mieter verzogen.')
    expect(serialized).not.toContain('Aufteilung nach Gradtagszahlen (§ 9b')
    expect(
      serialized.match(/× 450 ‰ ÷ 1\.000 ‰ = 450 Einheiten/gu),
    ).toHaveLength(1)
    expect(serialized).toContain(
      'Ermittlung: Aufteilung ohne Zwischenablesung nach § 9b Abs. 3 HeizKV (nach Gradtagszahlen), siehe „Ihre Verbrauchserfassung“',
    )
  })

  it('lässt die Anmerkung weg, wenn der Text nur den Rechenweg wiederholt', () => {
    const serialized = text(
      buildTenantStatement(
        buildFixtureTenantStatementContext(
          changeData(
            'Keine Zwischenablesung möglich. Aufteilung nach Gradtagszahlen (§ 9b Abs. 3 HeizKV, VDI 2067): 1.000 Einheiten × 450 ‰ ÷ 1.000 ‰ = 450 Einheiten',
          ),
        ),
      ).content,
    )
    expect(serialized).not.toContain('Anmerkung:')
    expect(
      serialized.match(/× 450 ‰ ÷ 1\.000 ‰ = 450 Einheiten/gu),
    ).toHaveLength(1)
  })
})

describe('Anzeigenamen der Energieträger', () => {
  it('schreibt bekannte Energieträger mit Umlaut', () => {
    expect(energyCarrierDisplayName('Heizoel')).toBe('Heizöl')
    expect(energyCarrierDisplayName('heizoel EL')).toBe('heizöl EL')
    expect(energyCarrierDisplayName('Fernwaerme')).toBe('Fernwärme')
    expect(energyCarrierDisplayName('Nahwaerme')).toBe('Nahwärme')
    expect(energyCarrierDisplayName('Fluessiggas')).toBe('Flüssiggas')
    expect(energyCarrierDisplayName('Waermepumpenstrom')).toBe(
      'Wärmepumpenstrom',
    )
    expect(energyCarrierDisplayName('erdgas')).toBe('Erdgas')
    expect(energyCarrierDisplayName('Heizöl')).toBe('Heizöl')
    expect(energyCarrierDisplayName('Holzpellets A1')).toBe('Holzpellets A1')
  })
})

describe('CO2-Preis bei Bewertung je Brennstoff-Los', () => {
  const trace = (prices: number[]) =>
    ({
      co2: { mode: 'auto', pricePerTonCents: 5_500 },
      energySources: [
        {
          co2Lots: prices.map((pricePerTonCents) => ({ pricePerTonCents })),
        },
      ],
    }) as unknown as HeatingCircuitTrace

  it('nennt alle Lospreise statt nur des Jahrespreises', () => {
    expect(co2PriceText(trace([4_500, 5_500, 5_500]))).toBe(
      '45,00 € / 55,00 € je t (je Brennstoff-Los nach Lieferjahr)',
    )
    expect(co2PriceText(trace([5_500]))).toBe('55,00 € je t')
    expect(co2PriceText(trace([]))).toBe('55,00 € je t')
  })
})

describe('Rechtstexte mit Warmwasserschlüssel', () => {
  it('nennt den Warmwasseranteil in der CO2-Verteilung', () => {
    expect(co2DistributionSentence(30, 70, 'heated_area', '19,34 %')).toContain(
      'der Warmwasseranteil (19,34 %, § 9 HeizKV)',
    )
    expect(co2DistributionSentence(30, 70, 'heated_area')).toContain(
      'Der Mieteranteil wird wie die Heizkosten zu 30 %',
    )
  })

  it('nennt im § 6a-Vergleich den tatsächlichen Warmwasserschlüssel', () => {
    const benchmark = {
      source: 'Quelle',
      category: 'Kategorie',
      referenceYear: 2024,
      includesHotWater: true,
    }
    expect(consumptionBenchmarkFootnote(benchmark, 'none', 'area')).toContain(
      'Warmwasser nach Fläche und Nutzungszeit',
    )
    expect(consumptionBenchmarkFootnote(benchmark, 'none')).toContain(
      'Warmwasser nach Personen und Nutzungszeit',
    )
  })
})
