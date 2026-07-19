import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'

export const FIRST_SAVE = new Date('2026-02-01T10:00:00.000Z')
export const SECOND_SAVE = new Date('2026-02-01T11:00:00.000Z')
export const RESTORE_SAVE = new Date('2026-02-01T12:00:00.000Z')

export function createFictionalCurrentFile(): AppDataFile {
  const empty = createEmptyAppDataFile()

  return {
    ...empty,
    meta: {
      savedAt: null,
      appVersion: 'test-suite',
      migratedFrom: {
        schemaVersion: 3,
        sourceSha256: 'a'.repeat(64),
        migratedAt: '2026-01-31T08:00:00.000Z',
      },
    },
    masterData: {
      ...empty.masterData,
      organizations: [
        {
          id: 'organization-fictional',
          name: 'Fiktive Testverwaltung',
          createdAt: null,
          legacyUnmapped: [
            {
              path: ['futureFlag'],
              value: { enabled: true, note: 'fictional' },
            },
          ],
        },
      ],
    },
    billingData: {
      ...empty.billingData,
      costCategories: [
        {
          id: 'cost-category-fictional',
          billingPeriodId: 'billing-period-fictional',
          kind: 'operating',
          label: 'Fiktive Betriebskosten',
          totalAmountCents: 0,
        },
      ],
      costEntries: [
        {
          id: 'cost-entry-fictional',
          costCategoryId: 'cost-category-fictional',
          amountCents: 12_345,
          description: null,
        },
      ],
      calculationRuns: [
        {
          id: 'calculation-run-fictional',
          billingPeriodId: 'billing-period-fictional',
          startedAt: '2026-01-31T09:00:00.000Z',
          appVersion: null,
          inputSha256: 'b'.repeat(64),
        },
      ],
      calculationResults: [
        {
          id: 'calculation-result-fictional',
          calculationRunId: 'calculation-run-fictional',
          totals: {
            recordedCostsCents: 12_345,
            tenantTotalCents: 10_000,
            landlordTotalCents: 2_345,
            unallocatedCents: 0,
            prepaymentsCents: 0,
            controlDifferenceCents: 0,
          },
          warnings: [],
          snapshotFormatVersion: 2,
          resultSnapshot: {
            snapshotFormatVersion: 2,
            periodDays: 365,
            totals: {
              recordedCostsCents: 12_345,
              tenantTotalCents: 10_000,
              landlordTotalCents: 2_345,
              unallocatedCents: 0,
              prepaymentsCents: 0,
              controlDifferenceCents: 0,
              directCostsCents: 0,
              internalCostsCents: 0,
            },
            heating: {
              trace: {
                traceFormatVersion: 1,
                circuits: [],
              },
            },
            co2: {
              totalCostCents: 0,
              tenantCents: 0,
              landlordCents: 0,
            },
            tenants: [],
            warnings: [],
          },
        },
      ],
      auditEvents: [
        {
          id: 'audit-event-fictional',
          billingPeriodId: null,
          timestamp: '2026-01-31T09:30:00.000Z',
          action: 'Fiktiver Teststand gespeichert',
          details: {
            zero: 0,
            absentMeaning: null,
          },
        },
      ],
    },
  }
}

export function createClock(...instants: Date[]): () => Date {
  let index = 0
  return () => {
    const instant = instants[Math.min(index, instants.length - 1)]
    index += 1
    return new Date(instant!.getTime())
  }
}
