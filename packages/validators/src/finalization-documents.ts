import { appDataFileSchema, type AppDataFile } from '@nebenkosten/schema'
import { latestCalculationRun } from './latest-calculation-run'

export interface FinalizationDocumentStatus {
  readonly complete: boolean
  readonly calculationRunId?: string
  readonly missingCombinedStatement: boolean
  readonly missingTenantStatementCount: number
}

/** Prüft, ob alle Pflichtdokumente zum jüngsten Rechenlauf vorliegen. */
export function getFinalizationDocumentStatus(
  data: unknown,
  billingPeriodId: string,
): FinalizationDocumentStatus {
  const parsed: AppDataFile = appDataFileSchema.parse(data)
  const tenantOccupancyIds = parsed.billingData.occupancyPeriods
    .filter(
      (occupancy) =>
        occupancy.billingPeriodId === billingPeriodId &&
        occupancy.kind === 'tenant',
    )
    .map(({ id }) => id)
  const latestRun = latestCalculationRun(
    parsed.billingData.calculationRuns,
    billingPeriodId,
  )
  const hasResult =
    latestRun !== undefined &&
    parsed.billingData.calculationResults.some(
      (result) => result.calculationRunId === latestRun.id,
    )

  if (!latestRun || !hasResult) {
    return {
      complete: false,
      missingCombinedStatement: true,
      missingTenantStatementCount: tenantOccupancyIds.length,
    }
  }

  const currentDocuments = parsed.billingData.documents.filter(
    (document) =>
      document.billingPeriodId === billingPeriodId &&
      document.calculationRunId === latestRun.id &&
      Boolean(document.sha256),
  )
  const missingCombinedStatement = !currentDocuments.some(
    ({ kind }) => kind === 'combined_statement',
  )
  const documentedOccupancies = new Set(
    currentDocuments
      .filter(({ kind }) => kind === 'tenant_statement')
      .map(({ occupancyPeriodId }) => occupancyPeriodId),
  )
  const missingTenantStatementCount = tenantOccupancyIds.filter(
    (id) => !documentedOccupancies.has(id),
  ).length

  return {
    complete: !missingCombinedStatement && missingTenantStatementCount === 0,
    calculationRunId: latestRun.id,
    missingCombinedStatement,
    missingTenantStatementCount,
  }
}
