import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  METER_SERVICE_TEMPLATE,
  parseMeterServiceRows,
  readMeterServiceHeader,
  suggestMeterServiceColumns,
  type MeterServiceColumns,
  type MeterServiceIssue,
  type MeterServiceRow,
} from '@nebenkosten/import-export'
import type { AppDataFile, ValidationIssue } from '@nebenkosten/schema'
import {
  importMeterReadings,
  MeterReadingImportError,
  type MeterReadingPlanRow,
} from './meter-reading-import'

interface Props {
  readonly data: AppDataFile
  readonly billingPeriodId: string
  readonly onApply: (
    transform: (current: AppDataFile) => AppDataFile,
  ) => boolean
}

const FIELDS: readonly {
  readonly key: keyof MeterServiceColumns
  readonly label: string
}[] = [
  { key: 'meterNumber', label: 'Zählernummer' },
  { key: 'date', label: 'Ablesedatum' },
  { key: 'value', label: 'Zählerstand' },
  { key: 'unit', label: 'Einheit' },
]

const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 })

function dateText(row: MeterReadingPlanRow) {
  const date = row.date.split('-').reverse().join('.')
  if (row.boundary === 'end_of_day') return `${date} (Tagesende)`
  if (row.boundary === 'start_of_day') return `${date} (Tagesbeginn)`
  return date
}

/** Vorlage mit BOM, damit Excel die Umlaute korrekt öffnet. */
function downloadTemplate() {
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${METER_SERVICE_TEMPLATE}`], {
      type: 'text/csv;charset=utf-8',
    }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'zaehlerstaende-vorlage.csv'
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function MeterReadingCsvImport(props: Props) {
  return <ImportSession key={props.billingPeriodId} {...props} />
}

function ImportSession({ data, billingPeriodId, onApply }: Props) {
  const [text, setText] = useState<string | null>(null)
  const [header, setHeader] = useState<string[]>([])
  const [columns, setColumns] = useState<Partial<MeterServiceColumns>>({})
  const [rows, setRows] = useState<MeterServiceRow[]>([])
  const [plan, setPlan] = useState<MeterReadingPlanRow[]>([])
  const [warnings, setWarnings] = useState<ValidationIssue[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [issues, setIssues] = useState<readonly MeterServiceIssue[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current += 1
    },
    [],
  )

  function clearPreview() {
    setRows([])
    setPlan([])
    setWarnings([])
    setConfirmed(false)
    setIssues([])
    setError(null)
  }

  function reset() {
    clearPreview()
    setText(null)
    setHeader([])
    setColumns({})
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
      const content = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      )
      if (sequence !== request.current) return
      const names = readMeterServiceHeader(content)
      setText(content)
      setHeader(names)
      setColumns(suggestMeterServiceColumns(names))
    } catch (caught) {
      if (sequence !== request.current) return
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Datei konnte nicht gelesen werden.',
      )
    } finally {
      input.value = ''
    }
  }

  function selectColumn(key: keyof MeterServiceColumns, name: string) {
    clearPreview()
    setColumns((current) => ({ ...current, [key]: name || undefined }))
  }

  // Probelauf mit derselben Prüfung wie die Übernahme, ohne zu speichern.
  function check() {
    clearPreview()
    const mapped = FIELDS.map(({ key }) => columns[key])
    if (
      mapped.some((name) => !name) ||
      new Set(mapped).size !== FIELDS.length
    ) {
      setError('Bitte jeder Angabe eine eigene Spalte zuordnen.')
      return
    }
    try {
      const parsed = parseMeterServiceRows(
        text!,
        columns as MeterServiceColumns,
      )
      if (parsed.issues.length) {
        setIssues(parsed.issues)
        setError(
          `${parsed.issues.length} Zeile(n) müssen korrigiert werden. Es wurde nichts übernommen.`,
        )
        return
      }
      const preview = importMeterReadings(data, billingPeriodId, parsed.rows)
      setRows(parsed.rows)
      setPlan(preview.plan)
      setWarnings(preview.warnings)
    } catch (caught) {
      if (caught instanceof MeterReadingImportError && caught.issues.length > 1)
        setIssues(caught.issues)
      setError((caught as Error).message)
    }
  }

  function accept() {
    setError(null)
    try {
      if (
        onApply(
          (current) => importMeterReadings(current, billingPeriodId, rows).file,
        )
      ) {
        setNotice(`${plan.length} Zählerstände übernommen.`)
        reset()
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Zählerstände konnten nicht übernommen werden.',
      )
    }
  }

  return (
    <section className="workflow-card" aria-label="Zählerstände importieren">
      <h2>Zählerstände aus Ablesebogen/Messdienst übernehmen</h2>
      <p>
        Vorlage herunterladen oder die CSV des Messdienstes verwenden
        (Semikolon, UTF-8). Je Zeile ein Zählerstand mit Datum und Einheit.
        Zähler werden über die Zählernummer zugeordnet und müssen bereits
        angelegt sein. Übernommen wird nur, wenn alle Zeilen fehlerfrei sind.
      </p>
      <button type="button" onClick={downloadTemplate}>
        Vorlage herunterladen
      </button>
      <label>
        <span>CSV mit Zählerständen auswählen</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void load(event)}
        />
      </label>
      {header.length > 0 && (
        <fieldset aria-label="Spaltenzuordnung">
          <legend>Spaltenzuordnung</legend>
          {FIELDS.map(({ key, label }) => (
            <label key={key}>
              <span>Spalte für {label}</span>
              <select
                value={columns[key] ?? ''}
                onChange={(event) => selectColumn(key, event.target.value)}
              >
                <option value="">– bitte wählen –</option>
                {header.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button type="button" onClick={check}>
            Zuordnung prüfen (Probelauf)
          </button>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
      {issues.length > 0 && (
        <ul aria-label="Fehler in der Zählerstandsliste">
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
              aria-label="Vorschau der Zählerstände"
            >
              <thead>
                <tr>
                  <th>Zeile</th>
                  <th>Zähler</th>
                  <th>Ablesedatum</th>
                  <th>Zählerstand</th>
                  <th>Einheit</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((row) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    <td>{row.meterNumber}</td>
                    <td>{dateText(row)}</td>
                    <td>{number.format(row.value)}</td>
                    <td>{row.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {warnings.length > 0 && (
            <>
              <ul aria-label="Hinweise der Plausibilitätsprüfung">
                {warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>
                    <strong>{warning.title}</strong>
                    {warning.detail ? ` – ${warning.detail}` : ''}
                  </li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>Hinweise geprüft – Werte trotzdem übernehmen</span>
              </label>
            </>
          )}
          <button
            type="button"
            disabled={warnings.length > 0 && !confirmed}
            onClick={accept}
          >
            Geprüfte Zählerstände übernehmen
          </button>
          <button type="button" onClick={reset}>
            Vorschau verwerfen
          </button>
        </>
      )}
    </section>
  )
}
