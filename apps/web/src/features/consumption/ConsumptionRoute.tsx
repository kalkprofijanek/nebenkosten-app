import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { useEffect, useMemo, useState } from 'react'
import { parseOptionalNumber } from '../../app/form-parsers'
import {
  OccupancyCommandError,
  updateOccupancyConsumption,
  updateOccupancyPreviousConsumption,
} from '../occupancies/commands'
import { explainConsumptionEstimate } from '../occupancies/estimate-consumption'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'
import {
  buildConsumptionOverview,
  ESTIMATED_SHARE_LIMIT,
  needsEstimate,
  section9aHint,
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
  readonly coldWater: string
  readonly warmWater: string
}

interface PreviousConsumptionDraft {
  readonly year: string
  readonly value: string
  readonly source: string
  readonly climateFactor: string
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
    coldWater: input(row.coldWater),
    warmWater: input(row.warmWater),
  }
}

function previousConsumptionDraft(
  row: ConsumptionRow,
): PreviousConsumptionDraft {
  const previous = row.occupancy.previousConsumption
  return {
    year: previous ? String(previous.year) : '',
    value: input(previous?.value),
    source: previous?.source ?? '',
    climateFactor: input(previous?.climateFactor),
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
    coldWater: parse(draft.coldWater, 'Kaltwasser'),
    warmWater: parse(draft.warmWater, 'Warmwasser'),
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
  onSavePrevious,
  onEstimate,
}: {
  readonly row: ConsumptionRow
  readonly locked: boolean
  readonly highlighted: boolean
  readonly onSave: (row: ConsumptionRow, draft: Draft) => void
  readonly onSavePrevious: (
    row: ConsumptionRow,
    draft: PreviousConsumptionDraft,
  ) => boolean
  readonly onEstimate: (row: ConsumptionRow) => void
}) {
  const initial = initialDraft(row)
  const [draft, setDraft] = useState(initial)
  const initialPrevious = previousConsumptionDraft(row)
  const [previousDraft, setPreviousDraft] = useState(initialPrevious)
  const [editingPrevious, setEditingPrevious] = useState(false)
  const dirty = !sameDraft(draft, initial)
  const label = `${row.unitLabel} ${row.tenantName}`
  const set = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }))
  const setPrevious = (patch: Partial<PreviousConsumptionDraft>) =>
    setPreviousDraft((current) => ({ ...current, ...patch }))
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
    key:
      | 'meterNumber'
      | 'startValue'
      | 'endValue'
      | 'units'
      | 'coldWater'
      | 'warmWater',
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
          {textField(
            'startValue',
            `Stand alt${row.readingUsesKwh ? ' (kWh)' : ''}`,
          )}
          {dateField('startDate', 'Datum alt')}
        </div>
      </td>
      <td>
        <div className="consumption-reading">
          {textField(
            'endValue',
            `Stand neu${row.readingUsesKwh ? ' (kWh)' : ''}`,
          )}
          {dateField('endDate', 'Datum neu')}
          {difference === null ? null : (
            <span className="consumption-difference">
              = {decimal(difference)}
              {row.readingUsesKwh ? ' kWh' : ''}
            </span>
          )}
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
        </div>
      </td>
      <td className="consumption-units-cell">
        {textField('units', 'HKV-Verbrauchseinheiten')}
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
                  onClick={() => {
                    set({
                      units: input(estimate.value),
                      estimated: true,
                      reason: estimate.reason,
                    })
                    onEstimate(row)
                  }}
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
      <td>
        <div className="consumption-reading">
          {textField('coldWater', 'Kaltwasser', 'consumption-water')}
          {textField('warmWater', 'Warmwasser', 'consumption-water')}
        </div>
      </td>
      <td>
        <div className="consumption-reading">
          {!editingPrevious ? (
            <>
              <span>
                {row.occupancy.previousConsumption
                  ? `${decimal(row.occupancy.previousConsumption.value)} (${row.occupancy.previousConsumption.year})`
                  : '—'}
              </span>
              {row.occupancy.previousConsumption?.source ? (
                <small>{row.occupancy.previousConsumption.source}</small>
              ) : null}
            </>
          ) : (
            <>
              <label>
                <span>Wert</span>
                <input
                  aria-label={`Vorjahresverbrauch ${label}`}
                  className="consumption-number"
                  inputMode="decimal"
                  value={previousDraft.value}
                  onChange={(event) =>
                    setPrevious({ value: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Jahr</span>
                <input
                  aria-label={`Jahr Vorjahresverbrauch ${label}`}
                  className="consumption-number"
                  inputMode="numeric"
                  value={previousDraft.year}
                  onChange={(event) =>
                    setPrevious({ year: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Quelle</span>
                <input
                  aria-label={`Quelle Vorjahresverbrauch ${label}`}
                  value={previousDraft.source}
                  onChange={(event) =>
                    setPrevious({ source: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Klimafaktor Vorjahr</span>
                <input
                  aria-label={`Klimafaktor Vorjahr ${label}`}
                  className="consumption-number"
                  inputMode="decimal"
                  value={previousDraft.climateFactor}
                  onChange={(event) =>
                    setPrevious({ climateFactor: event.target.value })
                  }
                />
              </label>
            </>
          )}
          {!locked && !editingPrevious ? (
            <button
              className="button button--quiet"
              type="button"
              aria-label={`Vorjahresverbrauch bearbeiten ${label}`}
              onClick={() => setEditingPrevious(true)}
            >
              Bearbeiten
            </button>
          ) : null}
          {!locked && editingPrevious ? (
            <>
              <button
                className="button button--quiet"
                type="button"
                aria-label={`Vorjahresverbrauch speichern ${label}`}
                onClick={() => {
                  if (onSavePrevious(row, previousDraft))
                    setEditingPrevious(false)
                }}
              >
                Speichern
              </button>
              <button
                className="button button--quiet"
                type="button"
                aria-label={`Änderung Vorjahresverbrauch verwerfen ${label}`}
                onClick={() => {
                  setPreviousDraft(initialPrevious)
                  setEditingPrevious(false)
                }}
              >
                Verwerfen
              </button>
            </>
          ) : null}
        </div>
      </td>
      <td className="consumption-status-cell">
        <span className={`consumption-status consumption-status--${status}`}>
          {STATUS_LABELS[status]}
        </span>
        {row.meteredCircuit ? (
          <small>
            Der Heizkreis verwendet Wohnungswärme in kWh. Gespeicherte
            HKV-Verbrauchseinheiten bleiben als Altwerte erhalten und werden
            hier nicht verwendet.
          </small>
        ) : null}
        {!dirty && row.readingMismatch ? (
          <small role="alert">
            {row.estimated
              ? 'Zählerdifferenz weicht ab; für eine Schätzung bitte den Schätzgrund angeben.'
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
  const [hint, setHint] = useState<string | null>(null)
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

  function savePrevious(
    row: ConsumptionRow,
    draft: PreviousConsumptionDraft,
  ): boolean {
    return run((current) => {
      const value = parse(draft.value, 'Vorjahresverbrauch')
      if (value === undefined)
        return updateOccupancyPreviousConsumption(current, {
          occupancyPeriodId: row.occupancy.id,
        })
      const year = parse(draft.year, 'Jahr des Vorjahresverbrauchs')
      if (year === undefined || !Number.isInteger(year))
        throw new OccupancyCommandError(
          'Jahr des Vorjahresverbrauchs: Bitte eine gültige Jahreszahl eingeben.',
        )
      if (year !== period.year - 1)
        throw new OccupancyCommandError(
          `Der Vorjahresverbrauch muss zum Vorjahr ${period.year - 1} gehören.`,
        )
      const climateFactor = parse(draft.climateFactor, 'Klimafaktor Vorjahr')
      if (climateFactor != null && climateFactor <= 0)
        throw new OccupancyCommandError(
          'Klimafaktor Vorjahr: Bitte einen Wert größer 0 eingeben.',
        )
      return updateOccupancyPreviousConsumption(current, {
        occupancyPeriodId: row.occupancy.id,
        previousConsumption: {
          year,
          value,
          ...(draft.source.trim() ? { source: draft.source.trim() } : {}),
          ...(climateFactor === undefined ? {} : { climateFactor }),
        },
      })
    }, `Vorjahresverbrauch für ${row.unitLabel} (${row.tenantName}) gespeichert.`)
  }

  function estimateAll() {
    const ids = estimable.map(({ occupancy }) => occupancy.id)
    setHint(section9aHint(overview.rows, new Set(ids)))
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
          coldWater: occupancy.coldWater?.value,
          warmWater: occupancy.warmWater?.value,
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
      <p className="consumption-note">
        Der gespeicherte Vorjahreswert gilt nur für {period.year - 1} und wird
        nur herangezogen, wenn der Vorjahreszeitraum fehlt oder dort keine
        Nutzungen erfasst sind. Sobald dort eine Nutzung besteht, verwendet das
        PDF den Vergleich aus diesem Zeitraum.
      </p>
      {hint ? (
        <p className="calculation-warnings" role="note" aria-live="polite">
          {hint}
        </p>
      ) : null}
      {overview.estimatedShares
        .filter(({ estimatedShare }) => estimatedShare > ESTIMATED_SHARE_LIMIT)
        .map((share) => (
          <p key={share.buildingId} className="consumption-note">
            {share.buildingName}: {Math.round(share.estimatedShare * 100)} % der
            Fläche geschätzt – Heizkosten werden nach § 9a Abs. 2 HeizKV
            ausschließlich nach Fläche verteilt.
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
                <th scope="col">Stand neu / Differenz</th>
                <th scope="col">HKV-Verbrauchseinheiten</th>
                <th scope="col">Wasser m³ kalt / warm</th>
                <th scope="col">Vorjahresverbrauch</th>
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
                    row.coldWater,
                    row.warmWater,
                    row.occupancy.previousConsumption,
                  ])}`}
                  row={row}
                  locked={locked}
                  highlighted={row.occupancy.id === highlightId}
                  onSave={save}
                  onSavePrevious={savePrevious}
                  onEstimate={(row) =>
                    setHint(
                      section9aHint(overview.rows, new Set([row.occupancy.id])),
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        <small>Leerstände werden weiterhin unter „Nutzer“ gepflegt.</small>
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
