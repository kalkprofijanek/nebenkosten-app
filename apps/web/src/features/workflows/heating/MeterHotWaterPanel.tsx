import type { AppDataFile } from '@nebenkosten/schema'
import { useState, type FormEvent } from 'react'
import { configureHotWaterMeterAssignments } from '../../metering/metered-commands'
import type { WorkflowApply } from '../HeatingRoute'

/**
 * Assignment of flat hot-water meters (m³) to flats of a heating circuit for
 * the monthly consumption information (ADR-0014). Mirrors the assignment of
 * flat heat meters in `MeterConsumptionPanel`.
 */
export function MeterHotWaterPanel({
  data,
  billingPeriodId,
  apply,
}: {
  readonly data: AppDataFile
  readonly billingPeriodId: string
  readonly apply: WorkflowApply
}) {
  const circuits = data.billingData.heatingCircuits.filter(
    (circuit) => circuit.billingPeriodId === billingPeriodId,
  )
  const [selectedId, setSelectedId] = useState(circuits[0]?.id ?? '')
  const [dirty, setDirty] = useState(false)
  const circuit = circuits.find(({ id }) => id === selectedId) ?? circuits[0]
  if (!circuit)
    return (
      <p>Lege zuerst einen Heizkreis an, um Warmwasserzähler zuzuordnen.</p>
    )
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )!
  const meters = data.masterData.meters.filter(
    (meter) =>
      meter.propertyId === period.propertyId && meter.kind === 'unit_hot_water',
  )
  const units = data.masterData.units.filter(
    (unit) =>
      unit.propertyId === period.propertyId &&
      unit.buildingId === circuit.buildingId,
  )
  const stored = circuit.hotWaterMeterAssignments ?? []

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const assignments = meters.flatMap((meter) => {
      const unitId = String(form.get(meter.id) ?? '')
      return unitId ? [{ meterId: meter.id, unitId }] : []
    })
    if (
      apply((current) =>
        configureHotWaterMeterAssignments(current, circuit!.id, assignments),
      )
    )
      setDirty(false)
  }

  return (
    <section className="record-editor" aria-labelledby="hot-water-meter-title">
      <h2 id="hot-water-meter-title">Warmwasserzähler je Wohnung</h2>
      <p>
        Ordne die Wohnungs-Warmwasserzähler für {period.year} zu. Die Stände
        werden in m³ erfasst und für die monatliche Verbrauchsinformation
        verwendet.
      </p>
      <label>
        <span>Heizkreis für Warmwasser</span>
        <select
          value={circuit.id}
          onChange={(event) => {
            setSelectedId(event.target.value)
            setDirty(false)
          }}
        >
          {circuits.map((item) => (
            <option key={item.id} value={item.id}>
              {data.masterData.buildings.find(
                ({ id }) => id === item.buildingId,
              )?.name ?? 'Heizkreis'}
            </option>
          ))}
        </select>
      </label>
      {!circuit.hasCentralHotWater ? (
        <>
          <p role="status">
            Dieser Heizkreis hat keine zentrale Warmwasserbereitung.
            Warmwasserzähler werden nur bei zentraler Warmwasserbereitung
            zugeordnet.
          </p>
          {stored.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                apply((current) =>
                  configureHotWaterMeterAssignments(current, circuit.id, []),
                )
              }
            >
              Warmwasserzuordnung entfernen
            </button>
          ) : null}
        </>
      ) : (
        <form
          key={`${circuit.id}-${JSON.stringify(stored)}`}
          onSubmit={save}
          onChange={() => setDirty(true)}
        >
          {meters.map((meter) => (
            <label key={meter.id}>
              <span>
                Wohnung für Warmwasserzähler {meter.meterNumber ?? meter.id}
              </span>
              <select
                name={meter.id}
                defaultValue={
                  stored.find((item) => item.meterId === meter.id)?.unitId ?? ''
                }
              >
                <option value="">Nicht zugeordnet</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label ?? unit.location ?? unit.id}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {meters.length === 0 ? (
            <p>
              Lege unten einen Zähler der Art „Wohnungs-Warmwasserzähler (m³)“
              an.
            </p>
          ) : (
            <>
              {dirty ? (
                <p role="status">
                  Bitte die geänderte Warmwasserzuordnung zuerst speichern.
                </p>
              ) : null}
              <button type="submit">Warmwasserzuordnung speichern</button>
            </>
          )}
        </form>
      )}
    </section>
  )
}
