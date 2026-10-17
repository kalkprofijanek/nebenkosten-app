/**
 * Datenquellen für Referenzwerte (PR-36). Die App liefert diese Daten nicht
 * mit und ruft sie nicht ab (keine Netzverbindung, `connect-src 'none'`);
 * sie verlinkt die Quellen. Im KI-Ablauf holt der Agent die Werte selbst
 * (`docs/DATENQUELLEN.md`, `docs/KI-ANLEITUNG.md`).
 */
export interface ReferenceSource {
  readonly label: string
  readonly href: string
  /** Kurzer Hinweis zu Inhalt, Nutzung oder Lizenz. */
  readonly note: string
}

export const DWD_CLIMATE_FACTORS: ReferenceSource = {
  label: 'Deutscher Wetterdienst – Klimafaktoren',
  href: 'https://opendata.dwd.de/climate_environment/CDC/derived_germany/techn/monthly/climate_correction_factor/recent/',
  note: 'Datei KF_JJJJ0101_JJJJ1231.csv für das Kalenderjahr laden und hier einlesen; Quellenvermerk „Deutscher Wetterdienst“.',
}

export const HEIZSPIEGEL: ReferenceSource = {
  label: 'Heizspiegel für Deutschland (co2online)',
  href: 'https://www.heizspiegel.de/',
  note: 'Vergleichswerte des aktuellen Heizspiegels passend zu Energieträger und Gebäudefläche übernehmen; Quelle und Jahr angeben. Die Daten werden nicht mitgeliefert.',
}
