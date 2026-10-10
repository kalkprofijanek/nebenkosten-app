import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { importAiCosts } from './ai-cost-import'

function file(): AppDataFile {
  const result = createEmptyAppDataFile()
  result.billingData.billingPeriods.push({
    id: 'period',
    propertyId: 'property',
    year: 2025,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    status: 'DRAFT',
  })
  result.billingData.costCategories.push({
    id: 'clean',
    billingPeriodId: 'period',
    label: 'Reinigung',
    kind: 'operating',
  })
  return result
}
const rows = [
  {
    category: 'Reinigung',
    amountCents: 1000,
    receiptReference: 'TEST-1',
    serviceFrom: '2025-01-01',
    serviceTo: '2025-01-31',
  },
]
const id = () => '12345678-1234-4123-8123-123456789012'

describe('KI-Kostenübernahme', () => {
  it('übernimmt atomar, immutable und verhindert doppelte Belege', () => {
    const source = file()
    const result = importAiCosts(source, 'period', rows, id)
    expect(source.billingData.costEntries).toEqual([])
    expect(result.billingData.costEntries).toHaveLength(1)
    expect(() => importAiCosts(result, 'period', rows, id)).toThrow('Duplikat')
  })
  it('weist fremde Zeiträume, fehlende Jahre und gesperrte Jahre zurück', () => {
    expect(() => importAiCosts(file(), 'missing', rows, id)).toThrow(
      'Abrechnungsjahr',
    )
    expect(() =>
      importAiCosts(
        file(),
        'period',
        [{ ...rows[0]!, serviceFrom: '2024-12-01' }],
        id,
      ),
    ).toThrow('Leistungszeitraum')
    const locked = file()
    locked.billingData.billingPeriods[0]!.status = 'FINALIZED'
    expect(() => importAiCosts(locked, 'period', rows, id)).toThrow('gesperrt')
  })
  it('wendet den bestehenden Bearbeitungsschutz bei Prüfung an', () => {
    const source = file()
    source.billingData.billingPeriods[0]!.status = 'IN_REVIEW'
    const result = importAiCosts(source, 'period', rows, id)
    expect(result.billingData.billingPeriods[0]!.status).toBe('DRAFT')
    expect(result.billingData.auditEvents[0]!.action).toBe(
      'billing_period.review_invalidated',
    )
  })
  it('erkennt denselben Beleg auch bei ergänzter Referenz', () => {
    const source = importAiCosts(file(), 'period', rows, id)
    delete source.billingData.costEntries[0]!.receiptReference
    expect(() => importAiCosts(source, 'period', rows, id)).toThrow('Duplikat')
  })
})
