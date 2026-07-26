import {
  appDataFileSchema,
  billingPeriodStatusSchema,
  isoDateSchema,
  isoTimestampSchema,
  type AppDataFile,
  type BillingPeriodStatus,
} from '@nebenkosten/schema'
import { clone } from './helpers'
import { getFinalizationDocumentStatus } from './finalization-documents'
import { validateBillingPeriod } from './validate'
import { BillingPeriodTransitionError, type TransitionOptions } from './types'

const ALLOWED: Readonly<
  Record<BillingPeriodStatus, readonly BillingPeriodStatus[]>
> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['DRAFT', 'READY_FOR_PDF'],
  READY_FOR_PDF: ['IN_REVIEW', 'FINALIZED'],
  FINALIZED: ['SUPERSEDED'],
  SUPERSEDED: [],
}

function requireReason(options: TransitionOptions): void {
  if (!options.reason?.trim())
    throw new BillingPeriodTransitionError(
      'transition.reason_required',
      'Für diesen Statuswechsel ist eine Begründung erforderlich.',
    )
}

export function transitionBillingPeriod(
  data: unknown,
  billingPeriodId: string,
  target: BillingPeriodStatus,
  options: TransitionOptions = {},
): AppDataFile {
  const parsed = appDataFileSchema.safeParse(data)
  if (!parsed.success)
    throw new BillingPeriodTransitionError(
      'transition.invalid_data',
      'Der Datenbestand ist ungültig.',
    )
  if (!billingPeriodStatusSchema.safeParse(target).success)
    throw new BillingPeriodTransitionError(
      'transition.invalid_target',
      'Der Zielstatus ist ungültig.',
    )
  const index = parsed.data.billingData.billingPeriods.findIndex(
    ({ id }) => id === billingPeriodId,
  )
  if (index < 0)
    throw new BillingPeriodTransitionError(
      'transition.period_not_found',
      'Die Abrechnungsperiode wurde nicht gefunden.',
    )
  const from = parsed.data.billingData.billingPeriods[index]!.status
  if (from === 'SUPERSEDED')
    throw new BillingPeriodTransitionError(
      'transition.terminal',
      'SUPERSEDED ist terminal; ein weiterer Statuswechsel ist nicht möglich.',
    )
  if (!ALLOWED[from].includes(target))
    throw new BillingPeriodTransitionError(
      'transition.not_allowed',
      `Der Statuswechsel ${from} → ${target} ist nicht zulässig.`,
    )
  if (
    (from === 'IN_REVIEW' && target === 'DRAFT') ||
    (from === 'READY_FOR_PDF' && target === 'IN_REVIEW') ||
    target === 'SUPERSEDED'
  )
    requireReason(options)
  const report = validateBillingPeriod(parsed.data, billingPeriodId, options)
  if (
    (target === 'READY_FOR_PDF' || target === 'FINALIZED') &&
    !report.canBecomeReady
  )
    throw new BillingPeriodTransitionError(
      'transition.validation_failed',
      'Offene Fehler oder unbestätigte Warnungen verhindern den Statuswechsel.',
      report,
    )
  if (
    target === 'FINALIZED' &&
    !getFinalizationDocumentStatus(parsed.data, billingPeriodId).complete
  )
    throw new BillingPeriodTransitionError(
      'transition.documents_required',
      'Vor der Finalisierung müssen alle Dokumente zum aktuellen Berechnungslauf erzeugt werden: Gesamtabrechnung und Einzelabrechnungen.',
      report,
    )
  if (
    target === 'FINALIZED' &&
    (!options.dispatchDate ||
      !isoDateSchema.safeParse(options.dispatchDate).success)
  )
    throw new BillingPeriodTransitionError(
      'transition.dispatch_date_required',
      'Für FINALIZED ist ein gültiges Versanddatum erforderlich.',
      report,
    )
  const timestamp = options.now ?? new Date().toISOString()
  if (!isoTimestampSchema.safeParse(timestamp).success)
    throw new BillingPeriodTransitionError(
      'transition.invalid_timestamp',
      'Der Audit-Zeitpunkt ist ungültig.',
    )
  const next = clone(parsed.data)
  next.billingData.billingPeriods[index] = {
    ...next.billingData.billingPeriods[index]!,
    status: target,
    ...(target === 'FINALIZED' ? { dispatchDate: options.dispatchDate } : {}),
    lastModifiedAt: timestamp,
  }
  const auditId =
    options.auditEventId ??
    (
      Reflect.get(globalThis, 'crypto') as
        { randomUUID?: () => string } | undefined
    )?.randomUUID?.() ??
    `audit-${billingPeriodId}-${target}-${timestamp}`.slice(0, 128)
  if (next.billingData.auditEvents.some(({ id }) => id === auditId))
    throw new BillingPeriodTransitionError(
      'transition.duplicate_audit_id',
      'Die Audit-ID ist bereits vorhanden.',
      report,
    )
  next.billingData.auditEvents = [
    ...next.billingData.auditEvents,
    {
      id: auditId,
      billingPeriodId,
      timestamp,
      action: 'billing_period.status_transition',
      details: {
        from,
        to: target,
        ...(options.actor ? { actor: options.actor } : {}),
        ...(options.reason ? { reason: options.reason.trim() } : {}),
        confirmedWarningKeys: [...(options.confirmedWarningKeys ?? [])].sort(),
        validation: {
          errors: report.errorCount,
          warnings: report.warningCount,
          infos: report.infoCount,
        },
      },
    },
  ]
  return next
}
