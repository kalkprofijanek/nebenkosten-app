import { describe, expect, it } from 'vitest'
import type { AppDataFile, CostCategory } from '@nebenkosten/schema'
import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { isMeteringFeeCategory, meteringFeeCents } from '../src'

const category = (patch: Partial<CostCategory>): CostCategory => ({
  id: 'cat',
  billingPeriodId: 'p',
  kind: 'heating',
  label: 'Wartung',
  scope: { kind: 'building', buildingId: 'b' },
  ...patch,
})

function data(
  categories: CostCategory[],
  entries: AppDataFile['billingData']['costEntries'] = [],
): AppDataFile {
  const file = createEmptyAppDataFile()
  file.billingData.costCategories.push(...categories)
  file.billingData.costEntries.push(...entries)
  return file
}

describe('Entgelte für Verbrauchserfassung (§ 6a Abs. 3 Nr. 1c HeizKV)', () => {
  it('erkennt ohne Kennzeichen über Schlagworte', () => {
    expect(isMeteringFeeCategory(category({ label: 'Messdienst' }))).toBe(true)
    expect(
      isMeteringFeeCategory(
        category({ label: 'Dienstleister', statementText: 'Ablesung' }),
      ),
    ).toBe(true)
    expect(isMeteringFeeCategory(category({}))).toBe(false)
    expect(
      meteringFeeCents(
        data([category({ label: 'Messdienst', totalAmountCents: 4_200 })]),
        'p',
        'b',
      ),
    ).toBe(4_200)
  })

  it('zählt eine gekennzeichnete Kostenart ohne Schlagwort', () => {
    const file = data(
      [category({ label: 'Dienstleister X', meteringFee: true })],
      [
        { id: 'e1', costCategoryId: 'cat', amountCents: 1_000 },
        { id: 'e2', costCategoryId: 'cat', amountCents: 500 },
      ],
    )
    expect(meteringFeeCents(file, 'p', 'b')).toBe(1_500)
  })

  it('schließt eine als kein Entgelt gekennzeichnete Kostenart aus', () => {
    const file = data(
      [category({ label: 'Messdienst', meteringFee: false })],
      [
        {
          id: 'e1',
          costCategoryId: 'cat',
          amountCents: 1_000,
          description: 'Ablesung',
        },
      ],
    )
    expect(isMeteringFeeCategory(file.billingData.costCategories[0]!)).toBe(
      false,
    )
    expect(meteringFeeCents(file, 'p', 'b')).toBeNull()
  })

  it('erkennt einzelne Belege an der Beschreibung', () => {
    const file = data(
      [category({})],
      [
        {
          id: 'e1',
          costCategoryId: 'cat',
          amountCents: 700,
          description: 'Gerätemiete HKV',
        },
        { id: 'e2', costCategoryId: 'cat', amountCents: 9_999 },
      ],
    )
    expect(meteringFeeCents(file, 'p', 'b')).toBe(700)
  })

  it('beachtet nur Heizungskosten des Gebäudes und Jahres', () => {
    const file = data([
      category({ id: 'a', label: 'Messdienst', totalAmountCents: 100 }),
      category({
        id: 'other-building',
        label: 'Messdienst',
        totalAmountCents: 200,
        scope: { kind: 'building', buildingId: 'x' },
      }),
      category({
        id: 'operating',
        kind: 'operating',
        label: 'Messdienst',
        totalAmountCents: 400,
      }),
      category({
        id: 'other-year',
        billingPeriodId: 'q',
        label: 'Messdienst',
        totalAmountCents: 800,
      }),
      category({
        id: 'flagged-empty',
        meteringFee: true,
      }),
    ])
    expect(meteringFeeCents(file, 'p', 'b')).toBe(100)
    expect(meteringFeeCents(data([]), 'p', 'b')).toBeNull()
  })
})
