import { describe, expect, it } from 'vitest'
import { co2Section } from '../src/tenant-statement-heating'
import { formatEuroCents } from '../src/format'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

function serializedFor(appData: ReturnType<typeof buildFixtureAppData>) {
  const context = buildFixtureTenantStatementContext(appData)
  return {
    context,
    text: JSON.stringify(co2Section(context)),
  }
}

describe('co2Section: Angaben nach § 7 Abs. 3 CO2KostAufG', () => {
  it('weist Energiegehalt, Emissionsfaktor und Emissionen in Tonnen aus', () => {
    const { text, context } = serializedFor(
      buildFixtureAppData('case-12-co2-split'),
    )
    const source =
      context.calculation.heating.trace.circuits[0]!.energySources[0]!
    expect(text).toContain(
      'Berechnungsgrundlagen der CO2-Kosten (§ 7 Abs. 3 CO2KostAufG)',
    )
    expect(text).toContain('Energiegehalt der verbrauchten Brennstoffmenge')
    expect(text).toContain('kg CO2/kWh')
    expect(text).toContain('Brennstoffemissionen')
    expect(text).toMatch(/\d+,\d{3} t/)
    expect(source.energyKwh).toBeGreaterThan(0)
    // Ohne Lieferjahrespreis keine Los-Aufschlüsselung.
    expect(text).not.toContain('Brennstoff-Los')
    // Bisherige Angaben bleiben erhalten.
    expect(text).toContain('Ihr Anteil an den CO2-Kosten')
    expect(text).toMatch(/Stufe \d+/)
  })

  it('zeigt bei emissionsfreier Heizung keine Berechnungsgrundlagen', () => {
    const { text } = serializedFor(buildFixtureAppData('case-08-heat-pump'))
    expect(text).toContain('Keine CO2-Kosten nach BEHG angefallen')
    expect(text).not.toContain('Berechnungsgrundlagen der CO2-Kosten')
  })

  it('schlüsselt die CO2-Kosten je FIFO-Los auf den Cent auf', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    appData.billingData.heatingCircuits =
      appData.billingData.heatingCircuits.map((circuit) => ({
        ...circuit,
        co2: { mode: 'auto', co2PricePerTonCents: 5_500 },
      }))
    appData.billingData.fuelStocks = appData.billingData.fuelStocks.map(
      (stock) => ({ ...stock, openingCo2PricePerTonCents: 3_000 }),
    )
    const { text, context } = serializedFor(appData)
    const circuit = context.calculation.heating.trace.circuits[0]!
    const lots = circuit.energySources.flatMap(({ co2Lots }) => co2Lots ?? [])
    expect(lots.length).toBeGreaterThan(0)
    expect(text).toContain('Brennstoff-Los')
    expect(text).toContain('Anfangsbestand (Vorjahr)')
    expect(text).toContain(formatEuroCents(3_000))
    for (const lot of lots)
      expect(text).toContain(formatEuroCents(lot.costCents))
    expect(text).toContain('Summe CO2-Kosten')
    expect(circuit.energySources[0]!.co2CostCents).toBe(circuit.co2.totalCents)
    expect(text).toContain(formatEuroCents(circuit.co2.totalCents))
  })
})
