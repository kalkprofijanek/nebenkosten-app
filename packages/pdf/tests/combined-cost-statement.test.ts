import { describe, expect, it } from 'vitest'
import { buildCombinedCostStatement } from '../src/combined-cost-statement'
import { buildFixtureAppData, buildFixtureCombinedContext } from './fixture'

describe('buildCombinedCostStatement', () => {
  it('baut ein vollständiges TDocumentDefinitions-Objekt mit Kontrollsumme', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureCombinedContext(appData)

    const doc = buildCombinedCostStatement(context)

    expect(doc.pageSize).toBe('A4')
    const serialized = JSON.stringify(doc.content)
    expect(serialized).toContain('Kontrollsumme')
    expect(serialized).toContain(String(context.billingPeriod.year))
  })

  it('listet jede Mietereinheit in der Salden-Tabelle', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureCombinedContext(appData)
    const tenantCount = context.occupancyPeriods.filter(
      (occupancy) => occupancy.kind === 'tenant',
    ).length

    const doc = buildCombinedCostStatement(context)
    const serialized = JSON.stringify(doc.content)

    for (const occupancy of context.occupancyPeriods) {
      if (occupancy.kind !== 'tenant') continue
      const unit = context.units.find(({ id }) => id === occupancy.unitId)
      if (unit?.label) expect(serialized).toContain(unit.label)
    }
    expect(tenantCount).toBeGreaterThan(0)
  })

  it('summiert Kostenarten mit erfassten Belegen statt der Kostenart-Gesamtsumme', () => {
    const appData = buildFixtureAppData()
    const category = appData.billingData.costCategories[0]!
    appData.billingData.costEntries = [
      { id: 'entry-1', costCategoryId: category.id, amountCents: 12_345 },
      { id: 'entry-2', costCategoryId: category.id, amountCents: 100 },
    ]
    const context = buildFixtureCombinedContext(appData)

    const doc = buildCombinedCostStatement(context)

    expect(JSON.stringify(doc.content)).toContain('124,45')
  })

  it('markiert eine Kontrolldifferenz über 1 Cent als Fehler', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureCombinedContext(appData)
    const patchedContext = {
      ...context,
      calculation: {
        ...context.calculation,
        totals: { ...context.calculation.totals, controlDifferenceCents: 250 },
      },
    }

    const doc = buildCombinedCostStatement(patchedContext)

    const controlLine = (
      doc.content as unknown as Record<string, unknown>[]
    ).find(
      (item) =>
        typeof item.text === 'string' && item.text.includes('Kontrollsumme'),
    ) as { color?: string } | undefined
    expect(controlLine?.color).toBe('#a11919')
  })

  it('führt negative Kostenkorrekturen in der Gesamtabrechnung auf', () => {
    const appData = buildFixtureAppData()
    const category = appData.billingData.costCategories[0]!
    appData.billingData.costEntries = [
      {
        id: 'negative-correction',
        costCategoryId: category.id,
        amountCents: -100,
      },
    ]
    const context = buildFixtureCombinedContext(appData)

    const doc = buildCombinedCostStatement(context)

    expect(JSON.stringify(doc.content)).toContain('-1,00')
  })

  it('summiert Nachzahlungen, Guthaben und den Mietersaldo', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureCombinedContext(appData)
    const tenants = context.occupancyPeriods.filter(
      (occupancy) => occupancy.kind === 'tenant',
    )
    const balances = tenants.map(
      (occupancy) =>
        context.calculation.tenants.find(({ id }) => id === occupancy.id)
          ?.balanceCents ?? 0,
    )
    const due = balances.filter((cents) => cents > 0)

    const serialized = JSON.stringify(
      buildCombinedCostStatement(context).content,
    )

    expect(serialized).toContain(`Nachzahlungen (${due.length} Mieter)`)
    expect(serialized).toContain('Saldo aller Mieter')
    expect(serialized).toContain('Summe Mieter')
    expect(serialized).toContain('Leerstandskosten (Vermieter)')
    expect(serialized).toContain('Betriebskosten')
    expect(serialized).not.toContain('"operating"')
  })

  it('führt die Brennstoffkosten der Heizkreise in der Kostenliste auf', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureCombinedContext(appData)
    const fuel = context.calculation.heating.trace.circuits.reduce(
      (sum, circuit) => sum + circuit.reconciliation.fifoConsumptionCostCents,
      0,
    )

    const serialized = JSON.stringify(
      buildCombinedCostStatement(context).content,
    )

    if (fuel !== 0) expect(serialized).toContain('Brennstoff/Energie')
    else expect(serialized).not.toContain('Brennstoff/Energie')
  })
})

