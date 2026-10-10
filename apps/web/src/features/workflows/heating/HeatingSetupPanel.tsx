import { useState, type FormEvent } from 'react'
import {
  consumptionBenchmarkSchema,
  type ConsumptionBenchmark,
} from '@nebenkosten/schema'
import { parseOptionalNumber } from '../../../app/form-parsers'
import {
  addEnergySource,
  addHeatingCircuit,
  addHeatingSystem,
  deleteEnergySource,
  deleteHeatingCircuit,
  deleteHeatingSystem,
  updateEnergySource,
  updateHeatingCircuit,
  updateHeatingSystem,
} from '../../heating/heating-commands'
import { WorkflowField } from '../form-support'
import { formOptionalText, formText } from '../form-values'
import type { WorkflowSubRouteProps } from '../route-types'
import type { WorkflowApply } from '../HeatingRoute'

const DEFAULT_BENCHMARK_SOURCE = 'Heizspiegel für Deutschland (co2online)'

const benchmarkFieldLabels: Record<string, string> = {
  source: 'Quelle',
  sourceUrl: 'Fundstelle',
  referenceYear: 'Bezugsjahr',
  category: 'Nutzerkategorie',
  lowMaxKwhPerSqmYear: 'Niedrig bis',
  mediumMaxKwhPerSqmYear: 'Mittel bis',
  elevatedMaxKwhPerSqmYear: 'Erhöht bis',
}

function parseBenchmark(
  form: FormData,
):
  | { readonly success: true; readonly data: ConsumptionBenchmark }
  | { readonly success: false; readonly error: string } {
  const numberFields = [
    ['benchmarkReferenceYear', 'referenceYear'],
    ['benchmarkLowMax', 'lowMaxKwhPerSqmYear'],
    ['benchmarkMediumMax', 'mediumMaxKwhPerSqmYear'],
    ['benchmarkElevatedMax', 'elevatedMaxKwhPerSqmYear'],
  ] as const
  const numbers: Record<string, number | null> = {}
  try {
    for (const [formName, key] of numberFields) {
      numbers[key] = parseOptionalNumber(formText(form, formName))
    }
  } catch {
    return { success: false, error: 'Bitte gültige Zahlenwerte eingeben.' }
  }
  const result = consumptionBenchmarkSchema.safeParse({
    source: formText(form, 'benchmarkSource'),
    sourceUrl: formText(form, 'benchmarkSourceUrl') || undefined,
    referenceYear: numbers.referenceYear,
    category: formText(form, 'benchmarkCategory'),
    includesHotWater: form.has('benchmarkIncludesHotWater'),
    lowMaxKwhPerSqmYear: numbers.lowMaxKwhPerSqmYear,
    mediumMaxKwhPerSqmYear: numbers.mediumMaxKwhPerSqmYear,
    elevatedMaxKwhPerSqmYear: numbers.elevatedMaxKwhPerSqmYear,
  })
  if (result.success) return result
  const issue = result.error.issues[0]
  if (!issue)
    return { success: false, error: 'Die Vergleichswerte sind ungültig.' }
  if (issue.path.length === 1 && issue.path[0] === 'mediumMaxKwhPerSqmYear') {
    return { success: false, error: issue.message }
  }
  const field = benchmarkFieldLabels[String(issue.path[0])] ?? 'Vergleichswerte'
  if (field === 'Fundstelle') {
    return {
      success: false,
      error: 'Die Fundstelle muss eine gültige HTTP- oder HTTPS-URL sein.',
    }
  }
  if (field === 'Quelle' || field === 'Nutzerkategorie') {
    return { success: false, error: `Bitte ${field.toLowerCase()} angeben.` }
  }
  if (field === 'Bezugsjahr') {
    return {
      success: false,
      error:
        'Bitte ein ganzzahliges Bezugsjahr zwischen 1990 und 2100 eingeben.',
    }
  }
  return {
    success: false,
    error: `Bitte für „${field}“ einen positiven Wert eingeben.`,
  }
}

function optionalNumber(form: FormData, name: string) {
  return parseOptionalNumber(formText(form, name)) ?? null
}

