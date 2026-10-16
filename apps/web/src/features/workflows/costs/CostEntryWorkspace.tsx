import { Fragment, type FormEvent, type ReactNode } from 'react'
import type { BankBooking, CostCategory, CostEntry } from '@nebenkosten/schema'
import { TableToolbar } from '../../../components/TableToolbar'
import { CostEntryFields } from './CostFields'
import { formatCostCents } from './cost-format'

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Ohne Datum'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

export interface CostEntryWorkspaceProps {
  readonly categories: readonly CostCategory[]
  readonly entries: readonly CostEntry[]
  readonly visibleEntries: readonly CostEntry[]
  readonly bookings: readonly BankBooking[]
  readonly editingId: string | null
  readonly search: string
  readonly filter: string
  readonly formVersion: number
  readonly visibleTotalCents: number
  readonly additionalTools?: ReactNode
  readonly onSearchChange: (value: string) => void
  readonly onFilterChange: (value: string) => void
  readonly onCreate: (event: FormEvent<HTMLFormElement>) => void
  readonly onSave: (event: FormEvent<HTMLFormElement>, id: string) => void
  readonly onToggleEdit: (id: string | null) => void
  readonly onDelete: (id: string) => void
}

export function CostEntryWorkspace({
  categories,
  entries,
  visibleEntries,
  bookings,
  editingId,
  search,
  filter,
  formVersion,
  visibleTotalCents,
  additionalTools,
  onSearchChange,
  onFilterChange,
  onCreate,
  onSave,
  onToggleEdit,
  onDelete,
}: CostEntryWorkspaceProps) {
  return (
    <>
      {additionalTools}
      {categories.length === 0 ? (
        <p role="alert">Bitte zuerst eine Kostenart anlegen.</p>
      ) : (
        <form noValidate onSubmit={onCreate}>
          <CostEntryFields
            key={formVersion}
            entry={undefined}
            categories={categories}
            bookings={bookings}
          />
          <button type="submit">Kostenposition anlegen</button>
        </form>
      )}
      <section className="editable-records" aria-labelledby="entries-title">
        <div className="data-panel__heading">
          <h2 id="entries-title">Kostenpositionen ({entries.length})</h2>
          <span>
            {formatCostCents(
              entries.reduce((sum, entry) => sum + entry.amountCents, 0),
            )}
          </span>
        </div>
        {entries.length === 0 ? (
          <p>Noch keine Kostenposition erfasst.</p>
        ) : (
          <>
            <TableToolbar
              searchLabel="Kostenpositionen durchsuchen"
              searchValue={search}
              onSearchChange={onSearchChange}
              filterLabel="Kostenart auswählen"
              filterValue={filter}
              onFilterChange={onFilterChange}
              filterOptions={[
                { value: 'all', label: 'Alle Kostenarten' },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.label,
                })),
              ]}
              resultCount={visibleEntries.length}
              resultLabel="Kostenpositionen"
              resultSingularLabel="Kostenposition"
              totalCents={visibleTotalCents}
            />
            <div className="data-table-wrap data-table-wrap--workspace">
              <table
                className="data-table data-table--workspace"
                aria-label="Kostenpositionen bearbeiten"
              >
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    <th scope="col">Position</th>
                    <th scope="col">Kostenart</th>
                    <th scope="col">Beleg</th>
                    <th scope="col">Zahlungsnachweis</th>
                    <th scope="col">Betrag</th>
                    <th scope="col">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry) => {
                    const category = categories.find(
                      ({ id }) => id === entry.costCategoryId,
                    )
                    const title =
                      entry.description ??
                      entry.receiptReference ??
                      'Kostenposition'
                    return (
                      <Fragment key={entry.id}>
                        <tr
                          className="data-table__interactive-row"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              onToggleEdit(entry.id)
                            }
                            if (event.key === 'Escape') onToggleEdit(null)
                          }}
                        >
                          <td>{formatDate(entry.date)}</td>
                          <td>
                            <strong>{title}</strong>
                          </td>
                          <td>{category?.label ?? 'Unbekannte Kostenart'}</td>
                          <td>{entry.receiptReference ?? '–'}</td>
                          <td>
                            {entry.bookingLink
                              ? 'Bankbuchung'
                              : entry.externalPayment?.confirmed
                                ? 'Extern bestätigt'
                                : 'Noch offen'}
                          </td>
                          <td className="data-table__amount">
                            {formatCostCents(entry.amountCents)}
                          </td>
                          <td className="data-table__actions">
                            <button
                              type="button"
                              aria-label={`${title} bearbeiten`}
                              onClick={() =>
                                onToggleEdit(
                                  editingId === entry.id ? null : entry.id,
                                )
                              }
                            >
                              Bearbeiten
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(entry.id)}
                            >
                              Kostenposition löschen
                            </button>
                          </td>
                        </tr>
                        {editingId === entry.id ? (
                          <tr className="data-table__detail-row">
                            <td colSpan={7}>
                              <article className="record-editor record-editor--embedded">
                                <h3>{title}</h3>
                                <form
                                  className="embedded-form"
                                  noValidate
                                  onSubmit={(event) => onSave(event, entry.id)}
                                >
                                  <CostEntryFields
                                    entry={entry}
                                    categories={categories}
                                    bookings={bookings}
                                  />
                                  <button type="submit">
                                    Kostenposition speichern
                                  </button>
                                </form>
                              </article>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={5}>
                      Summe der angezeigten Kostenpositionen
                    </th>
                    <td className="data-table__amount">
                      {formatCostCents(visibleTotalCents)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  )
}
