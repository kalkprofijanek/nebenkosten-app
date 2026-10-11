import type { AppDataFile, OccupancyPeriod } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import {
  calculateBilling,
  createCalculationInput,
  degreeDayPermille,
  heatingBaseTimeFactor,
  section9bShares,
} from '../src'

const period = { periodStart: '2025-01-01', periodEnd: '2025-12-31' }

const occupancy = (patch: Partial<OccupancyPeriod>): OccupancyPeriod => ({
  id: 'o',
  billingPeriodId: 'p',
  unitId: 'u1',
  kind: 'tenant',
  ...patch,
})

// Fiktives Szenario mit zentralem Warmwasser; die Nutzung von u1 wird zum
// 01.07.2024 in Vor- und Nachmieter geteilt.
function appData(): AppDataFile {
  const scenario = scenarios.find(
    ({ id }) => id === 'case-10-central-hot-water',
  )
  if (!scenario) throw new Error('Testszenario fehlt')
  const data = structuredClone(buildAppDataFile(scenario))
  const original = data.billingData.occupancyPeriods.find(
    ({ unitId }) => unitId === 'u1',
  )!
  const units = original.consumptionUnits?.value ?? 0
  data.billingData.occupancyPeriods = [
    ...data.billingData.occupancyPeriods.filter(({ id }) => id !== original.id),
    {
      ...original,
      to: '2024-06-30',
      consumptionUnits: { value: units * 0.7, unit: 'einheiten' },
    },
    {
      ...original,
      id: `${original.id}-neu`,
      from: '2024-07-01',
      consumptionUnits: { value: units * 0.3, unit: 'einheiten' },
    },
  ]
  return data
}

const u1Ids = () =>
  appData()
    .billingData.occupancyPeriods.filter(({ unitId }) => unitId === 'u1')
    .map(({ id }) => id)

function withAllocation(
  data: AppDataFile,
  allocation: OccupancyPeriod['section9bAllocation'],
) {
  data.billingData.occupancyPeriods = data.billingData.occupancyPeriods.map(
    (item) =>
      item.unitId === 'u1'
        ? { ...item, section9bAllocation: allocation }
        : item,
  )
  return data
}

const calculate = (data: AppDataFile) =>
  calculateBilling(createCalculationInput(data, 'bp-1'))

describe('§ 9b Abs. 3 HeizKV: Anteile ohne Zwischenablesung', () => {
  it('ersetzt bei Gradtagszahlen den Zeitanteil und erhält die Summe', () => {
    const shares = section9bShares(
      [
        occupancy({
          id: 'alt',
          to: '2025-03-31',
          section9bAllocation: 'degree_days',
        }),
        occupancy({
          id: 'neu',
          from: '2025-04-01',
          section9bAllocation: 'degree_days',
        }),
        occupancy({ id: 'andere', unitId: 'u2' }),
      ],
      period,
    )
    expect(shares.has('andere')).toBe(false)
    const old = shares.get('alt')!
    const next = shares.get('neu')!
    expect(old.permille).toBeCloseTo(450, 9)
    expect(next.permille).toBeCloseTo(550, 9)
    expect(old.groupPermille).toBeCloseTo(1000, 9)
    expect(old.baseTimeFactor).toBeCloseTo(0.45, 9)
    expect(next.baseTimeFactor).toBeCloseTo(0.55, 9)
    expect(old.timeFactor).toBeCloseTo(90 / 365, 9)
    expect(old.baseTimeFactor + next.baseTimeFactor).toBeCloseTo(
      old.timeFactor + next.timeFactor,
      12,
    )
    expect(old.changeDates).toEqual(['2025-04-01'])
    expect(next.changeDates).toEqual(['2025-04-01'])
  })

  it('bleibt bei zeitanteiliger Aufteilung beim Zeitanteil', () => {
    const shares = section9bShares(
      [
        occupancy({ id: 'alt', to: '2025-03-31', section9bAllocation: 'time' }),
        occupancy({
          id: 'neu',
          from: '2025-04-01',
          section9bAllocation: 'time',
        }),
      ],
      period,
    )
    expect(shares.get('alt')!.baseTimeFactor).toBeCloseTo(90 / 365, 12)
    expect(shares.get('neu')!.baseTimeFactor).toBeCloseTo(275 / 365, 12)
  })

  it('verteilt bei Teilabdeckung nur den Zeitanteil der Gruppe', () => {
    const shares = section9bShares(
      [
        occupancy({ id: 'a', to: '2025-03-31' }),
        occupancy({
          id: 'b',
          from: '2025-04-01',
          to: '2025-09-30',
          section9bAllocation: 'degree_days',
        }),
        occupancy({
          id: 'c',
          from: '2025-10-01',
          section9bAllocation: 'degree_days',
        }),
      ],
      period,
    )
    const b = shares.get('b')!
    const c = shares.get('c')!
    expect(b.groupTimeFactor).toBeCloseTo(275 / 365, 12)
    expect(b.baseTimeFactor + c.baseTimeFactor).toBeCloseTo(275 / 365, 12)
    expect(b.baseTimeFactor / c.baseTimeFactor).toBeCloseTo(
      degreeDayPermille('2025-04-01', '2025-09-30') /
        degreeDayPermille('2025-10-01', '2025-12-31'),
      9,
    )
    // Der Wechsel zum 01.04. gehört nicht zur Gruppe (Zwischenablesung).
    expect(b.changeDates).toEqual(['2025-10-01'])
  })

  it('nutzt ohne Feld den Zeitanteil', () => {
    expect(heatingBaseTimeFactor({ timeFactor: 0.25 })).toBe(0.25)
    expect(
      heatingBaseTimeFactor({ timeFactor: 0.25, heatingBaseTimeFactor: 0.4 }),
    ).toBe(0.4)
  })
})

