/**
 * Versandprotokoll der monatlichen Verbrauchsinformation (ADR-0014,
 * Schritt 3, Variante A): „Monat versendet am …“ protokolliert alle Mieter
 * des Monats mit ihrem hinterlegten Versandweg; Ausnahmen werden einzeln
 * mit Begründung als „nicht versendet“ vermerkt.
 */
import { calculateMonthlyConsumptionInformation } from '@nebenkosten/core'
import {
  appDataFileSchema,
  entityIdSchema,
  type AppDataFile,
  type MonthlyInformationChannel,
  type MonthlyInformationDispatch,
} from '@nebenkosten/schema'
import { lockedStatus } from '../release/edit-guard'
import { MonthlyInformationCommandError } from './commands'
import { effectiveMonthlyInformationChannel } from './delivery'
import { MONTH_PATTERN, monthBounds } from './format'

export interface MonthlyDispatchException {
  readonly tenancyId: string
  readonly note: string
}

export interface RecordMonthlyDispatchInput {
  readonly propertyId: string
  readonly month: string
  readonly dispatchedOn: string
  readonly exceptions: readonly MonthlyDispatchException[]
  readonly createId: () => string
}

export interface MonthlyDispatchRecipient {
  readonly tenancyId: string
  readonly unitId: string
  readonly channel: MonthlyInformationChannel
}

export interface MonthlyDispatchSummary {
  readonly email: number
  readonly letter: number
  readonly notSent: number
}

const fail = (message: string): never => {
  throw new MonthlyInformationCommandError(message)
}

/**
 * Mietverhältnisse, die im Monat Mieter einer Einheit des Objekts sind
 * (je Mietverhältnis einmal), mit ihrem tatsächlichen Versandweg.
 */
export function monthlyDispatchRecipients(
  data: AppDataFile,
  propertyId: string,
  month: string,
): MonthlyDispatchRecipient[] {
  const info = calculateMonthlyConsumptionInformation(data, {
    propertyId,
    month,
  })
  const seen = new Set<string>()
  const recipients: MonthlyDispatchRecipient[] = []
  for (const { tenancyId, unitId } of info.tenants) {
    if (tenancyId == null || seen.has(tenancyId)) continue
    seen.add(tenancyId)
    recipients.push({
      tenancyId,
      unitId,
      channel: effectiveMonthlyInformationChannel(data, tenancyId),
    })
  }
  return recipients
}

export function findMonthlyDispatch(
  data: AppDataFile,
  propertyId: string,
  month: string,
): MonthlyInformationDispatch | undefined {
  return (data.billingData.monthlyInformationDispatches ?? []).find(
    (dispatch) =>
      dispatch.propertyId === propertyId && dispatch.month === month,
  )
}

export function summarizeMonthlyDispatch(
  dispatch: MonthlyInformationDispatch,
): MonthlyDispatchSummary {
  const sent = dispatch.entries.filter(({ status }) => status === 'sent')
  return {
    email: sent.filter(({ channel }) => channel === 'email').length,
    letter: sent.filter(({ channel }) => channel === 'letter').length,
    notSent: dispatch.entries.length - sent.length,
  }
}

/**
 * Das Protokoll fließt in die Prüfung des Abrechnungsjahres ein
 * (`rules.monthly_information_missing`); gesperrte Jahre bleiben unverändert.
 */
function assertMonthUnlocked(
  data: AppDataFile,
  propertyId: string,
  month: string,
): void {
  const { from, to } = monthBounds(month)
  const locked = data.billingData.billingPeriods.filter(
    (period) =>
      period.propertyId === propertyId &&
      lockedStatus(period.status) &&
      period.periodStart <= to &&
      period.periodEnd >= from,
  )
  if (locked.length > 0)
    fail(
      `Der Monat fällt in ein gesperrtes Abrechnungsjahr (${locked
        .map(({ year }) => year)
        .join(', ')}). Das Jahr zuerst wieder öffnen.`,
    )
}

function validated(data: AppDataFile): AppDataFile {
  const result = appDataFileSchema.safeParse(data)
  if (!result.success) fail('Der neue Datenstand verletzt das Dateischema.')
  return result.data as AppDataFile
}

