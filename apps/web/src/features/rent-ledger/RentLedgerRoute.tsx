import {
  calculateRentLedger,
  type RentLedger,
  type RentMonthStatus,
} from '@nebenkosten/core'
import type { AppDataFile, BankBooking, Tenancy } from '@nebenkosten/schema'
import { useState } from 'react'
import { tenantDisplayName } from '../prepayments/overview'
import { assignRentPayment, autoAssignRentPayments } from './commands'

type Apply = (transform: (data: AppDataFile) => AppDataFile) => boolean

interface RentLedgerRouteProps {
  readonly data: AppDataFile
  readonly propertyId: string | null
  readonly billingPeriodId: string | null
  readonly onApply: Apply
  readonly today?: () => Date
}

interface Feedback {
  readonly kind: 'status' | 'alert'
  readonly text: string
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
]

const STATUS_LABELS: Record<RentMonthStatus, string> = {
  paid: 'bezahlt',
  partial: 'teilweise',
  open: 'offen',
  not_due: 'noch nicht fällig',
  not_occupied: '—',
}

const euro = (cents: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  )

function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function displayDate(value: string | null | undefined): string {
  return value ? value.split('-').reverse().join('.') : 'ohne Datum'
}

function unitLabel(data: AppDataFile, tenancy: Tenancy): string {
  return (
    data.masterData.units.find(({ id }) => id === tenancy.unitId)?.label ??
    'Wohnung'
  )
}

function isOpenRentCandidate(booking: BankBooking): boolean {
  return (
    booking.amountCents > 0 &&
    booking.tenancyId == null &&
    (booking.category === 'MIETEINGANG' ||
      ((booking.category == null || booking.category === 'OFFEN') &&
        booking.reviewed !== true))
  )
}

