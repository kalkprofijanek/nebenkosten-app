import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { useEffect, useMemo, useState } from 'react'
import { parseOptionalNumber } from '../../app/form-parsers'
import {
  OccupancyCommandError,
  updateOccupancyConsumption,
} from '../occupancies/commands'
import { explainConsumptionEstimate } from '../occupancies/estimate-consumption'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'
import {
  buildConsumptionOverview,
  ESTIMATED_SHARE_LIMIT,
  needsEstimate,
  type ConsumptionRow,
  type ConsumptionStatus,
} from './overview'

type Apply = (transform: (data: AppDataFile) => AppDataFile) => boolean

interface ConsumptionRouteProps {
  readonly data: AppDataFile
  readonly billingPeriodId: string | null
  /** Rohes Update; die Bearbeitungssperre prüft die Seite selbst. */
  readonly onApply: Apply
}

interface Feedback {
  readonly kind: 'status' | 'alert'
  readonly text: string
}

interface Draft {
  readonly meterNumber: string
  readonly startValue: string
  readonly startDate: string
  readonly endValue: string
  readonly endDate: string
  readonly units: string
  readonly estimated: boolean
  readonly reason: string
}

const STATUS_LABELS: Readonly<Record<ConsumptionStatus, string>> = {
  measured: 'erfasst',
  estimated: 'geschätzt',
  zero: '0 – prüfen',
  missing: 'fehlt',
}

const decimal = (value: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(value)

const input = (value: number | null | undefined) =>
  value == null ? '' : String(value).replace('.', ',')

function date(value: string): string {
  return value.split('-').reverse().join('.')
}

function initialDraft(row: ConsumptionRow): Draft {
  return {
    meterNumber: row.reading?.meterNumber ?? '',
    startValue: input(row.reading?.startValue),
    startDate: row.reading?.startDate ?? '',
    endValue: input(row.reading?.endValue),
    endDate: row.reading?.endDate ?? '',
    units: input(row.units),
    estimated: row.estimated,
    reason: row.estimateReason ?? '',
  }
}

function sameDraft(left: Draft, right: Draft) {
  return (Object.keys(left) as (keyof Draft)[]).every(
    (key) => left[key] === right[key],
  )
}

function parse(value: string, label: string): number | undefined {
  try {
    return parseOptionalNumber(value) ?? undefined
  } catch {
    throw new OccupancyCommandError(`${label}: Bitte eine gültige Zahl.`)
  }
}

function draftDifference(draft: Draft): number | null {
  try {
    const start = parseOptionalNumber(draft.startValue)
    const end = parseOptionalNumber(draft.endValue)
    if (start === null || end === null) return null
    return Math.round((end - start) * 1000) / 1000
  } catch {
    return null
  }
}

/** Speicherbare Eingabe für `updateOccupancyConsumption`. */
function commandInput(occupancyPeriodId: string, draft: Draft) {
  const reading = {
    meterNumber: draft.meterNumber.trim() || undefined,
    startValue: parse(draft.startValue, 'Stand alt'),
    startDate: draft.startDate || undefined,
    endValue: parse(draft.endValue, 'Stand neu'),
    endDate: draft.endDate || undefined,
  }
  const units = parse(draft.units, 'Verbrauchseinheiten')
  if (draft.estimated && !draft.reason.trim())
    throw new OccupancyCommandError(
      'Für einen geschätzten Wert bitte den Schätzgrund angeben.',
    )
  return {
    occupancyPeriodId,
    consumptionUnits: units,
    consumptionUnitsEstimated: draft.estimated || undefined,
    consumptionUnitsEstimateReason: draft.estimated
      ? draft.reason.trim()
      : undefined,
    heatMeterReading: Object.values(reading).some((value) => value != null)
      ? reading
      : undefined,
  }
}

function useApply(onApply: Apply, periodId: string) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  function run(transform: (data: AppDataFile) => AppDataFile, done: string) {
    setFeedback(null)
    try {
      if (
        !onApply((current) =>
          applyEditableBillingPeriodChange(current, periodId, transform),
        )
      ) {
        setFeedback({
          kind: 'alert',
          text: 'Die Änderung konnte nicht gespeichert werden.',
        })
        return false
      }
      setFeedback({ kind: 'status', text: done })
      return true
    } catch (caught) {
      setFeedback({
        kind: 'alert',
        text:
          caught instanceof Error
            ? caught.message
            : 'Die Eingabe konnte nicht verarbeitet werden.',
      })
      return false
    }
  }
  return { feedback, run }
}

