import {
  hotWaterAllocationSchema,
  hotWaterEnergySchema,
  type HotWaterAllocation,
  type HotWaterEnergy,
} from '@nebenkosten/schema'
import { parseOptionalNumber } from '../../app/form-parsers'

/**
 * Formularlogik für die Warmwasser-Angaben eines Heizkreises (ADR-0010):
 * Wärmemenge nach § 9 Abs. 2 HeizKV (`hotWaterEnergy`) und Verteilung der
 * Warmwasserkosten nach § 8 Abs. 1 HeizKV (`hotWaterAllocation`).
 */

export type HotWaterEnergyMethod = HotWaterEnergy['method'] | ''
export type HotWaterAllocationKey = HotWaterAllocation['key']

export type HotWaterField =
  | 'heatKwh'
  | 'volumeM3'
  | 'temperatureC'
  | 'areaSqm'
  | 'reason'
  | 'consumptionSharePercent'
  | 'generatedHeatKwh'

export type HotWaterErrors = Partial<Record<HotWaterField, string>>

/** Formularfeldnamen der Warmwasser-Angaben. */
export const HOT_WATER_FIELD_NAMES = {
  method: 'hotWaterEnergyMethod',
  heatKwh: 'hotWaterHeatKwh',
  volumeM3: 'hotWaterVolumeM3',
  temperatureC: 'hotWaterTemperatureC',
  temperatureEstimated: 'hotWaterTemperatureEstimated',
  areaSqm: 'hotWaterAreaSqm',
  reason: 'hotWaterAreaReason',
  condensingNaturalGas: 'hotWaterCondensingNaturalGas',
  allocationKey: 'hotWaterAllocationKey',
  consumptionSharePercent: 'hotWaterConsumptionSharePercent',
  generatedHeatKwh: 'generatedHeatKwh',
} as const

export const HOT_WATER_ENERGY_OPTIONS: readonly {
  readonly value: HotWaterEnergyMethod
  readonly label: string
}[] = [
  { value: 'heat_meter', label: 'Wärmezähler (kWh)' },
  {
    value: 'volume_formula',
    label: 'Warmwasservolumen + Temperatur (Formel 2,5 × V × (tw − 10))',
  },
  {
    value: 'area_formula',
    label:
      'Wohnfläche (Formel 32 × A, nur wenn weder Wärmemenge noch Volumen messbar)',
  },
  {
    value: '',
    label: 'nicht gesetzt (Pauschalanteil, nicht verordnungskonform)',
  },
]

export const HOT_WATER_ALLOCATION_OPTIONS: readonly {
  readonly value: HotWaterAllocationKey
  readonly label: string
}[] = [
  {
    value: 'consumption',
    label: 'nach Warmwasserverbrauch (50–70 %, Rest Fläche)',
  },
  { value: 'area', label: 'nach Wohnfläche (ohne Warmwasserzähler)' },
  { value: 'persons', label: 'nach Personen (nicht verordnungskonform)' },
]

const FIELD_MESSAGES: Record<HotWaterField, string> = {
  heatKwh:
    'Bitte die gemessene Wärmemenge als Zahl ab 0 in kWh angeben (§ 9 Abs. 2 Satz 1 HeizKV).',
  volumeM3:
    'Bitte das gemessene Warmwasservolumen als Zahl ab 0 in m³ angeben.',
  temperatureC:
    'Bitte die mittlere Warmwassertemperatur zwischen 10 und 100 °C angeben.',
  areaSqm:
    'Die Wohnfläche muss eine positive Zahl in m² sein oder leer bleiben.',
  reason:
    'Bitte begründen, warum weder Wärmemenge noch Volumen gemessen werden können (§ 9 Abs. 2 Satz 4 HeizKV).',
  consumptionSharePercent:
    'Bitte den Verbrauchsanteil zwischen 50 und 70 Prozent angeben (§ 8 Abs. 1 HeizKV).',
  generatedHeatKwh:
    'Die erzeugte Wärmemenge muss eine positive Zahl in kWh sein oder leer bleiben.',
}

export type HotWaterFormResult =
  | {
      readonly ok: true
      readonly hotWaterEnergy: HotWaterEnergy | null
      readonly hotWaterAllocation: HotWaterAllocation | null
      /**
       * Gemessene erzeugte Wärme des Heizkreises in kWh
       * (`HeatingCircuit.generatedHeatKwh`, ADR-0010 „Wärmepumpen“).
       */
      readonly generatedHeatKwh: number | null
    }
  | { readonly ok: false; readonly errors: HotWaterErrors }

const text = (form: FormData, name: string) =>
  String(form.get(name) ?? '').trim()

const ENERGY_FIELD_PATHS: Readonly<Record<string, HotWaterField>> = {
  heatKwh: 'heatKwh',
  volumeM3: 'volumeM3',
  temperatureC: 'temperatureC',
  areaSqm: 'areaSqm',
  reason: 'reason',
}

