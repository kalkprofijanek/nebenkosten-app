/**
 * Dateinamen der erzeugten PDFs – einheitlich für PDF-Export, Einzel-Download
 * und Kommandozeile (`pnpm abrechnung`).
 */

/** Nur Buchstaben, Ziffern, `_` und `-`; Sonstiges wird zu einem `_`. */
export function safeFileNamePart(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^_|_$/gu, '')
}

/** `NK_<Jahr>_<Wohnung>_<Mietpartei>.pdf` */
export function tenantStatementFileName(
  year: number,
  unitLabel: string,
  personNames: readonly (string | null | undefined)[],
): string {
  const personName =
    personNames.map((name) => name ?? '').join('_') || 'Unbekannt'
  return `NK_${year}_${safeFileNamePart(unitLabel)}_${safeFileNamePart(personName)}.pdf`
}

/** `NK_<Jahr>_<Wohnung>_<Mietpartei>_Vorauszahlungsanpassung.pdf` */
export function prepaymentAdjustmentFileName(
  year: number,
  unitLabel: string,
  personNames: readonly (string | null | undefined)[],
): string {
  return tenantStatementFileName(year, unitLabel, personNames).replace(
    /\.pdf$/u,
    '_Vorauszahlungsanpassung.pdf',
  )
}

/** `NK_<Jahr>_Gesamtabrechnung_intern.pdf` bzw. `…_Mieter.pdf` */
export function combinedStatementFileName(
  year: number,
  audience: 'internal' | 'tenant',
): string {
  return `NK_${year}_Gesamtabrechnung_${audience === 'internal' ? 'intern' : 'Mieter'}.pdf`
}

/** Hängt bei gleichem Namen `_2`, `_3` … an (Groß-/Kleinschreibung egal). */
export function uniqueFileName(
  fileName: string,
  usedFileNames: Set<string>,
): string {
  const normalizedFileName = fileName.toLocaleLowerCase('de-DE')
  if (!usedFileNames.has(normalizedFileName)) {
    usedFileNames.add(normalizedFileName)
    return fileName
  }
  const extensionIndex = fileName.lastIndexOf('.')
  const baseName =
    extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : ''
  let suffix = 2
  while (
    usedFileNames.has(
      `${baseName}_${suffix}${extension}`.toLocaleLowerCase('de-DE'),
    )
  )
    suffix += 1
  const uniqueName = `${baseName}_${suffix}${extension}`
  usedFileNames.add(uniqueName.toLocaleLowerCase('de-DE'))
  return uniqueName
}
