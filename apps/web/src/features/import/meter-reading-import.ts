import type {
  MeterServiceIssue,
  MeterServiceRow,
} from '@nebenkosten/import-export'
import type {
  AppDataFile,
  MeterReading,
  ValidationIssue,
} from '@nebenkosten/schema'
import { validateBillingPeriod } from '@nebenkosten/validators'
import { addMeterReading } from '../metering/meter-commands'
import { shiftMeterDate } from '../metering/meter-edit-guard'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'

export interface MeterReadingPlanRow {
  readonly line: number
  readonly meterId: string
  readonly meterNumber: string
  readonly date: string
  readonly value: number
  readonly unit: MeterServiceRow['unit']
  readonly boundary: NonNullable<MeterReading['boundary']>
}

export interface MeterReadingImportResult {
  readonly file: AppDataFile
  readonly plan: MeterReadingPlanRow[]
  /** Hinweise der Plausibilitätsprüfung (PR-31) zu den betroffenen Zählern. */
  readonly warnings: ValidationIssue[]
}

export class MeterReadingImportError extends Error {
  override readonly name = 'MeterReadingImportError'
  constructor(readonly issues: readonly MeterServiceIssue[]) {
    super(
      issues.length === 1
        ? `Zeile ${issues[0]!.line}: ${issues[0]!.message}`
        : `${issues.length} Zeilen der Zählerstandsliste müssen korrigiert werden.`,
    )
  }
}

const SERIES_CODE = 'heating.meter_reading_series_'

function key(value: string): string {
  return value.trim().toLocaleLowerCase('de-DE')
}

function german(date: string): string {
  return date.split('-').reverse().join('.')
}

/**
 * Übernimmt Zählerstände aus einer Ablesebogen-/Messdienst-CSV als
 * importierte Ablesungen in ein Abrechnungsjahr. Zähler werden über die
 * Zählernummer zugeordnet; unbekannte oder mehrfach vergebene Nummern,
 * vorhandene Ablesungen am selben Tag und abweichende Einheiten sind Fehler.
 * Alles oder nichts: bei einem Fehler wird nichts übernommen und jede
 * betroffene Zeile gemeldet. Anschließend läuft die Plausibilitätsprüfung
 * der Zählerstandsreihen; ihre Hinweise ändern keine Werte.
 */
export function importMeterReadings(
  file: AppDataFile,
  billingPeriodId: string,
  rows: readonly MeterServiceRow[],
  createId: () => string = () => crypto.randomUUID(),
): MeterReadingImportResult {
  const period = file.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period)
    throw new MeterReadingImportError([
      { line: 1, message: 'Abrechnungsjahr wurde nicht gefunden.' },
    ])
  if (!rows.length)
    throw new MeterReadingImportError([
      { line: 1, message: 'Die Datei enthält keine Zählerstände.' },
    ])
  const meters = file.masterData.meters.filter(
    ({ propertyId }) => propertyId === period.propertyId,
  )
  const plan: MeterReadingPlanRow[] = []
  const issues: MeterServiceIssue[] = []
  const seen = new Map<string, number>()
  // Messdienst-Stände gelten als Stand am Tagesende des Stichtags
  // (Maintainer, 25.10.2026). Ausnahme: Jahresbeginn und Folgetag nach
  // Jahresende gelten als Tagesbeginn, damit ein Anfangsstand vom 01.01.
  // die Grenze des Abrechnungszeitraums trifft.
  const startOfDay = new Set([
    period.periodStart,
    shiftMeterDate(period.periodEnd, 1),
  ])
  const boundaryOf = (date: string): 'start_of_day' | 'end_of_day' =>
    startOfDay.has(date) ? 'start_of_day' : 'end_of_day'

  const result = applyEditableBillingPeriodChange(
    file,
    billingPeriodId,
    (source) => {
      let current = source
      for (const row of rows) {
        try {
          const matches = meters.filter(
            (meter) => key(meter.meterNumber ?? '') === key(row.meterNumber),
          )
          if (matches.length === 0)
            throw new Error(
              `Zähler „${row.meterNumber}“ ist nicht angelegt; bitte zuerst unter Heizung › Zähler anlegen.`,
            )
          if (matches.length > 1)
            throw new Error(
              `Zählernummer „${row.meterNumber}“ ist mehrfach angelegt; bitte Zählernummern eindeutig machen.`,
            )
          const meter = matches[0]!
          const label = meter.meterNumber!
          const first = seen.get(`${meter.id}|${row.date}`)
          if (first !== undefined)
            throw new Error(
              `Zähler „${label}“ steht für den ${german(row.date)} mehrfach in der Datei (zuerst Zeile ${first}).`,
            )
          seen.set(`${meter.id}|${row.date}`, row.line)
          const existing = current.billingData.meterReadings.filter(
            ({ meterId }) => meterId === meter.id,
          )
          if (existing.some(({ date }) => date === row.date))
            throw new Error(
              `Für Zähler „${label}“ gibt es am ${german(row.date)} bereits eine Ablesung; sie wird nicht überschrieben.`,
            )
          if (meter.kind === 'unit_heat' && row.unit !== 'kWh')
            throw new Error(
              `Wohnungswärmezähler „${label}“ werden in kWh abgelesen.`,
            )
          const other = existing.find(({ value }) => value.unit !== row.unit)
          if (other)
            throw new Error(
              `Einheit ${row.unit} passt nicht zu den übrigen Ablesungen von „${label}“ (${other.value.unit}).`,
            )
          const boundary = boundaryOf(row.date)
          current = addMeterReading(
            current,
            {
              meterId: meter.id,
              billingPeriodId,
              date: row.date,
              boundary,
              value: { value: row.value, unit: row.unit },
              source: 'imported',
            },
            { createId },
          )
          plan.push({
            line: row.line,
            meterId: meter.id,
            meterNumber: label,
            date: row.date,
            value: row.value,
            unit: row.unit,
            boundary,
          })
        } catch (caught) {
          issues.push({
            line: row.line,
            message:
              caught instanceof Error ? caught.message : 'Zeile ist ungültig.',
          })
        }
      }
      if (issues.length) throw new MeterReadingImportError(issues)
      return current
    },
  )
  const meterIds = new Set(plan.map(({ meterId }) => meterId))
  const warnings = validateBillingPeriod(result, billingPeriodId).issues.filter(
    (item) =>
      item.code.startsWith(SERIES_CODE) &&
      item.entity?.type === 'Meter' &&
      meterIds.has(item.entity.id),
  )
  return { file: result, plan, warnings }
}
