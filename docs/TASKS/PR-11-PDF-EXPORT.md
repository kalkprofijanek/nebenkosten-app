# PR 11 – PDF und Export

Verantwortlich: Claude (in Absprache mit dem Menschen; abweichend vom
Masterplan, der Codex als Verantwortlichen und Claude als Review vorsieht —
diese Abweichung wurde vor Beginn ausdrücklich bestätigt).
Review: unabhängige Prüfung folgt, sobald verfügbar.
Freigabe: Mensch.

## Ziel

Aus dem Berechnungs-Snapshot (`CalculationResult.resultSnapshot`) werden
echte PDF-Dokumente erzeugt: Einzelabrechnung je Mieter, objektweite
Gesamtabrechnung/Kostenaufstellung und ein ZIP-Sammelexport aller
Einzelabrechnungen. Der bislang in `ReleaseRoute.tsx` gesperrte
„Finalisieren"-Übergang (`FINALIZED`, mit Pflicht-Versanddatum) wird
aktiviert.

## Umfang dieses PR (Kernumfang, mit dem Menschen abgestimmt)

Enthalten:

- Einzelabrechnung (DIN-5008-Layout, Kostenaufstellung, Heizkosten-
  Aufschlüsselung, CO₂-Ausweis, Anschreiben-Platzhalter, Hinweise,
  Liegenschaftsdaten-Fußzeile nach § 259 BGB)
- Gesamtabrechnung/Kostenaufstellung (objektweit, mit Kontrollsummen-Zeile)
- Sammel-ZIP-Export aller Einzelabrechnungen
- Freigabeprotokoll-Baustein (`packages/pdf` stellt sowohl eine eingebettete
  Tabelle als auch ein eigenständiges Dokument bereit)
- Aktivierung des `FINALIZED`-Übergangs mit Pflicht-Versanddatum
- neue Validator-Prüfung: fehlende Versandadresse (`Tenancy.shippingAddress*`)
  blockiert `READY_FOR_PDF`, da ohne sie keine gültige Einzelabrechnung
  erzeugt werden kann

Bewusst nicht enthalten (mit dem Menschen abgestimmt, ggf. Folge-PR):

- Eigentümer-Report (internes Dokument, nicht mieterrelevant)
- Sammel-PDF mit eigener Kontroll-/Freigabeseite (stattdessen direkter
  ZIP-Export der Einzelabrechnungen)
- Hauswart-Vertragsblock (wirkte im Legacy wie kundenspezifische,
  hartcodierte Vertragsdaten — kein generischer Baustein für die neue App)
- neuer expliziter §12-HeizKV-Kürzungshinweistext im Mieter-PDF (Legacy-
  Verhalten bewusst gespiegelt; die rechtliche Prüfung dieser Lücke im
  bisherigen System ist als eigener, fachlich geprüfter Schritt vorgesehen)
- clientseitige PDF-Vorschau vor dem Download (Legacy hatte ebenfalls keine
  echte Vorschau, nur ein HTML-Pendant)

## Architektur

- `packages/pdf` (neu, analog `packages/core`/`packages/validators`): reine
  Dokumentenlogik. Exportierte Funktionen bauen aus `AppDataFile` +
  `CalculationOutput` ein `pdfmake`-`TDocumentDefinitions`-Objekt —
  deterministisch, ohne Browser-Abhängigkeit, unter Vitest (`environment:
'node'`) testbar. Kein Rendering, kein Dateisystemzugriff.
- Das eigentliche Rendern (PDF-/ZIP-Bytes erzeugen) läuft ausschließlich in
  `apps/web/src/features/pdf/render.ts`, per dynamischem `import()` von
  `pdfmake`/`jszip` — beide Pakete sind mehrere MB groß und sollen weder das
  Haupt-Bundle noch die Ein-Datei-HTML-Vorschau aufblähen.
