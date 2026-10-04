import { useState, type FormEvent } from 'react'
import { UnitOccupanciesOverview } from './UnitOccupanciesOverview'
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

/** Zählerstände der Nutzerbearbeitung; ohne Eingaben `undefined`. */
function heatMeterReading(form: FormData) {
  const reading = {
    meterNumber: formOptionalText(form, 'meterNumber'),
    startValue: optionalNumber(form, 'meterStartValue'),
    startDate: formOptionalText(form, 'meterStartDate'),
    endValue: optionalNumber(form, 'meterEndValue'),
    endDate: formOptionalText(form, 'meterEndDate'),
  }
  return Object.values(reading).some((value) => value !== undefined)
    ? reading
    : undefined
}

function optionalEuro(form: FormData, name: string) {
  const value = formOptionalText(form, name)
  return value === undefined ? undefined : parseEuroCents(value)
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
          heatMeterReading: heatMeterReading(form),
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
      <UnitOccupanciesOverview
        data={data}
        period={period}
        units={units}
        occupancies={occupancies}
        editingId={editingId}
        deleteId={deleteId}
        setEditingId={setEditingId}
        setDeleteId={setDeleteId}
        saveTenant={saveTenant}
        saveVacancy={saveVacancy}
        confirmDelete={confirmDelete}
      />
      <section aria-labelledby="new-occupancy-title">
        <h2 id="new-occupancy-title">Neue Belegung erfassen</h2>
        <form noValidate onSubmit={createTenant}>
          <label>
            <span>Einheit</span>
            <select name="unitId" aria-label="Einheit" required>
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
          <WorkflowField
            label="Vorauszahlung in Euro"
            name="prepaymentAmount"
          />
          <button type="submit">Nutzer anlegen</button>
        </form>
        <form noValidate onSubmit={createVacancy}>
          <h2>Leerstand erfassen</h2>
          <label>
            <span>Leerstandseinheit</span>
            <select name="unitId" aria-label="Leerstandseinheit" required>
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
      </section>
    </>
  )
}
