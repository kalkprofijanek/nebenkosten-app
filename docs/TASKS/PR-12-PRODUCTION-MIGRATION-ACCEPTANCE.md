# PR 12 – Produktionsmigration und Abnahme

Verantwortlich: Codex.
Technische Umsetzung: Codex.
Technische und Sicherheits-Gegenprüfung: unabhängige Codex-Reviews.
Finale Freigabe: Mensch.

## Ziel

PR 12 schließt den kontrollierten Umzug der Legacy-v3-Anwendung ab. Der
produktive Ausgangsstand wird ausschließlich lokal gesichert, nachvollziehbar
in Schema-Version 4 migriert, numerisch gegen die Alt-App verglichen und durch
einen praktisch ausgeführten Backup-/Restore-Test abgenommen.

Dieser PR führt keine neue fachliche Berechnungsregel ein. Er ergänzt nur die
für eine beweisbare Migration und Wiederherstellung noch fehlenden
Bedien-, Vergleichs- und Nachweiswege.

## Verbindliche Schutzgrenzen

- Produktive JSON-, PDF-, ZIP-, Backup-, Hash- und Ergebnisdateien bleiben
  vollständig unter `private-data/pr12/`.
- Produktive Inhalte, Dateinamen, absolute lokale Pfade und ausgefüllte
  Abnahmeberichte werden weder committed noch gepusht noch in
  GitHub-Kommentare oder CI-Artefakte übernommen.
- Tests und Screenshots verwenden ausschließlich frei erfundene Daten.
- `legacy/index.html` bleibt unverändert.
- Die Alt-App und die ursprüngliche v3-Datei bleiben bis zum bestandenen
  Rollback-Test das unangetastete Rückfallsystem.
- Neuere oder ungültige Schema-Versionen werden nie überschrieben.
- Import und Restore benötigen jeweils eine ausdrückliche Bestätigung.

## Umfang

### 1. Vollständige Importvorschau

- Der sichere Quelldateiname und die App-Version werden an den Legacy-Importer
  übergeben.
- Der bereits redigierte `MigrationReport` bleibt bis zur bewussten Übernahme
  erhalten.
- Die Vorschau zeigt Quellhash, Quell-/Zielversion, sämtliche Zählungen,
  Warnungen, Transformationsregeln, verworfene Felder sowie
  unbekannte/konservierte Felder.
- Die Anzeige übernimmt keine rohen Legacy-Werte.
- Eine aktuelle v4-Datei wird weiterhin ohne erfundenen Migrationsbericht
  importiert.

### 2. Backup und Wiederherstellung

- Der aktuelle v4-Bestand kann als kanonische JSON-Datei heruntergeladen
  werden.
- Die Oberfläche weist ausdrücklich darauf hin, dass dieses vollständige
  Backup vertrauliche Personen-, Adress-, Bank- und Abrechnungsdaten enthält.
- SHA-256, Dateigröße und Erstellzeitpunkt werden lokal angezeigt.
- Ein manueller Snapshot kann angelegt und die Snapshotliste angezeigt werden.
- Restore verlangt eine eindeutige Bestätigung.
- Vor Restore erzeugt der Persistenzadapter atomar einen angehefteten
  `before_restore`-Snapshot.
- Konflikte, beschädigte Stände und fehlende Fähigkeiten führen zu
  verständlichen, redigierten Fehlern und niemals zu stillem Überschreiben.

### 3. Numerischer Abnahmevergleich

Ein reines, UI-unabhängiges Vergleichsmodul vergleicht lokal erfasste
Legacy-Erwartungswerte mit dem neuen Berechnungsergebnis. Mindestens:

- Gesamtkosten,
- Heizkosten,
- CO₂-Anteile für Mieter und Vermieter,
- Vorauszahlungen,
- Saldo je Nutzungszeitraum,
- Nutzerwechsel und Leerstände,
- Kontroll- und Rundungsdifferenzen.

Gesamtkosten, Heizkosten, CO₂-Anteile und Vorauszahlungen müssen identisch
sein. Für den Saldo je Nutzungszeitraum gilt höchstens ein Cent Abweichung.
Jede größere Abweichung stoppt die Abnahme, bis sie dokumentiert und vom
Menschen ausdrücklich entschieden wurde.

Das Vergleichsergebnis enthält nur stabile technische Kennungen, Cent-
Differenzen und Toleranzen. Namen, Anschriften, Bankdaten und Rohwerte dürfen
nicht in Konsolen- oder Fehlermeldungen erscheinen.

Der lokale Befehl `pnpm acceptance:production -- <v3-json> <erwartung-json>
<jahr>` führt Import, v4-Berechnung und Vergleich durch. Seine Ausgabe enthält
nur technische Referenzen, Cent-Differenzen, Toleranzen und Ergebnis-Codes;
die Eingabe- und Ergebnisdateien bleiben unter `private-data/`.

### 4. Fiktiver vollständiger E2E-Lauf

Der automatisierte Lauf beweist mit frei erfundenen Daten:

1. v3-Datei auswählen,
2. vollständigen Migrationsbericht prüfen,
3. Import bewusst bestätigen,
4. v4-Backup erzeugen,
5. Berechnung und Dokumenterzeugung ausführen,
6. manuellen Snapshot anlegen,
7. Daten kontrolliert ändern,
8. Snapshot wiederherstellen,
9. ursprünglichen fachlichen Stand erneut finden,
10. `before_restore`-Sicherung nachweisen.

