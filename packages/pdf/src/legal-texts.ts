/**
 * Wörtlich aus dem Legacy übernommene Pflicht-/Erläuterungstexte
 * (`legacy/index.html`, Zeilen wie referenziert). Kein neuer §12-HeizKV-
 * Kürzungshinweis (bewusste PR-11-Entscheidung: Legacy-Verhalten spiegeln,
 * fachlich-rechtliche Prüfung folgt separat).
 */

/** Legacy Zeile 6020: Hinweis auf geschätzte HKV-Werte (§ 9a HeizKV). */
export const ESTIMATED_CONSUMPTION_NOTE =
  '* Verbrauchseinheiten (HKV) wurden geschätzt (§ 9a HeizKV).'

/** Legacy Zeile 6031: Erläuterung des Zeitfaktors bei Teilzeiträumen. */
export const TIME_FACTOR_EXPLANATION =
  'Zeitfaktor: Bei Teilzeiträumen werden Betriebskosten nach Kalendertagen und Heiz-Grundkosten nach Nutzungs-/Gradtaganteil berücksichtigt (§§ 7, 8 HeizKV — Heizkostenverordnung).'

/** Legacy Zeile 6032: Erläuterung der Heizkostenverteilung. */
export function heatingSplitExplanation(
  consumptionSharePercent: number,
): string {
  const basePercent = 100 - consumptionSharePercent
  return `Heizkostenverteilung (§§ 7, 8 HeizKV): Die Heizkosten Ihres Heizkreises werden zu ${consumptionSharePercent} % nach erfasstem Verbrauch (Heizkostenverteiler-Ablesung) und zu ${basePercent} % nach Nutzfläche (Grundkostenanteil) verteilt. Die CO2-Abgabe wird nach dem CO2KostAufG separat ausgewiesen und ist im Heizkostenbetrag nicht enthalten. Warmwasser (sofern zutreffend) wird separat als eigene Abrechnungszeile ausgewiesen (§ 9 HeizKV).`
}

/** Legacy Zeile 5666: CO2-Kostenaufteilung Pflichtangabe. */
export const CO2_COST_ALLOCATION_HEADING =
  'CO2-Kostenaufteilung (Pflichtangaben § 7 Abs. 3 CO2KostAufG)'

/** Legacy Zeilen 6050/6060: CO2-Ausweis Pflichtangabe. */
export const CO2_LABEL_HEADING =
  'CO2-Ausweis nach CO2KostAufG §5 (Pflichtangabe)'

/** Legacy Zeilen 5955-5957: CO2-Mieteranteil-Zeile. */
export function co2TenantShareLine(
  percent: number,
  emissionFree: boolean,
): string {
  return emissionFree
    ? `CO2-Kosten ${percent} % Mieteranteil — emissionsarme Heizung`
    : `CO2-Kosten Mieteranteil ${percent} % (CO2KostAufG §5)`
}

/** Legacy Zeile 6067: Liegenschaftsdaten-Fußtabelle (§ 259 BGB). */
export const PROPERTY_DATA_HEADING = 'Liegenschaftsdaten (§ 259 BGB)'
