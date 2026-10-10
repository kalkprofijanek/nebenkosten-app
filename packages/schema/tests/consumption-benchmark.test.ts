import { describe, expect, it } from 'vitest'

import {
  appDataFileSchema,
  consumptionBenchmarkSchema,
  createEmptyAppDataFile,
  heatingCircuitSchema,
} from '../src'

/** Fiktive Klassengrenzen; keine Werte einer echten Heizspiegel-Ausgabe. */
const benchmark = {
  source: 'Heizspiegel für Deutschland (co2online)',
  sourceUrl: 'https://www.heizspiegel.de/',
  referenceYear: 2024,
  category: 'Erdgas, fiktive Baualtersklasse',
  includesHotWater: true,
  lowMaxKwhPerSqmYear: 70,
  mediumMaxKwhPerSqmYear: 130,
  elevatedMaxKwhPerSqmYear: 200,
}

const circuit = {
  id: 'circuit_1',
  billingPeriodId: 'bp_1',
  heatingSystemId: 'hs_1',
  buildingId: 'b_1',
  hasCentralHotWater: true,
  hotWaterSharePercent: 18,
}

describe('Vergleichswerte § 6a Abs. 3 Nr. 4 HeizKV (consumptionBenchmark)', () => {
  it('ist am Heizkreis optional und abwärtskompatibel', () => {
    expect(heatingCircuitSchema.safeParse(circuit).success).toBe(true)
    expect(
      heatingCircuitSchema.safeParse({ ...circuit, consumptionBenchmark: null })
        .success,
    ).toBe(true)
    expect(
      heatingCircuitSchema.safeParse({
        ...circuit,
        consumptionBenchmark: benchmark,
      }).success,
    ).toBe(true)
  })

  it('bleibt in einer Datei der Schema-Version 5 gültig', () => {
    const file = createEmptyAppDataFile()
    file.billingData.heatingCircuits.push({
      ...circuit,
      consumptionBenchmark: benchmark,
    })
    const parsed = appDataFileSchema.parse(file)
    expect(parsed.schemaVersion).toBe(5)
    expect(parsed.billingData.heatingCircuits[0]?.consumptionBenchmark).toEqual(
      benchmark,
    )
  })

  it('verlangt aufsteigende, positive Klassengrenzen', () => {
    expect(
      consumptionBenchmarkSchema.safeParse({
        ...benchmark,
        mediumMaxKwhPerSqmYear: 60,
      }).success,
    ).toBe(false)
    expect(
      consumptionBenchmarkSchema.safeParse({
        ...benchmark,
        elevatedMaxKwhPerSqmYear: 130,
      }).success,
    ).toBe(false)
    expect(
      consumptionBenchmarkSchema.safeParse({
        ...benchmark,
        lowMaxKwhPerSqmYear: 0,
      }).success,
    ).toBe(false)
  })

  it('verlangt Quelle, Kategorie und Bezugsjahr', () => {
    expect(
      consumptionBenchmarkSchema.safeParse({ ...benchmark, source: ' ' })
        .success,
    ).toBe(false)
    expect(
      consumptionBenchmarkSchema.safeParse({ ...benchmark, category: '' })
        .success,
    ).toBe(false)
    expect(
      consumptionBenchmarkSchema.safeParse({
        ...benchmark,
        referenceYear: 2024.5,
      }).success,
    ).toBe(false)
    const withoutYear: Partial<typeof benchmark> = { ...benchmark }
    delete withoutYear.referenceYear
    expect(consumptionBenchmarkSchema.safeParse(withoutYear).success).toBe(
      false,
    )
  })

  it('lehnt unbekannte Felder und andere URL-Schemata ab', () => {
    expect(
      consumptionBenchmarkSchema.safeParse({ ...benchmark, extra: 1 }).success,
    ).toBe(false)
    expect(
      consumptionBenchmarkSchema.safeParse({
        ...benchmark,
        sourceUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false)
    expect(
      consumptionBenchmarkSchema.safeParse({ ...benchmark, sourceUrl: null })
        .success,
    ).toBe(true)
  })
})
