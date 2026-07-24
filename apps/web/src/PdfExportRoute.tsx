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
  latestCalculationOutput,
  tenantOccupancies,
} from './features/pdf/context'
import { recordGeneratedDocument } from './features/pdf/commands'
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

  const calculation = latestCalculationOutput(data, billingPeriodId)
  if (!calculation) {
    return (
      <p role="alert">
        Für dieses Abrechnungsjahr liegt noch keine Berechnung vor.
      </p>
    )
  }

  const occupancies = tenantOccupancies(data, billingPeriodId)
  const documents = data.billingData.documents.filter(
    (document) => document.billingPeriodId === billingPeriodId,
  )
  const currentBillingPeriodId = billingPeriodId

  async function record(
    kind: 'tenant_statement' | 'combined_statement' | 'zip_bundle',
    fileName: string,
    bytes: Uint8Array,
    occupancyPeriodId?: string,
  ) {
    const hash = await sha256Hex(bytes)
    const applied = onApply((current) =>
      recordGeneratedDocument(current, {
        billingPeriodId: currentBillingPeriodId,
        kind,
        fileName,
        sha256: hash,
        occupancyPeriodId,
      }),
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
      downloadBlob(blob, fileName)
      await record(
        'tenant_statement',
        fileName,
        await blobBytes(blob),
        occupancyPeriod.id,
      )
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
      downloadBlob(blob, fileName)
      await record('combined_statement', fileName, await blobBytes(blob))
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
      downloadBlob(zipBlob, zipFileName)
      await record('zip_bundle', zipFileName, await blobBytes(zipBlob))
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
