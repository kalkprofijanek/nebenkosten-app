import { describe, expect, it } from 'vitest'
import type { AppDataFile, HeatingCircuit } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const codes = (data: AppDataFile) =>
  validateBillingPeriod(data, 'period-1')
    .issues.filter(({ code }) => code.startsWith('heating_compliance.'))
    .map(({ code, severity }) => `${severity}:${code}`)
    .sort()

/** Fiktiver Heizkreis mit Heizöl und zentraler Warmwasserbereitung. */
function circuitData(patch: Partial<HeatingCircuit> = {}): AppDataFile {
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
    hasCentralHotWater: true,
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
    quantity: { value: 1_000, unit: 'l' },
    amountCents: 100_000,
  })
  return data
}

describe('Prüfung Warmwasser nach §§ 8, 9, 12 HeizKV', () => {
  it('meldet Pauschalanteil und Personenschlüssel im Altverfahren', () => {
    expect(codes(circuitData())).toEqual([
      'warning:heating_compliance.hot_water_flat_share',
      'warning:heating_compliance.hot_water_person_key',
    ])
  })

  it('prüft den Pauschalanteil 18–70 % nur ohne Wärmemenge nach § 9 Abs. 2', () => {
    const implausible = (data: AppDataFile) =>
      validateBillingPeriod(data, 'period-1').issues.some(
        ({ code }) => code === 'heating.hot_water_share_implausible',
      )
    expect(implausible(circuitData())).toBe(true)
    expect(
      implausible(
        circuitData({
          hotWaterEnergy: { method: 'heat_meter', heatKwh: 2_000 },
        }),
      ),
    ).toBe(false)
  })

  it('meldet nichts ohne zentrale Warmwasserbereitung', () => {
    expect(codes(circuitData({ hasCentralHotWater: false }))).toEqual([])
  })

  it('weist bei Flächenformel und Flächenschlüssel auf § 12 Abs. 1 hin', () => {
    expect(
      codes(
        circuitData({
          hotWaterEnergy: { method: 'area_formula', reason: 'kein Zähler' },
          hotWaterAllocation: { key: 'area' },
        }),
      ),
    ).toEqual(['warning:heating_compliance.hot_water_not_consumption_based'])
    const [issue] = validateBillingPeriod(
      circuitData({
        hotWaterEnergy: { method: 'heat_meter', heatKwh: 2_000 },
        hotWaterAllocation: { key: 'area' },
      }),
      'period-1',
    ).issues.filter(({ code }) => code.startsWith('heating_compliance.'))
    expect(issue?.detail).toContain('§ 12 Abs. 1 HeizKV um 15 %')
  })

  it('verlangt beim Verbrauchsschlüssel den Warmwasserverbrauch jeder Nutzung', () => {
    const data = circuitData({
      hotWaterEnergy: { method: 'heat_meter', heatKwh: 2_000 },
      hotWaterAllocation: { key: 'consumption', consumptionSharePercent: 70 },
    })
    expect(codes(data)).toEqual([
      'error:heating_compliance.hot_water_consumption_missing',
    ])
    data.billingData.occupancyPeriods[0]!.warmWater = { value: 12, unit: 'm3' }
    expect(codes(data)).toEqual([])
  })

  it('weist auf eine geschätzte Temperatur der Volumenformel hin', () => {
    expect(
      codes(
        circuitData({
          hotWaterEnergy: {
            method: 'volume_formula',
            volumeM3: 20,
            temperatureC: 55,
            temperatureEstimated: true,
          },
          hotWaterAllocation: { key: 'area' },
        }),
      ),
    ).toEqual([
      'info:heating_compliance.hot_water_temperature_estimated',
      'warning:heating_compliance.hot_water_not_consumption_based',
    ])
  })

  it('meldet fehlenden Energieeinsatz und begrenzten Anteil', () => {
    const missing = circuitData({
      hotWaterEnergy: { method: 'heat_meter', heatKwh: 2_000 },
      hotWaterAllocation: { key: 'area' },
    })
    missing.billingData.energySources[0]!.calorificValueKwhPerUnit = 0
    expect(codes(missing)).toContain(
      'error:heating_compliance.hot_water_energy_input_missing',
    )
    expect(
      codes(
        circuitData({
          hotWaterEnergy: { method: 'heat_meter', heatKwh: 50_000 },
          hotWaterAllocation: { key: 'area' },
        }),
      ),
    ).toContain('warning:heating_compliance.hot_water_share_capped')
  })
})
