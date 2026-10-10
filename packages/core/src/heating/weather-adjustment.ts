/**
 * Witterungsbereinigter Vorperiodenvergleich (§ 6a Abs. 3 Satz 3 und 4
 * HeizKV) mit den Klimafaktoren des Deutschen Wetterdienstes (ADR-0005).
 *
 * Der DWD weist je Postleitzahl einen Faktor für einen Zwölfmonatszeitraum
 * aus. Bereinigt wird durch Multiplikation des Heizverbrauchs des Zeitraums
 * mit seinem Faktor; beide Perioden werden so auf dasselbe Referenzklima
 * bezogen und sind vergleichbar. Der Verbrauch der Einzelabrechnung
 * (Heizkostenverteiler-Einheiten oder Wärmemenge) enthält kein Warmwasser
 * und wird deshalb vollständig bereinigt.
 */
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
  Property,
} from '@nebenkosten/schema'

/** Erste fünfstellige Zahl aus „PLZ Ort“ (Vorschlag für den Klimafaktor). */
export function postalCodeFromAddress(
  postalCodeAndCity: string | null | undefined,
): string | null {
  return /(?<!\d)(\d{5})(?!\d)/u.exec(postalCodeAndCity ?? '')?.[1] ?? null
}

export type ClimateFactorCheck =
  | { status: 'missing'; expectedPostalCode: string | null }
  | { status: 'period_mismatch'; expectedPostalCode: string | null }
  | { status: 'postal_code_mismatch'; expectedPostalCode: string }
  | { status: 'matching'; expectedPostalCode: string | null; factor: number }

/**
 * Passt der Klimafaktor zum Abrechnungsjahr? Der Zeitraum muss genau dem
 * Abrechnungszeitraum entsprechen, die Postleitzahl der des Objekts (wenn
 * diese bekannt ist).
 */
export function checkClimateFactor(
  period: Readonly<BillingPeriod>,
  property: Readonly<Property> | null | undefined,
): ClimateFactorCheck {
  const expectedPostalCode = postalCodeFromAddress(
    property?.address?.postalCodeAndCity,
  )
  const climate = period.climateFactor
  if (!climate) return { status: 'missing', expectedPostalCode }
  if (
    climate.periodStart !== period.periodStart ||
    climate.periodEnd !== period.periodEnd
  )
    return { status: 'period_mismatch', expectedPostalCode }
  if (expectedPostalCode && climate.postalCode !== expectedPostalCode)
    return { status: 'postal_code_mismatch', expectedPostalCode }
  return { status: 'matching', expectedPostalCode, factor: climate.factor }
}

/**
 * Klimafaktor des Vorjahres für eine Nutzung: aus dem Vorjahr im System,
 * sonst aus dem gespeicherten Vorjahresverbrauch (z. B. nach
 * Eigentümerwechsel). Gleiche Quellenwahl wie der Vorjahresvergleich der
 * Einzelabrechnung.
 */
export function previousPeriodClimateFactor(
  data: Readonly<AppDataFile>,
  period: Readonly<BillingPeriod>,
  occupancy: Readonly<OccupancyPeriod>,
): number | null {
  const previousPeriod = data.billingData.billingPeriods.find(
    (candidate) =>
      candidate.propertyId === period.propertyId &&
      candidate.year === period.year - 1,
  )
  const previousInSystem =
    previousPeriod !== undefined &&
    data.billingData.occupancyPeriods.some(
      ({ billingPeriodId }) => billingPeriodId === previousPeriod.id,
    )
  if (previousInSystem) return previousPeriod.climateFactor?.factor ?? null
  const stored = occupancy.previousConsumption
  return stored && stored.year === period.year - 1
    ? (stored.climateFactor ?? null)
    : null
}

export interface WeatherAdjustedValue {
  value: number
  climateFactor: number
  /** Bereinigter Verbrauch (Wert × Klimafaktor), zwei Nachkommastellen. */
  adjusted: number
}

export interface WeatherAdjustedComparison {
  previous: WeatherAdjustedValue
  current: WeatherAdjustedValue
  /** Veränderung des bereinigten Verbrauchs in Prozent, eine Stelle. */
  changePercent: number | null
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function adjust(value: number, climateFactor: number): WeatherAdjustedValue {
  return { value, climateFactor, adjusted: round(value * climateFactor, 2) }
}

export function weatherAdjustPreviousPeriod(
  current: { value: number; climateFactor: number },
  previous: { value: number; climateFactor: number },
): WeatherAdjustedComparison {
  for (const { value, climateFactor } of [current, previous])
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isFinite(climateFactor) ||
      climateFactor <= 0
    )
      throw new RangeError(
        'Verbrauch und Klimafaktor müssen endliche, nicht negative Zahlen sein; der Klimafaktor größer als 0.',
      )
  const previousAdjusted = adjust(previous.value, previous.climateFactor)
  const currentAdjusted = adjust(current.value, current.climateFactor)
  return {
    previous: previousAdjusted,
    current: currentAdjusted,
    changePercent:
      previousAdjusted.adjusted > 0
        ? round(
            ((currentAdjusted.adjusted - previousAdjusted.adjusted) /
              previousAdjusted.adjusted) *
              100,
            1,
          )
        : null,
  }
}
