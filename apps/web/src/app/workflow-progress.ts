import type { AppDataFile } from '@nebenkosten/schema'

import { appRoutes } from './navigation'
import type { SelectionContext } from './selection'

export type WorkflowStepStatus = 'done' | 'open'

export interface WorkflowStepProgress {
  readonly path: (typeof appRoutes)[number]['path']
  readonly status: WorkflowStepStatus
}

export interface WorkflowProgress {
  readonly steps: readonly WorkflowStepProgress[]
  readonly completed: number
  readonly total: number
}

export function workflowProgress(
  data: AppDataFile | null | undefined,
  selection: SelectionContext,
): WorkflowProgress {
  const periodId = selection.billingPeriodId
  const period = data?.billingData.billingPeriods.find(
    ({ id }) => id === periodId,
  )
  const periodCategoryIds = new Set(
    data?.billingData.costCategories
      .filter(({ billingPeriodId }) => billingPeriodId === periodId)
      .map(({ id }) => id),
  )
  const periodRunIds = new Set(
    data?.billingData.calculationRuns
      .filter(({ billingPeriodId }) => billingPeriodId === periodId)
      .map(({ id }) => id),
  )
  const completedByPath: Readonly<Record<string, boolean>> = {
    '/firmen': (data?.masterData.ownerCompanies.length ?? 0) > 0,
    '/objekte': selection.propertyId !== null,
    '/abrechnungsjahre': period !== undefined,
    '/nutzer':
      data?.billingData.occupancyPeriods.some(
        ({ billingPeriodId }) => billingPeriodId === periodId,
      ) ?? false,
    '/kosten':
      data?.billingData.costEntries.some(({ costCategoryId }) =>
        periodCategoryIds.has(costCategoryId),
      ) ?? false,
    '/heizkreise':
      data?.billingData.heatingCircuits.some(
        ({ billingPeriodId }) => billingPeriodId === periodId,
      ) ?? false,
    '/berechnung':
      data?.billingData.calculationResults.some(({ calculationRunId }) =>
        periodRunIds.has(calculationRunId),
      ) ?? false,
    '/freigabe':
      period?.status === 'READY_FOR_PDF' || period?.status === 'FINALIZED',
    '/pdf-export':
      data?.billingData.documents.some(
        ({ billingPeriodId }) => billingPeriodId === periodId,
      ) ?? false,
    '/sicherung': data?.meta.savedAt != null,
  }
  const steps = appRoutes.slice(1).map(({ path }) => ({
    path,
    status: completedByPath[path] ? ('done' as const) : ('open' as const),
  }))

  return {
    steps,
    completed: steps.filter(({ status }) => status === 'done').length,
    total: steps.length,
  }
}
