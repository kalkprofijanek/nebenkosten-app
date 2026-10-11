import { describe, expect, it } from 'vitest'
import type { AppDataFile, ClimateFactor } from '@nebenkosten/schema'
import {
  calculateBilling,
  compareTenantEnergyWithPreviousPeriod,
  consumptionEstimation,
  createCalculationInput,
  previousPeriodComparisonBasis,
  previousPeriodConsumption,
  shiftIsoDateByYears,
  previousPeriodWeatherFactors,
  tenantEnergyKwh,
} from '../src'

/** Fiktiver Klimafaktor; kein Wert einer echten DWD-Liste. */
const climate = (year: number, factor: number): ClimateFactor => ({
  postalCode: '12345',
  factor,
  periodStart: `${year}-01-01`,
  periodEnd: `${year}-12-31`,
  source: 'DWD, Klimafaktoren',
})

interface YearSpec {
  readonly year: number
  /** Heizöl in Litern à 10 kWh. */
  readonly liters: number
  readonly unitsA: number
  readonly unitsB: number
  readonly climateFactor?: ClimateFactor | null
}

/**
 * Fiktives Haus: 2 × 100 m², je zwei Personen ganzjährig, 20 % Warmwasser.
 * Mietpartei A (Mietverhältnis `ten-a`) wohnt in beiden Jahren in `unit-a`.
 */
function data(years: readonly YearSpec[]): AppDataFile {
  const area = (value: number) => ({ value, unit: 'm2' })
  const periodId = (year: number) => `p-${year}`
  return {
    schemaVersion: 5,
    meta: { appVersion: 'previous-period-test' },
    masterData: {
      organizations: [{ id: 'org', name: 'Test' }],
      ownerCompanies: [
        {
          id: 'owner',
          organizationId: 'org',
          name: 'Test',
          additionalNameLines: [],
          address: { street: 'Test', postalCodeAndCity: '12345 Test' },
        },
      ],
      properties: [
        {
          id: 'property',
          ownerCompanyId: 'owner',
          address: { street: 'Test', postalCodeAndCity: '12345 Test' },
        },
      ],
      buildings: [
        {
          id: 'building',
          propertyId: 'property',
          name: 'Test',
          mandateRefPrefixes: [],
        },
      ],
      units: ['unit-a', 'unit-b'].map((id) => ({
        id,
        propertyId: 'property',
        buildingId: 'building',
        usableAreaSqm: area(100),
        heatedAreaSqm: area(100),
      })),
      persons: [],
      tenancies: ['a', 'b'].map((key) => ({
        id: `ten-${key}`,
        unitId: `unit-${key}`,
        personIds: [],
      })),
      allocationRules: [],
      heatingSystems: [{ id: 'system', propertyId: 'property' }],
      meters: [],
    },
    billingData: {
      billingPeriods: years.map(({ year, climateFactor }) => ({
        id: periodId(year),
        propertyId: 'property',
        year,
        periodStart: `${year}-01-01`,
        periodEnd: `${year}-12-31`,
        status: 'DRAFT',
        heatingDefaults: { consumptionSharePercent: 70, baseSharePercent: 30 },
        climateFactor: climateFactor ?? null,
      })),
      occupancyPeriods: years.flatMap(({ year, unitsA, unitsB }) =>
        (
          [
            ['a', unitsA],
            ['b', unitsB],
          ] as const
        ).map(([key, units]) => ({
          id: `occ-${key}-${year}`,
          billingPeriodId: periodId(year),
          unitId: `unit-${key}`,
          tenancyId: `ten-${key}`,
          kind: 'tenant',
          from: `${year}-01-01`,
          to: `${year}-12-31`,
          persons: { value: 2, unit: 'personen' },
          consumptionUnits: { value: units, unit: 'einheiten' },
        })),
      ),
      prepayments: [],
      costCategories: [],
      costEntries: [],
      bankBookings: [],
      heatingCircuits: years.map(({ year }) => ({
        id: `circuit-${year}`,
        billingPeriodId: periodId(year),
        heatingSystemId: 'system',
        buildingId: 'building',
        hasCentralHotWater: true,
        hotWaterSharePercent: 20,
      })),
      energySources: years.map(({ year }) => ({
        id: `oil-${year}`,
        heatingCircuitId: `circuit-${year}`,
        key: 'haupt',
        sourceType: 'Heizöl',
        calorificValueKwhPerUnit: 10,
      })),
      fuelStocks: years.map(({ year }) => ({
        id: `oil-stock-${year}`,
        energySourceId: `oil-${year}`,
        billingPeriodId: periodId(year),
        openingQuantity: { value: 0, unit: 'l' },
        openingValueCents: 0,
        remainingQuantity: { value: 0, unit: 'l' },
      })),
      fuelDeliveries: years.map(({ year, liters }) => ({
        id: `oil-${year}-1`,
        energySourceId: `oil-${year}`,
        billingPeriodId: periodId(year),
        date: `${year}-02-01`,
        quantity: { value: liters, unit: 'l' },
        amountCents: liters * 100,
      })),
      meterReadings: [],
      meterBillingStatuses: [],
      calculationRuns: [],
      calculationResults: [],
      documents: [],
      auditEvents: [],
    },
  } as unknown as AppDataFile
}

