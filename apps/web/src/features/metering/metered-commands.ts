import {
  createCalculationInput,
  resolveMeteredConsumption,
} from '@nebenkosten/core'
import {
  appDataFileSchema,
  heatingCircuitSchema,
  type AppDataFile,
  type HeatingCircuit,
} from '@nebenkosten/schema'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'
import { MeterCommandError } from './meter-commands'

export function configureMeteredCircuit(
  source: AppDataFile,
  circuitId: string,
  assignments: NonNullable<HeatingCircuit['meterAssignments']>,
  mode: NonNullable<HeatingCircuit['consumptionMode']>,
): AppDataFile {
  const circuit = source.billingData.heatingCircuits.find(
    ({ id }) => id === circuitId,
  )
  if (!circuit) throw new MeterCommandError('Heizkreis wurde nicht gefunden.')
  return applyEditableBillingPeriodChange(
    source,
    circuit.billingPeriodId,
    (data) => {
      const nextCircuit = heatingCircuitSchema.parse({
        ...circuit,
        consumptionMode: mode,
        meterAssignments: assignments,
      })
      const period = data.billingData.billingPeriods.find(
        ({ id }) => id === circuit.billingPeriodId,
      )!
      const used = new Set<string>()
      for (const assignment of nextCircuit.meterAssignments ?? []) {
        const meter = data.masterData.meters.find(
          ({ id }) => id === assignment.meterId,
        )
        const unit = data.masterData.units.find(
          ({ id }) => id === assignment.unitId,
        )
        if (
          !meter ||
          meter.kind !== 'unit_heat' ||
          meter.propertyId !== period.propertyId ||
          !unit ||
          unit.propertyId !== period.propertyId ||
          unit.buildingId !== circuit.buildingId
        ) {
          throw new MeterCommandError(
            'Wohnungszähler und Wohnung müssen zum Objekt und Gebäude des Heizkreises gehören.',
          )
        }
        if (
          used.has(meter.id) ||
          data.billingData.heatingCircuits.some(
            (other) =>
              other.id !== circuitId &&
              other.billingPeriodId === period.id &&
              other.meterAssignments?.some((item) => item.meterId === meter.id),
          )
        ) {
          throw new MeterCommandError(
            'Ein Zähler darf im Abrechnungsjahr nur einmal zugeordnet werden.',
          )
        }
        used.add(meter.id)
      }
      const next = appDataFileSchema.parse({
        ...data,
        billingData: {
          ...data.billingData,
          heatingCircuits: data.billingData.heatingCircuits.map((item) =>
            item.id === circuitId ? nextCircuit : item,
          ),
        },
      })
      if (mode === 'metered_kwh') {
        const resolved = resolveMeteredConsumption(
          createCalculationInput(next, period.id),
        )
        if (!resolved.ok)
          throw new MeterCommandError(
            'Die Messberechnung ist noch nicht möglich. Bitte Zuordnungen, Nutzerzeiträume und alle Grenzablesungen prüfen.',
          )
      }
      return next
    },
  )
}
