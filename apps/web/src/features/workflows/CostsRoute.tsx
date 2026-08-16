import { useMemo, useState, type FormEvent } from 'react'
import type {
  BankBooking,
  BankBookingCategory,
  CostCategory,
  CostEntry,
} from '@nebenkosten/schema'
import { parseEuroCents, parseOptionalNumber } from '../../app/form-parsers'
import {
  setBankBookingReviewed,
  updateBankBooking,
} from '../costs/bank-booking-commands'
import {
  addCostCategory,
  addCostEntry,
  deleteCostCategory,
  deleteCostEntry,
  updateCostCategory,
  updateCostEntry,
} from '../costs/commands'
import { WorkflowField } from './form-support'
import { formOptionalText, formText } from './form-values'
import type { WorkflowSubRouteProps } from './route-types'

type CostTab = 'categories' | 'entries' | 'bookings'

function correctionParameters(): URLSearchParams {
  const query = globalThis.location?.hash.split('?')[1] ?? ''
  return new URLSearchParams(query)
}

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

const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

function formatCents(value: number): string {
  return euro.format(value / 100)
}

function editAmount(value: number): string {
  return (value / 100).toFixed(2).replace('.', ',')
}

function optionalPercent(form: FormData, name: string): number | undefined {
  return parseOptionalNumber(formText(form, name)) ?? undefined
}

function categoryInput(form: FormData, billingPeriodId?: string) {
  const scopeKind = formText(form, 'scopeKind')
  const buildingId = formOptionalText(form, 'buildingId')
  return {
    ...(billingPeriodId ? { billingPeriodId } : {}),
    kind: formText(form, 'kind') as CostCategory['kind'],
    label: formText(form, 'label'),
    statementText: formOptionalText(form, 'statementText'),
    allocationKey: formText(form, 'allocationKey') as NonNullable<
      CostCategory['allocationKey']
    >,
    scope:
      scopeKind === 'building' && buildingId
        ? ({ kind: 'building', buildingId } as const)
        : ({ kind: 'property' } as const),
    allocablePercent: optionalPercent(form, 'allocablePercent'),
    laborSharePercent: optionalPercent(form, 'laborSharePercent'),
  }
}

function entryInput(form: FormData) {
  const paymentKind = formText(form, 'paymentKind')
  const bankBookingId = formOptionalText(form, 'bankBookingId')
  const externalPaymentReason = formOptionalText(form, 'externalPaymentReason')
  return {
    costCategoryId: formText(form, 'costCategoryId'),
    date: formOptionalText(form, 'date'),
    description: formOptionalText(form, 'description'),
    amountCents: parseEuroCents(formText(form, 'amount')),
    receiptReference: formOptionalText(form, 'receiptReference'),
    allocablePercent: optionalPercent(form, 'allocablePercent'),
    ...(paymentKind === 'booking' && bankBookingId
      ? { bookingLink: { bankBookingId } }
      : {}),
    ...(paymentKind === 'external'
      ? {
          externalPayment: {
            confirmed: true,
            reason: externalPaymentReason,
          },
        }
      : {}),
  }
}

