import { describe, expect, it } from 'vitest'
import type {
  AppDataFile,
  CostCategory,
  FuelDelivery,
} from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const find = (data: AppDataFile, code: string) =>
  validateBillingPeriod(data, 'period-1').issues.filter(
    (issue) => issue.code === code,
  )

/** Fiktiver gemischter Heizkreis: Flüssiggas (Tank) und Wärmepumpenstrom. */
function mixedCircuit(deliveries: FuelDelivery[] = []): AppDataFile {
  const data = validData()
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
  })
  data.billingData.energySources.push(
    {
      id: 'propane',
      heatingCircuitId: 'circuit-1',
      key: 'haupt',
      sourceType: 'Flüssiggas (Propan)',
      calorificValueKwhPerUnit: 6.57,
    },
    {
      id: 'heat-pump',
      heatingCircuitId: 'circuit-1',
      key: 'wp_strom',
      name: 'Wärmepumpe',
      sourceType: 'Strom',
    },
  )
  data.billingData.fuelStocks.push({
    id: 'propane-stock',
    energySourceId: 'propane',
    billingPeriodId: 'period-1',
    openingQuantity: { value: 1_000, unit: 'l' },
    openingValueCents: 80_000,
    remainingQuantity: { value: 500, unit: 'l' },
  })
  data.billingData.fuelDeliveries.push(
    {
      id: 'propane-1',
      energySourceId: 'propane',
      billingPeriodId: 'period-1',
      date: '2025-03-01',
      quantity: { value: 2_000, unit: 'l' },
      amountCents: 150_000,
    },
    ...deliveries,
  )
  return data
}

const heatPumpInvoice = (patch: Partial<FuelDelivery> = {}): FuelDelivery => ({
  id: 'heat-pump-1',
  energySourceId: 'heat-pump',
  billingPeriodId: 'period-1',
  date: '2026-02-17',
  quantity: { value: 5_000, unit: 'kWh' },
  amountCents: 150_000,
  description: 'Jahresabrechnung Verbrauchszeitraum 01.01.–31.12.2025',
  ...patch,
})

describe('§ 6a HeizKV – Durchschnittsnutzer', () => {
  it('weist auf den fehlenden normierten Vergleich hin', () => {
    const [warning] = find(
      mixedCircuit([heatPumpInvoice()]),
      'heating.consumption_benchmark_missing',
    )
    expect(warning).toMatchObject({
      severity: 'warning',
      area: 'heating',
      entity: { type: 'BillingPeriod', id: 'period-1' },
    })
    expect(warning!.detail).toContain('§ 12 Abs. 1 HeizKV')
  })

  it('meldet nichts ohne Heizkreis', () => {
    expect(find(validData(), 'heating.consumption_benchmark_missing')).toEqual(
      [],
    )
  })
})

describe('Energierechnungen leitungsgebundener Energie', () => {
  it('akzeptiert eine Jahresrechnung mit kWh und Verbrauchszeitraum', () => {
    const data = mixedCircuit([heatPumpInvoice()])
    expect(find(data, 'heating.energy_invoice_quantity_missing')).toEqual([])
    expect(find(data, 'heating.energy_invoice_period_missing')).toEqual([])
    expect(find(data, 'heating.energy_share_not_determinable')).toEqual([])
  })

  it('verlangt die kWh-Angabe und meldet nicht ermittelbare Anteile', () => {
    const data = mixedCircuit([heatPumpInvoice({ quantity: null })])
    const [missing] = find(data, 'heating.energy_invoice_quantity_missing')
    expect(missing).toMatchObject({
      entity: { type: 'FuelDelivery', id: 'heat-pump-1' },
    })
    expect(missing!.detail).toContain('Rechnung vom 17.02.2026 über')
    const [share] = find(data, 'heating.energy_share_not_determinable')
    expect(share).toMatchObject({
      entity: { type: 'HeatingCircuit', id: 'circuit-1' },
    })
    expect(share!.detail).toContain('Wärmepumpe')
  })

  it('verlangt bei Rechnungen außerhalb des Zeitraums den Verbrauchszeitraum', () => {
    const data = mixedCircuit([heatPumpInvoice({ description: null })])
    const [warning] = find(data, 'heating.energy_invoice_period_missing')
    expect(warning!.detail).toContain('31.12.2025')
    const undated = mixedCircuit([
      heatPumpInvoice({ description: ' ', date: null }),
    ])
    const [noDate] = find(undated, 'heating.energy_invoice_period_missing')
    expect(noDate!.detail).toContain('Rechnung ohne Datum')
  })

  it('behandelt Strom mit Lagerbestand nicht als Rechnung', () => {
    const data = mixedCircuit([heatPumpInvoice({ quantity: null })])
    data.billingData.fuelStocks.push({
      id: 'heat-pump-stock',
      energySourceId: 'heat-pump',
      billingPeriodId: 'period-1',
      openingQuantity: { value: 1, unit: 'kWh' },
    })
    expect(find(data, 'heating.energy_invoice_quantity_missing')).toEqual([])
  })

  it('verlangt eine Bezeichnung für Brennstoffrechnungen ohne Liefermenge', () => {
    const freight: FuelDelivery = {
      id: 'propane-freight',
      energySourceId: 'propane',
      billingPeriodId: 'period-1',
      date: '2025-11-28',
      quantity: { value: 0, unit: 'l' },
      amountCents: 3_726,
    }
    const [warning] = find(
      mixedCircuit([heatPumpInvoice(), freight]),
      'heating.cost_only_delivery_unlabelled',
    )
    expect(warning).toMatchObject({
      entity: { type: 'FuelDelivery', id: 'propane-freight' },
    })
    expect(warning!.detail).toContain('Rechnung vom 28.11.2025 über 37,26 €')
    expect(
      find(
        mixedCircuit([
          heatPumpInvoice(),
          { ...freight, description: 'Fracht laut Rechnung' },
        ]),
        'heating.cost_only_delivery_unlabelled',
      ),
    ).toEqual([])
  })

  it('verlangt den Heizwert für nicht in kWh erfasste Brennstoffe', () => {
    const data = mixedCircuit([heatPumpInvoice()])
    data.billingData.energySources[0]!.calorificValueKwhPerUnit = null
    expect(find(data, 'heating.energy_share_not_determinable')).toHaveLength(1)
  })
})

