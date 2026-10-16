import type { AppDataFile, OccupancyPeriod } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { consumptionFixture } from '../consumption/consumption-fixture'
import { interimReadingHints } from './interim-reading'

const CIRCUIT = {
  id: 'hc',
  billingPeriodId: 'y',
  heatingSystemId: 'hs',
  buildingId: 'b1',
  hasCentralHotWater: false,
}

function withCircuit(
  occupancies: Parameters<typeof consumptionFixture>[0] = {},
  extra: OccupancyPeriod[] = [],
): AppDataFile {
  const data = consumptionFixture(occupancies)
  data.billingData.heatingCircuits.push(CIRCUIT)
  data.billingData.occupancyPeriods.push(...extra)
  return data
}

const period = (data: AppDataFile) => data.billingData.billingPeriods[0]!

describe('interimReadingHints', () => {
  it('weist bei einem Auszug im Jahr auf die Zwischenablesung hin', () => {
    const data = withCircuit()
    expect(
      interimReadingHints(data, period(data), {
        occupancyId: 'o1',
        unitId: 'u1',
        to: '2025-03-31',
      }),
    ).toEqual([
      'Zwischenablesung zum 31.03.2025 veranlassen (§ 9b Abs. 1 HeizKV): Messdienst beauftragen bzw. Stände selbst ablesen und unter ‚Verbrauch‘ erfassen. Eine Aufteilung nach Gradtagen ist nur zulässig, wenn die Ablesung nicht möglich war.',
    ])
  })

  it('weist bei einem Einzug nach Periodenbeginn hin, auch beim Anlegen', () => {
    const data = withCircuit()
    expect(
      interimReadingHints(data, period(data), {
        unitId: 'u1',
        from: '2025-04-01',
      }),
    ).toEqual([expect.stringContaining('Zwischenablesung zum 01.04.2025')])
  })

  it('schweigt ohne Heizkreis, ohne Wechsel im Jahr und bei ungültigem Datum', () => {
    const data = consumptionFixture()
    expect(
      interimReadingHints(data, period(data), {
        unitId: 'u1',
        to: '2025-03-31',
      }),
    ).toEqual([])
    const heated = withCircuit()
    for (const draft of [
      { unitId: 'u1' },
      { unitId: 'u1', from: '2025-01-01', to: '2025-12-31' },
      { unitId: 'u1', to: '2026-02-01' },
      { unitId: 'u1', from: '2025-1' },
    ])
      expect(interimReadingHints(heated, period(heated), draft)).toEqual([])
  })

  it('schweigt, wenn die Ablesung zum Wechsel erfasst ist', () => {
    const own = withCircuit({
      o1: {
        heatMeterReading: { endValue: 812, endDate: '2025-03-31' },
      },
    })
    expect(
      interimReadingHints(own, period(own), {
        occupancyId: 'o1',
        unitId: 'u1',
        to: '2025-03-31',
      }),
    ).toEqual([])

    const next = withCircuit({ o1: { to: '2025-03-31' } }, [
      {
        id: 'o4',
        billingPeriodId: 'y',
        unitId: 'u1',
        kind: 'vacancy',
        from: '2025-04-01',
        heatMeterReading: { startValue: 812, startDate: '2025-04-01' },
      },
    ])
    expect(
      interimReadingHints(next, period(next), {
        occupancyId: 'o1',
        unitId: 'u1',
        to: '2025-03-31',
      }),
    ).toEqual([])
    // Einzug: Endstand der vorigen Nutzung am Tag vor dem Einzug genügt.
    const previous = withCircuit({
      o1: {
        to: '2025-03-31',
        heatMeterReading: { endValue: 812, endDate: '2025-03-31' },
      },
    })
    expect(
      interimReadingHints(previous, period(previous), {
        unitId: 'u1',
        from: '2025-04-01',
      }),
    ).toEqual([])
  })
})
