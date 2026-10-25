/**
 * Entgelt für die Erstellung der Heiz-/Warmwasserkostenabrechnung durch einen
 * Abrechnungsdienstleister (ADR-0015). Grundlage ist das fiktive
 * Beispielobjekt (`docs/beispiel/beispielobjekt.json`): Haus Nord (B1) mit
 * Nutzerwechsel und Leerstand, Haus Süd (B2) mit Auszug und Leerstand, beide
 * mit zentralem Warmwasser.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appDataFileSchema,
  type AppDataFile,
  type CostCategory,
  type CostEntry,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  billingServiceFeePreview,
  billingServiceFeeQuote,
  billingServiceStatementIds,
  calculateBilling,
  createCalculationInput,
  isBillingServiceCategory,
} from '../src'

const SAMPLE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../docs/beispiel/beispielobjekt.json',
)

function sample(): AppDataFile {
  return appDataFileSchema.parse(JSON.parse(readFileSync(SAMPLE, 'utf8')))
}

const TARIFF = { netPerStatementCents: 4_000, vatRatePercent: 19 }

function feeCategory(
  buildingId: string,
  patch: Partial<CostCategory> = {},
): CostCategory {
  return {
    id: `k-fee-${buildingId}`,
    billingPeriodId: 'bp-1',
    kind: 'heating',
    label: `Heizkostenabrechnung Dienstleister ${buildingId}`,
    statementText: 'Erstellung der Heiz-/Warmwasserkostenabrechnung',
    scope: { kind: 'building', buildingId },
    meteringFee: true,
    meteringFeeKind: 'billing_service',
    ...patch,
  }
}

function feeEntry(buildingId: string, amountCents: number): CostEntry {
  return {
    id: `ce-fee-${buildingId}`,
    costCategoryId: `k-fee-${buildingId}`,
    amountCents,
    description: 'Erstellung Heiz-/Warmwasserkostenabrechnung 2025',
    receiptReference: 'Fiktive Rechnung 0001',
    invoice: {
      invoiceNumber: 'F-0001',
      invoiceDate: '2026-03-01',
      servicePeriodStart: '2026-02-01',
      servicePeriodEnd: '2026-02-28',
      netCents: Math.round(amountCents / 1.19),
      vatCents: amountCents - Math.round(amountCents / 1.19),
      vatRatePercent: 19,
    },
  }
}

/** Beispielobjekt ohne Messdienst, mit Abrechnungsentgelt je Haus. */
function withFee(amountB1: number, amountB2: number): AppDataFile {
  const file = sample()
  const messdienst = new Set(
    file.billingData.costCategories
      .filter(({ label }) => label.startsWith('Messdienst'))
      .map(({ id }) => id),
  )
  file.billingData.costCategories = [
    ...file.billingData.costCategories.filter(({ id }) => !messdienst.has(id)),
    feeCategory('B1'),
    feeCategory('B2'),
  ]
  file.billingData.costEntries = [
    ...file.billingData.costEntries.filter(
      ({ costCategoryId }) => !messdienst.has(costCategoryId),
    ),
    feeEntry('B1', amountB1),
    feeEntry('B2', amountB2),
  ]
  return appDataFileSchema.parse(file)
}

