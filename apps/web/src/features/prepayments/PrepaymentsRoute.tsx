import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { useMemo, useState } from 'react'
import { formatEuroInput, parseEuroCents } from '../../app/form-parsers'
import { setOccupancyPrepayment } from '../occupancies/commands'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'
import {
  adjustmentTarget,
  adjustmentTargetMessage,
  decidePrepaymentAdjustment,
  decisionMatchesProposal,
  defaultValidFrom,
  earliestValidFrom,
  isFirstOfMonth,
  latestAdjustmentDecision,
  localIsoDate,
  proposePrepaymentAdjustments,
  type AdjustmentProposal,
} from './adjustment'
import { buildPrepaymentOverview, type PrepaymentOverviewRow } from './overview'

type Apply = (transform: (data: AppDataFile) => AppDataFile) => boolean

interface PrepaymentsRouteProps {
  readonly data: AppDataFile
  readonly billingPeriodId: string | null
  /** Rohes Update; die Bearbeitungssperre prüft die Seite selbst je Zieljahr. */
  readonly onApply: Apply
  readonly today?: () => Date
}

interface Feedback {
  readonly kind: 'status' | 'alert'
  readonly text: string
}

const euro = (cents: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  )

const signedEuro = (cents: number) =>
  cents > 0 ? `+${euro(cents)}` : euro(cents)

function date(value: string): string {
  return value.split('-').reverse().join('.')
}

const MODE_LABELS = {
  monthly: 'monatlich',
  annual: 'jährlich',
  none_agreed: 'keine VZ vereinbart',
} as const

type Mode = keyof typeof MODE_LABELS

function useApply(onApply: Apply) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  function run(transform: Parameters<Apply>[0], success: string): boolean {
    setFeedback(null)
    try {
      if (!onApply(transform)) {
        setFeedback({
          kind: 'alert',
          text: 'Die Änderung konnte nicht gespeichert werden.',
        })
        return false
      }
      setFeedback({ kind: 'status', text: success })
      return true
    } catch (caught) {
      setFeedback({
        kind: 'alert',
        text:
          caught instanceof Error
            ? caught.message
            : 'Die Eingabe konnte nicht verarbeitet werden.',
      })
      return false
    }
  }
  return { feedback, setFeedback, run }
}

function FeedbackLine({ feedback }: { readonly feedback: Feedback | null }) {
  if (!feedback) return null
  return feedback.kind === 'alert' ? (
    <p role="alert">{feedback.text}</p>
  ) : (
    <p role="status">{feedback.text}</p>
  )
}

function previousLabel(row: PrepaymentOverviewRow): string {
  if (!row.previous) return '—'
  const { prepayment } = row.previous
  if (prepayment?.mode === 'monthly') return euro(prepayment.monthlyAmountCents)
  if (prepayment?.mode === 'annual')
    return `${euro(prepayment.annualAmountCents)} / Jahr`
  if (prepayment?.mode === 'none_agreed') return 'keine VZ'
  return '—'
}

