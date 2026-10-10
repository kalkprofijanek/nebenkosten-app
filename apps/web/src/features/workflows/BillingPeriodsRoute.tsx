import { useEffect, useRef, useState, type FormEvent } from 'react'
import { postalCodeFromAddress } from '@nebenkosten/core'
import { climateFactorSchema, type ClimateFactor } from '@nebenkosten/schema'
import { parseDwdClimateCsv } from '@nebenkosten/import-export'
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
  const [climateEnabled, setClimateEnabled] = useState(false)
  const [climatePostalCode, setClimatePostalCode] = useState('')
  const [climateFactor, setClimateFactor] = useState('')
  const [climateStart, setClimateStart] = useState('')
  const [climateEnd, setClimateEnd] = useState('')
  const [climateSource, setClimateSource] = useState('')
  const [climateImportMessage, setClimateImportMessage] = useState('')
  const climateImportRequest = useRef(0)
  const climateImportContext = useRef('')
  const periods = data.billingData.billingPeriods.filter(
    ({ propertyId }) => propertyId === selection.propertyId,
  )
  const period = periods.find(({ id }) => id === selection.billingPeriodId)
  const property = data.masterData.properties.find(
    ({ id }) => id === selection.propertyId,
  )
  function beginEditing() {
    if (!period) return
    const factor = period.climateFactor
    setClimateEnabled(factor != null)
    setClimatePostalCode(
      factor?.postalCode ??
        postalCodeFromAddress(property?.address?.postalCodeAndCity ?? '') ??
        '',
    )
    setClimateFactor(factor ? String(factor.factor).replace('.', ',') : '')
    setClimateStart(factor?.periodStart ?? period.periodStart)
    setClimateEnd(factor?.periodEnd ?? period.periodEnd)
    setClimateSource(factor?.source ?? 'DWD, Klimafaktoren (Referenz Potsdam)')
    setClimateImportMessage('')
    setEditing(true)
  }
  useEffect(() => {
    climateImportRequest.current += 1
    climateImportContext.current = `${editing ? 'edit' : 'view'}:${period?.id ?? ''}`
  }, [editing, period?.id])
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
    let climateFactorInput: ClimateFactor | null = null
    if (climateEnabled) {
      let parsedFactor: number | null
      try {
        parsedFactor = parseOptionalNumber(climateFactor)
      } catch {
        setError('Klimafaktor: Bitte eine gültige positive Zahl eingeben.')
        return
      }
      const parsed = climateFactorSchema.safeParse({
        postalCode: climatePostalCode,
        factor: parsedFactor,
        periodStart: climateStart,
        periodEnd: climateEnd,
        source: climateSource,
      })
      if (!parsed.success) {
        setError('Klimafaktor: Bitte PLZ, Faktor, Zeitraum und Quelle prüfen.')
        return
      }
      if (
        climateStart !== formText(form, 'periodStart') ||
        climateEnd !== formText(form, 'periodEnd')
      ) {
        setError(
          'Der Klimafaktor-Zeitraum muss exakt dem Abrechnungszeitraum entsprechen.',
        )
        return
      }
      climateFactorInput = parsed.data
    }
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
          climateFactor: climateFactorInput,
        }),
      )
    )
      setEditing(false)
  }

  async function importClimateCsv(
    file: File | undefined,
    form: HTMLFormElement | null,
  ) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setClimateImportMessage('Die CSV-Datei ist größer als 5 MB.')
      return
    }
    if (!form || !period) return
    const request = ++climateImportRequest.current
    const context = climateImportContext.current
    const postalCode = climatePostalCode
    try {
      const imported = parseDwdClimateCsv(await file.text())
      if (
        request !== climateImportRequest.current ||
        context !== climateImportContext.current
      )
        return
      const factor = imported.factors.get(postalCode)
      if (factor === undefined) {
        setClimateImportMessage(
          `Für die Postleitzahl ${postalCode || '—'} enthält die Datei keinen Faktor.`,
        )
        return
      }
      const periodStart = (
        form.elements.namedItem('periodStart') as HTMLInputElement | null
      )?.value
      const periodEnd = (
        form.elements.namedItem('periodEnd') as HTMLInputElement | null
      )?.value
      if (
        imported.periodStart !== periodStart ||
        imported.periodEnd !== periodEnd
      ) {
        setClimateImportMessage(
          'Der DWD-Zeitraum muss exakt dem Abrechnungszeitraum entsprechen.',
        )
        return
      }
      setClimateFactor(String(factor).replace('.', ','))
      setClimateStart(imported.periodStart)
      setClimateEnd(imported.periodEnd)
      setClimateSource(imported.source)
      setClimateImportMessage('DWD-Faktor übernommen; bitte Angaben prüfen.')
    } catch (caught) {
      if (
        request !== climateImportRequest.current ||
        context !== climateImportContext.current
      )
        return
      setClimateImportMessage(
        caught instanceof Error
          ? caught.message
          : 'CSV-Datei konnte nicht gelesen werden.',
      )
    }
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
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : beginEditing())}
            >
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
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  name="climateFactorEnabled"
                  checked={climateEnabled}
                  onChange={(event) => setClimateEnabled(event.target.checked)}
                />
                <span>Klimafaktor erfassen</span>
              </label>
              {climateEnabled ? (
                <>
                  <p>
                    Manueller oder importierter Referenzwert; kein Standardwert
                    wird vorausgefüllt.
                  </p>
                  <label>
                    <span>Postleitzahl Klimafaktor</span>
                    <input
                      aria-label="Postleitzahl Klimafaktor"
                      value={climatePostalCode}
                      onChange={(event) =>
                        setClimatePostalCode(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>DWD-Klimafaktor</span>
                    <input
                      aria-label="DWD-Klimafaktor"
                      inputMode="decimal"
                      value={climateFactor}
                      onChange={(event) => setClimateFactor(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Beginn Klimafaktor-Zeitraum</span>
                    <input
                      type="date"
                      value={climateStart}
                      onChange={(event) => setClimateStart(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Ende Klimafaktor-Zeitraum</span>
                    <input
                      type="date"
                      value={climateEnd}
                      onChange={(event) => setClimateEnd(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Quelle Klimafaktor</span>
                    <input
                      aria-label="Quelle Klimafaktor"
                      value={climateSource}
                      onChange={(event) => setClimateSource(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>DWD-Klimafaktor-CSV importieren</span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) =>
                        void importClimateCsv(
                          event.currentTarget.files?.[0],
                          event.currentTarget.form,
                        )
                      }
                    />
                  </label>
                  {climateImportMessage ? (
                    <p role="status">{climateImportMessage}</p>
                  ) : null}
                </>
              ) : null}
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