const BOTH_YEARS: YearSpec[] = [
  { year: 2024, liters: 9_000, unitsA: 270, unitsB: 90 },
  { year: 2025, liters: 10_000, unitsA: 300, unitsB: 100 },
]

function compare(file: AppDataFile) {
  const period = file.billingData.billingPeriods.find(
    ({ year }) => year === 2025,
  )!
  const occupancy = file.billingData.occupancyPeriods.find(
    ({ id }) => id === 'occ-a-2025',
  )!
  return compareTenantEnergyWithPreviousPeriod(file, period, occupancy)
}

describe('Energieanteil eines Nutzers (§ 6a Abs. 3 Satz 2 HeizKV)', () => {
  it('ermittelt Heizwärme und Warmwasser nach den Verteilschlüsseln', () => {
    const file = data(BOTH_YEARS)
    const output = calculateBilling(createCalculationInput(file, 'p-2025'))
    // 100.000 kWh × 80 % × 300/400 = 60.000; 20.000 kWh × 2/4 Personen.
    expect(tenantEnergyKwh(output, 'occ-a-2025')).toEqual({
      heatingKwh: 60_000,
      hotWaterKwh: 10_000,
      centralHotWater: true,
    })
    expect(tenantEnergyKwh(output, 'unknown')).toBeNull()
  })
})

