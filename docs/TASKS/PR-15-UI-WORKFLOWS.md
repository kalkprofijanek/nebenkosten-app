# PR 15 – Produktionsfähige Bedienoberfläche und Datenpflege

Verantwortlich: Codex. Finale Freigabe: Mensch.

## Capability

Die lokal arbeitende Nebenkosten-App wird von einer überwiegend anlegenden
Demonstrationsoberfläche zu einem nachvollziehbaren Arbeitsplatz ausgebaut.
Eine bearbeitende Person erkennt jederzeit Firma, Objekt, Abrechnungsjahr und
Status, kann vorhandene Daten gezielt korrigieren und gelangt von einem
Prüfhinweis direkt zum betroffenen Arbeitsbereich.

## Feste Grenzen

- Schema v4, Migration, Rechenengine und PDF-Snapshot-Verträge bleiben
  unverändert.
- Fachänderungen laufen über immutable Commands und validieren das vollständige
  Ergebnis.
- `READY_FOR_PDF`, `FINALIZED` und `SUPERSEDED` bleiben außerhalb des geprüften
  Wiederöffnungsablaufs schreibgeschützt.
- Kritische Wiederherstellungen und Statusänderungen behalten ihre bestehenden
  Snapshot- und Audit-Verträge.
- Keine Netzwerkzugriffe, Telemetrie oder produktiven Daten in Git, Tests oder
  Screenshots.
- Referenzierte Entitäten werden nicht kaskadierend gelöscht.

## Einheitlicher Arbeitsablauf

1. aktiven Kontext wählen,
2. Bereich öffnen,
3. Bestand suchen oder filtern,
4. Datensatz auswählen,
5. bewusst „Bearbeiten“ wählen,
6. Eingaben prüfen,
7. explizit speichern oder abbrechen,
8. Erfolg oder verständlichen Fehler sehen.

Die verzögerte lokale Speicherung des Arbeitsbestands bleibt bestehen. Ein
Formular ändert den Fachbestand trotzdem erst beim expliziten Speichern.

## Capability-Matrix

| Bereich           | Bestand vor PR 15                                                                      | Erforderlicher Bearbeitungsweg                                                                                                                     | Validator-/Abhängigkeitsbezug                                      |
| ----------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Anwendungskontext | Auswahl nur in einzelnen Formularseiten; Kopfzeile fest auf „Noch kein Objekt gewählt“ | globaler Firmen-/Objekt-/Jahresumschalter, gültige Auswahl nach Anlage und Reload, sichtbarer Status                                               | alle jahresbezogenen Aktionen müssen zum gewählten Kontext gehören |
| Dashboard         | globale Anzahlen, fest „8 Schritte“, zehn angezeigte Routen                            | kontextbezogene Kennzahlen, gemeinsame Schrittdefinition, Status `nicht begonnen`/`unvollständig`/`fehlerhaft`/`bereit`/`abgeschlossen`/`gesperrt` | Validatorbericht und letzter Rechenlauf bestimmen Bereitschaft     |
| Firmen            | anlegen, auswählen, Namen auflisten                                                    | Stammdaten anzeigen und bearbeiten; Anschrift, Kontakt, Postfach, Bankkonto; Löschung nur ohne Referenzen                                          | `master_data.owner_company_missing`, `master_data.iban_missing`    |
| Objekte           | Objekt, erstes Gebäude und erste Einheit gemeinsam anlegen                             | Objekt, Gebäude und beliebig viele Einheiten getrennt pflegen; Adresse, Bankkonto, Flächen und Bezeichnungen bearbeiten                            | `master_data.property_address_missing`, IBAN, Nutz-/Heizfläche     |
| Abrechnungsjahre  | Jahr anlegen und auswählen                                                             | Zeitraum, Hinweise, Anschreiben und Heizvorgaben im Entwurf pflegen; Status nur über Release-Transitions                                           | Zeitraum-/Jahrfehler, Statussperren                                |
| Nutzer            | Nutzer oder Leerstand anlegen, einfache Namensliste                                    | Person, Mietverhältnis, Zeitraum, Versandadresse, Personen, Verbrauch, Vorauszahlung und Leerstand bearbeiten                                      | Nutzungszeiträume, Versandadresse, Vorauszahlungen, Flächen        |
| Kostenarten       | Kostenart und genau eine Position gemeinsam anlegen                                    | Kostenart eigenständig anlegen/bearbeiten; Schlüssel, Scope und Fachattribute pflegen                                                              | Kostenbereiche, Schlüssel, Empfänger, direkte Zuordnung            |
| Kostenpositionen  | beim Anlegen einer neuen Kostenart erzeugt; danach nur lesbar                          | vorhandene Kostenart wählen, mehrere Positionen anlegen, bearbeiten und abhängigkeitsgeprüft löschen                                               | Beleg, Buchungslink, externe Zahlung, Schätzung, Summenabgleich    |
| Bankbuchungen     | gefiltert sichtbar, sonst nur lesbar                                                   | suchen, filtern, klassifizieren, Jahr/Kostenart zuordnen, prüfen, wiederöffnen und centgenau splitten                                              | gültiger Buchungslink; geprüfte Buchungen sind gesperrt            |
| Heizsysteme       | System, Kreis und Quelle gemeinsam anlegen                                             | System/Kreis/Quelle getrennt pflegen; Schlüssel, Anteile, Warmwasser und CO₂-Modus bearbeiten                                                      | Heizkreis/Quelle, 50–70 %, 100-%-Summe, Warmwasser, CO₂            |
| Brennstoffe       | nicht erreichbar                                                                       | Anfangs-/Restbestand und Lieferungen mit Menge, Betrag, Beleg und Buchungslink pflegen                                                             | Jahreslieferung, Beleg und Buchungslink                            |
| Zähler            | nicht erreichbar                                                                       | Zähler, Nummernstatus, MaLo-ID, Ablesungen und Jahresstatus pflegen                                                                                | Nummer, Bestätigung, Buchung, Jahresrechnung, Schätzung            |
| Berechnung        | Lauf starten, Ergebnis anzeigen                                                        | Kontext, Zeitpunkt, Kontrollsummen, Warnungen und vorherigen Lauf verständlich zeigen                                                              | nur geprüfte Core-Ausgabe; keine UI-Rechenlogik                    |
| Freigabe          | Validatorbericht und Statusaktionen vorhanden                                          | jeder Befund erhält einen stabilen Bearbeitungslink zur passenden Route/Entität                                                                    | bestehende Transition-, Dokument- und Audit-Verträge               |
| PDF/Export        | Dokumente erzeugen und auflisten                                                       | Kontext klar anzeigen; gesperrte Voraussetzungen mit Bearbeitungslink erklären                                                                     | Snapshot-Bindung und Finalisierungs-Gate                           |
| Sicherung/Import  | kanonisches Backup, Snapshots, Restore und v3/v4-Import                                | vorhandene Sicherheitsabläufe visuell einordnen, nicht vereinfachen                                                                                | Größenlimit, anonymisierte Vorschau, CAS und Snapshot              |

