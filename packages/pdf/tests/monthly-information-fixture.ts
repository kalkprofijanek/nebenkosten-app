/**
 * Fiktive Testdaten für die monatliche Verbrauchsinformation (§ 6a HeizKV,
 * ADR-0014 Schritt 3). Alle Namen, Anschriften und Zählerstände sind frei
 * erfunden.
 */
import type {
  AppDataFile,
  BillingPeriod,
  ConsumptionBenchmark,
  HeatingCircuit,
  MeterReading,
} from '@nebenkosten/schema'
import { createEmptyAppDataFile } from '@nebenkosten/schema'
import {
  calculateMonthlyConsumptionInformation,
  type MonthlyConsumptionInformation,
  type MonthlyTenantConsumption,
} from '@nebenkosten/core'
import type { MonthlyInformationStatementContext } from '../src/monthly-information-statement'

export const MONTH = '2026-10'

export interface MonthlyFixtureOptions {
  /** Zentrales Warmwasser mit Wohnungs-Warmwasserzähler (Standard: ja). */
  readonly hotWater?: boolean
  /** Vergleichswerte: ohne Warmwasser, mit Warmwasser oder keine. */
  readonly benchmark?: 'heating_only' | 'with_hot_water' | 'none'
  /** Warmwassertemperatur am Heizkreis erfasst (Standard: ja, 55 °C). */
  readonly temperatureRecorded?: boolean
}

const period = (year: number): BillingPeriod => ({
  id: `p-${year}`,
  propertyId: 'property',
  year,
  periodStart: `${year}-01-01`,
  periodEnd: `${year}-12-31`,
  status: 'DRAFT',
})

function benchmarkFor(
  kind: MonthlyFixtureOptions['benchmark'],
): ConsumptionBenchmark | null {
  if (kind === 'none') return null
  return {
    source: 'Fiktiver Vergleichsspiegel',
    referenceYear: 2025,
    category: 'Erdgas, fiktive Kategorie',
    includesHotWater: kind === 'with_hot_water',
    lowMaxKwhPerSqmYear: 70,
    mediumMaxKwhPerSqmYear: 130,
    elevatedMaxKwhPerSqmYear: 200,
  }
}

function circuit(year: number, options: MonthlyFixtureOptions): HeatingCircuit {
  const hotWater = options.hotWater ?? true
  return {
    id: `c-${year}`,
    billingPeriodId: `p-${year}`,
    heatingSystemId: 'system',
    buildingId: 'b1',
    hasCentralHotWater: hotWater,
    meterAssignments: [
      { meterId: 'hm1', unitId: 'u1' },
      { meterId: 'hm2', unitId: 'u2' },
    ],
    hotWaterMeterAssignments: hotWater
      ? [{ meterId: 'ww1', unitId: 'u1' }]
      : [],
    hotWaterEnergy:
      (options.temperatureRecorded ?? true)
        ? { method: 'volume_formula', volumeM3: 100, temperatureC: 55 }
        : null,
    consumptionBenchmark: benchmarkFor(options.benchmark ?? 'heating_only'),
  }
}

let readingCounter = 0
const reading = (
  meterId: string,
  date: string,
  value: number,
): MeterReading => ({
  id: `r-${(readingCounter += 1)}`,
  meterId,
  date,
  value: { value, unit: meterId.startsWith('ww') ? 'm3' : 'kWh' },
  source: 'imported',
})

