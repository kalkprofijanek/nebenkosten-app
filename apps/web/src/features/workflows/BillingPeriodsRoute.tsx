import { useState, type FormEvent } from 'react'
import {
  createBillingPeriod,
  deleteBillingPeriod,
  updateBillingPeriod,
} from '../billing-periods/commands'
import { ExistingEntries, WorkflowField } from './form-support'
import { formText } from './form-values'
import type { WorkflowSubRouteProps } from './route-types'

export function BillingPeriodsRoute({
  data,
  selection,
  onSelectionChange,
  onApply,
}: WorkflowSubRouteProps) {
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const periods = data.billingData.billingPeriods.filter(
    ({ propertyId }) => propertyId === selection.propertyId,
  )
  const period = periods.find(({ id }) => id === selection.billingPeriodId)

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

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const billingPeriodId = crypto.randomUUID()
    if (
      apply((current) =>
        createBillingPeriod(
          current,
          {
            propertyId: selection.propertyId!,
            year: Number(formText(form, 'year')),
          },
          { createId: () => billingPeriodId },
        ),
      )
    ) {
      event.currentTarget.reset()
      onSelectionChange({ billingPeriodId })
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!period) return
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        updateBillingPeriod(current, period.id, {
          year: Number(formText(form, 'year')),
          periodStart: formText(form, 'periodStart'),
          periodEnd: formText(form, 'periodEnd'),
        }),
      )
    )
      setEditing(false)
  }

  function confirmDelete() {
    if (!period) return
    if (apply((current) => deleteBillingPeriod(current, period.id))) {
      setEditing(false)
      setDeleteArmed(false)
      onSelectionChange({ billingPeriodId: null })
    }
  }

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <form noValidate onSubmit={create}>
        <WorkflowField
          label="Abrechnungsjahr"
          name="year"
          type="number"
          required
        />
        <button type="submit">Abrechnungsjahr anlegen</button>
      </form>
      <label>
        <span>Aktives Abrechnungsjahr</span>
        <select
          value={selection.billingPeriodId ?? ''}
          onChange={(event) => {
            setEditing(false)
            setDeleteArmed(false)
            onSelectionChange({ billingPeriodId: event.target.value || null })
          }}
        >
          <option value="">Bitte auswählen</option>
          {periods.map((item) => (
            <option key={item.id} value={item.id}>
              {item.year}
            </option>
          ))}
        </select>
      </label>
      {!period ? null : (
        <section
          className="record-editor"
          aria-labelledby="period-editor-title"
        >
          <div className="record-editor__heading">
            <div>
              <p className="section-kicker">Aktiver Zeitraum</p>
              <h2 id="period-editor-title">Abrechnungsjahr {period.year}</h2>
            </div>
            <button type="button" onClick={() => setEditing((value) => !value)}>
              {editing ? 'Bearbeitung schließen' : 'Abrechnungsjahr bearbeiten'}
            </button>
          </div>
          {editing ? (
            <form className="embedded-form" noValidate onSubmit={save}>
              <WorkflowField
                label="Jahr bearbeiten"
                name="year"
                type="number"
                required
                defaultValue={period.year}
              />
              <WorkflowField
                label="Zeitraum von"
                name="periodStart"
                type="date"
                required
                defaultValue={period.periodStart}
              />
              <WorkflowField
                label="Zeitraum bis"
                name="periodEnd"
                type="date"
                required
                defaultValue={period.periodEnd}
              />
              <button type="submit">Änderungen speichern</button>
            </form>
          ) : null}
          <div className="danger-zone">
            {deleteArmed ? (
              <>
                <p>
                  Ein Abrechnungsjahr mit zugeordneten Daten kann nicht gelöscht
                  werden.
                </p>
                <button type="button" onClick={confirmDelete}>
                  Löschen bestätigen
                </button>
                <button type="button" onClick={() => setDeleteArmed(false)}>
                  Abbrechen
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setDeleteArmed(true)}>
                Abrechnungsjahr löschen
              </button>
            )}
          </div>
        </section>
      )}
      <ExistingEntries empty="Noch kein Abrechnungsjahr angelegt.">
        {periods.length > 0 && (
          <ul>
            {periods.map((item) => (
              <li key={item.id}>
                {item.year} · {item.status}
              </li>
            ))}
          </ul>
        )}
      </ExistingEntries>
    </>
  )
}
