import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'

export const meteringId = (index: number) =>
  `97000000-0000-4000-8000-${String(index).padStart(12, '0')}`

/** Exclusively fictional data for regression and browser/component tests. */
export function createMeteredFixture(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [{ id: meteringId(1), name: 'Fiktive Verwaltung' }],
      ownerCompanies: [
        {
          id: meteringId(2),
          organizationId: meteringId(1),
          name: 'Fiktive Firma',
          additionalNameLines: [],
        },
      ],
      properties: [{ id: meteringId(3), ownerCompanyId: meteringId(2) }],
      buildings: [
        {
          id: meteringId(4),
          propertyId: meteringId(3),
          name: 'Testhaus',
          mandateRefPrefixes: [],
        },
      ],
      units: [
        {
          id: meteringId(5),
          propertyId: meteringId(3),
          buildingId: meteringId(4),
          label: 'Wohnung 1',
          heatedAreaSqm: { value: 50, unit: 'm2' },
        },
      ],
      heatingSystems: [{ id: meteringId(6), propertyId: meteringId(3) }],
      meters: [
        {
          id: meteringId(7),
          propertyId: meteringId(3),
          kind: 'unit_heat',
          meterNumber: 'TEST-WMZ-1',
        },
      ],
      tenancies: [8, 9].map((id) => ({
        id: meteringId(id),
        unitId: meteringId(5),
        personIds: [],
      })),
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: meteringId(10),
          propertyId: meteringId(3),
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'DRAFT',
        },
      ],
      heatingCircuits: [
        {
          id: meteringId(11),
          billingPeriodId: meteringId(10),
          heatingSystemId: meteringId(6),
          buildingId: meteringId(4),
          hasCentralHotWater: false,
        },
      ],
      occupancyPeriods: [
        {
          id: meteringId(12),
          billingPeriodId: meteringId(10),
          unitId: meteringId(5),
          tenancyId: meteringId(8),
          kind: 'tenant',
          from: '2026-01-01',
          to: '2026-06-30',
          consumptionUnits: { value: 999, unit: 'einheiten' },
        },
        {
          id: meteringId(13),
          billingPeriodId: meteringId(10),
          unitId: meteringId(5),
          tenancyId: meteringId(9),
          kind: 'tenant',
          from: '2026-07-01',
          to: '2026-12-31',
          consumptionUnits: { value: 888, unit: 'einheiten' },
        },
      ],
      meterReadings: [
        {
          id: meteringId(14),
          meterId: meteringId(7),
          billingPeriodId: meteringId(10),
          date: '2026-01-01',
          boundary: 'start_of_day',
          source: 'manual',
          value: { value: 1000, unit: 'kWh' },
        },
        {
          id: meteringId(15),
          meterId: meteringId(7),
          billingPeriodId: meteringId(10),
          date: '2026-06-30',
          boundary: 'end_of_day',
          source: 'manual',
          value: { value: 1400, unit: 'kWh' },
        },
        {
          id: meteringId(16),
          meterId: meteringId(7),
          billingPeriodId: meteringId(10),
          date: '2026-12-31',
          boundary: 'end_of_day',
          source: 'manual',
          value: { value: 2000, unit: 'kWh' },
        },
      ],
    },
  }
}
