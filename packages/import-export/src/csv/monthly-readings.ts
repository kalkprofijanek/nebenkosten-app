/**
 * Vorschau für den Import monatlicher Zählerstände (ADR-0014, Schritt 2).
 * Ordnet die technischen Zeilen aus `parseMeterServiceCsv` den Wohnungs-
 * Wärme- und Warmwasserzählern eines Objekts zu und prüft Einheit,
 * Dubletten und fallende Stände. Reine Funktion: Es wird nichts gespeichert;
 * ob die Vorschau trotz Problemen übernommen wird, entscheidet die Oberfläche.
 */
import {
  meterReadingSchema,
  type AppDataFile,
  type Meter,
  type MeterReading,
} from '@nebenkosten/schema'
import type { MeterServiceReading } from './meter-service'

export type MonthlyReadingProblemCode =
  | 'unknown_meter'
  | 'ambiguous_meter'
  | 'unit_mismatch'
  | 'conflicting_reading'
  | 'decreasing_reading'
  | 'invalid_reading'

export interface MonthlyReadingProblem {
  /** 1-basierte Position in `rows` (Datenzeile ohne Kopf- und Leerzeilen). */
  readonly row: number
  readonly code: MonthlyReadingProblemCode
  /** Text ohne Zählerstände; nennt nur Zählernummer und Datum. */
  readonly detail: string
}

export interface MonthlyReadingDuplicate {
  readonly row: number
  readonly meterId: string
  readonly date: string
  /** `existing`: bereits im Datenbestand; `file`: frühere CSV-Zeile. */
  readonly duplicateOf: 'existing' | 'file'
}

export interface MonthlyReadingsInput {
  readonly propertyId: string
  readonly rows: readonly MeterServiceReading[]
  readonly createId: () => string
  /** Zeitpunkt des Imports; wird nur an den Plan durchgereicht. */
  readonly importedAt?: string
}

export interface MonthlyReadingsPlan {
  /** Neu anzulegende Ablesungen in Zeilenreihenfolge. */
  readonly readings: MeterReading[]
  readonly skippedDuplicates: MonthlyReadingDuplicate[]
  readonly problems: MonthlyReadingProblem[]
  readonly importedAt: string | null
}

type ImportUnit = 'kWh' | 'm3'
const UNIT_BY_KIND: Partial<Record<Meter['kind'], ImportUnit>> = {
  unit_heat: 'kWh',
  unit_hot_water: 'm3',
}

interface Candidate {
  readonly row: number
  readonly meterId: string
  readonly date: string
  readonly value: number
  readonly unit: ImportUnit
}

