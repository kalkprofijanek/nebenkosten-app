import {
  costEntrySchema,
  type CostCategory,
  type CostEntry,
} from '@nebenkosten/schema'
import {
  CsvImportError,
  csvCents,
  csvDate,
  csvTable,
  decimalText,
} from './table'

const HEADERS = [
  'Kostenart',
  'Belegdatum',
  'Leistung von',
  'Leistung bis',
  'Beschreibung',
  'Belegnummer',
  'Betrag brutto EUR',
  'Umlagefaehig Prozent',
  'Lohnanteil EUR',
  'Lieferant',
  'Begruendung',
  'Rueckfrage',
] as const
export interface AiCostRow {
  readonly category: string
  readonly date?: string
  readonly serviceFrom?: string
  readonly serviceTo?: string
  readonly description?: string
  readonly receiptReference?: string
  readonly amountCents: number
  readonly allocablePercent?: number
  readonly laborAmountCents?: number
  readonly supplier?: string
  readonly reason?: string
  readonly question?: string
}

export function parseAiCostCsv(text: string): AiCostRow[] {
  const [header, ...rows] = csvTable(text)
  if (
    header!.length !== HEADERS.length ||
    HEADERS.some((h) => !header!.includes(h))
  )
    throw new CsvImportError(
      'CSV benötigt die dokumentierten Spalten der KI-Erfassungsliste.',
    )
  return rows.map((row) => {
    const get = (key: (typeof HEADERS)[number]) => row[header!.indexOf(key)]!
    const category = get('Kostenart')
    if (!category) throw new CsvImportError('Kostenart fehlt in CSV.')
    const date = get('Belegdatum') ? csvDate(get('Belegdatum')) : undefined
    const serviceFrom = get('Leistung von')
      ? csvDate(get('Leistung von'))
      : undefined
    const serviceTo = get('Leistung bis')
      ? csvDate(get('Leistung bis'))
      : undefined
    if (
      Boolean(serviceFrom) !== Boolean(serviceTo) ||
      (serviceFrom && serviceTo && serviceFrom > serviceTo)
    )
      throw new CsvImportError(
        'Leistungszeitraum in CSV ist unvollständig oder umgekehrt.',
      )
    const amountCents = csvCents(get('Betrag brutto EUR'))
    const allocablePercent = get('Umlagefaehig Prozent')
      ? Number(decimalText(get('Umlagefaehig Prozent')))
      : undefined
    if (
      allocablePercent !== undefined &&
      (!Number.isFinite(allocablePercent) ||
        allocablePercent < 0 ||
        allocablePercent > 100)
    )
      throw new CsvImportError('Ungültiger Prozentwert in CSV.')
    const laborAmountCents = get('Lohnanteil EUR')
      ? csvCents(get('Lohnanteil EUR'))
      : undefined
    if (
      laborAmountCents !== undefined &&
      (Math.abs(laborAmountCents) > Math.abs(amountCents) ||
        (laborAmountCents !== 0 &&
          Math.sign(laborAmountCents) !== Math.sign(amountCents)))
    )
      throw new CsvImportError(
        'Lohnanteil in CSV passt nicht zum Bruttobetrag.',
      )
    return {
      category,
      date,
      serviceFrom,
      serviceTo,
      amountCents,
      allocablePercent,
      laborAmountCents,
      description: get('Beschreibung') || undefined,
      receiptReference: get('Belegnummer') || undefined,
      supplier: get('Lieferant') || undefined,
      reason: get('Begruendung') || undefined,
      question: get('Rueckfrage') || undefined,
    }
  })
}

/** Eindeutige Zuordnung zu Kostenarten des ausgewählten Jahres; keine Speicherung. */
export function buildAiCostEntries(
  rows: readonly AiCostRow[],
  categories: readonly CostCategory[],
  idFactory: () => string,
): CostEntry[] {
  const ids = new Set<string>()
  return rows.map((row) => {
    if (row.question?.trim())
      throw new CsvImportError(
        'Offene Rückfrage in der Erfassungsliste; bitte zuerst klären.',
      )
    const matches = categories.filter(
      (c) =>
        c.label.trim().toLocaleLowerCase('de-DE') ===
        row.category.trim().toLocaleLowerCase('de-DE'),
    )
    if (matches.length !== 1)
      throw new CsvImportError(
        'Kostenart ist nicht eindeutig zugeordnet; bitte Kostenarten und CSV prüfen.',
      )
    const category = matches[0]!
    if (
      row.laborAmountCents !== undefined &&
      Math.round(
        (row.amountCents * (category.laborSharePercent ?? 0)) / 100,
      ) !== row.laborAmountCents
    )
      throw new CsvImportError(
        'Lohnanteil weicht vom Prozentsatz der Kostenart ab; bitte getrennte Kostenart oder korrigierten Lohnanteil verwenden.',
      )
    const id = idFactory()
    if (ids.has(id)) throw new CsvImportError('Doppelte ID bei CSV-Übernahme.')
    ids.add(id)
    const description = [
      row.description,
      row.supplier ? `Lieferant: ${row.supplier}` : undefined,
      row.serviceFrom
        ? `Leistung: ${row.serviceFrom} – ${row.serviceTo}`
        : undefined,
      row.reason ? `Begründung: ${row.reason}` : undefined,
      row.laborAmountCents !== undefined
        ? `Lohnanteil: ${(row.laborAmountCents / 100).toFixed(2)} EUR`
        : undefined,
    ]
      .filter(Boolean)
      .join('\n')
    return costEntrySchema.parse({
      id,
      costCategoryId: category.id,
      amountCents: row.amountCents,
      ...(row.date ? { date: row.date } : {}),
      ...(description ? { description } : {}),
      ...(row.receiptReference
        ? { receiptReference: row.receiptReference }
        : {}),
      ...(row.allocablePercent !== undefined
        ? { allocablePercent: row.allocablePercent }
        : {}),
    })
  })
}
