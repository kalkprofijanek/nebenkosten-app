import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import { calculateBilling, createCalculationInput } from '../src'

function data(): AppDataFile {
  return {
    schemaVersion: 5,
    meta: { appVersion: 'vacancy-test' },
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
      meters: [],
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
          id: 'occ-vacant',
          billingPeriodId: 'p-2026',
          unitId: 'unit-a',
          kind: 'vacancy',
          from: '2026-01-01',
          to: '2026-03-31',
          consumptionUnits: { value: 100, unit: 'einheiten' },
        },
        {
          id: 'occ-tenant',
          billingPeriodId: 'p-2026',
          unitId: 'unit-a',
          kind: 'tenant',
          from: '2026-04-01',
          to: '2026-12-31',
          consumptionUnits: { value: 300, unit: 'einheiten' },
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
        },
      ],
      energySources: [],
      fuelStocks: [],
      fuelDeliveries: [],
      meterReadings: [],
      meterBillingStatuses: [],
      calculationRuns: [],
      calculationResults: [],
      documents: [],
      auditEvents: [],
    },
  } as unknown as AppDataFile
}

describe('Leerstand mit Heizverbrauch (§ 9b HeizKV)', () => {
  it('zählt die Verbrauchseinheiten des Leerstands im Heizkosten-Nenner mit', () => {
    const output = calculateBilling(createCalculationInput(data(), 'p-2026'))
    const breakdown = (id: string) =>
      output.tenants.find((tenant) => tenant.id === id)!.costBreakdown
    // 70 % Verbrauchskosten im Verhältnis 100 : 300 Einheiten
    expect(breakdown('occ-vacant').heatingConsumptionCents).toBe(17_500)
    expect(breakdown('occ-tenant').heatingConsumptionCents).toBe(52_500)
    const heating = ['occ-vacant', 'occ-tenant'].reduce(
      (sum, id) =>
        sum +
        breakdown(id).heatingBaseCents +
        breakdown(id).heatingConsumptionCents,
      0,
    )
    expect(heating).toBe(100_000)
    expect(Math.abs(output.totals.controlDifferenceCents)).toBeLessThanOrEqual(
      1,
    )
  })
})
