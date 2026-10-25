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

/** Abweichung Hauptwasserzähler zu Wohnungszählern (E-45-3, Schwelle 15 %). */
describe('Prüfung Hauptwasserzähler gegen Wohnungszähler', () => {
  const metered = (main: number | undefined, cold: number, warm?: number) => {
    const data = validData()
    const category = data.billingData.costCategories[0]!
    category.kind = 'water'
    category.allocationKey = 'water_consumption'
    if (main !== undefined) category.mainWaterMeterM3 = main
    const occupancy = data.billingData.occupancyPeriods[0]!
    occupancy.coldWater = { value: cold, unit: 'm3' }
    if (warm !== undefined) occupancy.warmWater = { value: warm, unit: 'm3' }
    return data
  }
  const code = 'costs.water_main_meter_difference'

  it('warnt, wenn die Wohnungszähler mehr als 15 % unter dem Hauptzähler liegen', () => {
    expect(codes(metered(100, 60, 24))).toContain(code)
    const warning = validateBillingPeriod(
      metered(100, 60, 24),
      'period-1',
    ).issues.find((issue) => issue.code === code)
    expect(warning).toMatchObject({
      severity: 'warning',
      area: 'costs',
      entity: { type: 'CostCategory', id: 'category-1' },
    })
    expect(warning?.detail).toContain('16,0 %')
    expect(warning?.detail).toContain('100 m³')
    expect(warning?.detail).toContain('84 m³')
  })

  it('warnt auch, wenn die Wohnungszähler mehr als 15 % über dem Hauptzähler liegen', () => {
    expect(codes(metered(100, 116))).toContain(code)
  })

  it('warnt nicht bis einschließlich 15 % Abweichung', () => {
    expect(codes(metered(100, 85))).not.toContain(code)
    expect(codes(metered(100, 115))).not.toContain(code)
    expect(codes(metered(100, 70, 15))).not.toContain(code)
  })

  it('prüft nur mit erfasstem Hauptzähler und Schlüssel Wasserverbrauch', () => {
    expect(codes(metered(undefined, 10))).not.toContain(code)
    const byArea = metered(100, 10)
    byArea.billingData.costCategories[0]!.allocationKey = 'usable_area'
    expect(codes(byArea)).not.toContain(code)
  })

  it('prüft nicht, solange Kaltwasserwerte fehlen', () => {
    const data = metered(100, 10)
    delete data.billingData.occupancyPeriods[0]!.coldWater
    expect(codes(data)).toContain('costs.water_consumption_missing')
    expect(codes(data)).not.toContain(code)
  })
})