describe('Kalkulationshilfe Abrechnungsentgelt', () => {
  it('rechnet Netto je Heizkostenabrechnung, Umsatzsteuer auf die Nettosumme und Brutto', () => {
    expect(billingServiceFeeQuote(6, TARIFF)).toEqual({
      statementCount: 6,
      netPerStatementCents: 4_000,
      vatRatePercent: 19,
      netCents: 24_000,
      vatCents: 4_560,
      grossCents: 28_560,
    })
    expect(billingServiceFeeQuote(0, TARIFF).grossCents).toBe(0)
    expect(
      billingServiceFeeQuote(3, {
        netPerStatementCents: 3_333,
        vatRatePercent: 19,
      }).vatCents,
    ).toBe(1_900)
  })

  it('ergibt für 10 Abrechnungen à 40 € netto 476,00 € brutto', () => {
    expect(billingServiceFeeQuote(10, TARIFF)).toMatchObject({
      netCents: 40_000,
      vatCents: 7_600,
      grossCents: 47_600,
    })
    expect(billingServiceFeeQuote(1, TARIFF).grossCents).toBe(4_760)
  })

  it('lehnt ungültige Eingaben ab', () => {
    expect(() => billingServiceFeeQuote(-1, TARIFF)).toThrow()
    expect(() => billingServiceFeeQuote(1.5, TARIFF)).toThrow()
    expect(() =>
      billingServiceFeeQuote(1, {
        netPerStatementCents: -1,
        vatRatePercent: 19,
      }),
    ).toThrow()
    expect(() =>
      billingServiceFeeQuote(1, {
        netPerStatementCents: 100,
        vatRatePercent: 101,
      }),
    ).toThrow()
  })

  it('zählt je bewohnte Nutzung eine Abrechnung: Nutzerwechsel zwei, Leerstand keine', () => {
    const file = sample()
    // Haus Nord: Whg. 3 mit Nutzerwechsel (zwei Abrechnungen), Whg. 6
    // ganzjährig leer (keine Abrechnung).
    expect(billingServiceStatementIds(file, 'bp-1', 'B1')).toEqual([
      'op-n1',
      'op-n2',
      'op-n3',
      'op-n3b',
      'op-n4',
      'op-n5',
    ])
    // Haus Süd: Whg. 6 mit Auszug – eine Abrechnung, der Leerstand danach
    // keine.
    const south = billingServiceStatementIds(file, 'bp-1', 'B2')
    expect(south).toHaveLength(6)
    expect(south).toContain('op-s6')
    expect(south).not.toContain('op-s6v')
    expect(billingServiceStatementIds(file, 'other', 'B1')).toEqual([])
  })

  it('folgt Nutzerwechseln und Leerstand, nicht der Zahl der Wohnungen', () => {
    const file = sample()
    // Whg. 1 in Haus Nord wird ab Juli leer: weiterhin eine Abrechnung.
    file.billingData.occupancyPeriods = file.billingData.occupancyPeriods
      .map((occupancy) =>
        occupancy.id === 'op-n1'
          ? { ...occupancy, to: '2025-06-30' }
          : occupancy,
      )
      .concat({
        id: 'op-n1v',
        billingPeriodId: 'bp-1',
        unitId: 'u-n1',
        kind: 'vacancy',
        from: '2025-07-01',
      })
    // Whg. 6 bleibt leer; sechs Wohnungen, sechs Abrechnungen.
    expect(billingServiceStatementIds(file, 'bp-1', 'B1')).toHaveLength(6)
    // Ein weiterer Wechsel in Whg. 2 ergibt eine zusätzliche Abrechnung.
    file.billingData.occupancyPeriods = file.billingData.occupancyPeriods
      .map((occupancy) =>
        occupancy.id === 'op-n2'
          ? { ...occupancy, to: '2025-03-31' }
          : occupancy,
      )
      .concat({
        id: 'op-n2b',
        billingPeriodId: 'bp-1',
        unitId: 'u-n2',
        kind: 'tenant',
        from: '2025-04-01',
      })
    expect(billingServiceStatementIds(file, 'bp-1', 'B1')).toHaveLength(7)
  })
})

describe('Erkennung der Abrechnungsdienstleistung', () => {
  it('folgt der Art des Entgelts, sonst Schlagworten', () => {
    expect(isBillingServiceCategory(feeCategory('B1'))).toBe(true)
    for (const meteringFeeKind of [
      'reading',
      'device_rental',
      'calibration',
      'other',
    ] as const)
      expect(
        isBillingServiceCategory(feeCategory('B1', { meteringFeeKind })),
      ).toBe(false)
    const unflagged = { meteringFee: null, meteringFeeKind: null }
    expect(
      isBillingServiceCategory(
        feeCategory('B1', { ...unflagged, label: 'Heizkostenabrechnung' }),
      ),
    ).toBe(true)
    expect(
      isBillingServiceCategory(
        feeCategory('B1', {
          ...unflagged,
          label: 'Messdienst',
          statementText: 'Verbrauchserfassung und Abrechnung',
        }),
      ),
    ).toBe(true)
    expect(
      isBillingServiceCategory(
        feeCategory('B1', {
          ...unflagged,
          label: 'Gerätemiete Wärmezähler',
          statementText: null,
        }),
      ),
    ).toBe(false)
    expect(
      isBillingServiceCategory(
        feeCategory('B1', {
          ...unflagged,
          label: 'Erwerberabrechnung Heizung',
          statementText: null,
        }),
      ),
    ).toBe(false)
    expect(
      isBillingServiceCategory(
        feeCategory('B1', { meteringFee: false, meteringFeeKind: null }),
      ),
    ).toBe(false)
    expect(
      isBillingServiceCategory(feeCategory('B1', { kind: 'operating' })),
    ).toBe(false)
  })
})

