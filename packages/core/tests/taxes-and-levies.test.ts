import type {
  EnergySource,
  FuelDelivery,
  FuelDeliveryTaxesAndLevies,
  FuelStock,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  calculateEnergySourceFuel,
  circuitTaxesAndLevies,
  tenantTaxesAndLevies,
  type HeatingCircuitTrace,
} from '../src'

// Fiktive Werte: 10 kWh je Liter, keine echte Rechnung.
const source: EnergySource = {
  id: 'source-1',
  heatingCircuitId: 'circuit-1',
  key: 'haupt',
  calorificValueKwhPerUnit: 10,
}

function delivery(
  id: string,
  date: string,
  taxesAndLevies?: FuelDeliveryTaxesAndLevies,
  quantity = 100,
): FuelDelivery {
  return {
    id,
    energySourceId: 'source-1',
    billingPeriodId: 'period-1',
    date,
    quantity: quantity > 0 ? { value: quantity, unit: 'l' } : null,
    amountCents: 11_900,
    ...(taxesAndLevies ? { taxesAndLevies } : {}),
  }
}

function circuit(
  deliveries: readonly FuelDelivery[],
  stocks: readonly FuelStock[] = [],
  co2TotalCents = 2_000,
): HeatingCircuitTrace {
  const fuel = calculateEnergySourceFuel(source, stocks, deliveries)
  return {
    buildingId: 'building-1',
    heatingCircuitId: 'circuit-1',
    energySources: [fuel.trace],
    co2: { totalCents: co2TotalCents },
    warmWater: { poolCents: 2_000 },
    reconciliation: { heatingPoolCents: 8_000 },
  } as unknown as HeatingCircuitTrace
}

const fullTaxes: FuelDeliveryTaxesAndLevies = {
  vatCents: 1_900,
  vatRatePercent: 19,
  energyTaxCents: 600,
  co2LevyCents: 1_000,
  otherLeviesCents: 100,
  otherLeviesLabel: 'Fiktive Umlage',
}

describe('Steuern und Abgaben je Heizkreis (§ 6a Abs. 3 Nr. 1 b HeizKV)', () => {
  it('liefert null ohne erfasste Angaben', () => {
    const deliveries = [delivery('d1', '2024-02-01')]
    expect(circuitTaxesAndLevies(circuit(deliveries), deliveries)).toBeNull()
    const empty = [delivery('d1', '2024-02-01', {})]
    expect(circuitTaxesAndLevies(circuit(empty), empty)).toBeNull()
  })

  it('summiert vollständig verbrauchte Lieferungen', () => {
    const deliveries = [
      delivery('d1', '2024-02-01', fullTaxes),
      delivery('d2', '2024-06-01', { ...fullTaxes, otherLeviesLabel: '' }),
    ]
    const result = circuitTaxesAndLevies(circuit(deliveries), deliveries)
    expect(result).toEqual({
      buildingId: 'building-1',
      heatingCircuitId: 'circuit-1',
      vat: [{ ratePercent: 19, cents: 3_800 }],
      energyTaxCents: 1_200,
      co2LevyCents: 2_000,
      otherLevies: [
        { label: 'Fiktive Umlage', cents: 100 },
        { label: null, cents: 100 },
      ],
      totalCents: 7_200,
      co2LevySource: 'invoice',
      notStatedValueCents: 0,
    })
  })

  it('setzt nur den FIFO-verbrauchten Anteil an; Anfangsbestand ist nicht ausgewiesen', () => {
    const stock: FuelStock = {
      id: 'stock-1',
      energySourceId: 'source-1',
      billingPeriodId: 'period-1',
      openingQuantity: { value: 50, unit: 'l' },
      openingValueCents: 5_000,
      // Rest 75 l: 75 l aus der jüngsten Lieferung, 25 l davon verbraucht.
      remainingQuantity: { value: 75, unit: 'l' },
    }
    const deliveries = [
      delivery('d1', '2024-02-01', {
        vatCents: 1_900,
        vatRatePercent: 19,
        energyTaxCents: 600,
      }),
    ]
    const trace = circuit(deliveries, [stock], 1_234)
    const result = circuitTaxesAndLevies(trace, deliveries)!
    expect(result.vat).toEqual([{ ratePercent: 19, cents: 475 }])
    expect(result.energyTaxCents).toBe(150)
    // Kein BEHG-Betrag auf der Rechnung: berechnete CO₂-Kosten.
    expect(result.co2LevySource).toBe('calculated')
    expect(result.co2LevyCents).toBe(1_234)
    expect(result.notStatedValueCents).toBe(5_000)
    expect(result.totalCents).toBe(475 + 150 + 1_234)
  })

  it('weist Lieferungen ohne Angaben als nicht ausgewiesen aus', () => {
    const deliveries = [
      delivery('d1', '2024-02-01', { vatCents: 700, vatRatePercent: 7 }),
      delivery('d2', '2024-06-01'),
      delivery('d3', '2024-08-01', { vatCents: 100 }, 0),
    ]
    const result = circuitTaxesAndLevies(circuit(deliveries), deliveries)!
    expect(result.vat).toEqual([
      { ratePercent: 7, cents: 700 },
      { ratePercent: null, cents: 100 },
    ])
    expect(result.notStatedValueCents).toBe(11_900)
    expect(result.co2LevySource).toBe('calculated')
  })

  it('rechnet auch ohne Mengen (Kosten ohne Mengenangabe)', () => {
    const deliveries = [delivery('d1', '2024-02-01', fullTaxes, 0)]
    const result = circuitTaxesAndLevies(circuit(deliveries), deliveries)!
    expect(result.vat).toEqual([{ ratePercent: 19, cents: 1_900 }])
    expect(result.co2LevySource).toBe('invoice')
  })

  it('verteilt den Mieteranteil nach Heizkosten- und CO₂-Anteil', () => {
    const deliveries = [delivery('d1', '2024-02-01', fullTaxes)]
    const trace = circuit(deliveries)
    const taxes = circuitTaxesAndLevies(trace, deliveries)!
    // Heiz- und Warmwasserkosten des Kreises: 8.000 + 2.000 = 10.000 Cent.
    const tenant = tenantTaxesAndLevies(trace, taxes, {
      tenantHeatingCents: 2_500,
      tenantCo2Cents: 500,
    })
    expect(tenant).toEqual({
      vat: [{ ratePercent: 19, cents: 475 }],
      energyTaxCents: 150,
      co2LevyCents: 250,
      otherLevies: [{ label: 'Fiktive Umlage', cents: 25 }],
      totalCents: 900,
      heatingShare: 0.25,
      co2Share: 0.25,
    })
  })

  it('begrenzt den Anteil auf 0–1 und fängt leere Nenner ab', () => {
    const deliveries = [delivery('d1', '2024-02-01', fullTaxes)]
    const trace = circuit(deliveries, [], 0)
    const taxes = circuitTaxesAndLevies(trace, deliveries)!
    const tenant = tenantTaxesAndLevies(trace, taxes, {
      tenantHeatingCents: 50_000,
      tenantCo2Cents: 100,
    })
    expect(tenant.heatingShare).toBe(1)
    expect(tenant.co2Share).toBe(0)
    expect(tenant.co2LevyCents).toBe(0)
  })
})
