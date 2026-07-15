/**
 * Tests zu den Codex-Review-Befunden aus PR 03 (Draft-Review, erste
 * Schleife): Verlustfreiheit über `legacyUnmapped`, Zählerstatus ohne
 * BillingPeriod, SHA-256-Hex-Prüfung.
 */
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '../src'
import {
  appDataFileSchema,
  fileAttachmentSchema,
  legacyUnmappedSchema,
  meterBillingStatusSchema,
  meterSchema,
  migrationReportSchema,
  organizationSchema,
  sha256HexSchema,
} from '../src'
import { createFictionalAppDataFile } from './fixtures'

describe('legacyUnmapped (Verlustfreiheit, MIGRATION.md Abschnitt 6)', () => {
  it('jede persistierte Entität akzeptiert konservierte unbekannte Felder', () => {
    const unmapped = [
      { path: ['legacy_sonderfeld'], value: 'wert' },
      { path: ['_zaehler_alt'], value: 7 },
    ]
    expect(
      organizationSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Fiktiver Mandant',
        legacyUnmapped: unmapped,
      }).success,
    ).toBe(true)
    expect(
      meterSchema.safeParse({
        id: 'sz_test001',
        propertyId: 'obj_test001',
        kind: 'general',
        legacyUnmapped: unmapped,
      }).success,
    ).toBe(true)
  })

  it('Roundtrip erhält gefährliche Schlüsselnamen ohne Objekt-Merge', () => {
    const file = createFictionalAppDataFile()
    const nestedDangerousKeys = JSON.parse(
      '{"__proto__":{"bleibt":true},"constructor":{"prototype":{"bleibt":true}}}',
    ) as JsonValue
    file.masterData.organizations[0]!.legacyUnmapped = [
      { path: ['__proto__'], value: { bleibt: true } },
      { path: ['verschachtelt'], value: nestedDangerousKeys },
    ]
    const parsed = appDataFileSchema.parse(
      JSON.parse(JSON.stringify(appDataFileSchema.parse(file))),
    )
    expect(parsed.masterData.organizations[0]!.legacyUnmapped).toEqual(
      file.masterData.organizations[0]!.legacyUnmapped,
    )
    expect(({} as Record<string, unknown>).bleibt).toBeUndefined()
  })

  it('lehnt nicht JSON-sichere und entartet tiefe Werte ab', () => {
    expect(
      organizationSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Fiktiver Mandant',
        legacyUnmapped: [{ path: ['ungueltig'], value: new Date() }],
      }).success,
    ).toBe(false)

    let tooDeep: unknown = 'Ende'
    for (let depth = 0; depth < 40; depth += 1) tooDeep = [tooDeep]
    expect(
      organizationSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Fiktiver Mandant',
        legacyUnmapped: [{ path: ['zu_tief'], value: tooDeep }],
      }).success,
    ).toBe(false)
  })

  it('lehnt Getter und geerbte Pfad-/Wert-Eigenschaften ohne Ausfuehrung ab', () => {
    let getterCalled = false
    const getterEntry = Object.defineProperties(
      {},
      {
        path: {
          enumerable: true,
          get: () => {
            getterCalled = true
            return ['getter']
          },
        },
        value: { enumerable: true, value: 'wert' },
      },
    )
    expect(legacyUnmappedSchema.safeParse([getterEntry]).success).toBe(false)
    expect(getterCalled).toBe(false)

    const inheritedEntry = Object.create({
      path: ['geerbt'],
      value: 'wert',
    }) as Record<string, unknown>
    inheritedEntry.unrelatedOne = true
    inheritedEntry.unrelatedTwo = true
    expect(legacyUnmappedSchema.safeParse([inheritedEntry]).success).toBe(false)
  })

  it('lehnt sparse Pfad- und Wert-Arrays ab', () => {
    const sparsePath = Array<string>(1)
    const sparseValue = Array<JsonValue>(1)
    expect(
      legacyUnmappedSchema.safeParse([{ path: sparsePath, value: 'wert' }])
        .success,
    ).toBe(false)
    expect(
      legacyUnmappedSchema.safeParse([{ path: ['wert'], value: sparseValue }])
        .success,
    ).toBe(false)
  })

  it('lehnt Arrays mit manipuliertem Prototyp ab', () => {
    const manipulatedRoot: unknown[] = []
    Object.setPrototypeOf(manipulatedRoot, {})
    expect(legacyUnmappedSchema.safeParse(manipulatedRoot).success).toBe(false)

    const manipulatedValue: JsonValue[] = []
    Object.setPrototypeOf(manipulatedValue, {})
    expect(
      legacyUnmappedSchema.safeParse([
        { path: ['manipuliert'], value: manipulatedValue },
      ]).success,
    ).toBe(false)
  })
})

