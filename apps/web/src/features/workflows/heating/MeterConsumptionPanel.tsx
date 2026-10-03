import {
  createCalculationInput,
  resolveMeteredConsumption,
  type MeteredConsumptionIssue,
} from '@nebenkosten/core'
import type { AppDataFile, HeatingCircuit } from '@nebenkosten/schema'
import { useState, type FormEvent } from 'react'
import { configureMeteredCircuit } from '../../metering/metered-commands'
import type { WorkflowApply } from '../HeatingRoute'

function previewCircuit(data: AppDataFile, circuit: HeatingCircuit) {
  try {
    const preview = {
      ...data,
      billingData: {
        ...data.billingData,
        heatingCircuits: data.billingData.heatingCircuits.map((item) =>
          item.id === circuit.id
            ? { ...item, consumptionMode: 'metered_kwh' as const }
            : item,
        ),
      },
    }
    return resolveMeteredConsumption(
      createCalculationInput(preview, circuit.billingPeriodId),
    )
  } catch {
    return null
  }
}

/** Where a blocking problem is corrected; assignments are edited right here. */
function correctionLink(issue: MeteredConsumptionIssue) {
  if (issue.code.startsWith('metered.occupancy_'))
    return issue.occupancyId
      ? {
          href: `#/nutzer?edit=${encodeURIComponent(issue.occupancyId)}`,
          label: 'Nutzerzeitraum bearbeiten',
        }
      : { href: '#/nutzer', label: 'Nutzerzeiträume bearbeiten' }
  if (issue.meterId)
    return {
      href: `#/heizkreise?tab=meters&meter=${encodeURIComponent(issue.meterId)}`,
      label: 'Ablesungen anzeigen',
    }
  return null
}

