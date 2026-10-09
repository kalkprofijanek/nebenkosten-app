/**
 * Anpassung der Betriebskostenvorauszahlung nach § 560 Abs. 4 BGB.
 *
 * Fachliche Vorgaben (Entscheidung des Vermieters):
 * - nur Mieter mit Nachzahlung, laufendem Mietverhältnis und vereinbarter
 *   monatlicher Vorauszahlung,
 * - Basis ist der Kostenanteil des gespeicherten Rechenstands, auf 365 Tage
 *   hochgerechnet; neue Vorauszahlung = Jahreskosten / 12, auf volle Euro
 *   aufgerundet, ohne Sicherheitszuschlag,
 * - Vorschlag erst ab einer Erhöhung um mindestens 5 Euro,
 * - Belegung unter 90 Tagen: Hochrechnung unsicher (Hinweis).
 *
 * Die Entscheidung wird ohne Schemaänderung gespeichert: bei „Ja“ wird die
 * monatliche Vorauszahlung derselben Mietpartei im Zieljahr gesetzt und in
 * jedem Fall ein Audit-Event im abgerechneten Jahr protokolliert. Aus dem
 * jüngsten Audit-Event folgt, ob das Anpassungsschreiben beigefügt wird.
 *
 * Entscheidungen können auch aus den Daten stammen (Legacy-v3-Import,
 * `vz_anpassung*`, `details.source`): Dann fehlen die Werte aus dem
 * Rechenstand; sie werden beim Auswerten aus dem aktuellen Vorschlag
 * ergänzt (neue Vorauszahlung und Termin nur, wenn nicht angegeben).
 */
import {
  calculateOccupancyDays,
  type CalculationOutput,
} from '@nebenkosten/core'
import {
  roundedUpMonthlyCents,
  type PrepaymentAdjustmentLetter,
} from '@nebenkosten/pdf'
import {
  appDataFileSchema,
  PREPAYMENT_ADJUSTMENT_DATA_SOURCE,
  PREPAYMENT_ADJUSTMENT_DECIDED_ACTION,
  type AppDataFile,
  type BillingPeriod,
  type OccupancyPeriod,
  type Prepayment,
} from '@nebenkosten/schema'
import { setOccupancyPrepayment } from '../occupancies/commands'
import { latestCalculationSnapshot } from '../pdf/context'
import {
  applyEditableBillingPeriodChange,
  type EditGuardDependencies,
} from '../release/edit-guard'

export const PREPAYMENT_ADJUSTMENT_ACTION = PREPAYMENT_ADJUSTMENT_DECIDED_ACTION
export const MIN_ADJUSTMENT_INCREASE_CENTS = 500
export const UNCERTAIN_OCCUPANCY_DAYS = 90
const DAYS_PER_YEAR = 365

export class PrepaymentAdjustmentError extends Error {
  override readonly name = 'PrepaymentAdjustmentError'
}

export interface AdjustmentCalculationInput {
  readonly shareCents: number
  readonly occupiedDays: number
  readonly previousMonthlyCents: number
}

export interface AdjustmentCalculation {
  readonly annualizedCostsCents: number
  readonly proposedMonthlyCents: number
  readonly increaseCents: number
  readonly uncertain: boolean
}

/**
 * Hochrechnung auf 365 Tage und Rundung auf volle Euro. Liefert `null`,
 * wenn die Erhöhung unter der Schwelle von 5 Euro bleibt.
 */
export function calculateAdjustment({
  shareCents,
  occupiedDays,
  previousMonthlyCents,
}: AdjustmentCalculationInput): AdjustmentCalculation | null {
  if (occupiedDays <= 0 || shareCents <= 0) return null
  const annualizedCostsCents = Math.round(
    (shareCents / occupiedDays) * DAYS_PER_YEAR,
  )
  const proposedMonthlyCents = roundedUpMonthlyCents(annualizedCostsCents)
  const increaseCents = proposedMonthlyCents - previousMonthlyCents
  if (increaseCents < MIN_ADJUSTMENT_INCREASE_CENTS) return null
  return {
    annualizedCostsCents,
    proposedMonthlyCents,
    increaseCents,
    uncertain: occupiedDays < UNCERTAIN_OCCUPANCY_DAYS,
  }
}

