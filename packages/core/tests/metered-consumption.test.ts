import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import {
  calculateBilling,
  createCalculationInput,
  resolveMeteredConsumption,
} from '../src'
import type { CalculationInput } from '../src/contracts'

function fixture(): CalculationInput {
  return {
    sourceSchemaVersion: 5,
    billingPeriod: {
      id: 'p-2026',
      propertyId: 'property',
      year: 2026,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    },
    property: { id: 'property' },
    buildings: [{ id: 'building', propertyId: 'property' }],
    units: [{ id: 'unit-a', propertyId: 'property', buildingId: 'building' }],
    tenancies: [],
    occupancyPeriods: [
      {
        id: 'occ-a',
        billingPeriodId: 'p-2026',
        unitId: 'unit-a',
        kind: 'tenant',
        from: '2026-01-01',
        to: '2026-06-30',
      },
      {
        id: 'occ-b',
        billingPeriodId: 'p-2026',
        unitId: 'unit-a',
        kind: 'tenant',
        from: '2026-07-01',
        to: '2026-12-31',
      },
    ],
    prepayments: [],
    costCategories: [],
    costEntries: [],
    heatingSystems: [],
    heatingCircuits: [
      {
        id: 'circuit',
        billingPeriodId: 'p-2026',
        heatingSystemId: 'system',
        buildingId: 'building',
        hasCentralHotWater: false,
        consumptionMode: 'metered_kwh',
        meterAssignments: [{ meterId: 'meter', unitId: 'unit-a' }],
      },
    ],
    energySources: [],
    fuelStocks: [],
    fuelDeliveries: [],
    meters: [
      {
        id: 'meter',
        propertyId: 'property',
        kind: 'unit_heat',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
      },
    ],
    meterReadings: [
      {
        id: 'a-start',
        meterId: 'meter',
        billingPeriodId: 'p-2026',
        date: '2026-01-01',
        boundary: 'start_of_day',
        value: { value: 1000, unit: 'kWh' },
        source: 'manual',
      },
      {
        id: 'a-end',
        meterId: 'meter',
        billingPeriodId: 'p-2026',
        date: '2026-06-30',
        boundary: 'end_of_day',
        value: { value: 1400, unit: 'kWh' },
        source: 'manual',
      },
      {
        id: 'b-end',
        meterId: 'meter',
        billingPeriodId: 'p-2026',
        date: '2026-12-31',
        boundary: 'end_of_day',
        value: { value: 2000, unit: 'kWh' },
        source: 'manual',
      },
    ],
  } as unknown as CalculationInput
}

