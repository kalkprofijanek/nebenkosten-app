import type { BankBooking, CostCategory, CostEntry } from '@nebenkosten/schema'
import { useState } from 'react'

const PAGE_SIZE = 50

const bookingCategoryLabels: Readonly<Record<string, string>> = {
  OFFEN: 'Offen',
  NK_UMLEGBAR: 'Umlagefähig',
  NK_NICHT_UMLEGBAR: 'Nicht umlagefähig',
  MIETEINGANG: 'Mieteingang',
  KAUTION: 'Kaution',
  INSTANDHALTUNG: 'Instandhaltung',
  VERWALTUNG: 'Verwaltung',
  SONSTIGE: 'Sonstige',
}

const allocationLabels: Readonly<Record<string, string>> = {
  usable_area: 'Nutzfläche',
  heated_area: 'Beheizte Fläche',
  consumption_units: 'Verbrauchseinheiten',
  residential_units: 'Wohneinheiten',
  direct: 'Direkte Zuordnung',
}

const euroFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

function formatCents(value: number): string {
  return euroFormatter.format(value / 100)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Ohne Datum'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

function hasCurrentAssignment(
  booking: BankBooking,
  billingYear: number,
  categoryIds: ReadonlySet<string>,
): boolean {
  if (booking.billingYear === billingYear) return true
  if (booking.costCategoryId && categoryIds.has(booking.costCategoryId)) {
    return true
  }
  return Boolean(
    booking.splits?.some(
      (split) =>
        split.billingYear === billingYear ||
        (split.costCategoryId !== null &&
          split.costCategoryId !== undefined &&
          categoryIds.has(split.costCategoryId)),
    ),
  )
}

function hasAnyAssignment(booking: BankBooking): boolean {
  return Boolean(
    (booking.billingYear !== null && booking.billingYear !== undefined) ||
    booking.costCategoryId ||
    booking.splits?.some(
      (split) =>
        (split.billingYear !== null && split.billingYear !== undefined) ||
        split.costCategoryId,
    ),
  )
}

function Pager({
  label,
  page,
  total,
  onPageChange,
}: {
  readonly label: string
  readonly page: number
  readonly total: number
  readonly onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (pageCount === 1) return null

  return (
    <nav className="data-pager" aria-label={`${label} Seiten`}>
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        Zurück
      </button>
      <span>
        Seite {page + 1} von {pageCount}
      </span>
      <button
        type="button"
        disabled={page + 1 >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        Weiter
      </button>
    </nav>
  )
}

export function CostDataOverview({
  categories,
  entries,
  bankBookings,
  propertyId,
  billingYear,
}: {
  readonly categories: readonly CostCategory[]
  readonly entries: readonly CostEntry[]
  readonly bankBookings: readonly BankBooking[]
  readonly propertyId: string
  readonly billingYear: number
}) {
  const [costPage, setCostPage] = useState(0)
  const [bookingPage, setBookingPage] = useState(0)
  const categoryIds = new Set(categories.map(({ id }) => id))
  const categoryLabels = new Map(
    categories.map(({ id, label }) => [id, label] as const),
  )
  const periodEntries = entries.filter(({ costCategoryId }) =>
    categoryIds.has(costCategoryId),
  )
  const periodBookings = bankBookings.filter(
    (booking) =>
      booking.propertyId === propertyId &&
      (hasCurrentAssignment(booking, billingYear, categoryIds) ||
        !hasAnyAssignment(booking)),
  )
  const maximumCostPage = Math.max(
    0,
    Math.ceil(periodEntries.length / PAGE_SIZE) - 1,
  )
  const maximumBookingPage = Math.max(
    0,
    Math.ceil(periodBookings.length / PAGE_SIZE) - 1,
  )
  const visibleCostPage = Math.min(costPage, maximumCostPage)
  const visibleBookingPage = Math.min(bookingPage, maximumBookingPage)
  const visibleEntries = periodEntries.slice(
    visibleCostPage * PAGE_SIZE,
    (visibleCostPage + 1) * PAGE_SIZE,
  )
  const visibleBookings = periodBookings.slice(
    visibleBookingPage * PAGE_SIZE,
    (visibleBookingPage + 1) * PAGE_SIZE,
  )

  return (
    <div className="data-overview">
      <section className="data-panel" aria-labelledby="cost-categories-title">
        <div className="data-panel__heading">
          <div>
            <p className="section-kicker">Umlage und Summen</p>
            <h2 id="cost-categories-title">
              Kostenarten ({categories.length})
            </h2>
          </div>
          <span>Aktives Abrechnungsjahr</span>
        </div>
        {categories.length === 0 ? (
          <p>Noch keine Kostenarten für dieses Abrechnungsjahr.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <caption>Kostenarten und ihre erfassten Summen</caption>
              <thead>
                <tr>
                  <th scope="col">Kostenart</th>
                  <th scope="col">Typ</th>
                  <th scope="col">Umlage</th>
                  <th scope="col">Positionen</th>
                  <th scope="col">Gesamtbetrag</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => {
                  const categoryEntries = periodEntries.filter(
                    ({ costCategoryId }) => costCategoryId === category.id,
                  )
                  const entryTotal = categoryEntries.reduce(
                    (total, { amountCents }) => total + amountCents,
                    0,
                  )
                  return (
                    <tr key={category.id}>
                      <td>
                        <strong>{category.label}</strong>
                        {category.statementText ? (
                          <small>{category.statementText}</small>
                        ) : null}
                      </td>
                      <td>
                        {category.kind === 'operating'
                          ? 'Betriebskosten'
                          : category.kind === 'water'
                            ? 'Wasser'
                            : 'Heizung'}
                      </td>
                      <td>
                        {allocationLabels[category.allocationKey ?? ''] ??
                          'Nicht festgelegt'}
                      </td>
                      <td>{categoryEntries.length}</td>
                      <td className="data-table__amount">
                        {formatCents(category.totalAmountCents ?? entryTotal)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="data-panel" aria-labelledby="cost-entries-title">
        <div className="data-panel__heading">
          <div>
            <p className="section-kicker">Belege und Rechnungen</p>
            <h2 id="cost-entries-title">
              Kostenpositionen ({periodEntries.length})
            </h2>
          </div>
          <span>{categories.length} Kostenarten</span>
        </div>
        {visibleEntries.length === 0 ? (
          <p>Noch keine Kostenpositionen für dieses Abrechnungsjahr.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <caption>Kostenpositionen des aktiven Abrechnungsjahres</caption>
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Kostenart</th>
                  <th scope="col">Beschreibung / Beleg</th>
                  <th scope="col">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.date)}</td>
                    <td>
                      {categoryLabels.get(entry.costCategoryId) ??
                        'Unbekannte Kostenart'}
                    </td>
                    <td>
                      <strong>
                        {entry.description ?? 'Ohne Beschreibung'}
                      </strong>
                      {entry.receiptReference ? (
                        <small>{entry.receiptReference}</small>
                      ) : null}
                    </td>
                    <td className="data-table__amount">
                      {formatCents(entry.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          label="Kostenpositionen"
          page={visibleCostPage}
          total={periodEntries.length}
          onPageChange={setCostPage}
        />
      </section>

      <section className="data-panel" aria-labelledby="bank-bookings-title">
        <div className="data-panel__heading">
          <div>
            <p className="section-kicker">Kontobewegungen</p>
            <h2 id="bank-bookings-title">
              Bankbuchungen ({periodBookings.length})
            </h2>
          </div>
          <span>Aktives Jahr und offene Zuordnungen</span>
        </div>
        {visibleBookings.length === 0 ? (
          <p>Keine Bankbuchungen für dieses Objekt und Abrechnungsjahr.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <caption>
                Bankbuchungen des aktiven Jahres und noch offene Buchungen
              </caption>
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Gegenpartei / Zweck</th>
                  <th scope="col">Zuordnung</th>
                  <th scope="col">Status</th>
                  <th scope="col">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {visibleBookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>{formatDate(booking.date)}</td>
                    <td>
                      <strong>
                        {booking.counterparty ?? 'Ohne Gegenpartei'}
                      </strong>
                      {booking.purpose ? (
                        <small>{booking.purpose}</small>
                      ) : null}
                    </td>
                    <td>
                      {booking.costCategoryId
                        ? (categoryLabels.get(booking.costCategoryId) ??
                          `Jahr ${booking.billingYear ?? 'offen'}`)
                        : booking.billingYear
                          ? `Jahr ${booking.billingYear}`
                          : 'Noch offen'}
                    </td>
                    <td>
                      {booking.reviewed ? 'Geprüft · ' : ''}
                      {bookingCategoryLabels[booking.category ?? 'OFFEN'] ??
                        booking.category ??
                        'Offen'}
                    </td>
                    <td className="data-table__amount">
                      {formatCents(booking.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          label="Bankbuchungen"
          page={visibleBookingPage}
          total={periodBookings.length}
          onPageChange={setBookingPage}
        />
      </section>
    </div>
  )
}
