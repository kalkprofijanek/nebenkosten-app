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

  it('behält beim Bearbeiten einer Lieferung die nicht im Formular geführten Felder', () => {
    const withDelivery = addFuelDelivery(
      createHeatingContext(),
      {
        energySourceId: IDS.source,
        billingPeriodId: IDS.period,
        date: '2025-03-01',
        quantity: { value: 50, unit: 'l' },
        amountCents: 11_900,
        externalPayment: {
          confirmed: true,
          reason: 'Zahlung über Voreigentümer',
        },
        quantityManuallySet: true,
      },
      dependencies(IDS.delivery),
    )
    // Das Formular sendet nur die dort geführten Felder
    const edited = updateFuelDelivery(withDelivery, IDS.delivery, {
      energySourceId: IDS.source,
      billingPeriodId: IDS.period,
      date: '2025-03-02',
      quantity: { value: 55, unit: 'l' },
      amountCents: 11_900,
    })
    const delivery = edited.billingData.fuelDeliveries[0]!
    expect(delivery.date).toBe('2025-03-02')
    expect(delivery.externalPayment).toEqual({
      confirmed: true,
      reason: 'Zahlung über Voreigentümer',
    })
    expect(delivery.quantityManuallySet).toBe(true)

    // `null` löscht ausdrücklich
    const cleared = updateFuelDelivery(edited, IDS.delivery, {
      energySourceId: IDS.source,
      billingPeriodId: IDS.period,
      quantity: { value: 55, unit: 'l' },
      amountCents: 11_900,
      externalPayment: null,
    })
    expect(cleared.billingData.fuelDeliveries[0]?.externalPayment).toBeNull()
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

describe('Vergleichswerte am Heizkreis (§ 6a Abs. 3 Nr. 4 HeizKV)', () => {
  it('bleiben beim Bearbeiten des Heizkreises erhalten', () => {
    const context = createHeatingContext()
    const benchmark = {
      source: 'Heizspiegel für Deutschland (co2online)',
      referenceYear: 2024,
      category: 'Heizöl, fiktive Kategorie',
      includesHotWater: true,
      lowMaxKwhPerSqmYear: 70,
      mediumMaxKwhPerSqmYear: 130,
      elevatedMaxKwhPerSqmYear: 200,
    }
    const withBenchmark = {
      ...context,
      billingData: {
        ...context.billingData,
        heatingCircuits: context.billingData.heatingCircuits.map((circuit) =>
          circuit.id === IDS.circuit
            ? { ...circuit, consumptionBenchmark: benchmark }
            : circuit,
        ),
      },
    }
    const result = updateHeatingCircuit(withBenchmark, IDS.circuit, {
      billingPeriodId: IDS.period,
      heatingSystemId: IDS.system,
      buildingId: IDS.building,
      hasCentralHotWater: false,
    })
    expect(result.billingData.heatingCircuits[0]?.consumptionBenchmark).toEqual(
      benchmark,
    )
  })

  const benchmark = {
    source: 'Heizspiegel für Deutschland (co2online)',
    sourceUrl: 'https://example.org/heizspiegel',
    referenceYear: 2024,
    category: 'Erdgas, fiktive Kategorie',
    includesHotWater: true,
    lowMaxKwhPerSqmYear: 70,
    mediumMaxKwhPerSqmYear: 130,
    elevatedMaxKwhPerSqmYear: 200,
  }
  const circuitInput = {
    billingPeriodId: IDS.period,
    heatingSystemId: IDS.system,
    buildingId: IDS.building,
    hasCentralHotWater: false,
  }

  it('werden gesetzt, geändert und ausdrücklich entfernt', () => {
    const context = createHeatingContext()
    const set = updateHeatingCircuit(context, IDS.circuit, {
      ...circuitInput,
      consumptionBenchmark: benchmark,
    })
    expect(set.billingData.heatingCircuits[0]?.consumptionBenchmark).toEqual(
      benchmark,
    )
    const changed = updateHeatingCircuit(set, IDS.circuit, {
      ...circuitInput,
      consumptionBenchmark: { ...benchmark, elevatedMaxKwhPerSqmYear: 210 },
    })
    expect(
      changed.billingData.heatingCircuits[0]?.consumptionBenchmark
        ?.elevatedMaxKwhPerSqmYear,
    ).toBe(210)
    const kept = updateHeatingCircuit(changed, IDS.circuit, {
      ...circuitInput,
      consumptionBenchmark: undefined,
    })
    expect(
      kept.billingData.heatingCircuits[0]?.consumptionBenchmark,
    ).toBeDefined()
    const removed = updateHeatingCircuit(kept, IDS.circuit, {
      ...circuitInput,
      consumptionBenchmark: null,
    })
    expect(removed.billingData.heatingCircuits[0]).not.toHaveProperty(
      'consumptionBenchmark',
    )
  })

  it('werden über das Schema geprüft', () => {
    const context = createHeatingContext()
    expect(() =>
      updateHeatingCircuit(context, IDS.circuit, {
        ...circuitInput,
        consumptionBenchmark: { ...benchmark, mediumMaxKwhPerSqmYear: 60 },
      }),
    ).toThrowError(HeatingCommandError)
  })
})

describe('Warmwasser am Heizkreis (§§ 8, 9 HeizKV, ADR-0010)', () => {
  const hotWaterInput = {
    billingPeriodId: IDS.period,
    heatingSystemId: IDS.system,
    buildingId: IDS.building,
    hasCentralHotWater: true,
  }
  const energy = {
    method: 'volume_formula' as const,
    volumeM3: 120,
    temperatureC: 55,
    temperatureEstimated: true,
  }

  it('speichert Wärmemenge und Verteilung ohne Pauschalanteil', () => {
    const result = updateHeatingCircuit(createHeatingContext(), IDS.circuit, {
      ...hotWaterInput,
      hotWaterEnergy: energy,
      hotWaterAllocation: { key: 'area' },
    })
    const circuit = result.billingData.heatingCircuits[0]!
    expect(circuit.hotWaterEnergy).toEqual(energy)
    expect(circuit.hotWaterAllocation).toEqual({ key: 'area' })
    expect(circuit).not.toHaveProperty('hotWaterSharePercent')
  })

  it('verlangt ohne Wärmemenge weiterhin den Warmwasseranteil', () => {
    expect(() =>
      updateHeatingCircuit(createHeatingContext(), IDS.circuit, hotWaterInput),
    ).toThrowError('Der Warmwasseranteil muss zwischen 18 und 70 Prozent')
    expect(() =>
      updateHeatingCircuit(createHeatingContext(), IDS.circuit, {
        ...hotWaterInput,
        hotWaterEnergy: { method: 'heat_meter', heatKwh: 1000 },
        hotWaterSharePercent: 80,
      }),
    ).toThrowError(HeatingCommandError)
  })

  it('erhält, ersetzt und entfernt die Angaben wie die Vergleichswerte', () => {
    const set = updateHeatingCircuit(createHeatingContext(), IDS.circuit, {
      ...hotWaterInput,
      hotWaterEnergy: energy,
      hotWaterAllocation: { key: 'consumption', consumptionSharePercent: 60 },
    })
    const kept = updateHeatingCircuit(set, IDS.circuit, hotWaterInput)
    expect(kept.billingData.heatingCircuits[0]?.hotWaterEnergy).toEqual(energy)
    expect(kept.billingData.heatingCircuits[0]?.hotWaterAllocation).toEqual({
      key: 'consumption',
      consumptionSharePercent: 60,
    })
    const removed = updateHeatingCircuit(kept, IDS.circuit, {
      ...hotWaterInput,
      hotWaterSharePercent: 20,
      hotWaterEnergy: null,
      hotWaterAllocation: null,
    })
    expect(removed.billingData.heatingCircuits[0]).not.toHaveProperty(
      'hotWaterEnergy',
    )
    expect(removed.billingData.heatingCircuits[0]).not.toHaveProperty(
      'hotWaterAllocation',
    )
    const withoutCentral = updateHeatingCircuit(set, IDS.circuit, {
      ...hotWaterInput,
      hasCentralHotWater: false,
    })
    expect(withoutCentral.billingData.heatingCircuits[0]).not.toHaveProperty(
      'hotWaterEnergy',
    )
  })

  it('lehnt Warmwasser-Angaben ohne zentrale Warmwasserbereitung und ungültige Werte ab', () => {
    const withSystem = addHeatingSystem(
      createBaseFile(),
      { propertyId: IDS.property, name: 'Zentralheizung' },
      dependencies(IDS.system),
    )
    expect(() =>
      addHeatingCircuit(
        withSystem,
        {
          ...hotWaterInput,
          hasCentralHotWater: false,
          hotWaterAllocation: { key: 'area' },
        },
        dependencies(IDS.circuit),
      ),
    ).toThrowError('nur bei zentraler Warmwasserbereitung')
    expect(() =>
      addHeatingCircuit(
        withSystem,
        {
          ...hotWaterInput,
          hotWaterEnergy: { method: 'area_formula', reason: ' ' },
        },
        dependencies(IDS.circuit),
      ),
    ).toThrowError(HeatingCommandError)
    const created = addHeatingCircuit(
      withSystem,
      {
        ...hotWaterInput,
        hotWaterEnergy: {
          method: 'area_formula',
          reason: 'Kein Zähler, Volumen nicht messbar',
        },
        hotWaterAllocation: null,
      },
      dependencies(IDS.circuit),
    )
    expect(created.billingData.heatingCircuits[0]).not.toHaveProperty(
      'hotWaterAllocation',
    )
  })
})

describe('Wärmepumpe am Heizkreis (ADR-0010 „Wärmepumpen“)', () => {
  const circuitInput = {
    billingPeriodId: IDS.period,
    heatingSystemId: IDS.system,
    buildingId: IDS.building,
    hasCentralHotWater: true,
    hotWaterEnergy: { method: 'heat_meter' as const, heatKwh: 12_800 },
  }

  it('erhält, setzt und entfernt die erzeugte Wärme', () => {
    const set = updateHeatingCircuit(createHeatingContext(), IDS.circuit, {
      ...circuitInput,
      generatedHeatKwh: 68_800,
    })
    expect(set.billingData.heatingCircuits[0]?.generatedHeatKwh).toBe(68_800)
    const kept = updateHeatingCircuit(set, IDS.circuit, circuitInput)
    expect(kept.billingData.heatingCircuits[0]?.generatedHeatKwh).toBe(68_800)
    const removed = updateHeatingCircuit(kept, IDS.circuit, {
      ...circuitInput,
      generatedHeatKwh: null,
    })
    expect(removed.billingData.heatingCircuits[0]).not.toHaveProperty(
      'generatedHeatKwh',
    )
  })

  it('lässt die Jahresarbeitszahl nur bei Strom zu', () => {
    const context = createHeatingContext()
    expect(() =>
      updateEnergySource(context, IDS.source, {
        heatingCircuitId: IDS.circuit,
        key: 'haupt',
        name: 'Heizöl',
        sourceType: 'Heizöl',
        seasonalPerformanceFactor: 3,
      }),
    ).toThrowError('Jahresarbeitszahl')
    const heatPump = updateEnergySource(context, IDS.source, {
      heatingCircuitId: IDS.circuit,
      key: 'wp',
      name: 'Wärmepumpenstrom',
      sourceType: 'Strom',
      calorificValueKwhPerUnit: 1,
      seasonalPerformanceFactor: 3.2,
    })
    expect(
      heatPump.billingData.energySources[0]?.seasonalPerformanceFactor,
    ).toBe(3.2)
    const estimate = {
      heatingCircuitId: IDS.circuit,
      key: 'wp',
      name: 'Wärmepumpenstrom',
      sourceType: 'Strom',
      seasonalPerformanceFactor: 3,
      seasonalPerformanceFactorEstimated: true,
    }
    expect(() =>
      updateEnergySource(heatPump, IDS.source, estimate),
    ).toThrowError('Grundlage der geschätzten Jahresarbeitszahl')
    const estimated = updateEnergySource(heatPump, IDS.source, {
      ...estimate,
      seasonalPerformanceFactorReason: ' Planungswert (fiktiv) ',
    })
    expect(estimated.billingData.energySources[0]).toMatchObject({
      seasonalPerformanceFactorEstimated: true,
      seasonalPerformanceFactorReason: 'Planungswert (fiktiv)',
    })
    const withoutFactor = updateEnergySource(heatPump, IDS.source, {
      heatingCircuitId: IDS.circuit,
      key: 'wp',
      name: 'Wärmepumpenstrom',
      sourceType: 'Strom',
      seasonalPerformanceFactor: null,
    })
    expect(withoutFactor.billingData.energySources[0]).not.toHaveProperty(
      'seasonalPerformanceFactor',
    )
  })
})
