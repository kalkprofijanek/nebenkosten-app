import {
  calculateMonthlyConsumptionInformation,
  type MonthlyConsumptionInformation,
  type MonthlyTenantConsumption,
} from '@nebenkosten/core'
import {
  MissingShippingAddressError,
  buildMonthlyInformationStatement,
  monthlyInformationFileName,
} from '@nebenkosten/pdf'
import type {
  AppDataFile,
  MonthlyInformationChannel,
} from '@nebenkosten/schema'
import { useMemo, useState, type FormEvent } from 'react'
import { tenantDisplayName } from '../prepayments/overview'
import {
  blobBytes,
  downloadBlob,
  renderPdfBlob,
  renderZipBlob,
} from '../pdf/render'
import {
  effectiveMonthlyInformationChannel,
  tenancyEmailAddresses,
} from './delivery'
import { monthLabel, monthlyInformationMailto } from './dispatch-mail'
import {
  findMonthlyDispatch,
  recordMonthlyDispatch,
  removeMonthlyDispatch,
  summarizeMonthlyDispatch,
} from './dispatch-commands'
import { MONTH_PATTERN, germanDate, monthBounds } from './format'

type Apply = (transform: (data: AppDataFile) => AppDataFile) => boolean

interface Props {
  readonly data: AppDataFile
  readonly propertyId: string
  readonly month: string
  readonly onApply: Apply
  readonly today: () => Date
  readonly createId: () => string
}

interface DispatchRow {
  readonly tenancyId: string
  readonly tenant: MonthlyTenantConsumption
  readonly name: string
  readonly unitLabel: string
  readonly channel: MonthlyInformationChannel
  readonly addresses: readonly string[]
  readonly fileName: string
  readonly error: string | null
}

