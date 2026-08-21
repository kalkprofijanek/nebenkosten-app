import type {
  AppDataFile,
  MigrationCounts,
  MigrationReport,
} from '@nebenkosten/schema'
import { useState } from 'react'

import { APP_VERSION } from './app/version'
import {
  MAX_IMPORT_BYTES,
  prepareImport,
  type ImportPreview,
  type ImportSummary,
  type ImportValidationSummary,
} from './features/import/prepare-import'

const summaryLabels = {
  organizations: 'Mandanten',
  ownerCompanies: 'Firmen',
  properties: 'Objekte',
  buildings: 'Gebäude',
  units: 'Einheiten',
  persons: 'Personen',
  tenancies: 'Mietverhältnisse',
  billingPeriods: 'Abrechnungsjahre',
  occupancyPeriods: 'Nutzungszeiträume',
  costCategories: 'Kostenarten',
  costEntries: 'Kostenpositionen',
  heatingCircuits: 'Heizkreise',
  energySources: 'Energiequellen',
  bankBookings: 'Bankbuchungen',
  meters: 'Zähler',
  warnings: 'Warnungen',
} as const satisfies Readonly<Record<keyof ImportSummary, string>>

const migrationCountLabels = {
  ownerCompanies: 'Firmen',
  properties: 'Objekte',
  billingPeriods: 'Abrechnungsjahre',
  occupancyPeriods: 'Nutzungszeiträume',
  costCategories: 'Kostenarten',
  costEntries: 'Kostenpositionen',
  heatingCircuits: 'Heizkreise',
  energySources: 'Energiequellen',
  bankBookings: 'Bankbuchungen',
  meters: 'Zähler',
  warnings: 'Warnungen',
} as const satisfies Readonly<Record<keyof MigrationCounts, string>>

function CountList<T extends object>({
  counts,
  labels,
}: {
  readonly counts: T
  readonly labels: Readonly<Record<keyof T, string>>
}) {
  return (
    <dl>
      {Object.entries(labels).map(([key, label]) => (
        <div key={key}>
          <dt>{String(label)}</dt>
          <dd>{String(counts[key as keyof T])}</dd>
        </div>
      ))}
    </dl>
  )
}

