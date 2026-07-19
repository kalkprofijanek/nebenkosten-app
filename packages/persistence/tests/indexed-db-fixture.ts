import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { IDBFactory } from 'fake-indexeddb'

let databaseSequence = 0

export function createFictionalDatabaseFixture(label: string) {
  databaseSequence += 1

  const indexedDB = new IDBFactory()
  const databaseName = `nk-test-${label}-${databaseSequence}`
  let idSequence = 0

  return {
    databaseName,
    indexedDB,
    createId: () => {
      idSequence += 1
      return `fictional-snapshot-${label}-${idSequence}`
    },
  }
}

export function createLosslessFictionalFile(label: string): AppDataFile {
  const empty = createEmptyAppDataFile()

  return {
    ...empty,
    meta: {
      savedAt: null,
      appVersion: `fictional-${label}`,
      migratedFrom: null,
    },
    masterData: {
      ...empty.masterData,
      organizations: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: `Testorganisation ${label} (fiktiv)`,
          legacyUnmapped: [
            {
              path: ['fictional_extension'],
              value: { zero: 0, empty: '', nullable: null },
            },
          ],
        },
      ],
    },
    billingData: {
      ...empty.billingData,
      calculationResults: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          calculationRunId: '33333333-3333-4333-8333-333333333333',
          totals: {
            recordedCostsCents: 12_345,
            tenantTotalCents: 12_345,
            landlordTotalCents: 0,
            unallocatedCents: 0,
            prepaymentsCents: 0,
            controlDifferenceCents: 0,
          },
          warnings: [],
          snapshotFormatVersion: 2,
          resultSnapshot: {
            label,
            orderedValues: [0, null, false, ''],
            nested: { amountCents: 12_345 },
          },
          legacyUnmapped: null,
        },
      ],
      auditEvents: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          billingPeriodId: null,
          timestamp: '2026-04-05T06:07:08.000Z',
          action: `Fiktiver Testeintrag ${label}`,
          details: { count: 0, note: null },
          legacyUnmapped: null,
        },
      ],
    },
  }
}

export function withFictionalLabel(
  source: AppDataFile,
  label: string,
): AppDataFile {
  return {
    ...source,
    meta: {
      ...source.meta,
      appVersion: `fictional-${label}`,
    },
  }
}

export async function deleteFictionalDatabase(
  indexedDB: IDBFactory,
  databaseName: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('Fiktive Testdatenbank konnte nicht geloescht werden'))
    request.onsuccess = () => resolve()
  })
}
