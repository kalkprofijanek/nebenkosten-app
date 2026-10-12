import { describe, expect, it } from 'vitest'
import type { AppDataFile, FuelDelivery } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const CODE = 'heating.taxes_and_levies_missing'

const find = (data: AppDataFile) =>
  validateBillingPeriod(data, 'period-1').issues.filter(
    (issue) => issue.code === CODE,
  )

/** Fiktiver Heizkreis mit Heizöl; Rechnungsbeträge frei erfunden. */
function circuitWith(deliveries: FuelDelivery[]): AppDataFile {
  const data = validData()
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
  data.billingData.fuelDeliveries.push(...deliveries)
  return data
}

function delivery(id: string, overrides: Partial<FuelDelivery> = {}) {
  return {
    id,
    energySourceId: 'oil',
    billingPeriodId: 'period-1',
    date: '2025-03-01',
    quantity: { value: 1_000, unit: 'l' as const },
    amountCents: 119_000,
    ...overrides,
  }
}

describe('heating.taxes_and_levies_missing (§ 6a Abs. 3 Nr. 1 b HeizKV)', () => {
  it('meldet einen Hinweis, wenn keine Rechnung Angaben trägt', () => {
    const issues = find(circuitWith([delivery('d1'), delivery('d2')]))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      severity: 'info',
      entity: { type: 'HeatingCircuit', id: 'circuit-1' },
    })
    expect(issues[0]!.detail).toContain('Für keine Brennstoff')
    expect(issues[0]!.detail).toContain('§ 12 Abs. 1 HeizKV')
  })

  it('nennt die Zahl der Rechnungen ohne Angaben', () => {
    const issues = find(
      circuitWith([
        delivery('d1', { taxesAndLevies: { vatCents: 19_000 } }),
        delivery('d2', { taxesAndLevies: {} }),
      ]),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.detail).toContain('Für 1 von 2')
  })

  it('schweigt bei vollständigen Angaben und bei Rechnungen ohne Betrag', () => {
    expect(
      find(
        circuitWith([
          delivery('d1', {
            taxesAndLevies: { vatCents: 19_000, vatRatePercent: 19 },
          }),
          delivery('d2', { amountCents: null }),
        ]),
      ),
    ).toEqual([])
    expect(find(validData())).toEqual([])
  })
})
