import { describe, expect, it } from 'vitest'

import type { MigrationReport, MigrationResult } from '../src'
import {
  migrateV3ToCurrent,
  migrationReportSchema,
  validationIssueSchema,
} from '../src'

function createFictionalReport(): MigrationReport {
  return {
    sourceFileName: 'nk-daten_test-fixture.json',
    sourceSha256: 'a'.repeat(64),
    detectedSchemaVersion: 3,
    targetSchemaVersion: 4,
    counts: {
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
      warnings: 1,
    },
    issues: [
      {
        severity: 'warning',
        code: 'migration.euro_cents_rounding',
        area: 'migration',
        title: 'Betrag wurde auf ganze Cent gerundet',
        detail: 'Fiktiver Testhinweis',
        path: ['firmen', 0, 'objekte', 0],
        entity: { type: 'CostEntry', id: 'k_test001' },
      },
    ],
    changedFields: [
      {
        sourcePath: 'firmen[].objekte[].abrechnungen[].kostenarten[].betrag',
        targetPath: 'billingData.costCategories[].totalAmountCents',
        rule: 'euro_to_cents',
        note: 'kaufmännische Rundung, Warnung bei Restdifferenz',
      },
    ],
    droppedFields: [
      {
        sourcePath: 'firmen[].objekte[].bloecke[].hk',
        reason: 'Altfeld, im Legacy-Code nachweislich ungenutzt',
        valueType: 'string',
      },
    ],
    unmappedFields: ['firmen[0]._experimentelles_rootfeld'],
    migratedAt: '2025-01-15T10:00:00.000Z',
    appVersion: 'test-only',
  }
}

describe('migrationReportSchema (Masterplan 9.3)', () => {
  it('akzeptiert einen vollständigen Bericht', () => {
    expect(
      migrationReportSchema.safeParse(createFictionalReport()).success,
    ).toBe(true)
  })

  it('erzwingt einen 64-stelligen Quelldatei-Hash', () => {
    const report = { ...createFictionalReport(), sourceSha256: 'abc' }
    expect(migrationReportSchema.safeParse(report).success).toBe(false)
  })

  it('erzwingt vollständige Zählungen', () => {
    const report = createFictionalReport() as Record<string, unknown>
    report.counts = { ownerCompanies: 1 }
    expect(migrationReportSchema.safeParse(report).success).toBe(false)
  })

  it('verworfene Felder brauchen immer eine Begründung', () => {
    const report = createFictionalReport()
    report.droppedFields = [
      // @ts-expect-error Begründung fehlt bewusst
      { sourcePath: 'firmen[].objekte[].bloecke[].hk' },
    ]
    expect(migrationReportSchema.safeParse(report).success).toBe(false)
  })
})

describe('validationIssueSchema (Masterplan 7.1)', () => {
  it('akzeptiert genau die Kategorien error/warning/info', () => {
    for (const severity of ['error', 'warning', 'info'] as const) {
      expect(
        validationIssueSchema.safeParse({
          severity,
          code: 'schema.test_only',
          area: 'schema',
          title: 'Fiktiver Prüfhinweis',
        }).success,
      ).toBe(true)
    }
    // Legacy-Wert `warn` ist bewusst ungültig (Mapping-Aufgabe der Migration):
    expect(
      validationIssueSchema.safeParse({
        severity: 'warn',
        code: 'schema.test_only',
        area: 'schema',
        title: 'x',
      }).success,
    ).toBe(false)
  })

  it('erzwingt stabile, maschinenlesbare Codes', () => {
    expect(
      validationIssueSchema.safeParse({
        severity: 'error',
        code: 'Kein Gültiger Code!',
        area: 'schema',
        title: 'x',
      }).success,
    ).toBe(false)
  })
})

describe('migrateV3ToCurrent (Vertrag, Implementierung in PR 04)', () => {
  it('ist als Funktion exportiert und wirft bis PR 04 einen klaren Fehler', () => {
    expect(() => migrateV3ToCurrent({ version: 3, firmen: [] })).toThrowError(
      /PR 04/,
    )
  })

  it('MigrationResult deckt Erfolgs- und Fehlerpfad ab (Typvertrag)', () => {
    const failure: MigrationResult = {
      ok: false,
      reason: 'newer_schema_version',
      issues: [
        {
          severity: 'error',
          code: 'schema.newer_version_blocked',
          area: 'schema',
          title: 'Datei hat eine neuere Schema-Version',
        },
      ],
    }
    expect(failure.ok).toBe(false)
    if (!failure.ok) {
      expect(failure.reason).toBe('newer_schema_version')
      expect(failure.issues[0]!.severity).toBe('error')
    }
  })
})
