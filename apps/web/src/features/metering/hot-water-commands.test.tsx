import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import {
  createHotWaterFixture,
  createMeteredFixture,
  meteringId as id,
} from './metered-fixture'
import {
  configureHotWaterMeterAssignments,
  configureMeteredCircuit,
} from './metered-commands'
import {
  addMeter,
  addMeterReading,
  deleteMeter,
  updateMeter,
} from './meter-commands'

const hotWater = [
  { meterId: id(41), unitId: id(5) },
  { meterId: id(42), unitId: id(40) },
]

function locked(source: AppDataFile): AppDataFile {
  return {
    ...source,
    billingData: {
      ...source.billingData,
      billingPeriods: source.billingData.billingPeriods.map((period) => ({
        ...period,
        status: 'FINALIZED' as const,
      })),
    },
  }
}

describe('Warmwasserzähler je Wohnung', () => {
  it('legt einen Wohnungs-Warmwasserzähler mit m³-Ablesung an', () => {
    let result = addMeter(
      createMeteredFixture(),
      {
        propertyId: id(3),
        kind: 'unit_hot_water',
        meterNumber: 'TEST-WW-NEU',
        meterNumberStatus: 'open',
      },
      { createId: () => id(50) },
    )
    expect(result.masterData.meters.at(-1)).toMatchObject({
      id: id(50),
      kind: 'unit_hot_water',
    })
    result = addMeterReading(
      result,
      {
        meterId: id(50),
        billingPeriodId: id(10),
        date: '2026-01-31',
        boundary: 'end_of_day',
        value: { value: 12.5, unit: 'm3' },
        source: 'imported',
      },
      { createId: () => id(51) },
    )
    expect(result.billingData.meterReadings.at(-1)?.value).toEqual({
      value: 12.5,
      unit: 'm3',
    })
  })

  it('ordnet Warmwasserzähler zu, ohne die Wärmezuordnung zu verändern', () => {
    const source = configureMeteredCircuit(
      createHotWaterFixture(),
      id(11),
      [{ meterId: id(7), unitId: id(5) }],
      'manual',
    )
    const result = configureHotWaterMeterAssignments(source, id(11), hotWater)
    const circuit = result.billingData.heatingCircuits[0]!
    expect(circuit.hotWaterMeterAssignments).toEqual(hotWater)
    expect(circuit.meterAssignments).toEqual([
      { meterId: id(7), unitId: id(5) },
    ])
    expect(circuit.consumptionMode).toBe('manual')
    expect(
      source.billingData.heatingCircuits[0]?.hotWaterMeterAssignments,
    ).toBeUndefined()
    expect(
      configureHotWaterMeterAssignments(result, id(11), []).billingData
        .heatingCircuits[0]?.hotWaterMeterAssignments,
    ).toEqual([])
  })

  it('verlangt zentrale Warmwasserbereitung, erlaubt aber das Entfernen', () => {
    const source = createHotWaterFixture(false)
    expect(() =>
      configureHotWaterMeterAssignments(source, id(11), hotWater),
    ).toThrow(/zentraler Warmwasserbereitung/)
    const stale = {
      ...source,
      billingData: {
        ...source.billingData,
        heatingCircuits: source.billingData.heatingCircuits.map((circuit) => ({
          ...circuit,
          hotWaterMeterAssignments: hotWater,
        })),
      },
    }
    expect(
      configureHotWaterMeterAssignments(stale, id(11), []).billingData
        .heatingCircuits[0]?.hotWaterMeterAssignments,
    ).toEqual([])
  })

  it('weist falsche Zählerarten, fremde Wohnungen und Doppelungen zurück', () => {
    const source = createHotWaterFixture()
    expect(() =>
      configureHotWaterMeterAssignments(source, id(99), hotWater),
    ).toThrow(/Heizkreis wurde nicht gefunden/)
    expect(() =>
      configureHotWaterMeterAssignments(source, id(11), [
        { meterId: id(7), unitId: id(5) },
      ]),
    ).toThrow(/Warmwasserzähler und Wohnung/)
    expect(() =>
      configureHotWaterMeterAssignments(source, id(11), [
        { meterId: id(41), unitId: id(99) },
      ]),
    ).toThrow(/Warmwasserzähler und Wohnung/)
    expect(() =>
      configureHotWaterMeterAssignments(source, id(11), [
        hotWater[0]!,
        hotWater[0]!,
      ]),
    ).toThrow(/nur einmal/)
    expect(() =>
      configureHotWaterMeterAssignments(source, id(11), [
        { meterId: 'keine-id', unitId: id(5) },
      ]),
    ).toThrow()
    const twoCircuits = {
      ...source,
      billingData: {
        ...source.billingData,
        heatingCircuits: [
          ...source.billingData.heatingCircuits,
          {
            ...source.billingData.heatingCircuits[0]!,
            id: id(43),
            hotWaterMeterAssignments: [hotWater[0]!],
          },
        ],
      },
    }
    expect(() =>
      configureHotWaterMeterAssignments(twoCircuits, id(11), [hotWater[0]!]),
    ).toThrow(/nur einmal/)
    // Mehrere Zähler derselben Wohnung werden summiert und sind zulässig.
    expect(
      configureHotWaterMeterAssignments(source, id(11), [
        { meterId: id(41), unitId: id(5) },
        { meterId: id(42), unitId: id(5) },
      ]).billingData.heatingCircuits[0]?.hotWaterMeterAssignments,
    ).toHaveLength(2)
  })

  it('schützt zugeordnete Warmwasserzähler und gesperrte Jahre', () => {
    const assigned = configureHotWaterMeterAssignments(
      createHotWaterFixture(),
      id(11),
      hotWater,
    )
    expect(() => deleteMeter(assigned, id(41))).toThrow(/zugeordnet/)
    expect(() =>
      updateMeter(assigned, id(41), {
        propertyId: id(3),
        kind: 'unit_heat',
        meterNumber: 'TEST-WW-1',
      }),
    ).toThrow(/Warmwasserzähler/)
    expect(
      updateMeter(assigned, id(41), {
        propertyId: id(3),
        kind: 'unit_hot_water',
        meterNumber: 'TEST-WW-1A',
      }).masterData.meters.find(({ id: meterId }) => meterId === id(41))
        ?.meterNumber,
    ).toBe('TEST-WW-1A')
    expect(() =>
      updateMeter(locked(assigned), id(41), {
        propertyId: id(3),
        kind: 'unit_hot_water',
        meterNumber: 'TEST-WW-1B',
      }),
    ).toThrow(/gesperrt/)
    expect(() =>
      configureHotWaterMeterAssignments(
        locked(createHotWaterFixture()),
        id(11),
        hotWater,
      ),
    ).toThrow(/gesperrt/)
    expect(
      deleteMeter(createHotWaterFixture(), id(42)).masterData.meters,
    ).toHaveLength(2)
  })
})
