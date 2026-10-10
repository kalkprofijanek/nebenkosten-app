import { describe, expect, it } from 'vitest'
import type { AppDataFile, ClimateFactor } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

/** Fiktive Klimafaktoren; keine Werte einer echten DWD-Liste. */
const FACTOR_2025: ClimateFactor = {
  postalCode: '12345',
  factor: 1.08,
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  source: 'DWD, Klimafaktoren',
}

const find = (data: AppDataFile, code: string) =>
  validateBillingPeriod(data, 'period-1').issues.filter(
    (issue) => issue.code === code,
  )

function withHeating(climateFactor: ClimateFactor | null): AppDataFile {
  const data = validData()
  data.masterData.heatingSystems.push({
    id: 'system-1',
    propertyId: data.masterData.properties[0]!.id,
  })
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
  })
  data.billingData.billingPeriods[0]!.climateFactor = climateFactor
  return data
}

function withPreviousPeriod(
  data: AppDataFile,
  climateFactor: ClimateFactor | null,
): AppDataFile {
  const current = data.billingData.billingPeriods[0]!
  data.billingData.billingPeriods.push({
    ...current,
    id: 'period-0',
    year: 2024,
    periodStart: '2024-01-01',
    periodEnd: '2024-12-31',
    climateFactor,
  })
  const occupancy = data.billingData.occupancyPeriods[0]!
  data.billingData.occupancyPeriods.push({
    ...occupancy,
    id: 'occupancy-2024',
    billingPeriodId: 'period-0',
    from: null,
    to: null,
  })
  return data
}

const CODES = [
  'heating.climate_factor_period_mismatch',
  'heating.climate_factor_postal_code_mismatch',
  'heating.climate_factor_previous_missing',
]

describe('Klimafaktor für die Witterungsbereinigung (§ 6a Abs. 3 HeizKV)', () => {
  it('meldet nichts bei passendem Faktor ohne Vorjahresvergleich', () => {
    const data = withHeating(FACTOR_2025)
    for (const code of CODES) expect(find(data, code), code).toEqual([])
  })

  it('meldet nichts ohne erfassten Klimafaktor', () => {
    const data = withPreviousPeriod(withHeating(null), null)
    for (const code of CODES) expect(find(data, code), code).toEqual([])
  })

  it('meldet einen abweichenden Zeitraum', () => {
    const [warning] = find(
      withHeating({
        ...FACTOR_2025,
        periodStart: '2024-12-01',
        periodEnd: '2025-11-30',
      }),
      'heating.climate_factor_period_mismatch',
    )
    expect(warning).toMatchObject({
      severity: 'warning',
      entity: { type: 'BillingPeriod', id: 'period-1' },
    })
    expect(warning!.detail).toContain('01.12.2024 bis 30.11.2025')
  })

  it('meldet eine abweichende Postleitzahl', () => {
    const [warning] = find(
      withHeating({ ...FACTOR_2025, postalCode: '54321' }),
      'heating.climate_factor_postal_code_mismatch',
    )
    expect(warning!.detail).toContain('54321')
    expect(warning!.detail).toContain('12345')
  })

  it('verlangt den Faktor des Vorjahres im System', () => {
    const [warning] = find(
      withPreviousPeriod(withHeating(FACTOR_2025), null),
      'heating.climate_factor_previous_missing',
    )
    expect(warning).toMatchObject({
      entity: { type: 'BillingPeriod', id: 'period-0' },
    })
    expect(
      find(
        withPreviousPeriod(withHeating(FACTOR_2025), {
          ...FACTOR_2025,
          factor: 0.95,
          periodStart: '2024-01-01',
          periodEnd: '2024-12-31',
        }),
        'heating.climate_factor_previous_missing',
      ),
    ).toEqual([])
  })

  it('verlangt den Faktor beim übernommenen Vorjahresverbrauch', () => {
    const data = withHeating(FACTOR_2025)
    data.billingData.occupancyPeriods[0]!.previousConsumption = {
      year: 2024,
      value: 800,
    }
    const [warning] = find(data, 'heating.climate_factor_previous_missing')
    expect(warning).toMatchObject({
      entity: { type: 'BillingPeriod', id: 'period-1' },
    })
    expect(warning!.detail).toContain('übernommenen Vorjahresverbrauch')
    data.billingData.occupancyPeriods[0]!.previousConsumption!.climateFactor = 0.97
    expect(find(data, 'heating.climate_factor_previous_missing')).toEqual([])
  })
})

describe('Vorjahresvergleich ohne Witterungsbereinigung', () => {
  const CODE = 'heating.previous_period_not_weather_adjusted'
  const FACTOR_2024: ClimateFactor = {
    ...FACTOR_2025,
    factor: 0.95,
    periodStart: '2024-01-01',
    periodEnd: '2024-12-31',
  }

  function withComparison(
    current: ClimateFactor | null,
    previous: ClimateFactor | null,
  ): AppDataFile {
    const data = withPreviousPeriod(withHeating(current), previous)
    data.billingData.occupancyPeriods.find(
      ({ id }) => id === 'occupancy-2024',
    )!.consumptionUnits = { value: 900, unit: 'einheiten' }
    return data
  }

  it('meldet nichts, wenn beide Jahre bereinigt werden können', () => {
    expect(find(withComparison(FACTOR_2025, FACTOR_2024), CODE)).toEqual([])
  })

  it('meldet nichts ohne Vorjahresvergleich', () => {
    expect(find(withHeating(null), CODE)).toEqual([])
    const noConsumption = withPreviousPeriod(withHeating(null), null)
    expect(find(noConsumption, CODE)).toEqual([])
  })

  it('warnt ohne Klimafaktor des Abrechnungsjahres', () => {
    const [warning] = find(withComparison(null, FACTOR_2024), CODE)
    expect(warning).toMatchObject({
      severity: 'warning',
      entity: { type: 'BillingPeriod', id: 'period-1' },
    })
    expect(warning!.detail).toContain('Eine Einzelabrechnung enthält')
    expect(warning!.detail).toContain('Für 2025 ist kein passender')
  })

  it('warnt ohne Klimafaktor des Vorjahres', () => {
    const [warning] = find(withComparison(FACTOR_2025, null), CODE)
    expect(warning!.detail).toContain('Für das Vorjahr 2024 fehlt')
  })

  it('warnt beim übernommenen Vorjahresverbrauch ohne Faktor', () => {
    const data = withHeating(FACTOR_2025)
    data.billingData.occupancyPeriods[0]!.previousConsumption = {
      year: 2024,
      value: 800,
    }
    expect(find(data, CODE)).toHaveLength(1)
    data.billingData.occupancyPeriods[0]!.previousConsumption!.climateFactor = 0.97
    expect(find(data, CODE)).toEqual([])
  })

  it('übergeht Nutzungen in Gebäuden ohne Heizkreis', () => {
    const data = withComparison(null, null)
    data.billingData.heatingCircuits[0]!.buildingId = 'building-other'
    expect(find(data, CODE)).toEqual([])
  })
})