function usedIds(data: AppDataFile): Set<string> {
  const ids = new Set<string>()
  for (const container of [data.masterData, data.billingData])
    for (const collection of Object.values(container))
      for (const entity of (collection ?? []) as readonly unknown[])
        if (
          typeof entity === 'object' &&
          entity !== null &&
          'id' in entity &&
          typeof entity.id === 'string'
        )
          ids.add(entity.id)
  return ids
}

/** Protokolliert den Versand eines Monats für ein Objekt. */
export function recordMonthlyDispatch(
  data: AppDataFile,
  input: RecordMonthlyDispatchInput,
): AppDataFile {
  const { propertyId, month } = input
  if (!data.masterData.properties.some(({ id }) => id === propertyId))
    fail('Objekt wurde nicht gefunden.')
  if (!MONTH_PATTERN.test(month)) fail('Monat im Format JJJJ-MM erwartet.')
  if (findMonthlyDispatch(data, propertyId, month))
    fail(
      'Der Versand dieses Monats ist bereits protokolliert. Das vorhandene Protokoll zuerst entfernen.',
    )
  // Die Information über einen Monat kann frühestens am Monatsletzten
  // (Ablesung zum Monatsende) versendet werden.
  const [year, monthIndex] = month.split('-').map(Number) as [number, number]
  const lastDay = new Date(Date.UTC(year, monthIndex, 0))
    .toISOString()
    .slice(0, 10)
  if (
    /^\d{4}-\d{2}-\d{2}$/u.test(input.dispatchedOn) &&
    input.dispatchedOn < lastDay
  )
    fail('Das Versanddatum liegt vor dem Ende des Monats.')
  assertMonthUnlocked(data, propertyId, month)
  const recipients = monthlyDispatchRecipients(data, propertyId, month)
  if (recipients.length === 0)
    fail('Für diesen Monat sind keine Mieter-Nutzungen erfasst.')

  const notes = new Map<string, string>()
  for (const exception of input.exceptions) {
    if (!recipients.some(({ tenancyId }) => tenancyId === exception.tenancyId))
      fail(
        'Ausnahme betrifft ein Mietverhältnis, das nicht unter den Mietern des Monats ist.',
      )
    if (notes.has(exception.tenancyId))
      fail('Ein Mietverhältnis ist mehrfach als Ausnahme angegeben.')
    const note = String(exception.note ?? '').trim()
    if (note.length === 0)
      fail('Für „nicht versendet“ ist eine Begründung anzugeben.')
    notes.set(exception.tenancyId, note)
  }

  const id = input.createId()
  if (!entityIdSchema.safeParse(id).success || usedIds(data).has(id))
    fail('Erzeugte ID ist ungültig oder belegt.')

  const dispatch: MonthlyInformationDispatch = {
    id,
    propertyId,
    month,
    dispatchedOn: input.dispatchedOn,
    entries: recipients.map(({ tenancyId, channel }) => {
      const note = notes.get(tenancyId)
      return note === undefined
        ? { tenancyId, channel, status: 'sent' as const }
        : { tenancyId, channel, status: 'not_sent' as const, note }
    }),
  }
  return validated({
    ...data,
    billingData: {
      ...data.billingData,
      monthlyInformationDispatches: [
        ...(data.billingData.monthlyInformationDispatches ?? []),
        dispatch,
      ],
    },
  })
}

/** Entfernt ein Versandprotokoll (z. B. nach falscher Erfassung). */
export function removeMonthlyDispatch(
  data: AppDataFile,
  dispatchId: string,
): AppDataFile {
  const dispatches = data.billingData.monthlyInformationDispatches ?? []
  const dispatch = dispatches.find(({ id }) => id === dispatchId)
  if (!dispatch) return fail('Versandprotokoll wurde nicht gefunden.')
  assertMonthUnlocked(data, dispatch.propertyId, dispatch.month)
  return validated({
    ...data,
    billingData: {
      ...data.billingData,
      monthlyInformationDispatches: dispatches.filter(
        ({ id }) => id !== dispatchId,
      ),
    },
  })
}
