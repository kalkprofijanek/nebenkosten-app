/**
 * Fiktives Beispielobjekt (PR-37): zwei Häuser mit zwölf Wohnungen, Haus Nord
 * mit Ölkessel, Haus Süd mit Wärmepumpe, Nutzerwechsel, Leerstand und
 * Eigentümerwechsel. Die ladbare Datei `docs/beispiel/beispielobjekt.json`
 * wird aus diesem Szenario erzeugt; der Test prüft, dass sie aktuell ist,
 * dem Schema entspricht und ohne Fehler rechnet.
 *
 * Neu erzeugen: `BEISPIEL_AKTUALISIEREN=1 pnpm test:integration`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateBilling, createCalculationInput } from '@nebenkosten/core'
import { appDataFileSchema, type AppDataFile } from '@nebenkosten/schema'
import { validateBillingPeriod } from '@nebenkosten/validators'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../characterization/build-app-data'
import type { Scenario, ScenarioTenant } from '../characterization/types'

const TARGET = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/beispiel/beispielobjekt.json',
)

function tenant(
  id: string,
  buildingId: 'B1' | 'B2',
  area: number,
  persons: number,
  units: number,
  prepayEur: number,
  patch: Partial<ScenarioTenant> = {},
): ScenarioTenant {
  return {
    id,
    unitId: `u-${id}`,
    buildingId,
    mandateSuffix: id.toUpperCase(),
    kind: 'tenant',
    usableAreaSqm: area,
    heatedAreaSqm: area,
    persons,
    consumptionUnits: units,
    prepay: { mode: 'monthly', amountEur: prepayEur },
    ...patch,
  }
}

const SCENARIO: Scenario = {
  id: 'beispielobjekt',
  title: 'Fiktives Beispielobjekt mit zwei Häusern',
  coverage: [],
  year: 2025,
  from: '2025-01-01',
  to: '2025-12-31',
  defaults: {
    consumptionPercent: 70,
    basePercent: 30,
    baseArea: 'heated',
    operatingElectricityPercent: 5,
  },
  buildings: [
    {
      id: 'B1',
      name: 'Haus Nord',
      shortName: 'HN',
      energyType: 'Heizöl',
      mandatePrefixes: ['HN'],
    },
    {
      id: 'B2',
      name: 'Haus Süd',
      shortName: 'HS',
      energyType: 'Wärmepumpe',
      mandatePrefixes: ['HS'],
    },
  ],
  circuits: [
    {
      buildingId: 'B1',
      hasCentralHotWater: true,
      hotWaterPercent: 25,
      overrides: null,
      co2: { mode: 'auto', pricePerTonEur: 55, factorKgPerKwh: null },
      sources: [
        {
          key: 'haupt',
          name: 'Heizöl',
          type: 'Heizöl',
          calorificKwh: 10,
          co2FactorKgPerKwh: 0.266,
          openingQuantity: 3_000,
          openingUnit: 'l',
          openingValueEur: 3_000,
          remainingQuantity: 2_500,
          deliveries: [
            {
              date: '2025-02-10',
              quantity: 3_000,
              unit: 'l',
              amountEur: 3_150,
            },
            {
              date: '2025-10-20',
              quantity: 4_000,
              unit: 'l',
              amountEur: 4_120,
            },
          ],
        },
      ],
    },
    {
      buildingId: 'B2',
      hasCentralHotWater: false,
      hotWaterPercent: null,
      overrides: null,
      co2: { mode: 'auto', pricePerTonEur: 55, factorKgPerKwh: 0 },
      sources: [
        {
          key: 'wp',
          name: 'Wärmepumpe',
          type: 'Wärmepumpenstrom',
          calorificKwh: 1,
          co2FactorKgPerKwh: 0,
          openingQuantity: 0,
          openingUnit: 'kWh',
          deliveries: [
            {
              date: '2025-12-31',
              quantity: 14_000,
              unit: 'kWh',
              amountEur: 4_200,
            },
          ],
        },
      ],
    },
  ],
  costs: [
    {
      id: 'k-grundsteuer',
      kind: 'operating',
      label: 'Grundsteuer',
      statementText: 'Grundsteuer',
      betrkv: '§2 Nr. 1',
      allocationKey: 'usable_area',
      scope: { kind: 'property' },
      amountEur: 2_400,
    },
    {
      id: 'k-wasser',
      kind: 'water',
      label: 'Wasser und Abwasser',
      statementText: 'Wasserversorgung und Entwässerung',
      betrkv: '§2 Nr. 2',
      allocationKey: 'usable_area',
      scope: { kind: 'property' },
      amountEur: 5_600,
    },
    {
      id: 'k-muell',
      kind: 'operating',
      label: 'Müllbeseitigung',
      statementText: 'Müllbeseitigung',
      betrkv: '§2 Nr. 8',
      allocationKey: 'residential_units',
      scope: { kind: 'property' },
      amountEur: 2_160,
    },
    {
      id: 'k-strom',
      kind: 'operating',
      label: 'Allgemeinstrom',
      statementText: 'Beleuchtung',
      betrkv: '§2 Nr. 11',
      allocationKey: 'usable_area',
      scope: { kind: 'property' },
      amountEur: 1_200,
      operatingElectricitySource: true,
    },
    {
      id: 'k-versicherung',
      kind: 'operating',
      label: 'Gebäudeversicherung',
      statementText: 'Sach- und Haftpflichtversicherung',
      betrkv: '§2 Nr. 13',
      allocationKey: 'usable_area',
      scope: { kind: 'property' },
      amountEur: 3_000,
    },
    {
      id: 'k-wartung',
      kind: 'heating',
      label: 'Wartung Heizung',
      statementText: 'Wartung der Heizungsanlage',
      betrkv: '§2 Nr. 4a',
      allocationKey: 'heated_area',
      scope: { kind: 'building', buildingId: 'B1' },
      amountEur: 480,
      laborPercent: 80,
    },
  ],
  tenants: [
    tenant('n1', 'B1', 62, 2, 820, 220),
    tenant('n2', 'B1', 48, 1, 640, 170),
    tenant('n3', 'B1', 75, 3, 1_010, 260, { to: '2025-06-30' }),
    tenant('n3b', 'B1', 75, 2, 470, 250, {
      unitId: 'u-n3',
      from: '2025-07-01',
    }),
    tenant('n4', 'B1', 55, 2, 700, 190),
    tenant('n5', 'B1', 68, 2, 900, 230),
    {
      id: 'n6',
      unitId: 'u-n6',
      buildingId: 'B1',
      mandateSuffix: 'N6',
      kind: 'vacancy',
      usableAreaSqm: 40,
      heatedAreaSqm: 40,
      consumptionUnits: 60,
      prepay: { mode: 'none' },
    },
    tenant('s1', 'B2', 70, 2, 900, 200),
    tenant('s2', 'B2', 58, 1, 700, 170),
    tenant('s3', 'B2', 82, 4, 1_150, 260),
    tenant('s4', 'B2', 45, 1, 520, 140),
    tenant('s5', 'B2', 64, 2, 830, 190),
    tenant('s6', 'B2', 52, 2, 690, 160, { to: '2025-09-30' }),
    {
      id: 's6v',
      unitId: 'u-s6',
      buildingId: 'B2',
      mandateSuffix: 'S6V',
      kind: 'vacancy',
      from: '2025-10-01',
      usableAreaSqm: 52,
      heatedAreaSqm: 52,
      consumptionUnits: 40,
      prepay: { mode: 'none' },
    },
  ],
}

/** Lesbare, frei erfundene Namen für Musterabrechnungen und Screenshots. */
const PERSONS: Readonly<Record<string, string>> = {
  'p-n1': 'Erika Mustermann',
  'p-n2': 'Max Beispiel',
  'p-n3': 'Familie Musterfrau',
  'p-n3b': 'Lena Exempel',
  'p-n4': 'Paul Platzhalter',
  'p-n5': 'Familie Muster',
  'p-s1': 'Anna Probe',
  'p-s2': 'Tom Vorlage',
  'p-s3': 'Familie Fiktiv',
  'p-s4': 'Ida Testfall',
  'p-s5': 'Ben Entwurf',
  'p-s6': 'Mia Modell',
}

