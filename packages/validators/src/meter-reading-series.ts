/**
 * Hinweise aus der Plausibilitätsprüfung von Zählerstandsreihen (PR-31).
 *
 * Reihen entstehen je Zähler aus den Ablesungen aller Jahre und je
 * Wohnungswärmezähler bzw. HKV aus den erfassten Anfangs- und Endständen der
 * Nutzungen derselben Wohnung (gleiche Zählernummer). Gemeldet wird ein
 * Befund nur, wenn er eine Ablesung des geprüften Jahres betrifft. Die
 * Prüfung ändert keine Werte (keine stille Korrektur).
 */
import {
  assessMeterReadingSeries,
  type MeterReadingFinding,
  type MeterReadingPoint,
} from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  ValidationIssue,
} from '@nebenkosten/schema'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

const TITLES: Record<MeterReadingFinding['kind'], string> = {
  decreasing: 'Zählerstand rückläufig',
  stalled: 'Zähler steht seit mehreren Ablesungen',
  digit_drop: 'Zählerstand vermutlich um eine Stelle verschoben',
  swapped_columns: 'Zählerstände vermutlich vertauscht',
  implausible_share: 'Teilverbrauch passt nicht zu den Gradtagszahlen',
}

function formatNumber(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 3 })
}

function detail(finding: MeterReadingFinding, label: string): string {
  const alternative =
    finding.alternativeValues && finding.alternativeConsumption !== null
      ? ` Alternative Lesung: ${finding.alternativeValues.map(formatNumber).join(' / ')}; Verbrauch dann ${formatNumber(finding.alternativeConsumption)} statt ${formatNumber(finding.consumption)}.`
      : ''
  const share =
    finding.kind === 'implausible_share' &&
    finding.actualShare !== undefined &&
    finding.expectedShare !== undefined
      ? ` Gemessen ${Math.round(finding.actualShare * 100)} % des Verbrauchs, nach Gradtagszahlen erwartet ${Math.round(finding.expectedShare * 100)} %.`
      : ''
  return `${label}.${alternative}${share} Bitte Ablesebeleg prüfen und entscheiden: Wert übernehmen, als Schätzung kennzeichnen oder belassen. Die App ändert nichts selbst.`
}

interface Point extends MeterReadingPoint {
  readonly inPeriod: boolean
}

function report(
  points: readonly Point[],
  entity: NonNullable<ValidationIssue['entity']>,
  label: string,
  add: Add,
): void {
  const inPeriod = new Set(
    points.filter((point) => point.inPeriod).map(({ id }) => id),
  )
  if (inPeriod.size === 0) return
  for (const finding of assessMeterReadingSeries(points)) {
    if (!finding.readingIds.some((id) => inPeriod.has(id))) continue
    add(
      issue(
        'warning',
        `heating.meter_reading_series_${finding.kind}`,
        'heating',
        TITLES[finding.kind],
        { entity, detail: detail(finding, label) },
      ),
    )
  }
}

function previousDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10)
}

export function meterReadingSeriesIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  const periodIds = new Set(
    data.billingData.billingPeriods
      .filter(({ propertyId }) => propertyId === period.propertyId)
      .map(({ id }) => id),
  )
  const within = (date: string) =>
    date >= previousDay(period.periodStart) && date <= period.periodEnd

  // Zähler mit eigenen Ablesungen (Hauptzähler, WMZ im Messmodus).
  for (const meter of data.masterData.meters) {
    if (meter.propertyId !== period.propertyId) continue
    const points: Point[] = data.billingData.meterReadings
      .filter(
        (reading) =>
          reading.meterId === meter.id &&
          reading.date != null &&
          reading.source !== 'estimated',
      )
      .map((reading) => ({
        id: reading.id,
        date: reading.date!,
        value: reading.value.value,
        inPeriod:
          reading.billingPeriodId === period.id || within(reading.date!),
      }))
    report(
      points,
      { type: 'Meter', id: meter.id },
      `Zähler ${meter.meterNumber ?? meter.id}`,
      add,
    )
  }

  // Erfasste Stände je Wohnung und Zählernummer über alle Jahre.
  const series = new Map<
    string,
    { points: Point[]; occupancyId: string | null; label: string }
  >()
  const periods = new Map(
    data.billingData.billingPeriods.map((item) => [item.id, item]),
  )
  for (const occupancy of data.billingData.occupancyPeriods) {
    if (!periodIds.has(occupancy.billingPeriodId)) continue
    const reading = occupancy.heatMeterReading
    if (!reading?.meterNumber || (reading.replacements?.length ?? 0) > 0)
      continue
    const own = periods.get(occupancy.billingPeriodId)!
    const key = `${occupancy.unitId}|${reading.meterNumber}`
    const entry = series.get(key) ?? {
      points: [],
      occupancyId: null,
      label: `Zähler ${reading.meterNumber}`,
    }
    const current = occupancy.billingPeriodId === period.id
    if (current) entry.occupancyId ??= occupancy.id
    const push = (
      suffix: string,
      date: string,
      value: number | null | undefined,
    ) => {
      if (value == null) return
      if (
        entry.points.some(
          (point) => point.date === date && point.value === value,
        )
      )
        return
      entry.points.push({
        id: `${occupancy.id}:${suffix}`,
        date,
        value,
        inPeriod: current,
      })
    }
    push(
      'start',
      reading.startDate ?? previousDay(occupancy.from ?? own.periodStart),
      reading.startValue,
    )
    push(
      'end',
      reading.endDate ?? occupancy.to ?? own.periodEnd,
      reading.endValue,
    )
    series.set(key, entry)
  }
  for (const entry of series.values())
    if (entry.occupancyId)
      report(
        entry.points,
        { type: 'OccupancyPeriod', id: entry.occupancyId },
        entry.label,
        add,
      )
}
