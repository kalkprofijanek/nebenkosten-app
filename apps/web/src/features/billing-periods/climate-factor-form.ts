import { climateFactorSchema, type ClimateFactor } from '@nebenkosten/schema'
import { DWD_CLIMATE_FACTOR_SOURCE } from '@nebenkosten/import-export'
import { parseOptionalNumber } from '../../app/form-parsers'

export type ClimateFactorField = keyof ClimateFactor

export type ClimateFactorErrors = Partial<Record<ClimateFactorField, string>>

/** Eingabestand der Maske „Klimafaktor (DWD)“. */
export interface ClimateFactorDraft {
  readonly postalCode: string
  readonly factor: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly source: string
}

/** Formularfeldnamen der Maske „Klimafaktor (DWD)“. */
export const CLIMATE_FACTOR_FIELD_NAMES = {
  active: 'climateFactorActive',
  postalCode: 'climatePostalCode',
  factor: 'climateFactor',
  periodStart: 'climatePeriodStart',
  periodEnd: 'climatePeriodEnd',
  source: 'climateSource',
} as const

const FIELD_MESSAGES: Record<ClimateFactorField, string> = {
  postalCode: 'Bitte eine fünfstellige Postleitzahl angeben.',
  factor: 'Bitte den Klimafaktor als positive Zahl angeben.',
  periodStart: 'Bitte den Beginn des Zeitraums laut DWD-Datei angeben.',
  periodEnd: 'Bitte das Ende des Zeitraums laut DWD-Datei angeben.',
  source: 'Bitte die Quelle des Klimafaktors angeben.',
}

export function formatClimateFactor(value: number): string {
  return String(value).replace('.', ',')
}

export function emptyClimateFactorDraft(
  postalCode: string | null,
): ClimateFactorDraft {
  return {
    postalCode: postalCode ?? '',
    factor: '',
    periodStart: '',
    periodEnd: '',
    source: DWD_CLIMATE_FACTOR_SOURCE,
  }
}

export function climateFactorDraft(value: ClimateFactor): ClimateFactorDraft {
  return {
    postalCode: value.postalCode,
    factor: formatClimateFactor(value.factor),
    periodStart: value.periodStart,
    periodEnd: value.periodEnd,
    source: value.source,
  }
}

export type ClimateFactorFormResult =
  | { readonly ok: true; readonly value: ClimateFactor | null }
  | { readonly ok: false; readonly errors: ClimateFactorErrors }

const text = (form: FormData, name: string) =>
  String(form.get(name) ?? '').trim()

/**
 * Liest die Maske „Klimafaktor (DWD)“. Ohne aktive Maske liefert die
 * Funktion `null` (kein bzw. entfernter Klimafaktor). Geprüft wird über
 * `climateFactorSchema`; Fehler werden je Feld auf Deutsch zurückgegeben.
 */
export function readClimateFactorForm(form: FormData): ClimateFactorFormResult {
  if (text(form, CLIMATE_FACTOR_FIELD_NAMES.active) !== '1')
    return { ok: true, value: null }
  const errors: ClimateFactorErrors = {}
  let factor: number | undefined
  try {
    factor =
      parseOptionalNumber(text(form, CLIMATE_FACTOR_FIELD_NAMES.factor)) ??
      undefined
  } catch {
    errors.factor = FIELD_MESSAGES.factor
  }
  const result = climateFactorSchema.safeParse({
    postalCode: text(form, CLIMATE_FACTOR_FIELD_NAMES.postalCode),
    factor,
    periodStart: text(form, CLIMATE_FACTOR_FIELD_NAMES.periodStart),
    periodEnd: text(form, CLIMATE_FACTOR_FIELD_NAMES.periodEnd),
    source: text(form, CLIMATE_FACTOR_FIELD_NAMES.source),
  })
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as ClimateFactorField
      if (!(field in FIELD_MESSAGES) || errors[field]) continue
      errors[field] =
        issue.code === 'custom' ? issue.message : FIELD_MESSAGES[field]
    }
  }
  if (!result.success || Object.keys(errors).length > 0)
    return { ok: false, errors }
  return { ok: true, value: result.data }
}
