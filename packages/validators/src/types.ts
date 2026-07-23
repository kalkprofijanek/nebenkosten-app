import type {
  AppDataFile,
  AuditEvent,
  BillingPeriodStatus,
  ValidationIssue,
} from '@nebenkosten/schema'

export type ValidationIssueWithKey = ValidationIssue & { readonly key: string }

export interface ValidationOptions {
  readonly confirmedWarningKeys?: readonly string[]
}

export interface ValidationReport {
  readonly billingPeriodId: string
  readonly issues: readonly ValidationIssueWithKey[]
  readonly errorCount: number
  readonly warningCount: number
  readonly infoCount: number
  readonly unconfirmedWarningKeys: readonly string[]
  readonly canBecomeReady: boolean
}

export interface TransitionOptions extends ValidationOptions {
  readonly reason?: string
  readonly dispatchDate?: string
  readonly actor?: string
  readonly now?: string
  readonly auditEventId?: string
}

export class BillingPeriodTransitionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly report?: ValidationReport,
  ) {
    super(message)
    this.name = 'BillingPeriodTransitionError'
  }
}

export interface TransitionContext {
  readonly data: AppDataFile
  readonly from: BillingPeriodStatus
  readonly target: BillingPeriodStatus
  readonly event: AuditEvent
}
