import type { FuelDeliveryTaxesAndLevies } from '@nebenkosten/schema'
import { parseEuroCents, parseOptionalNumber } from '../../../app/form-parsers'
import { formOptionalText } from '../form-values'

/** Übliche Umsatzsteuersätze auf Brennstoff- und Energierechnungen. */
export const VAT_RATES = [19, 7] as const

/**
 * Umsatzsteuer, die in einem Bruttobetrag enthalten ist:
 * brutto × Satz ÷ (100 + Satz), kaufmännisch auf Cent gerundet.
 */
export function vatFromGrossCents(grossCents: number, ratePercent: number) {
  const exact = (grossCents * ratePercent) / (100 + ratePercent)
  return Math.sign(exact) * Math.round(Math.abs(exact))
}

function optionalEuro(form: FormData, name: string): number | undefined {
  const value = formOptionalText(form, name)
  return value === undefined ? undefined : parseEuroCents(value)
}

/**
 * Liest die Steuern und Abgaben aus dem Formular. `undefined`, wenn kein
 * Feld ausgefüllt ist (Angaben nicht erfasst).
 */
export function parseFuelTaxes(
  form: FormData,
): FuelDeliveryTaxesAndLevies | undefined {
  const rate = parseOptionalNumber(formOptionalText(form, 'vatRate') ?? '')
  const taxes: FuelDeliveryTaxesAndLevies = {
    vatCents: optionalEuro(form, 'vatAmount'),
    vatRatePercent: rate ?? undefined,
    energyTaxCents: optionalEuro(form, 'energyTax'),
    co2LevyCents: optionalEuro(form, 'co2Levy'),
    otherLeviesCents: optionalEuro(form, 'otherLevies'),
    otherLeviesLabel: formOptionalText(form, 'otherLeviesLabel'),
  }
  const entries = Object.entries(taxes).filter(([, value]) => value != null)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries) as FuelDeliveryTaxesAndLevies
}
