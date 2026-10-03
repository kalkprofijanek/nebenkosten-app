/**
 * Pflicht- und Erläuterungstexte der Abrechnungen. Ursprünglich aus dem
 * Legacy übernommen (`legacy/index.html`), nach mietrechtlicher Prüfung
 * (§§ 556, 556a, 259 BGB, BetrKV, HeizKV §§ 6–9b/12, CO2KostAufG §§ 5–7)
 * korrigiert und ergänzt.
 */

/** Hinweis auf geschätzte Verbrauchswerte (§ 9a HeizKV) inkl. Schätzgrund. */
export function estimatedConsumptionNote(reason?: string | null): string {
  const trimmed = reason?.trim()
  return `* Ihr Verbrauch wurde geschätzt (§ 9a HeizKV).${
    trimmed ? ` Grund der Schätzung: ${trimmed}` : ''
  }`
}

/** Kompatibler Kurztext ohne Schätzgrund. */
export const ESTIMATED_CONSUMPTION_NOTE = estimatedConsumptionNote()

/** Erläuterung des Zeitfaktors bei Teilzeiträumen (§ 9b HeizKV). */
export const TIME_FACTOR_EXPLANATION =
  'Zeitfaktor: Bei Teilzeiträumen werden flächen- und wohneinheitenbezogene Betriebskosten sowie die Heiz-Grundkosten nach Kalendertagen anteilig berechnet (§ 9b HeizKV); die Verbrauchskosten richten sich nach Ihrem erfassten Verbrauch im Nutzungszeitraum. Auf Leerstandszeiten entfallende Kosten trägt der Vermieter.'

export type ConsumptionCaptureMode = 'heat_meter' | 'manual_reading'

export type BaseAreaBasis = 'usable_area' | 'heated_area'

export function baseAreaLabel(basis: BaseAreaBasis): string {
  return basis === 'usable_area' ? 'Wohnfläche' : 'beheizte Fläche'
}

/** Dativform für „nach …“-Formulierungen. */
function baseAreaDative(basis: BaseAreaBasis): string {
  return basis === 'usable_area' ? 'Wohnfläche' : 'beheizter Fläche'
}

function captureLabel(mode: ConsumptionCaptureMode): string {
  return mode === 'heat_meter'
    ? 'gemessenem Wärmeverbrauch (Wohnungs-Wärmemengenzähler, kWh)'
    : 'erfasstem Verbrauch laut Ablesung (Verbrauchseinheiten)'
}

/** Erläuterung der Heizkostenverteilung (§§ 7, 8 HeizKV). */
export function heatingSplitExplanation(
  consumptionSharePercent: number,
  options: {
    readonly baseAreaBasis?: BaseAreaBasis
    readonly captureMode?: ConsumptionCaptureMode
    readonly hasCentralHotWater?: boolean
  } = {},
): string {
  const basePercent = 100 - consumptionSharePercent
  const area = baseAreaDative(options.baseAreaBasis ?? 'heated_area')
  const capture = captureLabel(options.captureMode ?? 'manual_reading')
  const hotWater = options.hasCentralHotWater
    ? ' Die Kosten der zentralen Warmwasserbereitung werden gesondert ermittelt und verteilt (§ 9 HeizKV).'
    : ' Eine zentrale Warmwasserbereitung besteht nicht.'
  return `Heizkostenverteilung (§§ 7, 8 HeizKV): Die Heizkosten Ihres Heizkreises werden zu ${consumptionSharePercent} % nach ${capture} und zu ${basePercent} % nach ${area} (Grundkosten) verteilt. Die CO2-Kosten werden nach dem CO2KostAufG gesondert ausgewiesen und sind im Heizkostenbetrag nicht enthalten.${hotWater}`
}

export const NO_CENTRAL_HOT_WATER =
  'Eine zentrale Warmwasserbereitung besteht nicht.'

/** Überschrift der CO2-Kostenaufteilung. */
export const CO2_COST_ALLOCATION_HEADING =
  'CO2-Kostenaufteilung (Angaben nach § 7 Abs. 3 CO2KostAufG)'

