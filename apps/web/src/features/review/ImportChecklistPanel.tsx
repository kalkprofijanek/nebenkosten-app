import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { useMemo } from 'react'
import { importChecklist } from './import-checklist'

/**
 * Prüfliste „Neue Angaben nach Import einer Altdatei“ (PR-35). Erscheint nur,
 * wenn etwas fehlt.
 */
export function ImportChecklistPanel({
  data,
  period,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
}) {
  const items = useMemo(() => importChecklist(data, period), [data, period])
  if (items.length === 0) return null
  return (
    <section aria-labelledby="import-checklist-title">
      <h3 id="import-checklist-title">Neue Angaben ergänzen</h3>
      <p className="privacy-note">
        Diese Angaben kannte das alte Dateiformat nicht. Sie verbessern die
        Abrechnung nach HeizKV; fehlende Angaben werden mit den bisherigen
        Verfahren gerechnet.
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <strong>
              {item.scope ? `${item.scope}: ` : ''}
              {item.title}
            </strong>
            <p>{item.detail}</p>
            <a href={item.href}>Ergänzen</a>
          </li>
        ))}
      </ul>
    </section>
  )
}
