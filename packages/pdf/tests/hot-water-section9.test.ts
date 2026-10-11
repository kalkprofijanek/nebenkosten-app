import { describe, expect, it } from 'vitest'
import type { AppDataFile, HeatingCircuit } from '@nebenkosten/schema'
import { buildTenantStatement } from '../src/tenant-statement'
import { co2Table, heatingCompilationTable } from '../src/heating-summary'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

function text(value: unknown): string {
  return JSON.stringify(value)
}

/**
 * Fiktiver Heizkreis (4.000 l Heizöl, 40.000 kWh) mit Wartung, 5 %
 * Betriebsstromanteil aus dem Allgemeinstrom und CO2-Preis 45 €/t.
 */
function appData(
  patch: Partial<HeatingCircuit>,
  options: { vacancy?: boolean } = {},
): AppDataFile {
  const data = buildFixtureAppData('case-10-central-hot-water')
  const period = data.billingData.billingPeriods[0]!
  period.heatingDefaults = {
    ...period.heatingDefaults,
    operatingElectricitySharePercent: 5,
  }
  Object.assign(data.billingData.heatingCircuits[0]!, {
    co2: { mode: 'auto', co2PricePerTonCents: 4_500 },
    ...patch,
  })
  data.billingData.costCategories.push(
    {
      id: 'k-wartung',
      billingPeriodId: period.id,
      kind: 'heating',
      label: 'Wartung Heizung',
      allocationKey: 'heated_area',
      scope: { kind: 'building', buildingId: 'B1' },
      totalAmountCents: 30_000,
    },
    {
      id: 'k-strom',
      billingPeriodId: period.id,
      kind: 'operating',
      label: 'Allgemeinstrom',
      allocationKey: 'usable_area',
      scope: { kind: 'property' },
      totalAmountCents: 50_000,
      isOperatingElectricitySource: true,
    },
  )
  if (options.vacancy) {
    const second = data.billingData.occupancyPeriods[1]!
    Object.assign(second, { kind: 'vacancy', tenancyId: null, persons: null })
    data.billingData.prepayments = data.billingData.prepayments.filter(
      ({ occupancyPeriodId }) => occupancyPeriodId !== second.id,
    )
  }
  return data
}

function parseNumber(value: string): number {
  return Number(value.split('.').join('').replace(',', '.'))
}

