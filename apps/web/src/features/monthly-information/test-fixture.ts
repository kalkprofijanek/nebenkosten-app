/**
 * Frei erfundener Datenbestand für die Tests der Monatsinformation.
 * Haus A: zentrales Warmwasser (Warmwasserzähler je Wohnung),
 * Haus B: dezentrales Warmwasser.
 */
import {
  createEmptyAppDataFile,
  type AppDataFile,
  type HeatingCircuit,
  type MeterReading,
} from '@nebenkosten/schema'

export const ID = (n: number) =>
  `46000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const PROPERTY = ID(1)
export const PERIOD_2025 = ID(20)
export const PERIOD_2026 = ID(21)
export const UNIT_A = ID(5)
export const UNIT_B = ID(6)
export const HEAT_A = ID(30)
export const HEAT_B = ID(31)
export const WATER_A = ID(32)

let counter = 0
export function reading(
  meterId: string,
  date: string,
  value: number,
): MeterReading {
  counter += 1
  return {
    id: ID(1000 + counter),
    meterId,
    date,
    value: { value, unit: meterId === WATER_A ? 'm3' : 'kWh' },
    source: 'imported',
    boundary: 'end_of_day',
  }
}

function circuit(
  id: number,
  billingPeriodId: string,
  buildingId: string,
  patch: Partial<HeatingCircuit>,
): HeatingCircuit {
  return {
    id: ID(id),
    billingPeriodId,
    heatingSystemId: ID(40),
    buildingId,
    hasCentralHotWater: false,
    ...patch,
  }
}

export function monthlyFixture(): AppDataFile {
  const file = createEmptyAppDataFile()
  const master = file.masterData
  master.organizations = [{ id: ID(2), name: 'Beispielverwaltung' }]
  master.ownerCompanies = [
    {
      id: ID(3),
      organizationId: ID(2),
      name: 'Beispiel Eigentum',
      additionalNameLines: [],
    },
  ]
  master.properties = [{ id: PROPERTY, ownerCompanyId: ID(3) }]
  master.buildings = [
    {
      id: ID(10),
      propertyId: PROPERTY,
      name: 'Haus A',
      mandateRefPrefixes: [],
    },
    {
      id: ID(11),
      propertyId: PROPERTY,
      name: 'Haus B',
      mandateRefPrefixes: [],
    },
  ]
  master.units = [
    {
      id: UNIT_A,
      propertyId: PROPERTY,
      buildingId: ID(10),
      label: 'EG links',
      heatedAreaSqm: { value: 80, unit: 'm2' },
    },
    {
      id: UNIT_B,
      propertyId: PROPERTY,
      buildingId: ID(11),
      label: 'OG rechts',
    },
  ]
  master.persons = [
    {
      id: ID(8),
      organizationId: ID(2),
      firstName: 'Erika',
      lastName: 'Beispiel',
    },
    { id: ID(9), organizationId: ID(2), firstName: 'Max', lastName: 'Muster' },
  ]
  master.tenancies = [
    { id: ID(12), unitId: UNIT_A, personIds: [ID(8)], movedIn: '2020-01-01' },
    { id: ID(13), unitId: UNIT_B, personIds: [ID(9)], movedIn: '2026-01-01' },
  ]
  master.meters = [
    {
      id: HEAT_A,
      propertyId: PROPERTY,
      kind: 'unit_heat',
      meterNumber: 'HZ-1',
    },
    {
      id: HEAT_B,
      propertyId: PROPERTY,
      kind: 'unit_heat',
      meterNumber: 'HZ-2',
    },
    {
      id: WATER_A,
      propertyId: PROPERTY,
      kind: 'unit_hot_water',
      meterNumber: 'WW-1',
    },
  ]
  master.heatingSystems = [{ id: ID(40), propertyId: PROPERTY }]

  const billing = file.billingData
  billing.billingPeriods = [2025, 2026].map((year) => ({
    id: year === 2025 ? PERIOD_2025 : PERIOD_2026,
    propertyId: PROPERTY,
    year,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    status: 'DRAFT' as const,
  }))
  billing.heatingCircuits = [PERIOD_2025, PERIOD_2026].flatMap(
    (periodId, index) => [
      circuit(50 + index * 2, periodId, ID(10), {
        hasCentralHotWater: true,
        meterAssignments: [{ meterId: HEAT_A, unitId: UNIT_A }],
        hotWaterMeterAssignments: [{ meterId: WATER_A, unitId: UNIT_A }],
        consumptionBenchmark: {
          source: 'Fiktive Vergleichsquelle',
          referenceYear: 2025,
          category: 'Erdgas, fiktiv',
          includesHotWater: false,
          lowMaxKwhPerSqmYear: 70,
          mediumMaxKwhPerSqmYear: 130,
          elevatedMaxKwhPerSqmYear: 200,
        },
      }),
      circuit(51 + index * 2, periodId, ID(11), {
        meterAssignments: [{ meterId: HEAT_B, unitId: UNIT_B }],
      }),
    ],
  )
  billing.occupancyPeriods = [
    {
      id: ID(60),
      billingPeriodId: PERIOD_2025,
      unitId: UNIT_A,
      tenancyId: ID(12),
      kind: 'tenant',
    },
    {
      id: ID(61),
      billingPeriodId: PERIOD_2026,
      unitId: UNIT_A,
      tenancyId: ID(12),
      kind: 'tenant',
    },
    {
      id: ID(62),
      billingPeriodId: PERIOD_2026,
      unitId: UNIT_B,
      tenancyId: ID(13),
      kind: 'tenant',
    },
  ]
  billing.meterReadings = [
    reading(HEAT_A, '2026-01-31', 9000),
    reading(HEAT_A, '2026-02-28', 10000),
    reading(HEAT_A, '2026-03-31', 10850.4),
    reading(WATER_A, '2026-02-28', 100),
    reading(WATER_A, '2026-03-31', 103.456),
    reading(HEAT_B, '2026-03-31', 2620),
  ]
  return file
}
