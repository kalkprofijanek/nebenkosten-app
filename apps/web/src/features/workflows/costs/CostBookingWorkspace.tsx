import {
  Fragment,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import type {
  BankBooking,
  BankBookingCategory,
  CostCategory,
} from '@nebenkosten/schema'
import { TableToolbar } from '../../../components/TableToolbar'
import { WorkflowField } from '../form-support'
import { editCostAmount, formatCostCents } from './cost-format'

const BOOKING_CATEGORIES: ReadonlyArray<{
  readonly value: BankBookingCategory
  readonly label: string
}> = [
  { value: 'OFFEN', label: 'Offen' },
  { value: 'NK_UMLEGBAR', label: 'Umlagefähig' },
  { value: 'NK_NICHT_UMLEGBAR', label: 'Nicht umlagefähig' },
  { value: 'MIETEINGANG', label: 'Mieteingang' },
  { value: 'KAUTION', label: 'Kaution' },
  { value: 'INSTANDHALTUNG', label: 'Instandhaltung' },
  { value: 'VERWALTUNG', label: 'Verwaltung' },
  { value: 'SONSTIGE', label: 'Sonstige' },
]

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Ohne Datum'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

export interface CostBookingWorkspaceProps {
  readonly bookings: readonly BankBooking[]
  readonly categories: readonly CostCategory[]
  readonly editingId: string | null
  readonly search: string
  readonly filter: string
  readonly notice: string | null
  readonly additionalImportTools?: ReactNode
  readonly onSearchChange: (value: string) => void
  readonly onFilterChange: (value: string) => void
  readonly onImportFile: (event: ChangeEvent<HTMLInputElement>) => void
  readonly onCreate: (event: FormEvent<HTMLFormElement>) => void
  readonly onSave: (
    event: FormEvent<HTMLFormElement>,
    booking: BankBooking,
  ) => void
  readonly onToggleEdit: (id: string | null) => void
  readonly onToggleReviewed: (booking: BankBooking) => void
}

export function CostBookingWorkspace({
  bookings,
  categories,
  editingId,
  search,
  filter,
  notice,
  additionalImportTools,
  onSearchChange,
  onFilterChange,
  onImportFile,
  onCreate,
  onSave,
  onToggleEdit,
  onToggleReviewed,
}: CostBookingWorkspaceProps) {
  const bookingTotalCents = bookings.reduce(
    (total, booking) => total + booking.amountCents,
    0,
  )
  return (
    <section className="editable-records" aria-labelledby="bookings-title">
      <div className="data-panel__heading">
        <h2 id="bookings-title">Bankbuchungen ({bookings.length})</h2>
        <span>Offene Buchungen prüfen und zuordnen</span>
      </div>
      <div className="records-grid">
        <article className="record-editor">
          <div className="record-editor__heading">
            <div>
              <p className="section-kicker">Kontoauszug</p>
              <h3>Bankbuchungen aus CSV übernehmen</h3>
              <small>
                Die Datei bleibt auf diesem Gerät. Unterstützt werden
                Datum/Buchungstag, Betrag sowie optional Auftraggeber,
                Verwendungszweck und Buchungstext.
              </small>
            </div>
          </div>
          <label>
            <span>CSV-Datei mit Bankbuchungen</span>
            <input type="file" accept=".csv,text/csv" onChange={onImportFile} />
          </label>
          {additionalImportTools}
        </article>
        <article className="record-editor">
          <div className="record-editor__heading">
            <div>
              <p className="section-kicker">Einzelbuchung</p>
              <h3>Bankbuchung manuell erfassen</h3>
            </div>
          </div>
          <form className="embedded-form" noValidate onSubmit={onCreate}>
            <WorkflowField
              label="Datum der Buchung"
              name="bookingDate"
              type="date"
              required
            />
            <WorkflowField
              label="Betrag in Euro (Ausgabe negativ)"
              name="bookingAmount"
              required
            />
            <WorkflowField
              label="Auftraggeber oder Empfänger"
              name="bookingCounterparty"
            />
            <WorkflowField
              label="Verwendungszweck der Buchung"
              name="bookingPurpose"
            />
            <WorkflowField label="Buchungstext" name="bookingText" />
            <button type="submit">Manuelle Buchung anlegen</button>
          </form>
        </article>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      <TableToolbar
        searchLabel="Bankbuchungen durchsuchen"
        searchValue={search}
        onSearchChange={onSearchChange}
        filterLabel="Prüfstatus"
        filterValue={filter}
        onFilterChange={onFilterChange}
        filterOptions={[
          { value: 'all', label: 'Alle Buchungen' },
          { value: 'open', label: 'Noch zu prüfen' },
          { value: 'unassigned', label: 'Nicht zugeordnet' },
          { value: 'reviewed', label: 'Geprüft' },
        ]}
        resultCount={bookings.length}
        resultLabel="Buchungen"
        resultSingularLabel="Buchung"
        totalCents={bookingTotalCents}
      />
      {bookings.length === 0 ? (
        <p>Keine passenden Bankbuchungen vorhanden.</p>
      ) : (
        <div className="data-table-wrap data-table-wrap--workspace">
          <table
            className="data-table data-table--workspace"
            aria-label="Bankbuchungen bearbeiten"
          >
            <thead>
              <tr>
                <th scope="col">Datum</th>
                <th scope="col">Buchung</th>
                <th scope="col">Zuordnung</th>
                <th scope="col">Status</th>
                <th scope="col">Betrag</th>
                <th scope="col">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => {
                const title =
                  booking.purpose ?? booking.counterparty ?? 'Bankbuchung'
                const category = categories.find(
                  ({ id }) => id === booking.costCategoryId,
                )
                const [firstSplit, secondSplit] = booking.splits ?? []
                const assignment =
                  category?.label ??
                  (booking.splits?.length
                    ? `${booking.splits.length} Aufteilungen`
                    : 'Nicht zugeordnet')
                const categoryLabel =
                  BOOKING_CATEGORIES.find(
                    ({ value }) => value === booking.category,
                  )?.label ?? 'Offen'
                return (
                  <Fragment key={booking.id}>
                    <tr
                      className="data-table__interactive-row"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return
                        if (event.key === 'Escape') {
                          onToggleEdit(null)
                          return
                        }
                        if (event.key === 'Enter' && !booking.reviewed) {
                          event.preventDefault()
                          onToggleEdit(booking.id)
                        }
                      }}
                    >
                      <td>{formatDate(booking.date)}</td>
                      <td>
                        <strong>{title}</strong>
                        <small>
                          {booking.counterparty ??
                            booking.bookingText ??
                            'Ohne Gegenpartei'}
                        </small>
                      </td>
                      <td>{assignment}</td>
                      <td>
                        <span
                          className={`table-status table-status--${
                            booking.reviewed ? 'ready' : 'open'
                          }`}
                        >
                          {booking.reviewed
                            ? `Geprüft · ${categoryLabel}`
                            : categoryLabel}
                        </span>
                      </td>
                      <td className="data-table__amount">
                        {formatCostCents(booking.amountCents)}
                      </td>
                      <td className="data-table__actions">
                        {!booking.reviewed ? (
                          <button
                            type="button"
                            aria-label={`${title} bearbeiten`}
                            aria-expanded={editingId === booking.id}
                            onClick={() =>
                              onToggleEdit(
                                editingId === booking.id ? null : booking.id,
                              )
                            }
                          >
                            Bearbeiten
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onToggleReviewed(booking)}
                        >
                          {booking.reviewed
                            ? 'Buchung wieder öffnen'
                            : 'Als geprüft markieren'}
                        </button>
                      </td>
                    </tr>
                    {editingId === booking.id && !booking.reviewed ? (
                      <tr className="data-table__detail-row">
                        <td colSpan={6}>
                          <form
                            className="embedded-form table-detail-form"
                            noValidate
                            onSubmit={(event) => onSave(event, booking)}
                          >
                            <label>
                              <span>Buchungskategorie bearbeiten</span>
                              <select
                                name="category"
                                defaultValue={booking.category ?? 'OFFEN'}
                              >
                                {BOOKING_CATEGORIES.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Kostenart zuordnen</span>
                              <select
                                name="costCategoryId"
                                defaultValue={booking.costCategoryId ?? ''}
                              >
                                <option value="">
                                  Keine direkte Zuordnung
                                </option>
                                {categories.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <WorkflowField
                              label="Umlagefähig in Prozent"
                              name="allocablePercent"
                              defaultValue={booking.allocablePercent ?? ''}
                            />
                            <WorkflowField
                              label="Prüfnotiz"
                              name="note"
                              defaultValue={booking.note ?? ''}
                            />
                            <fieldset className="split-fields">
                              <legend>
                                Optional centgenau auf zwei Kostenarten
                                aufteilen
                              </legend>
                              <WorkflowField
                                label="Split 1 Betrag in Euro"
                                name="splitOneAmount"
                                defaultValue={
                                  firstSplit
                                    ? editCostAmount(firstSplit.amountCents)
                                    : ''
                                }
                              />
                              <label>
                                <span>Split 1 Kostenart</span>
                                <select
                                  name="splitOneCategory"
                                  defaultValue={
                                    firstSplit?.costCategoryId ?? ''
                                  }
                                >
                                  {categories.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <WorkflowField
                                label="Split 2 Betrag in Euro"
                                name="splitTwoAmount"
                                defaultValue={
                                  secondSplit
                                    ? editCostAmount(secondSplit.amountCents)
                                    : ''
                                }
                              />
                              <label>
                                <span>Split 2 Kostenart</span>
                                <select
                                  name="splitTwoCategory"
                                  defaultValue={
                                    secondSplit?.costCategoryId ?? ''
                                  }
                                >
                                  {categories.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </fieldset>
                            <button type="submit">Buchung speichern</button>
                          </form>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4}>
                  Summe der angezeigten Buchungen
                </th>
                <td className="data-table__amount">
                  {formatCostCents(bookingTotalCents)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
