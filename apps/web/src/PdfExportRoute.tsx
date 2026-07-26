import type { AppDataFile } from '@nebenkosten/schema'
import {
  buildCombinedCostStatement,
  buildTenantStatement,
  MissingShippingAddressError,
} from '@nebenkosten/pdf'
import { useState } from 'react'
import {
  buildCombinedCostStatementContext,
  buildTenantStatementContext,
  latestCalculationSnapshot,
  tenantOccupancies,
} from './features/pdf/context'
import {
  recordGeneratedDocuments,
  type RecordGeneratedDocumentInput,
} from './features/pdf/commands'
import {
  blobBytes,
  downloadBlob,
  renderPdfBlob,
  renderZipBlob,
  sha256Hex,
  type ZipEntry,
} from './features/pdf/render'

interface PdfExportRouteProps {
  readonly data: AppDataFile
  readonly billingPeriodId: string | null
  readonly onApply: (transform: (data: AppDataFile) => AppDataFile) => boolean
}

function safeFileNamePart(value: string): string {
  return value.replace(/[^\w\-äöüÄÖÜß]/gu, '_')
}

function tenantFileName(
  year: number,
  unitLabel: string,
  personName: string,
): string {
  return `NK_${year}_${safeFileNamePart(unitLabel)}_${safeFileNamePart(personName)}.pdf`
}

