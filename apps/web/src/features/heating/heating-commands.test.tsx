import { encodeCurrentAppData } from '@nebenkosten/import-export'
import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it, vi } from 'vitest'
import {
  addEnergySource,
  addFuelDelivery,
  addFuelStock,
  addHeatingCircuit,
  addHeatingSystem,
  deleteEnergySource,
  deleteFuelDelivery,
  deleteFuelStock,
  deleteHeatingCircuit,
  deleteHeatingSystem,
  HeatingCommandError,
  updateEnergySource,
  updateFuelDelivery,
  updateFuelStock,
  updateHeatingCircuit,
  updateHeatingSystem,
  type HeatingCommandDependencies,
} from './heating-commands'

const IDS = {
  organization: '10000000-0000-4000-8000-000000000001',
  company: '10000000-0000-4000-8000-000000000002',
  property: '10000000-0000-4000-8000-000000000003',
  otherProperty: '10000000-0000-4000-8000-000000000004',
  building: '10000000-0000-4000-8000-000000000005',
  otherBuilding: '10000000-0000-4000-8000-000000000006',
  period: '10000000-0000-4000-8000-000000000007',
  otherPeriod: '10000000-0000-4000-8000-000000000008',
  system: '20000000-0000-4000-8000-000000000001',
  circuit: '20000000-0000-4000-8000-000000000002',
  source: '20000000-0000-4000-8000-000000000003',
  stock: '20000000-0000-4000-8000-000000000004',
  delivery: '20000000-0000-4000-8000-000000000005',
  meter: '20000000-0000-4000-8000-000000000006',
  booking: '20000000-0000-4000-8000-000000000007',
} as const

function createBaseFile(): AppDataFile {
  const file = createEmptyAppDataFile()
  return {
    ...file,
    masterData: {
      ...file.masterData,
      organizations: [{ id: IDS.organization, name: 'Testverwaltung' }],
      ownerCompanies: [
        {
          id: IDS.company,
          organizationId: IDS.organization,
          name: 'Testgesellschaft',
          additionalNameLines: [],
        },
      ],
      properties: [
        { id: IDS.property, ownerCompanyId: IDS.company },
        { id: IDS.otherProperty, ownerCompanyId: IDS.company },
      ],
      buildings: [
        {
          id: IDS.building,
          propertyId: IDS.property,
          name: 'Haus A',
          mandateRefPrefixes: [],
        },
        {
          id: IDS.otherBuilding,
          propertyId: IDS.otherProperty,
          name: 'Haus B',
          mandateRefPrefixes: [],
        },
      ],
    },
    billingData: {
      ...file.billingData,
      billingPeriods: [
        {
          id: IDS.period,
          propertyId: IDS.property,
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
        },
        {
          id: IDS.otherPeriod,
          propertyId: IDS.otherProperty,
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
        },
      ],
    },
  }
}

function dependencies(...ids: string[]): HeatingCommandDependencies {
  let index = 0
  return {
    createId: vi.fn(() => ids[index++] ?? 'missing-test-id'),
  }
}

function createHeatingContext(): AppDataFile {
  const withSystem = addHeatingSystem(
    createBaseFile(),
    { propertyId: IDS.property, name: 'Zentralheizung' },
    dependencies(IDS.system),
  )
  const withCircuit = addHeatingCircuit(
    withSystem,
    {
      billingPeriodId: IDS.period,
      heatingSystemId: IDS.system,
      buildingId: IDS.building,
      hasCentralHotWater: true,
      hotWaterSharePercent: 20,
      overrides: {
        consumptionSharePercent: 70,
        baseSharePercent: 30,
        operatingElectricitySharePercent: 3,
      },
      co2: { mode: 'auto', co2FactorKgPerKwh: 0.2 },
    },
    dependencies(IDS.circuit),
  )
  return addEnergySource(
    withCircuit,
    {
      heatingCircuitId: IDS.circuit,
      key: 'haupt',
      name: 'Heizöl',
      sourceType: 'Heizöl',
      calorificValueKwhPerUnit: 10.4,
      co2FactorKgPerKwh: 0.266,
    },
    dependencies(IDS.source),
  )
}

