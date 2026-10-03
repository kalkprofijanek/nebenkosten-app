import type { AppDataFile, OccupancyPeriod } from '@nebenkosten/schema'
import { latestCalculationSnapshot } from '../pdf/context'
import { calculatePreview } from './calculate-preview'

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
      JSON.stringify(snapshot.output) !==
      JSON.stringify(calculatePreview(data, billingPeriodId))
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
  return (
    <section aria-labelledby="statement-preview-title">
      <h3 id="statement-preview-title">
        Abrechnungsvorschau je Wohnung und Nutzer
      </h3>
      <p>
        Gespeicherte Ergebnisse zur Kontrolle. Die Vorschau ersetzt die
        Freigabeprüfung nicht. Leerstandskosten trägt der Vermieter.
      </p>
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p>
        <a href="#/freigabe">Weiter zur Freigabeprüfung</a>
      </p>
    </section>
  )
}