describe('Vorschau Abrechnungsentgelt je Abrechnungseinheit', () => {
  it('stellt Kalkulationshilfe, erfasste Rechnung und Abweichung gegenüber', () => {
    const preview = billingServiceFeePreview(withFee(28_560, 33_320), 'bp-1', {
      tariff: TARIFF,
    })
    const [north, south] = preview.buildings
    expect(north).toMatchObject({
      buildingId: 'B1',
      statementCount: 6,
      quote: { grossCents: 28_560, netCents: 24_000, vatCents: 4_560 },
      recordedCents: 28_560,
      differenceCents: 0,
      duplicate: false,
    })
    expect(north?.entries[0]).toMatchObject({
      invoiceNumber: 'F-0001',
      invoiceDate: '2026-03-01',
      servicePeriodStart: '2026-02-01',
      netCents: 24_000,
      vatCents: 4_560,
      grossCents: 28_560,
    })
    expect(south).toMatchObject({
      buildingId: 'B2',
      statementCount: 6,
      recordedCents: 33_320,
      differenceCents: 4_760,
    })
    expect(preview.totals).toEqual({
      statementCount: 12,
      quoteGrossCents: 57_120,
      recordedCents: 61_880,
      differenceCents: 4_760,
    })
  })

  it('verteilt über den Heiztopf: Heizung und Warmwasser getrennt, Leerstand beim Vermieter', () => {
    const preview = billingServiceFeePreview(withFee(28_560, 28_560), 'bp-1', {
      tariff: TARIFF,
    })
    for (const building of preview.buildings) {
      const split = building.allocation
      expect(split.heatingCents + split.hotWaterCents).toBe(28_560)
      // Zentrales Warmwasser: Anteil nach § 9 Abs. 1 HeizKV.
      expect(split.hotWaterCents).toBeGreaterThan(0)
      expect(split.heatingCents).toBeGreaterThan(split.hotWaterCents)
    }
    const impact = preview.impact
    const tenants = impact.occupancies.filter(({ isVacancy }) => !isVacancy)
    const vacancies = impact.occupancies.filter(({ isVacancy }) => isVacancy)
    expect(tenants.length).toBeGreaterThan(0)
    expect(vacancies.length).toBeGreaterThan(0)
    // Keine Pauschale je Mieter: die Beträge unterscheiden sich.
    expect(
      tenants.some(({ deltaCents }) => deltaCents !== tenants[0]?.deltaCents),
    ).toBe(true)
    expect(vacancies.every(({ deltaCents }) => deltaCents > 0)).toBe(true)
    // Vollständig verteilt: Mieter + Vermieter = Entgelt.
    expect(impact.tenantDeltaCents + impact.landlordDeltaCents).toBe(57_120)
    expect(impact.landlordDeltaCents).toBeGreaterThan(0)
    // Energie, CO₂ und CO₂-Aufteilung bleiben unverändert.
    expect(impact.co2Unchanged).toBe(true)
    expect(impact.energyUnchanged).toBe(true)
  })

  it('ändert Energieverbrauch und CO₂-Kosten der Berechnung nicht', () => {
    const base = sample()
    const fee = withFee(28_560, 28_560)
    const before = calculateBilling(createCalculationInput(base, 'bp-1'))
    const after = calculateBilling(createCalculationInput(fee, 'bp-1'))
    const co2 = (result: typeof before) =>
      result.heating.perCircuit.map(
        ({
          co2CostCents,
          co2TenantCents,
          co2LandlordCents,
          co2Kg,
          energyKwh,
        }) => ({
          co2CostCents,
          co2TenantCents,
          co2LandlordCents,
          co2Kg,
          energyKwh,
        }),
      )
    expect(co2(after)).toEqual(co2(before))
  })

  it('meldet Doppelansätze und trennt Gerätemiete und Ablesung', () => {
    const file = withFee(28_560, 28_560)
    file.billingData.costCategories.push(
      feeCategory('B1', {
        id: 'k-messdienst-alt',
        label: 'Messdienst Abrechnung',
        meteringFeeKind: 'billing_service',
      }),
      feeCategory('B2', {
        id: 'k-geraetemiete',
        label: 'Gerätemiete Wärmezähler',
        meteringFeeKind: 'device_rental',
      }),
      feeCategory('B2', {
        id: 'k-ablesung',
        label: 'Ablesung',
        meteringFeeKind: 'reading',
      }),
    )
    file.billingData.costEntries.push(
      { id: 'e-alt', costCategoryId: 'k-messdienst-alt', amountCents: 10_000 },
      { id: 'e-miete', costCategoryId: 'k-geraetemiete', amountCents: 5_000 },
      { id: 'e-ablesung', costCategoryId: 'k-ablesung', amountCents: 3_000 },
    )
    const preview = billingServiceFeePreview(file, 'bp-1', { tariff: TARIFF })
    const [north, south] = preview.buildings
    expect(north?.duplicate).toBe(true)
    expect(north?.categories.map(({ id }) => id)).toEqual([
      'k-fee-B1',
      'k-messdienst-alt',
    ])
    expect(north?.recordedCents).toBe(38_560)
    expect(south?.duplicate).toBe(false)
    expect(south?.recordedCents).toBe(28_560)
    expect(south?.otherMeteringFees).toEqual([
      { id: 'k-geraetemiete', kind: 'device_rental', amountCents: 5_000 },
      { id: 'k-ablesung', kind: 'reading', amountCents: 3_000 },
    ])
  })

  it('kommt ohne Tarif und ohne erfasste Rechnung aus', () => {
    const preview = billingServiceFeePreview(sample(), 'bp-1')
    // Der Messdienst des Beispielobjekts ist an „Abrechnung“ erkennbar.
    expect(preview.buildings.map((b) => b.quote)).toEqual([null, null])
    expect(preview.buildings.map((b) => b.differenceCents)).toEqual([
      null,
      null,
    ])
    expect(preview.buildings[0]?.recordedCents).toBe(61_200)
    expect(() => billingServiceFeePreview(sample(), 'missing')).toThrow()
  })
})
