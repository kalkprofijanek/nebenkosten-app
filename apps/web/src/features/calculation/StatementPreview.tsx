import type { AppDataFile, OccupancyPeriod } from '@nebenkosten/schema'
import { latestCalculationSnapshot } from '../pdf/context'
import { calculatePreview } from './calculate-preview'
import { OpenStatementButton } from './OpenStatementButton'

const euro = (cents: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  )

function occupantName(data: AppDataFile, occupancy: OccupancyPeriod): string {
  if (occupancy.kind === 'vacancy') return 'Leerstand'
  const tenancy = data.masterData.tenancies.find(
    (item) => item.id === occupancy.tenancyId,
  )
  return (
    data.masterData.persons
      .filter((person) => tenancy?.personIds.includes(person.id))
      .map(
        (person) =>
          person.displayName ||
          [person.firstName, person.lastName].filter(Boolean).join(' '),
      )
      .filter(Boolean)
      .join(', ') || 'Name nicht erfasst'
  )
}

/**
 * Persisted snapshots are stored as canonical JSON with sorted keys, so the
 * comparison with a fresh calculation must ignore property order.
 */
function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, (item as Record<string, unknown>)[key]]),
        )
      : item,
  )
}

function date(value: string): string {
  return value.split('-').reverse().join('.')
}

export function StatementPreview({
  data,
  billingPeriodId,
}: {
  readonly data: AppDataFile
  readonly billingPeriodId: string
}) {
  let snapshot
  try {
    snapshot = latestCalculationSnapshot(data, billingPeriodId)
  } catch {
    return (
      <p className="calculation-warnings">
        Gespeicherte Einzelabrechnungen können nicht angezeigt werden. Bitte die
        Abrechnung neu berechnen; bei gesperrten Jahren zuvor die Prüfung
        kontrolliert wieder öffnen.
      </p>
    )
  }
  if (!snapshot)
    return (
      <p>
        Berechne zuerst die Abrechnung, um die Einzelabrechnungen zu prüfen.
      </p>
    )
  let stale: boolean
  try {
    stale =
      sortedJson(snapshot.output) !==
      sortedJson(calculatePreview(data, billingPeriodId))
  } catch {
    return (
      <p className="calculation-warnings">
        Der gespeicherte Rechenstand lässt sich mit den aktuellen Eingaben nicht
        prüfen. Bitte Eingaben korrigieren und neu berechnen.
      </p>
    )
  }
  if (stale)
    return (
      <p className="calculation-warnings">
        Eingaben wurden seit der Berechnung geändert. Bitte neu berechnen, bevor
        du die Einzelabrechnungen prüfst.
      </p>
    )
  const period = data.billingData.billingPeriods.find(
    (item) => item.id === billingPeriodId,
  )!
  const kindOf = new Map(
    data.billingData.occupancyPeriods
      .filter((item) => item.billingPeriodId === billingPeriodId)
      .map((item) => [item.id, item.kind]),
  )
  const tenants = snapshot.output.tenants.filter(
    (tenant) => kindOf.get(tenant.id) === 'tenant',
  )
  const vacancies = snapshot.output.tenants.filter(
    (tenant) => kindOf.get(tenant.id) === 'vacancy',
  )
  const due = tenants.filter((tenant) => tenant.balanceCents > 0)
  const credit = tenants.filter((tenant) => tenant.balanceCents < 0)
  const total = (
    items: readonly (typeof tenants)[number][],
    pick: 'shareCents' | 'prepaymentCents' | 'balanceCents',
  ) => items.reduce((sum, item) => sum + item[pick], 0)
  const balance = total(tenants, 'balanceCents')
  return (
    <section aria-labelledby="statement-preview-title">
      <h3 id="statement-preview-title">
        Abrechnungsvorschau je Wohnung und Nutzer
      </h3>
      <p>
        Gespeicherte Ergebnisse zur Kontrolle. Die Vorschau ersetzt die
        Freigabeprüfung nicht. Leerstandskosten trägt der Vermieter.
      </p>
      <dl
        className="balance-summary"
        aria-label="Summen Nachzahlungen und Guthaben"
      >
        <div>
          <dt>{`Nachzahlungen (${due.length} Mieter)`}</dt>
          <dd>{euro(total(due, 'balanceCents'))}</dd>
        </div>
        <div>
          <dt>{`Guthaben (${credit.length} Mieter)`}</dt>
          <dd>{euro(Math.abs(total(credit, 'balanceCents')))}</dd>
        </div>
        <div>
          <dt>Saldo aller Mieter</dt>
          <dd>
            {balance === 0
              ? 'Ausgeglichen'
              : `${balance > 0 ? 'Nachzahlung' : 'Guthaben'} ${euro(Math.abs(balance))}`}
          </dd>
        </div>
        <div>
          <dt>Leerstandskosten (Vermieter)</dt>
          <dd>{euro(total(vacancies, 'shareCents'))}</dd>
        </div>
      </dl>
      <div
        className="data-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Abrechnungsvorschau horizontal scrollen"
      >
        <table
          className="data-table"
          aria-label="Einzelabrechnungen im Überblick"
        >
          <thead>
            <tr>
              <th scope="col">Wohnung / Nutzer</th>
              <th scope="col">Zeitraum</th>
              <th scope="col">Kostenanteil</th>
              <th scope="col">Vorauszahlungen</th>
              <th scope="col">Ergebnis</th>
              <th scope="col">Abrechnung</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.output.tenants.map((tenant) => {
              const occupancy = data.billingData.occupancyPeriods.find(
                (item) =>
                  item.id === tenant.id &&
                  item.billingPeriodId === billingPeriodId,
              )
              if (!occupancy) return null
              const unit = data.masterData.units.find(
                (item) => item.id === occupancy.unitId,
              )
              return (
                <tr key={tenant.id}>
                  <th scope="row">
                    {unit?.label || occupancy.unitId}
                    <br />
                    <span>{occupantName(data, occupancy)}</span>
                  </th>
                  <td>
                    {date(occupancy.from ?? period.periodStart)} –{' '}
                    {date(occupancy.to ?? period.periodEnd)}
                  </td>
                  <td>{euro(tenant.shareCents)}</td>
                  <td>
                    {occupancy.kind === 'vacancy'
                      ? '—'
                      : euro(tenant.prepaymentCents)}
                  </td>
                  <td>
                    {occupancy.kind === 'vacancy'
                      ? 'Vermieter trägt den Anteil'
                      : tenant.balanceCents === 0
                        ? 'Ausgeglichen'
                        : `${tenant.balanceCents > 0 ? 'Nachzahlung' : 'Guthaben'} ${euro(Math.abs(tenant.balanceCents))}`}
                  </td>
                  <td>
                    {occupancy.kind === 'tenant' ? (
                      <OpenStatementButton
                        data={data}
                        period={period}
                        calculation={snapshot.output}
                        occupancy={occupancy}
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{`Summe Mieter (${tenants.length})`}</th>
              <td />
              <td>{euro(total(tenants, 'shareCents'))}</td>
              <td>{euro(total(tenants, 'prepaymentCents'))}</td>
              <td>
                {balance === 0
                  ? 'Ausgeglichen'
                  : `${balance > 0 ? 'Nachzahlung' : 'Guthaben'} ${euro(Math.abs(balance))}`}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p>
        <a href="#/freigabe">Weiter zur Freigabeprüfung</a>
      </p>
    </section>
  )
}