export interface AdjustmentProposal extends AdjustmentCalculation {
  readonly occupancyPeriodId: string
  readonly tenancyId: string
  readonly occupiedDays: number
  readonly shareCents: number
  readonly balanceCents: number
  readonly previousMonthlyCents: number
  /** Versanddatum (Nutzer vor Abrechnungsjahr), sonst `null`. */
  readonly dispatchDate: string | null
}

function isRunningAtPeriodEnd(
  data: AppDataFile,
  occupancy: OccupancyPeriod,
  period: BillingPeriod,
): boolean {
  if (occupancy.to != null && occupancy.to < period.periodEnd) return false
  const tenancy = data.masterData.tenancies.find(
    ({ id }) => id === occupancy.tenancyId,
  )
  return tenancy?.movedOut == null || tenancy.movedOut > period.periodEnd
}

function occupancyDays(occupancy: OccupancyPeriod, period: BillingPeriod) {
  return calculateOccupancyDays(
    period.periodStart,
    period.periodEnd,
    occupancy.from,
    occupancy.to,
  )
}

/** Vorschläge aus einem Rechenstand (ohne Speicherzugriff, gut testbar). */
export function proposalsFromCalculation(
  data: AppDataFile,
  period: BillingPeriod,
  calculation: CalculationOutput,
): AdjustmentProposal[] {
  const proposals: AdjustmentProposal[] = []
  for (const tenant of calculation.tenants) {
    if (tenant.balanceCents <= 0) continue
    const occupancy = data.billingData.occupancyPeriods.find(
      ({ id, billingPeriodId }) =>
        id === tenant.id && billingPeriodId === period.id,
    )
    if (
      occupancy?.kind !== 'tenant' ||
      occupancy.tenancyId == null ||
      !isRunningAtPeriodEnd(data, occupancy, period)
    )
      continue
    const prepayment = data.billingData.prepayments.find(
      ({ occupancyPeriodId }) => occupancyPeriodId === occupancy.id,
    )
    if (prepayment?.mode !== 'monthly') continue
    const occupiedDays = occupancyDays(occupancy, period)
    const adjustment = calculateAdjustment({
      shareCents: tenant.shareCents,
      occupiedDays,
      previousMonthlyCents: prepayment.monthlyAmountCents,
    })
    if (!adjustment) continue
    proposals.push({
      ...adjustment,
      occupancyPeriodId: occupancy.id,
      tenancyId: occupancy.tenancyId,
      occupiedDays,
      shareCents: tenant.shareCents,
      balanceCents: tenant.balanceCents,
      previousMonthlyCents: prepayment.monthlyAmountCents,
      dispatchDate: occupancy.dispatchDate ?? period.dispatchDate ?? null,
    })
  }
  return proposals
}

/**
 * Vorschläge aus dem gespeicherten Rechenstand. Wirft
 * `IncompatibleCalculationSnapshotError`, wenn der Stand zu alt ist.
 */
export function proposePrepaymentAdjustments(
  data: AppDataFile,
  billingPeriodId: string,
): AdjustmentProposal[] | null {
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period) return null
  const snapshot = latestCalculationSnapshot(data, billingPeriodId)
  if (!snapshot) return null
  return proposalsFromCalculation(data, period, snapshot.output)
}

/**
 * Vom Vermieter festgelegter Standardtermin: immer ein 01.01., und zwar der
 * erste, der frühestens am Ersten des übernächsten Monats nach Versand liegt
 * (keine rückwirkende Erhöhung). Abrechnung 2025, Versand Oktober 2026 →
 * 01.01.2027; Versand Dezember 2026 → 01.01.2028.
 */
export function defaultValidFrom(
  period: BillingPeriod,
  dispatchDate: string,
): string {
  const earliest = earliestValidFrom(dispatchDate)
  let year = Number(earliest.slice(0, 4))
  if (earliest > `${year}-01-01`) year += 1
  return `${Math.max(year, period.year + 1)}-01-01`
}

/** Lokales ISO-Datum (ohne Zeitzonenverschiebung durch `toISOString`). */
export function localIsoDate(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Frühester Termin nach § 560 Abs. 4 BGB in der Praxis: Erster des
 * übernächsten Monats nach Versand (Zugang).
 */
export function earliestValidFrom(dispatchDate: string): string {
  const [year, month] = dispatchDate.split('-').map(Number) as [number, number]
  const target = new Date(Date.UTC(year, month - 1 + 2, 1))
  return target.toISOString().slice(0, 10)
}

export function isFirstOfMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-01$/u.test(value)
}