/** Getrimmt, ohne Leerzeichen, ohne Groß-/Kleinschreibung. */
function normalizeMeterNumber(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function sameValue(
  reading: MeterReading,
  value: number,
  unit: ImportUnit,
): boolean {
  return reading.value.value === value && reading.value.unit === unit
}

/** Plant die Übernahme monatlicher Zählerstände ohne Seiteneffekte. */
export function planMonthlyMeterReadings(
  data: AppDataFile,
  input: MonthlyReadingsInput,
): MonthlyReadingsPlan {
  const problems: MonthlyReadingProblem[] = []
  const skippedDuplicates: MonthlyReadingDuplicate[] = []

  const metersByNumber = new Map<string, Meter[]>()
  for (const meter of data.masterData.meters) {
    if (meter.propertyId !== input.propertyId || !UNIT_BY_KIND[meter.kind])
      continue
    const key = normalizeMeterNumber(meter.meterNumber ?? '')
    if (!key) continue
    metersByNumber.set(key, [...(metersByNumber.get(key) ?? []), meter])
  }

  const existingByMeter = new Map<string, MeterReading[]>()
  for (const reading of data.billingData.meterReadings) {
    if (!reading.date) continue
    existingByMeter.set(reading.meterId, [
      ...(existingByMeter.get(reading.meterId) ?? []),
      reading,
    ])
  }

  // 1. Zuordnung und Einheit
  const candidates: Candidate[] = []
  input.rows.forEach((source, index) => {
    const row = index + 1
    const label = `Zähler ${source.meterNumber.trim()}`
    const matches =
      metersByNumber.get(normalizeMeterNumber(source.meterNumber)) ?? []
    if (matches.length === 0)
      return problems.push({
        row,
        code: 'unknown_meter',
        detail: `${label}: kein Wärme- oder Warmwasserzähler dieses Objekts mit dieser Nummer.`,
      })
    if (matches.length > 1)
      return problems.push({
        row,
        code: 'ambiguous_meter',
        detail: `${label}: Nummer ist mehreren Zählern dieses Objekts zugeordnet.`,
      })
    const meter = matches[0]!
    const expected = UNIT_BY_KIND[meter.kind]!
    if (source.unit !== expected)
      return problems.push({
        row,
        code: 'unit_mismatch',
        detail: `${label}: Einheit ${source.unit} passt nicht, erwartet ${expected}.`,
      })
    candidates.push({
      row,
      meterId: meter.id,
      date: source.date,
      value: source.value,
      unit: expected,
    })
  })

  // 2. Dubletten gegenüber Bestand und innerhalb der Datei
  const conflict = (c: Candidate, against: string) =>
    problems.push({
      row: c.row,
      code: 'conflicting_reading',
      detail: `Ablesung vom ${c.date} weicht von ${against} ab; nichts wird überschrieben.`,
    })
  const groups = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const key = `${c.meterId}\u0000${c.date}`
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const unique: Candidate[] = []
  for (const group of groups.values()) {
    const first = group[0]!
    const sameDay = (existingByMeter.get(first.meterId) ?? []).filter(
      (r) => r.date === first.date,
    )
    if (sameDay.length > 0) {
      for (const c of group) {
        if (sameDay.every((r) => sameValue(r, c.value, c.unit)))
          skippedDuplicates.push({
            row: c.row,
            meterId: c.meterId,
            date: c.date,
            duplicateOf: 'existing',
          })
        else conflict(c, 'einer vorhandenen Ablesung')
      }
      continue
    }
    if (group.some((c) => c.value !== first.value)) {
      for (const c of group) conflict(c, 'einer anderen Zeile der Datei')
      continue
    }
    unique.push(first)
    for (const c of group.slice(1))
      skippedDuplicates.push({
        row: c.row,
        meterId: c.meterId,
        date: c.date,
        duplicateOf: 'file',
      })
  }

  // 3. Fallende Stände, chronologisch je Zähler
  const accepted: Candidate[] = []
  const acceptedByMeter = new Map<string, Candidate[]>()
  for (const c of [...unique].sort((a, b) => a.date.localeCompare(b.date))) {
    const earlier = [
      ...(existingByMeter.get(c.meterId) ?? [])
        .filter((r) => r.value.unit === c.unit)
        .map((r) => ({ date: r.date!, value: r.value.value })),
      ...(acceptedByMeter.get(c.meterId) ?? []),
    ].filter((r) => r.date < c.date)
    const last = earlier.reduce<{ date: string; value: number } | undefined>(
      (best, r) => (!best || r.date > best.date ? r : best),
      undefined,
    )
    if (last && c.value < last.value) {
      problems.push({
        row: c.row,
        code: 'decreasing_reading',
        detail: `Ablesung vom ${c.date} ist kleiner als der letzte Stand vom ${last.date}.`,
      })
      continue
    }
    // Spätere vorhandene Stände dürfen nicht kleiner sein als der neue.
    const next = (existingByMeter.get(c.meterId) ?? [])
      .filter((r) => r.value.unit === c.unit && r.date! > c.date)
      .reduce<{ date: string; value: number } | undefined>(
        (best, r) =>
          !best || r.date! < best.date
            ? { date: r.date!, value: r.value.value }
            : best,
        undefined,
      )
    if (next && c.value > next.value) {
      problems.push({
        row: c.row,
        code: 'decreasing_reading',
        detail: `Ablesung vom ${c.date} ist größer als der spätere Stand vom ${next.date}.`,
      })
      continue
    }
    accepted.push(c)
    acceptedByMeter.set(c.meterId, [
      ...(acceptedByMeter.get(c.meterId) ?? []),
      c,
    ])
  }

  // 4. Ablesungen in Zeilenreihenfolge erzeugen und gegen das Schema prüfen
  const readings: MeterReading[] = []
  for (const c of accepted.sort((a, b) => a.row - b.row)) {
    const reading = {
      id: input.createId(),
      meterId: c.meterId,
      date: c.date,
      value: { value: c.value, unit: c.unit },
      source: 'imported',
      boundary: 'end_of_day',
    } satisfies MeterReading
    if (meterReadingSchema.safeParse(reading).success) readings.push(reading)
    else
      problems.push({
        row: c.row,
        code: 'invalid_reading',
        detail: `Ablesung vom ${c.date} ist im Datenmodell ungültig.`,
      })
  }

  problems.sort((a, b) => a.row - b.row)
  skippedDuplicates.sort((a, b) => a.row - b.row)
  return {
    readings,
    skippedDuplicates,
    problems,
    importedAt: input.importedAt ?? null,
  }
}
