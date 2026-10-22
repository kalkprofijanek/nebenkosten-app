/**
 * Monatliche Verbrauchsinformation (§ 6a Abs. 2 HeizKV, ADR-0014 Schritt 2).
 * Alle Daten sind frei erfunden.
 */
import { describe, expect, it } from 'vitest'
import type {
  AppDataFile,
  BillingPeriod,
  HeatingCircuit,
  MeterReading,
  OccupancyPeriod,
} from '@nebenkosten/schema'
import { createEmptyAppDataFile } from '@nebenkosten/schema'
import {
  DEFAULT_HOT_WATER_TEMPERATURE_C,
  MONTH_END_READING_TOLERANCE_DAYS,
  calculateMonthlyConsumptionInformation,
  hotWaterKwhFromVolume,
  selectMonthEndReading,
} from '../src'

const period = (year: number): BillingPeriod => ({
  id: `p-${year}`,
  propertyId: 'property',
  year,
  periodStart: `${year}-01-01`,
  periodEnd: `${year}-12-31`,
  status: 'DRAFT',
})

const circuit = (
  year: number,
  patch: Partial<HeatingCircuit> = {},
): HeatingCircuit => ({
  id: `c-${year}`,
  billingPeriodId: `p-${year}`,
  heatingSystemId: 'system',
  buildingId: 'b1',
  hasCentralHotWater: true,
  meterAssignments: [
    { meterId: 'hm1', unitId: 'u1' },
    { meterId: 'hm2', unitId: 'u2' },
  ],
  hotWaterMeterAssignments: [{ meterId: 'ww1', unitId: 'u1' }],
  hotWaterEnergy: {
    method: 'volume_formula',
    volumeM3: 100,
    temperatureC: 55,
  },
  consumptionBenchmark: {
    source: 'Fiktive Vergleichsquelle',
    referenceYear: 2025,
    category: 'Erdgas, fiktiv',
    includesHotWater: false,
    lowMaxKwhPerSqmYear: 70,
    mediumMaxKwhPerSqmYear: 130,
    elevatedMaxKwhPerSqmYear: 200,
  },
  ...patch,
})

const occupancy = (
  id: string,
  patch: Partial<OccupancyPeriod>,
): OccupancyPeriod => ({
  id,
  billingPeriodId: 'p-2026',
  unitId: 'u1',
  kind: 'tenant',
  ...patch,
})

let readingCounter = 0
const reading = (
  meterId: string,
  date: string,
  value: number,
  patch: Partial<MeterReading> = {},
): MeterReading => ({
  id: `r-${(readingCounter += 1)}`,
  meterId,
  date,
  value: { value, unit: meterId.startsWith('ww') ? 'm3' : 'kWh' },
  source: 'imported',
  ...patch,
})

function fixture(): AppDataFile {
  const file = createEmptyAppDataFile()
  const master = file.masterData
  master.properties.push({ id: 'property', ownerCompanyId: 'owner' })
  master.buildings.push({
    id: 'b1',
    propertyId: 'property',
    name: 'Haus A',
    mandateRefPrefixes: [],
  })
  master.units.push(
    {
      id: 'u1',
      propertyId: 'property',
      buildingId: 'b1',
      heatedAreaSqm: { value: 80, unit: 'm2' },
      usableAreaSqm: { value: 90, unit: 'm2' },
    },
    {
      id: 'u2',
      propertyId: 'property',
      buildingId: 'b1',
      usableAreaSqm: { value: 60, unit: 'm2' },
    },
    { id: 'u3', propertyId: 'property', buildingId: 'b1' },
  )
  master.tenancies.push(
    { id: 't1', unitId: 'u1', personIds: [], movedIn: '2020-01-01' },
    { id: 't2', unitId: 'u2', personIds: [], movedOut: '2026-03-15' },
    { id: 't3', unitId: 'u2', personIds: [], movedIn: '2026-03-16' },
  )
  master.meters.push(
    { id: 'hm1', propertyId: 'property', kind: 'unit_heat' },
    { id: 'hm2', propertyId: 'property', kind: 'unit_heat' },
    { id: 'ww1', propertyId: 'property', kind: 'unit_hot_water' },
  )
  const billing = file.billingData
  billing.billingPeriods.push(period(2025), period(2026))
  billing.heatingCircuits.push(circuit(2025), circuit(2026))
  billing.occupancyPeriods.push(
    occupancy('o-u1-2025', { billingPeriodId: 'p-2025', tenancyId: 't1' }),
    occupancy('o-u1', { tenancyId: 't1' }),
    occupancy('o-u2-a', {
      unitId: 'u2',
      tenancyId: 't2',
      to: '2026-03-15',
    }),
    occupancy('o-u2-b', {
      unitId: 'u2',
      tenancyId: 't3',
      from: '2026-03-16',
    }),
    occupancy('o-u3', { unitId: 'u3', kind: 'vacancy', tenancyId: null }),
  )
  billing.meterReadings.push(
    reading('hm1', '2025-02-28', 5000),
    reading('hm1', '2025-03-31', 5900),
    reading('hm1', '2026-01-31', 9000),
    reading('hm1', '2026-02-28', 10100),
    reading('hm1', '2026-03-31', 10900.4),
    reading('ww1', '2026-02-28', 100.123),
    reading('ww1', '2026-03-31', 103.456),
    reading('hm2', '2026-02-28', 2000),
    reading('hm2', '2026-03-31', 2620),
  )
  return file
}

