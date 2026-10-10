import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { useState } from 'react'
import { parseOptionalNumber } from '../../app/form-parsers'
import {
  OccupancyCommandError,
  splitUnitConsumptionByDegreeDays,
} from '../occupancies/commands'
import {
  degreeDaySplitPlan,
  germanDate,
  MAX_DEGREE_DAY_REASON_LENGTH,
  unitOccupancies,
} from '../occupancies/degree-day-split'
import { tenantDisplayName } from '../prepayments/overview'

type Run = (
  transform: (data: AppDataFile) => AppDataFile,
  done: string,
) => boolean

const decimal = (value: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(value)

function parsedTotal(value: string): number | null {
  try {
    return parseOptionalNumber(value)
  } catch {
    return null
  }
}

function UnitSplit({
  data,
  period,
  unitId,
  unitLabel,
  run,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
  readonly unitId: string
  readonly unitLabel: string
  readonly run: Run
}) {
  const [open, setOpen] = useState(false)
  const [total, setTotal] = useState('')
  const [reason, setReason] = useState('')
  const value = parsedTotal(total)
  // Ohne Eingabe wird nur die Abdeckung des Jahres geprüft.
  const plan = degreeDaySplitPlan(data, period.id, unitId, value ?? 0)
  const name = (occupancyId: string) => {
    const occupancy = data.billingData.occupancyPeriods.find(
      ({ id }) => id === occupancyId,
    )
    return occupancy?.kind === 'vacancy'
      ? 'Leerstand'
      : tenantDisplayName(data, occupancy?.tenancyId)
  }

  function apply() {
    if (
      run((current) => {
        if (value === null)
          throw new OccupancyCommandError(
            'Gesamtverbrauch: Bitte eine Zahl ab 0 eingeben.',
          )
        return splitUnitConsumptionByDegreeDays(current, {
          billingPeriodId: period.id,
          unitId,
          totalUnits: value,
          reason,
        })
      }, `Verbrauch von ${unitLabel} nach Gradtagszahlen aufgeteilt und gespeichert.`)
    ) {
      setOpen(false)
      setTotal('')
      setReason('')
    }
  }

  return (
    <li className="degree-day-split">
      <div className="degree-day-split__head">
        <strong>{unitLabel}</strong>
        <span>
          {unitOccupancies(data, period, unitId)
            .map(({ id }) => name(id))
            .join(' → ')}
        </span>
        <button
          className="button button--quiet"
          type="button"
          aria-expanded={open}
          aria-label={`Nach Gradtagszahlen aufteilen ${unitLabel}`}
          onClick={() => setOpen((current) => !current)}
        >
          Nach Gradtagszahlen aufteilen
        </button>
      </div>
      {open ? (
        <div className="degree-day-split__form">
          <label>
            <span>Gesamtverbrauch der Wohnung laut Jahresablesung</span>
            <input
              className="consumption-number"
              inputMode="decimal"
              aria-label={`Gesamtverbrauch ${unitLabel}`}
              value={total}
              onChange={(event) => setTotal(event.target.value)}
            />
          </label>
          <label>
            <span>Warum war keine Zwischenablesung möglich? (Pflichtfeld)</span>
            <textarea
              rows={2}
              maxLength={MAX_DEGREE_DAY_REASON_LENGTH}
              aria-label={`Warum war keine Zwischenablesung möglich? ${unitLabel}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {!plan.ok ? (
            <p role="alert">{plan.problem}</p>
          ) : (
            <table
              className="data-table degree-day-split__preview"
              aria-label={`Vorschau Gradtagszahlen ${unitLabel}`}
            >
              <thead>
                <tr>
                  <th scope="col">Nutzung</th>
                  <th scope="col">Zeitraum</th>
                  <th scope="col">Promille</th>
                  <th scope="col">Anteil</th>
                </tr>
              </thead>
              <tbody>
                {plan.shares.map((share) => (
                  <tr key={share.occupancy.id}>
                    <th scope="row">{name(share.occupancy.id)}</th>
                    <td>
                      {germanDate(share.from)} – {germanDate(share.to)}
                    </td>
                    <td>{decimal(share.permille)} ‰</td>
                    <td>{value === null ? '—' : decimal(share.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="consumption-actions">
            <button
              className="button"
              type="button"
              disabled={!plan.ok}
              onClick={apply}
            >
              Aufteilung übernehmen
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/**
 * Aufteilung nach Gradtagszahlen für Wohnungen mit mehreren Nutzungen im Jahr
 * (PR-27 Teil B). Nur der Ausweg nach § 9b Abs. 3 HeizKV (ADR-0009).
 */
export function DegreeDaySplit({
  data,
  period,
  run,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
  readonly run: Run
}) {
  const units = data.masterData.units.filter(
    ({ id, propertyId }) =>
      propertyId === period.propertyId &&
      unitOccupancies(data, period, id).length > 1,
  )
  if (units.length === 0) return null
  return (
    <section
      className="degree-day-splits"
      aria-labelledby="degree-day-split-title"
    >
      <h3 id="degree-day-split-title">Nutzerwechsel ohne Zwischenablesung</h3>
      <p className="consumption-note">
        Vorrang hat die Zwischenablesung (§ 9b Abs. 1 HeizKV): Stand neu der
        vorigen bzw. Stand alt der neuen Nutzung zum Wechseltag erfassen. Nur
        wenn sie nicht möglich war, wird der Jahresverbrauch der Wohnung nach
        Gradtagszahlen (VDI 2067) auf die Nutzungen einschließlich Leerstand
        aufgeteilt (§ 9b Abs. 3 HeizKV). Die Werte gelten nicht als Schätzung;
        Begründung und Rechenweg werden als Erläuterung gespeichert.
      </p>
      <ul className="degree-day-split__list">
        {units.map((unit) => (
          <UnitSplit
            key={unit.id}
            data={data}
            period={period}
            unitId={unit.id}
            unitLabel={unit.label || unit.location || unit.id}
            run={run}
          />
        ))}
      </ul>
    </section>
  )
}
