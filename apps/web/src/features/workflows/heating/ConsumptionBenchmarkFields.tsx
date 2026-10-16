import { useId, useState } from 'react'
import type { ConsumptionBenchmark } from '@nebenkosten/schema'
import {
  BENCHMARK_FIELD_NAMES,
  consumptionBenchmarkDraft,
  emptyConsumptionBenchmarkDraft,
  type ConsumptionBenchmarkDraft,
  type ConsumptionBenchmarkErrors,
  type ConsumptionBenchmarkField,
} from '../../heating/consumption-benchmark-form'

const TEXT_FIELDS: readonly {
  readonly field: ConsumptionBenchmarkField
  readonly label: string
  readonly inputMode?: 'decimal' | 'numeric'
}[] = [
  { field: 'source', label: 'Quelle' },
  { field: 'sourceUrl', label: 'Fundstelle (URL, optional)' },
  { field: 'referenceYear', label: 'Bezugsjahr', inputMode: 'numeric' },
  { field: 'category', label: 'Kategorie' },
]

const LIMIT_FIELDS: readonly {
  readonly field: ConsumptionBenchmarkField
  readonly label: string
}[] = [
  { field: 'lowMaxKwhPerSqmYear', label: 'niedrig bis (kWh/m²·a)' },
  { field: 'mediumMaxKwhPerSqmYear', label: 'mittel bis (kWh/m²·a)' },
  { field: 'elevatedMaxKwhPerSqmYear', label: 'erhöht bis (kWh/m²·a)' },
]

/**
 * Abschnitt „Vergleichswerte (Heizspiegel)“ eines Heizkreises
 * (§ 6a Abs. 3 Nr. 4 HeizKV). Die Werte werden beim Speichern des
 * umgebenden Formulars mit `readConsumptionBenchmarkForm` gelesen.
 */
export function ConsumptionBenchmarkFields({
  initial,
  previous,
  errors = {},
}: {
  readonly initial?: ConsumptionBenchmark | null
  readonly previous?: ConsumptionBenchmark | null
  readonly errors?: ConsumptionBenchmarkErrors
}) {
  const idPrefix = useId()
  const [draft, setDraft] = useState<ConsumptionBenchmarkDraft | null>(() =>
    initial ? consumptionBenchmarkDraft(initial) : null,
  )
  const takeOverPrevious = previous ? (
    <button
      type="button"
      onClick={() => setDraft(consumptionBenchmarkDraft(previous))}
    >
      Vergleichswerte aus dem Vorjahr übernehmen
    </button>
  ) : null

  function input(
    field: ConsumptionBenchmarkField,
    label: string,
    inputMode?: 'decimal' | 'numeric',
  ) {
    const errorId = `${idPrefix}-${field}-error`
    const error = errors[field]
    return (
      <div className="form-section__field" key={field}>
        <label>
          <span>{label}</span>
          <input
            name={BENCHMARK_FIELD_NAMES[field]}
            inputMode={inputMode}
            value={draft![field]}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              setDraft({ ...draft!, [field]: event.target.value })
            }
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

  return (
    <fieldset className="split-fields benchmark-fields">
      <legend>Vergleichswerte (Heizspiegel)</legend>
      {draft === null ? (
        <>
          <p className="form-section__empty">
            Keine Vergleichswerte erfasst. Ohne Vergleichswerte fehlt der
            Vergleich mit dem Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4 HeizKV).
          </p>
          <div className="form-section__actions">
            <button
              type="button"
              onClick={() => setDraft(emptyConsumptionBenchmarkDraft())}
            >
              Vergleichswerte erfassen
            </button>
            {takeOverPrevious}
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name={BENCHMARK_FIELD_NAMES.active} value="1" />
          {TEXT_FIELDS.map(({ field, label, inputMode }) =>
            input(field, label, inputMode),
          )}
          <label className="checkbox-field">
            <input
              type="checkbox"
              name={BENCHMARK_FIELD_NAMES.includesHotWater}
              checked={draft.includesHotWater}
              onChange={(event) =>
                setDraft({ ...draft, includesHotWater: event.target.checked })
              }
            />
            <span>Werte enthalten Warmwasser</span>
          </label>
          {LIMIT_FIELDS.map(({ field, label }) =>
            input(field, label, 'decimal'),
          )}
          <div className="form-section__actions">
            {takeOverPrevious}
            <button type="button" onClick={() => setDraft(null)}>
              Vergleichswerte entfernen
            </button>
          </div>
        </>
      )}
    </fieldset>
  )
}
