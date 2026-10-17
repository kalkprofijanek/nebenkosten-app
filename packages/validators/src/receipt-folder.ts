import type { AppDataFile } from '@nebenkosten/schema'

/**
 * Belegprüfung gegen den Rechnungsordner eines Objekts (PR-40/41). Reine
 * Funktion ohne Dateizugriff: Das Skript `pnpm belegpruefung` liest den
 * Ordner und übergibt nur die relativen Dateinamen. Verknüpfung über das
 * vorhandene Feld `receiptReference` (Belegnummer/Dateiname).
 */
export interface ReceiptFolderCheckInput {
  readonly billingPeriodId: string
  /** Relative Pfade im Objektordner, Trenner `/`. */
  readonly files: readonly string[]
}

export type ReceiptSourceKind = 'costEntry' | 'fuelDelivery'

export interface ReceiptSource {
  readonly kind: ReceiptSourceKind
  readonly id: string
}

export interface ReceiptFolderCheckResult {
  readonly matched: readonly (ReceiptSource & { readonly file: string })[]
  /** Kostenpositionen/Lieferungen ohne Belegangabe (Schätzungen ausgenommen). */
  readonly withoutReference: readonly ReceiptSource[]
  /** Belegangabe vorhanden, aber keine passende Datei im Ordner. */
  readonly notFound: readonly (ReceiptSource & {
    readonly receiptReference: string
  })[]
  /** Dieselbe Datei an mehreren Stellen des Zeitraums. */
  readonly duplicates: readonly {
    readonly file: string
    readonly sources: readonly ReceiptSource[]
  }[]
  /**
   * Dateien, auf die keine Kostenposition (in keinem Zeitraum) verweist. Das
   * Abrechnungsjahr ergibt sich aus dem Leistungszeitraum der Rechnung, nicht
   * aus Ordner oder Rechnungsdatum – die Zuordnung prüft der Mensch bzw.
   * der Agent anhand des Belegs.
   */
  readonly unreferencedFiles: readonly string[]
}

interface Reference extends ReceiptSource {
  readonly periodId: string
  readonly receiptReference: string | null
  readonly needsReceipt: boolean
}

function normalize(value: string): string {
  return value.trim().replace(/\\/g, '/').toLocaleLowerCase('de-DE')
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function withoutExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function findFile(
  reference: string,
  files: readonly string[],
): string | undefined {
  const wanted = normalize(reference)
  return (
    files.find((file) => normalize(file) === wanted) ??
    files.find((file) => basename(normalize(file)) === wanted) ??
    files.find((file) => withoutExtension(basename(normalize(file))) === wanted)
  )
}

/** Kostenpositionen hängen über ihre Kostenart am Zeitraum. */
function allReferences(data: AppDataFile): Reference[] {
  const categoryPeriod = new Map(
    data.billingData.costCategories.map(({ id, billingPeriodId }) => [
      id,
      billingPeriodId,
    ]),
  )
  return [
    ...data.billingData.costEntries.map((entry) => ({
      kind: 'costEntry' as const,
      id: entry.id,
      periodId: categoryPeriod.get(entry.costCategoryId) ?? '',
      receiptReference: entry.receiptReference?.trim() || null,
      needsReceipt: entry.amountBasis !== 'estimate',
    })),
    ...data.billingData.fuelDeliveries.map((delivery) => ({
      kind: 'fuelDelivery' as const,
      id: delivery.id,
      periodId: delivery.billingPeriodId,
      receiptReference: delivery.receiptReference?.trim() || null,
      needsReceipt: true,
    })),
  ]
}

export function checkReceiptFolder(
  data: AppDataFile,
  input: ReceiptFolderCheckInput,
): ReceiptFolderCheckResult {
  const { billingPeriodId, files } = input
  if (!data.billingData.billingPeriods.some(({ id }) => id === billingPeriodId))
    throw new Error(`Abrechnungszeitraum ${billingPeriodId} nicht gefunden.`)

  const references = allReferences(data)
  const referencedFiles = new Set<string>()
  for (const reference of references) {
    const file = reference.receiptReference
      ? findFile(reference.receiptReference, files)
      : undefined
    if (file) referencedFiles.add(file)
  }

  const matched: ReceiptFolderCheckResult['matched'][number][] = []
  const withoutReference: ReceiptSource[] = []
  const notFound: ReceiptFolderCheckResult['notFound'][number][] = []
  const byFile = new Map<string, ReceiptSource[]>()
  for (const {
    kind,
    id,
    periodId,
    receiptReference,
    needsReceipt,
  } of references) {
    if (periodId !== billingPeriodId) continue
    if (!receiptReference) {
      if (needsReceipt) withoutReference.push({ kind, id })
      continue
    }
    const file = findFile(receiptReference, files)
    if (!file) {
      notFound.push({ kind, id, receiptReference })
      continue
    }
    matched.push({ kind, id, file })
    byFile.set(file, [...(byFile.get(file) ?? []), { kind, id }])
  }

  return {
    matched,
    withoutReference,
    notFound,
    duplicates: [...byFile]
      .filter(([, ids]) => ids.length > 1)
      .map(([file, sources]) => ({ file, sources })),
    unreferencedFiles: files.filter((file) => !referencedFiles.has(file)),
  }
}

/**
 * Private Zuordnungsdatei `private-data/objekt-ordner.json`:
 * `{ "version": 1, "objects": [{ "propertyId": "…", "invoiceFolder": "…" }] }`.
 * Liegt nie im Repository und nie in der Datensicherung.
 */
export function parseReceiptFolderMapping(value: unknown): Map<string, string> {
  const fail = (reason: string): never => {
    throw new Error(`Zuordnungsdatei ungültig: ${reason}`)
  }
  if (typeof value !== 'object' || value === null) fail('kein Objekt')
  const { version, objects } = value as { version?: unknown; objects?: unknown }
  if (version !== 1) fail('version muss 1 sein')
  if (!Array.isArray(objects)) fail('objects fehlt')
  const mapping = new Map<string, string>()
  for (const [index, object] of (objects as unknown[]).entries()) {
    const { propertyId, invoiceFolder } = (object ?? {}) as {
      propertyId?: unknown
      invoiceFolder?: unknown
    }
    if (typeof propertyId !== 'string' || !propertyId.trim())
      fail(`objects[${index}].propertyId fehlt`)
    if (typeof invoiceFolder !== 'string' || !invoiceFolder.trim())
      fail(`objects[${index}].invoiceFolder fehlt`)
    if (mapping.has(propertyId as string))
      fail(`Objekt ${propertyId as string} mehrfach zugeordnet`)
    mapping.set(propertyId as string, (invoiceFolder as string).trim())
  }
  return mapping
}
