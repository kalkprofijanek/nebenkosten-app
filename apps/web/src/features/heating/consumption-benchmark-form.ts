import {
  consumptionBenchmarkSchema,
  type ConsumptionBenchmark,
} from '@nebenkosten/schema'
import { parseOptionalNumber } from '../../app/form-parsers'

/** Vorbelegung der Quelle (ADR-0004, Entscheidung des Nutzers). */
export const DEFAULT_CONSUMPTION_BENCHMARK_SOURCE =
  'Heizspiegel für Deutschland (co2online)'

export type ConsumptionBenchmarkField = Exclude<
  keyof ConsumptionBenchmark,
  'includesHotWater'
>

export type ConsumptionBenchmarkErrors = Partial<
  Record<ConsumptionBenchmarkField, string>
>

/** Eingabestand der Maske; Zahlen bleiben Text, bis gespeichert wird. */
export interface ConsumptionBenchmarkDraft {
  readonly source: string
  readonly sourceUrl: string
  readonly referenceYear: string
  readonly category: string
  readonly includesHotWater: boolean
  readonly lowMaxKwhPerSqmYear: string
  readonly mediumMaxKwhPerSqmYear: string
  readonly elevatedMaxKwhPerSqmYear: string
}

/** Formularfeldnamen der Maske „Vergleichswerte (Heizspiegel)“. */
export const BENCHMARK_FIELD_NAMES = {
  active: 'benchmarkActive',
  source: 'benchmarkSource',
  sourceUrl: 'benchmarkSourceUrl',
  referenceYear: 'benchmarkReferenceYear',
  category: 'benchmarkCategory',
  includesHotWater: 'benchmarkIncludesHotWater',
  lowMaxKwhPerSqmYear: 'benchmarkLowMax',
  mediumMaxKwhPerSqmYear: 'benchmarkMediumMax',
  elevatedMaxKwhPerSqmYear: 'benchmarkElevatedMax',
} as const

const FIELD_MESSAGES: Record<ConsumptionBenchmarkField, string> = {
  source: 'Bitte die Quelle der Vergleichswerte angeben.',
  sourceUrl:
    'Bitte eine vollständige Webadresse mit http:// oder https:// angeben oder das Feld leer lassen.',
  referenceYear:
    'Das Bezugsjahr muss eine ganze Zahl zwischen 1990 und 2100 sein.',
  category: 'Bitte die Kategorie laut Quelle angeben.',
  lowMaxKwhPerSqmYear:
    'Bitte die Grenze „niedrig bis“ als positive Zahl in kWh/m²·a angeben.',
  mediumMaxKwhPerSqmYear:
    'Bitte die Grenze „mittel bis“ als positive Zahl in kWh/m²·a angeben.',
  elevatedMaxKwhPerSqmYear:
    'Bitte die Grenze „erhöht bis“ als positive Zahl in kWh/m²·a angeben.',
}

const NUMBER_FIELDS = [
  'referenceYear',
  'lowMaxKwhPerSqmYear',
  'mediumMaxKwhPerSqmYear',
  'elevatedMaxKwhPerSqmYear',
] as const

function germanNumber(value: number): string {
  return String(value).replace('.', ',')
}

export function emptyConsumptionBenchmarkDraft(): ConsumptionBenchmarkDraft {
  return {
    source: DEFAULT_CONSUMPTION_BENCHMARK_SOURCE,
    sourceUrl: '',
    referenceYear: '',
    category: '',
    includesHotWater: true,
    lowMaxKwhPerSqmYear: '',
    mediumMaxKwhPerSqmYear: '',
    elevatedMaxKwhPerSqmYear: '',
  }
}

export function consumptionBenchmarkDraft(
  benchmark: ConsumptionBenchmark,
): ConsumptionBenchmarkDraft {
  return {
    source: benchmark.source,
    sourceUrl: benchmark.sourceUrl ?? '',
    referenceYear: String(benchmark.referenceYear),
    category: benchmark.category,
    includesHotWater: benchmark.includesHotWater,
    lowMaxKwhPerSqmYear: germanNumber(benchmark.lowMaxKwhPerSqmYear),
    mediumMaxKwhPerSqmYear: germanNumber(benchmark.mediumMaxKwhPerSqmYear),
    elevatedMaxKwhPerSqmYear: germanNumber(benchmark.elevatedMaxKwhPerSqmYear),
  }
}

export type ConsumptionBenchmarkFormResult =
  | { readonly ok: true; readonly value: ConsumptionBenchmark | null }
  | { readonly ok: false; readonly errors: ConsumptionBenchmarkErrors }

const text = (form: FormData, name: string) =>
  String(form.get(name) ?? '').trim()

/**
 * Liest die Maske „Vergleichswerte (Heizspiegel)“. Ohne aktive Maske
 * liefert die Funktion `null` (keine bzw. entfernte Vergleichswerte).
 * Geprüft wird über `consumptionBenchmarkSchema`; Fehler werden je Feld auf
 * Deutsch zurückgegeben.
 */
export function readConsumptionBenchmarkForm(
  form: FormData,
): ConsumptionBenchmarkFormResult {
  if (text(form, BENCHMARK_FIELD_NAMES.active) !== '1')
    return { ok: true, value: null }
  const errors: ConsumptionBenchmarkErrors = {}
  const numbers: Partial<Record<(typeof NUMBER_FIELDS)[number], number>> = {}
  for (const field of NUMBER_FIELDS) {
    try {
      const value = parseOptionalNumber(
        text(form, BENCHMARK_FIELD_NAMES[field]),
      )
      if (value !== null) numbers[field] = value
    } catch {
      errors[field] = FIELD_MESSAGES[field]
    }
  }
  const sourceUrl = text(form, BENCHMARK_FIELD_NAMES.sourceUrl)
  const candidate = {
    source: text(form, BENCHMARK_FIELD_NAMES.source),
    ...(sourceUrl ? { sourceUrl } : {}),
    referenceYear: numbers.referenceYear,
    category: text(form, BENCHMARK_FIELD_NAMES.category),
    includesHotWater: form.has(BENCHMARK_FIELD_NAMES.includesHotWater),
    lowMaxKwhPerSqmYear: numbers.lowMaxKwhPerSqmYear,
    mediumMaxKwhPerSqmYear: numbers.mediumMaxKwhPerSqmYear,
    elevatedMaxKwhPerSqmYear: numbers.elevatedMaxKwhPerSqmYear,
  }
  const result = consumptionBenchmarkSchema.safeParse(candidate)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as ConsumptionBenchmarkField
      if (!(field in FIELD_MESSAGES) || errors[field]) continue
      errors[field] =
        issue.code === 'custom' ? issue.message : FIELD_MESSAGES[field]
    }
  }
  if (Object.keys(errors).length > 0 || !result.success)
    return { ok: false, errors }
  return { ok: true, value: result.data }
}