export type AdjustmentTarget =
  | {
      readonly kind: 'occupancy'
      readonly billingPeriod: BillingPeriod
      readonly occupancy: OccupancyPeriod
    }
  | { readonly kind: 'missing_year'; readonly year: number }
  | {
      readonly kind: 'missing_occupancy'
      readonly billingPeriod: BillingPeriod
    }
  | { readonly kind: 'mid_year'; readonly billingPeriod: BillingPeriod }
  | { readonly kind: 'locked'; readonly billingPeriod: BillingPeriod }

/**
 * Zielbelegung für die neue Vorauszahlung: das Abrechnungsjahr desselben
 * Objekts, in dem `validFrom` liegt, und dort die Belegung derselben
 * Mietpartei. Die Vorauszahlung ist je Belegung ein Jahreswert; sie wird
 * nur gesetzt, wenn die Anpassung ab Beginn dieser Belegung gilt.
 */
export function adjustmentTarget(
  data: AppDataFile,
  billingPeriodId: string,
  tenancyId: string,
  validFrom: string,
): AdjustmentTarget {
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period)
    throw new PrepaymentAdjustmentError('Abrechnungsjahr wurde nicht gefunden.')
  const targetPeriod = data.billingData.billingPeriods.find(
    (item) =>
      item.propertyId === period.propertyId &&
      item.id !== period.id &&
      item.periodStart <= validFrom &&
      validFrom <= item.periodEnd,
  )
  if (!targetPeriod)
    return { kind: 'missing_year', year: Number(validFrom.slice(0, 4)) }
  if (
    targetPeriod.status === 'READY_FOR_PDF' ||
    targetPeriod.status === 'FINALIZED' ||
    targetPeriod.status === 'SUPERSEDED'
  )
    return { kind: 'locked', billingPeriod: targetPeriod }
  const occupancy = data.billingData.occupancyPeriods
    .filter(
      (item) =>
        item.billingPeriodId === targetPeriod.id &&
        item.kind === 'tenant' &&
        item.tenancyId === tenancyId,
    )
    .sort((left, right) =>
      (left.from ?? targetPeriod.periodStart).localeCompare(
        right.from ?? targetPeriod.periodStart,
      ),
    )[0]
  if (!occupancy)
    return { kind: 'missing_occupancy', billingPeriod: targetPeriod }
  if ((occupancy.from ?? targetPeriod.periodStart) < validFrom)
    return { kind: 'mid_year', billingPeriod: targetPeriod }
  return { kind: 'occupancy', billingPeriod: targetPeriod, occupancy }
}

/** Kurze Meldung zum Ergebnis einer Entscheidung für die Oberfläche. */
export function adjustmentTargetMessage(target: AdjustmentTarget): string {
  switch (target.kind) {
    case 'occupancy':
      return `Die neue Vorauszahlung wurde im Abrechnungsjahr ${target.billingPeriod.year} eingetragen.`
    case 'missing_year':
      return `Das Abrechnungsjahr ${target.year} ist noch nicht angelegt. Die Entscheidung ist gespeichert und das Anpassungsschreiben wird beigefügt; trage die neue Vorauszahlung nach dem Anlegen des Jahres ${target.year} hier unter „Vorauszahlungen“ ein.`
    case 'missing_occupancy':
      return `Im Abrechnungsjahr ${target.billingPeriod.year} gibt es keine Belegung dieses Mietverhältnisses. Die Entscheidung ist gespeichert; trage die neue Vorauszahlung dort nach dem Anlegen der Belegung ein.`
    case 'mid_year':
      return `Die Anpassung gilt erst im Lauf des Abrechnungsjahres ${target.billingPeriod.year}. Die Entscheidung ist gespeichert; die Vorauszahlung dieses Jahres bitte manuell (z. B. über einen Belegungswechsel) anpassen.`
    case 'locked':
      return `Das Abrechnungsjahr ${target.billingPeriod.year} ist gesperrt. Öffne dort zuerst kontrolliert die Prüfung, bevor du die Anpassung übernimmst.`
  }
}

export interface AdjustmentDecision {
  readonly eventId: string
  readonly timestamp: string
  readonly occupancyPeriodId: string
  readonly tenancyId: string
  readonly accepted: boolean
  readonly previousMonthlyCents: number
  readonly newMonthlyCents: number
  readonly proposedMonthlyCents: number
  readonly annualizedCostsCents: number
  readonly validFrom: string
  readonly targetOccupancyPeriodId: string | null
  readonly targetPreviousPrepayment: PrepaymentInput | null
}

