import { useState, type FormEvent } from 'react'
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

function optionalNumber(form: FormData, name: string) {
  return parseOptionalNumber(formText(form, name)) ?? undefined
}

export function HeatingSetupPanel({
  data,
  selection,
  apply,
}: WorkflowSubRouteProps & { readonly apply: WorkflowApply }) {
  const [editingId, setEditingId] = useState<string | null>(null)
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
              : undefined,
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

  if (buildings.length === 0)
    return (
      <p role="alert">Für dieses Objekt ist noch kein Gebäude vorhanden.</p>
    )

  return (
    <>
      <form noValidate onSubmit={create}>
        <label>
          <span>Gebäude</span>
          <select name="buildingId" required>
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
                      onClick={() =>
                        setEditingId(
                          editingId === circuit.id ? null : circuit.id,
                        )
                      }
                    >
                      Bearbeiten
                    </button>
                  ) : null}
                </div>
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