const march = { propertyId: 'property', month: '2026-03' }

function tenant(
  result: ReturnType<typeof calculateMonthlyConsumptionInformation>,
  id: string,
) {
  const found = result.tenants.find(
    ({ occupancyPeriodId }) => occupancyPeriodId === id,
  )
  if (!found) throw new Error(`Nutzung ${id} fehlt`)
  return found
}

describe('Monatsendstand', () => {
  it('wählt die Ablesung am nächsten zum Monatsletzten innerhalb der Toleranz', () => {
    expect(MONTH_END_READING_TOLERANCE_DAYS).toBe(3)
    const readings = [
      reading('hm1', '2026-03-29', 1, { id: 'a' }),
      reading('hm1', '2026-04-01', 2, { id: 'b' }),
      reading('hm1', '2026-04-04', 3, { id: 'c' }),
    ]
    expect(selectMonthEndReading(readings, '2026-03-31')).toMatchObject({
      status: 'found',
      reading: { id: 'b' },
    })
    expect(selectMonthEndReading([readings[2]!], '2026-03-31')).toMatchObject({
      status: 'missing',
    })
  })

  it('bevorzugt bei gleichem Abstand die Ablesung vor dem Monatsende', () => {
    const result = selectMonthEndReading(
      [
        reading('hm1', '2026-04-01', 2, { id: 'after' }),
        reading('hm1', '2026-03-30', 1, { id: 'before' }),
      ],
      '2026-03-31',
    )
    expect(result).toMatchObject({ status: 'found', reading: { id: 'before' } })
  })

  it('berücksichtigt die Tagesgrenze start_of_day als Stand des Vortags', () => {
    const result = selectMonthEndReading(
      [
        reading('hm1', '2026-03-30', 1, { id: 'early' }),
        reading('hm1', '2026-04-01', 2, {
          id: 'start',
          boundary: 'start_of_day',
        }),
      ],
      '2026-03-31',
    )
    expect(result).toMatchObject({ status: 'found', reading: { id: 'start' } })
  })

  it('meldet widersprüchliche Stände am selben Tag und ignoriert Duplikate', () => {
    expect(
      selectMonthEndReading(
        [
          reading('hm1', '2026-03-31', 1, { id: 'x' }),
          reading('hm1', '2026-03-31', 2, { id: 'y' }),
        ],
        '2026-03-31',
      ),
    ).toMatchObject({ status: 'conflict' })
    expect(
      selectMonthEndReading(
        [
          reading('hm1', '2026-03-31', 1, { id: 'x' }),
          reading('hm1', '2026-03-31', 1, { id: 'y' }),
          reading('hm1', '2026-03-31', 9, { id: 'z', date: null }),
        ],
        '2026-03-31',
      ),
    ).toMatchObject({ status: 'found', reading: { id: 'x' } })
  })
})

