import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type { BankBooking, CostCategory } from '@nebenkosten/schema'
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
import { autoAssignRentPayments } from '../rent-ledger/commands'
import { CostDataOverview } from '../costs/CostDataOverview'
import {
  addCostCategory,
  copyCostCategoriesFromPreviousYear,
  previousYearCostCategories,
  addCostEntry,
  deleteCostCategory,
  deleteCostEntry,
  updateCostCategory,
  updateCostEntry,
} from '../costs/commands'
import { CostCategoryWorkspace } from './costs/CostCategoryWorkspace'
import { CostEntryWorkspace } from './costs/CostEntryWorkspace'
import { CostBookingWorkspace } from './costs/CostBookingWorkspace'
import { formOptionalText, formText } from './form-values'
import type { WorkflowSubRouteProps } from './route-types'

type CostTab = 'overview' | 'categories' | 'entries' | 'bookings'

function correctionParameters(): URLSearchParams {
  const query = globalThis.location?.hash.split('?')[1] ?? ''
  return new URLSearchParams(query)
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
  const [categoryNotice, setCategoryNotice] = useState<string | null>(null)
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

  const carryOver = previousYearCostCategories(data, period.id)

  function copyFromPreviousYear() {
    setCategoryNotice(null)
    let copiedCount = 0
    let sourceYear = 0
    if (
      apply((current) => {
        const result = copyCostCategoriesFromPreviousYear(current, period.id)
        copiedCount = result.copiedCount
        sourceYear = result.sourceYear
        return result.data
      })
    )
      setCategoryNotice(
        `${copiedCount} ${copiedCount === 1 ? 'Kostenart' : 'Kostenarten'} aus ${sourceYear} übernommen. Beträge bitte als Kostenpositionen erfassen.`,
      )
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
      let rentCount = 0
      const accepted = apply((current) => {
        const result = importBankBookings(current, period.propertyId, rows)
        addedCount = result.addedCount
        duplicateCount = result.duplicateCount
        const rent = autoAssignRentPayments(result.data, period.propertyId)
        rentCount = rent.assignedCount
        return rent.data
      })
      if (accepted) {
        setImportNotice(
          `${addedCount} Buchungen importiert, ${duplicateCount} Duplikate übersprungen. ${
            rentCount > 0
              ? `${rentCount} Mieteingänge wurden eindeutig einem Mietverhältnis zugeordnet (Mietkonto), alle übrigen neuen Buchungen stehen auf „Offen“.`
              : 'Alle neuen Buchungen stehen auf „Offen“.'
          }`,
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
        <CostCategoryWorkspace
          categories={categories}
          entries={entries}
          visibleCategories={visibleCategories}
          buildings={buildings}
          carryOver={carryOver}
          editingId={editingId}
          search={categorySearch}
          filter={categoryFilter}
          notice={categoryNotice}
          onSearchChange={setCategorySearch}
          onFilterChange={setCategoryFilter}
          onCopyPrevious={copyFromPreviousYear}
          onCreate={createCategory}
          onSave={saveCategory}
          onToggleEdit={setEditingId}
          onDelete={setDeleteId}
        />
      ) : null}

      {activeTab === 'entries' ? (
        <CostEntryWorkspace
          categories={categories}
          entries={entries}
          visibleEntries={visibleEntries}
          bookings={availableBookings}
          editingId={editingId}
          search={entrySearch}
          filter={entryFilter}
          formVersion={entryFormVersion}
          visibleTotalCents={visibleEntryTotalCents}
          onSearchChange={setEntrySearch}
          onFilterChange={setEntryFilter}
          onCreate={createEntry}
          onSave={saveEntry}
          onToggleEdit={setEditingId}
          onDelete={setDeleteId}
        />
      ) : null}

      {activeTab === 'bookings' ? (
        <CostBookingWorkspace
          bookings={bookings}
          categories={categories}
          editingId={editingId}
          search={search}
          filter={bookingFilter}
          notice={importNotice}
          onSearchChange={setSearch}
          onFilterChange={setBookingFilter}
          onImportFile={(event) => void importBookingFile(event)}
          onCreate={createManualBooking}
          onSave={saveBooking}
          onToggleEdit={setEditingId}
          onToggleReviewed={(booking) =>
            apply((current) =>
              setBankBookingReviewed(current, booking.id, !booking.reviewed),
            )
          }
        />
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