function readNumbers(
  form: FormData,
  fields: readonly HotWaterField[],
  errors: HotWaterErrors,
): Partial<Record<HotWaterField, number>> {
  const numbers: Partial<Record<HotWaterField, number>> = {}
  for (const field of fields) {
    try {
      const value = parseOptionalNumber(
        text(form, HOT_WATER_FIELD_NAMES[field]),
      )
      if (value !== null) numbers[field] = value
    } catch {
      errors[field] = FIELD_MESSAGES[field]
    }
  }
  return numbers
}

function energyCandidate(
  form: FormData,
  method: HotWaterEnergyMethod,
  errors: HotWaterErrors,
): unknown {
  const condensing = form.has(HOT_WATER_FIELD_NAMES.condensingNaturalGas)
    ? { condensingNaturalGas: true }
    : {}
  if (method === 'heat_meter') {
    const numbers = readNumbers(form, ['heatKwh'], errors)
    return { method, heatKwh: numbers.heatKwh, ...condensing }
  }
  if (method === 'volume_formula') {
    const numbers = readNumbers(form, ['volumeM3', 'temperatureC'], errors)
    return {
      method,
      volumeM3: numbers.volumeM3,
      temperatureC: numbers.temperatureC,
      ...(form.has(HOT_WATER_FIELD_NAMES.temperatureEstimated)
        ? { temperatureEstimated: true }
        : {}),
      ...condensing,
    }
  }
  const numbers = readNumbers(form, ['areaSqm'], errors)
  return {
    method,
    ...(numbers.areaSqm === undefined ? {} : { areaSqm: numbers.areaSqm }),
    reason: text(form, HOT_WATER_FIELD_NAMES.reason),
    ...condensing,
  }
}

/**
 * Liest die Warmwasser-Angaben. Ohne zentrale Warmwasserbereitung liefert
 * die Funktion für beide Angaben `null`. Die Verteilung „nach Personen“
 * entspricht dem leeren Feld (bisheriges Verfahren) und wird als `null`
 * gespeichert. Geprüft wird über die zod-Schemas des Vertrags.
 */
export function readHotWaterForm(
  form: FormData,
  hasCentralHotWater: boolean,
): HotWaterFormResult {
  if (!hasCentralHotWater)
    return {
      ok: true,
      hotWaterEnergy: null,
      hotWaterAllocation: null,
      generatedHeatKwh: null,
    }
  const errors: HotWaterErrors = {}
  const method = text(
    form,
    HOT_WATER_FIELD_NAMES.method,
  ) as HotWaterEnergyMethod
  let hotWaterEnergy: HotWaterEnergy | null = null
  if (method !== '') {
    const result = hotWaterEnergySchema.safeParse(
      energyCandidate(form, method, errors),
    )
    if (result.success) hotWaterEnergy = result.data
    else
      for (const issue of result.error.issues) {
        const field = ENERGY_FIELD_PATHS[String(issue.path[0])]
        if (field && !errors[field]) errors[field] = FIELD_MESSAGES[field]
      }
  }
  const key = (text(form, HOT_WATER_FIELD_NAMES.allocationKey) ||
    'persons') as HotWaterAllocationKey
  let hotWaterAllocation: HotWaterAllocation | null = null
  if (key !== 'persons') {
    const numbers =
      key === 'consumption'
        ? readNumbers(form, ['consumptionSharePercent'], errors)
        : {}
    const result = hotWaterAllocationSchema.safeParse({
      key,
      ...(numbers.consumptionSharePercent === undefined
        ? {}
        : { consumptionSharePercent: numbers.consumptionSharePercent }),
    })
    if (result.success) hotWaterAllocation = result.data
    else
      errors.consumptionSharePercent ??= FIELD_MESSAGES.consumptionSharePercent
  }
  let generatedHeatKwh: number | null = null
  if (method !== '') {
    const value = readNumbers(
      form,
      ['generatedHeatKwh'],
      errors,
    ).generatedHeatKwh
    if (value !== undefined) {
      if (value > 0) generatedHeatKwh = value
      else errors.generatedHeatKwh = FIELD_MESSAGES.generatedHeatKwh
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, hotWaterEnergy, hotWaterAllocation, generatedHeatKwh }
}

/** Ob die Energiequelle Strom bzw. eine Wärmepumpe ist (Jahresarbeitszahl). */
export function isElectricityOrHeatPump(
  ...values: readonly (string | null | undefined)[]
): boolean {
  return values.some((value) =>
    /strom|w(?:ä|ae)rmepumpe|^wp(?:\b|_)/iu.test((value ?? '').trim()),
  )
}

/** Ob der Energieträger-Freitext auf Erdgas hindeutet (Faktor 1,11). */
export function isNaturalGas(sourceType: string | null | undefined): boolean {
  return /gas/iu.test(sourceType ?? '')
}

export function germanNumber(value: number | null | undefined): string {
  return value == null ? '' : String(value).replace('.', ',')
}

/** Formularfeldnamen der Jahresarbeitszahl (ADR-0010 „Wärmepumpen“). */
export const SEASONAL_PERFORMANCE_FACTOR_FIELD_NAMES = {
  value: 'seasonalPerformanceFactor',
  estimated: 'seasonalPerformanceFactorEstimated',
  reason: 'seasonalPerformanceFactorReason',
} as const
