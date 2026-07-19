import type { AppDataFile } from '@nebenkosten/schema'
import { useState } from 'react'

import { runCalculation } from './features/calculation/calculate-preview'

interface CalculationRouteProps {
  readonly data: AppDataFile
  readonly path: string
  readonly billingPeriodId: string | null
  readonly onApply: (transform: (data: AppDataFile) => AppDataFile) => boolean
}

function euro(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function CalculationRoute({
  data,
  path,
  billingPeriodId,
  onApply,
}: CalculationRouteProps) {
  const [error, setError] = useState<string | null>(null)
  const runs = data.billingData.calculationRuns.filter(
    (run) => run.billingPeriodId === billingPeriodId,
  )
  const latestRun = runs.at(-1)
  const result = latestRun
    ? data.billingData.calculationResults.find(
        (item) => item.calculationRunId === latestRun.id,
      )
    : undefined

  if (path === '/freigabe') {
    return (
      <section className="release-panel" aria-labelledby="release-status">
        <div>
          <span className="status-pill status-pill--draft">Entwurf</span>
          <h2 id="release-status">Freigabe bleibt bis PR 10 gesperrt</h2>
          <p>
            {result
              ? `Letzte Kontrolldifferenz: ${euro(result.totals.controlDifferenceCents)}.`
              : 'Führe zuerst eine Berechnung für das gewählte Abrechnungsjahr aus.'}
          </p>
        </div>
        <div className="release-score" aria-label="Freigabe gesperrt">
          <strong>PR 10</strong>
          <span>Validatoren und Statusübergänge folgen</span>
        </div>
      </section>
    )
  }

  return (
    <section className="calculation-panel" aria-labelledby="calculation-title">
      <h2 id="calculation-title">Berechnungslauf</h2>
      {error ? <p role="alert">{error}</p> : null}
      {billingPeriodId === null ? (
        <p>Wähle zuerst ein Objekt und ein Abrechnungsjahr.</p>
      ) : (
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setError(null)
            try {
              const applied = onApply((current) =>
                runCalculation(current, billingPeriodId),
              )
              if (!applied)
                setError('Die Berechnung konnte nicht gespeichert werden.')
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : 'Die Berechnung konnte nicht ausgeführt werden.',
              )
            }
          }}
        >
          Abrechnung berechnen
        </button>
      )}
      {result ? (
        <dl className="result-grid">
          <div>
            <dt>Erfasste Kosten</dt>
            <dd>{euro(result.totals.recordedCostsCents)}</dd>
          </div>
          <div>
            <dt>Mieteranteil</dt>
            <dd>{euro(result.totals.tenantTotalCents)}</dd>
          </div>
          <div>
            <dt>Vermieteranteil</dt>
            <dd>{euro(result.totals.landlordTotalCents)}</dd>
          </div>
          <div>
            <dt>Kontrolldifferenz</dt>
            <dd>{euro(result.totals.controlDifferenceCents)}</dd>
          </div>
        </dl>
      ) : (
        <p>Noch kein gespeichertes Ergebnis für diesen Zeitraum.</p>
      )}
    </section>
  )
}
