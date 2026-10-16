import { describe, expect, it } from 'vitest'
import type { AppDataFile, HeatingCircuit } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const codes = (data: AppDataFile) =>
  validateBillingPeriod(data, 'period-1')
    .issues.filter(({ code }) =>
      [
        'heating.energy_balance_low',
        'heating.energy_balance_high',
        'heating.energy_quantity_missing',
        'heating.calorific_value_missing',
      ].includes(code),
    )
    .map(({ code }) => code)

/** Fiktiver Ölkessel: 1.000 l × 10 kWh/l = 10.000 kWh Energieeinsatz. */
function circuitData(
  patch: Partial<HeatingCircuit> = {},
  quantity: number | null = 1_000,
): AppDataFile {
  const data = validData()
  data.masterData.heatingSystems.push({
    id: 'system-1',
    propertyId: 'property-1',
  })
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
    ...patch,
  })
  data.billingData.energySources.push({
    id: 'oil',
    heatingCircuitId: 'circuit-1',
    key: 'haupt',
    sourceType: 'Heizöl',
    calorificValueKwhPerUnit: 10,
  })
  data.billingData.fuelDeliveries.push({
    id: 'delivery-1',
    energySourceId: 'oil',
    billingPeriodId: 'period-1',
    date: '2025-03-01',
    quantity: quantity === null ? null : { value: quantity, unit: 'l' },
    amountCents: 100_000,
  })
  return data
}

describe('Energiebilanz je Heizkreis (PR-32)', () => {
  it('meldet nichts bei plausiblem Nutzungsgrad oder ohne Wärmemessung', () => {
    expect(codes(circuitData({ generatedHeatKwh: 8_500 }))).toEqual([])
    expect(codes(circuitData())).toEqual([])
  })

  it('warnt bei Nutzungsgrad unter bzw. über dem Band', () => {
    expect(codes(circuitData({ generatedHeatKwh: 4_500 }))).toEqual([
      'heating.energy_balance_low',
    ])
    expect(codes(circuitData({ generatedHeatKwh: 9_900 }))).toEqual([
      'heating.energy_balance_high',
    ])
  })

  it('warnt bei Energiekosten ohne Menge', () => {
    expect(codes(circuitData({ generatedHeatKwh: 8_500 }, null))).toEqual([
      'heating.energy_quantity_missing',
    ])
  })
})