interface ExceptionDraft {
  readonly checked: boolean
  readonly note: string
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function errorText(caught: unknown, fallback: string): string {
  if (caught instanceof MissingShippingAddressError)
    return 'Versandadresse fehlt – bitte beim Mietverhältnis bzw. an der Wohnung eintragen.'
  return caught instanceof Error ? caught.message : fallback
}

function buildRows(
  data: AppDataFile,
  info: MonthlyConsumptionInformation,
  generatedAt: Date,
): DispatchRow[] {
  const units = new Map(data.masterData.units.map((unit) => [unit.id, unit]))
  const seen = new Set<string>()
  const tenants = info.tenants.filter(({ tenancyId }) => {
    if (tenancyId == null || seen.has(tenancyId)) return false
    seen.add(tenancyId)
    return true
  })
  const perUnit = new Map<string, number>()
  for (const { unitId } of tenants)
    perUnit.set(unitId, (perUnit.get(unitId) ?? 0) + 1)
  return tenants.map((tenant) => {
    const tenancyId = tenant.tenancyId!
    const name = tenantDisplayName(data, tenancyId)
    const unitLabel = units.get(tenant.unitId)?.label ?? 'Wohnung'
    // Mieterwechsel im Monat: Name ergänzen, damit Dateinamen eindeutig sind.
    const fileName = monthlyInformationFileName(
      info.month,
      (perUnit.get(tenant.unitId) ?? 0) > 1
        ? `${unitLabel} ${name}`
        : unitLabel,
    )
    let error: string | null = null
    try {
      buildMonthlyInformationStatement({
        appData: data,
        information: info,
        tenant,
        generatedAt,
      })
    } catch (caught) {
      error = errorText(caught, 'Das PDF kann nicht erzeugt werden.')
    }
    return {
      tenancyId,
      tenant,
      name,
      unitLabel,
      channel: effectiveMonthlyInformationChannel(data, tenancyId),
      addresses: tenancyEmailAddresses(data, tenancyId),
      fileName,
      error,
    }
  })
}

/**
 * Versand der Monatsinformation (ADR-0014, Schritt 3): PDF je Mieter,
 * ZIP, E-Mail-Entwurf je Mieter und Versandprotokoll des Monats.
 */
export function MonthlyDispatch({
  data,
  propertyId,
  month,
  onApply,
  today,
  createId,
}: Props) {
  const validMonth = MONTH_PATTERN.test(month)
  const property = data.masterData.properties.find(
    ({ id }) => id === propertyId,
  )
  const since = property?.remoteReading?.since
  const senderName =
    data.masterData.ownerCompanies.find(
      ({ id }) => id === property?.ownerCompanyId,
    )?.name ?? null
  const remoteReadable =
    validMonth && since != null && since <= monthBounds(month).to
  const info = useMemo(
    () =>
      remoteReadable
        ? calculateMonthlyConsumptionInformation(data, { propertyId, month })
        : null,
    [data, propertyId, month, remoteReadable],
  )
  const rows = useMemo(
    () => (info ? buildRows(data, info, today()) : []),
    [data, info, today],
  )
  const [dispatchedOn, setDispatchedOn] = useState(() => isoDate(today()))
  const [exceptions, setExceptions] = useState<Record<string, ExceptionDraft>>(
    {},
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  if (!validMonth) return null
  const dispatch = findMonthlyDispatch(data, propertyId, month)

  const heading = (
    <h3 id="monthly-dispatch-title">Versand {monthLabel(month)}</h3>
  )
  if (!remoteReadable || !info)
    return (
      <section
        className="workflow-card"
        aria-labelledby="monthly-dispatch-title"
      >
        {heading}
        <p role="note">
          Für dieses Objekt ist im gewählten Monat keine Fernablesbarkeit
          erfasst (Objekt bearbeiten → ‚Erfassungsgeräte fernablesbar seit‘).
        </p>
      </section>
    )

  function apply(transform: (current: AppDataFile) => AppDataFile): boolean {
    setError(null)
    try {
      const accepted = onApply(transform)
      if (!accepted) setError('Die Änderung konnte nicht gespeichert werden.')
      return accepted
    } catch (caught) {
      setError(
        errorText(caught, 'Die Eingabe konnte nicht verarbeitet werden.'),
      )
      return false
    }
  }

  async function run(task: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await task()
    } catch (caught) {
      setError(errorText(caught, 'Das PDF konnte nicht erzeugt werden.'))
    } finally {
      setBusy(false)
    }
  }

  const documentFor = (row: DispatchRow) =>
    buildMonthlyInformationStatement({
      appData: data,
      information: info,
      tenant: row.tenant,
      generatedAt: today(),
    })

  const downloadOne = (row: DispatchRow) =>
    run(async () => {
      downloadBlob(await renderPdfBlob(documentFor(row)), row.fileName)
    })

  const printable = rows.filter(({ error: rowError }) => rowError === null)
  const downloadZip = () =>
    run(async () => {
      const entries = []
      for (const row of printable)
        entries.push({
          fileName: row.fileName,
          bytes: await blobBytes(await renderPdfBlob(documentFor(row))),
        })
      downloadBlob(
        await renderZipBlob(entries),
        `Verbrauchsinformationen_${month}.zip`,
      )
    })

  function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const list = Object.entries(exceptions)
      .filter(([, draft]) => draft.checked)
      .map(([tenancyId, draft]) => ({ tenancyId, note: draft.note }))
    if (
      apply((current) =>
        recordMonthlyDispatch(current, {
          propertyId,
          month,
          dispatchedOn,
          exceptions: list,
          createId,
        }),
      )
    )
      setExceptions({})
  }

  function remove() {
    if (
      dispatch &&
      apply((current) => removeMonthlyDispatch(current, dispatch.id))
    )
      setConfirmRemove(false)
  }

  const setException = (tenancyId: string, patch: Partial<ExceptionDraft>) =>
    setExceptions((current) => ({
      ...current,
      [tenancyId]: {
        checked: current[tenancyId]?.checked ?? false,
        note: current[tenancyId]?.note ?? '',
        ...patch,
      },
    }))

  const summary = dispatch ? summarizeMonthlyDispatch(dispatch) : null
  const entryOf = (tenancyId: string) =>
    dispatch?.entries.find((entry) => entry.tenancyId === tenancyId)

