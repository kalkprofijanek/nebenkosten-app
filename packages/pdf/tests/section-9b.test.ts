import { describe, expect, it } from 'vitest'
import type { AppDataFile, OccupancyPeriod } from '@nebenkosten/schema'
import { buildTenantStatement } from '../src/tenant-statement'
import { TIME_FACTOR_EXPLANATION } from '../src/legal-texts'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

const text = (document: { content: unknown }) =>
  JSON.stringify(document.content).replace(
    new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'gu'),
    ' ',
  )

/**
 * Fiktives Szenario mit CO₂-Kosten: Der erste Mieter zieht zum 31.03.2024
 * aus, danach Leerstand; ohne Zwischenablesung (1.000 Einheiten gesamt).
 */
function changeData(
  allocation: OccupancyPeriod['section9bAllocation'],
): AppDataFile {
  const appData = buildFixtureAppData('case-12-co2-split')
  const tenant = appData.billingData.occupancyPeriods.find(
    ({ kind }) => kind === 'tenant',
  )!
  tenant.to = '2024-03-31'
  tenant.consumptionUnits = { value: 450, unit: 'einheiten' }
  tenant.consumptionUnitsEstimateReason = 'Mieter war nicht erreichbar.'
  tenant.section9bAllocation = allocation
  appData.billingData.occupancyPeriods.push({
    id: 'vacancy-9b',
    billingPeriodId: tenant.billingPeriodId,
    unitId: tenant.unitId,
    kind: 'vacancy',
    from: '2024-04-01',
    consumptionUnits: { value: 550, unit: 'einheiten' },
    section9bAllocation: allocation,
  })
  return appData
}

const statement = (appData: AppDataFile) =>
  text(buildTenantStatement(buildFixtureTenantStatementContext(appData)))

describe('Einzelabrechnung – Rechenweg nach § 9b Abs. 3 HeizKV', () => {
  it('zeigt bei Gradtagszahlen den Rechenweg und den Gradtagsanteil der Grundkosten', () => {
    const serialized = statement(changeData('degree_days'))
    expect(serialized).toContain(
      'Keine Zwischenablesung beim Nutzerwechsel am 01.04.2024; Aufteilung nach § 9b Abs. 3 HeizKV nach Gradtagszahlen (VDI 2067) für die gesamten Heizkosten: Ihr Zeitraum 01.01.2024 bis 31.03.2024 = 450 ‰ von 1.000 ‰; Ihre Einheiten = Gesamt 1.000 Einheiten × 450 ‰ ÷ 1.000 ‰ = 450 Einheiten.',
    )
    // Grund immer ausgeben, auch ohne Zählerstände und ohne Schätzung.
    expect(serialized).toContain('Mieter war nicht erreichbar.')
    expect(serialized).toMatch(/Grundkosten = [^"]+ m² × 450 ‰ ÷ 1\.000 ‰ = /u)
    expect(serialized).toMatch(
      /CO2-Grundanteil = [^"]+ m² × 450 ‰ ÷ 1\.000 ‰ = /u,
    )
    expect(serialized).not.toMatch(/Grundkosten = [^"]+ × 91\/366 Tage/u)
  })

  it('zeigt bei zeitanteiliger Aufteilung Tage statt Promille', () => {
    const serialized = statement(changeData('time'))
    expect(serialized).toContain(
      'Aufteilung nach § 9b Abs. 3 HeizKV zeitanteilig für die gesamten Heizkosten: Ihr Zeitraum 01.01.2024 bis 31.03.2024 = 91 von 366 Tagen; Ihre Einheiten = Gesamt 1.000 Einheiten × 91 ÷ 366 Tage = 450 Einheiten.',
    )
    expect(serialized).toMatch(/Grundkosten = [^"]+ m² × 91\/366 Tage = /u)
  })

  it('bleibt ohne Festlegung beim bisherigen Rechenweg und gibt den Grund aus', () => {
    const serialized = statement(changeData(null))
    expect(serialized).not.toContain('§ 9b Abs. 3 HeizKV nach Gradtagszahlen')
    expect(serialized).toContain('Mieter war nicht erreichbar.')
    expect(serialized).toMatch(/Grundkosten = [^"]+ m² × 91\/366 Tage = /u)
  })

  it('beschreibt § 9b HeizKV ohne festen Mischmaßstab', () => {
    expect(TIME_FACTOR_EXPLANATION).not.toContain(
      'Grundkosten nach Kalendertagen, Verbrauchskosten',
    )
    expect(TIME_FACTOR_EXPLANATION).toContain('§ 9b Abs. 3 HeizKV')
    expect(TIME_FACTOR_EXPLANATION).toContain('gesamten Heizkosten')
  })
})
