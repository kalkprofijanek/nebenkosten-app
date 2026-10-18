import { describe, expect, it } from 'vitest'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const codes = (data: unknown) =>
  validateBillingPeriod(data, 'period-1').issues.map(({ code }) => code)

/** Wasserkosten und Wohnungswasserzähler (§ 556a Abs. 1 Satz 2 BGB, ADR-0013). */
describe('Prüfung Wasserkosten nach Verbrauch', () => {
  it('meldet einen Fehler, wenn der Schlüssel ohne Kaltwasserwert gewählt ist', () => {
    const data = validData()
    const category = data.billingData.costCategories[0]!
    category.kind = 'water'
    category.allocationKey = 'water_consumption'
    data.billingData.occupancyPeriods[0]!.warmWater = { value: 10, unit: 'm3' }
    expect(codes(data)).toContain('costs.water_consumption_missing')

    data.billingData.occupancyPeriods[0]!.coldWater = { value: 30, unit: 'm3' }
    expect(codes(data)).not.toContain('costs.water_consumption_missing')
  })

  it('warnt, wenn Kaltwasser erfasst ist, die Wasserkosten aber nach Fläche gehen', () => {
    const data = validData()
    const category = data.billingData.costCategories[0]!
    category.kind = 'water'
    expect(codes(data)).not.toContain('costs.water_meter_not_used')

    data.billingData.occupancyPeriods[0]!.coldWater = { value: 30, unit: 'm3' }
    expect(codes(data)).toContain('costs.water_meter_not_used')

    category.allocationKey = 'water_consumption'
    expect(codes(data)).not.toContain('costs.water_meter_not_used')
  })

  it('warnt nicht bei Betriebskosten, die keine Wasserkosten sind', () => {
    const data = validData()
    data.billingData.occupancyPeriods[0]!.coldWater = { value: 30, unit: 'm3' }
    expect(codes(data)).not.toContain('costs.water_meter_not_used')
  })
})
