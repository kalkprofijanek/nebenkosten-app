import {
  calculateMonthlyConsumptionInformation,
  type MonthlyAverageUserComparison,
  type MonthlyConsumptionInformation,
  type MonthlyInformationIssue,
  type MonthlyValue,
} from '@nebenkosten/core'
import type { AppDataFile } from '@nebenkosten/schema'
import { useMemo, useState, type ReactNode } from 'react'
import { tenantDisplayName } from '../prepayments/overview'
import {
  AVERAGE_REASON_LABELS,
  MONTH_PATTERN,
  VALUE_REASON_LABELS,
  formatKwh,
  formatM3,
  germanDate,
  monthBounds,
  previousMonthOf,
  shiftMonthKey,
} from './format'

interface Props {
  readonly data: AppDataFile
  readonly propertyId: string
  readonly today: () => Date
}

const DASH = '–'

function NotCollected({ reason }: { readonly reason: string }) {
  return (
    <>
      nicht erhoben
      <br />
      <small>{reason}</small>
    </>
  )
}

/** Monatswert; Teilzeiträume eines Vergleichsmonats werden genannt. */
function valueCell(
  value: MonthlyValue,
  format: (value: number) => string,
  monthKey: string,
  showPeriod: boolean,
): ReactNode {
  if (value.status === 'not_collected')
    return <NotCollected reason={VALUE_REASON_LABELS[value.reason]} />
  const bounds = monthBounds(monthKey)
  const partial =
    showPeriod && (value.from !== bounds.from || value.to !== bounds.to)
  return (
    <>
      {format(value.value)}
      {partial ? (
        <>
          <br />
          <small>
            {germanDate(value.from)} – {germanDate(value.to)}
          </small>
        </>
      ) : null}
    </>
  )
}

function averageCell(average: MonthlyAverageUserComparison): ReactNode {
  if (average.status === 'unavailable')
    return (
      <>
        nicht ermittelbar
        <br />
        <small>{AVERAGE_REASON_LABELS[average.reason]}</small>
      </>
    )
  return (
    <>
      {formatKwh(average.value)}
      {average.approximation ? (
        <>
          <br />
          <small>Näherung, einschließlich Warmwasser</small>
        </>
      ) : null}
    </>
  )
}

