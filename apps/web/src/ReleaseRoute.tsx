import type {
  AppDataFile,
  BillingPeriodStatus,
  ValidationArea,
  ValidationIssue,
  ValidationSeverity,
} from '@nebenkosten/schema'
import {
  getFinalizationDocumentStatus,
  transitionBillingPeriod,
  validateBillingPeriod,
} from '@nebenkosten/validators'
import { useMemo, useState } from 'react'

interface ReleaseRouteProps {
  readonly data: AppDataFile
  readonly billingPeriodId: string | null
  readonly onApply: (transform: (data: AppDataFile) => AppDataFile) => boolean
}

interface ReleaseInteraction {
  readonly billingPeriodId: string | null
  readonly confirmedWarningKeys: readonly string[]
  readonly reopenReason: string
  readonly dispatchDate: string
  readonly actionError: string | null
}

type IssueWithKey = ValidationIssue & { readonly key: string }

const statusLabels: Readonly<Record<BillingPeriodStatus, string>> = {
  DRAFT: 'Entwurf',
  IN_REVIEW: 'In Prüfung',
  READY_FOR_PDF: 'PDF-bereit',
  FINALIZED: 'Finalisiert',
  SUPERSEDED: 'Ersetzt',
}

const severityLabels: Readonly<Record<ValidationSeverity, string>> = {
  error: 'Fehler',
  warning: 'Warnungen',
  info: 'Hinweise',
}

const areaLabels: Readonly<Record<ValidationArea, string>> = {
  master_data: 'Stammdaten',
  billing_period: 'Abrechnungszeitraum',
  occupancy: 'Nutzer und Belegung',
  costs: 'Kosten',
  bookings: 'Buchungen',
  heating: 'Heizung',
  hot_water: 'Warmwasser',
  co2: 'CO₂',
  meters: 'Zähler',
  prepayments: 'Vorauszahlungen',
  totals: 'Summen',
  documents: 'Dokumente',
  migration: 'Migration',
  schema: 'Dateiformat',
  other: 'Sonstiges',
}

