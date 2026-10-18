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
import {
  appDataFileSchema,
  type AppDataFile,
  type ConsumptionBenchmark,
  type Salutation,
} from '@nebenkosten/schema'
import { validateBillingPeriod } from '@nebenkosten/validators'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../characterization/build-app-data'
import type {
  Scenario,
  ScenarioCost,
  ScenarioTenant,
} from '../characterization/types'

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

/**
 * Szenario mit marktüblichen Werten 2025 (alle Namen, Anschriften, Geräte-
 * und Belegnummern frei erfunden): Haus Nord, Altbau mit Ölkessel und
 * zentralem Warmwasser, Heizkostenverteiler; Haus Süd, Neubau mit
 * Wärmepumpe, Wärmemengenzählern und zentralem Warmwasser.
 */
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
      hotWaterPercent: null,
      overrides: null,
      co2: { mode: 'auto', pricePerTonEur: 55, factorKgPerKwh: null },
      sources: [
        {
          key: 'haupt',
          name: 'Heizöl',
          type: 'Heizöl',
          calorificKwh: 10,
          co2FactorKgPerKwh: 0.266,
          openingQuantity: 2_800,
          openingUnit: 'l',
          openingValueEur: 2_828,
          remainingQuantity: 3_000,
          deliveries: [
            {
              date: '2025-02-10',
              quantity: 2_500,
              unit: 'l',
              amountEur: 2_600,
            },
            {
              date: '2025-10-20',
              quantity: 2_300,
              unit: 'l',
              amountEur: 2_185,
            },
          ],
        },
      ],
    },
    {
      buildingId: 'B2',
      hasCentralHotWater: true,
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
              quantity: 6_900,
              unit: 'kWh',
              amountEur: 1_863,
            },
          ],
        },
      ],
    },
  ],
  costs: [
    operating('k-grundsteuer', 'Grundsteuer', 'Grundsteuer', '§2 Nr. 1', 2_950),
    {
      ...operating(
        'k-wasser',
        'Wasser und Abwasser',
        'Wasserversorgung und Entwässerung',
        '§2 Nr. 2',
        6_180,
      ),
      kind: 'water',
    },
    {
      ...operating(
        'k-muell',
        'Müllbeseitigung',
        'Müllbeseitigung',
        '§2 Nr. 8',
        2_280,
      ),
      allocationKey: 'residential_units',
    },
    operating(
      'k-strasse',
      'Straßenreinigung',
      'Straßenreinigung',
      '§2 Nr. 8',
      410,
    ),
    {
      ...operating(
        'k-reinigung',
        'Treppenhausreinigung',
        'Gebäudereinigung',
        '§2 Nr. 9',
        2_520,
      ),
      laborPercent: 90,
    },
    {
      ...operating(
        'k-garten',
        'Gartenpflege',
        'Gartenpflege',
        '§2 Nr. 10',
        1_180,
      ),
      laborPercent: 80,
    },
    {
      ...operating(
        'k-strom',
        'Allgemeinstrom',
        'Beleuchtung',
        '§2 Nr. 11',
        1_240,
      ),
      operatingElectricitySource: true,
    },
    operating(
      'k-versicherung',
      'Gebäudeversicherung',
      'Sach- und Haftpflichtversicherung',
      '§2 Nr. 13',
      3_240,
    ),
    {
      ...operating('k-hauswart', 'Hauswart', 'Hauswart', '§2 Nr. 14', 1_920),
      laborPercent: 100,
    },
    heating(
      'k-wartung-n',
      'Wartung Ölkessel',
      'Wartung der Heizungsanlage',
      'B1',
      480,
      80,
    ),
    heating(
      'k-schornstein-n',
      'Schornsteinfeger',
      'Immissionsmessung und Feuerstättenschau',
      'B1',
      168,
      100,
    ),
    heating(
      'k-messdienst-n',
      'Messdienst Haus Nord',
      'Verbrauchserfassung und Abrechnung (Messdienst)',
      'B1',
      612,
    ),
    heating(
      'k-wartung-s',
      'Wartung Wärmepumpe',
      'Wartung der Wärmepumpe',
      'B2',
      390,
      70,
    ),
    heating(
      'k-messdienst-s',
      'Messdienst Haus Süd',
      'Verbrauchserfassung und Abrechnung (Messdienst)',
      'B2',
      498,
    ),
  ],
  tenants: [
    tenant('n1', 'B1', 62, 2, 820, 250),
    tenant('n2', 'B1', 48, 1, 640, 180),
    tenant('n3', 'B1', 75, 3, 1_010, 340, { to: '2025-06-30' }),
    tenant('n3b', 'B1', 75, 2, 470, 270, {
      unitId: 'u-n3',
      from: '2025-07-01',
    }),
    tenant('n4', 'B1', 55, 2, 700, 225),
    tenant('n5', 'B1', 68, 2, 900, 255),
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
    tenant('s1', 'B2', 70, 2, 3_750, 225),
    tenant('s2', 'B2', 58, 1, 3_000, 175),
    tenant('s3', 'B2', 82, 4, 4_650, 265),
    tenant('s4', 'B2', 45, 1, 2_150, 150),
    tenant('s5', 'B2', 64, 2, 3_400, 195),
    tenant('s6', 'B2', 52, 2, 2_250, 170, { to: '2025-09-30' }),
    {
      id: 's6v',
      unitId: 'u-s6',
      buildingId: 'B2',
      mandateSuffix: 'S6V',
      kind: 'vacancy',
      from: '2025-10-01',
      usableAreaSqm: 52,
      heatedAreaSqm: 52,
      consumptionUnits: 500,
      prepay: { mode: 'none' },
    },
  ],
}

