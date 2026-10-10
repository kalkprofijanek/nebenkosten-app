/**
 * Verbrauch aus Zählerständen einer Nutzung (`OccupancyPeriod.heatMeterReading`)
 * einschließlich Geräte- bzw. Zählertausch (ADR-0008). Gemeinsame Regel für
 * Prüfung, Verbrauchsseite und Einzelabrechnung.
 */
import type { HeatMeterReading } from '@nebenkosten/schema'

export interface MeterReadingSegment {
  meterNumber: string | null
  /** Datum des Anfangsstands (Ablese- bzw. Tauschtag), sofern bekannt. */
  from: string | null
  to: string | null
  startValue: number
  endValue: number
  /** Endstand − Anfangsstand, drei Nachkommastellen. */
  consumption: number
}

export type MeterReadingConsumption =
  | { status: 'complete'; total: number; segments: MeterReadingSegment[] }
  /** Anfangs- oder Endstand fehlt; kein Verbrauch ableitbar. */
  | { status: 'incomplete' }
  /**
   * Tauschtage nicht aufsteigend oder außerhalb von Ablesedatum alt/neu;
   * kein Verbrauch ableitbar, bis die Angaben korrigiert sind.
   */
  | { status: 'invalid'; reason: 'replacement_order' | 'replacement_outside' }

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

export function meterReadingConsumption(
  reading: Readonly<HeatMeterReading> | null | undefined,
): MeterReadingConsumption {
  if (
    typeof reading?.startValue !== 'number' ||
    typeof reading.endValue !== 'number'
  )
    return { status: 'incomplete' }
  const replacements = reading.replacements ?? []
  for (const [index, replacement] of replacements.entries()) {
    const previous = replacements[index - 1]
    if (previous && replacement.date < previous.date)
      return { status: 'invalid', reason: 'replacement_order' }
    if (
      (reading.startDate && replacement.date < reading.startDate) ||
      (reading.endDate && replacement.date > reading.endDate)
    )
      return { status: 'invalid', reason: 'replacement_outside' }
  }
  const segments: MeterReadingSegment[] = []
  let meterNumber = reading.meterNumber?.trim() || null
  let from = reading.startDate ?? null
  let startValue = reading.startValue
  for (const replacement of replacements) {
    segments.push({
      meterNumber,
      from,
      to: replacement.date,
      startValue,
      endValue: replacement.removedEndValue,
      consumption: round3(replacement.removedEndValue - startValue),
    })
    meterNumber = replacement.installedMeterNumber?.trim() || null
    from = replacement.date
    startValue = replacement.installedStartValue
  }
  segments.push({
    meterNumber,
    from,
    to: reading.endDate ?? null,
    startValue,
    endValue: reading.endValue,
    consumption: round3(reading.endValue - startValue),
  })
  return {
    status: 'complete',
    total: round3(
      segments.reduce((sum, { consumption }) => sum + consumption, 0),
    ),
    segments,
  }
}

/** Verbrauch laut Zählerständen oder `null`, wenn nicht ableitbar. */
export function meterReadingTotal(
  reading: Readonly<HeatMeterReading> | null | undefined,
): number | null {
  const result = meterReadingConsumption(reading)
  return result.status === 'complete' ? result.total : null
}
