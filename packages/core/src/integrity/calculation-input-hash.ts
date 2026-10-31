import type { CalculationInput } from '../contracts'
import { sha256Hex } from './sha256'

/**
 * Felder des Abrechnungszeitraums, die Freigabe oder Anschreiben betreffen
 * und das Rechenergebnis nicht verändern. Sie ändern sich bei Statuswechseln,
 * ohne dass neu gerechnet werden muss.
 */
const NON_CALCULATION_PERIOD_FIELDS = [
  'status',
  'dispatchDate',
  'lastModifiedAt',
  'notes',
  'coverLetter',
  'legacyUnmapped',
] as const

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * SHA-256 des kanonisch serialisierten Rechen-Eingabestands eines
 * Abrechnungszeitraums (`CalculationRun.inputSha256`, E-48-1).
 */
export function calculationInputSha256(input: CalculationInput): string {
  const billingPeriod: Record<string, unknown> = { ...input.billingPeriod }
  for (const field of NON_CALCULATION_PERIOD_FIELDS) delete billingPeriod[field]
  return sha256Hex(canonicalJson({ ...input, billingPeriod }))
}
