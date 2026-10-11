import { describe, expect, it } from 'vitest'
import type {
  AppDataFile,
  FuelStock,
  HeatingCircuit,
  ValidationIssue,
} from '@nebenkosten/schema'
import { co2OpeningPriceIssues, validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const CODE = 'co2.opening_stock_price_missing'

function circuit(
  id: string,
  billingPeriodId: string,
  co2: HeatingCircuit['co2'],
): HeatingCircuit {
  return {
    id,
    billingPeriodId,
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
    co2,
  }
}

function withStock(
  stock: Partial<FuelStock> = {},
  co2: HeatingCircuit['co2'] = { mode: 'auto', co2PricePerTonCents: 5_500 },
): AppDataFile {
  const data = validData()
  data.masterData.heatingSystems.push({
    id: 'system-1',
    propertyId: 'property-1',
  })
  data.billingData.heatingCircuits.push(circuit('circuit-1', 'period-1', co2))
  data.billingData.energySources.push({
    id: 'source-1',
    heatingCircuitId: 'circuit-1',
    key: 'haupt',
    calorificValueKwhPerUnit: 10,
    co2FactorKgPerKwh: 0.266,
  })
  data.billingData.fuelStocks.push({
    id: 'stock-1',
    energySourceId: 'source-1',
    billingPeriodId: 'period-1',
    openingQuantity: { value: 1_000, unit: 'l' },
    openingValueCents: 90_000,
    remainingQuantity: { value: 200, unit: 'l' },
    ...stock,
  })
  return data
}

function withPreviousYear(data: AppDataFile, priceCents: number | null) {
  const current = data.billingData.billingPeriods[0]!
  data.billingData.billingPeriods.push({
    ...current,
    id: 'period-0',
    year: current.year - 1,
    periodStart: '2024-01-01',
    periodEnd: '2024-12-31',
  })
  data.billingData.heatingCircuits.push(
    circuit('circuit-0', 'period-0', {
      mode: 'auto',
      co2PricePerTonCents: priceCents,
    }),
  )
  return data
}

function issues(data: AppDataFile): ValidationIssue[] {
  const found: ValidationIssue[] = []
  co2OpeningPriceIssues(data, data.billingData.billingPeriods[0]!, (value) =>
    found.push(value),
  )
  return found
}

describe('CO₂-Preis des Anfangsbestands (ADR-0010, A12)', () => {
  it('warnt bei abweichendem Vorjahrespreis', () => {
    const [warning, ...rest] = issues(withPreviousYear(withStock(), 4_500))
    expect(rest).toEqual([])
    expect(warning).toMatchObject({
      severity: 'warning',
      code: CODE,
      area: 'co2',
      title:
        'CO₂-Preis des Anfangsbestands fehlt; es wird der Preis des Abrechnungsjahres angesetzt (§ 10 BEHG Lieferjahr)',
      entity: { type: 'FuelStock', id: 'stock-1' },
      path: ['openingCo2PricePerTonCents'],
    })
    expect(warning!.detail).toContain('Vorjahres 45,00 €/t')
    expect(warning!.detail).toContain('Abrechnungsjahres 55,00 €/t')
  })

  it('warnt, wenn der Vorjahrespreis nicht ermittelbar ist', () => {
    const [warning] = issues(withStock())
    expect(warning?.detail).toContain('nicht ermittelbar')
    expect(issues(withPreviousYear(withStock(), null))).toHaveLength(1)
  })

  it('schweigt bei gleichem Vorjahrespreis', () => {
    expect(issues(withPreviousYear(withStock(), 5_500))).toEqual([])
  })

  it('schweigt mit erfasstem Preis des Lieferjahres', () => {
    expect(issues(withStock({ openingCo2PricePerTonCents: 4_500 }))).toEqual([])
  })

  it('schweigt ohne Anfangsbestand', () => {
    expect(issues(withStock({ openingQuantity: null }))).toEqual([])
    expect(
      issues(withStock({ openingQuantity: { value: 0, unit: 'l' } })),
    ).toEqual([])
  })

  it('schweigt bei manuellen CO₂-Kosten und ohne CO₂-Faktor', () => {
    expect(issues(withStock({}, { mode: 'manual', levyCents: 1_000 }))).toEqual(
      [],
    )
    const data = withStock()
    data.billingData.energySources[0]!.co2FactorKgPerKwh = 0
    expect(issues(data)).toEqual([])
  })

  it('setzt ohne Jahrespreis die Vorgabe von 45 €/t an', () => {
    expect(issues(withPreviousYear(withStock({}, null), 4_500))).toEqual([])
  })

  it('ist in der Abrechnungsprüfung als Warnung registriert', () => {
    const report = validateBillingPeriod(
      withPreviousYear(withStock(), 4_500),
      'period-1',
    )
    const found = report.issues.filter(({ code }) => code === CODE)
    expect(found).toHaveLength(1)
    expect(found[0]!.severity).toBe('warning')
  })
})
