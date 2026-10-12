import { useState, type MouseEvent } from 'react'
import type { FuelDeliveryTaxesAndLevies } from '@nebenkosten/schema'
import { formatEuroInput, parseEuroCents } from '../../../app/form-parsers'
import { VAT_RATES, vatFromGrossCents } from './fuel-taxes'

function euroDefault(cents: number | null | undefined): string {
  return cents == null ? '' : formatEuroInput(cents)
}

/**
 * Steuern und Abgaben laut Brennstoff-/Energierechnung
 * (§ 6a Abs. 3 Nr. 1 b HeizKV, ADR-0011).
 */
export function FuelTaxFields({
  taxes,
  suffix = '',
}: {
  readonly taxes?: FuelDeliveryTaxesAndLevies | null
  /** Unterscheidet die Beschriftungen im Bearbeitungsformular. */
  readonly suffix?: string
}) {
  const [message, setMessage] = useState<string | null>(null)
  const rateOptions = [
    ...VAT_RATES,
    ...(taxes?.vatRatePercent != null &&
    !(VAT_RATES as readonly number[]).includes(taxes.vatRatePercent)
      ? [taxes.vatRatePercent]
      : []),
  ]
  const label = (text: string) => (suffix ? `${text} ${suffix}` : text)

  function computeVat(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    if (!form) return
    const field = (name: string) =>
      form.elements.namedItem(name) as HTMLInputElement | null
    const gross = field('amount')?.value.trim() ?? ''
    const rate = Number(field('vatRate')?.value || 19)
    if (!gross) {
      setMessage('Bitte zuerst den Lieferbetrag (brutto) eingeben.')
      return
    }
    try {
      const vat = vatFromGrossCents(parseEuroCents(gross), rate)
      const target = field('vatAmount')
      if (target) target.value = formatEuroInput(vat)
      const rateField = field('vatRate')
      if (rateField && !rateField.value) rateField.value = String(rate)
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <fieldset>
      <legend>{label('Steuern und Abgaben laut Rechnung')}</legend>
      <small>
        Für die Einzelabrechnung nach § 6a Abs. 3 Nr. 1 b HeizKV. Die Beträge
        sind im Lieferbetrag (brutto) enthalten; Felder leer lassen, wenn die
        Rechnung sie nicht ausweist.
      </small>
      <label>
        <span>{label('Umsatzsteuersatz')}</span>
        <select name="vatRate" defaultValue={taxes?.vatRatePercent ?? ''}>
          <option value="">nicht angegeben</option>
          {rateOptions.map((rate) => (
            <option key={rate} value={rate}>
              {rate} %
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{label('Umsatzsteuer in Euro')}</span>
        <input name="vatAmount" defaultValue={euroDefault(taxes?.vatCents)} />
      </label>
      <button type="button" onClick={computeVat}>
        {label('Umsatzsteuer aus Bruttobetrag berechnen')}
      </button>
      {message ? <p role="alert">{message}</p> : null}
      <label>
        <span>{label('Energiesteuer bzw. Stromsteuer in Euro')}</span>
        <input
          name="energyTax"
          defaultValue={euroDefault(taxes?.energyTaxCents)}
        />
      </label>
      <label>
        <span>{label('CO₂-Kosten nach BEHG laut Rechnung in Euro')}</span>
        <input name="co2Levy" defaultValue={euroDefault(taxes?.co2LevyCents)} />
      </label>
      <label>
        <span>{label('Sonstige Abgaben in Euro')}</span>
        <input
          name="otherLevies"
          defaultValue={euroDefault(taxes?.otherLeviesCents)}
        />
      </label>
      <label>
        <span>{label('Bezeichnung der sonstigen Abgaben')}</span>
        <input
          name="otherLeviesLabel"
          defaultValue={taxes?.otherLeviesLabel ?? ''}
        />
      </label>
    </fieldset>
  )
}