function operating(
  id: string,
  label: string,
  statementText: string,
  betrkv: string,
  amountEur: number,
): ScenarioCost {
  return {
    id,
    kind: 'operating',
    label,
    statementText,
    betrkv,
    allocationKey: 'usable_area',
    scope: { kind: 'property' },
    amountEur,
  }
}

function heating(
  id: string,
  label: string,
  statementText: string,
  buildingId: 'B1' | 'B2',
  amountEur: number,
  laborPercent?: number,
): ScenarioCost {
  return {
    id,
    kind: 'heating',
    label,
    statementText,
    betrkv: '§2 Nr. 4a',
    allocationKey: 'heated_area',
    scope: { kind: 'building', buildingId },
    amountEur,
    ...(laborPercent == null ? {} : { laborPercent }),
  }
}

/** Personen (Anrede für den Brief), frei erfunden. */
const PERSONS: Readonly<
  Record<string, readonly [Salutation, string | null, string]>
> = {
  'p-n1': ['Frau', 'Erika', 'Mustermann'],
  'p-n2': ['Herr', 'Max', 'Beispiel'],
  'p-n3': ['Familie', null, 'Musterfrau'],
  'p-n3b': ['Frau', 'Lena', 'Exempel'],
  'p-n4': ['Herr', 'Paul', 'Platzhalter'],
  'p-n5': ['Familie', null, 'Muster'],
  'p-s1': ['Frau', 'Anna', 'Probe'],
  'p-s2': ['Herr', 'Tom', 'Vorlage'],
  'p-s3': ['Familie', null, 'Fiktiv'],
  'p-s4': ['Frau', 'Ida', 'Testfall'],
  'p-s5': ['Herr', 'Ben', 'Entwurf'],
  'p-s6': ['Frau', 'Mia', 'Modell'],
}

const LOCATIONS = [
  'EG links',
  'EG rechts',
  '1. OG links',
  '1. OG rechts',
].concat(['2. OG links', 'Dachgeschoss'])

/**
 * Ablesung je Nutzung: Gerätenummer, Stand alt/neu (Heizkostenverteiler in
 * Haus Nord zum Stichtag auf 0, Wärmemengenzähler in Haus Süd fortlaufend in
 * kWh), Warm- und Kaltwasser in m³ und Vorjahresverbrauch laut Abrechnung 2024 des
 * Voreigentümers. Beim Nutzerwechsel liegt eine Zwischenablesung vor.
 */
const READINGS: Readonly<
  Record<
    string,
    {
      meter: string
      start: number
      end: number
      warmWaterM3: number
      coldWaterM3: number
      previous?: number
    }
  >
