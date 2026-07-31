import { describe, expect, it } from 'vitest'

import {
  appDataFileSchema,
  migrateV3ToCurrent,
  migrationReportSchema,
} from '../src'
import type { AppDataFile, LegacyUnmappedEntry, MigrationResult } from '../src'
import {
  createDuplicateBuildingIdsV3File,
  createFictionalV3File,
  createHistoricalRootV3File,
  createMinimalFictionalV3File,
} from './fixtures'

const FIXED_NOW = '2026-03-04T05:06:07.000Z'
const OPTIONS = {
  sourceSha256: 'c'.repeat(64),
  sourceFileName: 'nur-fiktive-testdaten.json',
  appVersion: 'pr04-test',
  now: () => new Date(FIXED_NOW),
}

function expectSuccess(result: MigrationResult): AppDataFile {
  expect(result.ok, JSON.stringify(result, null, 2)).toBe(true)
  if (!result.ok) throw new Error(`Migration fehlgeschlagen: ${result.reason}`)
  expect(appDataFileSchema.safeParse(result.data).success).toBe(true)
  expect(migrationReportSchema.safeParse(result.report).success).toBe(true)
  expect(collectUndefinedPaths(result.data)).toEqual([])
  expect(collectUndefinedPaths(result.report)).toEqual([])
  return result.data
}

function collectUndefinedPaths(value: unknown, path = '$'): string[] {
  if (value === undefined) return [path]
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    collectUndefinedPaths(child, `${path}.${key}`),
  )
}

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
}

function collectLegacyUnmapped(value: unknown): LegacyUnmappedEntry[] {
  const result: LegacyUnmappedEntry[] = []
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item)
      return
    }
    if (typeof candidate !== 'object' || candidate === null) return
    const record = candidate as Record<string, unknown>
    if (Array.isArray(record.legacyUnmapped)) {
      result.push(...(record.legacyUnmapped as LegacyUnmappedEntry[]))
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== 'legacyUnmapped') visit(child)
    }
  }
  visit(value)
  return result
}