describe('Energievergleich Vorjahr / Abrechnungsjahr', () => {
  it('bereinigt nur die Heizwärme und addiert das Warmwasser', () => {
    const file = data([
      { ...BOTH_YEARS[0]!, climateFactor: climate(2024, 0.9) },
      { ...BOTH_YEARS[1]!, climateFactor: climate(2025, 1.1) },
    ])
    // 2024: 90.000 kWh; Heizwärme 72.000 × 270/360 = 54.000 × 0,9 = 48.600,
    // Warmwasser 18.000 × 2/4 = 9.000 → 57.600 kWh.
    // 2025: 60.000 × 1,1 = 66.000 + 10.000 = 76.000 kWh → +31,9 %.
    expect(compare(file)).toEqual({
      status: 'energy',
      previous: {
        year: 2024,
        heatingKwh: 54_000,
        heatingAdjustedKwh: 48_600,
        hotWaterKwh: 9_000,
        totalKwh: 57_600,
        climateFactor: 0.9,
      },
      current: {
        year: 2025,
        heatingKwh: 60_000,
        heatingAdjustedKwh: 66_000,
        hotWaterKwh: 10_000,
        totalKwh: 76_000,
        climateFactor: 1.1,
      },
      weatherAdjusted: true,
      climate: { postalCode: '12345', current: 1.1, previous: 0.9 },
      centralHotWater: true,
      changePercent: 31.9,
      basis: {
        current: { from: '2025-01-01', to: '2025-12-31' },
        previous: { from: '2024-01-01', to: '2024-12-31' },
        fullYears: true,
        proRata: null,
      },
      previousBeforeProRata: null,
      climateNotAppliedPartialPeriod: false,
      currentEstimation: 'none',
      previousEstimated: false,
    })
  })

  it('vergleicht ohne Klimafaktor des Vorjahres unbereinigt', () => {
    const file = data([
      BOTH_YEARS[0]!,
      { ...BOTH_YEARS[1]!, climateFactor: climate(2025, 1.1) },
    ])
    const result = compare(file)
    expect(result).toMatchObject({
      status: 'energy',
      weatherAdjusted: false,
      climate: null,
      previous: { heatingAdjustedKwh: 54_000, totalKwh: 63_000 },
      current: { heatingAdjustedKwh: 60_000, totalKwh: 70_000 },
      // (70.000 − 63.000) ÷ 63.000 = 11,11 %
      changePercent: 11.1,
    })
  })

  it('nutzt eine übergebene Berechnung des Abrechnungsjahres', () => {
    const file = data(BOTH_YEARS)
    const currentOutput = calculateBilling(
      createCalculationInput(file, 'p-2025'),
    )
    const period = file.billingData.billingPeriods[1]!
    const occupancy = file.billingData.occupancyPeriods[2]!
    expect(
      compareTenantEnergyWithPreviousPeriod(file, period, occupancy, {
        currentOutput,
      }),
    ).toMatchObject({ status: 'energy', current: { totalKwh: 70_000 } })
  })

  it('bleibt bei übernommenem Vorjahresverbrauch bei Einheiten', () => {
    const file = data([BOTH_YEARS[1]!])
    file.billingData.occupancyPeriods[0]!.previousConsumption = {
      year: 2024,
      value: 280,
      source: 'Abrechnung des Voreigentümers',
    }
    expect(compare(file)).toEqual({
      status: 'units_only',
      reason: 'stored_previous_consumption',
    })
  })

  it('bleibt bei Einheiten, wenn der Energieeinsatz eines Jahres fehlt', () => {
    const file = data(BOTH_YEARS)
    file.billingData.energySources[0]!.calorificValueKwhPerUnit = null
    expect(compare(file)).toEqual({
      status: 'units_only',
      reason: 'energy_not_determinable',
    })
  })

  it('bleibt bei Einheiten, wenn das Vorjahr nicht berechnet werden kann', () => {
    const file = data(BOTH_YEARS)
    // Ungültiger Bestand: Schemaprüfung der Berechnung schlägt fehl.
    ;(file.billingData.fuelDeliveries[0] as { quantity: unknown }).quantity = {
      value: 'x',
      unit: 'l',
    }
    expect(compare(file)).toEqual({
      status: 'units_only',
      reason: 'previous_calculation_failed',
    })
  })

  it('nennt den Grund ohne Vorjahresverbrauch', () => {
    expect(compare(data([BOTH_YEARS[1]!]))).toEqual({
      status: 'unavailable',
      reason: 'no_period',
    })
    const otherTenancy = data(BOTH_YEARS)
    otherTenancy.billingData.occupancyPeriods[0]!.tenancyId = 'ten-other'
    expect(compare(otherTenancy)).toEqual({
      status: 'unavailable',
      reason: 'not_resident',
    })
    const noConsumption = data(BOTH_YEARS)
    noConsumption.billingData.occupancyPeriods[0]!.consumptionUnits = null
    expect(compare(noConsumption)).toEqual({
      status: 'unavailable',
      reason: 'no_consumption',
    })
  })
})

