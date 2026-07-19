import type { AppDataFile } from '@nebenkosten/schema'
import { useState } from 'react'

import {
  MAX_IMPORT_BYTES,
  prepareImport,
  type ImportPreview,
} from './features/import/prepare-import'

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
            <dl>
              <div>
                <dt>Firmen</dt>
                <dd>{preview.summary.ownerCompanies}</dd>
              </div>
              <div>
                <dt>Objekte</dt>
                <dd>{preview.summary.properties}</dd>
              </div>
              <div>
                <dt>Jahre</dt>
                <dd>{preview.summary.billingPeriods}</dd>
              </div>
              <div>
                <dt>Warnungen</dt>
                <dd>{preview.summary.warnings}</dd>
              </div>
            </dl>
            <div className="dialog-actions">
              <button type="button" onClick={() => setPreview(null)}>
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
                Import übernehmen
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