## Navigations- und Responsive-Vertrag

- Desktop: beschriftete Seitennavigation, sichtbarer Kontext und Fokuszustand.
- Mobil: beschriftetes Menü statt reiner Nummernleiste; keine Überlagerung von
  Formularen, Tabellen oder primären Aktionen.
- Tabellen zeigen Betrag, Status und Primäraktion ohne horizontales Scrollen;
  weitere Felder dürfen in eine zugängliche Detailansicht wechseln.
- Zielgrößen mindestens 44 × 44 Pixel und sichtbare Tastaturfokusse.
- Referenzgrößen: 1440 × 900, 1024 × 768 und 390 × 844.

## Ausführungsreihenfolge

1. gemeinsamer Auswahlkontext, Schrittmodell und Navigation,
2. Zerlegung des bisherigen `WorkflowRoute`,
3. immutable Update-/Delete-Commands,
4. Stammdaten und Abrechnungsjahr,
5. Nutzer und Zeiträume,
6. Kostenarten und Positionen,
7. Bankbuchungen,
8. Heizung, Brennstoffe und Zähler,
9. Validator-Deep-Links und Ergebnisoberflächen,
10. responsive und visuelle Abnahme.

## Tests und Abnahme

- Tests werden vor der jeweiligen Implementierung geschrieben.
- Unit-Tests sichern jedes neue Command inklusive Referenz- und Statussperren.
- Komponententests sichern Bearbeiten, Abbrechen, Speichern und Fehlerzustände.
- E2E sichert Hauptablauf, v3-Import mit anschließender Korrektur, Freigabe-Link,
  Backup/Restore und die drei Referenzgrößen.
- Web- und betroffene Paket-Coverage bleiben in allen vier Metriken mindestens
  80 Prozent.
- Lint, Typecheck, Format, Build, Privacy, Security, Legacy-SHA und vollständige
  CI müssen grün sein.

## Noch bewusst offen

- Ein neuer Bank-CSV-Vertrag wird nicht improvisiert. PR 15 implementiert ihn
  nur, falls im Bestand bereits ein expliziter Parservertrag vorhanden ist.
- Schemaänderungen, neue Rechenregeln und rechtliche Textentscheidungen stoppen
  die Umsetzung und benötigen eine eigene menschliche Entscheidung.
