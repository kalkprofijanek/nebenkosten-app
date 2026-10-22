import {
  createCalculationInput,
  resolveMeteredConsumption,
} from '@nebenkosten/core'
import {
  appDataFileSchema,
  heatingCircuitSchema,
  type AppDataFile,
  type BillingPeriod,
  type HeatingCircuit,
} from '@nebenkosten/schema'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'
import { MeterCommandError } from './meter-commands'

type UnitMeterAssignment = NonNullable<
  HeatingCircuit['meterAssignments']
>[number]

const ASSIGNMENT_RULES = {
  meterAssignments: {
    kind: 'unit_heat',
    mismatch:
      'Wohnungszähler und Wohnung müssen zum Objekt und Gebäude des Heizkreises gehören.',
  },
  hotWaterMeterAssignments: {
    kind: 'unit_hot_water',
    mismatch:
      'Warmwasserzähler und Wohnung müssen zum Objekt und Gebäude des Heizkreises gehören.',
  },
} as const

/**
 * Checks flat meter assignments of one heating circuit: matching meter kind,
 * property and building, and each meter at most once per billing period.
 */
function assertUnitMeterAssignments(
  data: AppDataFile,
  circuit: HeatingCircuit,
  period: BillingPeriod,
  assignments: readonly UnitMeterAssignment[],
  key: keyof typeof ASSIGNMENT_RULES,
) {
  const rule = ASSIGNMENT_RULES[key]
  const used = new Set<string>()
  for (const assignment of assignments) {
    const meter = data.masterData.meters.find(
      ({ id }) => id === assignment.meterId,
    )
    const unit = data.masterData.units.find(
      ({ id }) => id === assignment.unitId,
    )
    if (
      !meter ||
      meter.kind !== rule.kind ||
      meter.propertyId !== period.propertyId ||
      !unit ||
      unit.propertyId !== period.propertyId ||
      unit.buildingId !== circuit.buildingId
    ) {
      throw new MeterCommandError(rule.mismatch)
    }
    if (
      used.has(meter.id) ||
      data.billingData.heatingCircuits.some(
        (other) =>
          other.id !== circuit.id &&
          other.billingPeriodId === period.id &&
          other[key]?.some((item) => item.meterId === meter.id),
      )
    ) {
      throw new MeterCommandError(
        'Ein Zähler darf im Abrechnungsjahr nur einmal zugeordnet werden.',
      )
    }
    used.add(meter.id)
  }
}

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
      assertUnitMeterAssignments(
        data,
        circuit,
        period,
        nextCircuit.meterAssignments ?? [],
        'meterAssignments',
      )
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

/**
 * Assigns flat hot-water meters (`unit_hot_water`, m³) to flats of a heating
 * circuit for the monthly consumption information (ADR-0014). Only circuits
 * with central hot water accept assignments; an empty list always clears
 * them. The metered heat assignments and the consumption mode stay as is.
 */
export function configureHotWaterMeterAssignments(
  source: AppDataFile,
  circuitId: string,
  assignments: NonNullable<HeatingCircuit['hotWaterMeterAssignments']>,
): AppDataFile {
  const circuit = source.billingData.heatingCircuits.find(
    ({ id }) => id === circuitId,
  )
  if (!circuit) throw new MeterCommandError('Heizkreis wurde nicht gefunden.')
  return applyEditableBillingPeriodChange(
    source,
    circuit.billingPeriodId,
    (data) => {
      const parsed = heatingCircuitSchema.safeParse({
        ...circuit,
        hotWaterMeterAssignments: assignments,
      })
      if (!parsed.success)
        throw new MeterCommandError(
          'Die Warmwasserzuordnung enthält ungültige Felder.',
        )
      const nextCircuit = parsed.data
      const nextAssignments = nextCircuit.hotWaterMeterAssignments ?? []
      if (nextAssignments.length > 0 && !circuit.hasCentralHotWater)
        throw new MeterCommandError(
          'Warmwasserzähler können nur Heizkreisen mit zentraler Warmwasserbereitung zugeordnet werden.',
        )
      const period = data.billingData.billingPeriods.find(
        ({ id }) => id === circuit.billingPeriodId,
      )!
      assertUnitMeterAssignments(
        data,
        circuit,
        period,
        nextAssignments,
        'hotWaterMeterAssignments',
      )
      return appDataFileSchema.parse({
        ...data,
        billingData: {
          ...data.billingData,
          heatingCircuits: data.billingData.heatingCircuits.map((item) =>
            item.id === circuitId ? nextCircuit : item,
          ),
        },
      })
    },
  )
}
