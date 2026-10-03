import type { CalculationOutput } from '@nebenkosten/core'
import {
  buildTenantStatement,
  MissingShippingAddressError,
} from '@nebenkosten/pdf'
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
} from '@nebenkosten/schema'
import { useState } from 'react'
import { buildTenantStatementContext } from '../pdf/context'
import { downloadBlob, renderPdfBlob } from '../pdf/render'

/**
 * Öffnet die Einzelabrechnung eines Mieters in einem neuen Tab. Vor der
 * Freigabe trägt das PDF das Wasserzeichen „ENTWURF“; es wird nicht als
 * erzeugtes Dokument protokolliert.
 */
export function OpenStatementButton({
  data,
  period,
  calculation,
  occupancy,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
  readonly calculation: CalculationOutput
  readonly occupancy: OccupancyPeriod
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const draft =
    period.status !== 'READY_FOR_PDF' && period.status !== 'FINALIZED'

  async function open() {
    setBusy(true)
    setError(null)
    // Das Fenster muss direkt im Klick geöffnet werden, sonst blockiert der
    // Popup-Blocker nach der (asynchronen) PDF-Erzeugung.
    const target = window.open('', '_blank')
    try {
      const definition = buildTenantStatement(
        buildTenantStatementContext(data, period, calculation, occupancy),
      )
      const blob = await renderPdfBlob(
        draft
          ? {
              ...definition,
              watermark: { text: 'ENTWURF', opacity: 0.08, bold: true },
            }
          : definition,
      )
      if (target) {
        target.location.href = URL.createObjectURL(blob)
      } else {
        downloadBlob(blob, `Abrechnung_${period.year}_${occupancy.id}.pdf`)
      }
    } catch (caught) {
      target?.close()
      setError(
        caught instanceof MissingShippingAddressError
          ? 'Versandadresse fehlt – bitte beim Nutzer eintragen.'
          : caught instanceof Error
            ? caught.message
            : 'Die Abrechnung konnte nicht geöffnet werden.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="button button--quiet"
        type="button"
        disabled={busy}
        onClick={() => void open()}
      >
        {busy
          ? 'Wird erzeugt …'
          : draft
            ? 'Entwurf öffnen'
            : 'Abrechnung öffnen'}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </>
  )
}
