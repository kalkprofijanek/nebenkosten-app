import type { AppDataFile, OccupancyPeriod } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { consumptionFixture } from '../consumption/consumption-fixture'
import { splitUnitConsumptionByDegreeDays } from './commands'
import { degreeDaySplitPlan } from './degree-day-split'

function vacancy(patch: Partial<OccupancyPeriod> = {}): OccupancyPeriod {
  return {
    id: 'o4',
    billingPeriodId: 'y',
    unitId: 'u1',
    kind: 'vacancy',
    from: '2025-04-01',
    ...patch,
  }
}

function changeFixture(next: OccupancyPeriod = vacancy()): AppDataFile {
  const data = consumptionFixture({
    o1: {
      to: '2025-03-31',
      consumptionUnitsEstimated: true,
      consumptionUnitsEstimateReason: 'Fiktiv geschätzt',
      heatMeterReading: { meterNumber: 'HKV-TEST' },
    },
  })
  data.billingData.occupancyPeriods.push(next)
  return data
}

const occupancy = (data: AppDataFile, id: string) =>
  data.billingData.occupancyPeriods.find((item) => item.id === id)!

describe('Aufteilung nach Gradtagszahlen', () => {
  it('teilt Mieter und Leerstand nach VDI 2067 und erläutert den Rechenweg', () => {
    const data = changeFixture()
    const plan = degreeDaySplitPlan(data, 'y', 'u1', 1000)
    expect(plan).toMatchObject({
      ok: true,
      permilleTotal: 1000,
      shares: [
        { from: '2025-01-01', to: '2025-03-31', permille: 450, value: 450 },
        { from: '2025-04-01', to: '2025-12-31', permille: 550, value: 550 },
      ],
    })

    const result = splitUnitConsumptionByDegreeDays(data, {
      billingPeriodId: 'y',
      unitId: 'u1',
      totalUnits: 1000,
      reason: 'Mieter war zum Auszug nicht erreichbar.',
    })
    const tenant = occupancy(result, 'o1')
    expect(tenant.consumptionUnits).toEqual({ value: 450, unit: 'einheiten' })
    expect(tenant).not.toHaveProperty('consumptionUnitsEstimated')
    expect(tenant.heatMeterReading).toEqual({ meterNumber: 'HKV-TEST' })
    expect(tenant.consumptionUnitsEstimateReason).toBe(
      'Keine Zwischenablesung möglich: Mieter war zum Auszug nicht erreichbar. Aufteilung nach Gradtagszahlen (§ 9b Abs. 3 HeizKV, VDI 2067), Zeitraum 01.01.2025 bis 31.03.2025: 1.000 Einheiten × 450 ‰ ÷ 1.000 ‰ = 450 Einheiten.',
    )
    const empty = occupancy(result, 'o4')
    expect(empty.consumptionUnits).toEqual({ value: 550, unit: 'einheiten' })
    expect(empty.consumptionUnitsEstimateReason).toContain(
      '1.000 Einheiten × 550 ‰ ÷ 1.000 ‰ = 550 Einheiten.',
    )
    // Andere Wohnungen bleiben unverändert.
    expect(occupancy(result, 'o2')).toEqual(occupancy(data, 'o2'))
  })

  it('verlangt lückenlose Zeiträume ohne Überschneidung', () => {
    expect(
      degreeDaySplitPlan(
        changeFixture(vacancy({ from: '2025-04-03' })),
        'y',
        'u1',
        1,
      ),
    ).toEqual({
      ok: false,
      problem: expect.stringContaining(
        'nicht lückenlos ab: Lücke vom 01.04.2025 bis 02.04.2025',
      ),
    })
    expect(
      degreeDaySplitPlan(
        changeFixture(vacancy({ to: '2025-11-30' })),
        'y',
        'u1',
        1,
      ),
    ).toMatchObject({
      ok: false,
      problem: expect.stringContaining('Lücke vom 01.12.2025 bis 31.12.2025'),
    })
    expect(
      degreeDaySplitPlan(
        changeFixture(vacancy({ from: '2025-03-15' })),
        'y',
        'u1',
        1,
      ),
    ).toMatchObject({
      ok: false,
      problem: expect.stringContaining('überschneiden sich am 15.03.2025'),
    })
    expect(
      degreeDaySplitPlan(
        changeFixture(vacancy({ to: '2025-03-01' })),
        'y',
        'u1',
        1,
      ),
    ).toMatchObject({
      ok: false,
      problem: expect.stringContaining('ungültiger Zeitraum'),
    })
    expect(() =>
      splitUnitConsumptionByDegreeDays(
        changeFixture(vacancy({ from: '2025-04-03' })),
        { billingPeriodId: 'y', unitId: 'u1', totalUnits: 1, reason: 'Test' },
      ),
    ).toThrow('nicht lückenlos')
  })

  it('prüft Eingaben, Begründung und Anzahl der Nutzungen', () => {
    const data = changeFixture()
    const input = {
      billingPeriodId: 'y',
      unitId: 'u1',
      totalUnits: 10,
      reason: 'Test',
    }
    expect(() =>
      splitUnitConsumptionByDegreeDays(data, { ...input, reason: '  ' }),
    ).toThrow('Bitte angeben, warum keine Zwischenablesung möglich war.')
    expect(() =>
      splitUnitConsumptionByDegreeDays(data, {
        ...input,
        reason: 'x'.repeat(301),
      }),
    ).toThrow('höchstens 300 Zeichen')
    expect(() =>
      splitUnitConsumptionByDegreeDays(data, { ...input, totalUnits: -1 }),
    ).toThrow('Gesamtverbrauch: Bitte eine Zahl ab 0 eingeben.')
    expect(() =>
      splitUnitConsumptionByDegreeDays(data, { ...input, extra: true }),
    ).toThrow('Ungültige Eingabe')
    expect(() =>
      splitUnitConsumptionByDegreeDays(data, { ...input, unitId: 'u2' }),
    ).toThrow('nur eine Nutzung')
    expect(degreeDaySplitPlan(data, 'fehlt', 'u1', 1)).toEqual({
      ok: false,
      problem: 'Abrechnungsjahr wurde nicht gefunden.',
    })
    expect(degreeDaySplitPlan(data, 'y', 'u1', Number.NaN)).toMatchObject({
      ok: false,
    })
  })
})
