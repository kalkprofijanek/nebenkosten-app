# Produktionsmigration – lokales Abnahme-Runbook

Dieses Runbook beschreibt ausschließlich den Ablauf. Produktive Werte,
Dateinamen, Prüfsummen, Pfade und Ergebnisse werden in einer lokalen Kopie
unter `private-data/pr12/reports/` ergänzt und niemals committed.

## Phase A – Unveränderter Sicherungspunkt

- [ ] Produktive Legacy-`index.html` lokal kopiert.
- [ ] Produktive v3-JSON-Datei lokal kopiert.
- [ ] SHA-256 beider Originaldateien lokal dokumentiert.
- [ ] Originalkopien schreibgeschützt.
- [ ] v3-Sicherung erfolgreich in die Alt-App zurückimportiert.
- [ ] Mindestens eine vollständige Referenzabrechnung als PDF gespeichert.

Abbruch: Bei fehlender oder nicht rückimportierbarer Sicherung nicht
fortfahren.

## Phase B – Technische Vorprüfung

- [ ] PR-12-Build und alle automatisierten Prüfungen sind grün.
- [ ] Anwendung wird ausschließlich lokal gestartet.
- [ ] Browserprofil und Downloadordner sind bekannt.
- [ ] `private-data/pr12/` ist vorhanden und wird von Git ignoriert.
- [ ] Keine produktive Datei liegt im Repository-Arbeitsbaum.

## Phase C – Migration

- [ ] v3-Datei ausgewählt.
- [ ] Quellhash stimmt mit Phase A überein.
- [ ] Quell- und Zielversion geprüft.
- [ ] Sämtliche Zählungen geprüft.
- [ ] Warnungen einzeln geprüft.
- [ ] Geänderte Regeln geprüft.
- [ ] Verworfene Felder fachlich begründet.
- [ ] Unbekannte Felder als konserviert nachgewiesen.
- [ ] Import ausdrücklich bestätigt.
- [ ] v4-Backup erzeugt und erneut erfolgreich importiert.

Abbruch: Nicht erklärter Feldverlust, falscher Hash oder blockierende
Validierung.

## Phase D – Fachlicher Zahlenvergleich

Die lokale Erwartungsdatei erfüllt den Vertrag
`acceptanceExpectationSchema` und bleibt unter `private-data/pr12/comparison/`.
Der ausführbare Vergleich lautet:

```powershell
pnpm acceptance:production -- `
  "private-data/pr12/source/legacy-v3-original.json" `
  "private-data/pr12/comparison/expectation.json" `
  2025
```

Der Prozess endet bei jeder Überschreitung mit einem Fehlercode. Die Ausgabe
enthält nur Referenzen, Differenzen und Toleranzen, keine Rohbeträge.

Je ausgewähltem Abrechnungsjahr:

- [ ] Gesamtkosten identisch.
- [ ] Heizkosten identisch.
- [ ] CO₂-Mieteranteil identisch.
- [ ] CO₂-Vermieteranteil identisch.
- [ ] Vorauszahlungen identisch.
- [ ] Nutzerwechsel geprüft.
- [ ] Leerstände geprüft.
- [ ] Saldo je Nutzungszeitraum höchstens 1 Cent abweichend.
- [ ] Kontrolldifferenz höchstens 1 Cent.
- [ ] Jede größere Abweichung gestoppt und menschlich entschieden.

## Phase E – PDF-Vergleich

- [ ] Absender und Empfänger vollständig.
- [ ] Objekt, Einheit und Zeitraum stimmen.
- [ ] Kostenarten und Umlageschlüssel stimmen.
- [ ] Heizkostenaufteilung stimmt.
- [ ] CO₂-Ausweis stimmt.
- [ ] Vorauszahlungen und Saldo stimmen.
- [ ] Seitenumbrüche, Tabellen und Betragsformatierung sind lesbar.
- [ ] PDF gehört zum aktuellen Berechnungslauf.
- [ ] ZIP enthält jede erwartete Einzelabrechnung genau einmal.

Der Sichtvergleich ergänzt den maschinellen Zahlenvergleich und ersetzt ihn
nicht.

## Phase F – Backup und Rollback

- [ ] Manuellen Snapshot erstellt.
- [ ] Snapshot-ID, Zeitpunkt, Revision und Größe lokal notiert.
- [ ] Kontrollierte, eindeutig erkennbare Teständerung vorgenommen.
- [ ] Snapshot-Restore ausdrücklich bestätigt.
- [ ] Vorheriger fachlicher Stand wiederhergestellt.
- [ ] Automatisch erzeugter `before_restore`-Snapshot vorhanden.
- [ ] Backup-JSON nach Restore erneut importierbar.
- [ ] Alt-App und Original-v3-Sicherung weiterhin unverändert verfügbar.

## Phase G – Freigabe

- [ ] Lokales Freigabeprotokoll vollständig.
- [ ] Keine produktiven Daten im Git-Diff.
- [ ] Privacy-Scan und Security-Audit grün.
- [ ] Codex-Code-Review ohne offene Blocker.
- [ ] Codex-Sicherheitsreview ohne offene Blocker.
- [ ] Menschliche fachliche Freigabe dokumentiert.
- [ ] Merge manuell erfolgt.
- [ ] Release-Tag separat freigegeben und erstellt.

Eine Veröffentlichung über GitHub Pages ist eine eigene Entscheidung und
nicht automatisch Teil dieser Abnahme.
