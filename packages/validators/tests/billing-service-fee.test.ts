import { describe, expect, it } from 'vitest'
import type { AppDataFile, CostCategory, CostEntry } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const find = (data: AppDataFile, code: string) =>
  validateBillingPeriod(data, 'period-1').issues.filter(
    (issue) => issue.code === code,
  )

function category(id: string, patch: Partial<CostCategory>): CostCategory {
  return {
    id,
    billingPeriodId: 'period-1',
    kind: 'heating',
    label: 'Erstellung Heizkostenabrechnung',
    scope: { kind: 'building', buildingId: 'building-1' },
    ...patch,
  }
}

/** Fiktiver Heizkreis mit Abrechnungsdienstleistungen (ADR-0015). */
function circuitWith(
  categories: CostCategory[],
  entries: CostEntry[],
): AppDataFile {
  const data = validData()
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
  })
  data.billingData.costCategories.push(...categories)
  data.billingData.costEntries.push(...entries)
  return data
}

describe('Abrechnungsdienstleistung Heizkosten (ADR-0015)', () => {
  it('meldet zwei Abrechnungsdienstleistungen im selben Heizkreis', () => {
    const data = circuitWith(
      [
        category('fee-a', { meteringFeeKind: 'billing_service' }),
        category('fee-b', { label: 'Heizkostenabrechnung Messdienst' }),
        category('rental', {
          label: 'Gerätemiete Wärmezähler',
          meteringFeeKind: 'device_rental',
        }),
      ],
      [
        { id: 'e-a', costCategoryId: 'fee-a', amountCents: 47_600 },
        { id: 'e-b', costCategoryId: 'fee-b', amountCents: 20_000 },
        { id: 'e-r', costCategoryId: 'rental', amountCents: 9_000 },
      ],
    )
    const issues = find(data, 'heating.billing_service_duplicate')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('warning')
    expect(issues[0]?.detail).toContain('Erstellung Heizkostenabrechnung')
    expect(issues[0]?.detail).toContain('Heizkostenabrechnung Messdienst')
    expect(issues[0]?.detail).not.toContain('Gerätemiete Wärmezähler')
  })

  it('meldet nichts bei einer Abrechnungsdienstleistung neben Gerätemiete und Ablesung', () => {
    const data = circuitWith(
      [
        category('fee-a', { meteringFeeKind: 'billing_service' }),
        category('rental', {
          label: 'Gerätemiete',
          meteringFeeKind: 'device_rental',
        }),
        category('reading', { label: 'Ablesung', meteringFeeKind: 'reading' }),
        category('empty', { label: 'Heizkostenabrechnung alt' }),
      ],
      [
        { id: 'e-a', costCategoryId: 'fee-a', amountCents: 47_600 },
        { id: 'e-r', costCategoryId: 'rental', amountCents: 9_000 },
        { id: 'e-l', costCategoryId: 'reading', amountCents: 3_000 },
      ],
    )
    expect(find(data, 'heating.billing_service_duplicate')).toEqual([])
  })

  it('gleicht Netto und Umsatzsteuer der Rechnung mit dem Belegbetrag ab', () => {
    const data = circuitWith(
      [category('fee-a', { meteringFeeKind: 'billing_service' })],
      [
        {
          id: 'ok',
          costCategoryId: 'fee-a',
          amountCents: 47_600,
          invoice: { netCents: 40_000, vatCents: 7_600, vatRatePercent: 19 },
        },
        {
          id: 'sum-wrong',
          costCategoryId: 'fee-a',
          amountCents: 47_600,
          invoice: { netCents: 40_000, vatCents: 7_000 },
        },
        {
          id: 'rate-wrong',
          costCategoryId: 'fee-a',
          amountCents: 42_800,
          invoice: { netCents: 40_000, vatCents: 2_800, vatRatePercent: 19 },
        },
        {
          id: 'net-only',
          costCategoryId: 'fee-a',
          amountCents: 47_600,
          invoice: { netCents: 40_000 },
        },
      ],
    )
    const issues = find(data, 'costs.invoice_amount_mismatch')
    expect(issues.map((i) => i.entity?.id)).toEqual(['rate-wrong', 'sum-wrong'])
    expect(issues.every((i) => i.severity === 'warning')).toBe(true)
  })
})