describe('Warmwasser nach § 9 Abs. 2 HeizKV', () => {
  it('rechnet m³ mit 2,5 × V × (tw − 10) in kWh um', () => {
    expect(hotWaterKwhFromVolume(2, 60)).toBe(250)
    expect(DEFAULT_HOT_WATER_TEMPERATURE_C).toBe(60)
  })
})

describe('calculateMonthlyConsumptionInformation', () => {
  it('lehnt ein ungültiges Monatsformat ab', () => {
    for (const month of ['2026-13', '2026-3', '03/2026', ''])
      expect(() =>
        calculateMonthlyConsumptionInformation(fixture(), {
          propertyId: 'property',
          month,
        }),
      ).toThrow(RangeError)
  })

  it('ermittelt Monatsverbrauch, Vormonat und Vorjahresmonat (normaler Monat)', () => {
    const result = calculateMonthlyConsumptionInformation(fixture(), march)
    expect(result).toMatchObject({
      propertyId: 'property',
      month: '2026-03',
      from: '2026-03-01',
      to: '2026-03-31',
      billingPeriodId: 'p-2026',
    })
    const u1 = tenant(result, 'o-u1')
    expect(u1).toMatchObject({
      unitId: 'u1',
      tenancyId: 't1',
      heatingCircuitId: 'c-2026',
      from: '2026-03-01',
      to: '2026-03-31',
      days: 31,
      heatingShare: 1,
      hotWaterShare: 1,
    })
    expect(u1.heating.current).toEqual({
      status: 'collected',
      value: 800,
      from: '2026-03-01',
      to: '2026-03-31',
    })
    expect(u1.heating.previousMonth).toMatchObject({
      status: 'collected',
      value: 1100,
    })
    expect(u1.heating.previousYearMonth).toMatchObject({
      status: 'collected',
      value: 900,
      from: '2025-03-01',
      to: '2025-03-31',
    })
    expect(u1.heating.meters).toEqual([
      expect.objectContaining({
        meterId: 'hm1',
        startReading: expect.objectContaining({ date: '2026-02-28' }),
        endReading: expect.objectContaining({
          date: '2026-03-31',
          value: 10900.4,
        }),
      }),
    ])
    // Leerstand wird nicht ausgegeben.
    expect(
      result.tenants.map(({ occupancyPeriodId }) => occupancyPeriodId),
    ).toEqual(['o-u1', 'o-u2-a', 'o-u2-b'])
  })

  it('meldet fehlende Stände als reading_missing und Vergleiche als nicht erhoben', () => {
    const result = calculateMonthlyConsumptionInformation(fixture(), {
      propertyId: 'property',
      month: '2026-04',
    })
    const u1 = tenant(result, 'o-u1')
    expect(u1.heating.current).toEqual({
      status: 'not_collected',
      value: null,
      reason: 'reading_missing',
    })
    expect(u1.heating.previousMonth).toMatchObject({
      status: 'collected',
      value: 800,
    })
    // April 2025: Stände fehlen ⇒ „soweit erhoben“.
    expect(u1.heating.previousYearMonth).toEqual({
      status: 'not_collected',
      value: null,
      reason: 'reading_missing',
    })
  })

  it('rechnet negativen Verbrauch nicht glatt', () => {
    const data = fixture()
    data.billingData.meterReadings.push(reading('hm1', '2026-04-30', 10000))
    const u1 = tenant(
      calculateMonthlyConsumptionInformation(data, {
        propertyId: 'property',
        month: '2026-04',
      }),
      'o-u1',
    )
    expect(u1.heating.current).toEqual({
      status: 'not_collected',
      value: null,
      reason: 'negative_consumption',
    })
  })

  it('verwendet eine Ablesung am 1. des Folgemonats (Toleranzfenster)', () => {
    const data = fixture()
    data.billingData.meterReadings = data.billingData.meterReadings.filter(
      ({ date }) => date !== '2026-03-31',
    )
    data.billingData.meterReadings.push(
      reading('hm1', '2026-04-01', 10900),
      reading('ww1', '2026-04-05', 104),
    )
    const u1 = tenant(
      calculateMonthlyConsumptionInformation(data, march),
      'o-u1',
    )
    expect(u1.heating.current).toMatchObject({
      status: 'collected',
      value: 800,
    })
    // Warmwasser 5 Tage nach Monatsende: außerhalb der Toleranz.
    expect(u1.hotWater?.current.m3).toMatchObject({
      status: 'not_collected',
      reason: 'reading_missing',
    })
    expect(u1.hotWater?.current.kwh).toMatchObject({ status: 'not_collected' })
  })

  it('meldet widersprüchliche Stände', () => {
    const data = fixture()
    data.billingData.meterReadings.push(reading('hm1', '2026-03-31', 10950))
    const u1 = tenant(
      calculateMonthlyConsumptionInformation(data, march),
      'o-u1',
    )
    expect(u1.heating.current).toMatchObject({ reason: 'reading_conflict' })
  })

  it('rechnet zentrales Warmwasser mit erfasster Temperatur um', () => {
    const result = calculateMonthlyConsumptionInformation(fixture(), march)
    const u1 = tenant(result, 'o-u1')
    expect(u1.hotWater).toMatchObject({
      heatingCircuitId: 'c-2026',
      temperatureC: 55,
      temperatureEstimated: false,
      current: {
        m3: { status: 'collected', value: 3.33 },
        // 2,5 × 3,333 × 45 = 374,96 (aus dem ungerundeten Volumen)
        kwh: { status: 'collected', value: 375 },
      },
      previousMonth: { m3: { status: 'not_collected' } },
    })
    expect(
      result.assumptions.some(({ code }) => code === 'hot_water_temperature'),
    ).toBe(false)
  })

  it('nimmt ohne Temperaturangabe 60 °C an und kennzeichnet dies', () => {
    const data = fixture()
    data.billingData.heatingCircuits[1] = circuit(2026, {
      hotWaterEnergy: { method: 'heat_meter', heatKwh: 5000 },
    })
    const result = calculateMonthlyConsumptionInformation(data, march)
    const u1 = tenant(result, 'o-u1')
    expect(u1.hotWater).toMatchObject({
      temperatureC: 60,
      temperatureEstimated: true,
      current: { kwh: { value: 417 } }, // 2,5 × 3,333 × 50 = 416,6
    })
    expect(result.assumptions).toContainEqual(
      expect.objectContaining({ code: 'hot_water_temperature' }),
    )
  })

  it('übernimmt die Kennzeichnung einer geschätzten Temperatur', () => {
    const data = fixture()
    data.billingData.heatingCircuits[1] = circuit(2026, {
      hotWaterEnergy: {
        method: 'volume_formula',
        volumeM3: 1,
        temperatureC: 50,
        temperatureEstimated: true,
      },
    })
    const u1 = tenant(
      calculateMonthlyConsumptionInformation(data, march),
      'o-u1',
    )
    expect(u1.hotWater).toMatchObject({
      temperatureC: 50,
      temperatureEstimated: true,
    })
  })

  it('gibt bei dezentralem Warmwasser keine Warmwasserwerte aus', () => {
    const data = fixture()
    data.billingData.heatingCircuits[1] = circuit(2026, {
      hasCentralHotWater: false,
    })
    const result = calculateMonthlyConsumptionInformation(data, march)
    expect(tenant(result, 'o-u1').hotWater).toBeNull()
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'monthly.hot_water_not_central',
        meterId: 'ww1',
      }),
    )
    expect(
      result.issues.some(
        ({ code }) => code === 'monthly.hot_water_meter_assignment_missing',
      ),
    ).toBe(false)
  })

  it('meldet fehlenden Warmwasserzähler bei zentralem Warmwasser', () => {
    const result = calculateMonthlyConsumptionInformation(fixture(), march)
    expect(tenant(result, 'o-u2-a').hotWater).toBeNull()
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'monthly.hot_water_meter_assignment_missing',
        unitId: 'u2',
      }),
    )
  })

  it('teilt bei Mieterwechsel Heizung nach Gradtagen und Warmwasser nach Tagen', () => {
    const data = fixture()
    data.billingData.heatingCircuits[1] = circuit(2026, {
      hotWaterMeterAssignments: [
        { meterId: 'ww1', unitId: 'u1' },
        { meterId: 'ww2', unitId: 'u2' },
      ],
    })
    data.masterData.meters.push({
      id: 'ww2',
      propertyId: 'property',
      kind: 'unit_hot_water',
    })
    data.billingData.meterReadings.push(
      reading('ww2', '2026-02-28', 10),
      reading('ww2', '2026-03-31', 13.1),
    )
    const result = calculateMonthlyConsumptionInformation(data, march)
    const before = tenant(result, 'o-u2-a')
    const after = tenant(result, 'o-u2-b')
    expect(before).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-15',
      days: 15,
      heatingAllocation: 'degree_days',
      hotWaterAllocation: 'days',
    })
    expect(after).toMatchObject({ from: '2026-03-16', to: '2026-03-31' })
    // Innerhalb eines Monats verteilt VDI 2067 gleichmäßig je Tag.
    expect(before.heatingShare).toBeCloseTo(15 / 31, 4)
    expect(before.hotWaterShare).toBeCloseTo(15 / 31, 4)
    expect(before.heating.current).toMatchObject({ value: 300 })
    expect(after.heating.current).toMatchObject({ value: 320 })
    expect(before.hotWater?.current.m3).toMatchObject({ value: 1.5 })
    expect(after.hotWater?.current.m3).toMatchObject({ value: 1.6 })
    // Vormonat des Vormieters ganz, des Nachmieters nicht erhoben.
    expect(before.heating.previousMonth).toMatchObject({
      status: 'not_collected',
      reason: 'reading_missing',
    })
    expect(after.heating.previousMonth).toMatchObject({
      status: 'not_collected',
      reason: 'no_usage',
    })
  })

  it('ermittelt den Vormonat aus der eigenen Nutzung des Mieters', () => {
    const data = fixture()
    data.billingData.meterReadings.push(reading('hm2', '2026-01-31', 1720))
    const result = calculateMonthlyConsumptionInformation(data, march)
    // Vormieter t2 nutzte den ganzen Februar.
    expect(tenant(result, 'o-u2-a').heating.previousMonth).toEqual({
      status: 'collected',
      value: 280,
      from: '2026-02-01',
      to: '2026-02-28',
    })
  })

  it('übergeht Leerstand ohne Zähler ohne Hinweis', () => {
    const result = calculateMonthlyConsumptionInformation(fixture(), march)
    expect(result.issues.filter(({ unitId }) => unitId === 'u3')).toEqual([])
  })

  it('vergleicht mit dem Durchschnittsnutzer (Mitte der Klasse „mittel“)', () => {
    const result = calculateMonthlyConsumptionInformation(fixture(), march)
    const u1 = tenant(result, 'o-u1')
    // (70 + 130) ÷ 2 = 100 kWh/m²·a × 80 m² × 130 ‰
    expect(u1.averageUser).toMatchObject({
      status: 'compared',
      method: 'heizspiegel_medium_midpoint',
      approximation: false,
      includesHotWater: false,
      benchmarkKwhPerSqmYear: 100,
      areaSqm: 80,
      areaBasis: 'heated_area',
      value: 1040,
      ownKwh: 800,
      source: 'Fiktive Vergleichsquelle',
      referenceYear: 2025,
    })
    expect(result.assumptions).toContainEqual(
      expect.objectContaining({ code: 'E-46-3' }),
    )
    // Nutzfläche als Ersatz und anteilig für den Teilzeitraum.
    const u2 = tenant(result, 'o-u2-a')
    expect(u2.averageUser).toMatchObject({
      status: 'compared',
      areaBasis: 'usable_area',
      areaSqm: 60,
      value: 377, // 100 × 60 × 130 × 15/31 ÷ 1000 = 377,4
    })
  })

  it('vergleicht Heizung und Warmwasser näherungsweise, wenn die Werte Warmwasser enthalten', () => {
    const data = fixture()
    const base = circuit(2026)
    data.billingData.heatingCircuits[1] = circuit(2026, {
      consumptionBenchmark: {
        ...base.consumptionBenchmark!,
        includesHotWater: true,
      },
    })
    const result = calculateMonthlyConsumptionInformation(data, march)
    expect(tenant(result, 'o-u1').averageUser).toMatchObject({
      status: 'compared',
      approximation: true,
      includesHotWater: true,
      ownKwh: 1175, // 800,4 + 374,96
    })
    // Ohne Warmwasserzähler fehlt die Warmwasserenergie.
    expect(tenant(result, 'o-u2-a').averageUser).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'hot_water_energy_unknown',
    })
  })

  it('meldet fehlende Vergleichswerte und fehlende Fläche', () => {
    const data = fixture()
    data.billingData.heatingCircuits[1] = circuit(2026, {
      consumptionBenchmark: null,
    })
    const result = calculateMonthlyConsumptionInformation(data, march)
    expect(tenant(result, 'o-u1').averageUser).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'no_benchmark',
    })
    const withoutArea = fixture()
    withoutArea.masterData.units[1] = {
      id: 'u2',
      propertyId: 'property',
      buildingId: 'b1',
    }
    expect(
      tenant(
        calculateMonthlyConsumptionInformation(withoutArea, march),
        'o-u2-a',
      ).averageUser,
    ).toMatchObject({ status: 'unavailable', reason: 'area_unknown' })
  })

  it('liest beim Jahreswechsel Stände zeitraumunabhängig und Zuordnungen aus dem Monat', () => {
    const data = fixture()
    // Im Vorjahr war ein anderer Zähler zugeordnet; maßgeblich ist 2026.
    data.billingData.heatingCircuits[0] = circuit(2025, {
      meterAssignments: [{ meterId: 'hm-alt', unitId: 'u1' }],
    })
    data.masterData.meters.push({
      id: 'hm-alt',
      propertyId: 'property',
      kind: 'unit_heat',
    })
    data.billingData.meterReadings.push(
      reading('hm1', '2024-12-31', 3000),
      reading('hm1', '2025-01-31', 3700),
      reading('hm1', '2025-11-30', 7500),
      reading('hm1', '2025-12-31', 8200, { billingPeriodId: 'p-2025' }),
      reading('hm-alt', '2025-11-30', 1),
      reading('hm-alt', '2025-12-31', 2),
    )
    const result = calculateMonthlyConsumptionInformation(data, {
      propertyId: 'property',
      month: '2026-01',
    })
    expect(result.billingPeriodId).toBe('p-2026')
    const u1 = tenant(result, 'o-u1')
    expect(u1.heating.current).toMatchObject({ value: 800 })
    expect(u1.heating.previousMonth).toMatchObject({
      status: 'collected',
      value: 700,
      from: '2025-12-01',
      to: '2025-12-31',
    })
    expect(u1.heating.previousYearMonth).toMatchObject({
      status: 'collected',
      value: 700,
      from: '2025-01-01',
    })
  })

  it('nutzt das Mietverhältnis, wenn für den Vergleichsmonat kein Abrechnungszeitraum besteht', () => {
    const data = fixture()
    data.billingData.meterReadings.push(
      reading('hm1', '2024-12-31', 3000),
      reading('hm1', '2025-01-31', 3700),
      reading('hm2', '2024-12-31', 0),
      reading('hm2', '2025-01-31', 310),
      reading('hm2', '2025-12-31', 1500),
      reading('hm2', '2026-01-31', 1810),
    )
    data.billingData.billingPeriods = data.billingData.billingPeriods.filter(
      ({ id }) => id !== 'p-2025',
    )
    const result = calculateMonthlyConsumptionInformation(data, {
      propertyId: 'property',
      month: '2026-01',
    })
    expect(tenant(result, 'o-u1').heating.previousYearMonth).toMatchObject({
      status: 'collected',
      value: 700,
    })
    // t2 ohne Einzugsdatum: Nutzung im Vorjahr unbekannt.
    expect(tenant(result, 'o-u2-a').heating.previousYearMonth).toEqual({
      status: 'not_collected',
      value: null,
      reason: 'usage_unknown',
    })
  })

  it('liefert ohne Abrechnungszeitraum eine leere Liste mit Hinweis', () => {
    const result = calculateMonthlyConsumptionInformation(fixture(), {
      propertyId: 'property',
      month: '2027-01',
    })
    expect(result.tenants).toEqual([])
    expect(result.billingPeriodId).toBeNull()
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'monthly.billing_period_missing' }),
    ])
  })

  it('meldet ein unbekanntes Objekt', () => {
    const result = calculateMonthlyConsumptionInformation(fixture(), {
      propertyId: 'fremd',
      month: '2026-03',
    })
    expect(result.tenants).toEqual([])
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'monthly.property_missing' }),
    ])
  })

  it('meldet Zuordnungs- und Zählerfehler', () => {
    const data = fixture()
    data.masterData.meters.push(
      { id: 'hm-frei', propertyId: 'property', kind: 'unit_heat' },
      { id: 'allg', propertyId: 'property', kind: 'general' },
      { id: 'hm-fremd', propertyId: 'anderes', kind: 'unit_heat' },
    )
    data.billingData.heatingCircuits[1] = circuit(2026, {
      meterAssignments: [
        { meterId: 'hm1', unitId: 'u1' },
        { meterId: 'allg', unitId: 'u1' },
        { meterId: 'unbekannt', unitId: 'u1' },
      ],
    })
    data.billingData.meterReadings.push(
      reading('hm1', '2026-03-31', 5, { value: { value: 5, unit: 'm3' } }),
    )
    const result = calculateMonthlyConsumptionInformation(data, march)
    const codes = result.issues.map(({ code, meterId, unitId }) =>
      [code, meterId ?? unitId].join(':'),
    )
    expect(codes).toEqual(
      expect.arrayContaining([
        'monthly.meter_unassigned:hm-frei',
        'monthly.meter_unassigned:hm2',
        'monthly.meter_kind_invalid:allg',
        'monthly.meter_missing:unbekannt',
        'monthly.heat_meter_assignment_missing:u2',
        'monthly.reading_unit_invalid:hm1',
      ]),
    )
    expect(codes).not.toContain('monthly.meter_unassigned:hm-fremd')
    // Falsche Einheit wird ignoriert; der kWh-Stand bleibt maßgeblich.
    expect(tenant(result, 'o-u1').heating.current).toMatchObject({
      value: 800,
    })
    expect(tenant(result, 'o-u2-a').heating.current).toEqual({
      status: 'not_collected',
      value: null,
      reason: 'meter_not_assigned',
    })
  })

  it('meldet überlappende Nutzungen und mehrdeutige Abrechnungszeiträume', () => {
    const data = fixture()
    data.billingData.occupancyPeriods.push(
      occupancy('o-u1-doppelt', { tenancyId: 't8', from: '2026-03-20' }),
    )
    data.billingData.billingPeriods.push({
      ...period(2026),
      id: 'p-2026-b',
      periodStart: '2026-03-01',
    })
    const result = calculateMonthlyConsumptionInformation(data, march)
    expect(result.billingPeriodId).toBe('p-2026')
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'monthly.occupancy_overlap' }),
        expect.objectContaining({ code: 'monthly.billing_period_ambiguous' }),
      ]),
    )
  })

  it('summiert mehrere Zähler einer Einheit und ordnet Heizkreise über das Gebäude zu', () => {
    const data = fixture()
    data.masterData.meters.push({
      id: 'hm1b',
      propertyId: 'property',
      kind: 'unit_heat',
    })
    data.billingData.heatingCircuits[1] = circuit(2026, {
      meterAssignments: [
        { meterId: 'hm1', unitId: 'u1' },
        { meterId: 'hm1b', unitId: 'u1' },
      ],
    })
    data.billingData.meterReadings.push(
      reading('hm1b', '2026-02-28', 100),
      reading('hm1b', '2026-03-31', 150),
    )
    const result = calculateMonthlyConsumptionInformation(data, march)
    expect(tenant(result, 'o-u1').heating.current).toMatchObject({
      value: 850,
    })
    // u2 hat keinen Zähler, der Heizkreis folgt dem Gebäude.
    expect(tenant(result, 'o-u2-a').heatingCircuitId).toBe('c-2026')
  })
})
