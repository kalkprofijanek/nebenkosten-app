import { useId, useState, type ReactNode } from 'react'
import type { HotWaterAllocation, HotWaterEnergy } from '@nebenkosten/schema'
import {
  HOT_WATER_ALLOCATION_OPTIONS,
  HOT_WATER_ENERGY_OPTIONS,
  HOT_WATER_FIELD_NAMES,
  germanNumber,
  isNaturalGas,
  type HotWaterAllocationKey,
  type HotWaterEnergyMethod,
  type HotWaterErrors,
  type HotWaterField,
} from './hot-water-form'

const ENERGY_HINTS: Record<HotWaterEnergyMethod, string> = {
  heat_meter:
    '§ 9 Abs. 2 Satz 1 HeizKV: Die auf die Warmwasserbereitung entfallende Wärmemenge ist mit einem Wärmezähler zu messen (Regelfall).',
  volume_formula:
    '§ 9 Abs. 2 Satz 2 HeizKV: Nur wenn ein Wärmezähler unzumutbar ist. Q = 2,5 kWh/(m³·K) × V × (tw − 10 °C) mit gemessenem Volumen V; tw darf geschätzt werden.',
  area_formula:
    '§ 9 Abs. 2 Satz 4 HeizKV: Nur wenn weder Wärmemenge noch Volumen gemessen werden können. Q = 32 kWh/m² × A_Wohn; leere Fläche = versorgte Fläche aller Nutzungen des Heizkreises.',
  '': 'Ohne Angabe gilt der Warmwasseranteil in Prozent (Pauschalanteil). Die HeizKV sieht ihn nicht mehr vor; die Prüfung weist darauf hin.',
}

const ALLOCATION_HINTS: Record<HotWaterAllocationKey, string> = {
  consumption:
    '§ 8 Abs. 1 HeizKV: 50–70 % nach erfasstem Warmwasserverbrauch (m³ je Nutzung), der Rest nach Wohn- oder Nutzfläche.',
  area: 'Ersatz ohne Warmwasserzähler: vollständig nach Fläche. Die Verteilung ist nicht verbrauchsabhängig; der Mieter kann nach § 12 Abs. 1 HeizKV um 15 % kürzen.',
  persons:
    'Bisheriges Verfahren nach Personen und Zeit. Die HeizKV sieht es nicht vor.',
}

/**
 * Abschnitt „Warmwasser“ eines Heizkreises (ADR-0010): Wärmemenge nach
 * § 9 Abs. 2 HeizKV und Verteilung nach § 8 Abs. 1 HeizKV. Gelesen wird beim
 * Speichern des umgebenden Formulars mit `readHotWaterForm`.
 */
