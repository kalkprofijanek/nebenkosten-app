import { describe, expect, it } from 'vitest'

import {
  appDataFileSchema,
  createEmptyAppDataFile,
  energySourceSchema,
  heatingCircuitSchema,
} from '../src'

/** Fiktiver Heizkreis mit Wärmepumpe (ADR-0010 „Wärmepumpen“). */
const circuit = {
  id: 'circuit_wp',
  billingPeriodId: 'bp_1',
  heatingSystemId: 'hs_1',
  buildingId: 'b_1',
  hasCentralHotWater: true,
}

const source = {
  id: 'source_wp',
  heatingCircuitId: 'circuit_wp',
  key: 'wp_strom',
  name: 'Wärmepumpenstrom',
  sourceType: 'Strom',
  calorificValueKwhPerUnit: 1,
}

describe('Erzeugte Wärme am Heizkreis (generatedHeatKwh)', () => {
  it('ist optional und abwärtskompatibel', () => {
    expect(heatingCircuitSchema.safeParse(circuit).success).toBe(true)
    expect(
      heatingCircuitSchema.safeParse({ ...circuit, generatedHeatKwh: null })
        .success,
    ).toBe(true)
    expect(
      heatingCircuitSchema.safeParse({ ...circuit, generatedHeatKwh: 68_800 })
        .success,
    ).toBe(true)
  })

  it('verlangt eine positive, endliche Wärmemenge', () => {
    for (const generatedHeatKwh of [0, -1, Number.POSITIVE_INFINITY])
      expect(
        heatingCircuitSchema.safeParse({ ...circuit, generatedHeatKwh })
          .success,
      ).toBe(false)
  })
})

describe('Jahresarbeitszahl der Energiequelle (seasonalPerformanceFactor)', () => {
  it('ist optional und abwärtskompatibel', () => {
    expect(energySourceSchema.safeParse(source).success).toBe(true)
    expect(
      energySourceSchema.safeParse({
        ...source,
        seasonalPerformanceFactor: null,
      }).success,
    ).toBe(true)
    expect(
      energySourceSchema.safeParse({
        ...source,
        seasonalPerformanceFactor: 3.2,
      }).success,
    ).toBe(true)
  })

  it('liegt zwischen 1 und 8', () => {
    for (const seasonalPerformanceFactor of [0.5, 8.5])
      expect(
        energySourceSchema.safeParse({ ...source, seasonalPerformanceFactor })
          .success,
      ).toBe(false)
    for (const seasonalPerformanceFactor of [1, 8])
      expect(
        energySourceSchema.safeParse({ ...source, seasonalPerformanceFactor })
          .success,
      ).toBe(true)
  })

  it('nimmt Schätzkennzeichen und Begründung auf', () => {
    expect(
      energySourceSchema.safeParse({
        ...source,
        seasonalPerformanceFactor: 3.2,
        seasonalPerformanceFactorEstimated: true,
        seasonalPerformanceFactorReason: 'Herstellerangabe (fiktiv)',
      }).success,
    ).toBe(true)
    expect(
      energySourceSchema.safeParse({
        ...source,
        seasonalPerformanceFactorReason: '   ',
      }).success,
    ).toBe(false)
  })

  it('bleibt in einer Datei der Schema-Version 5 gültig', () => {
    const file = createEmptyAppDataFile()
    file.billingData.heatingCircuits.push({
      ...circuit,
      generatedHeatKwh: 68_800,
    })
    file.billingData.energySources.push({
      ...source,
      seasonalPerformanceFactor: 3.2,
    })
    const parsed = appDataFileSchema.parse(file)
    expect(parsed.schemaVersion).toBe(5)
    expect(parsed.billingData.heatingCircuits[0]?.generatedHeatKwh).toBe(68_800)
    expect(parsed.billingData.energySources[0]?.seasonalPerformanceFactor).toBe(
      3.2,
    )
  })
})
