import type { EnergySource } from '@nebenkosten/schema'
import {
  SEASONAL_PERFORMANCE_FACTOR_FIELD_NAMES,
  germanNumber,
} from './hot-water-form'

/**
 * Jahresarbeitszahl einer Wärmepumpen-Stromquelle mit Kennzeichen
 * „geschätzt“ und Begründung (Pflicht bei Schätzung, z. B. Herstellerangabe
 * oder Planungswert). Gelesen wird beim Speichern des Heizkreis-Formulars.
 */
export function SeasonalPerformanceFactorFields({
  source,
  labelSuffix = '',
}: {
  readonly source?: Pick<
    EnergySource,
    | 'seasonalPerformanceFactor'
    | 'seasonalPerformanceFactorEstimated'
    | 'seasonalPerformanceFactorReason'
  > | null
  readonly labelSuffix?: string
}) {
  const names = SEASONAL_PERFORMANCE_FACTOR_FIELD_NAMES
  return (
    <fieldset className="split-fields">
      <legend>Jahresarbeitszahl (nur Wärmepumpenstrom)</legend>
      <label>
        <span>{`Jahresarbeitszahl${labelSuffix}`}</span>
        <input
          name={names.value}
          inputMode="decimal"
          defaultValue={germanNumber(source?.seasonalPerformanceFactor)}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          name={names.estimated}
          defaultChecked={source?.seasonalPerformanceFactorEstimated === true}
        />
        <span>{`Jahresarbeitszahl geschätzt${labelSuffix}`}</span>
      </label>
      <label>
        <span>{`Grundlage der Jahresarbeitszahl${labelSuffix}`}</span>
        <input
          name={names.reason}
          defaultValue={source?.seasonalPerformanceFactorReason ?? ''}
        />
      </label>
      <p className="form-section__hint">
        Rechnet den Wärmepumpenstrom in erzeugte Wärme um, wenn kein
        Wärmemengenzähler am Erzeuger vorhanden ist. Bei einer Schätzung (z. B.
        Herstellerangabe, Planungswert) ist die Grundlage anzugeben; das PDF
        weist sie als Schätzung aus.
      </p>
    </fieldset>
  )
}
