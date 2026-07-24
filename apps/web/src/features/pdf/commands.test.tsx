import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { recordGeneratedDocument } from './commands'

const PERIOD_ID = '30000000-0000-4000-8000-000000000001'
const DOCUMENT_ID = '30000000-0000-4000-8000-000000000002'
const AUDIT_ID = '30000000-0000-4000-8000-000000000003'

function baseFile(): AppDataFile {
  return createEmptyAppDataFile()
}

describe('recordGeneratedDocument', () => {
  it('hängt einen Dokument- und einen Audit-Eintrag an', () => {
    const ids = [DOCUMENT_ID, AUDIT_ID]
    let index = 0
    const result = recordGeneratedDocument(
      baseFile(),
      {
        billingPeriodId: PERIOD_ID,
        kind: 'tenant_statement',
        fileName: 'NK_2026_WE1_Mustermann.pdf',
        sha256: 'a'.repeat(64),
        occupancyPeriodId: 'occ-1',
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
      kind: 'tenant_statement',
      fileName: 'NK_2026_WE1_Mustermann.pdf',
      occupancyPeriodId: 'occ-1',
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

  it('funktioniert ohne calculationRunId/occupancyPeriodId', () => {
    let index = 0
    const ids = [DOCUMENT_ID, AUDIT_ID]
    const result = recordGeneratedDocument(
      baseFile(),
      {
        billingPeriodId: PERIOD_ID,
        kind: 'combined_statement',
        fileName: 'NK_2026_Kostenaufstellung.pdf',
        sha256: 'b'.repeat(64),
      },
      { createId: () => ids[index++]! },
    )
    expect(result.billingData.documents[0]?.occupancyPeriodId).toBeNull()
    expect(result.billingData.documents[0]?.calculationRunId).toBeNull()
  })
})