describe('resolveMeteredConsumption', () => {
  it('allocates exact boundary deltas to the inclusive occupancy periods', () => {
    const result = resolveMeteredConsumption(fixture())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.totalKwh).toBe('1000')
    expect(result.circuits[0]?.occupancies.map(({ kwh }) => kwh)).toEqual([
      '400',
      '600',
    ])
  })

  it('blocks duplicate effective boundaries rather than choosing a reading', () => {
    const input = fixture() as unknown as { meterReadings: unknown[] }
    input.meterReadings.push({
      id: 'a-end-duplicate',
      meterId: 'meter',
      billingPeriodId: 'p-2026',
      date: '2026-07-01',
      boundary: 'start_of_day',
      value: { value: 1400, unit: 'kWh' },
      source: 'manual',
    })
    const result = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(
      result.issues.some(({ code }) => code === 'metered.duplicate_boundary'),
    ).toBe(true)
  })

  it('accepts a true zero delta and does not use estimates', () => {
    const input = fixture() as unknown as {
      meterReadings: Array<Record<string, unknown>>
    }
    input.meterReadings[1] = {
      ...input.meterReadings[1],
      value: { value: 1000, unit: 'kWh' },
    }
    const zero = resolveMeteredConsumption(input as unknown as CalculationInput)
    expect(zero.ok && zero.circuits[0]?.occupancies[0]?.kwh).toBe('0')
    input.meterReadings[0] = { ...input.meterReadings[0], source: 'estimated' }
    const estimated = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(estimated.ok).toBe(false)
    if (!estimated.ok)
      expect(
        estimated.issues.some(
          ({ code }) => code === 'metered.reading_source_invalid',
        ),
      ).toBe(true)
  })

  it('blocks a unit with no occupancy periods in the selected building', () => {
    const input = fixture() as unknown as {
      units: unknown[]
      heatingCircuits: Array<Record<string, unknown>>
    }
    input.units.push({
      id: 'unit-empty',
      propertyId: 'property',
      buildingId: 'building',
    })
    const result = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(
        result.issues.some(
          ({ code, unitId }) =>
            code === 'metered.occupancy_missing' && unitId === 'unit-empty',
        ),
      ).toBe(true)
  })

  it('blocks an out-of-period reading even when its billing period matches', () => {
    const input = fixture() as unknown as {
      meterReadings: Array<Record<string, unknown>>
    }
    input.meterReadings.push({
      id: 'stale',
      meterId: 'meter',
      billingPeriodId: 'p-2026',
      date: '2025-12-31',
      boundary: 'start_of_day',
      value: { value: 900, unit: 'kWh' },
      source: 'manual',
    })
    const result = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(
        result.issues.some(
          ({ code }) => code === 'metered.reading_date_invalid',
        ),
      ).toBe(true)
  })

  it('blocks a meter assigned to a manual circuit elsewhere in the same year', () => {
    const input = fixture() as unknown as {
      heatingCircuits: Array<Record<string, unknown>>
    }
    input.heatingCircuits.push({
      id: 'manual-circuit',
      billingPeriodId: 'p-2026',
      heatingSystemId: 'system',
      buildingId: 'other-building',
      hasCentralHotWater: false,
      consumptionMode: 'manual',
      meterAssignments: [{ meterId: 'meter', unitId: 'unit-a' }],
    })
    const result = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(
        result.issues.some(
          ({ code }) => code === 'metered.duplicate_assignment',
        ),
      ).toBe(true)
  })

  it('blocks an occupancy gap and a decreasing meter register', () => {
    const gapInput = fixture() as unknown as {
      occupancyPeriods: Array<Record<string, unknown>>
    }
    gapInput.occupancyPeriods[0] = {
      ...gapInput.occupancyPeriods[0],
      to: '2026-06-29',
    }
    const gap = resolveMeteredConsumption(
      gapInput as unknown as CalculationInput,
    )
    expect(gap.ok).toBe(false)
    if (!gap.ok)
      expect(
        gap.issues.some(({ code }) => code === 'metered.occupancy_gap'),
      ).toBe(true)

    const decreasingInput = fixture() as unknown as {
      meterReadings: Array<Record<string, unknown>>
    }
    decreasingInput.meterReadings[1] = {
      ...decreasingInput.meterReadings[1],
      value: { value: 900, unit: 'kWh' },
    }
    const decreasing = resolveMeteredConsumption(
      decreasingInput as unknown as CalculationInput,
    )
    expect(decreasing.ok).toBe(false)
    if (!decreasing.ok)
      expect(
        decreasing.issues.some(
          ({ code }) => code === 'metered.reading_decreased',
        ),
      ).toBe(true)
  })

  it('blocks a reading in another unit', () => {
    const input = fixture() as unknown as {
      meterReadings: Array<Record<string, unknown>>
    }
    input.meterReadings[0] = {
      ...input.meterReadings[0],
      value: { value: 1000, unit: 'm3' },
    }
    const result = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(
        result.issues.some(({ code }) => code === 'metered.unit_invalid'),
      ).toBe(true)
  })

  it('does not let a next-year start reading replace the current year end', () => {
    const input = fixture() as unknown as {
      meterReadings: Array<Record<string, unknown>>
    }
    input.meterReadings.push({
      id: 'next-year-start',
      meterId: 'meter',
      billingPeriodId: 'p-2027',
      date: '2027-01-01',
      boundary: 'start_of_day',
      value: { value: 2000, unit: 'kWh' },
      source: 'manual',
    })
    const result = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.totalKwh).toBe('1000')
    expect(result.circuits[0]?.occupancies.map(({ kwh }) => kwh)).toEqual([
      '400',
      '600',
    ])
  })

  it('reports a required boundary missing when it is assigned to another year', () => {
    const input = fixture() as unknown as {
      meterReadings: Array<Record<string, unknown>>
    }
    input.meterReadings[0] = {
      ...input.meterReadings[0],
      billingPeriodId: 'p-2027',
    }
    const result = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(
        result.issues.some(
          ({ code, occupancyId }) =>
            code === 'metered.boundary_missing' && occupancyId === 'occ-a',
        ),
      ).toBe(true)
  })

  it('sums compatible meters assigned to one unit', () => {
    const input = fixture() as unknown as {
      meters: Array<Record<string, unknown>>
      heatingCircuits: Array<{
        meterAssignments: Array<{ meterId: string; unitId: string }>
      }>
      meterReadings: Array<Record<string, unknown>>
    }
    input.meters.push({
      id: 'meter-2',
      propertyId: 'property',
      kind: 'unit_heat',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
    })
    input.heatingCircuits[0]!.meterAssignments.push({
      meterId: 'meter-2',
      unitId: 'unit-a',
    })
    input.meterReadings.push(
      {
        id: 'second-start',
        meterId: 'meter-2',
        billingPeriodId: 'p-2026',
        date: '2026-01-01',
        boundary: 'start_of_day',
        value: { value: 200, unit: 'kWh' },
        source: 'manual',
      },
      {
        id: 'second-mid',
        meterId: 'meter-2',
        billingPeriodId: 'p-2026',
        date: '2026-06-30',
        boundary: 'end_of_day',
        value: { value: 300, unit: 'kWh' },
        source: 'manual',
      },
      {
        id: 'second-end',
        meterId: 'meter-2',
        billingPeriodId: 'p-2026',
        date: '2026-12-31',
        boundary: 'end_of_day',
        value: { value: 500, unit: 'kWh' },
        source: 'manual',
      },
    )
    const result = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(result.ok && result.totalKwh).toBe('1300')
    expect(
      result.ok && result.circuits[0]?.occupancies.map(({ kwh }) => kwh),
    ).toEqual(['500', '800'])
  })

  it('blocks an occupancy when its middle boundary is missing', () => {
    const input = fixture() as unknown as {
      meterReadings: Array<Record<string, unknown>>
    }
    input.meterReadings.splice(1, 1)
    const result = resolveMeteredConsumption(
      input as unknown as CalculationInput,
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(
        result.issues.some(
          ({ code, occupancyId }) =>
            code === 'metered.boundary_missing' && occupancyId === 'occ-a',
        ),
      ).toBe(true)
  })
})