/** Kompatibler Alias der Überschrift in der Einzelabrechnung. */
export const CO2_LABEL_HEADING = CO2_COST_ALLOCATION_HEADING

export const NO_BEHG_CO2_COSTS =
  'Keine CO2-Kosten nach BEHG angefallen (z. B. Wärmepumpe, Biomasse oder Fernwärme ohne CO2-Preisbestandteil).'

/** Zeile zum Mieteranteil an den CO2-Kosten. */
export function co2TenantShareLine(
  percent: number,
  emissionFree: boolean,
): string {
  return emissionFree
    ? 'CO2-Kosten: keine Kosten nach BEHG angefallen'
    : `CO2-Kosten Mieteranteil ${percent} % (Stufenmodell § 5 CO2KostAufG)`
}

/** Pflichtsatz: Vermieteranteil ist abgezogen und wird nicht umgelegt. */
export function co2LandlordDeductedSentence(landlordFormatted: string): string {
  return `Der Vermieteranteil an den CO2-Kosten von ${landlordFormatted} wurde von den Heizkosten abgezogen und wird nicht auf die Mieter umgelegt (§ 7 Abs. 3 CO2KostAufG).`
}

/** Erläuterung der Verteilung des CO2-Mieteranteils (Vermieterentscheidung). */
export function co2DistributionSentence(
  baseSharePercent: number,
  consumptionSharePercent: number,
  baseAreaBasis: BaseAreaBasis,
): string {
  return `Der Mieteranteil wird wie die Heizkosten zu ${baseSharePercent} % nach ${baseAreaDative(baseAreaBasis)} und zu ${consumptionSharePercent} % nach Verbrauch auf die Nutzer verteilt.`
}

/** Einwendungsfrist und Belegeinsicht (§ 556 Abs. 3 BGB, § 259 BGB). */
export const OBJECTION_NOTICE =
  'Einwendungen gegen diese Abrechnung können Sie bis zum Ablauf des zwölften Monats nach Zugang der Abrechnung geltend machen (§ 556 Abs. 3 BGB). Die Abrechnungsbelege können Sie nach vorheriger Terminvereinbarung einsehen.'

/** Zahlungsaufforderung bei Nachzahlung. */
export function additionalPaymentText(options: {
  readonly amount: string
  readonly dueDate: string
  readonly iban: string | null
  readonly reference: string
}): string {
  const account = options.iban ? ` auf das Konto IBAN ${options.iban}` : ''
  return `Bitte überweisen Sie den Nachzahlungsbetrag von ${options.amount} bis zum ${options.dueDate}${account}, Verwendungszweck „${options.reference}“.`
}

/** Hinweis bei Guthaben. */
export function creditText(amount: string): string {
  return `Ihr Guthaben von ${amount} überweisen wir Ihnen innerhalb von vier Wochen bzw. verrechnen es mit der nächsten Miete.`
}

export const BALANCED_TEXT =
  'Ihre Vorauszahlungen decken Ihren Kostenanteil genau; es ergibt sich weder eine Nachzahlung noch ein Guthaben.'

/** Überschrift Verbrauchsinformation (§ 6a HeizKV). */
export const CONSUMPTION_INFORMATION_HEADING =
  'Abrechnungs- und Verbrauchsinformationen (§ 6a HeizKV)'

/** Hinweis auf Beratungsstellen (§ 6a Abs. 3 HeizKV). */
export const ENERGY_ADVICE_NOTICE =
  'Informationen zu Energieeffizienzmaßnahmen und unabhängiger Energieberatung erhalten Sie bei den Verbraucherzentralen (www.verbraucherzentrale-energieberatung.de) sowie bei Energieagenturen, z. B. der Deutschen Energie-Agentur (www.dena.de).'

/** Liegenschaftsdaten-Fußtabelle (§ 259 BGB). */
export const PROPERTY_DATA_HEADING = 'Liegenschaftsdaten (§ 259 BGB)'
