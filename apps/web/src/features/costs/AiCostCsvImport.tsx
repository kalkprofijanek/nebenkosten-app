import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { parseAiCostCsv, type AiCostRow } from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'
import { importAiCosts } from './ai-cost-import'

interface Props {
  readonly data: AppDataFile
  readonly billingPeriodId: string
  readonly onApply: (
    transform: (current: AppDataFile) => AppDataFile,
  ) => boolean
}

export function AiCostCsvImport(props: Props) {
  return <ImportSession key={props.billingPeriodId} {...props} />
}

function ImportSession({ data, billingPeriodId, onApply }: Props) {
  const [rows, setRows] = useState<AiCostRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current += 1
    },
    [],
  )

  async function load(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    const sequence = ++request.current
    const selectedPeriod = billingPeriodId
    setRows([])
    setError(null)
    setNotice(null)
    try {
      if (!file.size || file.size > 5 * 1024 * 1024)
        throw new Error('CSV ist leer oder größer als 5 MB.')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      )
      if (sequence !== request.current) return
      const parsed = parseAiCostCsv(text)
      // Gleiche atomare Prüfung wie bei Übernahme, ohne den Zustand zu speichern.
      importAiCosts(data, selectedPeriod, parsed)
      setRows(parsed)
    } catch (caught) {
      if (sequence === request.current)
        setError(
          caught instanceof Error
            ? caught.message
            : 'Die Erfassungsliste konnte nicht gelesen werden.',
        )
    } finally {
      input.value = ''
    }
  }

  function accept() {
    setError(null)
    try {
      if (onApply((current) => importAiCosts(current, billingPeriodId, rows))) {
        setNotice(`${rows.length} Kostenpositionen übernommen.`)
        setRows([])
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Kostenpositionen konnten nicht übernommen werden.',
      )
    }
  }

  return (
    <section
      className="workflow-card"
      aria-label="KI-Erfassungsliste importieren"
    >
      <h3>KI-Erfassungsliste importieren</h3>
      <p>
        CSV im Format der KI-Anleitung auswählen. Prüfen Sie Zuordnung, Betrag
        und Umlagefähigkeit vor der Übernahme. Kostenarten müssen bereits
        vorhanden sein.
      </p>
      <label>
        <span>CSV-Erfassungsliste auswählen</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void load(event)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {rows.length > 0 && (
        <>
          <div className="data-table-wrap data-table-wrap--workspace">
            <table
              className="data-table data-table--workspace"
              aria-label="Vorschau der Erfassungsliste"
            >
              <thead>
                <tr>
                  <th>Kostenart</th>
                  <th>Beleg</th>
                  <th>Beschreibung und Zusatzangaben</th>
                  <th>Betrag</th>
                  <th>Umlagefähig</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>{row.category}</td>
                    <td>
                      {row.receiptReference ?? 'Ohne Belegnummer'} ·{' '}
                      {row.date ?? 'Ohne Datum'}
                    </td>
                    <td>
                      {[
                        row.description,
                        row.supplier,
                        row.serviceFrom
                          ? `${row.serviceFrom} – ${row.serviceTo}`
                          : undefined,
                        row.reason,
                        row.laborAmountCents !== undefined
                          ? `Lohnanteil ${(row.laborAmountCents / 100).toFixed(2)} EUR`
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td>
                      {new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(row.amountCents / 100)}
                    </td>
                    <td>
                      {row.allocablePercent !== undefined
                        ? `${row.allocablePercent} %`
                        : 'Vorgabe der Kostenart'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={accept}>
            Geprüfte Kostenpositionen übernehmen
          </button>
          <button type="button" onClick={() => setRows([])}>
            Vorschau verwerfen
          </button>
        </>
      )}
    </section>
  )
}
