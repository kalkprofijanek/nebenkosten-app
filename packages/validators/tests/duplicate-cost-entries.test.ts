import { describe, expect, it } from 'vitest'
import type { AppDataFile, CostEntry } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const CODE = 'costs.entry_possible_duplicate'

function withEntries(...entries: Partial<CostEntry>[]): AppDataFile {
  const data = validData()
  data.billingData.costCategories[0]!.totalAmountCents = null
  data.billingData.costEntries = entries.map((entry, index) => ({
    id: `entry-${index + 1}`,
    costCategoryId: 'category-1',
    amountCents: 10_000,
    externalPayment: { confirmed: true, reason: 'Fiktiver Testfall' },
    ...entry,
  }))
  return data
}

function duplicates(data: AppDataFile) {
  return validateBillingPeriod(data, 'period-1').issues.filter(
    ({ code }) => code === CODE,
  )
}

describe('Hinweis auf doppelt erfasste Rechnungen', () => {
  it('meldet dieselbe Belegnummer unabhängig von Schreibweise', () => {
    const issues = duplicates(
      withEntries(
        { receiptReference: 'RE-2025/001', amountCents: 9_520 },
        { receiptReference: 're 2025 001', amountCents: 4_000 },
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      severity: 'warning',
      area: 'costs',
      entity: { type: 'CostEntry', id: 'entry-2' },
    })
    expect(issues[0]!.detail).toContain('Belegnummer')
  })

  it('meldet gleichen Betrag am gleichen Tag in derselben Kostenart', () => {
    const issues = duplicates(
      withEntries(
        { receiptReference: 'A-1', date: '2025-03-01', description: 'Wartung' },
        { receiptReference: 'A-2', date: '2025-03-01', description: 'Messung' },
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.detail).toContain('denselben Betrag und dasselbe Datum')
  })

  it('überlässt gleich bezeichnete Belege am selben Tag dem Hinweis auf Mehrdeutigkeit', () => {
    expect(
      duplicates(
        withEntries(
          {
            receiptReference: 'A-1',
            date: '2025-03-01',
            description: 'Wartung',
          },
          {
            receiptReference: 'A-2',
            date: '2025-03-01',
            description: 'wartung ',
          },
        ),
      ),
    ).toEqual([])
  })

  it('meldet nichts bei verschiedenen Rechnungen', () => {
    expect(
      duplicates(
        withEntries(
          { receiptReference: 'A-1', date: '2025-03-01' },
          { receiptReference: 'A-2', date: '2025-04-01' },
          { receiptReference: '', date: '2025-05-01', amountCents: 500 },
          { receiptReference: '   ', date: '2025-06-01', amountCents: 700 },
          { date: '2025-07-01', amountCents: 0 },
          { date: '2025-07-01', amountCents: 0 },
        ),
      ),
    ).toEqual([])
  })

  it('vergleicht Belegnummern über Kostenarten hinweg', () => {
    const data = withEntries({ receiptReference: 'RE-7' })
    data.billingData.costCategories.push({
      ...data.billingData.costCategories[0]!,
      id: 'category-2',
      label: 'Weitere Kosten',
    })
    data.billingData.costEntries.push({
      id: 'entry-9',
      costCategoryId: 'category-2',
      amountCents: 2_000,
      receiptReference: 'RE-7',
      externalPayment: { confirmed: true, reason: 'Fiktiver Testfall' },
    })
    expect(duplicates(data).map(({ entity }) => entity?.id)).toEqual([
      'entry-9',
    ])
  })
})
