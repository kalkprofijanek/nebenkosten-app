import {
  METER_SERVICE_COLUMN_LABELS,
  parseMeterServiceCsv,
  planMonthlyMeterReadings,
  suggestMeterServiceColumns,
  type MeterServiceColumns,
  type MeterServiceReading,
  type MonthlyReadingsPlan,
} from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { importMonthlyMeterReadings } from './commands'
import { locateCsvError, readCsvHeader } from './csv-columns'
import { formatReading, germanDate } from './format'

type Apply = (transform: (data: AppDataFile) => AppDataFile) => boolean

interface Props {
  readonly data: AppDataFile
  readonly propertyId: string
  readonly onApply: Apply
  readonly createId: () => string
}

interface LoadedFile {
  readonly text: string
  readonly header: readonly string[]
}

type Preview =
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'plan'
      readonly rows: readonly MeterServiceReading[]
      readonly plan: MonthlyReadingsPlan
    }

const MAX_BYTES = 5 * 1024 * 1024
const KEYS: readonly (keyof MeterServiceColumns)[] = [
  'meterNumber',
  'date',
  'value',
  'unit',
]

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

function buildPreview(
  data: AppDataFile,
  propertyId: string,
  file: LoadedFile,
  columns: MeterServiceColumns,
): Preview {
  const names = KEYS.map((key) => columns[key])
  if (names.some((name) => !name) || new Set(names).size !== names.length)
    return { kind: 'incomplete' }
  try {
    const rows = parseMeterServiceCsv(file.text, columns)
    // Probelauf ohne Speichern; IDs werden erst bei der Übernahme vergeben.
    const plan = planMonthlyMeterReadings(data, {
      propertyId,
      rows,
      createId: () => 'vorschau',
    })
    return { kind: 'plan', rows, plan }
  } catch (caught) {
    return {
      kind: 'error',
      message:
        locateCsvError(file.text, columns) ??
        (caught instanceof Error
          ? caught.message
          : 'Die CSV-Datei konnte nicht gelesen werden.'),
    }
  }
}

