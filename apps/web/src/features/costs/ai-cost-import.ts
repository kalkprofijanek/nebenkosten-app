import {
  buildAiCostEntries,
  CsvImportError,
  type AiCostRow,
} from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'
import { addCostEntry } from './commands'

export function importAiCosts(
  file: AppDataFile,
  billingPeriodId: string,
  rows: readonly AiCostRow[],
  createId: () => string = () => crypto.randomUUID(),
): AppDataFile {
  const period = file.billingData.billingPeriods.find(
    (p) => p.id === billingPeriodId,
  )
  if (!period) throw new CsvImportError('Abrechnungsjahr fehlt.')
  if (!rows.length)
    throw new CsvImportError('Erfassungsliste enthält keine Kostenpositionen.')
  if (
    rows.some(
      (row) =>
        (row.serviceFrom && row.serviceFrom < period.periodStart) ||
        (row.serviceTo && row.serviceTo > period.periodEnd),
    )
  )
    throw new CsvImportError(
      'Leistungszeitraum liegt außerhalb des Abrechnungsjahres; bitte CSV zuerst aufteilen.',
    )
  const categories = file.billingData.costCategories.filter(
    (c) => c.billingPeriodId === billingPeriodId,
  )
  const entries = buildAiCostEntries(rows, categories, createId)
  const existing = [...file.billingData.costEntries]
  for (const entry of entries) {
    if (
      existing.some(
        (e) =>
          e.costCategoryId === entry.costCategoryId &&
          e.amountCents === entry.amountCents &&
          e.date === entry.date &&
          (entry.receiptReference && e.receiptReference
            ? e.receiptReference === entry.receiptReference
            : e.description === entry.description),
      )
    )
      throw new CsvImportError(
        'Mögliches Duplikat in der Erfassungsliste oder im Datenbestand; bitte prüfen.',
      )
    existing.push(entry)
  }
  return applyEditableBillingPeriodChange(file, billingPeriodId, (current) =>
    entries.reduce((result, entry) => {
      const { id, ...input } = entry
      return addCostEntry(result, input, () => id)
    }, current),
  )
}