describe('calculateBilling with metered heat', () => {
  it('allocates heating by measured kWh and includes vacancy in its denominator', () => {
    const data = {
      schemaVersion: 5,
      meta: { appVersion: 'meter-test' },
      masterData: {
        organizations: [{ id: 'org', name: 'Test' }],
        ownerCompanies: [
          {
            id: 'owner',
            organizationId: 'org',
            name: 'Test',
            additionalNameLines: [],
            address: { street: 'Test', postalCodeAndCity: '12345 Test' },
          },
        ],
        properties: [
          {
            id: 'property',
            ownerCompanyId: 'owner',
            address: { street: 'Test', postalCodeAndCity: '12345 Test' },
          },
        ],
        buildings: [
          {
            id: 'building',
            propertyId: 'property',
            name: 'Test',
            mandateRefPrefixes: [],
          },
        ],
        units: [
          {
            id: 'unit-a',
            propertyId: 'property',
            buildingId: 'building',
            usableAreaSqm: { value: 50, unit: 'm2' },
            heatedAreaSqm: { value: 50, unit: 'm2' },
          },
        ],
        persons: [],
        tenancies: [],
        allocationRules: [],
        heatingSystems: [{ id: 'system', propertyId: 'property' }],
        meters: [
          {
            id: 'meter',
            propertyId: 'property',
            kind: 'unit_heat',
            validFrom: '2026-01-01',
            validTo: '2026-12-31',
          },
        ],
      },
      billingData: {
        billingPeriods: [
          {
            id: 'p-2026',
            propertyId: 'property',
            year: 2026,
            periodStart: '2026-01-01',
            periodEnd: '2026-12-31',
            status: 'DRAFT',
            heatingDefaults: {
              consumptionSharePercent: 70,
              baseSharePercent: 30,
            },
          },
        ],
        occupancyPeriods: [
          {
            id: 'occ-tenant',
            billingPeriodId: 'p-2026',
            unitId: 'unit-a',
            kind: 'tenant',
            from: '2026-01-01',
            to: '2026-09-30',
            consumptionUnits: { value: 999, unit: 'einheiten' },
          },
          {
            id: 'occ-vacant',
            billingPeriodId: 'p-2026',
            unitId: 'unit-a',
            kind: 'vacancy',
            from: '2026-10-01',
            to: '2026-12-31',
            consumptionUnits: { value: 888, unit: 'einheiten' },
          },
        ],
        prepayments: [],
        costCategories: [
          {
            id: 'heat-cost',
            billingPeriodId: 'p-2026',
            kind: 'heating',
            label: 'Heizkosten',
            allocationKey: 'consumption_units',
            scope: { kind: 'building', buildingId: 'building' },
            totalAmountCents: 100_000,
          },
          {
            id: 'general-cost',
            billingPeriodId: 'p-2026',
            kind: 'water',
            label: 'Allgemeiner Verbrauch',
            allocationKey: 'consumption_units',
            scope: { kind: 'property' },
            totalAmountCents: 20_000,
          },
        ],
        costEntries: [],
        bankBookings: [],
        heatingCircuits: [
          {
            id: 'circuit',
            billingPeriodId: 'p-2026',
            heatingSystemId: 'system',
            buildingId: 'building',
            hasCentralHotWater: false,
            consumptionMode: 'metered_kwh',
            meterAssignments: [{ meterId: 'meter', unitId: 'unit-a' }],
          },
        ],
        energySources: [],
        fuelStocks: [],
        fuelDeliveries: [],
        meterReadings: [
          {
            id: 'r-start',
            meterId: 'meter',
            billingPeriodId: 'p-2026',
            date: '2026-01-01',
            boundary: 'start_of_day',
            value: { value: 0, unit: 'kWh' },
            source: 'manual',
          },
          {
            id: 'r-mid',
            meterId: 'meter',
            billingPeriodId: 'p-2026',
            date: '2026-09-30',
            boundary: 'end_of_day',
            value: { value: 900, unit: 'kWh' },
            source: 'manual',
          },
          {
            id: 'r-end',
            meterId: 'meter',
            billingPeriodId: 'p-2026',
            date: '2026-12-31',
            boundary: 'end_of_day',
            value: { value: 1000, unit: 'kWh' },
            source: 'manual',
          },
        ],
        meterBillingStatuses: [],
        calculationRuns: [],
        calculationResults: [],
        documents: [],
        auditEvents: [],
      },
    } as unknown as AppDataFile
    const output = calculateBilling(createCalculationInput(data, 'p-2026'))
    expect(output.meteringTrace?.totalKwh).toBe('1000')
    expect(
      output.meteringTrace?.circuits[0]?.occupancies.map(({ kwh }) => kwh),
    ).toEqual(['900', '100'])
    expect(
      output.tenants.find(({ id }) => id === 'occ-tenant')?.shareCents,
    ).toBe(105_438)
    expect(
      output.tenants.find(({ id }) => id === 'occ-vacant')?.shareCents,
    ).toBe(32_339)
    expect(
      output.tenants
        .find(({ id }) => id === 'occ-tenant')
        ?.costBreakdown.operatingByCategory.find(
          ({ costCategoryId }) => costCategoryId === 'general-cost',
        )?.amountCents,
    ).toBe(20_000)
  })
})