function CategoryFields({
  category,
  buildings,
}: {
  readonly category?: CostCategory
  readonly buildings: ReadonlyArray<{
    readonly id: string
    readonly name: string
  }>
}) {
  const currentBuildingId =
    category?.scope?.kind === 'building' ? category.scope.buildingId : ''
  return (
    <>
      <WorkflowField
        label={category ? 'Kostenart bearbeiten' : 'Neue Kostenart'}
        name="label"
        required
        defaultValue={category?.label ?? ''}
      />
      <label>
        <span>Typ</span>
        <select name="kind" defaultValue={category?.kind ?? 'operating'}>
          <option value="operating">Betriebskosten</option>
          <option value="water">Wasser</option>
          <option value="heating">Heizung</option>
        </select>
      </label>
      <label>
        <span>Umlageschlüssel</span>
        <select
          name="allocationKey"
          defaultValue={category?.allocationKey ?? 'usable_area'}
        >
          <option value="usable_area">Nutzfläche</option>
          <option value="heated_area">Beheizte Fläche</option>
          <option value="consumption_units">Verbrauchseinheiten</option>
          <option value="residential_units">Wohneinheiten</option>
          <option value="direct">Direkte Zuordnung</option>
        </select>
      </label>
      <label>
        <span>Geltungsbereich</span>
        <select
          name="scopeKind"
          defaultValue={
            category?.scope?.kind === 'building' ? 'building' : 'property'
          }
        >
          <option value="property">Gesamtes Objekt</option>
          <option value="building">Ein Gebäude</option>
        </select>
      </label>
      <label>
        <span>Gebäude im Geltungsbereich</span>
        <select name="buildingId" defaultValue={currentBuildingId}>
          <option value="">Kein einzelnes Gebäude</option>
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.name}
            </option>
          ))}
        </select>
      </label>
      <WorkflowField
        label="Text auf der Abrechnung"
        name="statementText"
        defaultValue={category?.statementText ?? ''}
      />
      <WorkflowField
        label="Umlagefähig in Prozent"
        name="allocablePercent"
        defaultValue={category?.allocablePercent ?? ''}
      />
      <WorkflowField
        label="Lohnanteil in Prozent"
        name="laborSharePercent"
        defaultValue={category?.laborSharePercent ?? ''}
      />
    </>
  )
}