type PrepaymentInput =
  | { readonly mode: 'monthly'; readonly monthlyAmountCents: number }
  | { readonly mode: 'annual'; readonly annualAmountCents: number }
  | { readonly mode: 'none_agreed' }

function prepaymentInput(prepayment: Prepayment | undefined) {
  if (!prepayment) return null
  if (prepayment.mode === 'monthly')
    return {
      mode: 'monthly',
      monthlyAmountCents: prepayment.monthlyAmountCents,
    } as const
  if (prepayment.mode === 'annual')
    return {
      mode: 'annual',
      annualAmountCents: prepayment.annualAmountCents,
    } as const
  return { mode: 'none_agreed' } as const
}

function cents(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null
}

function parsePrepaymentInput(value: unknown): PrepaymentInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (record.mode === 'none_agreed') return { mode: 'none_agreed' }
  const monthly = cents(record.monthlyAmountCents)
  if (record.mode === 'monthly' && monthly !== null)
    return { mode: 'monthly', monthlyAmountCents: monthly }
  const annual = cents(record.annualAmountCents)
  if (record.mode === 'annual' && annual !== null)
    return { mode: 'annual', annualAmountCents: annual }
  return null
}

/**
 * Grundlage, um eine aus den Daten übernommene Entscheidung zu ergänzen:
 * aktueller Vorschlag der Belegung, Abrechnungsjahr und Ersatz-Versanddatum
 * (heute), falls kein Versanddatum erfasst ist.
 */
export interface AdjustmentDecisionDefaults {
  readonly period: BillingPeriod
  readonly proposal: AdjustmentProposal
  readonly today: Date
}

/**
 * Aus den Daten übernommene Entscheidung (ohne Werte aus dem Rechenstand),
 * ergänzt um den aktuellen Vorschlag. Ohne passenden Vorschlag `undefined`.
 */
function dataProvidedDecisionValues(
  details: Record<string, unknown>,
  occupancyPeriodId: string,
  defaults: AdjustmentDecisionDefaults | undefined,
) {
  if (!defaults || defaults.proposal.occupancyPeriodId !== occupancyPeriodId)
    return undefined
  const { period, proposal, today } = defaults
  const validFrom =
    details.validFrom == null
      ? defaultValidFrom(period, proposal.dispatchDate ?? localIsoDate(today))
      : details.validFrom
  if (typeof validFrom !== 'string' || validFrom <= period.periodEnd)
    return undefined
  return {
    newMonthlyCents:
      details.newMonthlyCents == null
        ? proposal.proposedMonthlyCents
        : cents(details.newMonthlyCents),
    proposedMonthlyCents: proposal.proposedMonthlyCents,
    annualizedCostsCents: proposal.annualizedCostsCents,
    validFrom,
  }
}

/**
 * Jüngste gespeicherte Entscheidung für eine Belegung des Jahres. Eine aus
 * den Daten übernommene Entscheidung wird nur mit `defaults` ausgewertet.
 */
export function latestAdjustmentDecision(
  data: AppDataFile,
  billingPeriodId: string,
  occupancyPeriodId: string,
  defaults?: AdjustmentDecisionDefaults,
): AdjustmentDecision | undefined {
  const decisions = data.billingData.auditEvents.filter(
    (event) =>
      event.action === PREPAYMENT_ADJUSTMENT_ACTION &&
      event.billingPeriodId === billingPeriodId &&
      event.details?.occupancyPeriodId === occupancyPeriodId,
  )
  const event = decisions.at(-1)
  const details = event?.details
  if (!event || !details) return undefined
  const fromData =
    details.source === PREPAYMENT_ADJUSTMENT_DATA_SOURCE
      ? dataProvidedDecisionValues(details, occupancyPeriodId, defaults)
      : undefined
  if (details.source === PREPAYMENT_ADJUSTMENT_DATA_SOURCE && !fromData)
    return undefined
  const values: Record<string, unknown> = { ...details, ...fromData }
  const previousMonthlyCents = cents(values.previousMonthlyCents)
  const newMonthlyCents = cents(values.newMonthlyCents)
  const proposedMonthlyCents = cents(values.proposedMonthlyCents)
  const annualizedCostsCents = cents(values.annualizedCostsCents)
  if (
    typeof details.tenancyId !== 'string' ||
    typeof details.accepted !== 'boolean' ||
    typeof values.validFrom !== 'string' ||
    !isFirstOfMonth(values.validFrom) ||
    previousMonthlyCents === null ||
    newMonthlyCents === null ||
    proposedMonthlyCents === null ||
    annualizedCostsCents === null
  )
    return undefined
  return {
    eventId: event.id,
    timestamp: event.timestamp,
    occupancyPeriodId,
    tenancyId: details.tenancyId,
    accepted: details.accepted,
    previousMonthlyCents,
    newMonthlyCents,
    proposedMonthlyCents,
    annualizedCostsCents,
    validFrom: values.validFrom,
    targetOccupancyPeriodId:
      typeof details.targetOccupancyPeriodId === 'string'
        ? details.targetOccupancyPeriodId
        : null,
    targetPreviousPrepayment: parsePrepaymentInput(
      details.targetPreviousPrepayment,
    ),
  }
}

