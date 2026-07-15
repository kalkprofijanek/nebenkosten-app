/**
 * Tests zu den Codex-Review-Befunden aus PR 03 (Draft-Review, erste
 * Schleife): Verlustfreiheit über `legacyUnmapped`, Zählerstatus ohne
 * BillingPeriod, SHA-256-Hex-Prüfung.
 */
import { describe, expect, it } from 'vitest'
import {
  appDataFileSchema,
  meterBillingStatusSchema,
  meterSchema,
  migrationReportSchema,
  organizationSchema,
  sha256HexSchema,
} from '../src'
import { createFictionalAppDataFile } from './fixtures'

describe('legacyUnmapped (Verlustfreiheit, MIGRATION.md Abschnitt 6)', () => {
  it('jede persistierte Entität akzeptiert konservierte unbekannte Felder', () => {
    const unmapped = { legacy_sonderfeld: 'wert', _zaehler_alt: 7 }
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

  it('Roundtrip erhält legacyUnmapped-Inhalte byte-identisch', () => {
    const file = createFictionalAppDataFile()
    file.masterData.organizations[0]!.legacyUnmapped = {
      unbekannt_a: [1, 2, 3],
      unbekannt_b: { tief: true },
    }
    const parsed = appDataFileSchema.parse(
      JSON.parse(JSON.stringify(appDataFileSchema.parse(file))),
    )
    expect(parsed.masterData.organizations[0]!.legacyUnmapped).toEqual(
      file.masterData.organizations[0]!.legacyUnmapped,
    )
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