export function HotWaterFields({
  energy,
  allocation,
  energySourceType,
  errors = {},
}: {
  readonly energy?: HotWaterEnergy | null
  readonly allocation?: HotWaterAllocation | null
  /** Energieträger des Heizkreises; ohne Angabe bleibt Erdgas wählbar. */
  readonly energySourceType?: string | null
  readonly errors?: HotWaterErrors
}) {
  const idPrefix = useId()
  const [method, setMethod] = useState<HotWaterEnergyMethod>(
    energy?.method ?? '',
  )
  const [allocationKey, setAllocationKey] = useState<HotWaterAllocationKey>(
    allocation?.key ?? 'persons',
  )
  const stored = energy?.method === method ? energy : null
  const showCondensing =
    energySourceType == null ||
    energySourceType.trim() === '' ||
    isNaturalGas(energySourceType) ||
    energy?.condensingNaturalGas === true

  function hint(id: string, content: ReactNode) {
    return (
      <p className="form-section__hint" id={`${idPrefix}-${id}-hint`}>
        {content}
      </p>
    )
  }

  function numberInput(
    field: HotWaterField,
    label: string,
    defaultValue: number | null | undefined,
  ) {
    const errorId = `${idPrefix}-${field}-error`
    const error = errors[field]
    return (
      <div className="form-section__field" key={field}>
        <label>
          <span>{label}</span>
          <input
            name={HOT_WATER_FIELD_NAMES[field]}
            inputMode="decimal"
            defaultValue={germanNumber(defaultValue)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </label>
        {error ? (
          <small className="field-error" id={errorId}>
            {error}
          </small>
        ) : null}
      </div>
    )
  }

  const reasonError = errors.reason
  return (
    <fieldset className="split-fields hot-water-fields">
      <legend>Warmwasser (§§ 8, 9 HeizKV)</legend>
      <p className="form-section__hint">
        Gilt nur bei zentraler Warmwasserbereitung.
      </p>
      <label>
        <span>Wärmemenge Warmwasser</span>
        <select
          name={HOT_WATER_FIELD_NAMES.method}
          value={method}
          aria-describedby={`${idPrefix}-method-hint`}
          onChange={(event) =>
            setMethod(event.target.value as HotWaterEnergyMethod)
          }
        >
          {HOT_WATER_ENERGY_OPTIONS.map((option) => (
            <option key={option.value || 'none'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {hint('method', ENERGY_HINTS[method])}
      {method === 'heat_meter'
        ? numberInput(
            'heatKwh',
            'Wärmemenge Warmwasser (kWh)',
            stored?.method === 'heat_meter' ? stored.heatKwh : null,
          )
        : null}
      {method === 'volume_formula' ? (
        <>
          {numberInput(
            'volumeM3',
            'Warmwasservolumen V (m³)',
            stored?.method === 'volume_formula' ? stored.volumeM3 : null,
          )}
          {numberInput(
            'temperatureC',
            'Mittlere Warmwassertemperatur tw (°C)',
            stored?.method === 'volume_formula' ? stored.temperatureC : null,
          )}
          <label className="checkbox-field">
            <input
              type="checkbox"
              name={HOT_WATER_FIELD_NAMES.temperatureEstimated}
              defaultChecked={
                stored?.method === 'volume_formula' &&
                stored.temperatureEstimated === true
              }
            />
            <span>Temperatur geschätzt</span>
          </label>
        </>
      ) : null}
      {method === 'area_formula' ? (
        <>
          {numberInput(
            'areaSqm',
            'Wohnfläche A (m², optional)',
            stored?.method === 'area_formula' ? stored.areaSqm : null,
          )}
          <div className="form-section__field">
            <label>
              <span>Begründung (Pflicht)</span>
              <input
                name={HOT_WATER_FIELD_NAMES.reason}
                defaultValue={
                  stored?.method === 'area_formula' ? stored.reason : ''
                }
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={
                  reasonError ? `${idPrefix}-reason-error` : undefined
                }
              />
            </label>
            {reasonError ? (
              <small className="field-error" id={`${idPrefix}-reason-error`}>
                {reasonError}
              </small>
            ) : null}
          </div>
        </>
      ) : null}
      {method !== '' && showCondensing ? (
        <>
          <label className="checkbox-field">
            <input
              type="checkbox"
              name={HOT_WATER_FIELD_NAMES.condensingNaturalGas}
              defaultChecked={stored?.condensingNaturalGas === true}
            />
            <span>Erdgas brennwertbezogen abgerechnet (× 1,11)</span>
          </label>
          {hint(
            'condensing',
            '§ 9 Abs. 2 Satz 5 HeizKV: Nur bei Erdgas, dessen Lieferung nach dem Brennwert abgerechnet wird.',
          )}
        </>
      ) : null}
      <label>
        <span>Verteilung Warmwasserkosten</span>
        <select
          name={HOT_WATER_FIELD_NAMES.allocationKey}
          value={allocationKey}
          aria-describedby={`${idPrefix}-allocation-hint`}
          onChange={(event) =>
            setAllocationKey(event.target.value as HotWaterAllocationKey)
          }
        >
          {HOT_WATER_ALLOCATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {hint('allocation', ALLOCATION_HINTS[allocationKey])}
      {allocationKey === 'consumption'
        ? numberInput(
            'consumptionSharePercent',
            'Verbrauchsanteil Warmwasser (%)',
            allocation?.key === 'consumption'
              ? allocation.consumptionSharePercent
              : null,
          )
        : null}
    </fieldset>
  )
}
