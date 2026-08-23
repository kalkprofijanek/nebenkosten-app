import { Fragment, useMemo, useState, type FormEvent } from 'react'
import { validateBillingPeriod } from '@nebenkosten/validators'
import { TableToolbar } from '../../components/TableToolbar'
import {
  formatEuroInput,
  parseEuroCents,
  parseOptionalNumber,
} from '../../app/form-parsers'
import {
  addTenantOccupancy,
  addVacancyOccupancy,
  deleteOccupancy,
  updateTenantOccupancy,
  updateVacancyOccupancy,
} from '../occupancies/commands'
import { WorkflowField } from './form-support'
import { formOptionalText, formText } from './form-values'
import type { WorkflowSubRouteProps } from './route-types'

function optionalNumber(form: FormData, name: string) {
  return parseOptionalNumber(formText(form, name)) ?? undefined
}

function prepayment(form: FormData) {
  const mode = formText(form, 'prepaymentMode')
  if (mode === 'none_agreed') return { mode } as const
  if (mode === 'annual')
    return {
      mode,
      annualAmountCents: parseEuroCents(formText(form, 'prepaymentAmount')),
    } as const
  return {
    mode: 'monthly',
    monthlyAmountCents: parseEuroCents(formText(form, 'prepaymentAmount')),
  } as const
}

function optionalEuro(form: FormData, name: string) {
  const value = formOptionalText(form, name)
  return value === undefined ? undefined : parseEuroCents(value)
}

const euroFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Offen'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

