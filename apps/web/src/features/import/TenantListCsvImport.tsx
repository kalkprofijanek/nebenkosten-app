import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  parseTenantListCsv,
  TENANT_LIST_TEMPLATE,
  type TenantListIssue,
  type TenantListPrepayment,
  type TenantListRow,
} from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'
import {
  importTenantList,
  TenantListImportError,
  type TenantListPlanRow,
} from './tenant-list-import'

interface Props {
  readonly data: AppDataFile
  readonly billingPeriodId: string
  readonly onApply: (
    transform: (current: AppDataFile) => AppDataFile,
  ) => boolean
}

const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

function prepaymentText(prepayment: TenantListPrepayment | undefined) {
  if (!prepayment) return '–'
  if (prepayment.mode === 'monthly')
    return `${euro.format(prepayment.monthlyAmountCents / 100)} monatlich`
  if (prepayment.mode === 'annual')
    return `${euro.format(prepayment.annualAmountCents / 100)} jährlich`
  return 'keine vereinbart'
}

function isoToGerman(value: string | undefined) {
  return value ? value.split('-').reverse().join('.') : undefined
}

/** Vorlage mit BOM, damit Excel die Umlaute korrekt öffnet. */
function downloadTemplate() {
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${TENANT_LIST_TEMPLATE}`], {
      type: 'text/csv;charset=utf-8',
    }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'mieterliste-vorlage.csv'
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function TenantListCsvImport(props: Props) {
  return <ImportSession key={props.billingPeriodId} {...props} />
}

function ImportSession({ data, billingPeriodId, onApply }: Props) {
  const [rows, setRows] = useState<TenantListRow[]>([])
  const [plan, setPlan] = useState<TenantListPlanRow[]>([])
  const [issues, setIssues] = useState<readonly TenantListIssue[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current += 1
    },
    [],
  )

  function reset() {
    setRows([])
    setPlan([])
    setIssues([])
    setError(null)
  }

  async function load(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    const sequence = ++request.current
    reset()
    setNotice(null)
    try {
      if (!file.size || file.size > 5 * 1024 * 1024)
        throw new Error('CSV ist leer oder größer als 5 MB.')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      )
      if (sequence !== request.current) return
      const parsed = parseTenantListCsv(text)
      if (parsed.issues.length) {
        setIssues(parsed.issues)
        setError(
          `${parsed.issues.length} Zeile(n) der Mieterliste müssen korrigiert werden. Es wurde nichts übernommen.`,
        )
        return
      }
      // Probelauf mit derselben Prüfung wie die Übernahme, ohne zu speichern.
      const preview = importTenantList(data, billingPeriodId, parsed.rows)
      setRows(parsed.rows)
      setPlan(preview.plan)
    } catch (caught) {
      if (sequence !== request.current) return
      if (caught instanceof TenantListImportError && caught.issues.length > 1)
        setIssues(caught.issues)
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Mieterliste konnte nicht gelesen werden.',
      )
    } finally {
      input.value = ''
    }
  }

  function accept() {
    setError(null)
    try {
      if (
        onApply(
          (current) => importTenantList(current, billingPeriodId, rows).file,
        )
      ) {
        const created = new Set(
          plan.filter((p) => p.newUnit).map((p) => p.unitLabel.toLowerCase()),
        ).size
        setNotice(
          `${plan.length} Belegungen übernommen${created ? `, ${created} Wohnung(en) neu angelegt` : ''}.`,
        )
        setRows([])
        setPlan([])
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Mieterliste konnte nicht übernommen werden.',
      )
    }
  }

  return (
    <section className="workflow-card" aria-label="Mieterliste importieren">
      <h3>Mieterliste aus Excel/CSV übernehmen</h3>
      <p>
        Vorlage herunterladen, in Excel ausfüllen und als CSV (Semikolon, UTF-8)
        speichern. Je Zeile eine Belegung: Mieter mit Vorauszahlung oder – ohne
        Mieter – Leerstand. Fehlende Wohnungen werden angelegt, vorhandene über
        die Bezeichnung zugeordnet. Gebäude müssen bereits angelegt sein.
      </p>
      <button type="button" onClick={downloadTemplate}>
        Vorlage herunterladen
      </button>
      <label>
        <span>CSV-Mieterliste auswählen</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void load(event)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {issues.length > 0 && (
        <ul aria-label="Fehler in der Mieterliste">
          {issues.map((issue) => (
            <li key={`${issue.line}-${issue.message}`}>
              Zeile {issue.line}: {issue.message}
            </li>
          ))}
        </ul>
      )}
      {notice && <p role="status">{notice}</p>}
      {plan.length > 0 && (
        <>
          <div className="data-table-wrap data-table-wrap--workspace">
            <table
              className="data-table data-table--workspace"
              aria-label="Vorschau der Mieterliste"
            >
              <thead>
                <tr>
                  <th>Zeile</th>
                  <th>Wohnung</th>
                  <th>Mieter</th>
                  <th>Zeitraum</th>
                  <th>Vorauszahlung</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((row) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    <td>
                      {row.unitLabel}
                      {row.newUnit ? ' (neu)' : ''}
                    </td>
                    <td>{row.displayName ?? 'Leerstand'}</td>
                    <td>
                      {isoToGerman(row.from) ?? 'Jahresbeginn'} –{' '}
                      {isoToGerman(row.to) ?? 'Jahresende'}
                    </td>
                    <td>{prepaymentText(row.prepayment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={accept}>
            Geprüfte Mieterliste übernehmen
          </button>
          <button type="button" onClick={reset}>
            Vorschau verwerfen
          </button>
        </>
      )}
    </section>
  )
}
