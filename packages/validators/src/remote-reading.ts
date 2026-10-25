import type {
  AppDataFile,
  BillingPeriod,
  ValidationIssue,
} from '@nebenkosten/schema'
import { issue } from './issues'
import { legalRule } from './legal-rules'

type Add = (value: ValidationIssue) => void

/** Ende der Nachrüstfrist nach § 5 Abs. 3 HeizKV. */
const REMOTE_READING_DEADLINE = '2027-01-01'
/** Beginn der monatlichen Informationspflicht nach § 6a Abs. 1 Nr. 2. */
const MONTHLY_INFORMATION_START = '2022-01-01'

function germanDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

const later = (a: string, b: string) => (a > b ? a : b)

/** Kalendermonate (JJJJ-MM) von `from` bis `to` einschließlich. */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  let year = Number(from.slice(0, 4))
  let month = Number(from.slice(5, 7))
  const end = to.slice(0, 7)
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (key > end) return months
    months.push(key)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
}

/**
 * Fernablesbarkeit und monatliche Verbrauchsinformation (ADR-0014). Nur für
 * Abrechnungszeiträume mit Heizkreisen; `codes` sind die Regeln aus dem
 * Regelverzeichnis, die den Zeitraum berühren.
 */
export function remoteReadingIssues(
  data: AppDataFile,
  period: BillingPeriod,
  codes: ReadonlySet<string>,
  add: Add,
): void {
  const circuits = data.billingData.heatingCircuits.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )
  if (circuits.length === 0) return
  const property = data.masterData.properties.find(
    ({ id }) => id === period.propertyId,
  )
  const remoteReading = property?.remoteReading
  const since = remoteReading?.since ?? null
  const entity = { type: 'Property', id: period.propertyId }

  if (codes.has('remote-reading')) {
    const rule = legalRule('remote-reading')
    const required = later(period.periodStart, REMOTE_READING_DEADLINE)
    if (remoteReading?.exemptionReason) {
      add(
        issue(
          'info',
          'rules.remote_reading_exemption',
          'heating',
          'Ausnahme von der Fernablesbarkeit',
          {
            entity,
            detail: `Begründung: ${remoteReading.exemptionReason}. Die Ausnahme (technisch unmöglich oder unbillige Härte, § 5 Abs. 3 Satz 2 HeizkostenV) muss im Streitfall belegt werden.`,
          },
        ),
      )
    } else if (since === null || since > required) {
      add(
        issue(
          'warning',
          'rules.remote_reading_missing',
          'heating',
          rule.title,
          {
            entity,
            detail: `${
              since === null
                ? 'Für dieses Objekt ist nicht erfasst, dass die Erfassungsgeräte fernablesbar sind.'
                : `Die Erfassungsgeräte sind erst ab ${germanDate(since)} fernablesbar.`
            } ${rule.summary} (${rule.norm})`,
          },
        ),
      )
    }
  }

  if (
    codes.has('monthly-consumption-information') &&
    since !== null &&
    since <= period.periodEnd
  ) {
    const rule = legalRule('monthly-consumption-information')
    const from = later(
      later(since, period.periodStart),
      MONTHLY_INFORMATION_START,
    )
    const media = circuits.some(({ hasCentralHotWater }) => hasCentralHotWater)
      ? 'Heizung und Warmwasser'
      : 'Heizung'
    const covered = new Set(
      (data.billingData.monthlyInformationDispatches ?? [])
        .filter(({ propertyId }) => propertyId === period.propertyId)
        .map(({ month }) => month),
    )
    const missing = monthsBetween(from, period.periodEnd).filter(
      (month) => !covered.has(month),
    )
    if (missing.length > 0)
      add(
        issue(
          'warning',
          'rules.monthly_information_missing',
          'heating',
          'Monatsinformation ohne Versandnachweis',
          {
            entity,
            detail: `Für ${missing.length === 1 ? 'den Monat' : 'die Monate'} ${missing
              .map((month) => `${month.slice(5)}/${month.slice(0, 4)}`)
              .join(
                ', ',
              )} ist kein Versand der Monatsinformation protokolliert (Seite „Monatsinformation“). Fehlt die Information, darf der Mieter seinen Anteil an den Heizkosten um 3 % kürzen (§ 12 Abs. 1 Satz 3 HeizkostenV).`,
          },
        ),
      )
    add(
      issue('info', 'rules.monthly_information', 'heating', rule.title, {
        entity,
        detail: `Fernablesbar ab ${germanDate(from)}: Monatliche Verbrauchsinformation für ${media} erforderlich. ${rule.summary} (${rule.norm})`,
      }),
    )
  }
}
