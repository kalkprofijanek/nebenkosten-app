## Ziel

Die Produktionsmigration und Endabnahme der Legacy-v3-Anwendung werden lokal,
reproduzierbar und ohne produktive Daten im Repository durchführbar.

## Umgesetzter Umfang

- vollständige redigierte Legacy-Migrationsvorschau,
- kanonischer v4-Backup-Export,
- manuelle Snapshots und kontrollierte Wiederherstellung,
- UI-unabhängiger Cent-Vergleich für die fachliche Abnahme,
- fiktiver vollständiger E2E-Abnahmelauf,
- lokales Runbook für Sicherung, Vergleich, PDF-Prüfung und Rollback.

## Nicht umgesetzt

- Cloud, Anmeldung, Rollen oder serverseitige Speicherung,
- automatische rechtliche Freigabe,
- öffentliche Produktivberichte oder produktive Fixtures,
- GitHub-Pages-Deployment ohne separate Freigabe.

## Geänderte fachliche Regeln

Keine. Die bestehenden Rundungs- und Toleranzregeln bleiben unverändert.

## Schemaänderungen

Schema-Version und v4-Zieldatenmodell bleiben unverändert. Die tolerante
v3-Eingangsgrenze erkennt zusätzlich das historisch nachgewiesene, strikt
auf bekannte Felder begrenzte Hauswartvertrags-Detailobjekt. Der Inhalt wird
vollständig unter `legacyUnmapped` konserviert und der Zielmarker auf `true`
gesetzt. Leere optionale Legacy-Referenzen werden als `null` normalisiert.

## Migrationsauswirkungen

Der bestehende v3→v4-Vertrag bleibt fachlich unverändert. Der vollständige
E2E-Lauf hat jedoch aufgedeckt, dass Zod optionale Zielfelder teilweise als
explizite `undefined`-Eigenschaften ausgab. Solche erfolgreich validierten
Migrationsergebnisse konnten vom kanonischen JSON-Codec nicht gespeichert
werden. Die Migrationsgrenze entfernt diese Eigenschaften nun unveränderlich
vor der abschließenden Schema-Prüfung; Werte und bekannte Felder werden nicht
verändert. Schema- und E2E-Regressionstests sichern die Speicherbarkeit ab.

Der redigierte Bericht wird außerdem vor der bewussten Übernahme vollständig
sichtbar und für die lokale Abnahme nutzbar.

Der Ressourcenwächter zählt höchstens 10.000 Container und separat höchstens
50.000 skalare Werte. Die übrigen Grenzen – 10 MiB Datei und Text, 1.000
Collection-Einträge und Tiefe 64 – bleiben unverändert.

## Tests

- 1.234 Architektur-, Repository-, Privacy-, Unit-, Integrations-,
  Migrations- und Charakterisierungstests grün,
- 6 kopflose Browser-E2E-Tests grün,
- neuer PR-12-Ablauf mit echtem PDF- und ZIP-Download, v4-Backup,
  manuellem Snapshot und `before_restore`-Rollback,
- alle Coverage-Gates mindestens 80 Prozent; `packages/acceptance` erreicht
  100 Prozent in allen vier Metriken.

## Testbefehle und Ergebnisse

- `pnpm format:check` – grün
- `pnpm lint` – grün
- `pnpm typecheck` – grün
- `pnpm test` – grün
- `pnpm test:coverage` – grün
- `pnpm build` – grün
- `pnpm privacy:scan` – grün
- `pnpm security:audit` – keine bekannte Schwachstelle
- vollständige Playwright-Reihe, Chromium, headless – 6/6 grün

## Datenschutzprüfung

- ausschließlich fiktive committed Testdaten,
- produktive Dateien nur unter dem ignorierten `private-data/pr12/`,
- keine absoluten lokalen Pfade oder produktiven Dateinamen im PR,
- unveränderte Legacy-Prüfsumme.

## Risiken

- Die rechtliche und visuelle PDF-Prüfung bleibt eine menschliche Aufgabe.
- Produktive Sonderfälle können trotz fiktiver Abdeckung manuelle
  Entscheidungen erfordern.

## Screenshots oder Beispielausgabe

Keine produktiven Screenshots. Der kopflose E2E-Lauf verwendet ausschließlich
fiktive Daten und prüft die Dateisignaturen sowie die ZIP-Ausgabe maschinell.

## Review-Schwerpunkte

- kein Feldverlust im Migrationsbericht,
- JSON-Sicherheit der bereinigten v3→v4-Ausgabe,
- eindeutig markierte, dauerhafte `before_import`-Sicherung vor Import sowie
  atomare `before_restore`-Sicherung zusammen mit dem Restore,
- korrekte Cent-Toleranzen,
- keine personenbezogenen Daten in Fehlern, Logs oder Artefakten,
- vollständiger Rollback-Nachweis.

## Rollback

PR zurücksetzen. Produktive Originaldatei, Alt-App, externe Sicherung und
lokale Snapshots bleiben unabhängig vom Git-Stand erhalten.