/**
 * Entscheidungen, deren Grundlage sich geändert hat (anderer Rechenstand
 * oder andere bisherige Vorauszahlung), gelten als veraltet.
 */
export function decisionMatchesProposal(
  decision: AdjustmentDecision,
  proposal: AdjustmentProposal,
): boolean {
  return (
    decision.annualizedCostsCents === proposal.annualizedCostsCents &&
    decision.previousMonthlyCents === proposal.previousMonthlyCents
  )
}

/**
 * Inhalt des Anpassungsschreibens, wenn für die Belegung eine noch gültige
 * „Ja“-Entscheidung vorliegt; sonst `undefined` (kein Schreiben beifügen).
 */
export function acceptedAdjustmentLetter(
  data: AppDataFile,
  period: BillingPeriod,
  calculation: CalculationOutput,
  occupancyPeriodId: string,
  today: Date = new Date(),
): PrepaymentAdjustmentLetter | undefined {
  const proposal = proposalsFromCalculation(data, period, calculation).find(
    (item) => item.occupancyPeriodId === occupancyPeriodId,
  )
  const decision = latestAdjustmentDecision(
    data,
    period.id,
    occupancyPeriodId,
    proposal && { period, proposal, today },
  )
  if (!decision?.accepted) return undefined
  if (!proposal || !decisionMatchesProposal(decision, proposal))
    return undefined
  return {
    previousMonthlyCents: decision.previousMonthlyCents,
    newMonthlyCents: decision.newMonthlyCents,
    annualizedCostsCents: decision.annualizedCostsCents,
    validFrom: decision.validFrom,
  }
}

export interface AdjustmentDecisionInput {
  readonly billingPeriodId: string
  readonly occupancyPeriodId: string
  readonly accepted: boolean
  readonly newMonthlyCents: number
  readonly validFrom: string
}

const defaultDependencies = (): EditGuardDependencies => ({
  createId: () => crypto.randomUUID(),
  now: () => new Date(),
})

function setTargetPrepayment(
  data: AppDataFile,
  target: { billingPeriod: BillingPeriod; occupancy: OccupancyPeriod },
  prepayment: PrepaymentInput,
  dependencies: EditGuardDependencies,
): AppDataFile {
  return applyEditableBillingPeriodChange(
    data,
    target.billingPeriod.id,
    (current) =>
      setOccupancyPrepayment(current, {
        occupancyPeriodId: target.occupancy.id,
        ...prepayment,
      }),
    dependencies,
  )
}

/**
 * Speichert die Entscheidung Ja/Nein. Bei „Ja“ wird die Vorauszahlung der
 * Zielbelegung gesetzt (sofern vorhanden und bearbeitbar); bei „Nein“ wird
 * eine zuvor durch „Ja“ gesetzte, unveränderte Vorauszahlung zurückgesetzt.
 * Das Audit-Event wird immer im abgerechneten Jahr protokolliert.
 */
