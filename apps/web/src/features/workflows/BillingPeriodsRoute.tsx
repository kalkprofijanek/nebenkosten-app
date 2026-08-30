import { useState, type FormEvent } from 'react'
import { parseOptionalNumber } from '../../app/form-parsers'
import { TableToolbar } from '../../components/TableToolbar'
import {
  createBillingPeriod,
  deleteBillingPeriod,
  updateBillingPeriod,
} from '../billing-periods/commands'
import { WorkflowField } from './form-support'
import { formOptionalText, formText } from './form-values'
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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const periods = data.billingData.billingPeriods.filter(
    ({ propertyId }) => propertyId === selection.propertyId,
  )
  const period = periods.find(({ id }) => id === selection.billingPeriodId)
  const normalizedSearch = search.trim().toLocaleLowerCase('de-DE')
  const filteredPeriods = periods.filter(
    (item) =>
      (statusFilter === 'all' || item.status === statusFilter) &&
      [item.year, item.periodStart, item.periodEnd, item.status]
        .join(' ')
        .toLocaleLowerCase('de-DE')
        .includes(normalizedSearch),
  )

  function statusLabel(status: string) {
    switch (status) {
      case 'DRAFT':
        return 'Entwurf'
      case 'IN_REVIEW':
        return 'In Prüfung'
      case 'READY_FOR_PDF':
        return 'PDF-bereit'
      case 'FINALIZED':
        return 'Finalisiert'
      case 'SUPERSEDED':
        return 'Ersetzt'
      default:
        return status
    }
  }

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
    const number = (name: string) =>
      parseOptionalNumber(formText(form, name)) ?? undefined
    if (
      apply((current) =>
        updateBillingPeriod(current, period.id, {
          year: Number(formText(form, 'year')),
          periodStart: formText(form, 'periodStart'),
          periodEnd: formText(form, 'periodEnd'),
          notes: {
            general: formOptionalText(form, 'noteGeneral'),
            credit: formOptionalText(form, 'noteCredit'),
            additionalPayment: formOptionalText(form, 'noteAdditionalPayment'),
          },
          coverLetter: {
            active: form.has('coverLetterActive'),
            text: formOptionalText(form, 'coverLetterText'),
          },
          heatingDefaults: {
            consumptionSharePercent: number('consumptionSharePercent'),
            baseSharePercent: number('baseSharePercent'),
            baseCostAreaBasis: formOptionalText(form, 'baseCostAreaBasis') as
              'usable_area' | 'heated_area' | undefined,
            solarSharePercent: number('solarSharePercent'),
            operatingElectricitySharePercent: number(
              'operatingElectricitySharePercent',
            ),
            vatMode: formOptionalText(form, 'vatMode') as
              'brutto' | 'netto' | undefined,
            deviationJustification: formOptionalText(
              form,
              'deviationJustification',
            ),
          },
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
      <section className="data-panel" aria-labelledby="periods-title">
        <div className="data-panel__heading">
          <div>
            <p className="section-kicker">Jahresübersicht</p>
            <h2 id="periods-title">Abrechnungsjahre</h2>
          </div>
          <span>Status und Datenumfang je Jahr</span>
        </div>
        <TableToolbar
          searchLabel="Abrechnungsjahre durchsuchen"
          searchValue={search}
          searchPlaceholder="Jahr, Zeitraum oder Status"
          onSearchChange={setSearch}
          filterLabel="Status"
          filterValue={statusFilter}
          onFilterChange={setStatusFilter}
          filterOptions={[
            { value: 'all', label: 'Alle Status' },
            { value: 'DRAFT', label: 'Entwurf' },
            { value: 'IN_REVIEW', label: 'In Prüfung' },
            { value: 'READY_FOR_PDF', label: 'PDF-bereit' },
            { value: 'FINALIZED', label: 'Finalisiert' },
            { value: 'SUPERSEDED', label: 'Ersetzt' },
          ]}
          resultCount={filteredPeriods.length}
          resultLabel="Abrechnungsjahre"
          resultSingularLabel="Abrechnungsjahr"
        />
        {filteredPeriods.length === 0 ? (
          <p className="table-empty-state">
            Kein Abrechnungsjahr für diese Suche gefunden.
          </p>
        ) : (
          <div className="data-table-wrap data-table-wrap--workspace">
            <table
              className="data-table data-table--workspace"
              aria-label="Abrechnungsjahre"
            >
              <thead>
                <tr>
                  <th>Jahr</th>
                  <th>Zeitraum</th>
                  <th>Status</th>
                  <th>Kostenarten</th>
                  <th>Buchungen</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeriods.map((item) => {
                  const categories = data.billingData.costCategories.filter(
                    ({ billingPeriodId }) => billingPeriodId === item.id,
                  )
                  const categoryIds = new Set(categories.map(({ id }) => id))
                  const entryCount = data.billingData.costEntries.filter(
                    ({ costCategoryId }) => categoryIds.has(costCategoryId),
                  ).length
                  const isActive = item.id === selection.billingPeriodId
                  return (
                    <tr key={item.id} className="data-table__interactive-row">
                      <td>
                        <strong>{item.year}</strong>
                      </td>
                      <td>
                        {item.periodStart}
                        <small>bis {item.periodEnd}</small>
                      </td>
                      <td>
                        <span
                          className={`table-status ${
                            item.status === 'READY_FOR_PDF' ||
                            item.status === 'FINALIZED'
                              ? 'table-status--ready'
                              : 'table-status--open'
                          }`}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td>{categories.length}</td>
                      <td>{entryCount}</td>
                      <td className="data-table__actions">
                        <button
                          type="button"
                          aria-label={`${item.year} auswählen`}
                          disabled={isActive}
                          onClick={() => {
                            setEditing(false)
                            setDeleteArmed(false)
                            onSelectionChange({ billingPeriodId: item.id })
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
              <WorkflowField
                label="Allgemeiner Hinweis"
                name="noteGeneral"
                defaultValue={period.notes?.general ?? ''}
              />
              <WorkflowField
                label="Hinweis bei Guthaben"
                name="noteCredit"
                defaultValue={period.notes?.credit ?? ''}
              />
              <WorkflowField
                label="Hinweis bei Nachzahlung"
                name="noteAdditionalPayment"
                defaultValue={period.notes?.additionalPayment ?? ''}
              />
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  name="coverLetterActive"
                  defaultChecked={period.coverLetter?.active ?? false}
                />
                <span>Anschreiben aktiv</span>
              </label>
              <WorkflowField
                label="Text des Anschreibens"
                name="coverLetterText"
                defaultValue={period.coverLetter?.text ?? ''}
              />
              <WorkflowField
                label="Verbrauchskostenanteil Standard"
                name="consumptionSharePercent"
                defaultValue={
                  period.heatingDefaults?.consumptionSharePercent ?? ''
                }
              />
              <WorkflowField
                label="Grundkostenanteil Standard"
                name="baseSharePercent"
                defaultValue={period.heatingDefaults?.baseSharePercent ?? ''}
              />
              <label>
                <span>Grundkostenfläche</span>
                <select
                  name="baseCostAreaBasis"
                  defaultValue={
                    period.heatingDefaults?.baseCostAreaBasis ?? 'heated_area'
                  }
                >
                  <option value="heated_area">Beheizte Fläche</option>
                  <option value="usable_area">Nutzfläche</option>
                </select>
              </label>
              <WorkflowField
                label="Solaranteil Standard"
                name="solarSharePercent"
                defaultValue={period.heatingDefaults?.solarSharePercent ?? ''}
              />
              <WorkflowField
                label="Betriebsstromanteil Standard"
                name="operatingElectricitySharePercent"
                defaultValue={
                  period.heatingDefaults?.operatingElectricitySharePercent ?? ''
                }
              />
              <label>
                <span>Umsatzsteuer-Modus</span>
                <select
                  name="vatMode"
                  defaultValue={period.heatingDefaults?.vatMode ?? 'brutto'}
                >
                  <option value="brutto">Brutto</option>
                  <option value="netto">Netto</option>
                </select>
              </label>
              <WorkflowField
                label="Begründung für Abweichung"
                name="deviationJustification"
                defaultValue={
                  period.heatingDefaults?.deviationJustification ?? ''
                }
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
    </>
  )
}