describe('Vorjahresverbrauch und Klimafaktoren', () => {
  it('liefert den Vorjahresverbrauch der Mietpartei', () => {
    const file = data(BOTH_YEARS)
    expect(
      previousPeriodConsumption(
        file,
        file.billingData.billingPeriods[1]!,
        file.billingData.occupancyPeriods[2]!,
      ),
    ).toEqual({
      kind: 'available',
      origin: 'system',
      year: 2024,
      value: 270,
      source: null,
      previousPeriodId: 'p-2024',
      previousOccupancyIds: ['occ-a-2024'],
      previousEstimated: false,
    })
  })

  it('nennt bei Einzug im Jahr ohne Vorjahr die fehlende Nutzung', () => {
    const file = data([BOTH_YEARS[1]!])
    const occupancy = file.billingData.occupancyPeriods[0]!
    occupancy.from = '2025-07-01'
    expect(
      previousPeriodConsumption(
        file,
        file.billingData.billingPeriods[0]!,
        occupancy,
      ),
    ).toEqual({ kind: 'not_resident' })
  })

  it('verlangt passende Faktoren beider Jahre', () => {
    const file = data([
      { ...BOTH_YEARS[0]!, climateFactor: climate(2024, 0.9) },
      { ...BOTH_YEARS[1]!, climateFactor: climate(2025, 1.1) },
    ])
    const period = file.billingData.billingPeriods[1]!
    const occupancy = file.billingData.occupancyPeriods[2]!
    expect(previousPeriodWeatherFactors(file, period, occupancy)).toEqual({
      postalCode: '12345',
      current: 1.1,
      previous: 0.9,
    })
    period.climateFactor = { ...climate(2025, 1.1), postalCode: '54321' }
    expect(previousPeriodWeatherFactors(file, period, occupancy)).toBeNull()
    period.climateFactor = climate(2025, 1.1)
    file.billingData.billingPeriods[0]!.climateFactor = null
    expect(previousPeriodWeatherFactors(file, period, occupancy)).toBeNull()
  })
})