export function HeatingSetupPanel({
  data,
  selection,
  apply,
}: WorkflowSubRouteProps & { readonly apply: WorkflowApply }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [benchmarkEnabled, setBenchmarkEnabled] = useState(false)
  const [benchmarkErrors, setBenchmarkErrors] = useState<
    Record<string, string>
  >({})
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === selection.billingPeriodId,
  )!
  const buildings = data.masterData.buildings.filter(
    ({ propertyId }) => propertyId === period.propertyId,
  )
  const systems = data.masterData.heatingSystems.filter(
    ({ propertyId }) => propertyId === period.propertyId,
  )
  const circuits = data.billingData.heatingCircuits.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) => {
        const dependencies = { createId: () => crypto.randomUUID() }
        let next = addHeatingSystem(
          current,
          {
            propertyId: period.propertyId,
            name: formText(form, 'systemName'),
          },
          dependencies,
        )
        const heatingSystemId = next.masterData.heatingSystems.at(-1)!.id
        const hasCentralHotWater = form.has('hasCentralHotWater')
        next = addHeatingCircuit(
          next,
          {
            billingPeriodId: period.id,
            heatingSystemId,
            buildingId: formText(form, 'buildingId'),
            hasCentralHotWater,
            hotWaterSharePercent: hasCentralHotWater
              ? optionalNumber(form, 'hotWaterSharePercent')
              : null,
          },
          dependencies,
        )
        const heatingCircuitId = next.billingData.heatingCircuits.at(-1)!.id
        return addEnergySource(
          next,
          {
            heatingCircuitId,
            key: formText(form, 'sourceKey'),
            name: formText(form, 'sourceName'),
            sourceType: formText(form, 'sourceType'),
            calorificValueKwhPerUnit: optionalNumber(
              form,
              'calorificValueKwhPerUnit',
            ),
            co2FactorKgPerKwh: optionalNumber(form, 'co2FactorKgPerKwh'),
          },
          dependencies,
        )
      })
    )
      event.currentTarget.reset()
  }

  function save(
    event: FormEvent<HTMLFormElement>,
    circuitId: string,
    sourceId: string,
  ) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const circuit = circuits.find(({ id }) => id === circuitId)!
    const system = systems.find(({ id }) => id === circuit.heatingSystemId)!
    const hasCentralHotWater = form.has('hasCentralHotWater')
    const parsedBenchmark = form.has('benchmarkEnabled')
      ? parseBenchmark(form)
      : null
    if (parsedBenchmark && !parsedBenchmark.success) {
      setBenchmarkErrors((current) => ({
        ...current,
        [circuitId]: parsedBenchmark.error,
      }))
      return
    }
    setBenchmarkErrors((current) => {
      const next = { ...current }
      delete next[circuitId]
      return next
    })
    if (
      apply((current) => {
        let next = updateHeatingSystem(current, system.id, {
          propertyId: period.propertyId,
          name: formText(form, 'systemName'),
        })
        next = updateHeatingCircuit(next, circuit.id, {
          billingPeriodId: period.id,
          heatingSystemId: system.id,
          buildingId: formText(form, 'buildingId'),
          hasCentralHotWater,
          hotWaterSharePercent: hasCentralHotWater
            ? optionalNumber(form, 'hotWaterSharePercent')
            : undefined,
          overrides: {
            consumptionSharePercent: optionalNumber(
              form,
              'consumptionSharePercent',
            ),
            baseSharePercent: optionalNumber(form, 'baseSharePercent'),
            operatingElectricitySharePercent: optionalNumber(
              form,
              'operatingElectricitySharePercent',
            ),
          },
          consumptionBenchmark: parsedBenchmark?.data ?? null,
        })
        return updateEnergySource(next, sourceId, {
          heatingCircuitId: circuit.id,
          key: formText(form, 'sourceKey'),
          name: formOptionalText(form, 'sourceName'),
          sourceType: formOptionalText(form, 'sourceType'),
          calorificValueKwhPerUnit: optionalNumber(
            form,
            'calorificValueKwhPerUnit',
          ),
          co2FactorKgPerKwh: optionalNumber(form, 'co2FactorKgPerKwh'),
        })
      })
    )
      setEditingId(null)
  }

  function removeBenchmark(circuitId: string) {
    const circuit = circuits.find(({ id }) => id === circuitId)!
    if (
      apply((current) =>
        updateHeatingCircuit(current, circuit.id, {
          billingPeriodId: circuit.billingPeriodId,
          heatingSystemId: circuit.heatingSystemId,
          buildingId: circuit.buildingId,
          hasCentralHotWater: circuit.hasCentralHotWater,
          hotWaterSharePercent: circuit.hotWaterSharePercent ?? null,
          overrides: circuit.overrides ?? null,
          consumptionBenchmark: null,
        }),
      )
    ) {
      setEditingId(null)
      setBenchmarkErrors((current) => {
        const next = { ...current }
        delete next[circuitId]
        return next
      })
    }
  }

  if (buildings.length === 0)
    return (
      <p role="alert">Für dieses Objekt ist noch kein Gebäude vorhanden.</p>
    )

  return (
    <>
      <form noValidate onSubmit={create}>
        <label>
          <span>Gebäude</span>
          <select name="buildingId" aria-label="Gebäude" required>
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
        </label>
        <WorkflowField label="Heizsystem" name="systemName" required />
        <WorkflowField label="Quellenschlüssel" name="sourceKey" required />
        <WorkflowField label="Energiequelle" name="sourceName" required />
        <WorkflowField label="Energieträger" name="sourceType" required />
        <WorkflowField
          label="Heizwert kWh je Einheit"
          name="calorificValueKwhPerUnit"
        />
        <WorkflowField label="CO₂-Faktor kg je kWh" name="co2FactorKgPerKwh" />
        <label className="checkbox-field">
          <input type="checkbox" name="hasCentralHotWater" />
          <span>Zentrale Warmwasserbereitung</span>
        </label>
        <WorkflowField
          label="Warmwasseranteil in Prozent"
          name="hotWaterSharePercent"
        />
        <button type="submit">Heizkreis anlegen</button>
      </form>

      <section className="editable-records" aria-labelledby="circuits-title">
        <div className="data-panel__heading">
          <h2 id="circuits-title">Heizkreise ({circuits.length})</h2>
          <span>Anlagen, Verteilung und Energiequellen</span>
        </div>
        <div className="records-grid">
          {circuits.map((circuit) => {
            const system = systems.find(
              ({ id }) => id === circuit.heatingSystemId,
            )
            const source = data.billingData.energySources.find(
              ({ heatingCircuitId }) => heatingCircuitId === circuit.id,
            )
            const title = source?.name ?? source?.sourceType ?? 'Heizkreis'
            return (
              <article className="record-editor" key={circuit.id}>
                <div className="record-editor__heading">
                  <div>
                    <p className="section-kicker">
                      {
                        buildings.find(({ id }) => id === circuit.buildingId)
                          ?.name
                      }
                    </p>
                    <h3>{title}</h3>
                    <small>
                      {system?.name ?? 'Heizsystem ohne Namen'} · Schlüssel{' '}
                      {source?.key ?? '–'}
                    </small>
                  </div>
                  {source ? (
                    <button
                      type="button"
                      aria-label={`${title} bearbeiten`}
                      onClick={() => {
                        const opening = editingId !== circuit.id
                        setEditingId(opening ? circuit.id : null)
                        if (opening) {
                          setBenchmarkEnabled(
                            circuit.consumptionBenchmark != null,
                          )
                          setBenchmarkErrors((current) => {
                            const next = { ...current }
                            delete next[circuit.id]
                            return next
                          })
                        }
                      }}
                    >
                      Bearbeiten
                    </button>
                  ) : null}
                </div>
                {circuit.consumptionBenchmark ? (
                  <p>
                    Vergleichswerte: {circuit.consumptionBenchmark.category} ·{' '}
                    {circuit.consumptionBenchmark.source} · Bezugsjahr{' '}
                    {circuit.consumptionBenchmark.referenceYear}
                  </p>
                ) : (
                  <p>Kein Vergleich mit dem Durchschnittsnutzer hinterlegt.</p>
                )}
                {editingId === circuit.id && source && system ? (
                  <form
                    className="embedded-form"
                    noValidate
                    onSubmit={(event) => save(event, circuit.id, source.id)}
                  >
                    <label>
                      <span>Gebäude bearbeiten</span>
                      <select
                        name="buildingId"
                        defaultValue={circuit.buildingId}
                      >
                        {buildings.map((building) => (
                          <option key={building.id} value={building.id}>
                            {building.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <WorkflowField
                      label="Heizsystem bearbeiten"
                      name="systemName"
                      required
                      defaultValue={system.name ?? ''}
                    />
                    <WorkflowField
                      label="Quellenschlüssel bearbeiten"
                      name="sourceKey"
                      required
                      defaultValue={source.key}
                    />
                    <WorkflowField
                      label="Energiequelle bearbeiten"
                      name="sourceName"
                      defaultValue={source.name ?? ''}
                    />
                    <WorkflowField
                      label="Energieträger bearbeiten"
                      name="sourceType"
                      defaultValue={source.sourceType ?? ''}
                    />
                    <WorkflowField
                      label="Heizwert bearbeiten"
                      name="calorificValueKwhPerUnit"
                      defaultValue={source.calorificValueKwhPerUnit ?? ''}
                    />
                    <WorkflowField
                      label="CO₂-Faktor bearbeiten"
                      name="co2FactorKgPerKwh"
                      defaultValue={source.co2FactorKgPerKwh ?? ''}
                    />
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        name="hasCentralHotWater"
                        defaultChecked={circuit.hasCentralHotWater}
                      />
                      <span>Zentrale Warmwasserbereitung bearbeiten</span>
                    </label>
                    <WorkflowField
                      label="Warmwasseranteil bearbeiten"
                      name="hotWaterSharePercent"
                      defaultValue={circuit.hotWaterSharePercent ?? ''}
                    />
                    <WorkflowField
                      label="Verbrauchskostenanteil"
                      name="consumptionSharePercent"
                      defaultValue={
                        circuit.overrides?.consumptionSharePercent ?? ''
                      }
                    />
                    <WorkflowField
                      label="Grundkostenanteil"
                      name="baseSharePercent"
                      defaultValue={circuit.overrides?.baseSharePercent ?? ''}
                    />
                    <WorkflowField
                      label="Betriebsstromanteil"
                      name="operatingElectricitySharePercent"
                      defaultValue={
                        circuit.overrides?.operatingElectricitySharePercent ??
                        ''
                      }
                    />
                    <fieldset className="form-section">
                      <legend>Vergleichswerte (Heizspiegel)</legend>
                      <p>
                        Quelle, Bezugsjahr, Energieträger, Baualtersklasse und
                        Gebäudefläche müssen passen. Bitte prüfen Sie die
                        Eignung anhand der Quelle selbst; die App kann sie nicht
                        fachlich bestätigen.
                      </p>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          name="benchmarkEnabled"
                          checked={benchmarkEnabled}
                          onChange={(event) =>
                            setBenchmarkEnabled(event.currentTarget.checked)
                          }
                        />
                        <span>
                          Vergleichswerte für diesen Heizkreis hinterlegen
                        </span>
                      </label>
                      <WorkflowField
                        label="Quelle Vergleichswerte"
                        name="benchmarkSource"
                        required
                        disabled={!benchmarkEnabled}
                        defaultValue={
                          circuit.consumptionBenchmark?.source ??
                          DEFAULT_BENCHMARK_SOURCE
                        }
                      />
                      <WorkflowField
                        label="Fundstelle Vergleichswerte"
                        name="benchmarkSourceUrl"
                        type="url"
                        disabled={!benchmarkEnabled}
                        defaultValue={
                          circuit.consumptionBenchmark?.sourceUrl ?? ''
                        }
                      />
                      <WorkflowField
                        label="Bezugsjahr Vergleichswerte"
                        name="benchmarkReferenceYear"
                        type="number"
                        required
                        disabled={!benchmarkEnabled}
                        defaultValue={
                          circuit.consumptionBenchmark?.referenceYear ?? ''
                        }
                      />
                      <WorkflowField
                        label="Nutzerkategorie Vergleichswerte"
                        name="benchmarkCategory"
                        required
                        disabled={!benchmarkEnabled}
                        defaultValue={
                          circuit.consumptionBenchmark?.category ?? ''
                        }
                      />
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          name="benchmarkIncludesHotWater"
                          defaultChecked={
                            circuit.consumptionBenchmark?.includesHotWater ??
                            true
                          }
                          disabled={!benchmarkEnabled}
                        />
                        <span>Werte enthalten Warmwasser</span>
                      </label>
                      <WorkflowField
                        label="Niedrig bis (kWh/m²·a)"
                        name="benchmarkLowMax"
                        type="number"
                        required
                        disabled={!benchmarkEnabled}
                        defaultValue={
                          circuit.consumptionBenchmark?.lowMaxKwhPerSqmYear ??
                          ''
                        }
                      />
                      <WorkflowField
                        label="Mittel bis (kWh/m²·a)"
                        name="benchmarkMediumMax"
                        type="number"
                        required
                        disabled={!benchmarkEnabled}
                        defaultValue={
                          circuit.consumptionBenchmark
                            ?.mediumMaxKwhPerSqmYear ?? ''
                        }
                      />
                      <WorkflowField
                        label="Erhöht bis (kWh/m²·a)"
                        name="benchmarkElevatedMax"
                        type="number"
                        required
                        disabled={!benchmarkEnabled}
                        defaultValue={
                          circuit.consumptionBenchmark
                            ?.elevatedMaxKwhPerSqmYear ?? ''
                        }
                      />
                      {benchmarkErrors[circuit.id] ? (
                        <p role="alert">{benchmarkErrors[circuit.id]}</p>
                      ) : null}
                      {circuit.consumptionBenchmark && benchmarkEnabled ? (
                        <button
                          type="button"
                          onClick={() => removeBenchmark(circuit.id)}
                        >
                          Vergleichswerte entfernen
                        </button>
                      ) : null}
                    </fieldset>
                    <button type="submit">Heizkreis speichern</button>
                  </form>
                ) : null}
                {source && system ? (
                  <div className="danger-zone">
                    <button
                      type="button"
                      onClick={() =>
                        apply((current) =>
                          deleteEnergySource(current, source.id),
                        )
                      }
                    >
                      Energiequelle löschen
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        apply((current) =>
                          deleteHeatingCircuit(current, circuit.id),
                        )
                      }
                    >
                      Heizkreis löschen
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        apply((current) =>
                          deleteHeatingSystem(current, system.id),
                        )
                      }
                    >
                      Heizsystem löschen
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}
