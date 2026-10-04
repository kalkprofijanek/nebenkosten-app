import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
  type OccupancyPeriod,
} from '@nebenkosten/schema'

// Fiktive Testdaten: ein Gebäude, drei Wohnungen à 50 m², Jahr 2025.
export function consumptionFixture(
  occupancies: Partial<
    Record<'o1' | 'o2' | 'o3', Partial<OccupancyPeriod>>
  > = {},
  status: 'DRAFT' | 'READY_FOR_PDF' = 'DRAFT',
): AppDataFile {
  const empty = createEmptyAppDataFile()
  const unit = (id: string) => ({
    id,
    propertyId: 'p',
    buildingId: 'b1',
    label: `Wohnung ${id.slice(1)}`,
    heatedAreaSqm: { value: 50, unit: 'm2' as const },
  })
  const occupancy = (
    id: 'o1' | 'o2' | 'o3',
    value: number | undefined,
  ): OccupancyPeriod => ({
    id,
    billingPeriodId: 'y',
    unitId: `u${id.slice(1)}`,
    tenancyId: `t${id.slice(1)}`,
    kind: 'tenant',
    ...(value === undefined
      ? {}
      : { consumptionUnits: { value, unit: 'einheiten' as const } }),
    ...occupancies[id],
  })
  return appDataFileSchema.parse({
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [{ id: 'org', name: 'Beispielverwaltung' }],
      ownerCompanies: [
        {
          id: 'oc',
          organizationId: 'org',
          name: 'Beispielbestand',
          additionalNameLines: [],
        },
      ],
      properties: [{ id: 'p', ownerCompanyId: 'oc' }],
      buildings: [
        { id: 'b1', propertyId: 'p', name: 'Haus A', mandateRefPrefixes: [] },
      ],
      units: [unit('u1'), unit('u2'), unit('u3')],
      persons: ['1', '2', '3'].map((n) => ({
        id: `pe${n}`,
        organizationId: 'org',
        displayName: `Fiktiv ${n}`,
      })),
      tenancies: ['1', '2', '3'].map((n) => ({
        id: `t${n}`,
        unitId: `u${n}`,
        personIds: [`pe${n}`],
      })),
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'y',
          propertyId: 'p',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status,
        },
      ],
      occupancyPeriods: [
        occupancy('o1', 400),
        occupancy('o2', 600),
        occupancy('o3', undefined),
      ],
    },
  })
}
