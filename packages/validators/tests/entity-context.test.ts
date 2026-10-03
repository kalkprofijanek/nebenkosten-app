import { describe, expect, it } from 'vitest'
import { validateBillingPeriod } from '../src/index'
import { describeEntity } from '../src/entity-context'
import { validData } from './fixture'

const plain = (value: string | undefined) => value?.replace(/ /g, ' ')

function heatedData() {
  const data = validData()
  data.masterData.heatingSystems.push({
    id: 'system-1',
    propertyId: 'property-1',
  })
  data.masterData.meters.push({
    id: 'meter-1',
    propertyId: 'property-1',
    kind: 'heat',
    address: 'Heizraum',
    provider: 'Fiktiver Versorger',
  })
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
  })
  data.billingData.energySources.push({
    id: 'source-1',
    heatingCircuitId: 'circuit-1',
    key: 'haupt',
    name: 'Heizöl',
  })
  data.billingData.fuelDeliveries.push({
    id: 'delivery-1',
    energySourceId: 'source-1',
    billingPeriodId: 'period-1',
    date: '2025-03-01',
    amountCents: 12_345,
    description: 'Fiktive Lieferung',
  })
  return data
}

describe('Betrifft-Angaben für Prüfhinweise', () => {
  it('benennt Heizkreis, Energiequelle, Lieferung, Zähler und Wohnung', () => {
    const data = heatedData()
    expect(
      describeEntity(data, { type: 'HeatingCircuit', id: 'circuit-1' }),
    ).toBe('Heizkreis Haus A')
    expect(describeEntity(data, { type: 'EnergySource', id: 'source-1' })).toBe(
      'Heizöl (Haus A)',
    )
    expect(
      plain(describeEntity(data, { type: 'FuelDelivery', id: 'delivery-1' })),
    ).toBe(
      'Lieferung vom 2025-03-01 · 123,45 € · Fiktive Lieferung · Heizöl (Haus A)',
    )
    expect(describeEntity(data, { type: 'Meter', id: 'meter-1' })).toBe(
      'Zähler Heizraum (Fiktiver Versorger)',
    )
    expect(describeEntity(data, { type: 'Unit', id: 'unit-1' })).toBe(
      'Wohnung ohne Bezeichnung',
    )
    expect(
      describeEntity(data, { type: 'CostCategory', id: 'category-1' }),
    ).toBe('Beispielkosten')
    expect(
      plain(describeEntity(data, { type: 'CostEntry', id: 'entry-1' })),
    ).toBe('100,00 €')
    expect(describeEntity(data, { type: 'Property', id: 'property-1' })).toBe(
      'Objekt Objektweg',
    )
    data.masterData.meters[0] = {
      ...data.masterData.meters[0]!,
      meterNumber: '  ',
      address: null,
    }
    expect(describeEntity(data, { type: 'Meter', id: 'meter-1' })).toBe(
      'Zähler ohne Nummer (Fiktiver Versorger)',
    )
    expect(describeEntity(data, { type: 'Unbekannt', id: 'x' })).toBeUndefined()
    expect(describeEntity(data, { type: 'Meter', id: 'fehlt' })).toBeUndefined()
    expect(describeEntity(data, undefined)).toBeUndefined()
  })

  it('ergänzt Prüfhinweise ohne eigenen Detailtext', () => {
    const issues = validateBillingPeriod(heatedData(), 'period-1').issues
    const meter = issues.find(({ code }) => code === 'meters.number_missing')
    expect(meter?.detail).toBe('Betrifft: Zähler Heizraum (Fiktiver Versorger)')
    const receipt = issues.find(
      ({ code }) => code === 'documents.receipt_missing',
    )
    expect(receipt?.detail).toContain('Betrifft: Lieferung vom 2025-03-01')
  })
})