function requestedOccupancyId(): string | null {
  return new URLSearchParams(globalThis.location?.hash.split('?')[1] ?? '').get(
    'occupancy',
  )
}

function ConsumptionTableRow({
  row,
  locked,
  highlighted,
  onSave,
}: {
  readonly row: ConsumptionRow
  readonly locked: boolean
  readonly highlighted: boolean
  readonly onSave: (row: ConsumptionRow, draft: Draft) => void
}) {
  const initial = initialDraft(row)
  const [draft, setDraft] = useState(initial)
  const dirty = !sameDraft(draft, initial)
  const label = `${row.unitLabel} ${row.tenantName}`
  const set = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }))
  const difference = draftDifference(draft)
  const draftUnits = (() => {
    try {
      return parseOptionalNumber(draft.units)
    } catch {
      return null
    }
  })()
  const open =
    !row.meteredCircuit && !draft.estimated && !((draftUnits ?? 0) > 0)
  const estimate = row.estimate.ok ? row.estimate.estimate : null
  const status: ConsumptionStatus = dirty
    ? draft.units.trim() === ''
      ? 'missing'
      : draft.estimated
        ? 'estimated'
        : (draftUnits ?? 0) > 0
          ? 'measured'
          : 'zero'
    : row.status
  const textField = (
    key: 'meterNumber' | 'startValue' | 'endValue' | 'units',
    name: string,
    className = 'consumption-number',
  ) =>
    locked ? (
      <span>{draft[key] || '—'}</span>
    ) : (
      <input
        className={className}
        aria-label={`${name} ${label}`}
        inputMode={key === 'meterNumber' ? 'text' : 'decimal'}
        value={draft[key]}
        onChange={(event) => set({ [key]: event.target.value })}
      />
    )
  const dateField = (key: 'startDate' | 'endDate', name: string) =>
    locked ? (
      draft[key] ? (
        <small>{date(draft[key])}</small>
      ) : null
    ) : (
      <input
        type="date"
        aria-label={`${name} ${label}`}
        value={draft[key]}
        onChange={(event) => set({ [key]: event.target.value })}
      />
    )

  return (
    <tr
      id={`verbrauch-${row.occupancy.id}`}
      className={highlighted ? 'consumption-row--highlighted' : undefined}
    >
      <th scope="row">
        {row.unitLabel}
        <strong>{row.tenantName}</strong>
        <small>
          {date(row.from)} – {date(row.to)}
        </small>
        <small>
          {row.buildingName}
          {row.areaSqm ? ` · ${decimal(row.areaSqm)} m²` : ' · Fläche fehlt'}
        </small>
      </th>
      <td>{textField('meterNumber', 'Zählernummer', 'consumption-meter')}</td>
      <td>
        <div className="consumption-reading">
          {textField('startValue', 'Stand alt')}
          {dateField('startDate', 'Datum alt')}
        </div>
      </td>
      <td>
        <div className="consumption-reading">
          {textField('endValue', 'Stand neu')}
          {dateField('endDate', 'Datum neu')}
        </div>
      </td>
      <td className="data-table__amount">
        {difference === null ? '—' : decimal(difference)}
        {difference !== null && difference < 0 ? (
          <small role="alert">Stand neu kleiner als Stand alt</small>
        ) : null}
        {!locked &&
        difference !== null &&
        difference >= 0 &&
        (draftUnits === null ||
          draft.estimated ||
          Math.abs(draftUnits - difference) > 0.0005) ? (
          <button
            className="button button--quiet"
            type="button"
            aria-label={`Verbrauch aus Zählerständen übernehmen ${label}`}
            onClick={() =>
              set({ units: input(difference), estimated: false, reason: '' })
            }
          >
            übernehmen →
          </button>
        ) : null}
      </td>
      <td className="consumption-units-cell">
        {textField('units', 'Verbrauchseinheiten')}
        {!locked ? (
          <label className="consumption-estimated">
            <input
              type="checkbox"
              aria-label={`geschätzt ${label}`}
              checked={draft.estimated}
              onChange={(event) => set({ estimated: event.target.checked })}
            />
            geschätzt
          </label>
        ) : null}
        {locked ? null : (
          <div className="consumption-actions">
            {open ? (
              estimate ? (
                <button
                  className="button"
                  type="button"
                  aria-label={`Verbrauch schätzen ${label}`}
                  title={estimate.reason}
                  onClick={() =>
                    set({
                      units: input(estimate.value),
                      estimated: true,
                      reason: estimate.reason,
                    })
                  }
                >
                  Schätzen ({decimal(estimate.value)})
                </button>
              ) : (
                <small>
                  Schätzung nicht möglich:{' '}
                  {row.estimate.ok ? '' : row.estimate.problem}
                </small>
              )
            ) : null}
          </div>
        )}
      </td>
      <td className="consumption-status-cell">
        <span className={`consumption-status consumption-status--${status}`}>
          {STATUS_LABELS[status]}
        </span>
        {row.meteredCircuit ? (
          <small>
            kWh-Messverbrauch am Heizkreis aktiv; Wert wird nicht verwendet.
          </small>
        ) : null}
        {!dirty && row.readingMismatch ? (
          <small role="alert">
            {row.estimated
              ? 'Zählerdifferenz weicht von der Schätzung ab; in der Freigabe bestätigen.'
              : 'Zählerdifferenz passt nicht zum Verbrauch.'}
          </small>
        ) : null}
        {draft.estimated ? (
          locked ? (
            <small>{draft.reason}</small>
          ) : (
            <textarea
              className="consumption-reason"
              aria-label={`Schätzgrund ${label}`}
              rows={3}
              value={draft.reason}
              onChange={(event) => set({ reason: event.target.value })}
            />
          )
        ) : null}
        {locked ? null : (
          <div className="consumption-actions">
            <button
              className="button button--quiet"
              type="button"
              disabled={!dirty}
              aria-label={`Verbrauch speichern ${label}`}
              onClick={() => onSave(row, draft)}
            >
              Speichern
            </button>
            {dirty ? (
              <button
                className="button button--quiet"
                type="button"
                aria-label={`Änderung verwerfen ${label}`}
                onClick={() => setDraft(initial)}
              >
                Verwerfen
              </button>
            ) : null}
          </div>
        )}
      </td>
    </tr>
  )
}

