## Ziel

Migrierte Kostenarten, Kostenpositionen und Bankbuchungen in der Oberfläche
vollständig sichtbar machen. Die Produktionsabnahme hatte gezeigt, dass die
Daten zwar vorhanden waren, die bisherige Kostenansicht aber nur
Kostenartennamen ausgab.

## Umgesetzter Umfang

- Kostenartenübersicht mit Summen und Umlageschlüsseln
- Beleg-/Rechnungstabelle des aktiven Abrechnungsjahres
- Bankbuchungstabelle für aktives Objekt/Jahr plus offene Zuordnungen
- strikte Objekt-/Jahresabgrenzung
- Pagination mit 50 Zeilen je Seite
- Patchversion 1.0.1
- Sicherheitsauflösung für `nanoid` 3.3.17

## Nicht umgesetzt

- Buchungs-CSV-Import
- Buchungsklassifizierung und Splits
- Bearbeitung oder Löschen bestehender Datensätze
- Änderungen an Migration, Schema oder Rechenengine

## Geänderte fachliche Regeln

Keine. Es werden ausschließlich vorhandene Daten dargestellt.

## Schemaänderungen

Keine.

## Migrationsauswirkungen

Keine. Vorhandene v4-Dateien bleiben unverändert kompatibel.

## Tests

- neue Komponenten- und Routentests
- erweiterter fiktiver PR-12-E2E-Migrationslauf
- vollständige UI-Coverage ≥ 80 Prozent

## Datenschutzprüfung

Keine Produktivdaten in Code, Tests, Screenshots oder Git. Keine neuen
Netzwerkzugriffe oder externen Ressourcen.

## Risiken

Die Ansichten sind in diesem PR bewusst lesend. Die in der Alt-App vorhandene
Buchungsklassifizierung und Split-Bearbeitung bleibt separater Folgeumfang.

## Review-Schwerpunkte

- richtige Objekt-/Jahresabgrenzung der Bankbuchungen
- korrekte Cent- und Datumsdarstellung
- Lesbarkeit langer Tabellen und Pagination
- Datenschutz bei Gegenpartei und Verwendungszweck

## Rollback

Reiner UI-Rollback; keine Migration und keine gespeicherten Daten müssen
zurückgesetzt werden.