describe('§ 9b Abs. 3 HeizKV in der Berechnung', () => {
  it('verteilt Heizungs-Grundkosten nach Gradtagszahlen, Warmwasser nach Tagen', () => {
    const before = calculate(appData())
    const result = calculate(withAllocation(appData(), 'degree_days'))
    const pick = (r: typeof result, id: string) =>
      r.tenants.find((tenant) => tenant.id === id)!
    const [first, second] = u1Ids().map((id) => pick(result, id))
    const [firstBefore, secondBefore] = u1Ids().map((id) => pick(before, id))
    expect(first!.costBreakdown.hotWaterCents).toBeGreaterThan(0)
    const permilleFirst = degreeDayPermille('2024-01-01', '2024-06-30')
    expect(first!.costBreakdown.heatingBaseCents).not.toBe(
      firstBefore!.costBreakdown.heatingBaseCents,
    )
    // Wohnung insgesamt trägt denselben Grundkostenanteil.
    const sumBase = (tenants: typeof result.tenants) =>
      tenants.reduce(
        (sum, tenant) => sum + tenant.costBreakdown.heatingBaseCents,
        0,
      )
    expect(
      Math.abs(sumBase(result.tenants) - sumBase(before.tenants)),
    ).toBeLessThanOrEqual(1)
    expect(
      first!.costBreakdown.heatingBaseCents /
        (first!.costBreakdown.heatingBaseCents +
          second!.costBreakdown.heatingBaseCents),
    ).toBeCloseTo(permilleFirst / 1000, 2)
    // Warmwasser und Verbrauchskosten unverändert.
    expect(first!.costBreakdown.hotWaterCents).toBe(
      firstBefore!.costBreakdown.hotWaterCents,
    )
    expect(first!.costBreakdown.heatingConsumptionCents).toBe(
      firstBefore!.costBreakdown.heatingConsumptionCents,
    )
    expect(second!.costBreakdown.hotWaterCents).toBe(
      secondBefore!.costBreakdown.hotWaterCents,
    )
    const total = (r: typeof result) =>
      r.tenants.reduce((sum, tenant) => sum + tenant.shareCents, 0)
    expect(Math.abs(total(result) - total(before))).toBeLessThanOrEqual(1)
    // Zeitfaktor der Ausgabe bleibt der Tagesanteil.
    expect(first!.timeFactor).toBe(firstBefore!.timeFactor)
  })

  it('rechnet bei zeitanteiliger Aufteilung wie bisher', () => {
    const before = calculate(appData())
    const result = calculate(withAllocation(appData(), 'time'))
    expect(result.tenants.map(({ shareCents }) => shareCents)).toEqual(
      before.tenants.map(({ shareCents }) => shareCents),
    )
  })
})