function PrepaymentRow({
  row,
  data,
  locked,
  onSave,
}: {
  readonly row: PrepaymentOverviewRow
  readonly data: AppDataFile
  readonly locked: boolean
  readonly onSave: (
    row: PrepaymentOverviewRow,
    mode: Mode,
    amount: string,
  ) => void
}) {
  const current = row.prepayment
  const initialMode: Mode = current?.mode ?? 'monthly'
  const initialAmount =
    current?.mode === 'monthly'
      ? formatEuroInput(current.monthlyAmountCents)
      : current?.mode === 'annual'
        ? formatEuroInput(current.annualAmountCents)
        : ''
  const [mode, setMode] = useState<Mode>(initialMode)
  const [amount, setAmount] = useState(initialAmount)
  const dirty = mode !== initialMode || amount !== initialAmount
  const label = `${row.unitLabel} ${row.tenantName}`
  const pending = row.previous
    ? latestAdjustmentDecision(
        data,
        row.previous.billingPeriodId,
        row.previous.occupancyPeriodId,
      )
    : undefined
  const pendingHint =
    pending?.accepted && row.monthlyCents !== pending.newMonthlyCents
      ? `Beschlossene Anpassung: ${euro(pending.newMonthlyCents)} ab ${date(pending.validFrom)}`
      : null

  return (
    <tr>
      <th scope="row">{row.unitLabel}</th>
      <td>{row.tenantName}</td>
      <td>
        {date(row.from)} – {date(row.to)}
      </td>
      <td>
        {locked ? (
          current ? (
            MODE_LABELS[current.mode]
          ) : (
            'nicht erfasst'
          )
        ) : (
          <select
            aria-label={`Modus ${label}`}
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
          >
            {Object.entries(MODE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="data-table__amount">
        {locked ? (
          current?.mode === 'monthly' ? (
            euro(current.monthlyAmountCents)
          ) : current?.mode === 'annual' ? (
            `${euro(current.annualAmountCents)} / Jahr`
          ) : (
            '—'
          )
        ) : mode === 'none_agreed' ? (
          '—'
        ) : (
          <input
            className="prepayment-amount-input"
            aria-label={`${mode === 'annual' ? 'Jahresbetrag' : 'Monatsbetrag'} ${label}`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        )}
        {!locked && mode === 'annual' ? <small>Jahresbetrag</small> : null}
      </td>
      <td className="data-table__amount">{euro(row.annualTargetCents)}</td>
      <td className="data-table__amount">
        {previousLabel(row)}
        {pendingHint ? <small>{pendingHint}</small> : null}
      </td>
      <td className="data-table__amount">
        {row.differenceCents === null ? '—' : signedEuro(row.differenceCents)}
      </td>
      {locked ? null : (
        <td>
          <button
            className="button button--quiet"
            type="button"
            disabled={!dirty}
            aria-label={`Vorauszahlung speichern ${label}`}
            onClick={() => onSave(row, mode, amount)}
          >
            Speichern
          </button>
        </td>
      )}
    </tr>
  )
}

function PrepaymentTable({
  data,
  billingPeriodId,
  onApply,
}: {
  readonly data: AppDataFile
  readonly billingPeriodId: string
  readonly onApply: Apply
}) {
  const { feedback, setFeedback, run } = useApply(onApply)
  const overview = useMemo(
    () => buildPrepaymentOverview(data, billingPeriodId)!,
    [data, billingPeriodId],
  )
  const { period, rows, totals, previousPeriod } = overview
  const locked = period.status !== 'DRAFT'

  function save(row: PrepaymentOverviewRow, mode: Mode, amount: string) {
    let input
    try {
      input =
        mode === 'none_agreed'
          ? ({ mode } as const)
          : mode === 'annual'
            ? ({ mode, annualAmountCents: parseEuroCents(amount) } as const)
            : ({ mode, monthlyAmountCents: parseEuroCents(amount) } as const)
    } catch (caught) {
      setFeedback({ kind: 'alert', text: (caught as Error).message })
      return
    }
    if (
      ('monthlyAmountCents' in input && input.monthlyAmountCents < 0) ||
      ('annualAmountCents' in input && input.annualAmountCents < 0)
    ) {
      setFeedback({
        kind: 'alert',
        text: 'Die Vorauszahlung darf nicht negativ sein.',
      })
      return
    }
    run(
      (current) =>
        applyEditableBillingPeriodChange(current, period.id, (draft) =>
          setOccupancyPrepayment(draft, {
            occupancyPeriodId: row.occupancy.id,
            ...input,
          }),
        ),
      `Vorauszahlung für ${row.unitLabel} (${row.tenantName}) gespeichert.`,
    )
  }

  return (
    <section aria-labelledby="prepayment-overview-title">
      <header className="section-heading">
        <div>
          <p className="section-kicker">Abrechnungsjahr {period.year}</p>
          <h2 id="prepayment-overview-title">Vorauszahlungen je Mieter</h2>
        </div>
      </header>
      {locked ? (
        <p className="calculation-warnings">
          Das Abrechnungsjahr {period.year} ist gesperrt. Die Vorauszahlungen
          sind nur lesbar; öffne unter „Freigabe“ kontrolliert die Prüfung, um
          sie zu ändern.
        </p>
      ) : (
        <p>
          Änderungen gelten für das gesamte Abrechnungsjahr und verwerfen einen
          gespeicherten Rechenstand dieses Jahres.
          {previousPeriod
            ? ` Die Spalte „Vorjahr“ zeigt den Betrag desselben Mietverhältnisses ${previousPeriod.year}.`
            : ' Für das Vorjahr ist kein Abrechnungsjahr angelegt.'}
        </p>
      )}
      <FeedbackLine feedback={feedback} />
      {rows.length === 0 ? (
        <p>Für dieses Abrechnungsjahr sind keine Mieter erfasst.</p>
      ) : (
        <div
          className="data-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Vorauszahlungen horizontal scrollen"
        >
          <table className="data-table" aria-label="Vorauszahlungen">
            <thead>
              <tr>
                <th scope="col">Wohnung</th>
                <th scope="col">Nutzer</th>
                <th scope="col">Zeitraum</th>
                <th scope="col">Modus</th>
                <th scope="col">Monatlich</th>
                <th scope="col">Jahressoll</th>
                <th scope="col">Vorjahr</th>
                <th scope="col">Differenz</th>
                {locked ? null : <th scope="col">Aktion</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <PrepaymentRow
                  key={`${row.occupancy.id}:${row.prepayment ? JSON.stringify(row.prepayment) : ''}`}
                  row={row}
                  data={data}
                  locked={locked}
                  onSave={save}
                />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{`Summe (${rows.length})`}</th>
                <td />
                <td />
                <td />
                <td className="data-table__amount">
                  {euro(totals.monthlyCents)}
                </td>
                <td className="data-table__amount">
                  {euro(totals.annualTargetCents)}
                </td>
                <td className="data-table__amount">
                  {euro(totals.previousMonthlyCents)}
                </td>
                <td className="data-table__amount">
                  {signedEuro(totals.differenceCents)}
                </td>
                {locked ? null : <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

function AdjustmentRow({
  data,
  period,
  proposal,
  validFrom,
  validFromValid,
  today,
  onDecide,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
  readonly proposal: AdjustmentProposal
  readonly validFrom: string
  readonly validFromValid: boolean
  readonly today: () => Date
  readonly onDecide: (
    proposal: AdjustmentProposal,
    accepted: boolean,
    amount: string,
  ) => void
}) {
  const decision = latestAdjustmentDecision(
    data,
    period.id,
    proposal.occupancyPeriodId,
  )
  const stale =
    decision !== undefined && !decisionMatchesProposal(decision, proposal)
  const [amount, setAmount] = useState(() =>
    formatEuroInput(
      decision && !stale
        ? decision.newMonthlyCents
        : proposal.proposedMonthlyCents,
    ),
  )
  const unit = data.masterData.units.find(
    ({ id }) =>
      id ===
      data.billingData.occupancyPeriods.find(
        (item) => item.id === proposal.occupancyPeriodId,
      )?.unitId,
  )
  const tenancyName =
    data.masterData.persons
      .filter((person) =>
        data.masterData.tenancies
          .find(({ id }) => id === proposal.tenancyId)
          ?.personIds.includes(person.id),
      )
      .map((person) => person.displayName)
      .filter(Boolean)
      .join(', ') || 'Name nicht erfasst'
  const label = `${unit?.label ?? proposal.occupancyPeriodId} ${tenancyName}`
  const dispatch = proposal.dispatchDate ?? localIsoDate(today())
  const earliest = earliestValidFrom(dispatch)
  const warnings: string[] = []
  if (proposal.uncertain)
    warnings.push(
      `Hochrechnung unsicher: nur ${proposal.occupiedDays} Tage belegt.`,
    )
  if (validFromValid && validFrom < earliest)
    warnings.push(
      `Termin zu früh: Bei Versand ${proposal.dispatchDate ? 'am' : 'heute,'} ${date(dispatch)} wirkt die Anpassung frühestens ab ${date(earliest)} (Erster des übernächsten Monats).`,
    )
  const status = !decision
    ? 'Offen'
    : stale
      ? 'Rechenstand geändert – bitte neu entscheiden'
      : decision.accepted
        ? `Ja: ${euro(decision.newMonthlyCents)} ab ${date(decision.validFrom)} · Anpassungsschreiben wird beigefügt`
        : 'Nein: keine Anpassung'

  return (
    <tr>
      <th scope="row">
        {unit?.label ?? proposal.occupancyPeriodId}
        <br />
        <span>{tenancyName}</span>
      </th>
      <td>{proposal.occupiedDays} Tage</td>
      <td className="data-table__amount">{euro(proposal.shareCents)}</td>
      <td className="data-table__amount">{euro(proposal.balanceCents)}</td>
      <td className="data-table__amount">
        {euro(proposal.annualizedCostsCents)}
      </td>
      <td className="data-table__amount">
        {euro(proposal.previousMonthlyCents)}
      </td>
      <td className="data-table__amount">
        <input
          className="prepayment-amount-input"
          aria-label={`Neue Vorauszahlung ${label}`}
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <small>Vorschlag {euro(proposal.proposedMonthlyCents)}</small>
      </td>
      <td>
        {warnings.length === 0 ? (
          '—'
        ) : (
          <ul className="prepayment-warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </td>
      <td>
        <div className="data-table__actions">
          <button
            className="button button--primary"
            type="button"
            disabled={!validFromValid}
            aria-label={`Anpassung ja ${label}`}
            onClick={() => onDecide(proposal, true, amount)}
          >
            Ja
          </button>
          <button
            className="button button--quiet"
            type="button"
            disabled={!validFromValid}
            aria-label={`Anpassung nein ${label}`}
            onClick={() => onDecide(proposal, false, amount)}
          >
            Nein
          </button>
        </div>
        <small>{status}</small>
      </td>
    </tr>
  )
}

function AdjustmentSection({
  data,
  period,
  onApply,
  today,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
  readonly onApply: Apply
  readonly today: () => Date
}) {
  const { feedback, setFeedback, run } = useApply(onApply)
  const [validFrom, setValidFrom] = useState(() =>
    defaultValidFrom(period, period.dispatchDate ?? localIsoDate(today())),
  )
  const validFromValid =
    isFirstOfMonth(validFrom) && validFrom > period.periodEnd

  // Vorschläge nur bei geändertem Datenbestand neu berechnen (nicht bei
  // jeder Eingabe, z. B. dem Gültigkeitsdatum).
  const { proposals, snapshotError } = useMemo((): {
    readonly proposals: AdjustmentProposal[] | null
    readonly snapshotError: boolean
  } => {
    try {
      return {
        proposals: proposePrepaymentAdjustments(data, period.id),
        snapshotError: false,
      }
    } catch {
      return { proposals: null, snapshotError: true }
    }
  }, [data, period.id])

  function decide(
    proposal: AdjustmentProposal,
    accepted: boolean,
    amount: string,
  ) {
    let newMonthlyCents: number
    try {
      newMonthlyCents = parseEuroCents(amount)
    } catch (caught) {
      setFeedback({ kind: 'alert', text: (caught as Error).message })
      return
    }
    const target = adjustmentTarget(
      data,
      period.id,
      proposal.tenancyId,
      validFrom,
    )
    run(
      (current) =>
        decidePrepaymentAdjustment(current, {
          billingPeriodId: period.id,
          occupancyPeriodId: proposal.occupancyPeriodId,
          accepted,
          newMonthlyCents,
          validFrom,
        }),
      accepted
        ? `Anpassung gespeichert. ${adjustmentTargetMessage(target)}`
        : 'Entscheidung „Nein“ gespeichert; es wird kein Anpassungsschreiben beigefügt.',
    )
  }

  return (
    <section aria-labelledby="prepayment-adjustment-title">
      <header className="section-heading">
        <div>
          <p className="section-kicker">Nach der Abrechnung {period.year}</p>
          <h2 id="prepayment-adjustment-title">
            VZ-Anpassung nach § 560 Abs. 4 BGB
          </h2>
        </div>
      </header>
      <p>
        Vorschläge für Mieter mit Nachzahlung, laufendem Mietverhältnis und
        monatlicher Vorauszahlung: Kostenanteil hochgerechnet auf 365 Tage,
        geteilt durch 12 und auf volle Euro aufgerundet; vorgeschlagen ab einer
        Erhöhung um 5 €. Bei „Ja“ wird die neue Vorauszahlung im Abrechnungsjahr
        eingetragen, ab dem sie gilt (Standard: nächster zulässiger 01.01. nach
        Versand), und das Anpassungsschreiben an die Einzelabrechnung angehängt.
      </p>
      {snapshotError ? (
        <p className="calculation-warnings">
          Der gespeicherte Rechenstand ist zu alt. Bitte die Abrechnung neu
          berechnen.
        </p>
      ) : proposals === null ? (
        <p>
          Noch kein gespeicherter Rechenstand. Berechne zuerst die Abrechnung
          unter <a href="#/berechnung">„Berechnung“</a>.
        </p>
      ) : proposals.length === 0 ? (
        <p>
          Nach dem gespeicherten Rechenstand ist keine Anpassung vorzuschlagen.
        </p>
      ) : (
        <>
          <label className="prepayment-valid-from">
            <span>Neue Vorauszahlung gültig ab</span>
            <input
              type="date"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </label>
          {validFromValid ? null : (
            <p role="alert">
              Der Termin muss der Erste eines Monats nach dem Abrechnungsjahr
              sein.
            </p>
          )}
          <FeedbackLine feedback={feedback} />
          <div
            className="data-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="VZ-Anpassung horizontal scrollen"
          >
            <table className="data-table" aria-label="VZ-Anpassung">
              <thead>
                <tr>
                  <th scope="col">Wohnung / Nutzer</th>
                  <th scope="col">Belegung</th>
                  <th scope="col">Kostenanteil</th>
                  <th scope="col">Nachzahlung</th>
                  <th scope="col">Kosten 12 Monate</th>
                  <th scope="col">VZ bisher</th>
                  <th scope="col">VZ neu</th>
                  <th scope="col">Hinweise</th>
                  <th scope="col">Anpassen?</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => (
                  <AdjustmentRow
                    key={proposal.occupancyPeriodId}
                    data={data}
                    period={period}
                    proposal={proposal}
                    validFrom={validFrom}
                    validFromValid={validFromValid}
                    today={today}
                    onDecide={decide}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

export function PrepaymentsRoute({
  data,
  billingPeriodId,
  onApply,
  today = () => new Date(),
}: PrepaymentsRouteProps) {
  if (billingPeriodId === null)
    return <p role="alert">Bitte zuerst ein Abrechnungsjahr auswählen.</p>
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period)
    return (
      <p role="alert">
        Das ausgewählte Abrechnungsjahr ist nicht mehr vorhanden.
      </p>
    )
  return (
    <div className="prepayments-workspace">
      <PrepaymentTable
        key={period.id}
        data={data}
        billingPeriodId={period.id}
        onApply={onApply}
      />
      <AdjustmentSection
        key={`adjustment:${period.id}`}
        data={data}
        period={period}
        onApply={onApply}
        today={today}
      />
    </div>
  )
}
