import { CURRENT_SCHEMA_VERSION, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { createCalculationInput } from '../src/input/create-calculation-input'

function buildAppData(): AppDataFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { appVersion: 'input-test' },
    masterData: {
      organizations: [{ id: 'org-1', name: 'Testverwaltung' }],
      ownerCompanies: [
        {
          id: 'owner-1',
          organizationId: 'org-1',
          name: 'Testbestand',
          additionalNameLines: [],
        },
      ],
      properties: [
        { id: 'property-1', ownerCompanyId: 'owner-1' },
        { id: 'property-2', ownerCompanyId: 'owner-1' },
      ],
      buildings: [
        {
          id: 'building-1',
          propertyId: 'property-1',
          name: 'Haus 1',
          mandateRefPrefixes: ['H1'],
        },
        {
          id: 'building-2',
          propertyId: 'property-2',
          name: 'Haus 2',
          mandateRefPrefixes: ['H2'],
        },
      ],
      units: [
        {
          id: 'unit-1',
          propertyId: 'property-1',
          buildingId: 'building-1',
        },
        {
          id: 'unit-2',
          propertyId: 'property-2',
          buildingId: 'building-2',
        },
      ],
      persons: [{ id: 'person-1', organizationId: 'org-1' }],
      tenancies: [
        {
          id: 'tenancy-1',
          unitId: 'unit-1',
          personIds: ['person-1'],
        },
      ],
      allocationRules: [],
      heatingSystems: [{ id: 'heating-system-1', propertyId: 'property-1' }],
      meters: [{ id: 'meter-1', propertyId: 'property-1', kind: 'heat' }],
    },
    billingData: {
      billingPeriods: [
        {
          id: 'period-1',
          propertyId: 'property-1',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
        },
        {
          id: 'period-2',
          propertyId: 'property-2',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
        },
      ],
      occupancyPeriods: [
        {
          id: 'occupancy-1',
          billingPeriodId: 'period-1',
          unitId: 'unit-1',
          tenancyId: 'tenancy-1',
          kind: 'tenant',
        },
        {
          id: 'occupancy-2',
          billingPeriodId: 'period-2',
          unitId: 'unit-2',
          tenancyId: null,
          kind: 'vacancy',
        },
      ],
      prepayments: [
        {
          id: 'prepayment-1',
          occupancyPeriodId: 'occupancy-1',
          mode: 'annual',
          annualAmountCents: 12_000,
        },
      ],
      costCategories: [
        {
          id: 'cost-1',
          billingPeriodId: 'period-1',
          kind: 'operating',
          label: 'Grundsteuer',
          totalAmountCents: 10_000,
        },
        {
          id: 'cost-2',
          billingPeriodId: 'period-2',
          kind: 'operating',
          label: 'Fremde Kosten',
          totalAmountCents: 20_000,
        },
      ],
      costEntries: [
        {
          id: 'entry-1',
          costCategoryId: 'cost-1',
          amountCents: 10_000,
        },
        {
          id: 'entry-2',
          costCategoryId: 'cost-2',
          amountCents: 20_000,
        },
      ],
      bankBookings: [],
      heatingCircuits: [
        {
          id: 'circuit-1',
          billingPeriodId: 'period-1',
          heatingSystemId: 'heating-system-1',
          buildingId: 'building-1',
          hasCentralHotWater: false,
        },
      ],
      energySources: [
        {
          id: 'energy-1',
          heatingCircuitId: 'circuit-1',
          key: 'gas',
        },
      ],
      fuelStocks: [
        {
          id: 'stock-1',
          energySourceId: 'energy-1',
          billingPeriodId: 'period-1',
        },
      ],
      fuelDeliveries: [
        {
          id: 'delivery-1',
          energySourceId: 'energy-1',
          billingPeriodId: 'period-1',
        },
      ],
      meterReadings: [
        {
          id: 'reading-1',
          meterId: 'meter-1',
          billingPeriodId: 'period-1',
          value: { value: 1_000, unit: 'kWh' },
        },
      ],
      meterBillingStatuses: [],
      calculationRuns: [],
      calculationResults: [],
      documents: [],
      auditEvents: [],
    },
  }
}

