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
  'Bei Ein- oder Auszug im Abrechnungsjahr werden die Betriebskosten nach Kalendertagen anteilig berechnet. Bei den Heizkosten erfolgt die Aufteilung bei Nutzerwechsel nach § 9b HeizKV: Grundkosten nach Kalendertagen, Verbrauchskosten nach dem erfassten Verbrauch. Auf Leerstandszeiten entfallende Kosten trägt der Vermieter.'

/** Hinweis unter der Ergebnistabelle (Rechnen mit ungerundeten Werten). */
export const ROUNDING_DIFFERENCE_NOTICE =
  'Aufgrund der Berechnung mit ungerundeten Einzelwerten können Rundungsdifferenzen von 0,01 € auftreten.'

export type ConsumptionCaptureMode = 'heat_meter' | 'manual_reading'

export type BaseAreaBasis = 'usable_area' | 'heated_area'

export function baseAreaLabel(basis: BaseAreaBasis): string {
  return basis === 'usable_area' ? 'Wohnfläche' : 'beheizte Fläche'
}

/** Dativform für „nach …“-Formulierungen. */
function formatSharePercent(value: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(
    value,
  )
}

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
    /** § 9a Abs. 2 HeizKV: geschätzter Flächenanteil in Prozent. */
    readonly areaOnlySection9aPercent?: number
  } = {},
): string {
  const basePercent = 100 - consumptionSharePercent
  const area = baseAreaDative(options.baseAreaBasis ?? 'heated_area')
  const capture = captureLabel(options.captureMode ?? 'manual_reading')
  // Ohne konfigurierte Warmwasserabgrenzung wird Warmwasser bewusst nicht
  // erwähnt (Vermieterentscheidung, keine Herausrechnung).
  const hotWater = options.hasCentralHotWater
    ? ' Die Kosten der zentralen Warmwasserbereitung werden gesondert ermittelt und verteilt (§ 9 HeizKV).'
    : ''
  if (options.areaOnlySection9aPercent !== undefined)
    return `Heizkostenverteilung (§ 9a Abs. 2 HeizKV): Für ${formatSharePercent(options.areaOnlySection9aPercent)} % der beheizten Fläche Ihres Heizkreises konnte der Verbrauch nicht ordnungsgemäß erfasst werden und wurde geschätzt. Bei mehr als 25 % sind die Heizkosten ausschließlich nach ${area} zu verteilen; ein verbrauchsabhängiger Anteil entfällt. Die CO2-Kosten werden nach dem CO2KostAufG gesondert ausgewiesen und sind im Heizkostenbetrag nicht enthalten.${hotWater}`
  return `Heizkostenverteilung (§§ 7, 8 HeizKV): Die Heizkosten Ihres Heizkreises werden zu ${consumptionSharePercent} % nach ${capture} und zu ${basePercent} % nach ${area} (Grundkosten) verteilt. Die CO2-Kosten werden nach dem CO2KostAufG gesondert ausgewiesen und sind im Heizkostenbetrag nicht enthalten.${hotWater}`
}

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

/** Liegenschafts- und Abrechnungsdaten (Fußtabelle). */
export const PROPERTY_DATA_HEADING = 'Liegenschafts- und Abrechnungsdaten'

/** § 6a HeizKV: Steuern und Abgaben in den Brennstoffkosten. */
export const ENERGY_TAXES_NOTICE =
  'In den Brennstoff- und Energiekosten sind die gesetzlichen Steuern und Abgaben (Umsatzsteuer, Energiesteuer, ggf. CO2-Kosten nach BEHG) enthalten.'

/** § 6a HeizKV: Entgelte für die Verbrauchserfassung und Abrechnung. */
export function meteringFeesText(amount: string | null): string {
  return amount
    ? `Entgelte für Verbrauchserfassung und Abrechnung (Gerätemiete, Ablesung, Abrechnung, Eichung): ${amount}; sie sind in den Betriebskosten der Heizungsanlage enthalten.`
    : 'Die Entgelte für Verbrauchserfassung und Abrechnung sind in den Betriebskosten der Heizungsanlage enthalten.'
}

/** § 6a HeizKV: Hinweis auf die Verbraucherschlichtungsstelle. */
export const DISPUTE_RESOLUTION_NOTICE =
  'Bei Streitigkeiten können Sie sich an die Allgemeine Verbraucherschlichtungsstelle des Zentrums für Schlichtung e. V., Straßburger Straße 8, 77694 Kehl (www.verbraucher-schlichter.de) wenden. Der Vermieter ist zur Teilnahme an einem Streitbeilegungsverfahren nicht verpflichtet und nimmt daran nicht teil.'

/** § 6a HeizKV: Energieträger mit Anteilen. */
export const ENERGY_CARRIER_MIX_LABEL =
  'Eingesetzte Energieträger Ihres Heizkreises'

/** § 6a HeizKV: Überschrift des Vorjahresvergleichs. */
export const PREVIOUS_PERIOD_COMPARISON_HEADING =
  'Vergleich mit dem vorhergehenden Abrechnungszeitraum'

/** Vorjahresvergleich: Grafik ohne Witterungsbereinigung. */
export const PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED =
  'Darstellung der erfassten Verbrauchswerte ohne Witterungsbereinigung.'

/** § 6a HeizKV: Kein Vorjahresvergleich, weil keine Vorjahresabrechnung vorliegt. */
export const NO_PREVIOUS_PERIOD_DATA =
  'Ein grafischer, witterungsbereinigter Vergleich mit dem vorhergehenden Abrechnungszeitraum ist nicht möglich, weil für diesen Zeitraum keine Verbrauchsdaten vorliegen (Eigentümer- bzw. Abrechnungswechsel).'

/** § 6a HeizKV: Vorjahresabrechnung vorhanden, aber ohne Verbrauch der Wohnung. */
export const NO_PREVIOUS_PERIOD_CONSUMPTION =
  'Ein grafischer, witterungsbereinigter Vergleich mit dem vorhergehenden Abrechnungszeitraum ist nicht möglich, weil für Ihre Nutzung in diesem Zeitraum keine Verbrauchswerte erfasst sind.'

/** § 6a HeizKV: Nutzer hat die Wohnung im Vorjahr noch nicht genutzt. */
export const NOT_RESIDENT_IN_PREVIOUS_PERIOD =
  'Ein Vergleich mit dem vorhergehenden Abrechnungszeitraum entfällt, weil Sie die Wohnung in diesem Zeitraum noch nicht genutzt haben.'

/**
 * Mittelwert des Heizkreises. Er ist kein Vergleich mit einem normierten
 * oder durch Vergleichstests ermittelten Durchschnittsnutzer (§ 6a Abs. 3
 * HeizKV) und wird deshalb nur als Einordnung im Gebäude bezeichnet.
 */
export const CIRCUIT_AVERAGE_LABEL =
  'Mittlerer Verbrauch im Heizkreis (umgerechnet auf Ihre Fläche und Nutzungsdauer)'

/** Erläuterung des Heizkreis-Mittelwerts. */
export function circuitAverageExplanation(
  totalConsumption: string,
  area: string,
): string {
  return `Der mittlere Verbrauch im Heizkreis ergibt sich aus dem Gesamtverbrauch des Heizkreises (${totalConsumption}) geteilt durch die Fläche (${area}); er dient der Einordnung Ihres Verbrauchs innerhalb des Gebäudes.`
}