## Lokale Verzeichnisstruktur

```text
private-data/pr12/
├── source/
│   ├── legacy-v3-original.json
│   └── legacy-index-original.html
├── reference-pdfs/
├── backups/
├── comparison/
└── reports/
```

Die Namen sind lokale Empfehlungen. Der gesamte übergeordnete Ordner ist
bereits durch `.gitignore` ausgeschlossen.

## TDD-Reihenfolge

1. Tests für vollständige Importvorschau schreiben und rot ausführen.
2. Importvorschau minimal implementieren und grün ausführen.
3. Controller- und Komponententests für Export, Snapshot und Restore schreiben.
4. Backup-/Restore-Oberfläche minimal implementieren.
5. Vergleichsvertrag und Grenzfalltests schreiben.
6. Vergleichsmodul implementieren.
7. Fiktiven E2E-Abnahmelauf ergänzen.
8. Erst nach vollständig grüner CI den lokalen Produktivlauf durchführen.

Für jeden neuen ausführbaren Bereich gilt mindestens 80 Prozent Abdeckung.

## Erlaubte Pfade

- `docs/TASKS/PR-12-*.md`
- `docs/PRODUCTION-MIGRATION-RUNBOOK.md`
- `apps/web/src/features/import/**`
- `apps/web/src/features/backup/**`
- `apps/web/src/ImportControl*.tsx`
- `apps/web/src/BackupRestoreRoute*.tsx`
- `apps/web/src/app/navigation.ts`
- `apps/web/src/app/workspace-controller*.ts`
- `apps/web/src/WorkspaceApp*.tsx`
- `apps/web/src/styles.css`
- `packages/acceptance/**`
- `packages/schema/src/migrations/**` und `packages/schema/src/versions/v3/**`
  ausschließlich für im lokalen Produktiv-Vorcheck nachgewiesene
  Importgrenzen, verlustfreie Legacy-Konservierung und JSON-Sicherheit,
- `packages/schema/tests/pr04-*.test.ts` sowie
  `packages/schema/tests/migration-helpers.test.ts` für Regressionstests,
- `tests/integration/*pr12*`
- `tests/e2e/*pr12*`
- erforderliche kleine Workspace-, Test- und Formatkonfigurationen

Gemeinsame Dateien dürfen nur klein, offen ausgewiesen und durch das Review
des anderen Agenten geändert werden.

## Gesperrte Pfade

- `legacy/index.html`
- bestehende fachliche Engine- und Rundungsimplementierungen
- Schema-Version und bestehende Migrationsverträge
- produktive Dateien unter `private-data/`
- Deployment- und Hostingkonfiguration ohne separate menschliche Entscheidung

## Abbruchbedingungen

Der lokale Produktivlauf wird sofort gestoppt, wenn:

- Originaldatei oder Prüfsumme nicht zweifelsfrei gesichert ist,
- die Legacy-Datei nicht wieder in die Alt-App importiert werden kann,
- der Migrationsbericht einen nicht erklärten Feldverlust meldet,
- eine relevante Zahl außerhalb der festgelegten Toleranz abweicht,
- ein PDF Pflichtangaben oder Rechenwerte widersprüchlich ausgibt,
- Backup oder Restore nicht reproduzierbar funktionieren,
- personenbezogene Daten außerhalb von `private-data/` auftauchen.

## Manuell benötigte Entscheidungen

- Pfad zur echten v3-Datei,
- Auswahl repräsentativer Abrechnungsjahre,
- Referenz-PDFs aus der Alt-App,
- Entscheidung über jede Abweichung über einem Cent,
- fachliche und rechtliche PDF-Sichtprüfung,
- finale Freigabe,
- Release-Tag und eine gesonderte Entscheidung über GitHub Pages.

## Akzeptanz

- Vollständiger redigierter Migrationsbericht ist vor Import prüfbar.
- Kanonischer v4-Export kann erneut importiert werden.
- Manueller Snapshot, Restore und `before_restore`-Sicherung sind praktisch
  nachgewiesen.
- Der maschinelle Vergleich erfüllt alle Toleranzen.
- PDF-Vergleich und Freigabeprotokoll sind lokal ausgefüllt.
- Format, Lint, Typecheck, Unit-, Integrations-, Migrations-,
  Charakterisierungs- und E2E-Tests, Coverage, Build, Privacy-Scan und
  Security-Audit sind grün.
- Legacy-SHA ist unverändert.
- Codex-Code- und Sicherheitsreview haben keine offenen Blocker.
- Der Mensch hat die Produktionsmigration ausdrücklich freigegeben.

## Bekannte Dokumentationslücke

Die im Masterauftrag genannten Dateien `docs/ARCHITECTURE.md` und
`docs/CALCULATION-RULES.md` existieren auf dem Ausgangsstand von PR 12 nicht.
PR 12 erfindet daraus keine neuen Verträge. Maßgeblich bleiben der Masterplan,
`docs/DATA-MODEL.md`, `docs/MIGRATION.md`, `docs/ROUNDING.md`,
`docs/PERSISTENCE.md` und die bestehenden Paketverträge.

## Nicht Teil dieses PR

- Cloud, Anmeldung, Rollen oder serverseitige Backups,
- produktive Fixtures oder öffentliche Abnahmeberichte,
- automatische rechtliche Freigabe,
- neue Berechnungs- oder Rundungsregeln,
- Löschung der Alt-App,
- öffentliches Deployment,
- Merge oder Release ohne menschliche Freigabe.
