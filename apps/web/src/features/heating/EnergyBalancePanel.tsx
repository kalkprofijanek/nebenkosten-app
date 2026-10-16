import {
  heatingEnergyBalanceForPeriod,
  type CircuitEnergyBalance,
} from '@nebenkosten/core'
import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { useMemo } from 'react'

const kwh = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const factor = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

const GENERATOR_LABEL: Record<CircuitEnergyBalance['generator'], string> = {
  boiler: 'Kessel',
  heat_pump: 'Wärmepumpe',
  hybrid: 'Hybrid',
}

const STATUS_LABEL: Record<CircuitEnergyBalance['status'], string> = {
  ok: 'plausibel',
  below_band: 'zu niedrig',
  above_band: 'zu hoch',
  no_heat_measurement: 'keine Wärmemessung (HKV)',
  energy_input_incomplete: 'Menge oder Heizwert fehlt',
}

/** Nutzungsgrad in Prozent (Kessel) bzw. Jahresarbeitszahl (WP, Hybrid). */
function ratioText(
  generator: CircuitEnergyBalance['generator'],
  value: number | null,
): string {
  if (value === null) return '–'
  return generator === 'boiler'
    ? `${Math.round(value * 100)} %`
    : factor.format(value)
}

/**
 * Energiebilanz je Heizkreis (PR-32) für den Vermieter: Energieeinsatz,
 * gemessene Wärme, Nutzungsgrad bzw. JAZ und Vorjahr. Nicht im Mieter-PDF.
 */
export function EnergyBalancePanel({
  data,
  period,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
}) {
  const balances = useMemo(() => {
    try {
      return heatingEnergyBalanceForPeriod(data, period)
    } catch {
      return []
    }
  }, [data, period])
  if (balances.length === 0) return null
  const buildingName = (id: string) =>
    data.masterData.buildings.find((building) => building.id === id)?.name ?? id
  return (
    <section aria-labelledby="energy-balance-title">
      <h3 id="energy-balance-title">Energiebilanz je Heizkreis</h3>
      <p className="privacy-note">
        Interne Plausibilitätsprüfung: Brennstoff bzw. Wärmepumpenstrom gegen
        gemessene Wärme. Erwartet sind bei Kesseln 60–95 % Nutzungsgrad, bei
        Wärmepumpen eine Jahresarbeitszahl von 2 bis 5. Erscheint nicht in der
        Mieterabrechnung.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Gebäude</th>
              <th scope="col">Erzeuger</th>
              <th scope="col">Energieeinsatz kWh</th>
              <th scope="col">Gemessene Wärme kWh</th>
              <th scope="col">Nutzungsgrad / JAZ</th>
              <th scope="col">Erwartet</th>
              <th scope="col">Vorjahr</th>
              <th scope="col">Bewertung</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((balance) => (
              <tr key={balance.heatingCircuitId ?? balance.buildingId}>
                <th scope="row">{buildingName(balance.buildingId)}</th>
                <td>{GENERATOR_LABEL[balance.generator]}</td>
                <td>{kwh.format(balance.energyInputKwh)}</td>
                <td>
                  {balance.heatKwh === null ? '–' : kwh.format(balance.heatKwh)}
                </td>
                <td>{ratioText(balance.generator, balance.ratio)}</td>
                <td>
                  {ratioText(balance.generator, balance.expected.min)} –{' '}
                  {ratioText(balance.generator, balance.expected.max)}
                </td>
                <td>
                  {balance.previous
                    ? `${balance.previous.year}: ${ratioText(balance.generator, balance.previous.ratio)}`
                    : '–'}
                </td>
                <td>{STATUS_LABEL[balance.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