export function decidePrepaymentAdjustment(
  data: AppDataFile,
  input: AdjustmentDecisionInput,
  dependencies: EditGuardDependencies = defaultDependencies(),
): AppDataFile {
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === input.billingPeriodId,
  )
  if (!period)
    throw new PrepaymentAdjustmentError('Abrechnungsjahr wurde nicht gefunden.')
  if (
    !Number.isSafeInteger(input.newMonthlyCents) ||
    input.newMonthlyCents <= 0
  )
    throw new PrepaymentAdjustmentError(
      'Bitte eine gültige neue Vorauszahlung eingeben.',
    )
  if (!isFirstOfMonth(input.validFrom) || input.validFrom <= period.periodEnd)
    throw new PrepaymentAdjustmentError(
      'Die neue Vorauszahlung muss ab dem Ersten eines Monats nach dem Abrechnungsjahr gelten.',
    )
  const proposal = proposePrepaymentAdjustments(data, period.id)?.find(
    (item) => item.occupancyPeriodId === input.occupancyPeriodId,
  )
  if (!proposal)
    throw new PrepaymentAdjustmentError(
      'Für diesen Mieter ist nach dem gespeicherten Rechenstand keine Anpassung vorgesehen.',
    )

  const target = adjustmentTarget(
    data,
    period.id,
    proposal.tenancyId,
    input.validFrom,
  )
  const previousDecision = latestAdjustmentDecision(
    data,
    period.id,
    input.occupancyPeriodId,
  )
  let next = data
  let targetOccupancyPeriodId: string | null = null
  let targetPreviousPrepayment: PrepaymentInput | null = null

  if (input.accepted) {
    if (target.kind === 'locked')
      throw new PrepaymentAdjustmentError(adjustmentTargetMessage(target))
    if (target.kind === 'occupancy') {
      const current = data.billingData.prepayments.find(
        ({ occupancyPeriodId }) => occupancyPeriodId === target.occupancy.id,
      )
      if (!current)
        throw new PrepaymentAdjustmentError(
          `Für die Belegung im Abrechnungsjahr ${target.billingPeriod.year} ist keine Vorauszahlung erfasst.`,
        )
      // Ein erneutes „Ja“ behält den ursprünglichen Ausgangswert.
      targetPreviousPrepayment =
        previousDecision?.accepted &&
        previousDecision.targetOccupancyPeriodId === target.occupancy.id
          ? previousDecision.targetPreviousPrepayment
          : prepaymentInput(current)
      next = setTargetPrepayment(
        data,
        target,
        { mode: 'monthly', monthlyAmountCents: input.newMonthlyCents },
        dependencies,
      )
      targetOccupancyPeriodId = target.occupancy.id
    }
  } else if (
    previousDecision?.accepted &&
    previousDecision.targetOccupancyPeriodId !== null &&
    previousDecision.targetPreviousPrepayment !== null &&
    target.kind === 'occupancy' &&
    target.occupancy.id === previousDecision.targetOccupancyPeriodId
  ) {
    const current = data.billingData.prepayments.find(
      ({ occupancyPeriodId }) => occupancyPeriodId === target.occupancy.id,
    )
    if (
      current?.mode === 'monthly' &&
      current.monthlyAmountCents === previousDecision.newMonthlyCents
    ) {
      next = setTargetPrepayment(
        data,
        target,
        previousDecision.targetPreviousPrepayment,
        dependencies,
      )
      targetOccupancyPeriodId = target.occupancy.id
    }
  }

  const eventId = dependencies.createId()
  if (next.billingData.auditEvents.some(({ id }) => id === eventId))
    throw new PrepaymentAdjustmentError(
      'Die Entscheidung konnte nicht eindeutig protokolliert werden.',
    )
  return appDataFileSchema.parse({
    ...next,
    billingData: {
      ...next.billingData,
      auditEvents: [
        ...next.billingData.auditEvents,
        {
          id: eventId,
          billingPeriodId: period.id,
          timestamp: dependencies.now().toISOString(),
          action: PREPAYMENT_ADJUSTMENT_ACTION,
          details: {
            billingYear: period.year,
            occupancyPeriodId: proposal.occupancyPeriodId,
            tenancyId: proposal.tenancyId,
            accepted: input.accepted,
            previousMonthlyCents: proposal.previousMonthlyCents,
            newMonthlyCents: input.newMonthlyCents,
            proposedMonthlyCents: proposal.proposedMonthlyCents,
            annualizedCostsCents: proposal.annualizedCostsCents,
            validFrom: input.validFrom,
            targetBillingPeriodId:
              'billingPeriod' in target ? target.billingPeriod.id : null,
            targetOccupancyPeriodId,
            targetPreviousPrepayment,
          },
        },
      ],
    },
  })
}