export function PdfExportRoute({
  data,
  billingPeriodId,
  onApply,
}: PdfExportRouteProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (billingPeriodId === null) {
    return (
      <section className="empty-panel" aria-labelledby="pdf-export-empty-title">
        <h2 id="pdf-export-empty-title">Noch kein PDF-Export möglich</h2>
        <p>Wähle zuerst ein Objekt und ein Abrechnungsjahr.</p>
      </section>
    )
  }

  const billingPeriod = data.billingData.billingPeriods.find(
    (period) => period.id === billingPeriodId,
  )
  if (!billingPeriod) {
    return (
      <p role="alert">Der gewählte Abrechnungszeitraum wurde nicht gefunden.</p>
    )
  }
  if (
    billingPeriod.status !== 'READY_FOR_PDF' &&
    billingPeriod.status !== 'FINALIZED'
  ) {
    return (
      <section
        className="empty-panel"
        aria-labelledby="pdf-export-locked-title"
      >
        <h2 id="pdf-export-locked-title">Noch nicht bereit</h2>
        <p>
          PDF-Ausgabe und Export sind erst verfügbar, sobald die Prüfung unter
          „Freigabe“ abgeschlossen ist.
        </p>
      </section>
    )
  }

  let calculationSnapshot
  try {
    calculationSnapshot = latestCalculationSnapshot(data, billingPeriodId)
  } catch (caught) {
    return (
      <p role="alert">
        {caught instanceof Error
          ? caught.message
          : 'Der Berechnungsstand kann nicht für PDF verwendet werden.'}
      </p>
    )
  }
  if (!calculationSnapshot) {
    return (
      <p role="alert">
        Für dieses Abrechnungsjahr liegt noch keine Berechnung vor.
      </p>
    )
  }
  const { output: calculation, calculationRunId } = calculationSnapshot

  const occupancies = tenantOccupancies(data, billingPeriodId)
  const documents = data.billingData.documents.filter(
    (document) => document.billingPeriodId === billingPeriodId,
  )
  const currentBillingPeriodId = billingPeriodId

  async function record(
    generated: readonly {
      readonly kind: RecordGeneratedDocumentInput['kind']
      readonly fileName: string
      readonly bytes: Uint8Array
      readonly occupancyPeriodId?: string
    }[],
  ) {
    const inputs = await Promise.all(
      generated.map(async (item): Promise<RecordGeneratedDocumentInput> => ({
        billingPeriodId: currentBillingPeriodId,
        calculationRunId,
        kind: item.kind,
        fileName: item.fileName,
        sha256: await sha256Hex(item.bytes),
        occupancyPeriodId: item.occupancyPeriodId,
      })),
    )
    const applied = onApply((current) =>
      recordGeneratedDocuments(current, inputs),
    )
    if (!applied) {
      throw new Error('Der Dokumenteneintrag konnte nicht gespeichert werden.')
    }
  }

  async function withErrorHandling(task: () => Promise<void>) {
    setError(null)
    try {
      await task()
    } catch (caught) {
      setError(
        caught instanceof MissingShippingAddressError
          ? 'Für dieses Mietverhältnis fehlt eine Versandadresse.'
          : caught instanceof Error
            ? caught.message
            : 'Das Dokument konnte nicht erzeugt werden.',
      )
    } finally {
      setBusy(null)
    }
  }

  function downloadTenantStatement(
    occupancyPeriod: (typeof occupancies)[number],
  ) {
    setBusy(occupancyPeriod.id)
    void withErrorHandling(async () => {
      const context = buildTenantStatementContext(
        data,
        billingPeriod!,
        calculation!,
        occupancyPeriod,
      )
      const docDefinition = buildTenantStatement(context)
      const blob = await renderPdfBlob(docDefinition)
      const personName =
        context.persons.map((person) => person.displayName ?? '').join('_') ||
        'Unbekannt'
      const fileName = tenantFileName(
        billingPeriod!.year,
        context.unit.label ?? occupancyPeriod.unitId,
        personName,
      )
      await record([
        {
          kind: 'tenant_statement',
          fileName,
          bytes: await blobBytes(blob),
          occupancyPeriodId: occupancyPeriod.id,
        },
      ])
      downloadBlob(blob, fileName)
    })
  }

  function downloadCombinedStatement() {
    setBusy('combined')
    void withErrorHandling(async () => {
      const context = buildCombinedCostStatementContext(
        data,
        billingPeriod!,
        calculation!,
      )
      const docDefinition = buildCombinedCostStatement(context)
      const blob = await renderPdfBlob(docDefinition)
      const fileName = `NK_${billingPeriod!.year}_Kostenaufstellung.pdf`
      await record([
        {
          kind: 'combined_statement',
          fileName,
          bytes: await blobBytes(blob),
        },
      ])
      downloadBlob(blob, fileName)
    })
  }

  function downloadZipBundle() {
    setBusy('zip')
    void withErrorHandling(async () => {
      const entries: ZipEntry[] = []
      for (const occupancyPeriod of occupancies) {
        const context = buildTenantStatementContext(
          data,
          billingPeriod!,
          calculation!,
          occupancyPeriod,
        )
        const docDefinition = buildTenantStatement(context)
        const blob = await renderPdfBlob(docDefinition)
        const personName =
          context.persons.map((person) => person.displayName ?? '').join('_') ||
          'Unbekannt'
        const fileName = tenantFileName(
          billingPeriod!.year,
          context.unit.label ?? occupancyPeriod.unitId,
          personName,
        )
        entries.push({ fileName, bytes: await blobBytes(blob) })
      }
      if (entries.length === 0) {
        throw new Error('Keine Mieter für den ZIP-Export vorhanden.')
      }
      const zipBlob = await renderZipBlob(entries)
      const zipFileName = `NK_${billingPeriod!.year}_Einzel-PDFs.zip`
      await record([
        ...entries.map((entry, index) => ({
          kind: 'tenant_statement' as const,
          fileName: entry.fileName,
          bytes: entry.bytes,
          occupancyPeriodId: occupancies[index]!.id,
        })),
        {
          kind: 'zip_bundle',
          fileName: zipFileName,
          bytes: await blobBytes(zipBlob),
        },
      ])
      downloadBlob(zipBlob, zipFileName)
    })
  }

  return (
    <section
      className="pdf-export-workspace"
      aria-labelledby="pdf-export-title"
    >
      <header className="section-heading">
        <div>
          <p className="section-kicker">Abrechnungsjahr {billingPeriod.year}</p>
          <h2 id="pdf-export-title">PDF und Export</h2>
        </div>
      </header>

      {error ? <p role="alert">{error}</p> : null}

      <div className="form-actions" aria-label="Objektweite Dokumente">
        <button
          className="button button--primary"
          type="button"
          disabled={busy !== null}
          onClick={downloadCombinedStatement}
        >
          {busy === 'combined' ? 'Wird erzeugt …' : 'Gesamtabrechnung (PDF)'}
        </button>
        <button
          className="button button--quiet"
          type="button"
          disabled={busy !== null || occupancies.length === 0}
          onClick={downloadZipBundle}
        >
          {busy === 'zip' ? 'Wird erzeugt …' : 'Alle Einzelabrechnungen (ZIP)'}
        </button>
      </div>

      <section aria-labelledby="pdf-export-tenants-title">
        <h3 id="pdf-export-tenants-title">Einzelabrechnungen</h3>
        {occupancies.length === 0 ? (
          <p>Keine Mieter für dieses Abrechnungsjahr erfasst.</p>
        ) : (
          <ul>
            {occupancies.map((occupancyPeriod) => {
              const unit = data.masterData.units.find(
                ({ id }) => id === occupancyPeriod.unitId,
              )
              return (
                <li key={occupancyPeriod.id}>
                  <span>{unit?.label ?? occupancyPeriod.unitId}</span>
                  <button
                    className="button button--quiet"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => downloadTenantStatement(occupancyPeriod)}
                  >
                    {busy === occupancyPeriod.id
                      ? 'Wird erzeugt …'
                      : 'Einzelabrechnung (PDF)'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="pdf-export-documents-title">
        <h3 id="pdf-export-documents-title">Erzeugte Dokumente</h3>
        {documents.length === 0 ? (
          <p>Noch keine Dokumente erzeugt.</p>
        ) : (
          <ul>
            {documents.map((document) => (
              <li key={document.id}>
                <time dateTime={document.createdAt}>
                  {new Date(document.createdAt).toLocaleString('de-DE')}
                </time>{' '}
                <span>{document.fileName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