function issueText(data: AppDataFile, issue: MonthlyInformationIssue): string {
  const unit = issue.unitId
    ? data.masterData.units.find(({ id }) => id === issue.unitId)
    : undefined
  const meter = issue.meterId
    ? data.masterData.meters.find(({ id }) => id === issue.meterId)
    : undefined
  const prefix = [
    unit ? (unit.label ?? 'Wohnung') : null,
    meter?.meterNumber ? `Zähler ${meter.meterNumber}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return prefix ? `${prefix}: ${issue.detail}` : issue.detail
}

function calculate(
  data: AppDataFile,
  propertyId: string,
  month: string,
): MonthlyConsumptionInformation | null {
  if (!MONTH_PATTERN.test(month)) return null
  return calculateMonthlyConsumptionInformation(data, { propertyId, month })
}

export function MonthlyOverview({ data, propertyId, today }: Props) {
  const [month, setMonth] = useState(() => previousMonthOf(today()))
  const info = useMemo(
    () => calculate(data, propertyId, month),
    [data, propertyId, month],
  )
  const units = new Map(data.masterData.units.map((unit) => [unit.id, unit]))
  const previousMonth = MONTH_PATTERN.test(month)
    ? shiftMonthKey(month, -1)
    : month
  const previousYearMonth = MONTH_PATTERN.test(month)
    ? shiftMonthKey(month, -12)
    : month

  return (
    <section className="workflow-card" aria-labelledby="monthly-overview-title">
      <h3 id="monthly-overview-title">Monatsübersicht</h3>
      <label>
        <span>Monat</span>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </label>
      {info === null ? (
        <p>Bitte einen Monat im Format JJJJ-MM wählen.</p>
      ) : (
        <>
          {info.tenants.length === 0 ? (
            <p>Für diesen Monat sind keine Mieter-Nutzungen erfasst.</p>
          ) : (
            <div className="data-table-wrap data-table-wrap--workspace">
              <table
                className="data-table data-table--workspace"
                aria-label="Verbrauch je Mieter im Monat"
              >
                <thead>
                  <tr>
                    <th scope="col">Wohnung</th>
                    <th scope="col">Mieter / Zeitraum</th>
                    <th scope="col">Heizung kWh</th>
                    <th scope="col">Vormonat kWh</th>
                    <th scope="col">Vorjahresmonat kWh</th>
                    <th scope="col">Durchschnittsnutzer kWh</th>
                    <th scope="col">Warmwasser m³</th>
                    <th scope="col">Warmwasser kWh</th>
                    <th scope="col">Warmwasser Vormonat m³</th>
                    <th scope="col">Warmwasser Vorjahresmonat m³</th>
                  </tr>
                </thead>
                <tbody>
                  {info.tenants.map((tenant) => {
                    const { heating, hotWater } = tenant
                    return (
                      <tr key={tenant.occupancyPeriodId}>
                        <th scope="row">
                          {units.get(tenant.unitId)?.label ?? 'Wohnung'}
                        </th>
                        <td>
                          {tenantDisplayName(data, tenant.tenancyId)}
                          <br />
                          <small>
                            {germanDate(tenant.from)} – {germanDate(tenant.to)}
                          </small>
                        </td>
                        <td data-testid="heating-current">
                          {valueCell(heating.current, formatKwh, month, false)}
                        </td>
                        <td data-testid="heating-previousMonth">
                          {valueCell(
                            heating.previousMonth,
                            formatKwh,
                            previousMonth,
                            true,
                          )}
                        </td>
                        <td data-testid="heating-previousYearMonth">
                          {valueCell(
                            heating.previousYearMonth,
                            formatKwh,
                            previousYearMonth,
                            true,
                          )}
                        </td>
                        <td data-testid="average-user">
                          {averageCell(tenant.averageUser)}
                        </td>
                        <td data-testid="hot-water-m3">
                          {hotWater
                            ? valueCell(
                                hotWater.current.m3,
                                formatM3,
                                month,
                                false,
                              )
                            : DASH}
                        </td>
                        <td data-testid="hot-water-kwh">
                          {hotWater
                            ? valueCell(
                                hotWater.current.kwh,
                                formatKwh,
                                month,
                                false,
                              )
                            : DASH}
                        </td>
                        <td data-testid="hot-water-previousMonth">
                          {hotWater
                            ? valueCell(
                                hotWater.previousMonth.m3,
                                formatM3,
                                previousMonth,
                                true,
                              )
                            : DASH}
                        </td>
                        <td data-testid="hot-water-previousYearMonth">
                          {hotWater
                            ? valueCell(
                                hotWater.previousYearMonth.m3,
                                formatM3,
                                previousYearMonth,
                                true,
                              )
                            : DASH}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p>
            Warmwasser wird nur bei zentraler Warmwasserbereitung mit
            Warmwasserzähler je Wohnung ausgewiesen (sonst „–“); kWh = 2,5 × m³
            × (Warmwassertemperatur − 10).
          </p>

          <h4>Annahmen</h4>
          {info.assumptions.length === 0 ? (
            <p>Keine Annahmen.</p>
          ) : (
            <ul aria-label="Annahmen">
              {info.assumptions.map((assumption) => (
                <li key={assumption.code}>{assumption.detail}</li>
              ))}
            </ul>
          )}

          <h4>Hinweise</h4>
          {info.issues.length === 0 ? (
            <p>Keine Hinweise.</p>
          ) : (
            <ul aria-label="Hinweise">
              {info.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issueText(data, issue)}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