function ConsumptionTable({
  data,
  period,
  onApply,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
  readonly onApply: Apply
}) {
  const overview = useMemo(
    () => buildConsumptionOverview(data, period.id)!,
    [data, period.id],
  )
  const { feedback, run } = useApply(onApply, period.id)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [highlightId] = useState(requestedOccupancyId)
  const locked = period.status !== 'DRAFT'
  const estimable = overview.rows.filter(
    (row) => needsEstimate(row) && row.estimate.ok,
  )
  const rows = onlyOpen
    ? overview.rows.filter((row) => needsEstimate(row) || row.readingMismatch)
    : overview.rows

  useEffect(() => {
    if (!highlightId) return
    document
      .getElementById(`verbrauch-${highlightId}`)
      ?.scrollIntoView?.({ block: 'center' })
  }, [highlightId])

  function save(row: ConsumptionRow, draft: Draft) {
    run(
      (current) =>
        updateOccupancyConsumption(
          current,
          commandInput(row.occupancy.id, draft),
        ),
      `Verbrauch für ${row.unitLabel} (${row.tenantName}) gespeichert.`,
    )
  }

  function estimateAll() {
    const ids = estimable.map(({ occupancy }) => occupancy.id)
    run((current) => {
      // Schätzungen nutzen nur gemessene Werte; die Reihenfolge ist egal.
      let next = current
      for (const id of ids) {
        const result = explainConsumptionEstimate(current, id)
        const occupancy = current.billingData.occupancyPeriods.find(
          (item) => item.id === id,
        )
        if (!result.ok || !occupancy) continue
        next = updateOccupancyConsumption(next, {
          occupancyPeriodId: id,
          consumptionUnits: result.estimate.value,
          consumptionUnitsEstimated: true,
          consumptionUnitsEstimateReason: result.estimate.reason,
          heatMeterReading: occupancy.heatMeterReading ?? undefined,
        })
      }
      return next
    }, `${ids.length} fehlende Verbrauchswerte geschätzt und gespeichert.`)
  }

  return (
    <section aria-labelledby="consumption-title">
      <header className="section-heading">
        <div>
          <p className="section-kicker">Abrechnungsjahr {period.year}</p>
          <h2 id="consumption-title">Zählerstände und Verbrauchseinheiten</h2>
        </div>
      </header>
      {locked ? (
        <p className="calculation-warnings">
          Das Abrechnungsjahr {period.year} ist gesperrt. Die Verbrauchswerte
          sind nur lesbar; öffne unter „Freigabe“ kontrolliert die Prüfung, um
          sie zu ändern.
        </p>
      ) : (
        <p>
          Stand neu − Stand alt ergibt den Verbrauch. Fehlt ein Wert oder ist er
          0, schätzt „Schätzen“ ihn nach § 9a HeizKV aus dem mittleren Verbrauch
          je m² und Tag der gemessenen Nutzungen desselben Gebäudes. Erst
          „Speichern“ übernimmt eine Zeile; Änderungen verwerfen einen
          gespeicherten Rechenstand dieses Jahres.
        </p>
      )}
      {overview.estimatedShares
        .filter(({ estimatedShare }) => estimatedShare > ESTIMATED_SHARE_LIMIT)
        .map((share) => (
          <p
            key={share.buildingId}
            className="calculation-warnings"
            role="alert"
          >
            {share.buildingName}: {Math.round(share.estimatedShare * 100)} % der
            Fläche (zeitanteilig) sind geschätzt. Nach § 9a Abs. 2 HeizKV sind
            die Kosten bei mehr als 25 % nur nach Fläche oder umbautem Raum zu
            verteilen – bitte prüfen. Die Berechnung stellt das nicht
            automatisch um.
          </p>
        ))}
      <div className="consumption-toolbar">
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(event) => setOnlyOpen(event.target.checked)}
          />
          <span>
            Nur offene und abweichende Zeilen ({overview.openCount} offen)
          </span>
        </label>
        {locked ? null : (
          <button
            className="button"
            type="button"
            disabled={estimable.length === 0}
            onClick={estimateAll}
          >
            Alle fehlenden schätzen ({estimable.length})
          </button>
        )}
      </div>
      {feedback ? <p role={feedback.kind}>{feedback.text}</p> : null}
      {overview.rows.length === 0 ? (
        <p>Für dieses Abrechnungsjahr sind keine Mieter erfasst.</p>
      ) : (
        <div
          className="data-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Verbrauch horizontal scrollen"
        >
          <table
            className="data-table consumption-table"
            aria-label="Verbrauch"
          >
            <thead>
              <tr>
                <th scope="col">Wohnung / Nutzer</th>
                <th scope="col">Zähler</th>
                <th scope="col">Stand alt</th>
                <th scope="col">Stand neu</th>
                <th scope="col">Differenz</th>
                <th scope="col">Verbrauchseinheiten</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ConsumptionTableRow
                  key={`${row.occupancy.id}:${JSON.stringify([
                    row.units,
                    row.estimated,
                    row.estimateReason,
                    row.reading,
                  ])}`}
                  row={row}
                  locked={locked}
                  highlighted={row.occupancy.id === highlightId}
                  onSave={save}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        <small>
          Kalt- und Warmwasser sowie Leerstände werden weiterhin unter „Nutzer“
          gepflegt.
        </small>
      </p>
    </section>
  )
}

export function ConsumptionRoute({
  data,
  billingPeriodId,
  onApply,
}: ConsumptionRouteProps) {
  if (billingPeriodId === null)
    return <p role="alert">Bitte zuerst ein Abrechnungsjahr auswählen.</p>
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period)
    return (
      <p role="alert">
        Das ausgewählte Abrechnungsjahr ist nicht mehr vorhanden.
      </p>
    )
  return (
    <ConsumptionTable
      key={period.id}
      data={data}
      period={period}
      onApply={onApply}
    />
  )
}
