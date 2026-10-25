/**
 * Versandweg der Monatsinformation je Mietverhältnis (ADR-0014, Schritt 3).
 * E-Mail nur mit hinterlegter Zustimmung und E-Mail-Adresse einer Person des
 * Mietverhältnisses, sonst Brief (Standard).
 */
import type {
  AppDataFile,
  MonthlyInformationChannel,
  MonthlyInformationDelivery,
} from '@nebenkosten/schema'

/** E-Mail-Adressen der Personen eines Mietverhältnisses (ohne Dubletten). */
export function tenancyEmailAddresses(
  data: AppDataFile,
  tenancyId: string | null | undefined,
): string[] {
  const tenancy = data.masterData.tenancies.find(({ id }) => id === tenancyId)
  if (!tenancy) return []
  const addresses = tenancy.personIds
    .map(
      (personId) =>
        data.masterData.persons.find(({ id }) => id === personId)?.email ?? '',
    )
    .map((email) => email.trim())
    .filter((email) => email.length > 0)
  return [...new Set(addresses)]
}

/**
 * Tatsächlicher Versandweg: E-Mail nur mit Zustimmungsdatum und mindestens
 * einer E-Mail-Adresse, sonst Brief.
 */
export function effectiveMonthlyInformationChannel(
  data: AppDataFile,
  tenancyId: string | null | undefined,
): MonthlyInformationChannel {
  const tenancy = data.masterData.tenancies.find(({ id }) => id === tenancyId)
  const delivery = tenancy?.monthlyInformationDelivery
  return delivery?.channel === 'email' &&
    delivery.emailConsentDate &&
    tenancyEmailAddresses(data, tenancyId).length > 0
    ? 'email'
    : 'letter'
}

export const DELIVERY_FIELD_NAMES = {
  channel: 'monthlyInformationChannel',
  emailConsentDate: 'monthlyInformationEmailConsentDate',
} as const

/**
 * Liest den Versandweg aus dem Mietverhältnis-Formular. Brief ohne Datum
 * entspricht dem Standard und wird nicht gespeichert.
 */
export function deliveryFromForm(
  form: FormData,
): MonthlyInformationDelivery | undefined {
  const channel =
    String(form.get(DELIVERY_FIELD_NAMES.channel) ?? '') === 'email'
      ? 'email'
      : 'letter'
  const emailConsentDate =
    String(form.get(DELIVERY_FIELD_NAMES.emailConsentDate) ?? '').trim() ||
    undefined
  if (channel === 'letter' && emailConsentDate === undefined) return undefined
  return emailConsentDate === undefined
    ? { channel }
    : { channel, emailConsentDate }
}

export interface DeliveryDraft {
  readonly channel: MonthlyInformationChannel
  readonly emailConsentDate: string
}

export const EMAIL_CONSENT_REQUIRED =
  'Für den E-Mail-Versand ist das Datum der Zustimmung anzugeben.'

/** E-Mail gewählt, aber kein Zustimmungsdatum. */
export function deliveryDraftInvalid(draft: DeliveryDraft): boolean {
  return draft.channel === 'email' && draft.emailConsentDate.trim() === ''
}
