import { useState, type FormEvent } from 'react'
import { parseEuroCents, parseOptionalNumber } from '../../app/form-parsers'
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

export function OccupanciesRoute({
  data,
  selection,
  onApply,
}: WorkflowSubRouteProps) {
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === selection.billingPeriodId,
  )!
  const units = data.masterData.units.filter(
    ({ propertyId }) => propertyId === period.propertyId,
  )
  const occupancies = data.billingData.occupancyPeriods.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
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

  function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        addTenantOccupancy(current, {
          billingPeriodId: period.id,
          unitId: formText(form, 'unitId'),
          person: { displayName: formText(form, 'displayName') },
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
          from: formOptionalText(form, 'from'),
          to: formOptionalText(form, 'to'),
          persons: optionalNumber(form, 'persons'),
          shippingAddressStreet: formOptionalText(
            form,
            'shippingAddressStreet',
          ),
          shippingAddressPostalCodeAndCity: formOptionalText(
            form,
            'shippingAddressPostalCodeAndCity',
          ),
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
          occupancies.map((occupancy) => {
            const tenancy = data.masterData.tenancies.find(
              ({ id }) => id === occupancy.tenancyId,
            )
            const person = data.masterData.persons.find(({ id }) =>
              tenancy?.personIds.includes(id),
            )
            const currentPrepayment = data.billingData.prepayments.find(
              ({ occupancyPeriodId }) => occupancyPeriodId === occupancy.id,
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
            return (
              <article className="record-editor" key={occupancy.id}>
                <div className="record-editor__heading">
                  <div>
                    <p className="section-kicker">
                      {units.find(({ id }) => id === occupancy.unitId)?.label ??
                        'Einheit'}
                    </p>
                    <h3>{name}</h3>
                    <small>
                      {occupancy.from ?? period.periodStart} –{' '}
                      {occupancy.to ?? period.periodEnd}
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-label={`${name} bearbeiten`}
                    onClick={() =>
                      setEditingId(
                        editingId === occupancy.id ? null : occupancy.id,
                      )
                    }
                  >
                    Bearbeiten
                  </button>
                </div>
                {editingId === occupancy.id && occupancy.kind === 'tenant' ? (
                  <form
                    className="embedded-form"
                    noValidate
                    onSubmit={(event) => saveTenant(event, occupancy.id)}
                  >
                    <WorkflowField
                      label="Anzeigename bearbeiten"
                      name="displayName"
                      required
                      defaultValue={person?.displayName ?? ''}
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
                      defaultValue={occupancy.persons?.value ?? ''}
                    />
                    <WorkflowField
                      label="Versandstraße bearbeiten"
                      name="shippingAddressStreet"
                      defaultValue={tenancy?.shippingAddressStreet ?? ''}
                    />
                    <WorkflowField
                      label="Versandort bearbeiten"
                      name="shippingAddressPostalCodeAndCity"
                      defaultValue={
                        tenancy?.shippingAddressPostalCodeAndCity ?? ''
                      }
                    />
                    <label>
                      <span>Vorauszahlungsart bearbeiten</span>
                      <select
                        name="prepaymentMode"
                        defaultValue={currentPrepayment?.mode ?? 'none_agreed'}
                      >
                        <option value="monthly">Monatlich</option>
                        <option value="annual">Jährlich</option>
                        <option value="none_agreed">Keine vereinbart</option>
                      </select>
                    </label>
                    <WorkflowField
                      label="Vorauszahlung bearbeiten"
                      name="prepaymentAmount"
                      defaultValue={
                        amount === undefined ? '' : (amount / 100).toFixed(2)
                      }
                    />
                    <button type="submit">Nutzerdaten speichern</button>
                  </form>
                ) : null}
                {editingId === occupancy.id && occupancy.kind === 'vacancy' ? (
                  <form
                    className="embedded-form"
                    noValidate
                    onSubmit={(event) => saveVacancy(event, occupancy.id)}
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
                    <button type="submit">Leerstand speichern</button>
                  </form>
                ) : null}
                <div className="danger-zone">
                  {deleteId === occupancy.id ? (
                    <>
                      <p>
                        Dieser Zeitraum und seine Vorauszahlung werden entfernt.
                      </p>
                      <button
                        type="button"
                        onClick={() => confirmDelete(occupancy.id)}
                      >
                        Löschen bestätigen
                      </button>
                      <button type="button" onClick={() => setDeleteId(null)}>
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteId(occupancy.id)}
                    >
                      {occupancy.kind === 'vacancy'
                        ? 'Leerstand löschen'
                        : 'Nutzer löschen'}
                    </button>
                  )}
                </div>
              </article>
            )
          })
        )}
      </section>
    </>
  )
}
