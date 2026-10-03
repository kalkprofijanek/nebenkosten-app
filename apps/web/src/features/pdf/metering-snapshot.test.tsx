import { describe, expect, it } from 'vitest'
import { compatibleMeteringTrace } from './metering-snapshot'

const reading = {
  meterId: 'm',
  meterNumber: null,
  startReadingId: 'r1',
  endReadingId: 'r2',
  startReadingDate: '2026-01-01',
  endReadingDate: '2026-12-31',
  startBoundary: 'start_of_day',
  endBoundary: 'end_of_day',
  startValue: '1000.25',
  endValue: '1400.75',
  kwh: '400.5',
  unit: 'kWh',
}
const occupancy = {
  occupancyId: 'o',
  unitId: 'u',
  from: '2026-01-01',
  to: '2026-12-31',
  kwh: '400.5',
  meters: [reading],
}
const circuit = {
  heatingCircuitId: 'c',
  buildingId: 'b',
  totalKwh: '400.5',
  occupancies: [occupancy],
}
const trace = {
  year: 2026,
  billingPeriodId: 'p',
  totalKwh: '400.5',
  circuits: [circuit],
}

describe('metering snapshot validation', () => {
  it('accepts complete saved readings with optional meter number', () => {
    expect(compatibleMeteringTrace(trace)).toBe(true)
    expect(
      compatibleMeteringTrace({
        ...trace,
        circuits: [
          {
            ...circuit,
            occupancies: [
              { ...occupancy, meters: [{ ...reading, meterNumber: 'WMZ-1' }] },
            ],
          },
        ],
      }),
    ).toBe(true)
  })
  it.each([
    null,
    [],
    {},
    { ...trace, year: 2026.5 },
    { ...trace, totalKwh: 'NaN' },
    { ...trace, circuits: [{ ...circuit, occupancies: [] }] },
  ])('rejects incomplete trace %j', (value) => {
    expect(compatibleMeteringTrace(value)).toBe(false)
  })
  it.each([
    ['meterId', null],
    ['meterNumber', 5],
    ['startReadingId', null],
    ['endReadingId', null],
    ['startReadingDate', '2026-02-30'],
    ['endReadingDate', null],
    ['startBoundary', 'uncertain'],
    ['endBoundary', null],
    ['startValue', '-1'],
    ['endValue', 'Infinity'],
    ['kwh', 0],
    ['unit', 'einheiten'],
  ])('rejects corrupt saved reading %s', (field, value) => {
    expect(
      compatibleMeteringTrace({
        ...trace,
        circuits: [
          {
            ...circuit,
            occupancies: [
              {
                ...occupancy,
                meters: [{ ...reading, [field as string]: value }],
              },
            ],
          },
        ],
      }),
    ).toBe(false)
  })
})