export function buildMonthlyAppData(
  options: MonthlyFixtureOptions = {},
): AppDataFile {
  const file = createEmptyAppDataFile()
  const master = file.masterData
  master.organizations.push({ id: 'org', name: 'Fiktive Verwaltung' })
  master.ownerCompanies.push({
    id: 'owner',
    organizationId: 'org',
    name: 'Muster Hausverwaltung GmbH',
    additionalNameLines: [],
    address: {
      street: 'Verwalterstraße 1',
      postalCodeAndCity: '00000 Musterstadt',
    },
  })
  master.properties.push({
    id: 'property',
    ownerCompanyId: 'owner',
    address: {
      street: 'Beispielweg 5',
      postalCodeAndCity: '00000 Musterstadt',
    },
  })
  master.buildings.push({
    id: 'b1',
    propertyId: 'property',
    name: 'Haus A',
    mandateRefPrefixes: [],
  })
  master.units.push(
    {
      id: 'u1',
      propertyId: 'property',
      buildingId: 'b1',
      label: 'Wohnung 3',
      heatedAreaSqm: { value: 80, unit: 'm2' },
    },
    {
      id: 'u2',
      propertyId: 'property',
      buildingId: 'b1',
      label: 'Wohnung 4',
      usableAreaSqm: { value: 60, unit: 'm2' },
    },
  )
  master.persons.push(
    {
      id: 'person-1',
      organizationId: 'org',
      salutation: 'Frau',
      firstName: 'Erika',
      lastName: 'Beispiel',
    },
    {
      id: 'person-2',
      organizationId: 'org',
      salutation: 'Herr',
      firstName: 'Max',
      lastName: 'Platzhalter',
    },
  )
  master.tenancies.push(
    {
      id: 't1',
      unitId: 'u1',
      personIds: ['person-1'],
      movedIn: '2020-01-01',
      shippingAddressStreet: 'Postfachweg 9',
      shippingAddressPostalCodeAndCity: '00001 Musterdorf',
    },
    {
      id: 't2',
      unitId: 'u2',
      personIds: ['person-2'],
      movedIn: '2026-10-16',
    },
  )
  master.meters.push(
    {
      id: 'hm1',
      propertyId: 'property',
      kind: 'unit_heat',
      meterNumber: 'WMZ-0001',
    },
    {
      id: 'hm2',
      propertyId: 'property',
      kind: 'unit_heat',
      meterNumber: 'WMZ-0002',
    },
    {
      id: 'ww1',
      propertyId: 'property',
      kind: 'unit_hot_water',
      meterNumber: 'WW-0001',
    },
  )
  const billing = file.billingData
  billing.billingPeriods.push(period(2025), period(2026))
  billing.heatingCircuits.push(circuit(2025, options), circuit(2026, options))
  billing.occupancyPeriods.push(
    {
      id: 'o-u1-2025',
      billingPeriodId: 'p-2025',
      unitId: 'u1',
      kind: 'tenant',
      tenancyId: 't1',
    },
    {
      id: 'o-u1',
      billingPeriodId: 'p-2026',
      unitId: 'u1',
      kind: 'tenant',
      tenancyId: 't1',
    },
    {
      id: 'o-u2-vacancy',
      billingPeriodId: 'p-2026',
      unitId: 'u2',
      kind: 'vacancy',
      tenancyId: null,
      to: '2026-10-15',
    },
    {
      id: 'o-u2',
      billingPeriodId: 'p-2026',
      unitId: 'u2',
      kind: 'tenant',
      tenancyId: 't2',
      from: '2026-10-16',
    },
  )
  billing.meterReadings.push(
    reading('hm1', '2025-09-30', 20000),
    reading('hm1', '2025-10-31', 21234),
    reading('hm1', '2026-08-31', 30000),
    reading('hm1', '2026-09-30', 30456),
    reading('hm1', '2026-10-31', 31679),
    // Warmwasser: Vormonat fehlt (Endstand August) → „nicht erhoben“.
    reading('ww1', '2026-09-30', 210.5),
    reading('ww1', '2026-10-31', 213.75),
    reading('hm2', '2026-09-30', 5000),
    reading('hm2', '2026-10-31', 5800),
  )
  return file
}

export function buildMonthlyInformation(
  appData: AppDataFile,
  month = MONTH,
): MonthlyConsumptionInformation {
  return calculateMonthlyConsumptionInformation(appData, {
    propertyId: 'property',
    month,
  })
}

export function tenantOf(
  information: MonthlyConsumptionInformation,
  occupancyPeriodId: string,
): MonthlyTenantConsumption {
  const tenant = information.tenants.find(
    (row) => row.occupancyPeriodId === occupancyPeriodId,
  )
  if (!tenant) throw new Error(`Nutzung ${occupancyPeriodId} fehlt`)
  return tenant
}

export function buildMonthlyContext(
  options: MonthlyFixtureOptions = {},
  occupancyPeriodId = 'o-u1',
): MonthlyInformationStatementContext {
  const appData = buildMonthlyAppData(options)
  const information = buildMonthlyInformation(appData)
  return {
    appData,
    information,
    tenant: tenantOf(information, occupancyPeriodId),
    generatedAt: new Date('2026-11-03T10:00:00Z'),
  }
}
