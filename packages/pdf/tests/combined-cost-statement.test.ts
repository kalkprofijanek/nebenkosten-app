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
})
