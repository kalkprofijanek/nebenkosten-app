import { describe, expect, it } from 'vitest'
import type { AppDataFile, FuelDelivery } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const CODES = [
  'heating.energy_amount_not_invoiced',
  'heating.previous_owner_quantity_missing',
  'heating.opening_stock_seller_valuation',
  'heating.fuel_price_deviation',
]

const codes = (data: AppDataFile) =>
  validateBillingPeriod(data, 'period-1')
    .issues.filter(({ code }) => CODES.includes(code))
    .map(({ code, entity }) => `${code}@${entity?.id}`)
    .sort()

/** Fiktiver Ölkessel; Lieferungen mit Menge in Litern und Betrag in Cent. */
function oilData(
  deliveries: Partial<FuelDelivery>[],
  stock?: AppDataFile['billingData']['fuelStocks'][number],
): AppDataFile {
  const data = validData()
  data.masterData.heatingSystems.push({
    id: 'system-1',
    propertyId: 'property-1',
  })
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
  })
  data.billingData.energySources.push({
    id: 'oil',
    heatingCircuitId: 'circuit-1',
    key: 'haupt',
    sourceType: 'Heizöl',
    calorificValueKwhPerUnit: 10,
  })
  deliveries.forEach((patch, index) =>
    data.billingData.fuelDeliveries.push({
      id: `delivery-${index + 1}`,
      energySourceId: 'oil',
      billingPeriodId: 'period-1',
      date: '2025-03-01',
      quantity: { value: 1_000, unit: 'l' },
      amountCents: 100_000,
      ...patch,
    }),
  )
  if (stock) data.billingData.fuelStocks.push(stock)
  return data
}

describe('Eigentümerwechsel und Energiekosten (PR-30)', () => {
  it('meldet nichts bei Rechnungen mit plausiblen Preisen', () => {
    expect(
      codes(
        oilData([
          { date: '2025-02-01' },
          { date: '2025-10-01', amountCents: 110_000 },
        ]),
      ),
    ).toEqual([])
  })

  it('warnt bei Abschlägen und Schätzungen statt Rechnung', () => {
    expect(
      codes(
        oilData([
          { amountBasis: 'advance_payments' },
          { amountBasis: 'estimate', date: '2025-04-01' },
          { amountBasis: 'invoice', date: '2025-05-01' },
        ]),
      ),
    ).toEqual([
      'heating.energy_amount_not_invoiced@delivery-1',
      'heating.energy_amount_not_invoiced@delivery-2',
    ])
  })

  it('warnt, wenn der Verkäuferzeitraum keine Menge hat', () => {
    const data = oilData([
      { date: '2025-02-01', quantity: null, origin: 'previous_owner' },
      { date: '2025-10-01' },
    ])
    expect(codes(data)).toEqual([])
    data.billingData.billingPeriods[0]!.ownershipChange = {
      transferDate: '2025-07-01',
      previousOwnerLabel: 'Voreigentümer',
    }
    expect(codes(data)).toEqual(['heating.previous_owner_quantity_missing@oil'])
  })

  it('verlangt eine Begründung für die Bewertung des Voreigentümers', () => {
    const stock = {
      id: 'stock-1',
      energySourceId: 'oil',
      billingPeriodId: 'period-1',
      openingQuantity: { value: 500, unit: 'l' as const },
      openingPricePerUnitCents: 100,
      valuationBasis: 'seller_valuation' as const,
    }
    expect(codes(oilData([{}], stock))).toEqual([
      'heating.opening_stock_seller_valuation@stock-1',
    ])
    expect(
      codes(oilData([{}], { ...stock, valuationReason: 'Kein Beleg' })),
    ).toEqual([])
  })

  it('meldet Preissprünge über 20 % gegenüber Folgelieferung und Bestand', () => {
    // Bestand 0,73 €/l gegen Lieferung 1,13 €/l (wie 2025).
    expect(
      codes(
        oilData([{ amountCents: 113_000 }], {
          id: 'stock-1',
          energySourceId: 'oil',
          billingPeriodId: 'period-1',
          openingQuantity: { value: 500, unit: 'l' },
          openingPricePerUnitCents: 73,
        }),
      ),
    ).toEqual(['heating.fuel_price_deviation@stock-1'])
    expect(
      codes(
        oilData([
          { date: '2025-02-01', amountCents: 100_000 },
          { date: '2025-10-01', amountCents: 130_000 },
        ]),
      ),
    ).toEqual(['heating.fuel_price_deviation@delivery-1'])
  })

  it('vergleicht leitungsgebundene Energie nicht über den Preis', () => {
    const data = oilData([
      { date: '2025-02-01', amountCents: 100_000 },
      { date: '2025-10-01', amountCents: 200_000 },
    ])
    data.billingData.energySources[0]!.sourceType = 'Strom'
    expect(codes(data)).toEqual([])
  })
})