describe('createCalculationInput', () => {
  it('selektiert nur den verbundenen Abrechnungszeitraum und die Liegenschaft', () => {
    const input = createCalculationInput(buildAppData(), 'period-1')

    expect(input.billingPeriod.id).toBe('period-1')
    expect(input.property.id).toBe('property-1')
    expect(input.buildings.map(({ id }) => id)).toEqual(['building-1'])
    expect(input.units.map(({ id }) => id)).toEqual(['unit-1'])
    expect(input.occupancyPeriods.map(({ id }) => id)).toEqual(['occupancy-1'])
    expect(input.costCategories.map(({ id }) => id)).toEqual(['cost-1'])
    expect(input.costEntries.map(({ id }) => id)).toEqual(['entry-1'])
    expect(input.heatingCircuits.map(({ id }) => id)).toEqual(['circuit-1'])
    expect(input.energySources.map(({ id }) => id)).toEqual(['energy-1'])
  })

  it('liefert einen vom AppDataFile entkoppelten, tief eingefrorenen Snapshot', () => {
    const appData = buildAppData()
    const input = createCalculationInput(appData, 'period-1')

    appData.masterData.buildings[0]!.name = 'Nachträglich geändert'

    expect(input.buildings[0]!.name).toBe('Haus 1')
    expect(Object.isFrozen(input)).toBe(true)
    expect(Object.isFrozen(input.buildings)).toBe(true)
    expect(Object.isFrozen(input.buildings[0])).toBe(true)
  })

  it('weist eine unbekannte Abrechnungsperiode verständlich zurück', () => {
    expect(() =>
      createCalculationInput(buildAppData(), 'missing-period'),
    ).toThrowError(/Abrechnungsperiode "missing-period" nicht gefunden/)
  })

  it('weist fehlende Fremdschlüssel im ausgewählten Graphen zurück', () => {
    const appData = buildAppData()
    const invalid = {
      ...appData,
      billingData: {
        ...appData.billingData,
        occupancyPeriods: [
          {
            ...appData.billingData.occupancyPeriods[0]!,
            unitId: 'missing-unit',
          },
          appData.billingData.occupancyPeriods[1]!,
        ],
      },
    }

    expect(() => createCalculationInput(invalid, 'period-1')).toThrowError(
      /OccupancyPeriod "occupancy-1" verweist auf unbekannte Unit "missing-unit"/,
    )
  })

  it('ignoriert defekte Referenzen außerhalb des ausgewählten Zeitraums', () => {
    const appData = buildAppData()
    const unrelatedBrokenReference: AppDataFile = {
      ...appData,
      billingData: {
        ...appData.billingData,
        occupancyPeriods: appData.billingData.occupancyPeriods.map((period) =>
          period.id === 'occupancy-2'
            ? { ...period, unitId: 'missing-unit' }
            : period,
        ),
      },
    }

    expect(
      createCalculationInput(unrelatedBrokenReference, 'period-1')
        .occupancyPeriods,
    ).toHaveLength(1)
  })

  it.each([
    {
      label: 'Vorauszahlung',
      mutate: (appData: AppDataFile) => {
        appData.billingData.prepayments[0]!.occupancyPeriodId =
          'missing-occupancy'
      },
      message: /Prepayment "prepayment-1".*"missing-occupancy"/,
    },
    {
      label: 'Kostenbeleg',
      mutate: (appData: AppDataFile) => {
        appData.billingData.costEntries[0]!.costCategoryId = 'missing-category'
      },
      message: /CostEntry "entry-1".*"missing-category"/,
    },
    {
      label: 'Energiequelle',
      mutate: (appData: AppDataFile) => {
        appData.billingData.energySources[0]!.heatingCircuitId =
          'missing-circuit'
      },
      message: /EnergySource "energy-1".*"missing-circuit"/,
    },
    {
      label: 'Brennstoffbestand',
      mutate: (appData: AppDataFile) => {
        appData.billingData.fuelStocks[0]!.energySourceId = 'missing-energy'
      },
      message: /FuelStock "stock-1".*"missing-energy"/,
    },
    {
      label: 'Brennstofflieferung',
      mutate: (appData: AppDataFile) => {
        appData.billingData.fuelDeliveries[0]!.energySourceId = 'missing-energy'
      },
      message: /FuelDelivery "delivery-1".*"missing-energy"/,
    },
    {
      label: 'Zählerstand',
      mutate: (appData: AppDataFile) => {
        appData.billingData.meterReadings[0]!.meterId = 'missing-meter'
      },
      message: /MeterReading "reading-1".*"missing-meter"/,
    },
  ])('weist eine defekte $label-Referenz zurück', ({ mutate, message }) => {
    const appData = buildAppData()
    mutate(appData)

    expect(() => createCalculationInput(appData, 'period-1')).toThrowError(
      message,
    )
  })
})