function MigrationReportPreview({
  report,
  validationSummaries,
}: {
  readonly report: MigrationReport
  readonly validationSummaries: readonly ImportValidationSummary[]
}) {
  return (
    <>
      <h3>Migrationsbericht</h3>
      <dl>
        <div>
          <dt>Quell-Hash (SHA-256)</dt>
          <dd>{report.sourceSha256}</dd>
        </div>
        <div>
          <dt>Quellversion</dt>
          <dd>Schema {report.detectedSchemaVersion}</dd>
        </div>
        <div>
          <dt>Zielversion</dt>
          <dd>Schema {report.targetSchemaVersion}</dd>
        </div>
        <div>
          <dt>App-Version</dt>
          <dd>{report.appVersion ?? 'Nicht angegeben'}</dd>
        </div>
        <div>
          <dt>Migrationszeitpunkt</dt>
          <dd>{report.migratedAt}</dd>
        </div>
      </dl>
      <h3>Zählungen</h3>
      <CountList counts={report.counts} labels={migrationCountLabels} />
      <h3>Warnungen und Hinweise</h3>
      {report.issues.length === 0 ? (
        <p>Keine Warnungen oder Hinweise.</p>
      ) : (
        <ul>
          {report.issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              <strong>{issue.code}</strong>: {issue.title}
              {issue.path ? ` (${issue.path.join('.')})` : ''}
              {issue.detail ? ` – ${issue.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
      <h3>Geänderte Regeln</h3>
      {report.changedFields.length === 0 ? (
        <p>Keine Feldtransformationen.</p>
      ) : (
        <ul>
          {report.changedFields.map((field, index) => (
            <li key={`${field.sourcePath}-${field.targetPath}-${index}`}>
              <strong>{field.rule}</strong>: {field.sourcePath} →{' '}
              {field.targetPath}
              {field.note ? ` – ${field.note}` : ''}
            </li>
          ))}
        </ul>
      )}
      <h3>Verworfene Felder</h3>
      {report.droppedFields.length === 0 ? (
        <p>Keine Felder verworfen.</p>
      ) : (
        <ul>
          {report.droppedFields.map((field, index) => (
            <li key={`${field.sourcePath}-${index}`}>
              {field.sourcePath}: {field.reason}
              {field.valueType ? ` (Werttyp: ${field.valueType})` : ''}
            </li>
          ))}
        </ul>
      )}
      <h3>Unbekannte, konservierte Felder</h3>
      {report.unmappedFields.length === 0 ? (
        <p>Keine unbekannten Felder konserviert.</p>
      ) : (
        <ul>
          {report.unmappedFields.map((path, index) => (
            <li key={`${path}-${index}`}>{path}</li>
          ))}
        </ul>
      )}
      <h3>Fachliche Plausibilitätsprüfung</h3>
      {validationSummaries.length === 0 ? (
        <p>Keine Abrechnungsjahre fachlich zu prüfen.</p>
      ) : (
        <ul>
          {validationSummaries.map((summary) => (
            <li key={summary.reference}>
              <strong>
                Abrechnungsjahr {summary.reference.split('-').at(-1)} (
                {summary.year})
              </strong>
              : {summary.errorCount} Fehler, {summary.warningCount} Warnungen,{' '}
              {summary.infoCount} Hinweise
              {summary.canBecomeReady
                ? ' – fachlich freigabefähig'
                : ' – noch nicht freigabefähig'}
              {summary.issueCodes.length > 0 ? (
                <ul>
                  {summary.issueCodes.map((code, index) => (
                    <li key={`${summary.reference}-${code}-${index}`}>
                      {code}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function ImportControl({
  disabled,
  onConfirm,
}: {
  readonly disabled: boolean
  readonly onConfirm: (data: AppDataFile) => Promise<boolean>
}) {
  const [preview, setPreview] = useState<Extract<
    ImportPreview,
    { ok: true }
  > | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <label className="button button--quiet import-button">
        Daten importieren
        <input
          type="file"
          accept=".json,application/json"
          disabled={disabled}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (!file) return
            setError(null)
            if (file.size > MAX_IMPORT_BYTES) {
              setError('Import nicht möglich (source_too_large).')
              return
            }
            try {
              const result = await prepareImport(
                new Uint8Array(await file.arrayBuffer()),
                {
                  sourceFileName: file.name,
                  appVersion: APP_VERSION,
                },
              )
              if (!result.ok) {
                setError(`Import nicht möglich (${result.code}).`)
                return
              }
              setPreview(result)
            } catch {
              setError('Import nicht möglich (processing_failed).')
            }
          }}
        />
      </label>
      {error ? <span role="alert">{error}</span> : null}
      {preview ? (
        <div className="dialog-backdrop">
          <section
            className="import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <h2 id="import-title">Import prüfen</h2>
            <p>
              Format:{' '}
              {preview.sourceFormat === 'legacy-v3' ? 'Legacy v3' : 'Version 4'}
            </p>
            {preview.sourceFormat === 'legacy-v3' ? (
              <MigrationReportPreview
                report={preview.migrationReport}
                validationSummaries={preview.validationSummaries}
              />
            ) : (
              <>
                <h3>Bestandszahlen</h3>
                <CountList counts={preview.summary} labels={summaryLabels} />
              </>
            )}
            <div className="dialog-actions">
              <button type="button" autoFocus onClick={() => setPreview(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (await onConfirm(preview.data)) setPreview(null)
                    else
                      setError(
                        'Der Import konnte nicht sicher übernommen werden.',
                      )
                  } catch {
                    setError(
                      'Der Import konnte nicht sicher übernommen werden.',
                    )
                  }
                }}
              >
                Geprüften Import übernehmen
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