describe('Vergleich auf gleicher Basis (§ 6a Abs. 3 Satz 1 Nr. 2 HeizKV)', () => {
  const withClimate = () =>
    data([
      { ...BOTH_YEARS[0]!, climateFactor: climate(2024, 0.9) },
      { ...BOTH_YEARS[1]!, climateFactor: climate(2025, 1.1) },
    ])
  const occupancy = (file: AppDataFile, id: string) =>
    file.billingData.occupancyPeriods.find((candidate) => candidate.id === id)!

  it('rechnet das Vorjahr bei Auszug auf den Nutzungszeitraum um und bereinigt nicht mit Jahresfaktoren', () => {
    const file = withClimate()
    occupancy(file, 'occ-a-2025').to = '2025-03-31'
    const result = compare(file)
    expect(result.status).toBe('energy')
    if (result.status !== 'energy') return
    // Januar–März: 170 + 150 + 130 = 450 ‰; 2024 ganzjährig 1.000 ‰.
    expect(result.basis).toEqual({
      current: { from: '2025-01-01', to: '2025-03-31' },
      previous: { from: '2024-01-01', to: '2024-12-31' },
      fullYears: false,
      proRata: {
        mapped: { from: '2024-01-01', to: '2024-03-31' },
        heatingFactor: expect.closeTo(0.45, 10) as number,
        hotWaterFactor: 91 / 366,
        mappedPermille: expect.closeTo(450, 8) as number,
        previousPermille: expect.closeTo(1000, 8) as number,
      },
    })
    // Heizwärme 54.000 × 0,45 = 24.300; Warmwasser 9.000 × 91/366 = 2.238.
    expect(result.previous).toEqual({
      year: 2024,
      heatingKwh: 24_300,
      heatingAdjustedKwh: 24_300,
      hotWaterKwh: 2_238,
      totalKwh: 26_538,
      climateFactor: null,
    })
    expect(result.previousBeforeProRata).toEqual({
      heatingKwh: 54_000,
      hotWaterKwh: 9_000,
    })
    expect(result.weatherAdjusted).toBe(false)
    expect(result.climate).toBeNull()
    expect(result.climateNotAppliedPartialPeriod).toBe(true)
    expect(result.current.climateFactor).toBeNull()
    expect(result.changePercent).toBe(
      Math.round(((result.current.totalKwh - 26_538) / 26_538) * 1000) / 10,
    )
    // Ohne Umrechnung wäre der Vergleich (Teilzeitraum gegen Gesamtjahr) stark negativ.
    expect(result.changePercent!).toBeGreaterThan(0)
  })

  it('rechnet eine kürzere Vorjahresnutzung auf den Nutzungszeitraum hoch', () => {
    const file = data(BOTH_YEARS)
    occupancy(file, 'occ-a-2024').from = '2024-07-01'
    const period = file.billingData.billingPeriods[1]!
    const current = occupancy(file, 'occ-a-2025')
    const consumption = previousPeriodConsumption(file, period, current)
    if (consumption.kind !== 'available') throw new Error('erwartet')
    const basis = previousPeriodComparisonBasis(
      file,
      period,
      current,
      consumption,
    )
    expect(basis.fullYears).toBe(false)
    expect(basis.previous).toEqual({ from: '2024-07-01', to: '2024-12-31' })
    expect(basis.proRata?.mapped).toEqual({
      from: '2024-01-01',
      to: '2024-12-31',
    })
    // Juli–Dezember: 40 × 62/92 + 390 ‰
    expect(basis.proRata?.heatingFactor).toBeCloseTo(
      1000 / ((40 * 62) / 92 + 390),
      8,
    )
    expect(basis.proRata?.hotWaterFactor).toBe(366 / 184)
  })

  it('nimmt einen übernommenen Vorjahreswert als ganzes Vorjahr', () => {
    const file = data([BOTH_YEARS[1]!])
    const current = file.billingData.occupancyPeriods[0]!
    current.from = '2025-10-01'
    current.previousConsumption = { year: 2024, value: 280 }
    const period = file.billingData.billingPeriods[0]!
    const consumption = previousPeriodConsumption(file, period, current)
    if (consumption.kind !== 'available') throw new Error('erwartet')
    const basis = previousPeriodComparisonBasis(
      file,
      period,
      current,
      consumption,
    )
    expect(basis.previous).toEqual({ from: '2024-01-01', to: '2024-12-31' })
    expect(basis.proRata?.mapped).toEqual({
      from: '2024-10-01',
      to: '2024-12-31',
    })
    expect(basis.proRata?.heatingFactor).toBeCloseTo(0.36, 8)
  })

  it('weist bei Schätzung aus dem Vorjahr keine Veränderung aus', () => {
    const file = data(BOTH_YEARS)
    const current = occupancy(file, 'occ-a-2025')
    current.consumptionUnitsEstimated = true
    current.consumptionUnitsEstimateReason =
      'Gerät defekt; Schätzung nach dem Vorjahresverbrauch.'
    expect(compare(file)).toMatchObject({
      status: 'energy',
      changePercent: null,
      currentEstimation: 'estimated_from_previous_period',
      previousEstimated: false,
    })
    current.consumptionUnitsEstimateReason =
      'Schätzung nach vergleichbaren Räumen.'
    expect(compare(file)).toMatchObject({
      currentEstimation: 'estimated',
      changePercent: 11.1,
    })
    occupancy(file, 'occ-a-2024').consumptionUnitsEstimated = true
    expect(compare(file)).toMatchObject({ previousEstimated: true })
  })

  it('erkennt die Art der Verbrauchsermittlung', () => {
    expect(consumptionEstimation({})).toBe('none')
    expect(
      consumptionEstimation({
        consumptionUnitsEstimated: false,
        consumptionUnitsEstimateReason: 'Vorjahr',
      }),
    ).toBe('none')
    expect(consumptionEstimation({ consumptionUnitsEstimated: true })).toBe(
      'estimated',
    )
    expect(
      consumptionEstimation({
        consumptionUnitsEstimated: true,
        consumptionUnitsEstimateReason: 'wie im Vergleichszeitraum',
      }),
    ).toBe('estimated_from_previous_period')
  })

  it('verschiebt Daten um Jahre und berücksichtigt den 29. Februar', () => {
    expect(shiftIsoDateByYears('2024-02-29', -1)).toBe('2023-02-28')
    expect(shiftIsoDateByYears('2025-03-31', -1)).toBe('2024-03-31')
    expect(shiftIsoDateByYears('2023-02-28', 1)).toBe('2024-02-28')
  })

  it('vergleicht nie mit dem Verbrauch eines anderen Nutzers', () => {
    const file = data(BOTH_YEARS)
    // Nutzerwechsel: 2024 wohnte ein anderes Mietverhältnis in der Wohnung.
    occupancy(file, 'occ-a-2024').tenancyId = 'ten-previous'
    expect(compare(file)).toEqual({
      status: 'unavailable',
      reason: 'not_resident',
    })
  })
})