> = {
  n1: {
    meter: '61 204 311',
    start: 0,
    end: 820,
    warmWaterM3: 26,
    coldWaterM3: 50,
    previous: 870,
  },
  n2: {
    meter: '61 204 312',
    start: 0,
    end: 640,
    warmWaterM3: 14,
    coldWaterM3: 27,
    previous: 610,
  },
  n3: {
    meter: '61 204 313',
    start: 0,
    end: 1_010,
    warmWaterM3: 19,
    coldWaterM3: 38,
    previous: 2_050,
  },
  n3b: {
    meter: '61 204 313',
    start: 1_010,
    end: 1_480,
    warmWaterM3: 12,
    coldWaterM3: 24,
  },
  n4: {
    meter: '61 204 314',
    start: 0,
    end: 700,
    warmWaterM3: 25,
    coldWaterM3: 48,
    previous: 760,
  },
  n5: {
    meter: '61 204 315',
    start: 0,
    end: 900,
    warmWaterM3: 28,
    coldWaterM3: 52,
    previous: 950,
  },
  n6: {
    meter: '61 204 316',
    start: 0,
    end: 60,
    warmWaterM3: 0,
    coldWaterM3: 2,
  },
  s1: {
    meter: '7 120 401',
    start: 18_420,
    end: 22_170,
    warmWaterM3: 27,
    coldWaterM3: 51,
    previous: 4_300,
  },
  s2: {
    meter: '7 120 402',
    start: 14_960,
    end: 17_960,
    warmWaterM3: 13,
    coldWaterM3: 26,
    previous: 3_350,
  },
  s3: {
    meter: '7 120 403',
    start: 23_310,
    end: 27_960,
    warmWaterM3: 48,
    coldWaterM3: 92,
    previous: 5_200,
  },
  s4: {
    meter: '7 120 404',
    start: 10_880,
    end: 13_030,
    warmWaterM3: 11,
    coldWaterM3: 22,
    previous: 2_200,
  },
  s5: {
    meter: '7 120 405',
    start: 16_740,
    end: 20_140,
    warmWaterM3: 24,
    coldWaterM3: 46,
    previous: 3_900,
  },
  s6: {
    meter: '7 120 406',
    start: 12_050,
    end: 14_300,
    warmWaterM3: 18,
    coldWaterM3: 36,
    previous: 3_100,
  },
  s6v: {
    meter: '7 120 406',
    start: 14_300,
    end: 14_800,
    warmWaterM3: 0,
    coldWaterM3: 1,
  },
}

/** Rechnungen je Kostenart (fiktive Versorger und Dienstleister). */
const INVOICES: Readonly<Record<string, readonly [string, string]>> = {
  'k-grundsteuer': [
    '2025-02-15',
    'Grundsteuerbescheid 2025, Stadt Musterstadt',
  ],
  'k-wasser': ['2026-01-28', 'Jahresrechnung 2025, Beispiel Stadtwerke'],
  'k-muell': ['2025-01-31', 'Abfallgebührenbescheid 2025, Musterkreis'],
  'k-strasse': [
    '2025-02-15',
    'Straßenreinigungsgebühr 2025, Stadt Musterstadt',
  ],
  'k-reinigung': [
    '2025-12-31',
    'Jahresrechnung Treppenhausreinigung, Glanz & Co. (fiktiv)',
  ],
  'k-garten': ['2025-11-30', 'Gartenpflege 2025, Grünwerk Beispiel (fiktiv)'],
  'k-strom': [
    '2026-01-20',
    'Jahresrechnung Allgemeinstrom 2025, Beispiel Stadtwerke',
  ],
  'k-versicherung': ['2025-01-10', 'Beitragsrechnung 2025, Musterversicherung'],
  'k-hauswart': ['2025-12-31', 'Hauswartvertrag 2025, Jahresabrechnung'],
  'k-wartung-n': ['2025-09-18', 'Wartung Ölkessel, Musterheizungsbau (fiktiv)'],
  'k-schornstein-n': [
    '2025-10-07',
    'Immissionsmessung, Bezirksschornsteinfeger',
  ],
  'k-messdienst-n': [
    '2026-02-12',
    'Heizkostenabrechnung 2025, Beispiel Messdienst',
  ],
  'k-wartung-s': [
    '2025-05-22',
    'Wartung Wärmepumpe, Musterheizungsbau (fiktiv)',
  ],
  'k-messdienst-s': [
    '2026-02-12',
    'Heizkostenabrechnung 2025, Beispiel Messdienst',
  ],
}

/** Rechnungsdaten der Brennstoff- und Stromlieferungen. */
const DELIVERY_INVOICES: Readonly<
  Record<
    string,
    {
      receipt: string
      description: string
      energyTaxCents: number
      co2LevyCents: number
    }
  >