export function MeterConsumptionPanel({
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
  const [assignmentsDirty, setAssignmentsDirty] = useState(false)
  const circuit = circuits.find(({ id }) => id === selectedId) ?? circuits[0]
  if (!circuit)
    return <p>Lege zuerst einen Heizkreis an, um Wohnungszähler zuzuordnen.</p>
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )!
  const meters = data.masterData.meters.filter(
    (meter) =>
      meter.propertyId === period.propertyId && meter.kind === 'unit_heat',
  )
  const units = data.masterData.units.filter(
    (unit) =>
      unit.propertyId === period.propertyId &&
      unit.buildingId === circuit.buildingId,
  )
  const preview = previewCircuit(data, circuit)
  const resolved = preview?.ok
    ? preview.circuits.find((item) => item.heatingCircuitId === circuit.id)
    : undefined
  const mode = circuit.consumptionMode ?? 'manual'

  function saveAssignments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const assignments = meters.flatMap((meter) => {
      const unitId = String(form.get(meter.id) ?? '')
      return unitId ? [{ meterId: meter.id, unitId }] : []
    })
    const accepted = apply((current) =>
      configureMeteredCircuit(current, circuit!.id, assignments, 'manual'),
    )
    if (accepted) setAssignmentsDirty(false)
  }

  return (
    <section
      className="record-editor"
      aria-labelledby="meter-consumption-title"
    >
      <h2 id="meter-consumption-title">Wohnungswärme aus Ablesungen</h2>
      <p>
        Ordne die Wohnungszähler für {period.year} zu. Für jeden Nutzerwechsel
        werden bestätigte Grenzablesungen benötigt. Bestehende manuelle
        Verbrauchswerte bleiben erhalten.
      </p>
      <label>
        <span>Heizkreis für Wohnungswärme</span>
        <select
          value={circuit.id}
          onChange={(event) => {
            setSelectedId(event.target.value)
            setAssignmentsDirty(false)
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
      <p>
        <strong>
          {mode === 'metered_kwh'
            ? 'Messverbrauch aktiv'
            : 'Manuelle Verbrauchswerte aktiv'}
        </strong>
      </p>
      <form
        key={`${circuit.id}-${JSON.stringify(circuit.meterAssignments)}`}
        onSubmit={saveAssignments}
        onChange={() => setAssignmentsDirty(true)}
      >
        {meters.map((meter) => (
          <label key={meter.id}>
            <span>Wohnung für {meter.meterNumber ?? meter.id}</span>
            <select
              name={meter.id}
              defaultValue={
                circuit.meterAssignments?.find(
                  (item) => item.meterId === meter.id,
                )?.unitId ?? ''
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
          <p>Lege unten einen Zähler der Art „Wohnungswärme (kWh)“ an.</p>
        ) : (
          <>
            <p>
              Beim Speichern der Zuordnung wird zunächst der manuelle Modus
              verwendet. Aktiviere die Messberechnung nach der Prüfung erneut.
            </p>
            <button type="submit">Zuordnung speichern</button>
          </>
        )}
      </form>
      <h3>Verbrauchsvorschau</h3>
      {assignmentsDirty ? (
        <p role="status">
          Bitte die geänderte Zuordnung zuerst speichern. Die Vorschau zeigt den
          gespeicherten Stand.
        </p>
      ) : null}
      {resolved ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <caption>Grenzablesungen je Nutzerzeitraum</caption>
            <thead>
              <tr>
                <th>Wohnung</th>
                <th>Zeitraum</th>
                <th>Verbrauch</th>
                <th>Ablesungen</th>
              </tr>
            </thead>
            <tbody>
              {resolved.occupancies.map((occupancy) => (
                <tr key={occupancy.occupancyId}>
                  <td>
                    {units.find(({ id }) => id === occupancy.unitId)?.label ??
                      'Wohnung'}
                    {data.billingData.occupancyPeriods.find(
                      ({ id }) => id === occupancy.occupancyId,
                    )?.kind === 'vacancy'
                      ? ' · Leerstand'
                      : ''}
                  </td>
                  <td>
                    {occupancy.from} bis {occupancy.to}
                  </td>
                  <td>{occupancy.kwh} kWh</td>
                  <td>
                    {occupancy.meters.map((meter) => (
                      <div key={meter.meterId}>
                        {data.masterData.meters.find(
                          ({ id }) => id === meter.meterId,
                        )?.meterNumber ?? 'Zähler'}
                        : {meter.startValue} → {meter.endValue} kWh
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="status">
          <p>Automatische Ermittlung noch nicht möglich.</p>
          {preview && !preview.ok ? (
            <ul>
              {preview.issues
                .filter(
                  ({ heatingCircuitId }) => heatingCircuitId === circuit.id,
                )
                .map((issue, index) => {
                  const meterNumber = data.masterData.meters.find(
                    (meter) => meter.id === issue.meterId,
                  )?.meterNumber
                  const unitLabel = units.find(
                    (unit) => unit.id === issue.unitId,
                  )?.label
                  const link = correctionLink(issue)
                  return (
                    <li key={`${issue.code}-${index}`}>
                      {meterNumber ? `${meterNumber}: ` : ''}
                      {unitLabel ? `${unitLabel}: ` : ''}
                      {issue.detail}
                      {link ? (
                        <>
                          {' '}
                          <a href={link.href}>{link.label}</a>
                        </>
                      ) : null}
                    </li>
                  )
                })}
            </ul>
          ) : (
            <p>Bitte die Stammdaten und Nutzerzeiträume prüfen.</p>
          )}
        </div>
      )}
      <button
        type="button"
        disabled={assignmentsDirty || !resolved || mode === 'metered_kwh'}
        onClick={() =>
          apply((current) =>
            configureMeteredCircuit(
              current,
              circuit.id,
              circuit.meterAssignments ?? [],
              'metered_kwh',
            ),
          )
        }
      >
        Messverbrauch aktivieren
      </button>
      <button
        type="button"
        disabled={assignmentsDirty || mode === 'manual'}
        onClick={() =>
          apply((current) =>
            configureMeteredCircuit(
              current,
              circuit.id,
              circuit.meterAssignments ?? [],
              'manual',
            ),
          )
        }
      >
        Manuelle Verbrauchswerte verwenden
      </button>
    </section>
  )
}