describe('MeterBillingStatus ohne BillingPeriod (MIGRATION.md 4.11)', () => {
  it('akzeptiert einen Jahresstatus ohne billingPeriodId, Jahr bleibt erhalten', () => {
    const result = meterBillingStatusSchema.safeParse({
      id: 'mbs_test001',
      meterId: 'sz_test001',
      billingPeriodId: null,
      year: 2027,
      bookingPresent: true,
      annualInvoicePresent: false,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.year).toBe(2027)
  })

  it('lehnt einen Jahresstatus ohne Jahr auch mit BillingPeriod ab', () => {
    expect(
      meterBillingStatusSchema.safeParse({
        id: 'mbs_test002',
        meterId: 'sz_test001',
        billingPeriodId: 'abr_test001',
      }).success,
    ).toBe(false)
  })
})

describe('Beleg-Dateianhang (Legacy-Grenzen)', () => {
  const validAttachment = {
    fileName: 'rechnung.pdf',
    mimeType: 'application/pdf',
    dataBase64: 'data:application/pdf;base64,JVBERg==',
  }

  it('akzeptiert einen kleinen erlaubten Base64-Data-URL-Anhang', () => {
    expect(fileAttachmentSchema.safeParse(validAttachment).success).toBe(true)
  })

  it('lehnt gefährliche Namen, Typen und ungültiges Base64 ab', () => {
    expect(
      fileAttachmentSchema.safeParse({
        ...validAttachment,
        fileName: '../rechnung.pdf',
      }).success,
    ).toBe(false)
    expect(
      fileAttachmentSchema.safeParse({
        ...validAttachment,
        mimeType: 'text/html',
        dataBase64: 'data:text/html;base64,PGgxPkJlaXNwaWVsPC9oMT4=',
      }).success,
    ).toBe(false)
    expect(
      fileAttachmentSchema.safeParse({
        ...validAttachment,
        dataBase64: 'das-ist-kein-base64-data-url',
      }).success,
    ).toBe(false)
    expect(
      fileAttachmentSchema.safeParse({
        ...validAttachment,
        mimeType: 'image/png',
      }).success,
    ).toBe(false)
  })
})

describe('SHA-256-Hex-Prüfung', () => {
  it('akzeptiert nur lowercase-Hex mit 64 Zeichen', () => {
    expect(sha256HexSchema.safeParse('a'.repeat(64)).success).toBe(true)
    expect(sha256HexSchema.safeParse('A'.repeat(64)).success).toBe(false)
    expect(sha256HexSchema.safeParse('z'.repeat(64)).success).toBe(false)
    expect(sha256HexSchema.safeParse('a'.repeat(63)).success).toBe(false)
  })

  it('Migrationsbericht lehnt Nicht-Hex-Quellhashes ab', () => {
    const base = {
      sourceSha256: 'X'.repeat(64),
      detectedSchemaVersion: 3,
      targetSchemaVersion: 4,
      counts: {
        ownerCompanies: 0,
        properties: 0,
        billingPeriods: 0,
        occupancyPeriods: 0,
        costCategories: 0,
        costEntries: 0,
        heatingCircuits: 0,
        energySources: 0,
        bankBookings: 0,
        meters: 0,
        warnings: 0,
      },
      issues: [],
      changedFields: [],
      droppedFields: [],
      unmappedFields: [],
      migratedAt: '2026-07-14T12:00:00Z',
    }
    expect(migrationReportSchema.safeParse(base).success).toBe(false)
    expect(
      migrationReportSchema.safeParse({
        ...base,
        sourceSha256: 'c'.repeat(64),
      }).success,
    ).toBe(true)
  })
})