> = {
  'fd-B1-haupt-0': {
    receipt: 'Rechnung 2025-0217, Mineralöl Beispiel (fiktiv)',
    description: 'Heizöl EL schwefelarm, 2.500 l',
    // 61,35 € je 1.000 l Energiesteuer, 55 €/t × 2,66 kg CO₂ je Liter
    energyTaxCents: 15_338,
    co2LevyCents: 36_575,
  },
  'fd-B1-haupt-1': {
    receipt: 'Rechnung 2025-1188, Mineralöl Beispiel (fiktiv)',
    description: 'Heizöl EL schwefelarm, 2.300 l',
    energyTaxCents: 14_111,
    co2LevyCents: 33_649,
  },
  'fd-B2-wp-0': {
    receipt: 'Jahresrechnung Wärmepumpenstrom 2025, Beispiel Stadtwerke',
    description: 'Wärmepumpentarif, 6.900 kWh',
    // Stromsteuer 20,50 € je MWh
    energyTaxCents: 14_145,
    co2LevyCents: 0,
  },
}

/** Heizspiegel für Deutschland 2026 (co2online), Abrechnungsjahr 2025. */
const BENCHMARKS: Readonly<Record<string, ConsumptionBenchmark>> = {
  B1: {
    source: 'Heizspiegel für Deutschland 2026 (co2online)',
    sourceUrl: 'https://www.heizspiegel.de/',
    referenceYear: 2025,
    category: 'Heizöl, Gebäude 250–500 m², Baujahr bis 2001',
    includesHotWater: true,
    lowMaxKwhPerSqmYear: 61,
    mediumMaxKwhPerSqmYear: 95,
    elevatedMaxKwhPerSqmYear: 154,
  },
  B2: {
    source: 'Heizspiegel für Deutschland 2026 (co2online)',
    sourceUrl: 'https://www.heizspiegel.de/',
    referenceYear: 2025,
    category: 'Wärmepumpe, Gebäude 250–500 m², Baujahr ab 2002',
    includesHotWater: true,
    lowMaxKwhPerSqmYear: 10,
    mediumMaxKwhPerSqmYear: 17,
    elevatedMaxKwhPerSqmYear: 40,
  },
}

/** Fiktive Bankverbindung: Bankleitzahl 00000000 ist nicht vergeben. */
const BANK_ACCOUNT = {
  iban: 'DE50000000000123456789',
  accountHolder: 'Mustermann Immobilien GmbH',
  bankName: 'Beispielbank (fiktiv)',
}

/** Neue Anschriften nach Auszug (frei erfunden). */
const FORWARDING: Readonly<Record<string, readonly [string, string]>> = {
  'ten-n3': ['Am Lindenhof 4', '23456 Beispielstadt'],
  'ten-s6': ['Am Kirchberg 12', '12345 Musterstadt'],
}

const PREVIOUS_SOURCE = 'Abrechnung 2024 des Voreigentümers'

