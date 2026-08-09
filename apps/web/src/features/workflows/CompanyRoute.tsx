import { useState, type FormEvent } from 'react'
import {
  createCompany,
  deleteCompany,
  updateCompany,
} from '../master-data/commands'
import { ExistingEntries, WorkflowField } from './form-support'
import { formOptionalText, formText } from './form-values'
import type { WorkflowSubRouteProps } from './route-types'

function idFactory(values: readonly string[]) {
  let index = 0
  return () => values[index++] ?? crypto.randomUUID()
}

export function CompanyRoute({
  data,
  selection,
  onSelectionChange,
  onApply,
}: WorkflowSubRouteProps) {
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const company = data.masterData.ownerCompanies.find(
    ({ id }) => id === selection.ownerCompanyId,
  )
  const organization = data.masterData.organizations.find(
    ({ id }) => id === company?.organizationId,
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

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const organizationId = crypto.randomUUID()
    const ownerCompanyId = crypto.randomUUID()
    if (
      apply((current) =>
        createCompany(
          current,
          {
            organizationName: formText(form, 'organizationName'),
            ownerCompanyName: formText(form, 'ownerCompanyName'),
            additionalNameLines: [
              formOptionalText(form, 'additionalName'),
            ].flatMap((value) => (value ? [value] : [])),
          },
          { createId: idFactory([organizationId, ownerCompanyId]) },
        ),
      )
    ) {
      event.currentTarget.reset()
      onSelectionChange({
        ownerCompanyId,
        propertyId: null,
        billingPeriodId: null,
      })
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!company) return
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        updateCompany(current, company.id, {
          organizationName: formText(form, 'organizationName'),
          ownerCompanyName: formText(form, 'ownerCompanyName'),
          additionalNameLines: [
            formOptionalText(form, 'additionalName'),
          ].flatMap((value) => (value ? [value] : [])),
          street: formOptionalText(form, 'street'),
          postalCodeAndCity: formOptionalText(form, 'postalCodeAndCity'),
          iban: formOptionalText(form, 'iban'),
          bic: formOptionalText(form, 'bic'),
          accountHolder: formOptionalText(form, 'accountHolder'),
          bankName: formOptionalText(form, 'bankName'),
        }),
      )
    )
      setEditing(false)
  }

  function confirmDelete() {
    if (!company) return
    if (apply((current) => deleteCompany(current, company.id))) {
      setEditing(false)
      setDeleteArmed(false)
      onSelectionChange({
        ownerCompanyId: null,
        propertyId: null,
        billingPeriodId: null,
      })
    }
  }

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <form noValidate onSubmit={create}>
        <WorkflowField label="Mandantenname" name="organizationName" required />
        <WorkflowField label="Firmenname" name="ownerCompanyName" required />
        <WorkflowField label="Zusätzliche Namenszeile" name="additionalName" />
        <button type="submit">Firma anlegen</button>
      </form>
      <label>
        <span>Aktive Firma</span>
        <select
          value={selection.ownerCompanyId ?? ''}
          onChange={(event) => {
            setEditing(false)
            setDeleteArmed(false)
            onSelectionChange({
              ownerCompanyId: event.target.value || null,
              propertyId: null,
              billingPeriodId: null,
            })
          }}
        >
          <option value="">Bitte auswählen</option>
          {data.masterData.ownerCompanies.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {!company ? null : (
        <section
          className="record-editor"
          aria-labelledby="company-editor-title"
        >
          <div className="record-editor__heading">
            <div>
              <p className="section-kicker">Aktive Firma</p>
              <h2 id="company-editor-title">{company.name}</h2>
            </div>
            <button type="button" onClick={() => setEditing((value) => !value)}>
              {editing ? 'Bearbeitung schließen' : 'Firma bearbeiten'}
            </button>
          </div>
          {editing ? (
            <form className="embedded-form" noValidate onSubmit={save}>
              <WorkflowField
                label="Mandantenname bearbeiten"
                name="organizationName"
                required
                defaultValue={organization?.name ?? ''}
              />
              <WorkflowField
                label="Firmenname bearbeiten"
                name="ownerCompanyName"
                required
                defaultValue={company.name}
              />
              <WorkflowField
                label="Namenszeile bearbeiten"
                name="additionalName"
                defaultValue={company.additionalNameLines[0] ?? ''}
              />
              <WorkflowField
                label="Straße bearbeiten"
                name="street"
                defaultValue={company.address?.street ?? ''}
              />
              <WorkflowField
                label="Postleitzahl und Ort bearbeiten"
                name="postalCodeAndCity"
                defaultValue={company.address?.postalCodeAndCity ?? ''}
              />
              <WorkflowField
                label="IBAN bearbeiten"
                name="iban"
                defaultValue={company.bankAccount?.iban ?? ''}
              />
              <WorkflowField
                label="BIC bearbeiten"
                name="bic"
                defaultValue={company.bankAccount?.bic ?? ''}
              />
              <WorkflowField
                label="Kontoinhaber bearbeiten"
                name="accountHolder"
                defaultValue={company.bankAccount?.accountHolder ?? ''}
              />
              <WorkflowField
                label="Bankname bearbeiten"
                name="bankName"
                defaultValue={company.bankAccount?.bankName ?? ''}
              />
              <button type="submit">Änderungen speichern</button>
            </form>
          ) : null}
          <div className="danger-zone">
            {deleteArmed ? (
              <>
                <p>
                  Nur ungenutzte Firmen ohne zugeordnete Objekte können gelöscht
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
                Firma löschen
              </button>
            )}
          </div>
        </section>
      )}
      <ExistingEntries empty="Noch keine Firma angelegt.">
        {data.masterData.ownerCompanies.length > 0 && (
          <ul>
            {data.masterData.ownerCompanies.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        )}
      </ExistingEntries>
    </>
  )
}