export function OccupanciesRoute({
  data,
  selection,
  onApply,
}: WorkflowSubRouteProps) {
  const [error, setError] = useState<string | null>(null)
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === selection.billingPeriodId,
  )!
  const units = data.masterData.units.filter(
    ({ propertyId }) => propertyId === period.propertyId,
  )
  const occupancies = data.billingData.occupancyPeriods.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )
  const [editingId, setEditingId] = useState<string | null>(() => {
    const requestedId = new URLSearchParams(
      globalThis.location?.hash.split('?')[1] ?? '',
    ).get('edit')
    if (requestedId === null) return null
    return (
      occupancies.find(
        (occupancy) =>
          occupancy.id === requestedId || occupancy.tenancyId === requestedId,
      )?.id ?? null
    )
  })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [occupancyFilter, setOccupancyFilter] = useState('all')
  const visibleOccupancies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de-DE')
    return occupancies.filter((occupancy) => {
      if (occupancyFilter !== 'all' && occupancy.kind !== occupancyFilter)
        return false
      if (!query) return true
      const unit = units.find(({ id }) => id === occupancy.unitId)
      const tenancy = data.masterData.tenancies.find(
        ({ id }) => id === occupancy.tenancyId,
      )
      const person = data.masterData.persons.find(({ id }) =>
        tenancy?.personIds.includes(id),
      )
      return [unit?.label, person?.displayName, occupancy.note]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('de-DE').includes(query))
    })
  }, [
    data.masterData.persons,
    data.masterData.tenancies,
    occupancies,
    occupancyFilter,
    search,
    units,
  ])
  const validationIssues = useMemo(() => {
    try {
      return validateBillingPeriod(data, period.id).issues
    } catch {
      return []
    }
  }, [data, period.id])

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

  function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        addTenantOccupancy(current, {
          billingPeriodId: period.id,
          unitId: formText(form, 'unitId'),
          person: {
            displayName: formText(form, 'displayName'),
            firstName: formOptionalText(form, 'firstName'),
            lastName: formOptionalText(form, 'lastName'),
            email: formOptionalText(form, 'email'),
          },
          occupancy: {
            from: formOptionalText(form, 'from'),
            to: formOptionalText(form, 'to'),
            persons: optionalNumber(form, 'persons'),
          },
          prepayment: prepayment(form),
        }),
      )
    )
      event.currentTarget.reset()
  }

  function createVacancy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        addVacancyOccupancy(current, {
          billingPeriodId: period.id,
          unitId: formText(form, 'unitId'),
          from: formOptionalText(form, 'from'),
          to: formOptionalText(form, 'to'),
          note: formOptionalText(form, 'note'),
        }),
      )
    )
      event.currentTarget.reset()
  }

  function saveTenant(event: FormEvent<HTMLFormElement>, occupancyId: string) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        updateTenantOccupancy(current, {
          occupancyPeriodId: occupancyId,
          displayName: formText(form, 'displayName'),
          firstName: formOptionalText(form, 'firstName'),
          lastName: formOptionalText(form, 'lastName'),
          email: formOptionalText(form, 'email'),
          from: formOptionalText(form, 'from'),
          to: formOptionalText(form, 'to'),
          persons: optionalNumber(form, 'persons'),
          mandateReference: formOptionalText(form, 'mandateReference'),
          monthlyRentCents: optionalEuro(form, 'monthlyRent'),
          shippingAddressStreet: formOptionalText(
            form,
            'shippingAddressStreet',
          ),
          shippingAddressPostalCodeAndCity: formOptionalText(
            form,
            'shippingAddressPostalCodeAndCity',
          ),
          consumptionUnits: optionalNumber(form, 'consumptionUnits'),
          consumptionUnitsEstimated: form.has('consumptionUnitsEstimated'),
          consumptionUnitsEstimateReason: formOptionalText(
            form,
            'consumptionUnitsEstimateReason',
          ),
          coldWater: optionalNumber(form, 'coldWater'),
          warmWater: optionalNumber(form, 'warmWater'),
          applySection12Reduction: form.has('applySection12Reduction'),
          costScope: formOptionalText(form, 'costScopeBuildingId')
            ? {
                kind: 'building' as const,
                buildingId: formText(form, 'costScopeBuildingId'),
              }
            : { kind: 'property' as const },
          propertyTaxScope: formOptionalText(form, 'propertyTaxScopeBuildingId')
            ? {
                kind: 'building' as const,
                buildingId: formText(form, 'propertyTaxScopeBuildingId'),
              }
            : { kind: 'property' as const },
          dispatchDate: formOptionalText(form, 'dispatchDate'),
          note: formOptionalText(form, 'note'),
          prepayment: prepayment(form),
        }),
      )
    )
      setEditingId(null)
  }

  function saveVacancy(event: FormEvent<HTMLFormElement>, occupancyId: string) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        updateVacancyOccupancy(current, {
          occupancyPeriodId: occupancyId,
          from: formOptionalText(form, 'from'),
          to: formOptionalText(form, 'to'),
          note: formOptionalText(form, 'note'),
        }),
      )
    )
      setEditingId(null)
  }

  function confirmDelete(occupancyId: string) {
    if (apply((current) => deleteOccupancy(current, occupancyId))) {
      setEditingId(null)
      setDeleteId(null)
    }
  }

  if (units.length === 0)
    return (
      <p role="alert">Für dieses Objekt ist noch keine Einheit vorhanden.</p>
    )

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <form noValidate onSubmit={createTenant}>
        <label>
          <span>Einheit</span>
          <select name="unitId" required>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
        <WorkflowField label="Anzeigename" name="displayName" required />
        <WorkflowField label="Vorname" name="firstName" />
        <WorkflowField label="Nachname" name="lastName" />
        <WorkflowField label="E-Mail" name="email" type="email" />
        <WorkflowField label="Einzug" name="from" type="date" />
        <WorkflowField label="Auszug" name="to" type="date" />
        <WorkflowField label="Personenzahl" name="persons" type="number" />
        <label>
          <span>Vorauszahlungsart</span>
          <select name="prepaymentMode">
            <option value="monthly">Monatlich</option>
            <option value="annual">Jährlich</option>
            <option value="none_agreed">Keine vereinbart</option>
          </select>
        </label>
        <WorkflowField label="Vorauszahlung in Euro" name="prepaymentAmount" />
        <button type="submit">Nutzer anlegen</button>
      </form>
      <form noValidate onSubmit={createVacancy}>
        <h2>Leerstand erfassen</h2>
        <label>
          <span>Leerstandseinheit</span>
          <select name="unitId" required>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
        <WorkflowField label="Leerstand von" name="from" type="date" />
        <WorkflowField label="Leerstand bis" name="to" type="date" />
        <WorkflowField label="Leerstandsnotiz" name="note" />
        <button type="submit">Leerstand anlegen</button>
      </form>

      <section className="editable-records" aria-labelledby="occupancies-title">
        <div className="data-panel__heading">
          <h2 id="occupancies-title">
            Nutzer und Leerstände ({occupancies.length})
          </h2>
        </div>
        {occupancies.length === 0 ? (
          <p>Noch keine Nutzung erfasst.</p>
        ) : (
          <>
            <TableToolbar
              searchValue={search}
              onSearchChange={setSearch}
              searchLabel="Nutzerzeiträume durchsuchen"
              searchPlaceholder="Einheit, Nutzer oder Notiz"
              filterValue={occupancyFilter}
              onFilterChange={setOccupancyFilter}
              filterLabel="Nutzungsart"
              filterOptions={[
                { value: 'all', label: 'Alle Zeiträume' },
                { value: 'tenant', label: 'Nur Nutzer' },
                { value: 'vacancy', label: 'Nur Leerstände' },
              ]}
              resultCount={visibleOccupancies.length}
              resultLabel="Zeiträume"
              resultSingularLabel="Zeitraum"
            />
            {visibleOccupancies.length === 0 ? (
              <p className="table-empty-state">
                Für diese Suche wurden keine Zeiträume gefunden.
              </p>
            ) : (
              <div className="data-table-wrap data-table-wrap--workspace">
                <table
                  className="data-table data-table--workspace"
                  aria-label="Nutzerzeiträume bearbeiten"
                >
                  <thead>
                    <tr>
                      <th scope="col">Einheit</th>
                      <th scope="col">Nutzer / Art</th>
                      <th scope="col">Zeitraum</th>
                      <th scope="col">Fläche</th>
                      <th scope="col">Personen</th>
                      <th scope="col">Vorauszahlung</th>
                      <th scope="col">Kostenbereich</th>
                      <th scope="col">Status</th>
                      <th scope="col">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOccupancies.map((occupancy) => {
                      const tenancy = data.masterData.tenancies.find(
                        ({ id }) => id === occupancy.tenancyId,
                      )
                      const person = data.masterData.persons.find(({ id }) =>
                        tenancy?.personIds.includes(id),
                      )
                      const currentPrepayment =
                        data.billingData.prepayments.find(
                          ({ occupancyPeriodId }) =>
                            occupancyPeriodId === occupancy.id,
                        )
                      const name =
                        occupancy.kind === 'vacancy'
                          ? 'Leerstand'
                          : (person?.displayName ?? 'Nutzer ohne Anzeigename')
                      const amount =
                        currentPrepayment?.mode === 'monthly'
                          ? currentPrepayment.monthlyAmountCents
                          : currentPrepayment?.mode === 'annual'
                            ? currentPrepayment.annualAmountCents
                            : undefined
                      const unit = units.find(
                        ({ id }) => id === occupancy.unitId,
                      )
                      const scopeBuildingId =
                        occupancy.costScope?.kind === 'building'
                          ? occupancy.costScope.buildingId
                          : undefined
                      const scope = scopeBuildingId
                        ? (data.masterData.buildings.find(
                            ({ id }) => id === scopeBuildingId,
                          )?.name ?? 'Gebäude')
                        : 'Gesamtes Objekt'
                      const prepayment =
                        currentPrepayment?.mode === 'monthly'
                          ? `${euroFormatter.format((amount ?? 0) / 100)} / Monat`
                          : currentPrepayment?.mode === 'annual'
                            ? `${euroFormatter.format((amount ?? 0) / 100)} / Jahr`
                            : 'Keine vereinbart'
                      const relatedIds = new Set([
                        occupancy.id,
                        occupancy.unitId,
                        occupancy.tenancyId,
                      ])
                      const rowIssues = validationIssues.filter(
                        (issue) =>
                          issue.entity && relatedIds.has(issue.entity.id),
                      )
                      const hasErrors = rowIssues.some(
                        ({ severity }) => severity === 'error',
                      )
                      return (
                        <Fragment key={occupancy.id}>
                          <tr
                            className="data-table__interactive-row"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget) return
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                setEditingId(occupancy.id)
                              }
                              if (event.key === 'Escape') {
                                setEditingId(null)
                                setDeleteId(null)
                              }
                            }}
                          >
                            <td>
                              <strong>{unit?.label ?? 'Einheit'}</strong>
                            </td>
                            <td>
                              <strong>{name}</strong>
                              <small>
                                {occupancy.kind === 'vacancy'
                                  ? 'Leerstand'
                                  : 'Nutzer'}
                              </small>
                            </td>
                            <td>
                              {formatDate(occupancy.from ?? period.periodStart)}{' '}
                              – {formatDate(occupancy.to ?? period.periodEnd)}
                            </td>
                            <td>{unit?.usableAreaSqm?.value ?? '–'} m²</td>
                            <td>{occupancy.persons?.value ?? '–'}</td>
                            <td>{prepayment}</td>
                            <td>{scope}</td>
                            <td>
                              {rowIssues.length === 0 ? (
                                <span className="table-status table-status--ready">
                                  Vollständig
                                </span>
                              ) : (
                                <>
                                  <span className="table-status table-status--open">
                                    {hasErrors ? 'Prüfen' : 'Hinweis'}
                                  </span>
                                  <small>
                                    {rowIssues
                                      .slice(0, 2)
                                      .map(({ title }) => title)
                                      .join(' · ')}
                                  </small>
                                </>
                              )}
                            </td>
                            <td className="data-table__actions">
                              <button
                                type="button"
                                aria-label={`${name} bearbeiten`}
                                aria-expanded={editingId === occupancy.id}
                                onClick={() =>
                                  setEditingId(
                                    editingId === occupancy.id
                                      ? null
                                      : occupancy.id,
                                  )
                                }
                              >
                                Bearbeiten
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteId(occupancy.id)}
                              >
                                {occupancy.kind === 'vacancy'
                                  ? 'Leerstand löschen'
                                  : 'Nutzer löschen'}
                              </button>
                            </td>
                          </tr>
                          {editingId === occupancy.id ||
                          deleteId === occupancy.id ? (
                            <tr className="data-table__detail-row">
                              <td colSpan={9}>
                                <div className="record-editor record-editor--embedded">
                                  {editingId === occupancy.id &&
                                  occupancy.kind === 'tenant' ? (
                                    <form
                                      className="embedded-form"
                                      noValidate
                                      onSubmit={(event) =>
                                        saveTenant(event, occupancy.id)
                                      }
                                    >
                                      <WorkflowField
                                        label="Anzeigename bearbeiten"
                                        name="displayName"
                                        required
                                        defaultValue={person?.displayName ?? ''}
                                      />
                                      <WorkflowField
                                        label="Vorname bearbeiten"
                                        name="firstName"
                                        defaultValue={person?.firstName ?? ''}
                                      />
                                      <WorkflowField
                                        label="Nachname bearbeiten"
                                        name="lastName"
                                        defaultValue={person?.lastName ?? ''}
                                      />
                                      <WorkflowField
                                        label="E-Mail bearbeiten"
                                        name="email"
                                        type="email"
                                        defaultValue={person?.email ?? ''}
                                      />
                                      <WorkflowField
                                        label="Einzug bearbeiten"
                                        name="from"
                                        type="date"
                                        defaultValue={occupancy.from ?? ''}
                                      />
                                      <WorkflowField
                                        label="Auszug bearbeiten"
                                        name="to"
                                        type="date"
                                        defaultValue={occupancy.to ?? ''}
                                      />
                                      <WorkflowField
                                        label="Personenzahl bearbeiten"
                                        name="persons"
                                        type="number"
                                        defaultValue={
                                          occupancy.persons?.value ?? ''
                                        }
                                      />
                                      <WorkflowField
                                        label="Mandatsreferenz bearbeiten"
                                        name="mandateReference"
                                        defaultValue={
                                          tenancy?.mandateReference ?? ''
                                        }
                                      />
                                      <WorkflowField
                                        label="Monatsmiete in Euro bearbeiten"
                                        name="monthlyRent"
                                        defaultValue={
                                          tenancy?.monthlyRentCents == null
                                            ? ''
                                            : formatEuroInput(
                                                tenancy.monthlyRentCents,
                                              )
                                        }
                                      />
                                      <WorkflowField
                                        label="Versandstraße bearbeiten"
                                        name="shippingAddressStreet"
                                        defaultValue={
                                          tenancy?.shippingAddressStreet ?? ''
                                        }
                                      />
                                      <WorkflowField
                                        label="Versandort bearbeiten"
                                        name="shippingAddressPostalCodeAndCity"
                                        defaultValue={
                                          tenancy?.shippingAddressPostalCodeAndCity ??
                                          ''
                                        }
                                      />
                                      <WorkflowField
                                        label="Verbrauchseinheiten bearbeiten"
                                        name="consumptionUnits"
                                        defaultValue={
                                          occupancy.consumptionUnits?.value ??
                                          ''
                                        }
                                      />
                                      <label className="checkbox-field">
                                        <input
                                          type="checkbox"
                                          name="consumptionUnitsEstimated"
                                          defaultChecked={
                                            occupancy.consumptionUnitsEstimated ??
                                            false
                                          }
                                        />
                                        <span>
                                          Verbrauchseinheiten geschätzt
                                        </span>
                                      </label>
                                      <WorkflowField
                                        label="Schätzgrund Verbrauch bearbeiten"
                                        name="consumptionUnitsEstimateReason"
                                        defaultValue={
                                          occupancy.consumptionUnitsEstimateReason ??
                                          ''
                                        }
                                      />
                                      <WorkflowField
                                        label="Kaltwasser in m³ bearbeiten"
                                        name="coldWater"
                                        defaultValue={
                                          occupancy.coldWater?.value ?? ''
                                        }
                                      />
                                      <WorkflowField
                                        label="Warmwasser in m³ bearbeiten"
                                        name="warmWater"
                                        defaultValue={
                                          occupancy.warmWater?.value ?? ''
                                        }
                                      />
                                      <label className="checkbox-field">
                                        <input
                                          type="checkbox"
                                          name="applySection12Reduction"
                                          defaultChecked={
                                            occupancy.applySection12Reduction ??
                                            false
                                          }
                                        />
                                        <span>
                                          § 12 HeizKV-Kürzung anwenden
                                        </span>
                                      </label>
                                      <label>
                                        <span>Kostenbereich bearbeiten</span>
                                        <select
                                          name="costScopeBuildingId"
                                          defaultValue={
                                            occupancy.costScope?.kind ===
                                            'building'
                                              ? occupancy.costScope.buildingId
                                              : ''
                                          }
                                        >
                                          <option value="">
                                            Gesamtes Objekt
                                          </option>
                                          {data.masterData.buildings
                                            .filter(
                                              ({ propertyId }) =>
                                                propertyId ===
                                                period.propertyId,
                                            )
                                            .map((building) => (
                                              <option
                                                key={building.id}
                                                value={building.id}
                                              >
                                                {building.name}
                                              </option>
                                            ))}
                                        </select>
                                      </label>
                                      <label>
                                        <span>
                                          Grundsteuerbereich bearbeiten
                                        </span>
                                        <select
                                          name="propertyTaxScopeBuildingId"
                                          defaultValue={
                                            occupancy.propertyTaxScope?.kind ===
                                            'building'
                                              ? occupancy.propertyTaxScope
                                                  .buildingId
                                              : ''
                                          }
                                        >
                                          <option value="">
                                            Gesamtes Objekt
                                          </option>
                                          {data.masterData.buildings
                                            .filter(
                                              ({ propertyId }) =>
                                                propertyId ===
                                                period.propertyId,
                                            )
                                            .map((building) => (
                                              <option
                                                key={building.id}
                                                value={building.id}
                                              >
                                                {building.name}
                                              </option>
                                            ))}
                                        </select>
                                      </label>
                                      <WorkflowField
                                        label="Versanddatum bearbeiten"
                                        name="dispatchDate"
                                        type="date"
                                        defaultValue={
                                          occupancy.dispatchDate ?? ''
                                        }
                                      />
                                      <WorkflowField
                                        label="Nutzernotiz bearbeiten"
                                        name="note"
                                        defaultValue={occupancy.note ?? ''}
                                      />
                                      <label>
                                        <span>
                                          Vorauszahlungsart bearbeiten
                                        </span>
                                        <select
                                          name="prepaymentMode"
                                          defaultValue={
                                            currentPrepayment?.mode ??
                                            'none_agreed'
                                          }
                                        >
                                          <option value="monthly">
                                            Monatlich
                                          </option>
                                          <option value="annual">
                                            Jährlich
                                          </option>
                                          <option value="none_agreed">
                                            Keine vereinbart
                                          </option>
                                        </select>
                                      </label>
                                      <WorkflowField
                                        label="Vorauszahlung bearbeiten"
                                        name="prepaymentAmount"
                                        defaultValue={
                                          amount === undefined
                                            ? ''
                                            : formatEuroInput(amount)
                                        }
                                      />
                                      <button type="submit">
                                        Nutzerdaten speichern
                                      </button>
                                    </form>
                                  ) : null}
                                  {editingId === occupancy.id &&
                                  occupancy.kind === 'vacancy' ? (
                                    <form
                                      className="embedded-form"
                                      noValidate
                                      onSubmit={(event) =>
                                        saveVacancy(event, occupancy.id)
                                      }
                                    >
                                      <WorkflowField
                                        label="Leerstand von bearbeiten"
                                        name="from"
                                        type="date"
                                        defaultValue={occupancy.from ?? ''}
                                      />
                                      <WorkflowField
                                        label="Leerstand bis bearbeiten"
                                        name="to"
                                        type="date"
                                        defaultValue={occupancy.to ?? ''}
                                      />
                                      <WorkflowField
                                        label="Leerstandsnotiz bearbeiten"
                                        name="note"
                                        defaultValue={occupancy.note ?? ''}
                                      />
                                      <button type="submit">
                                        Leerstand speichern
                                      </button>
                                    </form>
                                  ) : null}
                                  <div className="danger-zone">
                                    {deleteId === occupancy.id ? (
                                      <>
                                        <p>
                                          Dieser Zeitraum und seine
                                          Vorauszahlung werden entfernt.
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            confirmDelete(occupancy.id)
                                          }
                                        >
                                          Löschen bestätigen
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setDeleteId(null)}
                                        >
                                          Abbrechen
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDeleteId(occupancy.id)
                                        }
                                      >
                                        {occupancy.kind === 'vacancy'
                                          ? 'Leerstand löschen'
                                          : 'Nutzer löschen'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </>
  )
}