  return (
    <section className="workflow-card" aria-labelledby="monthly-dispatch-title">
      {heading}
      <p>
        Die App verschickt nichts selbst. PDFs zuerst herunterladen (einzeln
        oder als ZIP) und an den E-Mail-Entwurf anhängen; Briefe ausdrucken und
        versenden. Je Mieter gibt es einen eigenen E-Mail-Entwurf, damit keine
        Verbrauchswerte anderer Mieter sichtbar werden.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {rows.length === 0 ? (
        <p>Für diesen Monat sind keine Mieter-Nutzungen erfasst.</p>
      ) : (
        <form onSubmit={record} noValidate aria-label="Versand protokollieren">
          <div className="data-table-wrap data-table-wrap--workspace">
            <table
              className="data-table data-table--workspace"
              aria-label="Versandliste des Monats"
            >
              <thead>
                <tr>
                  <th scope="col">Mieter</th>
                  <th scope="col">Wohnung</th>
                  <th scope="col">Versandweg</th>
                  <th scope="col">Dokument</th>
                  <th scope="col">{dispatch ? 'Status' : 'Ausnahme'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const draft = exceptions[row.tenancyId]
                  const entry = entryOf(row.tenancyId)
                  return (
                    <tr key={row.tenancyId}>
                      <th scope="row">{row.name}</th>
                      <td>{row.unitLabel}</td>
                      <td>
                        {row.channel === 'email'
                          ? row.addresses.join(', ')
                          : 'Brief'}
                      </td>
                      <td>
                        {row.error ? (
                          <span role="alert">{row.error}</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`PDF ${row.name}`}
                              onClick={() => void downloadOne(row)}
                            >
                              PDF
                            </button>
                            {row.channel === 'email' ? (
                              <>
                                {' '}
                                <a
                                  href={monthlyInformationMailto({
                                    addresses: row.addresses,
                                    salutationName:
                                      row.name === 'Name nicht erfasst'
                                        ? null
                                        : row.name,
                                    month,
                                    unitLabel: row.unitLabel,
                                    fileName: row.fileName,
                                    senderName,
                                  })}
                                  aria-label={`E-Mail-Entwurf ${row.name}`}
                                >
                                  E-Mail-Entwurf
                                </a>
                              </>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td>
                        {dispatch ? (
                          entry?.status === 'not_sent' ? (
                            <>nicht versendet: {entry.note}</>
                          ) : entry ? (
                            'versendet'
                          ) : (
                            'nicht im Protokoll'
                          )
                        ) : (
                          <>
                            <label className="checkbox-field">
                              <input
                                type="checkbox"
                                checked={draft?.checked ?? false}
                                onChange={(event) =>
                                  setException(row.tenancyId, {
                                    checked: event.target.checked,
                                  })
                                }
                                aria-label={`${row.name} nicht versendet`}
                              />
                              <span>nicht versendet</span>
                            </label>
                            {draft?.checked ? (
                              <label>
                                <span>Begründung</span>
                                <input
                                  value={draft.note}
                                  required
                                  aria-label={`Begründung ${row.name}`}
                                  onChange={(event) =>
                                    setException(row.tenancyId, {
                                      note: event.target.value,
                                    })
                                  }
                                />
                              </label>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p>
            <button
              type="button"
              disabled={busy || printable.length === 0}
              onClick={() => void downloadZip()}
            >
              Alle PDFs als ZIP
            </button>
          </p>
          {dispatch && summary ? (
            <p role="status">
              Versendet am {germanDate(dispatch.dispatchedOn)} ({summary.email}{' '}
              per E-Mail, {summary.letter} per Brief, {summary.notSent} nicht
              versendet){' '}
              {confirmRemove ? (
                <>
                  <button type="button" onClick={remove}>
                    Entfernen bestätigen
                  </button>{' '}
                  <button type="button" onClick={() => setConfirmRemove(false)}>
                    Abbrechen
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmRemove(true)}>
                  Protokoll entfernen
                </button>
              )}
            </p>
          ) : (
            <p>
              <label>
                <span>Monat versendet am</span>
                <input
                  type="date"
                  value={dispatchedOn}
                  onChange={(event) => setDispatchedOn(event.target.value)}
                />
              </label>{' '}
              <button type="submit">Versand protokollieren</button>
            </p>
          )}
        </form>
      )}
    </section>
  )
}