describe('Warmwasser nach §§ 8, 9 HeizKV in der Einzelabrechnung', () => {
  it('zeigt Wärmemenge, Anteil s und die Warmwasseranteile je Kostenart', () => {
    const context = buildFixtureTenantStatementContext(
      appData(
        {
          hotWaterEnergy: { method: 'heat_meter', heatKwh: 8_000 },
          hotWaterAllocation: { key: 'area' },
        },
        { vacancy: true },
      ),
    )
    const serialized = text(buildTenantStatement(context).content)
    for (const expected of [
      'Wärmemenge laut Wärmezähler 8.000 kWh',
      'Anteil am Energieeinsatz 40.000 kWh: 20,00 %',
      '= Kosten des Betriebs der zentralen Anlage (Heizung und Warmwasser)',
      '− Anteil Warmwasser 20,00 % (§ 9 Abs. 1 HeizKV)',
      'davon Brennstoff-/Energiekosten',
      'davon Betriebsstrom',
      'davon Betriebskosten der Heizungsanlage',
      'davon Leerstand (trägt der Vermieter)',
      'Schätzung: 5 % der Brennstoffkosten',
      'kein Zwischenzähler',
      'Warmwasser nach Fläche (§ 8 Abs. 1 HeizKV): ',
      'davon Warmwasser (20,00 %, nach dem Warmwasserschlüssel)',
    ])
      expect(serialized).toContain(expected)
  })

  it('macht die Warmwasserzeile auf den Cent nachrechenbar', () => {
    const context = buildFixtureTenantStatementContext(
      appData(
        {
          hotWaterEnergy: {
            method: 'area_formula',
            reason: 'Weder Wärmemenge noch Volumen messbar',
          },
          hotWaterAllocation: { key: 'area' },
        },
        { vacancy: true },
      ),
    )
    const serialized = text(buildTenantStatement(context).content)
    const match =
      /Warmwasser nach Fläche \(§ 8 Abs\. 1 HeizKV\): ([\d.,]+) € : ([\d.,]+) m² = [\d.,]+ € je m² × ([\d.,]+) m² beheizte Fläche × (\d+)\/(\d+) Tage/u.exec(
        serialized,
      )
    expect(match).not.toBeNull()
    const [, pool, denominator, area, days, periodDays] = match!
    const recomputed =
      (parseNumber(pool!) / parseNumber(denominator!)) *
      parseNumber(area!) *
      (Number(days) / Number(periodDays))
    const tenant = context.calculation.tenants.find(
      ({ id }) => id === context.occupancyPeriod.id,
    )!
    expect(Math.round(recomputed * 100)).toBe(
      tenant.costBreakdown.hotWaterCents,
    )
    expect(serialized).toContain(
      'Q = 32 kWh/m² × 100,00 m² Wohnfläche der versorgten Einheiten = 3.200 kWh',
    )
  })

  it('zeigt beim Verbrauchsschlüssel beide Teile mit Nennern', () => {
    const data = appData({
      hotWaterEnergy: {
        method: 'volume_formula',
        volumeM3: 40,
        temperatureC: 55,
        temperatureEstimated: true,
      },
      hotWaterAllocation: { key: 'consumption', consumptionSharePercent: 70 },
    })
    data.billingData.occupancyPeriods[0]!.warmWater = { value: 30, unit: 'm3' }
    data.billingData.occupancyPeriods[1]!.warmWater = { value: 10, unit: 'm3' }
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(data)).content,
    )
    expect(serialized).toContain(
      'Q = 2,5 × 40,00 m³ × (55,0 °C (geschätzt) − 10) = 4.500 kWh',
    )
    expect(serialized).toContain('Warmwasser nach § 8 Abs. 1 HeizKV: 70 %')
    expect(serialized).toContain(': 40,0000 m³ = ')
    expect(serialized).toContain('× 30,000 m³ Ihr Warmwasserverbrauch')
    expect(serialized).toContain('30 % nach Fläche')
    expect(serialized).toContain(': 100,0000 m² = ')
  })

  it('weist den Pauschalanteil im Altverfahren als solchen aus', () => {
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData({})))
        .content,
    )
    expect(serialized).toContain(
      '− Kosten der Warmwasserbereitung (30 % der Brennstoffkosten, Pauschalanteil)',
    )
    expect(serialized).not.toContain('§ 9 Abs. 1 HeizKV)')
  })

  it('weist eine Rundungsdifferenz der Warmwasser-Einzelbeträge sichtbar aus', () => {
    const context = buildFixtureTenantStatementContext(
      appData({ hotWaterAllocation: { key: 'area' } }),
    )
    const circuit = context.calculation.heating.trace.circuits[0]!
    const table = text(
      heatingCompilationTable({
        ...circuit,
        warmWater: {
          ...circuit.warmWater,
          distribution: {
            tenantsCents: circuit.warmWater.poolCents - 1,
            vacancyCents: 0,
            section12ReductionCents: 0,
            roundingDifferenceCents: 1,
          },
        },
      }),
    )
    expect(table).toContain(
      'davon Rundungsdifferenz der Einzelbeträge (trägt der Vermieter)',
    )
    expect(table).toContain('0,01 €')
  })

  it('trennt den CO2-Mieteranteil in Heizung und Warmwasser', () => {
    const context = buildFixtureTenantStatementContext(
      appData({ hotWaterEnergy: { method: 'heat_meter', heatKwh: 8_000 } }),
    )
    const circuit = context.calculation.heating.trace.circuits[0]!
    const table = text(co2Table(context.appData, circuit))
    const hotWater = circuit.warmWater.costSplit!.co2TenantCents
    expect(hotWater).toBeGreaterThan(0)
    expect(table).toContain('davon Heizung (nach Grund- und Verbrauchsanteil)')
  })
})
