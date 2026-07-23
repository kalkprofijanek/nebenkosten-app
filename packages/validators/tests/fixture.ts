import { CURRENT_SCHEMA_VERSION, type AppDataFile } from '@nebenkosten/schema'

export function validData(): AppDataFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { appVersion: 'validator-test' },
    masterData: {
      organizations: [{ id: 'org-1', name: 'Beispielverwaltung' }],
      ownerCompanies: [
        {
          id: 'owner-1',
          organizationId: 'org-1',
          name: 'Beispiel Eigentum',
          additionalNameLines: [],
          address: {
            street: 'Musterweg',
            postalCodeAndCity: '12345 Beispielstadt',
          },
          bankAccount: { iban: ['DE89', '370400440532013000'].join('') },
        },
      ],
      properties: [
        {
          id: 'property-1',
          ownerCompanyId: 'owner-1',
          address: {
            street: 'Objektweg',
            postalCodeAndCity: '12345 Beispielstadt',
          },
        },
      ],
      buildings: [
        {
          id: 'building-1',
          propertyId: 'property-1',
          name: 'Haus A',
          mandateRefPrefixes: ['A'],
        },
      ],
      units: [
        {
          id: 'unit-1',
          propertyId: 'property-1',
          buildingId: 'building-1',
          usableAreaSqm: { value: 60, unit: 'm2' },
          heatedAreaSqm: { value: 55, unit: 'm2' },
        },
      ],
      persons: [
        { id: 'person-1', organizationId: 'org-1', displayName: 'Testperson' },
      ],
      tenancies: [
        { id: 'tenancy-1', unitId: 'unit-1', personIds: ['person-1'] },
      ],
      allocationRules: [],
      heatingSystems: [],
      meters: [],
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
      ],
      occupancyPeriods: [
        {
          id: 'occupancy-1',
          billingPeriodId: 'period-1',
          unitId: 'unit-1',
          tenancyId: 'tenancy-1',
          kind: 'tenant',
        },
      ],
      prepayments: [
        {
          id: 'prepayment-1',
          occupancyPeriodId: 'occupancy-1',
          mode: 'annual',
          annualAmountCents: 8_000,
        },
      ],
      costCategories: [
        {
          id: 'category-1',
          billingPeriodId: 'period-1',
          kind: 'operating',
          label: 'Beispielkosten',
          standardKey: 'example',
          allocationKey: 'usable_area',
          totalAmountCents: 10_000,
        },
      ],
      costEntries: [
        {
          id: 'entry-1',
          costCategoryId: 'category-1',
          amountCents: 10_000,
          receiptReference: 'BELEG-1',
          externalPayment: { confirmed: true, reason: 'Fiktiver Testfall' },
        },
      ],
      bankBookings: [],
      heatingCircuits: [],
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
  }
}