export function MonthlyReadingsImport({
  data,
  propertyId,
  onApply,
  createId,
}: Props) {
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [columns, setColumns] = useState<MeterServiceColumns | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const request = useRef(0)
  const reasonId = useId()
  useEffect(
    () => () => {
      request.current += 1
    },
    [],
  )

  const preview = useMemo(
    () =>
      file && columns ? buildPreview(data, propertyId, file, columns) : null,
    [data, propertyId, file, columns],
  )

  function reset() {
    setFile(null)
    setColumns(null)
  }

  async function load(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const selected = input.files?.[0]
    if (!selected) return
    const sequence = ++request.current
    reset()
    setError(null)
    setNotice(null)
    try {
      if (!selected.size || selected.size > MAX_BYTES)
        throw new Error('Die CSV-Datei ist leer oder größer als 5 MB.')
      const bytes = await selected.arrayBuffer()
      if (sequence !== request.current) return
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        throw new Error(
          'Die Datei ist nicht als UTF-8 gespeichert. Bitte als „CSV UTF-8“ exportieren.',
        )
      }
      const header = readCsvHeader(text)
      if (header.length < 4)
        throw new Error(
          'Die CSV-Datei braucht mindestens vier Spalten (Semikolon als Trennzeichen).',
        )
      setFile({ text, header })
      setColumns({
        meterNumber: '',
        date: '',
        value: '',
        unit: '',
        ...suggestMeterServiceColumns(header),
      })
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      input.value = ''
    }
  }

  function accept() {
    if (preview?.kind !== 'plan') return
    setError(null)
    let imported = 0
    try {
      const saved = onApply((current) => {
        const result = importMonthlyMeterReadings(current, {
          propertyId,
          rows: preview.rows,
          createId,
        })
        imported = result.plan.readings.length
        return result.data
      })
      if (!saved) {
        setError('Die Zählerstände konnten nicht gespeichert werden.')
        return
      }
      setNotice(`${count(imported, 'Zählerstand', 'Zählerstände')} übernommen.`)
      reset()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Zählerstände konnten nicht übernommen werden.',
      )
    }
  }

  const meterNumbers = new Map(
    data.masterData.meters.map(({ id, meterNumber }) => [id, meterNumber]),
  )

  return (
    <section className="workflow-card" aria-labelledby="monthly-import-title">
      <h3 id="monthly-import-title">Monatsendstände aus CSV übernehmen</h3>
      <p>
        CSV der Auslesesoftware (Semikolon, UTF-8) mit Zählernummer,
        Ablesedatum, kumuliertem Zählerstand und Einheit (kWh für
        Wärmemengenzähler, m3 für Warmwasserzähler). Die Datei wird nur in
        diesem Browser gelesen.
      </p>
      <label>
        <span>CSV-Datei mit Zählerständen</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void load(event)}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      {file && columns ? (
        <>
          <fieldset>
            <legend>Spalten zuordnen</legend>
            {KEYS.map((key) => (
              <label key={key}>
                <span>{METER_SERVICE_COLUMN_LABELS[key]}</span>
                <select
                  value={columns[key]}
                  onChange={(event) =>
                    setColumns({ ...columns, [key]: event.target.value })
                  }
                >
                  <option value="">bitte wählen</option>
                  {file.header.map((name, index) => (
                    <option key={`${index}-${name}`} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>

          {preview?.kind === 'incomplete' ? (
            <p>
              Bitte jeder Angabe eine eigene Spalte zuordnen, dann erscheint die
              Vorschau.
            </p>
          ) : null}
          {preview?.kind === 'error' ? (
            <p role="alert">{preview.message} Es wurde nichts übernommen.</p>
          ) : null}
          {preview?.kind === 'plan' ? (
            <section role="region" aria-label="Vorschau des Imports">
              <ul>
                <li>
                  {count(
                    preview.plan.readings.length,
                    'neuer Zählerstand',
                    'neue Zählerstände',
                  )}
                </li>
                <li>
                  {count(
                    preview.plan.skippedDuplicates.length,
                    'Dublette übersprungen',
                    'Dubletten übersprungen',
                  )}{' '}
                  (gleicher Stand bereits erfasst oder doppelt in der Datei)
                </li>
                <li>
                  {preview.plan.problems.length === 0
                    ? 'keine Probleme'
                    : count(
                        preview.plan.problems.length,
                        'Problem',
                        'Probleme',
                      )}
                </li>
              </ul>
              {preview.plan.problems.length > 0 ? (
                <ul aria-label="Probleme im Import">
                  {preview.plan.problems.map((problem) => (
                    <li key={`${problem.row}-${problem.code}`}>
                      Datenzeile {problem.row}: {problem.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
              {preview.plan.readings.length > 0 ? (
                <div className="data-table-wrap data-table-wrap--workspace">
                  <table
                    className="data-table data-table--workspace"
                    aria-label="Neue Zählerstände"
                  >
                    <thead>
                      <tr>
                        <th scope="col">Zählernummer</th>
                        <th scope="col">Ablesedatum</th>
                        <th scope="col">Zählerstand</th>
                        <th scope="col">Einheit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.plan.readings.map((reading, index) => (
                        <tr key={`${reading.meterId}-${reading.date}-${index}`}>
                          <td>{meterNumbers.get(reading.meterId) ?? '–'}</td>
                          <td>{germanDate(reading.date!)}</td>
                          <td>{formatReading(reading.value.value)}</td>
                          <td>{reading.value.unit === 'm3' ? 'm³' : 'kWh'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p id={reasonId}>
                {preview.plan.problems.length > 0
                  ? `Die Datei enthält ${count(preview.plan.problems.length, 'Problem', 'Probleme')}. Übernahme ist erst möglich, wenn alle Probleme in der Datei oder in den Zählerdaten behoben sind und die Datei erneut geladen wurde.`
                  : preview.plan.readings.length === 0
                    ? 'Die Datei enthält keine neuen Zählerstände.'
                    : 'Geprüft: Die neuen Zählerstände können übernommen werden. Vorhandene Stände werden nicht verändert.'}
              </p>
              <button
                type="button"
                disabled={
                  preview.plan.problems.length > 0 ||
                  preview.plan.readings.length === 0
                }
                aria-describedby={reasonId}
                onClick={accept}
              >
                Zählerstände übernehmen
              </button>
            </section>
          ) : null}
          <button type="button" onClick={reset}>
            Vorschau verwerfen
          </button>
        </>
      ) : null}
    </section>
  )
}