function buildExample(): AppDataFile {
  const data = buildAppDataFile(SCENARIO)
  const period = data.billingData.billingPeriods[0]!
  const address = {
    street: 'Am Musterhof 1',
    postalCodeAndCity: '12345 Musterstadt',
  }
  for (const property of data.masterData.properties) {
    property.address = address
    property.bankAccount = BANK_ACCOUNT
  }
  for (const company of data.masterData.ownerCompanies) {
    company.address = address
    company.bankAccount = BANK_ACCOUNT
  }
  for (const unit of data.masterData.units) {
    const building = data.masterData.buildings.find(
      ({ id }) => id === unit.buildingId,
    )
    const number = Number(unit.id.slice(3))
    unit.label = `${building?.name ?? 'Haus'} · Whg. ${number}`
    unit.location = LOCATIONS[number - 1]
  }
  for (const person of data.masterData.persons) {
    const entry = PERSONS[person.id]
    if (!entry) continue
    const [salutation, firstName, lastName] = entry
    person.salutation = salutation
    person.firstName = firstName
    person.lastName = lastName
    person.displayName =
      salutation === 'Familie'
        ? `Familie ${lastName}`
        : `${firstName ?? ''} ${lastName}`.trim()
  }

  // Ablesung mit Zwischenablesung beim Nutzerwechsel, Warmwasser in m³,
  // Vorjahreswerte aus der Abrechnung des Voreigentümers.
  for (const occupancy of data.billingData.occupancyPeriods) {
    const reading = READINGS[occupancy.id.slice(3)]
    if (!reading) continue
    occupancy.heatMeterReading = {
      meterNumber: reading.meter,
      startValue: reading.start,
      startDate: occupancy.from ?? period.periodStart,
      endValue: reading.end,
      endDate: occupancy.to ?? period.periodEnd,
    }
    occupancy.warmWater = { value: reading.warmWaterM3, unit: 'm3' }
    occupancy.coldWater = { value: reading.coldWaterM3, unit: 'm3' }
    if (reading.previous != null)
      occupancy.previousConsumption = {
        year: 2024,
        value: reading.previous,
        source: PREVIOUS_SOURCE,
        // DWD-Klimafaktor 2024 für die fiktive PLZ (Beispielwert).
        climateFactor: 1.12,
      }
  }

  for (const circuit of data.billingData.heatingCircuits) {
    circuit.consumptionBenchmark = BENCHMARKS[circuit.buildingId]
    circuit.hotWaterAllocation = {
      key: 'consumption',
      consumptionSharePercent: 70,
    }
    circuit.hotWaterEnergy =
      circuit.buildingId === 'B1'
        ? { method: 'heat_meter', heatKwh: 8_300 }
        : { method: 'heat_meter', heatKwh: 4_900 }
    // Wärmemengenzähler am Erzeuger der Wärmepumpe (Jahresarbeitszahl 3,6).
    if (circuit.buildingId === 'B2') circuit.generatedHeatKwh = 24_800
  }

  for (const category of data.billingData.costCategories) {
    category.standardKey = category.id.slice(2)
    // Wohnungswasserzähler: Umlage nach Verbrauch (§ 556a Abs. 1 Satz 2 BGB).
    if (category.id === 'k-wasser') category.allocationKey = 'water_consumption'
    if (category.id.startsWith('k-messdienst')) category.meteringFee = true
  }
  // Ausgezogene Mieter erhalten die Abrechnung an die neue Anschrift.
  for (const tenancy of data.masterData.tenancies) {
    const forwarding = FORWARDING[tenancy.id]
    if (!forwarding) continue
    tenancy.shippingAddressStreet = forwarding[0]
    tenancy.shippingAddressPostalCodeAndCity = forwarding[1]
  }

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
  period.climateFactor = {
    postalCode: '12345',
    factor: 1.08,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    source: 'DWD, Klimafaktoren (Beispielwert für die fiktive PLZ 12345)',
  }
  for (const delivery of data.billingData.fuelDeliveries) {
    const invoice = DELIVERY_INVOICES[delivery.id]
    // Das Beispiel enthält keine Kontoumsätze; Zahlungen gelten als belegt.
    delivery.externalPayment = {
      confirmed: true,
      reason: 'Beispielobjekt: Zahlung ohne importierte Kontoumsätze (fiktiv)',
    }
    delivery.amountBasis = 'invoice'
    delivery.origin =
      delivery.date && delivery.date < '2025-04-01' ? 'previous_owner' : 'own'
    if (!invoice || delivery.amountCents == null) continue
    delivery.receiptReference = invoice.receipt
    delivery.description = invoice.description
    delivery.taxesAndLevies = {
      vatRatePercent: 19,
      vatCents: Math.round((delivery.amountCents * 19) / 119),
      energyTaxCents: invoice.energyTaxCents,
      co2LevyCents: invoice.co2LevyCents || null,
    }
  }
  for (const stock of data.billingData.fuelStocks)
    if (stock.openingQuantity?.value) {
      stock.valuationBasis = 'acquisition_cost'
      // Tankinhalt aus einer Lieferung 2024: CO₂-Preis 45 €/t (§ 10 BEHG).
      stock.openingCo2PricePerTonCents = 4_500
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
    const findings = validateBillingPeriod(example, period.id)
      .issues.filter(({ severity }) => severity !== 'info')
      .map(({ code }) => code)
    // Musterabrechnung: vollständig nach BetrKV/HeizKV erfasst, daher weder
    // Fehler noch Warnungen (Bankverbindung mit nicht vergebener BLZ).
    expect(findings).toEqual([])
  })
})