/** Rechnungen je Kostenart (fiktive Versorger), Summe = Kostenart. */
const INVOICES: Readonly<Record<string, readonly [string, string]>> = {
  'k-grundsteuer': ['2025-02-15', 'Grundsteuerbescheid Stadt Musterstadt'],
  'k-wasser': ['2025-12-31', 'Jahresrechnung Beispiel Stadtwerke'],
  'k-muell': ['2025-01-31', 'Abfallgebührenbescheid Musterkreis'],
  'k-strom': ['2025-12-31', 'Jahresrechnung Allgemeinstrom'],
  'k-versicherung': ['2025-01-10', 'Beitragsrechnung Musterversicherung'],
  'k-wartung': ['2025-09-18', 'Wartung Ölkessel, Musterheizungsbau'],
}

function buildExample(): AppDataFile {
  const data = buildAppDataFile(SCENARIO)
  const period = data.billingData.billingPeriods[0]!
  const address = {
    street: 'Am Musterhof 1',
    postalCodeAndCity: '12345 Musterstadt',
  }
  for (const property of data.masterData.properties) property.address = address
  for (const company of data.masterData.ownerCompanies)
    company.address = address
  for (const unit of data.masterData.units) {
    const building = data.masterData.buildings.find(
      ({ id }) => id === unit.buildingId,
    )
    unit.label = `${building?.name ?? 'Haus'} · Whg. ${unit.id.slice(3)}`
  }
  for (const person of data.masterData.persons)
    person.displayName = PERSONS[person.id] ?? person.displayName
  let receipt = 0
  for (const category of data.billingData.costCategories) {
    const invoice = INVOICES[category.id]
    if (!invoice || category.totalAmountCents == null) continue
    receipt += 1
    data.billingData.costEntries.push({
      id: `ce-${category.id.slice(2)}`,
      costCategoryId: category.id,
      date: invoice[0],
      description: invoice[1],
      amountCents: category.totalAmountCents,
      receiptReference: `Beleg 2025-${String(receipt).padStart(3, '0')}`,
      externalPayment: {
        confirmed: true,
        reason:
          'Beispielobjekt: Zahlung ohne importierte Kontoumsätze (fiktiv)',
      },
      origin: 'own',
      amountBasis: 'invoice',
    })
  }
  // Eigentümerwechsel zum 1. April: erste Öllieferung aus der Zeit des
  // Voreigentümers mit Rechnung und Menge.
  period.ownershipChange = {
    transferDate: '2025-04-01',
    previousOwnerLabel: 'Voreigentümer (fiktiv)',
  }
  for (const delivery of data.billingData.fuelDeliveries) {
    // Das Beispiel enthält keine Kontoumsätze; Zahlungen gelten als belegt.
    delivery.externalPayment = {
      confirmed: true,
      reason: 'Beispielobjekt: Zahlung ohne importierte Kontoumsätze (fiktiv)',
    }
    if (delivery.date && delivery.date < '2025-04-01') {
      delivery.origin = 'previous_owner'
      delivery.amountBasis = 'invoice'
    }
  }
  for (const stock of data.billingData.fuelStocks)
    if (stock.openingQuantity?.value) {
      stock.valuationBasis = 'acquisition_cost'
    }
  const pump = data.billingData.energySources.find(({ key }) => key === 'wp')
  if (pump) {
    pump.seasonalPerformanceFactor = 3.5
    pump.seasonalPerformanceFactorEstimated = true
    pump.seasonalPerformanceFactorReason = 'Herstellerangabe (fiktiv)'
  }
  return appDataFileSchema.parse(data)
}

