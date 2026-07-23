import {
  appDataFileSchema,
  type AppDataFile,
  type BillingPeriodStatus,
} from '@nebenkosten/schema'

export class BillingPeriodEditGuardError extends Error {
  override readonly name = 'BillingPeriodEditGuardError'
}

export interface EditGuardDependencies {
  readonly createId: () => string
  readonly now: () => Date
}

const defaultDependencies = (): EditGuardDependencies => ({
  createId: () => crypto.randomUUID(),
  now: () => new Date(),
})

function lockedStatus(status: BillingPeriodStatus): boolean {
  return (
    status === 'READY_FOR_PDF' ||
    status === 'FINALIZED' ||
    status === 'SUPERSEDED'
  )
}

function resetReview(
  data: AppDataFile,
  billingPeriodId: string,
  dependencies: EditGuardDependencies,
): AppDataFile {
  const auditId = dependencies.createId()
  const timestamp = dependencies.now().toISOString()
  if (data.billingData.auditEvents.some((event) => event.id === auditId)) {
    throw new BillingPeriodEditGuardError(
      'Die Statusänderung konnte nicht eindeutig protokolliert werden.',
    )
  }

  return appDataFileSchema.parse({
    ...data,
    billingData: {
      ...data.billingData,
      billingPeriods: data.billingData.billingPeriods.map((period) =>
        period.id === billingPeriodId
          ? {
              ...period,
              status: 'DRAFT' as const,
              lastModifiedAt: timestamp,
            }
          : period,
      ),
      auditEvents: [
        ...data.billingData.auditEvents,
        {
          id: auditId,
          billingPeriodId,
          timestamp,
          action: 'billing_period.review_invalidated',
          details: {
            from: 'IN_REVIEW',
            to: 'DRAFT',
            reason: 'Fachliche Daten geändert.',
          },
        },
      ],
    },
  })
}

export function applyEditableBillingPeriodChange(
  data: AppDataFile,
  billingPeriodId: string,
  transform: (current: AppDataFile) => AppDataFile,
  dependencies: EditGuardDependencies = defaultDependencies(),
): AppDataFile {
  const source = appDataFileSchema.parse(structuredClone(data))
  const period = source.billingData.billingPeriods.find(
    (item) => item.id === billingPeriodId,
  )
  if (!period) {
    throw new BillingPeriodEditGuardError(
      'Der ausgewählte Abrechnungszeitraum wurde nicht gefunden.',
    )
  }
  if (lockedStatus(period.status)) {
    throw new BillingPeriodEditGuardError(
      'Das Abrechnungsjahr ist für fachliche Änderungen gesperrt. Öffne zuerst kontrolliert die Prüfung.',
    )
  }

  const editable =
    period.status === 'IN_REVIEW'
      ? resetReview(source, billingPeriodId, dependencies)
      : source
  const result = appDataFileSchema.parse(transform(structuredClone(editable)))
  const resultingPeriod = result.billingData.billingPeriods.find(
    (item) => item.id === billingPeriodId,
  )
  if (!resultingPeriod || resultingPeriod.status !== 'DRAFT') {
    throw new BillingPeriodEditGuardError(
      'Fachliche Änderungen dürfen den Freigabestatus nicht umgehen.',
    )
  }
  return result
}
