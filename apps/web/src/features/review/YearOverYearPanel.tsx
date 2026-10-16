import { yearOverYearReport } from '@nebenkosten/core'
import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { useMemo, useState } from 'react'
import { downloadBlob } from '../pdf/render'
import {
  euroText,
  percentText,
  yearOverYearCsv,
  yearOverYearRows,
} from './year-over-year-csv'

/**
 * Interner Bericht „Veränderung zum Vorjahr“ (PR-33) je Kostenart, Heizkreis
 * und Wohnung mit Ausreißern; nicht Teil der Mieterabrechnung.
 */
export function YearOverYearPanel({
  data,
  period,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
}) {
  const [onlyOutliers, setOnlyOutliers] = useState(true)
  const report = useMemo(() => {
    try {
      return yearOverYearReport(data, period)
    } catch (error) {
      return {
        status: 'previous_not_calculable' as const,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }, [data, period])

  return (
    <section aria-labelledby="year-over-year-title">
      <h3 id="year-over-year-title">Veränderung zum Vorjahr</h3>
      {report.status === 'no_previous_period' ? (
        <p>
          Kein Vorjahr {period.year - 1} für dieses Objekt im System; der
          Vergleich entfällt.
        </p>
      ) : report.status === 'previous_not_calculable' ? (
        <p>Das Vorjahr lässt sich nicht berechnen: {report.reason}</p>
      ) : (
        <YearOverYearTable
          data={data}
          report={report}
          onlyOutliers={onlyOutliers}
          onToggle={setOnlyOutliers}
        />
      )}
    </section>
  )
}

function YearOverYearTable({
  data,
  report,
  onlyOutliers,
  onToggle,
}: {
  readonly data: AppDataFile
  readonly report: Extract<
    ReturnType<typeof yearOverYearReport>,
    { status: 'compared' }
  >
  readonly onlyOutliers: boolean
  readonly onToggle: (value: boolean) => void
}) {
  const rows = yearOverYearRows(data, report)
  const visible = onlyOutliers
    ? rows.filter((row) => row.area === 'Gesamt' || row.value.outlier)
    : rows
  const outliers = rows.filter((row) => row.value.outlier).length
  return (
    <>
      <p className="privacy-note">
        Auffällig sind Abweichungen über ±{' '}
        {Math.round(report.limits.general * 100)} % (Heizung ±{' '}
        {Math.round(report.limits.heating * 100)} %). {outliers}{' '}
        {outliers === 1 ? 'Position ist' : 'Positionen sind'} auffällig; bitte
        vor der Freigabe erklären.
      </p>
      <label>
        <input
          type="checkbox"
          checked={onlyOutliers}
          onChange={(event) => onToggle(event.target.checked)}
        />{' '}
        Nur auffällige Positionen
      </label>{' '}
      <button
        className="button"
        type="button"
        onClick={() =>
          downloadBlob(
            new Blob([yearOverYearCsv(data, report)], {
              type: 'text/csv;charset=utf-8',
            }),
            `Veraenderung_${report.previousYear}_${report.currentYear}.csv`,
          )
        }
      >
        Als CSV herunterladen
      </button>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Bereich</th>
              <th scope="col">Position</th>
              <th scope="col">{report.previousYear}</th>
              <th scope="col">{report.currentYear}</th>
              <th scope="col">Veränderung</th>
              <th scope="col">Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr
                key={`${row.area}:${row.label}:${index}`}
                className={row.value.outlier ? 'row-warning' : undefined}
              >
                <td>{row.area}</td>
                <th scope="row">{row.label}</th>
                <td>{euroText(row.value.previousCents) || '–'} €</td>
                <td>{euroText(row.value.currentCents) || '–'} €</td>
                <td>
                  {percentText(row.value.changeRatio) || '–'}
                  {row.value.outlier ? ' ⚠' : ''}
                </td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