describe('Geschätzte Verbräuche (§ 9a HeizKV) in der Gesamtabrechnung', () => {
  function estimatedAppData(unitId = 'u1') {
    const appData = buildFixtureAppData('case-05-multiple-circuits')
    appData.billingData.occupancyPeriods =
      appData.billingData.occupancyPeriods.map((occupancy) =>
        occupancy.unitId === unitId
          ? {
              ...occupancy,
              consumptionUnitsEstimated: true,
              consumptionUnitsEstimateReason: `Heizkostenverteiler defekt, Schätzung nach Vorjahr. ${'x'.repeat(200)}`,
            }
          : occupancy,
      )
    return appData
  }

  it('listet geschätzte Nutzungen mit Flächenanteil in der internen Fassung', () => {
    const context = buildFixtureCombinedContext(estimatedAppData(), 'internal')
    const circuit = context.calculation.heating.trace.circuits.find(
      ({ buildingId }) => buildingId === 'B1',
    )!
    expect(circuit.split.estimatedAreaSharePercent).toBe(50)

    const serialized = JSON.stringify(
      buildCombinedCostStatement(context).content,
    )

    expect(serialized).toContain('Geschätzte Verbräuche (§ 9a HeizKV)')
    expect(serialized).toContain('Einheit u1')
    expect(serialized).toContain('Mieter T1')
    expect(serialized).toContain('Heizkostenverteiler defekt')
    expect(serialized).not.toContain('x'.repeat(150))
    expect(serialized).toContain(
      'Geschätzte Fläche: 50,00 m² von 100,00 m² = 50,00 % → Verteilung nach § 9a Abs. 2 HeizKV ausschließlich nach Fläche',
    )
    // Nur der Heizkreis mit Schätzung erhält die Tabelle.
    expect(
      serialized.match(/Geschätzte Verbräuche \(§ 9a HeizKV\)/g),
    ).toHaveLength(1)
  })

  it('weist bis 25 % geschätzter Fläche die verbrauchsabhängige Verteilung aus', () => {
    const appData = estimatedAppData()
    const context = buildFixtureCombinedContext(appData, 'internal')
    const circuit = context.calculation.heating.trace.circuits.find(
      ({ buildingId }) => buildingId === 'B1',
    )!
    const patched = {
      ...context,
      calculation: {
        ...context.calculation,
        heating: {
          ...context.calculation.heating,
          trace: {
            ...context.calculation.heating.trace,
            circuits: context.calculation.heating.trace.circuits.map((item) =>
              item === circuit
                ? {
                    ...item,
                    split: {
                      ...item.split,
                      estimatedAreaSharePercent: 20,
                      areaOnlySection9a: false,
                    },
                  }
                : item,
            ),
          },
        },
      },
    }

    const serialized = JSON.stringify(
      buildCombinedCostStatement(patched).content,
    )

    expect(serialized).toContain(
      '= 20,00 % → Verbrauchsabhängige Verteilung bleibt zulässig (≤ 25 %)',
    )
  })

  it('fehlt in der Fassung für Mieter', () => {
    const context = buildFixtureCombinedContext(estimatedAppData(), 'tenant')

    const serialized = JSON.stringify(
      buildCombinedCostStatement(context).content,
    )

    expect(serialized).not.toContain('Geschätzte Verbräuche')
    expect(serialized).not.toContain('Geschätzte Fläche')
  })

  it('fehlt ohne geschätzte Verbräuche', () => {
    const context = buildFixtureCombinedContext(
      buildFixtureAppData('case-05-multiple-circuits'),
      'internal',
    )

    const serialized = JSON.stringify(
      buildCombinedCostStatement(context).content,
    )

    expect(serialized).not.toContain('Geschätzte Verbräuche')
    expect(serialized).not.toContain('Geschätzte Fläche')
  })
})