- `apps/web/vite.config.ts`/`scripts/build-html-preview.mjs`: Für die
  Vorschau wird gezielt mit `codeSplitting: false`
  (`NEBENKOSTEN_SINGLE_CHUNK_PREVIEW=true`) gebaut, damit die dynamisch
  geladenen Module in das eine Vorschau-Skript eingebettet werden — die
  Vorschau hat keinen Server, der weitere Chunk-Dateien ausliefern könnte.
- Erzeugte Dokumente werden ausschließlich als Metadaten
  (`documentSchema`: Art, Dateiname, SHA-256-Hash) plus Audit-Eintrag
  persistiert — **keine PDF-Bytes im JSON-Datenbestand**.
- PDF-/ZIP-Erzeugung ist ab `READY_FOR_PDF` möglich (das ist die Bedeutung
  dieses Status); `FINALIZED` markiert zusätzlich den tatsächlichen Versand
  mit Pflicht-Versanddatum.

## Core-Erweiterung (mit dem Menschen abgestimmt)

`packages/core`s `CalculationOutput` lieferte bislang pro Mieter nur eine
Gesamtsumme, keine Aufschlüsselung nach Kostenart — für eine rechtssichere
Einzelabrechnung (§ 259 BGB) unverzichtbar. `TenantCalculationResult` wurde
um ein rein additives, informatives Feld `costBreakdown` erweitert
(Kostenart-Aufschlüsselung, Heizkosten-Grund-/Verbrauchsanteil, Warmwasser,
CO₂ — je Mieter, unabhängig von der Restcent-Verteilung der verbindlichen
`shareCents`/`balanceCents` berechnet). Bestehende Summen, die 258
Charakterisierungstests und alle 340 bisherigen Core-Tests bleiben
unverändert grün.

## Datenschutz und Sicherheit

- ausschließlich lokale Verarbeitung, keine Netzwerkaufrufe oder Telemetrie
- ausschließlich fiktive Testdaten (Standard-IBAN der Bundesbank in Fixtures)
- keine PDF-Rohinhalte, Namen oder IBANs in Audit-Details (nur Art,
  Dateiname, Hash)
- `legacy/index.html` bleibt unverändert

## Tests und Abnahme

- `packages/pdf`: eigenes Unit- und Coverage-Gate ≥ 80 % in allen vier
  Messgrößen
- `packages/validators`: neuer Testfall für die Versandadressen-Prüfung,
  Coverage-Gate weiterhin ≥ 80 %
- `packages/core`: neue Tests für `costBreakdown`, alle 340 bestehenden
  Tests und 258 Charakterisierungstests weiterhin grün
- `apps/web`: neue Tests für `features/pdf/*`, `PdfExportRoute.tsx` und den
  `FINALIZED`-Fluss in `ReleaseRoute.tsx`
- E2E: `tests/e2e/pr11-pdf-export.spec.ts`
- vollständige Root-CI, Privacy-Scanner und Dependency-Audit

## Nachprüfung und Korrekturen

Die unabhängige Codex-Nachprüfung nach dem Merge hat den PDF-Vertrag
nachgeschärft:

- `snapshotFormatVersion: 3` bindet die für PDFs notwendige
  Mieter-Kostenaufschlüsselung. Ältere Version-2-Snapshots bleiben erhalten,
  werden an der PDF-Grenze aber mit einer verständlichen Aufforderung zur
  Neuberechnung abgewiesen.
- Jede Dokument-Metadatei verweist verpflichtend auf den aktuellen
  `calculationRunId`. ZIP-Export, enthaltene Einzelabrechnungen und
  Audit-Einträge werden gemeinsam gespeichert, bevor der Download beginnt.
- `FINALIZED` setzt eine Gesamtabrechnung und je Mieter-Nutzungszeitraum eine
  Einzelabrechnung mit Hash voraus, jeweils aus dem neuesten Rechenlauf.
- Erstellzeitpunkt, Heizkosten-Split, CO₂-Ausweis, getrennte
  CO₂-Kostenzeile und negative Kostenkorrekturen werden deterministisch und
  vollständig ausgegeben.
