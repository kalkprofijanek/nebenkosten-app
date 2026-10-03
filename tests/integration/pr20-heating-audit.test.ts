import { describe, expect, it } from 'vitest'
import { calculateBilling, createCalculationInput } from '@nebenkosten/core'
import { appDataFileSchema } from '@nebenkosten/schema'
import { buildAppDataFile } from '../characterization/build-app-data'
import { scenarios } from '../characterization/cases'

// Entirely fictional audit example; expectations are calculated by hand.
function auditData() {
  const base = buildAppDataFile(
    scenarios.find(({ id }) => id === 'case-06-heating-oil-fifo')!,
  )
  const source = base.billingData.energySources[0]!
  return appDataFileSchema.parse({
    ...base,
    billingData: {
      ...base.billingData,
      billingPeriods: base.billingData.billingPeriods.map((period) => ({
        ...period,
        heatingDefaults: {
          ...period.heatingDefaults,
          operatingElectricitySharePercent: 5,
        },
      })),
      heatingCircuits: base.billingData.heatingCircuits.map((circuit) => ({
        ...circuit,
        co2: { mode: 'manual', levyCents: 0, landlordSharePercent: 0 },
      })),
      fuelStocks: [
        {
          id: 'audit-stock',
          energySourceId: source.id,
          billingPeriodId: 'bp-1',
          openingQuantity: { value: 1000, unit: 'l' },
          openingValueCents: 80000,
          remainingQuantity: { value: 1800, unit: 'l' },
        },
      ],
      // Deliberately not in date order: FIFO must follow delivery date.
      fuelDeliveries: [
        {
          id: 'audit-october',
          date: '2024-10-15',
          quantity: { value: 1500, unit: 'l' },
          amountCents: 180000,
        },
        {
          id: 'audit-february',
          date: '2024-02-15',
          quantity: { value: 1200, unit: 'l' },
          amountCents: 132000,
        },
        {
          id: 'audit-june',
          date: '2024-06-15',
          quantity: { value: 800, unit: 'l' },
          amountCents: 72000,
        },
      ].map((delivery) => ({
        ...delivery,
        energySourceId: source.id,
        billingPeriodId: 'bp-1',
      })),
      costCategories: [
        {
          id: 'audit-heating',
          billingPeriodId: 'bp-1',
          kind: 'heating',
          label: 'Fiktive Heizungswartung',
          allocationKey: 'heated_area',
          scope: { kind: 'building', buildingId: 'B1' },
          totalAmountCents: 20000,
        },
        {
          id: 'audit-electricity',
          billingPeriodId: 'bp-1',
          kind: 'operating',
          label: 'Fiktiver Allgemeinstrom',
          allocationKey: 'usable_area',
          scope: { kind: 'property' },
          totalAmountCents: 20000,
          isOperatingElectricitySource: true,
        },
      ],
    },
  })
}

describe('PR20 fictional heating audit against the unchanged engine', () => {
  it('matches independently calculated FIFO, heating pool and unit totals', () => {
    const data = auditData()
    const before = JSON.stringify(data)
    const result = calculateBilling(createCalculationInput(data, 'bp-1'))
    const trace = result.heating.trace.circuits[0]!
    expect(trace.energySources[0]).toMatchObject({
      method: 'fifo',
      availableQuantity: 4500,
      availableValueCents: 464000,
      consumedQuantity: 2700,
      valuedRemainingQuantity: 1800,
      remainingValueCents: 207000,
      fifoConsumptionCostCents: 257000,
    })
    expect(
      trace.energySources[0]!.lots.map(({ sourceId }) => sourceId),
    ).toEqual(['audit-stock', 'audit-february', 'audit-june', 'audit-october'])
    // 1000*80 + 1200*110 + 500*90 = 257000 cents consumed.
    // 300*90 + 1500*120 = 207000 cents remain.
    expect(trace.reconciliation).toMatchObject({
      fifoConsumptionCostCents: 257000,
      minusCo2Cents: 0,
      minusHotWaterCents: 0,
      plusHeatingOperatingCostsCents: 20000,
      plusOperatingElectricityCents: 12850,
      heatingPoolCents: 289850,
      roundingDifferenceCents: 0,
    })
    expect(result.heating).toMatchObject({
      baseCostsCents: 86955,
      consumptionCostsCents: 202895,
    })
    // 40/60 area and consumption ratio; electricity balance is 7150 cents.
    expect(result.tenants.map(({ shareCents }) => shareCents)).toEqual([
      118800, 178200,
    ])
    expect(result.totals).toMatchObject({
      recordedCostsCents: 297000,
      tenantTotalCents: 297000,
      controlDifferenceCents: 0,
    })
    expect(JSON.stringify(data)).toBe(before)
  })

  it('documents that changing heat readings alone does not change allocated consumption', () => {
    const data = auditData()
    const withReadings = (end: number) =>
      appDataFileSchema.parse({
        ...data,
        masterData: {
          ...data.masterData,
          meters: [
            {
              id: 'audit-meter',
              propertyId: 'prop-1',
              kind: 'heat',
              meterNumber: 'FIKTIV-AUDIT-HEAT',
              energySourceRef: {
                heatingCircuitBuildingId: 'B1',
                energySourceKey: 'haupt',
              },
            },
          ],
        },
        billingData: {
          ...data.billingData,
          meterReadings: [
            {
              id: 'audit-start',
              meterId: 'audit-meter',
              billingPeriodId: 'bp-1',
              date: '2024-01-01',
              value: { value: 1000, unit: 'kWh' },
            },
            {
              id: 'audit-end',
              meterId: 'audit-meter',
              billingPeriodId: 'bp-1',
              date: '2024-12-31',
              value: { value: end, unit: 'kWh' },
            },
          ],
        },
      })
    expect(
      calculateBilling(createCalculationInput(withReadings(1100), 'bp-1')),
    ).toEqual(
      calculateBilling(createCalculationInput(withReadings(9000), 'bp-1')),
    )
  })
})
