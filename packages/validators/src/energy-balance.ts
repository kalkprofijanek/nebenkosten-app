/**
 * Plausibilität der Energiebilanz je Heizkreis (PR-32): Nutzungsgrad bzw.
 * Jahresarbeitszahl außerhalb der erwarteten Spanne und Energiekosten ohne
 * Menge. Nur Warnungen; die Berechnung bleibt unverändert.
 */
import {
  heatingEnergyBalance,
  type CalculationInput,
  type CalculationOutput,
  type CircuitEnergyBalance,
} from '@nebenkosten/core'
import type { ValidationIssue } from '@nebenkosten/schema'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: digits })
}

function ratioText(balance: CircuitEnergyBalance, ratio: number): string {
  return balance.generator === 'boiler'
    ? `${formatNumber(ratio * 100)} %`
    : formatNumber(ratio, 2)
}

function label(balance: CircuitEnergyBalance): string {
  return balance.generator === 'boiler'
    ? 'Nutzungsgrad'
    : balance.generator === 'heat_pump'
      ? 'Jahresarbeitszahl'
      : 'Verhältnis Wärme zu Energieeinsatz'
}

export function energyBalanceIssues(
  input: CalculationInput,
  output: CalculationOutput,
  add: Add,
): void {
  for (const balance of heatingEnergyBalance(input, output)) {
    const entity = {
      type: 'HeatingCircuit',
      id: balance.heatingCircuitId ?? balance.buildingId,
    }
    for (const source of balance.sources) {
      if (source.problem === null) continue
      add(
        issue(
          'warning',
          source.problem === 'quantity_missing'
            ? 'heating.energy_quantity_missing'
            : 'heating.calorific_value_missing',
          'heating',
          source.problem === 'quantity_missing'
            ? 'Energiekosten ohne Menge'
            : 'Brennstoffmenge ohne Heizwert',
          {
            entity: { type: 'EnergySource', id: source.energySourceId },
            detail:
              source.problem === 'quantity_missing'
                ? `Für ${source.label ?? 'diese Energiequelle'} sind Kosten, aber keine Menge (kWh bzw. Liter) erfasst. Ohne Menge lassen sich Energieeinsatz, Warmwasseranteil nach § 9 HeizKV und Energiebilanz nicht prüfen. Bitte die Menge aus der Rechnung oder aus Zählerständen nachtragen.`
                : `Für ${source.label ?? 'diese Energiequelle'} ist eine Menge, aber kein Heizwert erfasst; der Energieeinsatz in kWh ist daher unbekannt.`,
          },
        ),
      )
    }
    if (balance.ratio === null) continue
    if (balance.status !== 'below_band' && balance.status !== 'above_band')
      continue
    const below = balance.status === 'below_band'
    add(
      issue(
        'warning',
        below ? 'heating.energy_balance_low' : 'heating.energy_balance_high',
        'heating',
        `${label(balance)} ${below ? 'unplausibel niedrig' : 'unplausibel hoch'}`,
        {
          entity,
          detail: `Energieeinsatz ${formatNumber(balance.energyInputKwh)} kWh, gemessene Wärme ${formatNumber(balance.heatKwh ?? 0)} kWh: ${label(balance)} ${ratioText(balance, balance.ratio)}, erwartet ${ratioText(balance, balance.expected.min)} bis ${ratioText(balance, balance.expected.max)}. ${below ? 'Möglicherweise ist zu viel Brennstoff bzw. Strom angesetzt (Bestand, Umfüllung, Doppelbuchung) oder Wärmezählerstände fehlen.' : 'Möglicherweise fehlt Brennstoff bzw. Strom (Lieferung, Anfangsbestand, Zählerstand) oder Wärmezählerstände sind zu hoch.'}`,
        },
      ),
    )
  }
}