describe('Gleich bezeichnete Belege', () => {
  function withChimneySweep(descriptions: (string | null)[]): AppDataFile {
    const data = validData()
    data.billingData.costCategories.push({
      id: 'chimney',
      billingPeriodId: 'period-1',
      kind: 'operating',
      label: 'Schornsteinfeger',
      allocationKey: 'usable_area',
    })
    descriptions.forEach((description, index) =>
      data.billingData.costEntries.push({
        id: `chimney-${index}`,
        costCategoryId: 'chimney',
        date: '2025-11-24',
        description,
        amountCents: index === 0 ? 6_614 : 9_038,
        receiptReference: `BELEG-${index}`,
        externalPayment: { confirmed: true, reason: 'Fiktiver Testfall' },
      }),
    )
    return data
  }

  it('weist auf gleich bezeichnete Belege am selben Tag hin', () => {
    const [warning] = find(
      withChimneySweep(['Kaminkehrer Muster', ' kaminkehrer  muster ']),
      'costs.entry_ambiguous',
    )
    expect(warning).toMatchObject({
      severity: 'warning',
      area: 'costs',
      entity: { type: 'CostEntry', id: 'chimney-0' },
    })
    expect(warning!.detail).toContain(
      'Schornsteinfeger: 2 Belege vom 24.11.2025 mit der Bezeichnung „Kaminkehrer Muster“ (66,14 €, 90,38 €)',
    )
  })

  it('meldet Belege ohne Beschreibung', () => {
    const [warning] = find(
      withChimneySweep([null, '']),
      'costs.entry_ambiguous',
    )
    expect(warning!.detail).toContain('„ohne Beschreibung“')
  })

  it('akzeptiert eindeutig bezeichnete Belege', () => {
    expect(
      find(
        withChimneySweep(['Emissionsmessung', 'Kehrarbeiten']),
        'costs.entry_ambiguous',
      ),
    ).toEqual([])
  })
})

describe('§ 6a Abs. 3 Nr. 1c HeizKV – Entgelte der Verbrauchserfassung', () => {
  const circuitData = (category?: Partial<CostCategory>) => {
    const data = mixedCircuit([heatPumpInvoice()])
    if (category)
      data.billingData.costCategories.push({
        id: 'fee',
        billingPeriodId: 'period-1',
        kind: 'heating',
        label: 'Dienstleister',
        scope: { kind: 'building', buildingId: 'building-1' },
        totalAmountCents: 12_000,
        ...category,
      })
    return data
  }

  it('meldet fehlende Entgelte je Heizkreis', () => {
    const [warning] = find(circuitData(), 'heating.metering_fee_not_identified')
    expect(warning).toMatchObject({
      severity: 'warning',
      entity: { type: 'HeatingCircuit', id: 'circuit-1' },
    })
    expect(
      find(
        circuitData({ meteringFee: false, label: 'Messdienst' }),
        'heating.metering_fee_not_identified',
      ),
    ).toHaveLength(1)
  })

  it('schweigt bei gekennzeichneter oder erkannter Kostenart', () => {
    expect(
      find(
        circuitData({ meteringFee: true }),
        'heating.metering_fee_not_identified',
      ),
    ).toEqual([])
    expect(
      find(
        circuitData({ label: 'Heizkostenabrechnung' }),
        'heating.metering_fee_not_identified',
      ),
    ).toEqual([])
  })
})
