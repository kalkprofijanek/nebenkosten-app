import {
  Fragment,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import type {
  BankBooking,
  BankBookingCategory,
  CostCategory,
  CostEntry,
} from '@nebenkosten/schema'
import { parseEuroCents, parseOptionalNumber } from '../../app/form-parsers'
import {
  addBankBooking,
  importBankBookings,
  setBankBookingReviewed,
  updateBankBooking,
} from '../costs/bank-booking-commands'
import {
  decodeBankBookingCsv,
  parseBankBookingCsv,
} from '../costs/bank-booking-csv'
import { TableToolbar } from '../../components/TableToolbar'
import { CostDataOverview } from '../costs/CostDataOverview'
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

type CostTab = 'overview' | 'categories' | 'entries' | 'bookings'

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

const costKindLabels: Readonly<Record<CostCategory['kind'], string>> = {
  operating: 'Betriebskosten',
  water: 'Wasser',
  heating: 'Heizung',
}

const allocationKeyLabels: Readonly<Record<string, string>> = {
  usable_area: 'Nutzfläche',
  heated_area: 'Beheizte Fläche',
  consumption_units: 'Verbrauchseinheiten',
  residential_units: 'Wohneinheiten',
  direct: 'Direkte Zuordnung',
}

function formatCents(value: number): string {
  return euro.format(value / 100)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Ohne Datum'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
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
  const [categorySearch, setCategorySearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [entrySearch, setEntrySearch] = useState('')
  const [entryFilter, setEntryFilter] = useState('all')
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [entryFormVersion, setEntryFormVersion] = useState(0)
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
      if (
        bookingFilter === 'unassigned' &&
        (booking.costCategoryId ||
          booking.splits?.some((split) => split.costCategoryId))
      )
        return false
      if (!query) return true
      return [booking.counterparty, booking.purpose, booking.bookingText]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('de-DE').includes(query))
    })
  }, [availableBookings, bookingFilter, search])
  const bookingTotalCents = bookings.reduce(
    (total, booking) => total + booking.amountCents,
    0,
  )
  const visibleCategories = categories.filter((category) => {
    if (categoryFilter !== 'all' && category.kind !== categoryFilter)
      return false
    const query = categorySearch.trim().toLocaleLowerCase('de-DE')
    return (
      !query ||
      [category.label, category.statementText]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('de-DE').includes(query))
    )
  })
  const visibleEntries = entries.filter((entry) => {
    if (entryFilter !== 'all' && entry.costCategoryId !== entryFilter)
      return false
    const query = entrySearch.trim().toLocaleLowerCase('de-DE')
    const category = categories.find(({ id }) => id === entry.costCategoryId)
    return (
      !query ||
      [entry.description, entry.receiptReference, category?.label]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('de-DE').includes(query))
    )
  })
  const visibleEntryTotalCents = visibleEntries.reduce(
    (total, entry) => total + entry.amountCents,
    0,
  )

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
    if (apply((current) => addCostEntry(current, entryInput(form)))) {
      event.currentTarget.reset()
      setEntryFormVersion((current) => current + 1)
    }
  }

  function createManualBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        addBankBooking(current, {
          propertyId: period.propertyId,
          date: formText(form, 'bookingDate'),
          amountCents: parseEuroCents(formText(form, 'bookingAmount')),
          counterparty: formOptionalText(form, 'bookingCounterparty'),
          purpose: formOptionalText(form, 'bookingPurpose'),
          bookingText: formOptionalText(form, 'bookingText'),
        }),
      )
    ) {
      event.currentTarget.reset()
      setImportNotice('Die manuelle Bankbuchung wurde als „Offen“ angelegt.')
    }
  }

  async function importBookingFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setError(null)
    setImportNotice(null)
    try {
      const rows = parseBankBookingCsv(
        decodeBankBookingCsv(new Uint8Array(await file.arrayBuffer())),
      )
      let addedCount = 0
      let duplicateCount = 0
      const accepted = apply((current) => {
        const result = importBankBookings(current, period.propertyId, rows)
        addedCount = result.addedCount
        duplicateCount = result.duplicateCount
        return result.data
      })
      if (accepted) {
        setImportNotice(
          `${addedCount} Buchungen importiert, ${duplicateCount} Duplikate übersprungen. Alle neuen Buchungen stehen auf „Offen“.`,
        )
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die CSV-Datei konnte nicht verarbeitet werden.',
      )
    } finally {
      input.value = ''
    }
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
          aria-current={activeTab === 'overview' ? 'page' : undefined}
          onClick={() => setActiveTab('overview')}
        >
          Datenübersicht
        </button>
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

      {activeTab === 'overview' ? (
        <CostDataOverview
          categories={categories}
          entries={entries}
          bankBookings={data.billingData.bankBookings}
          propertyId={period.propertyId}
          billingYear={period.year}
        />
      ) : null}

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
              <>
                <TableToolbar
                  searchLabel="Kostenarten durchsuchen"
                  searchValue={categorySearch}
                  onSearchChange={setCategorySearch}
                  filterLabel="Kostenart-Typ"
                  filterValue={categoryFilter}
                  onFilterChange={setCategoryFilter}
                  filterOptions={[
                    { value: 'all', label: 'Alle Kostenarten' },
                    { value: 'operating', label: 'Betriebskosten' },
                    { value: 'water', label: 'Wasser' },
                    { value: 'heating', label: 'Heizung' },
                  ]}
                  resultCount={visibleCategories.length}
                  resultLabel="Kostenarten"
                  resultSingularLabel="Kostenart"
                />
                <div className="data-table-wrap data-table-wrap--workspace">
                  <table
                    className="data-table data-table--workspace"
                    aria-label="Kostenarten bearbeiten"
                  >
                    <thead>
                      <tr>
                        <th scope="col">Kostenart</th>
                        <th scope="col">Typ</th>
                        <th scope="col">Umlageschlüssel</th>
                        <th scope="col">Bereich</th>
                        <th scope="col">Positionen</th>
                        <th scope="col">Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCategories.map((category) => {
                        const positionCount = entries.filter(
                          ({ costCategoryId }) =>
                            costCategoryId === category.id,
                        ).length
                        const scopeBuildingId =
                          category.scope?.kind === 'building'
                            ? category.scope.buildingId
                            : undefined
                        const scope = scopeBuildingId
                          ? (buildings.find(({ id }) => id === scopeBuildingId)
                              ?.name ?? 'Gebäude')
                          : 'Gesamtes Objekt'
                        return (
                          <Fragment key={category.id}>
                            <tr
                              className="data-table__interactive-row"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.target !== event.currentTarget) return
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  setEditingId(category.id)
                                }
                                if (event.key === 'Escape') setEditingId(null)
                              }}
                            >
                              <td>
                                <strong>{category.label}</strong>
                                <small>
                                  {category.statementText ??
                                    'Kein abweichender Abrechnungstext'}
                                </small>
                              </td>
                              <td>{costKindLabels[category.kind]}</td>
                              <td>
                                {category.allocationKey
                                  ? (allocationKeyLabels[
                                      category.allocationKey
                                    ] ?? category.allocationKey)
                                  : 'Nicht festgelegt'}
                              </td>
                              <td>{scope}</td>
                              <td>{positionCount}</td>
                              <td className="data-table__actions">
                                <button
                                  type="button"
                                  aria-label={`${category.label} bearbeiten`}
                                  onClick={() =>
                                    setEditingId(
                                      editingId === category.id
                                        ? null
                                        : category.id,
                                    )
                                  }
                                >
                                  Bearbeiten
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteId(category.id)}
                                >
                                  Kostenart löschen
                                </button>
                              </td>
                            </tr>
                            {editingId === category.id ? (
                              <tr className="data-table__detail-row">
                                <td colSpan={6}>
                                  <article className="record-editor record-editor--embedded">
                                    <h3>{category.label}</h3>
                                    <form
                                      className="embedded-form"
                                      noValidate
                                      onSubmit={(event) =>
                                        saveCategory(event, category.id)
                                      }
                                    >
                                      <CategoryFields
                                        category={category}
                                        buildings={buildings}
                                      />
                                      <button type="submit">
                                        Kostenart speichern
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
                  </table>
                </div>
              </>
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
                key={entryFormVersion}
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
              <>
                <TableToolbar
                  searchLabel="Kostenpositionen durchsuchen"
                  searchValue={entrySearch}
                  onSearchChange={setEntrySearch}
                  filterLabel="Kostenart auswählen"
                  filterValue={entryFilter}
                  onFilterChange={setEntryFilter}
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
                  totalCents={visibleEntryTotalCents}
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
                                  setEditingId(entry.id)
                                }
                                if (event.key === 'Escape') setEditingId(null)
                              }}
                            >
                              <td>{formatDate(entry.date)}</td>
                              <td>
                                <strong>{title}</strong>
                              </td>
                              <td>
                                {category?.label ?? 'Unbekannte Kostenart'}
                              </td>
                              <td>{entry.receiptReference ?? '–'}</td>
                              <td>
                                {entry.bookingLink
                                  ? 'Bankbuchung'
                                  : entry.externalPayment?.confirmed
                                    ? 'Extern bestätigt'
                                    : 'Noch offen'}
                              </td>
                              <td className="data-table__amount">
                                {formatCents(entry.amountCents)}
                              </td>
                              <td className="data-table__actions">
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
                                <button
                                  type="button"
                                  onClick={() => setDeleteId(entry.id)}
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
                                      onSubmit={(event) =>
                                        saveEntry(event, entry.id)
                                      }
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
                          {formatCents(visibleEntryTotalCents)}
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
      ) : null}

      {activeTab === 'bookings' ? (
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
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void importBookingFile(event)}
                />
              </label>
            </article>
            <article className="record-editor">
              <div className="record-editor__heading">
                <div>
                  <p className="section-kicker">Einzelbuchung</p>
                  <h3>Bankbuchung manuell erfassen</h3>
                </div>
              </div>
              <form
                className="embedded-form"
                noValidate
                onSubmit={createManualBooking}
              >
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
          {importNotice ? <p role="status">{importNotice}</p> : null}
          <TableToolbar
            searchLabel="Bankbuchungen durchsuchen"
            searchValue={search}
            onSearchChange={setSearch}
            filterLabel="Prüfstatus"
            filterValue={bookingFilter}
            onFilterChange={setBookingFilter}
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
                              setEditingId(null)
                              return
                            }
                            if (event.key === 'Enter' && !booking.reviewed) {
                              event.preventDefault()
                              setEditingId(booking.id)
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
                            {formatCents(booking.amountCents)}
                          </td>
                          <td className="data-table__actions">
                            {!booking.reviewed ? (
                              <button
                                type="button"
                                aria-label={`${title} bearbeiten`}
                                aria-expanded={editingId === booking.id}
                                onClick={() =>
                                  setEditingId(
                                    editingId === booking.id
                                      ? null
                                      : booking.id,
                                  )
                                }
                              >
                                Bearbeiten
                              </button>
                            ) : null}
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
                          </td>
                        </tr>
                        {editingId === booking.id && !booking.reviewed ? (
                          <tr className="data-table__detail-row">
                            <td colSpan={6}>
                              <form
                                className="embedded-form table-detail-form"
                                noValidate
                                onSubmit={(event) =>
                                  saveBooking(event, booking)
                                }
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
                                        ? editAmount(firstSplit.amountCents)
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
                                        <option
                                          key={option.id}
                                          value={option.id}
                                        >
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
                                        ? editAmount(secondSplit.amountCents)
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
                                        <option
                                          key={option.id}
                                          value={option.id}
                                        >
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
                      {formatCents(bookingTotalCents)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
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
