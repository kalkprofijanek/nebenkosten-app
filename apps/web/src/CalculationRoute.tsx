import type { AppDataFile } from '@nebenkosten/schema'
import { useState } from 'react'

import { runCalculation } from './features/calculation/calculate-preview'
import { validationIssueLink } from './features/release/validation-links'

interface CalculationRouteProps {
  readonly data: AppDataFile
  readonly billingPeriodId: string | null
  readonly onApply: (transform: (data: AppDataFile) => AppDataFile) => boolean
}

function euro(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function CalculationRoute({
  data,
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

  const billingPeriod = data.billingData.billingPeriods.find(
    (period) => period.id === billingPeriodId,
  )
  const calculationLocked =
    billingPeriod?.status === 'READY_FOR_PDF' ||
    billingPeriod?.status === 'FINALIZED' ||
    billingPeriod?.status === 'SUPERSEDED'
  const controlDifferenceTooLarge =
    result !== undefined && Math.abs(result.totals.controlDifferenceCents) > 1

  return (
    <section className="calculation-panel" aria-labelledby="calculation-title">
      <header className="section-heading">
        <div>
          <p className="section-kicker">
            {billingPeriod
              ? `Abrechnungsjahr ${billingPeriod.year}`
              : 'Ergebnis'}
          </p>
          <h2 id="calculation-title">Berechnungslauf</h2>
        </div>
        {latestRun ? (
          <span
            className={`status-pill status-pill--${controlDifferenceTooLarge ? 'draft' : 'ready_for_pdf'}`}
          >
            {controlDifferenceTooLarge
              ? 'Rechenstand fehlerhaft'
              : 'Rechenstand aktuell'}
          </span>
        ) : null}
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {billingPeriodId === null ? (
        <p>Wähle zuerst ein Objekt und ein Abrechnungsjahr.</p>
      ) : calculationLocked ? (
        <p>
          Dieses Abrechnungsjahr ist für neue Berechnungen gesperrt. Öffne
          zuerst kontrolliert die Prüfung.
        </p>
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
        <>
          <p className="calculation-meta">
            Berechnet am{' '}
            <time dateTime={latestRun!.startedAt}>
              {dateTime(latestRun!.startedAt)}
            </time>
          </p>
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
            {controlDifferenceTooLarge ? (
              <div>
                <dt>Noch nicht verteilt</dt>
                <dd>{euro(Math.abs(result.totals.controlDifferenceCents))}</dd>
              </div>
            ) : null}
          </dl>
          {controlDifferenceTooLarge ? (
            <section className="calculation-warnings" role="alert">
              <strong>Kontrolldifferenz ist größer als 1 Cent.</strong>
              <p>
                Prüfe die erfassten Kosten und die Heizkosten, bevor du die
                Abrechnung freigibst.
              </p>
              <a href="#/kosten">Kosten prüfen</a>{' '}
              <a href="#/heizkreise">Heizung prüfen</a>
            </section>
          ) : null}
          {result.warnings.length > 0 ? (
            <section
              className="calculation-warnings"
              aria-labelledby="calculation-warnings-title"
            >
              <h3 id="calculation-warnings-title">
                Hinweise aus der Berechnung
              </h3>
              <ul>
                {result.warnings.map((warning, index) => {
                  const editLink = validationIssueLink(warning)
                  return (
                    <li key={`${warning.code}:${index}`}>
                      <strong>{warning.title}</strong>
                      {warning.detail ? <p>{warning.detail}</p> : null}
                      <a href={editLink.href}>{editLink.label}</a>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : !controlDifferenceTooLarge ? (
            <p className="privacy-note">
              Keine Rechenwarnungen. Die Kontrolldifferenz liegt im zulässigen
              Bereich.
            </p>
          ) : null}
        </>
      ) : (
        <p>Noch kein gespeichertes Ergebnis für diesen Zeitraum.</p>
      )}
    </section>
  )
}