function EntryFields({
  entry,
  categories,
  bookings,
}: {
  readonly entry?: CostEntry
  readonly categories: readonly CostCategory[]
  readonly bookings: readonly BankBooking[]
}) {
  const initialPaymentKind = entry?.bookingLink
    ? 'booking'
    : entry?.externalPayment?.confirmed
      ? 'external'
      : 'none'
  const [paymentKind, setPaymentKind] = useState(initialPaymentKind)
  return (
    <>
      <label>
        <span>Kostenart</span>
        <select
          name="costCategoryId"
          required
          defaultValue={entry?.costCategoryId ?? categories[0]?.id}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </label>
      <WorkflowField
        label="Belegdatum"
        name="date"
        type="date"
        defaultValue={entry?.date ?? ''}
      />
      <WorkflowField
        label="Beschreibung"
        name="description"
        defaultValue={entry?.description ?? ''}
      />
      <WorkflowField
        label="Belegnummer oder Referenz"
        name="receiptReference"
        defaultValue={entry?.receiptReference ?? ''}
      />
      <WorkflowField
        label="Betrag in Euro"
        name="amount"
        required
        defaultValue={entry ? editAmount(entry.amountCents) : ''}
      />
      <WorkflowField
        label="Umlagefähig in Prozent"
        name="allocablePercent"
        defaultValue={entry?.allocablePercent ?? ''}
      />
      <label>
        <span>Zahlungsnachweis</span>
        <select
          name="paymentKind"
          value={paymentKind}
          onChange={(event) => setPaymentKind(event.currentTarget.value)}
        >
          <option value="none">Noch nicht zugeordnet</option>
          <option value="booking">Mit Bankbuchung verknüpfen</option>
          <option value="external">Extern bezahlt</option>
        </select>
      </label>
      {paymentKind === 'booking' ? (
        <label>
          <span>Zugehörige Bankbuchung</span>
          <select
            name="bankBookingId"
            required
            defaultValue={entry?.bookingLink?.bankBookingId ?? ''}
          >
            <option value="">Bitte auswählen</option>
            {bookings.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {booking.date ?? 'Ohne Datum'} ·{' '}
                {booking.counterparty ?? booking.purpose ?? 'Ohne Bezeichnung'}{' '}
                · {formatCents(booking.amountCents)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {paymentKind === 'external' ? (
        <WorkflowField
          label="Begründung der externen Zahlung"
          name="externalPaymentReason"
          required
          defaultValue={entry?.externalPayment?.reason ?? ''}
        />
      ) : null}
    </>
  )
}

export function CostsRoute({
  data,
  selection,
  onApply,
}: WorkflowSubRouteProps) {
  const [activeTab, setActiveTab] = useState<CostTab>(() => {
    const tab = correctionParameters().get('tab')
    return tab === 'entries' || tab === 'bookings' ? tab : 'categories'
  })
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(() =>
    correctionParameters().get('edit'),
  )
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [bookingFilter, setBookingFilter] = useState('all')
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === selection.billingPeriodId,
  )!
  const categories = data.billingData.costCategories.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )
  const categoryIds = new Set(categories.map(({ id }) => id))
  const entries = data.billingData.costEntries.filter(({ costCategoryId }) =>
    categoryIds.has(costCategoryId),
  )
  const buildings = data.masterData.buildings.filter(
    ({ propertyId }) => propertyId === period.propertyId,
  )
  const availableBookings = useMemo(
    () =>
      data.billingData.bankBookings.filter(
        (booking) =>
          booking.propertyId === period.propertyId &&
          (booking.billingYear == null || booking.billingYear === period.year),
      ),
    [data.billingData.bankBookings, period.propertyId, period.year],
  )
  const bookings = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de-DE')
    return availableBookings.filter((booking) => {
      if (bookingFilter === 'open' && booking.reviewed === true) return false
      if (bookingFilter === 'reviewed' && booking.reviewed !== true)
        return false
      if (!query) return true
      return [booking.counterparty, booking.purpose, booking.bookingText]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('de-DE').includes(query))
    })
  }, [availableBookings, bookingFilter, search])

  function apply(transform: Parameters<typeof onApply>[0]) {
    setError(null)
    try {
      const accepted = onApply(transform)
      if (!accepted) setError('Die Änderung konnte nicht gespeichert werden.')
      return accepted
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Eingabe konnte nicht verarbeitet werden.',
      )
      return false
    }
  }

  function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        addCostCategory(current, categoryInput(form, period.id)),
      )
    )
      event.currentTarget.reset()
  }

  function saveCategory(event: FormEvent<HTMLFormElement>, categoryId: string) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        updateCostCategory(current, categoryId, categoryInput(form)),
      )
    )
      setEditingId(null)
  }

  function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (apply((current) => addCostEntry(current, entryInput(form))))
      event.currentTarget.reset()
  }

  function saveEntry(event: FormEvent<HTMLFormElement>, entryId: string) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (apply((current) => updateCostEntry(current, entryId, entryInput(form))))
      setEditingId(null)
  }

  function saveBooking(
    event: FormEvent<HTMLFormElement>,
    booking: BankBooking,
  ) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const firstSplitAmount = formOptionalText(form, 'splitOneAmount')
    const secondSplitAmount = formOptionalText(form, 'splitTwoAmount')
    const usesSplits =
      firstSplitAmount !== undefined || secondSplitAmount !== undefined
    const splits = usesSplits
      ? [
          {
            id: crypto.randomUUID(),
            amountCents: parseEuroCents(firstSplitAmount ?? ''),
            costCategoryId: formText(form, 'splitOneCategory'),
            billingYear: period.year,
            category: 'NK_UMLEGBAR' as const,
          },
          {
            id: crypto.randomUUID(),
            amountCents: parseEuroCents(secondSplitAmount ?? ''),
            costCategoryId: formText(form, 'splitTwoCategory'),
            billingYear: period.year,
            category: 'NK_UMLEGBAR' as const,
          },
        ]
      : undefined
    if (
      apply((current) =>
        updateBankBooking(current, booking.id, {
          category: formText(form, 'category'),
          billingYear: period.year,
          costCategoryId: usesSplits
            ? null
            : formOptionalText(form, 'costCategoryId'),
          allocablePercent: optionalPercent(form, 'allocablePercent'),
          note: formOptionalText(form, 'note'),
          splits,
        }),
      )
    )
      setEditingId(null)
  }

  function confirmDelete() {
    if (!deleteId) return
    const isCategory = categories.some(({ id }) => id === deleteId)
    if (
      apply((current) =>
        isCategory
          ? deleteCostCategory(current, deleteId)
          : deleteCostEntry(current, deleteId),
      )
    )
      setDeleteId(null)
  }

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <nav className="workflow-tabs" aria-label="Kostenbereiche">
        <button
          type="button"
          aria-current={activeTab === 'categories' ? 'page' : undefined}
          onClick={() => setActiveTab('categories')}
        >
          Kostenarten
        </button>
        <button
          type="button"
          aria-current={activeTab === 'entries' ? 'page' : undefined}
          onClick={() => setActiveTab('entries')}
        >
          Kostenpositionen
        </button>
        <button
          type="button"
          aria-current={activeTab === 'bookings' ? 'page' : undefined}
          onClick={() => setActiveTab('bookings')}
        >
          Bankbuchungen
        </button>
      </nav>

      {activeTab === 'categories' ? (
        <>
          <form noValidate onSubmit={createCategory}>
            <CategoryFields category={undefined} buildings={buildings} />
            <button type="submit">Kostenart anlegen</button>
          </form>
          <section
            className="editable-records"
            aria-labelledby="categories-title"
          >
            <div className="data-panel__heading">
              <h2 id="categories-title">Kostenarten ({categories.length})</h2>
              <span>Regeln für das aktive Abrechnungsjahr</span>
            </div>
            {categories.length === 0 ? (
              <p>Noch keine Kostenart angelegt.</p>
            ) : (
              <div className="records-grid">
                {categories.map((category) => (
                  <article className="record-editor" key={category.id}>
                    <div className="record-editor__heading">
                      <div>
                        <p className="section-kicker">{category.kind}</p>
                        <h3>{category.label}</h3>
                        <small>
                          {category.allocationKey ?? 'Ohne Umlageschlüssel'} ·{' '}
                          {
                            entries.filter(
                              ({ costCategoryId }) =>
                                costCategoryId === category.id,
                            ).length
                          }{' '}
                          Positionen
                        </small>
                      </div>
                      <button
                        type="button"
                        aria-label={`${category.label} bearbeiten`}
                        onClick={() =>
                          setEditingId(
                            editingId === category.id ? null : category.id,
                          )
                        }
                      >
                        Bearbeiten
                      </button>
                    </div>
                    {editingId === category.id ? (
                      <form
                        className="embedded-form"
                        noValidate
                        onSubmit={(event) => saveCategory(event, category.id)}
                      >
                        <CategoryFields
                          category={category}
                          buildings={buildings}
                        />
                        <button type="submit">Kostenart speichern</button>
                      </form>
                    ) : null}
                    <div className="danger-zone">
                      <button
                        type="button"
                        onClick={() => setDeleteId(category.id)}
                      >
                        Kostenart löschen
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {activeTab === 'entries' ? (
        <>
          {categories.length === 0 ? (
            <p role="alert">Bitte zuerst eine Kostenart anlegen.</p>
          ) : (
            <form noValidate onSubmit={createEntry}>
              <EntryFields
                entry={undefined}
                categories={categories}
                bookings={availableBookings}
              />
              <button type="submit">Kostenposition anlegen</button>
            </form>
          )}
          <section className="editable-records" aria-labelledby="entries-title">
            <div className="data-panel__heading">
              <h2 id="entries-title">Kostenpositionen ({entries.length})</h2>
              <span>
                {formatCents(
                  entries.reduce((sum, entry) => sum + entry.amountCents, 0),
                )}
              </span>
            </div>
            {entries.length === 0 ? (
              <p>Noch keine Kostenposition erfasst.</p>
            ) : (
              <div className="records-grid">
                {entries.map((entry) => {
                  const category = categories.find(
                    ({ id }) => id === entry.costCategoryId,
                  )
                  const title =
                    entry.description ??
                    entry.receiptReference ??
                    'Kostenposition'
                  return (
                    <article className="record-editor" key={entry.id}>
                      <div className="record-editor__heading">
                        <div>
                          <p className="section-kicker">{category?.label}</p>
                          <h3>{title}</h3>
                          <small>
                            {entry.receiptReference ?? 'Ohne Belegreferenz'} ·{' '}
                            {formatCents(entry.amountCents)}
                          </small>
                        </div>
                        <button
                          type="button"
                          aria-label={`${title} bearbeiten`}
                          onClick={() =>
                            setEditingId(
                              editingId === entry.id ? null : entry.id,
                            )
                          }
                        >
                          Bearbeiten
                        </button>
                      </div>
                      {editingId === entry.id ? (
                        <form
                          className="embedded-form"
                          noValidate
                          onSubmit={(event) => saveEntry(event, entry.id)}
                        >
                          <EntryFields
                            entry={entry}
                            categories={categories}
                            bookings={availableBookings}
                          />
                          <button type="submit">
                            Kostenposition speichern
                          </button>
                        </form>
                      ) : null}
                      <div className="danger-zone">
                        <button
                          type="button"
                          onClick={() => setDeleteId(entry.id)}
                        >
                          Kostenposition löschen
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      {activeTab === 'bookings' ? (
        <section className="editable-records" aria-labelledby="bookings-title">
          <div className="data-panel__heading">
            <h2 id="bookings-title">Bankbuchungen ({bookings.length})</h2>
            <span>Offene Buchungen prüfen und zuordnen</span>
          </div>
          <div className="booking-filters">
            <label>
              <span>Bankbuchungen durchsuchen</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              <span>Prüfstatus</span>
              <select
                value={bookingFilter}
                onChange={(event) => setBookingFilter(event.target.value)}
              >
                <option value="all">Alle</option>
                <option value="open">Noch zu prüfen</option>
                <option value="reviewed">Geprüft</option>
              </select>
            </label>
          </div>
          {bookings.length === 0 ? (
            <p>Keine passenden Bankbuchungen vorhanden.</p>
          ) : (
            <div className="records-grid">
              {bookings.map((booking) => {
                const title =
                  booking.purpose ?? booking.counterparty ?? 'Bankbuchung'
                const category = categories.find(
                  ({ id }) => id === booking.costCategoryId,
                )
                return (
                  <article className="record-editor" key={booking.id}>
                    <div className="record-editor__heading">
                      <div>
                        <p className="section-kicker">
                          {booking.reviewed ? 'Geprüft' : 'Noch zu prüfen'}
                        </p>
                        <h3>{title}</h3>
                        <small>
                          {booking.counterparty ?? 'Ohne Gegenpartei'} ·{' '}
                          {formatCents(booking.amountCents)}
                        </small>
                        <small>
                          {category?.label ?? booking.category ?? 'Offen'}
                        </small>
                      </div>
                      {!booking.reviewed ? (
                        <button
                          type="button"
                          aria-label={`${title} bearbeiten`}
                          onClick={() =>
                            setEditingId(
                              editingId === booking.id ? null : booking.id,
                            )
                          }
                        >
                          Bearbeiten
                        </button>
                      ) : null}
                    </div>
                    {editingId === booking.id && !booking.reviewed ? (
                      <form
                        className="embedded-form"
                        noValidate
                        onSubmit={(event) => saveBooking(event, booking)}
                      >
                        <label>
                          <span>Buchungskategorie bearbeiten</span>
                          <select
                            name="category"
                            defaultValue={booking.category ?? 'OFFEN'}
                          >
                            {BOOKING_CATEGORIES.map((option) => (
                              <option key={option.value} value={option.value}>
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
                            <option value="">Keine direkte Zuordnung</option>
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
                            Optional centgenau auf zwei Kostenarten aufteilen
                          </legend>
                          <WorkflowField
                            label="Split 1 Betrag in Euro"
                            name="splitOneAmount"
                          />
                          <label>
                            <span>Split 1 Kostenart</span>
                            <select name="splitOneCategory">
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
                          />
                          <label>
                            <span>Split 2 Kostenart</span>
                            <select name="splitTwoCategory">
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
                    ) : null}
                    <div className="record-actions">
                      <button
                        type="button"
                        onClick={() =>
                          apply((current) =>
                            setBankBookingReviewed(
                              current,
                              booking.id,
                              !booking.reviewed,
                            ),
                          )
                        }
                      >
                        {booking.reviewed
                          ? 'Buchung wieder öffnen'
                          : 'Als geprüft markieren'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      {deleteId ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-cost-title"
          >
            <h2 id="delete-cost-title">Eintrag wirklich löschen?</h2>
            <p>
              Verknüpfte Daten verhindern das Löschen und bleiben geschützt.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setDeleteId(null)}>
                Abbrechen
              </button>
              <button type="button" onClick={confirmDelete}>
                Löschen bestätigen
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