const severityOrder: readonly ValidationSeverity[] = [
  'error',
  'warning',
  'info',
]

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function safeDate(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? 'Zeitpunkt nicht verfügbar'
    : new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

export function ReleaseRoute({
  data,
  billingPeriodId,
  onApply,
}: ReleaseRouteProps) {
  const [interaction, setInteraction] = useState<ReleaseInteraction>({
    billingPeriodId,
    confirmedWarningKeys: [],
    reopenReason: '',
    dispatchDate: '',
    actionError: null,
  })
  const documentStatusResult = useMemo(() => {
    if (billingPeriodId === null) {
      return { status: null, error: null }
    }
    try {
      return {
        status: getFinalizationDocumentStatus(data, billingPeriodId),
        error: null,
      }
    } catch (caught) {
      return {
        status: null,
        error:
          caught instanceof Error
            ? caught.message
            : 'Der Dokumentenstatus konnte nicht geprüft werden.',
      }
    }
  }, [billingPeriodId, data])
  const activeInteraction: ReleaseInteraction =
    interaction.billingPeriodId === billingPeriodId
      ? interaction
      : {
          billingPeriodId,
          confirmedWarningKeys: [],
          reopenReason: '',
          dispatchDate: '',
          actionError: null,
        }
  const { actionError, confirmedWarningKeys, reopenReason, dispatchDate } =
    activeInteraction

  if (billingPeriodId === null) {
    return (
      <section className="empty-panel" aria-labelledby="release-empty-title">
        <h2 id="release-empty-title">Noch keine Freigabeprüfung</h2>
        <p>Wähle zuerst ein Objekt und ein Abrechnungsjahr.</p>
      </section>
    )
  }

  const selectedBillingPeriodId = billingPeriodId

  const billingPeriod = data.billingData.billingPeriods.find(
    ({ id }) => id === selectedBillingPeriodId,
  )
  if (billingPeriod === undefined) {
    return (
      <p role="alert">Der gewählte Abrechnungszeitraum wurde nicht gefunden.</p>
    )
  }

  let report: ReturnType<typeof validateBillingPeriod>
  try {
    report = validateBillingPeriod(data, selectedBillingPeriodId, {
      confirmedWarningKeys,
    })
  } catch (caught) {
    return (
      <p role="alert">
        {caught instanceof Error
          ? caught.message
          : 'Die Freigabeprüfung konnte nicht ausgeführt werden.'}
      </p>
    )
  }

  const issues = report.issues as readonly IssueWithKey[]
  const warningKeys = issues
    .filter(({ severity }) => severity === 'warning')
    .map(({ key }) => key)
  const confirmedCurrentWarningKeys = warningKeys.filter((key) =>
    confirmedWarningKeys.includes(key),
  )
  const auditEvents = data.billingData.auditEvents.filter(
    (event) => event.billingPeriodId === selectedBillingPeriodId,
  )
  const readOnly =
    billingPeriod.status === 'FINALIZED' ||
    billingPeriod.status === 'SUPERSEDED'
  if (documentStatusResult.error !== null) {
    return <p role="alert">{documentStatusResult.error}</p>
  }
  const documentStatus = documentStatusResult.status!

  function applyTransition(
    target: BillingPeriodStatus,
    options?: Parameters<typeof transitionBillingPeriod>[3],
  ) {
    setInteraction({ ...activeInteraction, actionError: null })
    try {
      const applied = onApply((current) =>
        transitionBillingPeriod(
          current,
          selectedBillingPeriodId,
          target,
          options,
        ),
      )
      if (!applied) {
        setInteraction({
          ...activeInteraction,
          actionError:
            'Der neue Freigabestatus konnte nicht gespeichert werden.',
        })
      } else {
        setInteraction({
          billingPeriodId: selectedBillingPeriodId,
          confirmedWarningKeys: [],
          reopenReason: '',
          dispatchDate: '',
          actionError: null,
        })
      }
    } catch (caught) {
      setInteraction({
        ...activeInteraction,
        actionError:
          caught instanceof Error
            ? caught.message
            : 'Der Freigabestatus konnte nicht geändert werden.',
      })
    }
  }

  function toggleWarning(key: string) {
    setInteraction({
      ...activeInteraction,
      confirmedWarningKeys: confirmedWarningKeys.includes(key)
        ? confirmedWarningKeys.filter((item) => item !== key)
        : [...confirmedWarningKeys, key],
    })
  }

  return (
    <section className="release-workspace" aria-labelledby="release-title">
      <header className="section-heading">
        <div>
          <p className="section-kicker">Abrechnungsjahr {billingPeriod.year}</p>
          <h2 id="release-title">Prüfung und Freigabe</h2>
        </div>
        <span
          className={`status-pill status-pill--${billingPeriod.status.toLowerCase()}`}
        >
          {statusLabels[billingPeriod.status]}
        </span>
      </header>

      {actionError ? <p role="alert">{actionError}</p> : null}

      <dl className="result-grid" aria-label="Ergebnis der Freigabeprüfung">
        <div>
          <dt>Fehler</dt>
          <dd>{countLabel(report.errorCount, 'Fehler', 'Fehler')}</dd>
        </div>
        <div>
          <dt>Warnungen</dt>
          <dd>{countLabel(report.warningCount, 'Warnung', 'Warnungen')}</dd>
        </div>
        <div>
          <dt>Hinweise</dt>
          <dd>{countLabel(report.infoCount, 'Hinweis', 'Hinweise')}</dd>
        </div>
      </dl>

      {billingPeriod.status === 'READY_FOR_PDF' ? (
        <p className="privacy-note">
          <strong>PDF-Ausgabe bereit.</strong> Die fachliche Prüfung wurde
          abgeschlossen.
        </p>
      ) : null}
      {readOnly ? <p>Dieser Abrechnungsstand ist schreibgeschützt.</p> : null}

      {billingPeriod.status === 'READY_FOR_PDF' && !documentStatus.complete ? (
        <div className="privacy-note" role="status">
          <strong>Dokumente noch unvollständig.</strong>
          {documentStatus.missingCombinedStatement ? (
            <p>Gesamtabrechnung fehlt.</p>
          ) : null}
          {documentStatus.missingTenantStatementCount > 0 ? (
            <p>
              {documentStatus.missingTenantStatementCount}{' '}
              {documentStatus.missingTenantStatementCount === 1
                ? 'Einzelabrechnung fehlt.'
                : 'Einzelabrechnungen fehlen.'}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="validation-groups">
        {severityOrder.flatMap((severity) => {
          const areas = Array.from(
            new Set(
              issues
                .filter((issue) => issue.severity === severity)
                .map((issue) => issue.area),
            ),
          )
          return areas.map((area) => {
            const group = issues.filter(
              (issue) => issue.severity === severity && issue.area === area,
            )
            const heading = `${severityLabels[severity]} – ${areaLabels[area]}`
            return (
              <section key={`${severity}:${area}`} aria-label={heading}>
                <h3>{heading}</h3>
                <ul>
                  {group.map((issue) => (
                    <li key={issue.key}>
                      <strong>{issue.title}</strong>
                      {issue.detail ? <p>{issue.detail}</p> : null}
                      {billingPeriod.status === 'IN_REVIEW' &&
                      issue.severity === 'warning' ? (
                        <label>
                          <input
                            type="checkbox"
                            checked={confirmedWarningKeys.includes(issue.key)}
                            onChange={() => toggleWarning(issue.key)}
                          />
                          {issue.title} ({issue.key}) bestätigen
                        </label>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        })}
        {issues.length === 0 ? <p>Keine Prüfhinweise vorhanden.</p> : null}
      </div>

      <div className="form-actions" aria-label="Freigabeaktionen">
        {billingPeriod.status === 'DRAFT' ? (
          <button
            className="button button--primary"
            type="button"
            onClick={() => applyTransition('IN_REVIEW')}
          >
            Prüfung starten
          </button>
        ) : null}
        {billingPeriod.status === 'IN_REVIEW' ? (
          <button
            className="button button--primary"
            type="button"
            disabled={!report.canBecomeReady}
            onClick={() =>
              applyTransition('READY_FOR_PDF', {
                confirmedWarningKeys: confirmedCurrentWarningKeys,
              })
            }
          >
            Für PDF freigeben
          </button>
        ) : null}
        {billingPeriod.status === 'READY_FOR_PDF' ? (
          <>
            <label htmlFor="reopen-reason">Grund für das Wiederöffnen</label>
            <textarea
              id="reopen-reason"
              value={reopenReason}
              maxLength={500}
              onChange={(event) =>
                setInteraction({
                  ...activeInteraction,
                  reopenReason: event.target.value,
                })
              }
            />
            <button
              className="button button--quiet"
              type="button"
              disabled={reopenReason.trim().length === 0}
              onClick={() =>
                applyTransition('IN_REVIEW', { reason: reopenReason.trim() })
              }
            >
              Wieder öffnen
            </button>
            <label htmlFor="dispatch-date">Versanddatum</label>
            <input
              id="dispatch-date"
              type="date"
              value={dispatchDate}
              onChange={(event) =>
                setInteraction({
                  ...activeInteraction,
                  dispatchDate: event.target.value,
                })
              }
            />
            <button
              className="button button--primary"
              type="button"
              disabled={
                dispatchDate.trim().length === 0 || !documentStatus.complete
              }
              onClick={() =>
                applyTransition('FINALIZED', {
                  dispatchDate: dispatchDate.trim(),
                })
              }
            >
              Finalisieren
            </button>
          </>
        ) : null}
      </div>

      <section aria-labelledby="audit-title">
        <h3 id="audit-title">Freigabehistorie</h3>
        {auditEvents.length === 0 ? (
          <p>Noch keine Statusänderung protokolliert.</p>
        ) : (
          <ol>
            {auditEvents.map((event) => (
              <li key={event.id}>
                <time dateTime={event.timestamp}>
                  {safeDate(event.timestamp)}
                </time>{' '}
                <span>{event.action}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  )
}