describe('Beispielobjekt (PR-37)', () => {
  const example = buildExample()

  it('ist als Datei aktuell', () => {
    const serialized = `${JSON.stringify(example, null, 2)}\n`
    if (process.env.BEISPIEL_AKTUALISIEREN === '1') {
      mkdirSync(dirname(TARGET), { recursive: true })
      writeFileSync(TARGET, serialized, 'utf8')
    }
    expect(readFileSync(TARGET, 'utf8').replaceAll('\r\n', '\n')).toBe(
      serialized,
    )
  })

  it('entspricht dem Schema und rechnet ohne Fehler', () => {
    const period = example.billingData.billingPeriods[0]!
    const output = calculateBilling(createCalculationInput(example, period.id))
    expect(Math.abs(output.totals.controlDifferenceCents)).toBeLessThanOrEqual(
      1,
    )
    expect(output.tenants).toHaveLength(SCENARIO.tenants.length)
    const errors = validateBillingPeriod(example, period.id)
      .issues.filter(({ severity }) => severity === 'error')
      .map(({ code }) => code)
    // Einziger gewollter Fehler: Die IBAN trägt der Nutzer selbst ein
    // (eine Beispiel-IBAN würde der Privacy-Scan zu Recht melden).
    expect(errors).toEqual(['master_data.iban_missing'])
  })
})
