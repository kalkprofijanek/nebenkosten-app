/**
 * Texte der monatlichen Verbrauchsinformation (§ 6a HeizKV, ADR-0014
 * Schritt 3). Rein darstellend; Rechenregeln liegen in
 * `@nebenkosten/core` (`calculateMonthlyConsumptionInformation`).
 */
import type {
  MonthlyAverageUserUnavailableReason,
  MonthlyValueUnavailableReason,
} from '@nebenkosten/core'

export const MONTHLY_INFORMATION_LEGAL_BASIS =
  'Diese Verbrauchsinformation erhalten Sie nach § 6a Heizkostenverordnung (HeizKV), weil die Verbräuche Ihrer Wohnung mit fernablesbaren Erfassungsgeräten ermittelt werden.'

export const MONTHLY_INFORMATION_NOT_A_BILL =
  'Diese Information ist keine Abrechnung und begründet keine Zahlungspflicht. Maßgeblich bleibt die Jahresabrechnung der Heizkosten.'

/**
 * Kontaktsatz am Ende der Verbrauchsinformation; `null`, wenn weder
 * Telefon noch E-Mail hinterlegt sind.
 */
export function monthlyInformationContactSentence(
  phone: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const parts = [
    phone?.trim() ? `telefonisch unter ${phone.trim()}` : null,
    email?.trim() ? `per E-Mail an ${email.trim()}` : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0
    ? `Bei Fragen erreichen Sie uns ${parts.join(' oder ')}.`
    : null
}

export const MONTHLY_INFORMATION_PARTIAL_PERIOD =
  'Für Teilzeiträume wird der Monatsverbrauch der Wohnung anteilig zugerechnet: Heizung nach Gradtagszahlen, Warmwasser nach Kalendertagen.'

const valueReasons: Readonly<Record<MonthlyValueUnavailableReason, string>> = {
  reading_missing: 'Zählerstand fehlt',
  negative_consumption: 'Zählerstand geringer als im Vormonat',
  reading_conflict: 'widersprüchliche Zählerstände',
  meter_not_assigned: 'kein Zähler zugeordnet',
  no_usage: 'Sie haben die Wohnung in diesem Monat nicht genutzt',
  usage_unknown: 'Nutzung nicht feststellbar',
}

const averageReasons: Readonly<
  Record<MonthlyAverageUserUnavailableReason, string>
> = {
  no_benchmark: 'keine Vergleichswerte hinterlegt',
  area_unknown: 'Wohnfläche nicht erfasst',
  hot_water_energy_unknown:
    'Vergleichswerte enthalten Warmwasser; Ihr Warmwasserverbrauch wird nicht erfasst',
}

export function notCollectedText(
  reason: MonthlyValueUnavailableReason,
): string {
  return `nicht erhoben (${valueReasons[reason]})`
}

export function averageUnavailableText(
  reason: MonthlyAverageUserUnavailableReason,
): string {
  return `nicht ermittelbar (${averageReasons[reason]})`
}

export function averageUserExplanation(options: {
  source: string
  category: string
  referenceYear: number
  benchmark: string
  area: string
  areaLabel: string
  share: string
}): string {
  return `Durchschnittsnutzer: Mitte der Klasse „mittel“ der Vergleichswerte „${options.source}“ (${options.category}, Bezugsjahr ${options.referenceYear}), ${options.benchmark} kWh/m² im Jahr × ${options.area} m² ${options.areaLabel}, nach Gradtagszahlen auf Ihren Zeitraum verteilt (${options.share} des Jahres).`
}

export const AVERAGE_USER_APPROXIMATION =
  'Näherung: Die Vergleichswerte enthalten die Energie für Warmwasser. Verglichen wird daher mit Ihrem Verbrauch für Heizung und Warmwasser zusammen; auch der Warmwasseranteil wird nach Gradtagszahlen verteilt.'

export function hotWaterConversionText(
  temperature: string,
  estimated: boolean,
): string {
  return `Warmwasser-Energie nach § 9 Abs. 2 HeizKV: 2,5 × m³ × (Warmwassertemperatur − 10 °C) mit ${temperature} °C.${estimated ? ` Temperatur ${temperature} °C geschätzt.` : ''}`
}
