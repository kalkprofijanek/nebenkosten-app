import { describe, expect, it } from 'vitest'
import type { FuelDeliveryTaxesAndLevies } from '@nebenkosten/schema'
import { buildTenantStatement } from '../src/tenant-statement'
import {
  TAXES_AND_LEVIES_HEADING,
  energyTaxesFallbackText,
} from '../src/taxes-and-levies'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

function contextWithTaxes(taxesAndLevies?: FuelDeliveryTaxesAndLevies) {
  const appData = buildFixtureAppData('case-12-co2-split')
  const withTaxes = {
    ...appData,
    billingData: {
      ...appData.billingData,
      fuelDeliveries: appData.billingData.fuelDeliveries.map((delivery) => ({
        ...delivery,
        ...(taxesAndLevies ? { taxesAndLevies } : {}),
      })),
    },
  }
  return buildFixtureTenantStatementContext(withTaxes)
}

function text(context: ReturnType<typeof contextWithTaxes>): string {
  return JSON.stringify(buildTenantStatement(context).content)
}

describe('Steuern und Abgaben in der Einzelabrechnung (§ 6a Abs. 3 Nr. 1 b HeizKV)', () => {
  it('nennt ohne erfasste Angaben den konkreten CO2-Betrag statt „ggf.“', () => {
    const serialized = text(contextWithTaxes())
    expect(serialized).not.toContain(TAXES_AND_LEVIES_HEADING)
    expect(serialized).not.toContain('ggf. CO2')
    expect(serialized).toContain(energyTaxesFallbackText(29_304))
  })

  it('weist erfasste Steuern und Abgaben als Tabelle aus', () => {
    // Fiktive Rechnung: 2.000 € brutto, vollständig verbraucht.
    const serialized = text(
      contextWithTaxes({
        vatCents: 31_933,
        vatRatePercent: 19,
        energyTaxCents: 12_270,
        otherLeviesCents: 1_000,
        otherLeviesLabel: 'Fiktive Umlage',
      }),
    )
    expect(serialized).toContain(TAXES_AND_LEVIES_HEADING)
    expect(serialized).not.toContain(
      'gesetzlichen Steuern und Abgaben (Umsatzsteuer',
    )
    for (const expected of [
      'Umsatzsteuer 19 %',
      '319,33 €',
      'Energiesteuer bzw. Stromsteuer',
      '122,70 €',
      'CO2-Kosten nach BEHG (berechnet)',
      '293,04 €',
      'Fiktive Umlage',
      'Summe Steuern und Abgaben',
      // Ihr Anteil am CO2: tatsächlicher Mieteranteil 102,56 €.
      '102,56 €',
      'angegeben sind die berechneten CO2-Kosten',
    ])
      expect(serialized).toContain(expected)
  })

  it('übernimmt den BEHG-Betrag laut Rechnung', () => {
    const serialized = text(
      contextWithTaxes({
        vatCents: 31_933,
        vatRatePercent: 19,
        co2LevyCents: 30_000,
      }),
    )
    expect(serialized).toContain('"CO2-Kosten nach BEHG"')
    expect(serialized).toContain('300,00 €')
    expect(serialized).not.toContain(
      'angegeben sind die berechneten CO2-Kosten',
    )
  })

  it('formuliert den Hinweis ohne CO2-Kosten (z. B. Wärmepumpe)', () => {
    expect(energyTaxesFallbackText(0)).toContain(
      'CO2-Kosten nach BEHG sind nicht angefallen',
    )
  })
})
