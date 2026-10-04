import type { AppDataFile } from '@nebenkosten/schema'
import { validateBillingPeriodCached } from '@nebenkosten/validators'
import { useState, type ReactNode } from 'react'
import { validationIssueLink } from '../release/validation-links'
import { billingJourneySteps } from './billing-journey-steps'
import './billing-journey.css'

interface Props {
  readonly data: AppDataFile
  readonly billingPeriodId: string | null
  readonly renderStep: (path: string) => ReactNode
}

function inputSignature(data: AppDataFile, billingPeriodId: string | null) {
  const inputs = Object.fromEntries(
    Object.entries(data.billingData).filter(
      ([key]) =>
        ![
          'calculationRuns',
          'calculationResults',
          'documents',
          'auditEvents',
        ].includes(key),
    ),
  )
  return JSON.stringify([billingPeriodId, data.masterData, inputs])
}

export function BillingJourney({ data, billingPeriodId, renderStep }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [review, setReview] = useState({ signature: '', steps: [] as number[] })
  const signature = inputSignature(data, billingPeriodId)
  const reviewed = review.signature === signature ? review.steps : []
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period)
    return (
      <section className="empty-panel">
        <h2>Jahresabrechnung vorbereiten</h2>
        <p>
          Lege zuerst Firma, Objekt und Abrechnungsjahr an oder wähle sie oben
          aus.
        </p>
        <a href="#/firmen">Firma anlegen</a>
        {' · '}
        <a href="#/objekte">Objekt auswählen</a>
        {' · '}
        <a href="#/abrechnungsjahre">Abrechnungsjahr auswählen</a>
      </section>
    )
  const step = billingJourneySteps[activeIndex]!
  const property = data.masterData.properties.find(
    ({ id }) => id === period.propertyId,
  )
  const units = data.masterData.units.filter(
    ({ propertyId }) => propertyId === period.propertyId,
  )
  const occupancies = data.billingData.occupancyPeriods.filter(
    ({ billingPeriodId: id }) => id === period.id,
  )
  const emptyUnits = units.filter(
    ({ id }) => !occupancies.some(({ unitId }) => unitId === id),
  )
  let issues: ReturnType<typeof validateBillingPeriodCached>['issues'] = []
  let validationError: string | null = null
  try {
    issues = validateBillingPeriodCached(data, period.id).issues
  } catch {
    validationError =
      'Die Angaben konnten nicht geprüft werden. Öffne die Freigabeprüfung für weitere Informationen.'
  }
  const stepIssues = issues.filter(({ area }) => step.areas.includes(area))
  function go(index: number) {
    setActiveIndex(index)
  }
  return (
    <section className="billing-journey" aria-label="Geführte Jahresabrechnung">
      <header className="journey-context">
        <div>
          <strong>
            {property?.address?.street ??
              property?.internalNumber ??
              'Ausgewähltes Objekt'}
          </strong>
          <p>
            {period.periodStart} bis {period.periodEnd} · {units.length}{' '}
            Wohnungen
          </p>
        </div>
        <a href="#/objekte">Objekt bearbeiten</a>
      </header>
      <nav aria-label="Schritte der Jahresabrechnung">
        <ol className="journey-steps">
          {billingJourneySteps.map((item, index) => (
            <li key={item.title}>
              <button
                type="button"
                aria-current={activeIndex === index ? 'step' : undefined}
                onClick={() => go(index)}
              >
                <span>
                  {index + 1}. {item.title}
                </span>
                <small>
                  {reviewed.includes(index) ? 'Durchgesehen' : 'Offen'}
                </small>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <p role="status">
        {reviewed.length} von 8 Schritten in dieser Sitzung durchgesehen
      </p>
      <p className="journey-note">
        Die Durchsicht ist eine Arbeitshilfe für diese Sitzung. Änderungen
        setzen sie zurück. Die verbindliche Freigabe erfolgt im letzten Schritt.
      </p>
      <section aria-labelledby="journey-step-title" className="journey-content">
        <h2 id="journey-step-title">
          {activeIndex + 1}. {step.title}
        </h2>
        <p>{step.description}</p>
        {activeIndex === 1 && emptyUnits.length > 0 ? (
          <p role="alert">
            Ohne erfasste Belegung:{' '}
            {emptyUnits
              .map(({ label }) => label || 'Wohnung ohne Bezeichnung')
              .join(', ')}
            . Prüfe auch Lücken zwischen den Zeiträumen.
          </p>
        ) : null}
        {activeIndex === 3 ? (
          <aside className="journey-note">
            <strong>Ablesungen und Abrechnungsverbrauch prüfen</strong>
            <p>
              Wohnungswärmezähler können bei vollständigen Grenzablesungen den
              Verbrauch je Nutzerzeitraum liefern. Prüfe die Zuordnung und
              Vorschau und aktiviere den Messverbrauch ausdrücklich am
              Heizkreis. Ohne Aktivierung gelten weiterhin die manuell erfassten
              Verbrauchseinheiten.
            </p>
            <a href="#/verbrauch">Verbrauch je Belegung bearbeiten</a>
          </aside>
        ) : null}
        {validationError ? <p role="alert">{validationError}</p> : null}
        {stepIssues.length > 0 ? (
          <details className="journey-checks">
            <summary>
              {stepIssues.length} Prüfhinweise zu diesem Schritt
            </summary>
            <ul>
              {stepIssues.map((issue, index) => {
                const link = validationIssueLink(issue)
                return (
                  <li key={`${issue.code}-${index}`}>
                    <strong>
                      {issue.severity === 'error'
                        ? 'Fehler'
                        : issue.severity === 'warning'
                          ? 'Warnung'
                          : 'Hinweis'}
                      : {issue.title}
                    </strong>
                    {issue.detail ? <p>{issue.detail}</p> : null}
                    <a href={link.href}>{link.label}</a>
                  </li>
                )
              })}
            </ul>
          </details>
        ) : null}
        <div key={`${period.id}-${activeIndex}`} className="journey-editor">
          {renderStep(step.path)}
        </div>
        {activeIndex === 7 ? (
          <div className="journey-actions">
            <a href="#/pdf-export">PDF und Einzelabrechnungen öffnen</a>
            <a href="#/sicherung">JSON-Sicherung erstellen</a>
          </div>
        ) : null}
      </section>
      <footer className="journey-actions">
        <button
          type="button"
          disabled={activeIndex === 0}
          onClick={() => go(activeIndex - 1)}
        >
          Zurück
        </button>
        {activeIndex < billingJourneySteps.length - 1 ? (
          <>
            <button type="button" onClick={() => go(activeIndex + 1)}>
              Später prüfen – weiter
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                setReview({
                  signature,
                  steps: [...new Set([...reviewed, activeIndex])],
                })
                go(activeIndex + 1)
              }}
            >
              Geprüft – weiter
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() =>
              setReview({
                signature,
                steps: [...new Set([...reviewed, activeIndex])],
              })
            }
          >
            Durchsicht abschließen
          </button>
        )}
      </footer>
    </section>
  )
}
