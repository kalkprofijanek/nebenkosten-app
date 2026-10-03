import { describe, expect, it } from 'vitest'
import { createMeteredFixture, meteringId as id } from './metered-fixture'
import { configureMeteredCircuit } from './metered-commands'
import { deleteMeter, updateMeter, updateMeterReading } from './meter-commands'
import { updateHeatingCircuit } from '../heating/heating-commands'

const assignments = [{ meterId: id(7), unitId: id(5) }]
describe('metered circuit configuration', () => {
  it('preserves assignments on heating edits and protects linked meters', () => {
    const source = configureMeteredCircuit(
      createMeteredFixture(),
      id(11),
      assignments,
      'manual',
    )
    const circuit = source.billingData.heatingCircuits[0]!
    const changed = updateHeatingCircuit(source, circuit.id, {
      billingPeriodId: circuit.billingPeriodId,
      buildingId: circuit.buildingId,
      heatingSystemId: circuit.heatingSystemId,
      hasCentralHotWater: false,
    })
    expect(changed.billingData.heatingCircuits[0]?.meterAssignments).toEqual(
      assignments,
    )
    expect(() => deleteMeter(source, id(7))).toThrow(/zugeordnet/)
    const locked = {
      ...source,
      billingData: {
        ...source.billingData,
        billingPeriods: source.billingData.billingPeriods.map((period) => ({
          ...period,
          status: 'FINALIZED' as const,
        })),
      },
    }
    expect(() =>
      updateMeter(locked, id(7), {
        propertyId: id(3),
        kind: 'unit_heat',
        meterNumber: 'EDIT',
      }),
    ).toThrow(/gesperrt/)
  })

  it('invalidates reviewed calculations when a reading changes', () => {
    const source = createMeteredFixture()
    const reviewed = {
      ...source,
      billingData: {
        ...source.billingData,
        billingPeriods: source.billingData.billingPeriods.map((period) => ({
          ...period,
          status: 'IN_REVIEW' as const,
        })),
      },
    }
    const reading = reviewed.billingData.meterReadings[0]!
    const { id: readingId, ...input } = reading
    const result = updateMeterReading(reviewed, readingId, {
      ...input,
      value: { value: 900, unit: 'kWh' },
    })
    expect(result.billingData.billingPeriods[0]?.status).toBe('DRAFT')
    expect(result.billingData.auditEvents).toHaveLength(1)
    expect(reviewed.billingData.billingPeriods[0]?.status).toBe('IN_REVIEW')
  })
  it('requires full readings before activation and preserves manual values', () => {
    const source = createMeteredFixture()
    const result = configureMeteredCircuit(
      source,
      id(11),
      assignments,
      'metered_kwh',
    )
    expect(result.billingData.heatingCircuits[0]?.consumptionMode).toBe(
      'metered_kwh',
    )
    expect(result.billingData.occupancyPeriods).toEqual(
      source.billingData.occupancyPeriods,
    )
    expect(
      source.billingData.heatingCircuits[0]?.consumptionMode,
    ).toBeUndefined()
    const missing = {
      ...source,
      billingData: {
        ...source.billingData,
        meterReadings: source.billingData.meterReadings.filter(
          (r) => r.id !== id(15),
        ),
      },
    }
    expect(() =>
      configureMeteredCircuit(missing, id(11), assignments, 'metered_kwh'),
    ).toThrow()
    expect(
      configureMeteredCircuit(missing, id(11), assignments, 'manual')
        .billingData.heatingCircuits[0]?.meterAssignments,
    ).toEqual(assignments)
  })
  it('blocks duplicate or foreign assignments and locked years', () => {
    const source = createMeteredFixture()
    expect(() =>
      configureMeteredCircuit(
        source,
        id(11),
        [...assignments, ...assignments],
        'manual',
      ),
    ).toThrow()
    expect(() =>
      configureMeteredCircuit(
        source,
        id(11),
        [{ meterId: id(7), unitId: id(99) }],
        'manual',
      ),
    ).toThrow()
    const locked = {
      ...source,
      billingData: {
        ...source.billingData,
        billingPeriods: source.billingData.billingPeriods.map((period) => ({
          ...period,
          status: 'FINALIZED' as const,
        })),
      },
    }
    expect(() =>
      configureMeteredCircuit(locked, id(11), assignments, 'manual'),
    ).toThrow(/gesperrt/)
  })
})
