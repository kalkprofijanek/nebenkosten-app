import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

/** Fiktiver Heizkreis für Haus A mit gebäudebezogener Heizkostenart. */
function heatedData(): AppDataFile {
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
  })
  data.billingData.costCategories.push({
    id: 'heat-1',
    billingPeriodId: 'period-1',
    kind: 'heating',
    label: 'Fiktive Heizkosten',
    scope: { kind: 'building', buildingId: 'building-1' },
  })
  data.billingData.costEntries.push({
    id: 'heat-entry-1',
    costCategoryId: 'heat-1',
    amountCents: 50_000,
    receiptReference: 'BELEG-H1',
    externalPayment: { confirmed: true, reason: 'Fiktiver Testfall' },
  })
  data.billingData.occupancyPeriods[0] = {
    ...data.billingData.occupancyPeriods[0]!,
    consumptionUnits: { value: 120, unit: 'einheiten' },
  }
  return data
}

const find = (data: AppDataFile, code: string) =>
  validateBillingPeriod(data, 'period-1').issues.filter(
    (issue) => issue.code === code,
  )

describe('Zuordnung von Wohnungen zu Heizkreisen', () => {
  it('meldet bei vollständiger Zuordnung keine neuen Befunde', () => {
    const data = heatedData()
    expect(find(data, 'master_data.unit_building_missing')).toEqual([])
    expect(find(data, 'heating.circuit_without_units')).toEqual([])
    expect(find(data, 'heating.consumption_units_missing')).toEqual([])
  })

  it('sperrt eine Wohnung ohne Gebäude, wenn Heizkreise bestehen', () => {
    const data = heatedData()
    data.masterData.units.push({
      id: 'unit-2',
      propertyId: 'property-1',
      label: 'WE 02',
    })
    expect(find(data, 'master_data.unit_building_missing')).toEqual([
      expect.objectContaining({
        severity: 'error',
        area: 'master_data',
        entity: { type: 'Unit', id: 'unit-2' },
      }),
    ])
  })

  it('sperrt einen Heizkreis mit Heizkosten, aber ohne Nutzungen', () => {
    const data = heatedData()
    data.masterData.buildings.push({
      id: 'building-2',
      propertyId: 'property-1',
      name: 'Haus B',
      mandateRefPrefixes: ['B'],
    })
    data.billingData.heatingCircuits.push({
      id: 'circuit-2',
      billingPeriodId: 'period-1',
      heatingSystemId: 'system-1',
      buildingId: 'building-2',
      hasCentralHotWater: false,
    })
    data.billingData.costCategories.push({
      id: 'heat-2',
      billingPeriodId: 'period-1',
      kind: 'heating',
      label: 'Fiktive Heizkosten B',
      scope: { kind: 'building', buildingId: 'building-2' },
    })
    data.billingData.costEntries.push({
      id: 'heat-entry-2',
      costCategoryId: 'heat-2',
      amountCents: 30_000,
      receiptReference: 'BELEG-H2',
      externalPayment: { confirmed: true, reason: 'Fiktiver Testfall' },
    })
    expect(find(data, 'heating.circuit_without_units')).toEqual([
      expect.objectContaining({
        severity: 'error',
        area: 'heating',
        entity: { type: 'HeatingCircuit', id: 'circuit-2' },
      }),
    ])
  })

  it('verlangt eine Bestätigung für Mieter ohne Verbrauchseinheiten', () => {
    const data = heatedData()
    data.billingData.occupancyPeriods[0] = {
      ...data.billingData.occupancyPeriods[0]!,
      consumptionUnits: { value: 0, unit: 'einheiten' },
    }
    expect(find(data, 'heating.consumption_units_missing')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        area: 'occupancy',
        entity: { type: 'OccupancyPeriod', id: 'occupancy-1' },
      }),
    ])
  })

  it('übergeht Leerstände und Heizkreise im Messmodus', () => {
    const data = heatedData()
    data.billingData.occupancyPeriods[0] = {
      ...data.billingData.occupancyPeriods[0]!,
      kind: 'vacancy',
      consumptionUnits: undefined,
    }
    expect(find(data, 'heating.consumption_units_missing')).toEqual([])
    const metered = heatedData()
    metered.billingData.occupancyPeriods[0] = {
      ...metered.billingData.occupancyPeriods[0]!,
      consumptionUnits: undefined,
    }
    metered.billingData.heatingCircuits[0] = {
      ...metered.billingData.heatingCircuits[0]!,
      consumptionMode: 'metered_kwh',
    }
    expect(find(metered, 'heating.consumption_units_missing')).toEqual([])
  })
})