export function RentLedgerRoute({
  data,
  propertyId,
  billingPeriodId,
  onApply,
  today = () => new Date(),
}: RentLedgerRouteProps) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!propertyId || !period)
    return <p>Bitte zuerst ein Objekt und ein Abrechnungsjahr auswählen.</p>
  const year = period.year
  const todayIso = localIsoDate(today())
  const unitIds = new Set(
    data.masterData.units
      .filter((unit) => unit.propertyId === propertyId)
      .map(({ id }) => id),
  )
  const ledgers = data.masterData.tenancies
    .filter((tenancy) => unitIds.has(tenancy.unitId))
    .map((tenancy) => ({
      tenancy,
      ledger: calculateRentLedger(data, tenancy.id, year, todayIso),
    }))
    .filter(({ ledger }) => ledger.dueTotalCents > 0 || ledger.paidCents > 0)
  const tenancyOptions = ledgers.map(({ tenancy }) => ({
    id: tenancy.id,
    label: `${unitLabel(data, tenancy)} – ${tenantDisplayName(data, tenancy.id)}`,
  }))
  const yearBookings = data.billingData.bankBookings.filter(
    (booking) =>
      booking.propertyId === propertyId &&
      booking.date?.startsWith(`${year}-`) === true,
  )
  const openPayments = yearBookings.filter(isOpenRentCandidate)
  const assignedPayments = yearBookings.filter(
    (booking) => booking.tenancyId != null && booking.amountCents > 0,
  )

  function run(
    transform: Parameters<Apply>[0],
    success: string | (() => string),
  ) {
    setFeedback(null)
    try {
      if (!onApply(transform))
        setFeedback({
          kind: 'alert',
          text: 'Die Änderung konnte nicht gespeichert werden.',
        })
      else
        setFeedback({
          kind: 'status',
          text: typeof success === 'string' ? success : success(),
        })
    } catch (caught) {
      setFeedback({
        kind: 'alert',
        text:
          caught instanceof Error
            ? caught.message
            : 'Die Eingabe konnte nicht verarbeitet werden.',
      })
    }
  }

  function autoAssign() {
    let assigned = 0
    let ambiguous = 0
    run(
      (current) => {
        const result = autoAssignRentPayments(current, propertyId!)
        assigned = result.assignedCount
        ambiguous = result.ambiguousCount
        return result.data
      },
      () =>
        `${assigned} ${assigned === 1 ? 'Zahlung' : 'Zahlungen'} eindeutig zugeordnet${ambiguous > 0 ? `, ${ambiguous} mehrdeutig – bitte von Hand zuordnen` : ''}.`,
    )
  }

  return (
    <section aria-labelledby="rent-ledger-title">
      <div className="data-panel__heading">
        <h2 id="rent-ledger-title">Mietkonto {year}</h2>
        <span>
          Soll = Kaltmiete + Vorauszahlung; Ist = zugeordnete Mieteingänge
        </span>
      </div>
      <p>
        Das Mietkonto ist eine Übersicht. Die Nebenkostenabrechnung rechnet
        weiter mit den vereinbarten Vorauszahlungen; einen Rückstand meldet die
        Prüfung als Hinweis.
      </p>
      <p>
        <button type="button" onClick={autoAssign}>
          Mieteingänge automatisch zuordnen
        </button>
      </p>
      {feedback ? <p role={feedback.kind}>{feedback.text}</p> : null}

      {ledgers.length === 0 ? (
        <p>Für {year} sind keine Mietverhältnisse mit Soll erfasst.</p>
      ) : (
        <>
          <table aria-label="Mietkonto je Mietverhältnis">
            <thead>
              <tr>
                <th scope="col">Wohnung / Mieter</th>
                <th scope="col">Soll {year}</th>
                <th scope="col">fällig bis heute</th>
                <th scope="col">gezahlt</th>
                <th scope="col">Rückstand</th>
                <th scope="col">Guthaben</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.map(({ tenancy, ledger }) => (
                <tr key={tenancy.id}>
                  <th scope="row">
                    {unitLabel(data, tenancy)} –{' '}
                    {tenantDisplayName(data, tenancy.id)}
                  </th>
                  <td>{euro(ledger.dueTotalCents)}</td>
                  <td>{euro(ledger.dueToDateCents)}</td>
                  <td>{euro(ledger.paidCents)}</td>
                  <td>
                    {ledger.arrearsCents > 0 ? (
                      <strong>{euro(ledger.arrearsCents)}</strong>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {ledger.creditCents > 0 ? euro(ledger.creditCents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <MonthGrid
            rows={ledgers.map(({ tenancy, ledger }) => ({
              label: `${unitLabel(data, tenancy)} – ${tenantDisplayName(data, tenancy.id)}`,
              ledger,
            }))}
          />
        </>
      )}

      <h3>Nicht zugeordnete Zahlungseingänge ({openPayments.length})</h3>
      {openPayments.length === 0 ? (
        <p>Alle Mieteingänge des Jahres sind zugeordnet.</p>
      ) : (
        <table aria-label="Nicht zugeordnete Zahlungseingänge">
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col">Auftraggeber / Zweck</th>
              <th scope="col">Betrag</th>
              <th scope="col">Mietverhältnis</th>
            </tr>
          </thead>
          <tbody>
            {openPayments.map((booking) => (
              <tr key={booking.id}>
                <td>{displayDate(booking.date)}</td>
                <td>
                  {[booking.counterparty, booking.purpose]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </td>
                <td>{euro(booking.amountCents)}</td>
                <td>
                  <select
                    aria-label={`Mietverhältnis für Zahlung vom ${displayDate(booking.date)}`}
                    value={choices[booking.id] ?? ''}
                    onChange={(event) =>
                      setChoices((current) => ({
                        ...current,
                        [booking.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">bitte wählen</option>
                    {tenancyOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>{' '}
                  <button
                    type="button"
                    disabled={!choices[booking.id]}
                    onClick={() =>
                      run(
                        (current) =>
                          assignRentPayment(
                            current,
                            booking.id,
                            choices[booking.id]!,
                          ),
                        'Zahlung zugeordnet.',
                      )
                    }
                  >
                    Zuordnen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Zugeordnete Zahlungseingänge ({assignedPayments.length})</h3>
      {assignedPayments.length === 0 ? null : (
        <table aria-label="Zugeordnete Zahlungseingänge">
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col">Betrag</th>
              <th scope="col">Mietverhältnis</th>
              <th scope="col">Zuordnung</th>
              <th scope="col">
                <span className="visually-hidden">Aktion</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {assignedPayments.map((booking) => (
              <tr key={booking.id}>
                <td>{displayDate(booking.date)}</td>
                <td>{euro(booking.amountCents)}</td>
                <td>{tenantDisplayName(data, booking.tenancyId)}</td>
                <td>
                  {booking.tenancyAssignment === 'auto'
                    ? 'automatisch'
                    : 'von Hand'}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        (current) =>
                          assignRentPayment(current, booking.id, null),
                        'Zuordnung aufgehoben.',
                      )
                    }
                  >
                    Zuordnung aufheben
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function MonthGrid({
  rows,
}: {
  readonly rows: readonly { label: string; ledger: RentLedger }[]
}) {
  return (
    <table aria-label="Monatsübersicht">
      <thead>
        <tr>
          <th scope="col">Mietverhältnis</th>
          {MONTHS.map((month) => (
            <th key={month} scope="col">
              {month}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, ledger }) => (
          <tr key={ledger.tenancyId}>
            <th scope="row">{label}</th>
            {ledger.months.map((month) => (
              <td
                key={month.month}
                title={`Soll ${euro(month.dueCents)}, gezahlt ${euro(month.paidCents)}`}
              >
                {STATUS_LABELS[month.status]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
