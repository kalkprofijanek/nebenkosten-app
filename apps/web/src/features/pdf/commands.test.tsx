import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { recordGeneratedDocument, recordGeneratedDocuments } from './commands'

const PERIOD_ID = '30000000-0000-4000-8000-000000000001'
const DOCUMENT_ID = '30000000-0000-4000-8000-000000000002'
const AUDIT_ID = '30000000-0000-4000-8000-000000000003'
const RUN_ID = '30000000-0000-4000-8000-000000000004'
const RESULT_ID = '30000000-0000-4000-8000-000000000005'
const OCCUPANCY_ID = '30000000-0000-4000-8000-000000000006'

function baseFile(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: PERIOD_ID,
          propertyId: 'property-1',
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'READY_FOR_PDF',
        },
      ],
      occupancyPeriods: [
        {
          id: OCCUPANCY_ID,
          billingPeriodId: PERIOD_ID,
          unitId: 'unit-1',
          tenancyId: 'tenancy-1',
          kind: 'tenant',
        },
      ],
      calculationRuns: [
        {
          id: RUN_ID,
          billingPeriodId: PERIOD_ID,
          startedAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      calculationResults: [
        {
          id: RESULT_ID,
          calculationRunId: RUN_ID,
          totals: {
            recordedCostsCents: 0,
            tenantTotalCents: 0,
            landlordTotalCents: 0,
            unallocatedCents: 0,
            prepaymentsCents: 0,
            controlDifferenceCents: 0,
          },
          warnings: [],
          snapshotFormatVersion: 3,
          resultSnapshot: {},
        },
      ],
    },
  }
}

describe('recordGeneratedDocument', () => {
  it('hängt einen Dokument- und einen Audit-Eintrag an', () => {
    const ids = [DOCUMENT_ID, AUDIT_ID]
    let index = 0
    const result = recordGeneratedDocument(
      baseFile(),
      {
        billingPeriodId: PERIOD_ID,
        calculationRunId: RUN_ID,
        kind: 'tenant_statement',
        fileName: 'NK_2026_WE1_Mustermann.pdf',
        sha256: 'a'.repeat(64),
        occupancyPeriodId: OCCUPANCY_ID,
      },
      {
        createId: () => ids[index++]!,
        now: () => new Date('2026-01-15T10:00:00.000Z'),
      },
    )

    expect(result.billingData.documents).toHaveLength(1)
    expect(result.billingData.documents[0]).toMatchObject({
      id: DOCUMENT_ID,
      billingPeriodId: PERIOD_ID,
      calculationRunId: RUN_ID,
      kind: 'tenant_statement',
      fileName: 'NK_2026_WE1_Mustermann.pdf',
      occupancyPeriodId: OCCUPANCY_ID,
    })
    expect(result.billingData.auditEvents).toHaveLength(1)
    expect(result.billingData.auditEvents[0]).toMatchObject({
      id: AUDIT_ID,
      billingPeriodId: PERIOD_ID,
      action: 'document.generated',
      details: {
        kind: 'tenant_statement',
        fileName: 'NK_2026_WE1_Mustermann.pdf',
      },
    })
  })

  it('funktioniert für objektweite Dokumente ohne occupancyPeriodId', () => {
    let index = 0
    const ids = [DOCUMENT_ID, AUDIT_ID]
    const result = recordGeneratedDocument(
      baseFile(),
      {
        billingPeriodId: PERIOD_ID,
        calculationRunId: RUN_ID,
        kind: 'combined_statement',
        fileName: 'NK_2026_Kostenaufstellung.pdf',
        sha256: 'b'.repeat(64),
      },
      { createId: () => ids[index++]! },
    )
    expect(result.billingData.documents[0]?.occupancyPeriodId).toBeNull()
    expect(result.billingData.documents[0]?.calculationRunId).toBe(RUN_ID)
  })

  it('zeichnet mehrere Dokumente eines ZIP-Laufs atomar auf', () => {
    let index = 0
    const ids = [
      DOCUMENT_ID,
      AUDIT_ID,
      '30000000-0000-4000-8000-000000000007',
      '30000000-0000-4000-8000-000000000008',
    ]

    const result = recordGeneratedDocuments(
      baseFile(),
      [
        {
          billingPeriodId: PERIOD_ID,
          calculationRunId: RUN_ID,
          kind: 'tenant_statement',
          fileName: 'NK_2026_WE1.pdf',
          sha256: 'a'.repeat(64),
          occupancyPeriodId: OCCUPANCY_ID,
        },
        {
          billingPeriodId: PERIOD_ID,
          calculationRunId: RUN_ID,
          kind: 'zip_bundle',
          fileName: 'NK_2026_Einzel-PDFs.zip',
          sha256: 'b'.repeat(64),
        },
      ],
      {
        createId: () => ids[index++]!,
        now: () => new Date('2026-01-15T10:00:00.000Z'),
      },
    )

    expect(result.billingData.documents).toHaveLength(2)
    expect(result.billingData.auditEvents).toHaveLength(2)
    expect(
      result.billingData.documents.every(
        ({ calculationRunId }) => calculationRunId === RUN_ID,
      ),
    ).toBe(true)
  })

  it('weist veraltete Rechenläufe und falsche Empfängerbezüge zurück', () => {
    expect(() =>
      recordGeneratedDocument(baseFile(), {
        billingPeriodId: PERIOD_ID,
        calculationRunId: 'old-run',
        kind: 'combined_statement',
        fileName: 'alt.pdf',
        sha256: 'a'.repeat(64),
      }),
    ).toThrow(/aktuellen Berechnungslauf/)

    expect(() =>
      recordGeneratedDocument(baseFile(), {
        billingPeriodId: PERIOD_ID,
        calculationRunId: RUN_ID,
        kind: 'tenant_statement',
        fileName: 'falsch.pdf',
        sha256: 'a'.repeat(64),
        occupancyPeriodId: 'other-occupancy',
      }),
    ).toThrow(/Nutzungszeitraum/)
  })
})