describe('heating commands', () => {
  it('builds the complete heating and fuel flow immutably with injected IDs', async () => {
    const original = createBaseFile()
    const originalSnapshot = structuredClone(original)
    const withSystem = addHeatingSystem(
      original,
      { propertyId: IDS.property, name: 'Zentralheizung' },
      dependencies(IDS.system),
    )
    const withCircuit = addHeatingCircuit(
      withSystem,
      {
        billingPeriodId: IDS.period,
        heatingSystemId: IDS.system,
        buildingId: IDS.building,
        hasCentralHotWater: false,
      },
      dependencies(IDS.circuit),
    )
    const withSource = addEnergySource(
      withCircuit,
      {
        heatingCircuitId: IDS.circuit,
        key: 'haupt',
        sourceType: 'Gas',
      },
      dependencies(IDS.source),
    )
    const withStock = addFuelStock(
      withSource,
      {
        energySourceId: IDS.source,
        billingPeriodId: IDS.period,
        openingQuantity: { value: 1200.5, unit: 'kWh' },
        openingValueCents: 123_456,
        openingPricePerUnitCents: undefined,
        remainingQuantity: { value: 200, unit: 'kWh' },
      },
      dependencies(IDS.stock),
    )
    const result = addFuelDelivery(
      withStock,
      {
        energySourceId: IDS.source,
        billingPeriodId: IDS.period,
        date: '2025-06-30',
        quantity: { value: 800.25, unit: 'kWh' },
        quantityStatus: 'belegt',
        quantityManuallySet: false,
        amountCents: 81_625,
        description: 'Abschlagsrechnung',
        receiptReference: undefined,
      },
      dependencies(IDS.delivery),
    )

    expect(original).toEqual(originalSnapshot)
    expect(result.masterData.heatingSystems).toEqual([
      {
        id: IDS.system,
        propertyId: IDS.property,
        name: 'Zentralheizung',
      },
    ])
    expect(result.billingData.heatingCircuits[0]).toMatchObject({
      id: IDS.circuit,
      billingPeriodId: IDS.period,
      heatingSystemId: IDS.system,
      buildingId: IDS.building,
    })
    expect(result.billingData.energySources[0]?.id).toBe(IDS.source)
    expect(result.billingData.fuelStocks[0]).toMatchObject({
      id: IDS.stock,
      openingValueCents: 123_456,
      openingQuantity: { value: 1200.5, unit: 'kWh' },
    })
    expect(result.billingData.fuelDeliveries[0]).toMatchObject({
      id: IDS.delivery,
      amountCents: 81_625,
      quantity: { value: 800.25, unit: 'kWh' },
    })
    await expect(
      encodeCurrentAppData(result, {
        savedAt: new Date('2026-12-31T12:00:00.000Z'),
      }),
    ).resolves.toBeDefined()
  })

  it('rejects an invalid source file before requesting an ID', () => {
    const createId = vi.fn(() => IDS.system)
    const invalid = { ...createBaseFile(), schemaVersion: 99 }

    expect(() =>
      addHeatingSystem(
        invalid as unknown as AppDataFile,
        { propertyId: IDS.property },
        { createId },
      ),
    ).toThrowError(HeatingCommandError)
    expect(createId).not.toHaveBeenCalled()
  })

  it('requires a valid property reference and a newly generated UUID', () => {
    expect(() =>
      addHeatingSystem(
        createBaseFile(),
        { propertyId: 'does-not-exist' },
        dependencies(IDS.system),
      ),
    ).toThrowError(/Liegenschaft/)
    expect(() =>
      addHeatingSystem(
        createBaseFile(),
        { propertyId: IDS.property },
        dependencies('legacy-new-id'),
      ),
    ).toThrowError(/UUID/)
  })

  it('rejects unknown fields and oversized user text', () => {
    expect(() =>
      addHeatingSystem(
        createBaseFile(),
        {
          propertyId: IDS.property,
          name: 'x'.repeat(201),
          unsafe: true,
        } as never,
        dependencies(IDS.system),
      ),
    ).toThrowError(HeatingCommandError)
  })

  it('keeps a circuit inside one property and enforces heating shares', () => {
    const withSystem = addHeatingSystem(
      createBaseFile(),
      { propertyId: IDS.property },
      dependencies(IDS.system),
    )

    expect(() =>
      addHeatingCircuit(
        withSystem,
        {
          billingPeriodId: IDS.otherPeriod,
          heatingSystemId: IDS.system,
          buildingId: IDS.otherBuilding,
          hasCentralHotWater: false,
        },
        dependencies(IDS.circuit),
      ),
    ).toThrowError(/gleichen Liegenschaft/)
    expect(() =>
      addHeatingCircuit(
        withSystem,
        {
          billingPeriodId: IDS.period,
          heatingSystemId: IDS.system,
          buildingId: IDS.building,
          hasCentralHotWater: true,
          hotWaterSharePercent: 10,
        },
        dependencies(IDS.circuit),
      ),
    ).toThrowError(/18 und 70/)
    expect(() =>
      addHeatingCircuit(
        withSystem,
        {
          billingPeriodId: IDS.period,
          heatingSystemId: IDS.system,
          buildingId: IDS.building,
          hasCentralHotWater: false,
          hotWaterSharePercent: 20,
        },
        dependencies(IDS.circuit),
      ),
    ).toThrowError(/Warmwasseranteil/)
    expect(() =>
      addHeatingCircuit(
        withSystem,
        {
          billingPeriodId: IDS.period,
          heatingSystemId: IDS.system,
          buildingId: IDS.building,
          hasCentralHotWater: false,
          overrides: {
            consumptionSharePercent: 60,
            baseSharePercent: 30,
          },
        },
        dependencies(IDS.circuit),
      ),
    ).toThrowError(/100/)
  })

  it('prevents duplicate circuits and duplicate source keys', () => {
    const context = createHeatingContext()

    expect(() =>
      addHeatingCircuit(
        context,
        {
          billingPeriodId: IDS.period,
          heatingSystemId: IDS.system,
          buildingId: IDS.building,
          hasCentralHotWater: false,
        },
        dependencies('20000000-0000-4000-8000-000000000010'),
      ),
    ).toThrowError(/Heizkreis/)
    expect(() =>
      addEnergySource(
        context,
        {
          heatingCircuitId: IDS.circuit,
          key: 'HAUPT',
        },
        dependencies('20000000-0000-4000-8000-000000000011'),
      ),
    ).toThrowError(/Schlüssel/)
  })

  it('validates stock quantities, period references and one stock per source', () => {
    const context = createHeatingContext()
    const stockInput = {
      energySourceId: IDS.source,
      billingPeriodId: IDS.period,
      openingQuantity: { value: 100, unit: 'l' as const },
      remainingQuantity: { value: 20, unit: 'l' as const },
      openingValueCents: 20_000,
    }
    const withStock = addFuelStock(context, stockInput, dependencies(IDS.stock))

    expect(() =>
      addFuelStock(
        context,
        { ...stockInput, billingPeriodId: IDS.otherPeriod },
        dependencies(IDS.stock),
      ),
    ).toThrowError(/Abrechnungsjahr/)
    expect(() =>
      addFuelStock(
        context,
        {
          ...stockInput,
          remainingQuantity: { value: 20, unit: 'kg' },
        },
        dependencies(IDS.stock),
      ),
    ).toThrowError(/Mengeneinheit/)
    expect(() =>
      addFuelStock(
        context,
        { ...stockInput, openingValueCents: -1 },
        dependencies(IDS.stock),
      ),
    ).toThrowError(/negativ/)
    expect(() =>
      addFuelStock(
        withStock,
        stockInput,
        dependencies('20000000-0000-4000-8000-000000000012'),
      ),
    ).toThrowError(/bereits/)
  })

  it('validates delivery dates, cents, units and optional references', () => {
    const context = createHeatingContext()
    const baseInput = {
      energySourceId: IDS.source,
      billingPeriodId: IDS.period,
      date: '2025-05-01',
      quantity: { value: 50, unit: 'l' as const },
      amountCents: 10_000,
    }
    const withStock = addFuelStock(
      context,
      {
        energySourceId: IDS.source,
        billingPeriodId: IDS.period,
        openingQuantity: { value: 100, unit: 'l' },
      },
      dependencies(IDS.stock),
    )

    expect(() =>
      addFuelDelivery(
        context,
        { ...baseInput, date: '2024-12-31' },
        dependencies(IDS.delivery),
      ),
    ).toThrowError(/zeitraum/i)
    expect(() =>
      addFuelDelivery(
        context,
        { ...baseInput, amountCents: 10.5 },
        dependencies(IDS.delivery),
      ),
    ).toThrowError(HeatingCommandError)
    expect(() =>
      addFuelDelivery(
        withStock,
        { ...baseInput, quantity: { value: 50, unit: 'kg' } },
        dependencies(IDS.delivery),
      ),
    ).toThrowError(/Mengeneinheit/)
    expect(() =>
      addFuelDelivery(
        context,
        {
          ...baseInput,
          bookingLink: { bankBookingId: IDS.booking },
          externalPayment: { confirmed: true },
        },
        dependencies(IDS.delivery),
      ),
    ).toThrowError(/gleichzeitig/)
    expect(() =>
      addFuelDelivery(
        context,
        { ...baseInput, meterId: IDS.meter },
        dependencies(IDS.delivery),
      ),
    ).toThrowError(/Zähler/)
  })

  it('bearbeitet Heizsystem, Heizkreis, Quelle, Bestand und Lieferung unveränderlich', () => {
    const context = createHeatingContext()
    const withStock = addFuelStock(
      context,
      {
        energySourceId: IDS.source,
        billingPeriodId: IDS.period,
        openingQuantity: { value: 100, unit: 'l' },
      },
      dependencies(IDS.stock),
    )
    const withDelivery = addFuelDelivery(
      withStock,
      {
        energySourceId: IDS.source,
        billingPeriodId: IDS.period,
        date: '2025-03-01',
        quantity: { value: 50, unit: 'l' },
        amountCents: 10_000,
      },
      dependencies(IDS.delivery),
    )

    let result = updateHeatingSystem(withDelivery, IDS.system, {
      propertyId: IDS.property,
      name: 'Neue Zentralheizung',
    })
    result = updateHeatingCircuit(result, IDS.circuit, {
      billingPeriodId: IDS.period,
      heatingSystemId: IDS.system,
      buildingId: IDS.building,
      hasCentralHotWater: false,
      overrides: {
        consumptionSharePercent: 60,
        baseSharePercent: 40,
      },
    })
    result = updateEnergySource(result, IDS.source, {
      heatingCircuitId: IDS.circuit,
      key: 'haupt',
      name: 'Aktualisierte Quelle',
      sourceType: 'Heizöl',
    })
    result = updateFuelStock(result, IDS.stock, {
      energySourceId: IDS.source,
      billingPeriodId: IDS.period,
      openingQuantity: { value: 120, unit: 'l' },
      remainingQuantity: { value: 15, unit: 'l' },
    })
    result = updateFuelDelivery(result, IDS.delivery, {
      energySourceId: IDS.source,
      billingPeriodId: IDS.period,
      date: '2025-03-02',
      quantity: { value: 55, unit: 'l' },
      amountCents: 11_500,
    })

    expect(withDelivery.masterData.heatingSystems[0]?.name).toBe(
      'Zentralheizung',
    )
    expect(result.masterData.heatingSystems[0]?.name).toBe(
      'Neue Zentralheizung',
    )
    expect(result.billingData.heatingCircuits[0]?.overrides).toMatchObject({
      consumptionSharePercent: 60,
      baseSharePercent: 40,
    })
    expect(result.billingData.energySources[0]?.name).toBe(
      'Aktualisierte Quelle',
    )
    expect(result.billingData.fuelStocks[0]?.remainingQuantity?.value).toBe(15)
    expect(result.billingData.fuelDeliveries[0]?.amountCents).toBe(11_500)
  })

  it('löscht Heizdaten nur ohne abhängige Datensätze', () => {
    const context = createHeatingContext()
    expect(() => deleteHeatingSystem(context, IDS.system)).toThrowError(
      /Heizkreis/,
    )
    expect(() => deleteHeatingCircuit(context, IDS.circuit)).toThrowError(
      /Energiequelle/,
    )

    const withStock = addFuelStock(
      context,
      {
        energySourceId: IDS.source,
        billingPeriodId: IDS.period,
        openingQuantity: { value: 100, unit: 'l' },
      },
      dependencies(IDS.stock),
    )
    const withDelivery = addFuelDelivery(
      withStock,
      {
        energySourceId: IDS.source,
        billingPeriodId: IDS.period,
        quantity: { value: 20, unit: 'l' },
      },
      dependencies(IDS.delivery),
    )
    expect(() => deleteEnergySource(withDelivery, IDS.source)).toThrowError(
      /Brennstoffdaten/,
    )

    const withoutDelivery = deleteFuelDelivery(withDelivery, IDS.delivery)
    const withoutStock = deleteFuelStock(withoutDelivery, IDS.stock)
    const withoutSource = deleteEnergySource(withoutStock, IDS.source)
    const withoutCircuit = deleteHeatingCircuit(withoutSource, IDS.circuit)
    const result = deleteHeatingSystem(withoutCircuit, IDS.system)
    expect(result.masterData.heatingSystems).toEqual([])
  })
})
