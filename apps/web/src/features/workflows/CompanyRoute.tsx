import { useRef, useState, type FormEvent } from 'react'
import { TableToolbar } from '../../components/TableToolbar'
import {
  createCompany,
  deleteCompany,
  updateCompany,
} from '../master-data/commands'
import { WorkflowField } from './form-support'
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
  const [search, setSearch] = useState('')
  const createLockUntil = useRef(0)
  const company = data.masterData.ownerCompanies.find(
    ({ id }) => id === selection.ownerCompanyId,
  )
  const organization = data.masterData.organizations.find(
    ({ id }) => id === company?.organizationId,
  )
  const normalizedSearch = search.trim().toLocaleLowerCase('de-DE')
  const companies = data.masterData.ownerCompanies.filter((item) => {
    const itemOrganization = data.masterData.organizations.find(
      ({ id }) => id === item.organizationId,
    )
    return [
      item.name,
      itemOrganization?.name,
      item.address?.street,
      item.address?.postalCodeAndCity,
      item.contact?.firstName,
      item.contact?.lastName,
      item.contact?.email,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('de-DE')
      .includes(normalizedSearch)
  })

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
    if (performance.now() < createLockUntil.current) return
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
      createLockUntil.current = performance.now() + 500
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
          postBox: formOptionalText(form, 'postBox'),
          contactSalutation: formOptionalText(form, 'contactSalutation') as
            'Herr' | 'Frau' | 'Familie' | 'Firma' | undefined,
          contactFirstName: formOptionalText(form, 'contactFirstName'),
          contactLastName: formOptionalText(form, 'contactLastName'),
          contactPhone: formOptionalText(form, 'contactPhone'),
          contactMobile: formOptionalText(form, 'contactMobile'),
          contactFax: formOptionalText(form, 'contactFax'),
          contactEmail: formOptionalText(form, 'contactEmail'),
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
      <section className="data-panel" aria-labelledby="companies-title">
        <div className="data-panel__heading">
          <div>
            <p className="section-kicker">Arbeitsübersicht</p>
            <h2 id="companies-title">Firmen</h2>
          </div>
          <span>Zeile auswählen, anschließend Details bearbeiten</span>
        </div>
        <TableToolbar
          searchLabel="Firmen durchsuchen"
          searchValue={search}
          searchPlaceholder="Name, Anschrift oder Kontakt"
          onSearchChange={setSearch}
          resultCount={companies.length}
          resultLabel="Firmen"
          resultSingularLabel="Firma"
        />
        {companies.length === 0 ? (
          <p className="table-empty-state">
            Keine Firma für diese Suche gefunden.
          </p>
        ) : (
          <div className="data-table-wrap data-table-wrap--workspace">
            <table
              className="data-table data-table--workspace"
              aria-label="Firmenübersicht"
            >
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Mandant</th>
                  <th>Anschrift</th>
                  <th>Kontakt</th>
                  <th>Bank</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((item) => {
                  const itemOrganization = data.masterData.organizations.find(
                    ({ id }) => id === item.organizationId,
                  )
                  const isActive = item.id === selection.ownerCompanyId
                  const contactName = [
                    item.contact?.firstName,
                    item.contact?.lastName,
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <tr key={item.id} className="data-table__interactive-row">
                      <td>
                        <strong>{item.name}</strong>
                        {isActive ? (
                          <span className="table-status table-status--ready">
                            Aktiv
                          </span>
                        ) : null}
                      </td>
                      <td>{itemOrganization?.name ?? 'Nicht zugeordnet'}</td>
                      <td>
                        {item.address?.street ?? 'Nicht erfasst'}
                        <small>
                          {item.address?.postalCodeAndCity ?? 'Ort fehlt'}
                        </small>
                      </td>
                      <td>
                        {contactName || 'Nicht erfasst'}
                        <small>{item.contact?.email ?? 'E-Mail fehlt'}</small>
                      </td>
                      <td>{item.bankAccount?.iban ? 'Erfasst' : 'Offen'}</td>
                      <td className="data-table__actions">
                        <button
                          type="button"
                          aria-label={`${item.name} auswählen`}
                          disabled={isActive}
                          onClick={() => {
                            setEditing(false)
                            setDeleteArmed(false)
                            onSelectionChange({
                              ownerCompanyId: item.id,
                              propertyId: null,
                              billingPeriodId: null,
                            })
                          }}
                        >
                          {isActive ? 'Ausgewählt' : 'Auswählen'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
                label="Postfach bearbeiten"
                name="postBox"
                defaultValue={company.postBox ?? ''}
              />
              <label>
                <span>Anrede Kontakt bearbeiten</span>
                <select
                  name="contactSalutation"
                  defaultValue={company.contact?.salutation ?? ''}
                >
                  <option value="">Nicht erfasst</option>
                  <option value="Herr">Herr</option>
                  <option value="Frau">Frau</option>
                  <option value="Familie">Familie</option>
                  <option value="Firma">Firma</option>
                </select>
              </label>
              <WorkflowField
                label="Vorname Kontakt bearbeiten"
                name="contactFirstName"
                defaultValue={company.contact?.firstName ?? ''}
              />
              <WorkflowField
                label="Nachname Kontakt bearbeiten"
                name="contactLastName"
                defaultValue={company.contact?.lastName ?? ''}
              />
              <WorkflowField
                label="Telefon Kontakt bearbeiten"
                name="contactPhone"
                defaultValue={company.contact?.phone ?? ''}
              />
              <WorkflowField
                label="Mobil Kontakt bearbeiten"
                name="contactMobile"
                defaultValue={company.contact?.mobile ?? ''}
              />
              <WorkflowField
                label="Fax Kontakt bearbeiten"
                name="contactFax"
                defaultValue={company.contact?.fax ?? ''}
              />
              <WorkflowField
                label="E-Mail Kontakt bearbeiten"
                name="contactEmail"
                type="email"
                defaultValue={company.contact?.email ?? ''}
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
    </>
  )
}