describe('PR 04: v3 -> v4 Migration', () => {
  it('migriert eine minimale v3-Datei deterministisch und ohne Mutation', () => {
    const input = createMinimalFictionalV3File()
    const originalJson = JSON.stringify(input)
    deepFreeze(input)

    const first = migrateV3ToCurrent(input, OPTIONS)
    const second = migrateV3ToCurrent(input, OPTIONS)
    const data = expectSuccess(first)

    expect(first).toEqual(second)
    expect(JSON.stringify(input)).toBe(originalJson)
    expect(data).toMatchObject({
      schemaVersion: 4,
      meta: {
        savedAt: '2026-01-02T03:04:05.000Z',
        appVersion: 'pr04-test',
        migratedFrom: {
          schemaVersion: 3,
          sourceSha256: 'c'.repeat(64),
          migratedAt: FIXED_NOW,
        },
      },
    })
  })

  it('bildet den umfassenden fiktiven v3-Bestand in alle Kerncontainer ab', () => {
    const result = migrateV3ToCurrent(createFictionalV3File(), OPTIONS)
    const data = expectSuccess(result)
    if (!result.ok) return

    expect(data.masterData.organizations).toHaveLength(1)
    expect(data.masterData.ownerCompanies[0]).toMatchObject({
      id: 'f_test001',
      name: 'Mustermann Hausverwaltung GmbH',
      additionalNameLines: ['Testmandant'],
    })
    expect(data.masterData.properties[0]).toMatchObject({
      id: 'obj_test001',
      internalNumber: 'T-001',
      externalNumber: 'EXT-9999',
      legacySourceInfo: { gesamtwohnflaeche: 240 },
    })
    expect(data.masterData.buildings[0]).toMatchObject({
      propertyId: 'obj_test001',
      name: 'Testhaus Vorne',
      shortName: 'TV',
      mandateRefPrefixes: ['TV'],
    })
    expect(data.masterData.units).toHaveLength(2)
    expect(data.masterData.persons).toHaveLength(1)
    expect(data.masterData.tenancies).toHaveLength(1)
    expect(data.masterData.tenancies[0]).toMatchObject({
      id: 'n_test001',
      mandateReference: 'TV_001',
      monthlyRentCents: 65000,
    })
    expect(data.masterData.allocationRules.map((rule) => rule.key)).toEqual([
      'usable_area',
      'heated_area',
      'consumption_units',
      'residential_units',
      'direct',
    ])
    expect(data.masterData.heatingSystems).toHaveLength(1)
    expect(data.masterData.meters[0]).toMatchObject({
      id: 'sz_test001',
      propertyId: 'obj_test001',
      kind: 'general',
      meterNumberStatus: 'open',
    })

    expect(data.billingData.billingPeriods[0]).toMatchObject({
      id: 'abr_test001',
      propertyId: 'obj_test001',
      year: 2024,
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      status: 'DRAFT',
      heatingDefaults: {
        consumptionSharePercent: 70,
        baseSharePercent: 30,
        baseCostAreaBasis: 'heated_area',
      },
    })
    expect(data.billingData.occupancyPeriods).toHaveLength(2)
    expect(data.billingData.occupancyPeriods.map((item) => item.kind)).toEqual([
      'tenant',
      'vacancy',
    ])
    expect(data.billingData.prepayments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'monthly', monthlyAmountCents: 18000 }),
        expect.objectContaining({ mode: 'monthly', monthlyAmountCents: 0 }),
      ]),
    )
    expect(data.billingData.costCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'k_test001',
          kind: 'operating',
          allocationKey: 'usable_area',
          totalAmountCents: 120000,
        }),
        expect.objectContaining({
          id: 'k_test002',
          kind: 'heating',
          totalAmountCents: 25050,
        }),
      ]),
    )
    expect(data.billingData.costEntries[0]).toMatchObject({
      costCategoryId: 'k_test002',
      amountCents: 25050,
      bookingLink: {
        bankBookingId: 'bch_test001',
        splitId: 'sp_test001',
      },
    })
    expect(data.billingData.bankBookings[0]).toMatchObject({
      id: 'bch_test001',
      amountCents: -25050,
      category: 'NK_UMLEGBAR',
      reviewed: false,
      splits: [
        expect.objectContaining({ id: 'sp_test001', amountCents: -25050 }),
      ],
    })
    expect(data.billingData.heatingCircuits[0]).toMatchObject({
      billingPeriodId: 'abr_test001',
      hasCentralHotWater: true,
      hotWaterSharePercent: 18,
    })
    expect(data.billingData.energySources[0]).toMatchObject({
      key: 'haupt',
      sourceType: 'Heizöl',
      calorificValueKwhPerUnit: 10,
    })
    expect(data.billingData.fuelStocks[0]).toMatchObject({
      billingPeriodId: 'abr_test001',
      openingQuantity: { value: 1500, unit: 'l' },
      openingValueCents: 142500,
      openingPricePerUnitCents: 95,
      remainingQuantity: { value: 500, unit: 'l' },
    })
    expect(data.billingData.fuelDeliveries[0]).toMatchObject({
      date: '2024-02-10',
      quantity: { value: 2000, unit: 'l' },
      amountCents: 190000,
    })
    expect(data.billingData.meterBillingStatuses[0]).toMatchObject({
      meterId: 'sz_test001',
      billingPeriodId: 'abr_test001',
      year: 2024,
      bookingPresent: true,
      annualInvoicePresent: false,
    })
    expect(data.billingData.auditEvents[0]).toMatchObject({
      billingPeriodId: 'abr_test001',
      action: 'Status: Entwurf',
      details: { nutzerAnzahl: 2 },
    })

    expect(result.report.counts).toMatchObject({
      ownerCompanies: 1,
      properties: 1,
      billingPeriods: 1,
      occupancyPeriods: 2,
      costCategories: 2,
      costEntries: 1,
      heatingCircuits: 1,
      energySources: 1,
      bankBookings: 1,
      meters: 1,
    })
    const transformationRules = new Set(
      result.report.changedFields.map(({ rule }) => rule),
    )
    expect([...transformationRules]).toEqual(
      expect.arrayContaining([
        'verbatim',
        'euro_to_cents',
        'numberish_to_number',
        'booleanish_to_boolean',
        'ms_epoch_to_iso',
        'date_to_iso',
        'quantity_wrap',
        'enum_map',
        'ref_split',
        'tree_position_to_fk',
        'id_generate',
        'preserve_unknown',
      ]),
    )
    expect(
      result.report.changedFields.every(({ targetPath }) =>
        /^(?:schemaVersion|meta|masterData|billingData)(?:\.|$)/u.test(
          targetPath,
        ),
      ),
    ).toBe(true)
    expect(
      result.report.changedFields.some(
        ({ targetPath }) => targetPath === 'schema4',
      ),
    ).toBe(false)
    expect(collectLegacyUnmapped(data)).toEqual(
      expect.arrayContaining([
        {
          path: ['_experimentelles_rootfeld'],
          value: { hinweis: 'bleibt erhalten' },
        },
        { path: ['zukunftsfeld_block'], value: 'bleibt' },
        { path: ['_zukunftsfeld_nutzer'], value: 'bleibt' },
      ]),
    )
    expect(result.report.unmappedFields).toEqual(
      expect.arrayContaining([
        '<unknown-field>',
        'firmen[0].objekte[0].bloecke[0].<unknown-field>',
        'firmen[0].objekte[0].abrechnungen[0].nutzer[0].<unknown-field>',
      ]),
    )
  })

  it('hebt das historische Objekt-Root-Layout in eine BillingPeriod', () => {
    const data = expectSuccess(
      migrateV3ToCurrent(createHistoricalRootV3File(), OPTIONS),
    )

    expect(data.billingData.billingPeriods).toEqual([
      expect.objectContaining({
        propertyId: 'obj_historisch_test',
        year: 2022,
        periodStart: '2022-01-01',
        periodEnd: '2022-12-31',
      }),
    ])
    expect(data.billingData.occupancyPeriods).toHaveLength(1)
    expect(data.billingData.costCategories[0]).toMatchObject({
      id: 'k_historisch_test',
      totalAmountCents: 12345,
    })
  })

  it('namespaced identische lokale Block-IDs property-weise und haelt Referenzen konsistent', () => {
    const data = expectSuccess(
      migrateV3ToCurrent(createDuplicateBuildingIdsV3File(), OPTIONS),
    )
    const buildings = data.masterData.buildings

    expect(buildings.map((building) => building.id)).toEqual([
      'obj_nord_test:B1',
      'obj_sued_test:B1',
    ])
    expect(new Set(buildings.map((building) => building.id)).size).toBe(2)
    expect(
      data.billingData.heatingCircuits.map((circuit) => circuit.buildingId),
    ).toEqual(['obj_nord_test:B1', 'obj_sued_test:B1'])
  })

  it('konserviert unbekannte Werte, listet nur Pfade und redigiert den Bericht', () => {
    const input = createFictionalV3File()
    const secretMarker = 'PRIVAT-NUR-IM-LOKALEN-ZIELBESTAND-4711'
    const privateCostKey = 'MANDANTENNAME-NUR-LOKAL'
    const privateStatusValue = 'PRIVATER-STATUS-NUR-LOKAL'
    const privateStatusField = 'PRIVATES-UNTERFELD-NUR-LOKAL'
    const companies = input.firmen as Record<string, unknown>[]
    companies[0]!.unbekanntes_privatfeld = { marker: secretMarker }
    const objects = companies[0]!.objekte as Record<string, unknown>[]
    const periods = objects[0]!.abrechnungen as Record<string, unknown>[]
    const standardStatus = periods[0]!.standardKostenartenStatus as Record<
      string,
      unknown
    >
    standardStatus[privateCostKey] = {
      aktiv: privateStatusValue,
      [privateStatusField]: 'bleibt erhalten',
    }

    const result = migrateV3ToCurrent(input, OPTIONS)
    const data = expectSuccess(result)
    if (!result.ok) return
    const entries = collectLegacyUnmapped(data)

    expect(entries).toContainEqual({
      path: ['unbekanntes_privatfeld'],
      value: { marker: secretMarker },
    })
    expect(result.report.unmappedFields).toContain('firmen[0].<unknown-field>')
    expect(JSON.stringify(result.report)).not.toContain(secretMarker)
    expect(JSON.stringify(data)).toContain(privateCostKey)
    expect(JSON.stringify(data)).toContain(privateStatusValue)
    expect(JSON.stringify(data)).toContain(privateStatusField)
    expect(JSON.stringify(result.report)).not.toContain(privateCostKey)
    expect(JSON.stringify(result.report)).not.toContain(privateStatusValue)
    expect(JSON.stringify(result.report)).not.toContain(privateStatusField)
    expect(result.report.changedFields).toContainEqual(
      expect.objectContaining({
        sourcePath: expect.stringContaining('<cost-key>'),
        targetPath: expect.stringContaining('<cost-key>'),
      }),
    )
    expect(
      result.report.issues.every((issue) => issue.severity !== 'error'),
    ).toBe(true)
  })

  it.each([
    ['kein Objekt', null, 'invalid_json_structure'],
    ['altes Schema', { version: 2, firmen: [] }, 'unsupported_schema_version'],
    [
      'neueres Legacy-Schema',
      { version: 99, firmen: [] },
      'newer_schema_version',
    ],
    [
      'neueres aktuelles Schema',
      { schemaVersion: 99, meta: {} },
      'newer_schema_version',
    ],
    [
      'strukturell ungueltiges v3',
      { version: 3, firmen: 'falsch' },
      'invalid_json_structure',
    ],
  ])('weist %s kontrolliert als %s ab', (_label, input, expectedReason) => {
    const result = migrateV3ToCurrent(input, OPTIONS)
    expect(result).toMatchObject({ ok: false, reason: expectedReason })
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues.every((issue) => issue.severity === 'error')).toBe(
        true,
      )
    }
  })

  it('liefert validation_failed, wenn ein erforderliches Zielfeld fehlt', () => {
    const input = createMinimalFictionalV3File()
    input.firmen = [{ id: 'f_ohne_name_test', objekte: [] }]

    const result = migrateV3ToCurrent(input, OPTIONS)

    expect(result).toMatchObject({ ok: false, reason: 'validation_failed' })
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ severity: 'error', area: 'schema' }),
        ]),
      )
    }
  })

  it('ueberlebt JSON-Export und erneutes appDataFileSchema-Parsing fachlich identisch', () => {
    const original = expectSuccess(
      migrateV3ToCurrent(createFictionalV3File(), OPTIONS),
    )
    const reparsed = appDataFileSchema.parse(
      JSON.parse(JSON.stringify(original)),
    )

    expect(reparsed).toEqual(original)
    expect(reparsed.masterData.properties.map(({ id }) => id)).toEqual(
      original.masterData.properties.map(({ id }) => id),
    )
    expect(
      reparsed.billingData.costCategories.map(
        ({ totalAmountCents }) => totalAmountCents,
      ),
    ).toEqual(
      original.billingData.costCategories.map(
        ({ totalAmountCents }) => totalAmountCents,
      ),
    )
    expect(collectLegacyUnmapped(reparsed)).toEqual(
      collectLegacyUnmapped(original),
    )
  })
})
