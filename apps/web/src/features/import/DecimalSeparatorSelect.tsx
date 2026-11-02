import type { DecimalSeparator } from '@nebenkosten/import-export'

/**
 * Wahl des Dezimaltrennzeichens für Zählerstände (E-51-1). Ohne diese Wahl
 * würde ein Messdienst-Wert `12.345` (m³ mit Punkt) als 12345 gelesen.
 */
export function DecimalSeparatorSelect({
  value,
  onChange,
}: {
  readonly value: DecimalSeparator | undefined
  readonly onChange: (value: DecimalSeparator) => void
}) {
  return (
    <label>
      <span>Dezimaltrennzeichen der Zählerstände</span>
      <select
        value={value ?? 'comma'}
        onChange={(event) => onChange(event.target.value as DecimalSeparator)}
      >
        <option value="comma">Komma (1.234,5)</option>
        <option value="dot">Punkt (1,234.5)</option>
      </select>
    </label>
  )
}
