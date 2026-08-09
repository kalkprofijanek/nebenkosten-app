# PR 14 – Produktive Kosten- und Buchungsansichten

Verantwortlich: Codex. Finale Freigabe: Mensch.

## Ausgangslage

Die Produktionsmigration hat nachgewiesen, dass Kostenpositionen und
Bankbuchungen im Schema-v4-Datenbestand vorhanden sind. Die Oberfläche zeigte
unter „Kosten“ jedoch ausschließlich die Namen der Kostenarten. Einzelne
Belege/Rechnungen und importierte Kontobewegungen waren nicht sichtbar.

Diese Lücke verletzt die Bedien- und Abnahmekriterien des Masterplans. Die
Produktionsmigration bleibt deshalb angehalten, bis die Korrektur veröffentlicht
und am lokalen Produktivbestand geprüft wurde.

## Ziel

- Kostenarten des aktiven Abrechnungsjahres mit Typ, Umlageschlüssel,
  Positionszahl und Gesamtbetrag anzeigen.
- Kostenpositionen mit Datum, Kostenart, Beschreibung, Belegreferenz und Betrag
  anzeigen.
- Bankbuchungen des aktiven Objekts und Jahres einschließlich offener
  Zuordnungen anzeigen.
- Buchungen anderer Objekte und eindeutig anderer Jahre ausblenden.
- Lange Listen in Seiten zu je 50 Einträgen darstellen.
- Keine produktiven Inhalte in Tests, Screenshots, Git oder CI übernehmen.

## Nicht Teil dieses PR

- CSV-Import neuer Bankbuchungen,
- Bearbeitung, Klassifizierung oder Splitten von Bankbuchungen,
- Belegdatei-Upload und Belegbearbeitung,
- Änderungen an Schema, Migration oder Berechnungsregeln.

Diese Bearbeitungsfunktionen werden nach der Sichtprüfung als eigener
Folgeumfang bewertet. PR 14 stellt zuerst sicher, dass der migrierte Bestand
vollständig und nachvollziehbar sichtbar ist.

## Tests

- Komponententest für migrierte Kostenpositionen und Bankbuchungen,
- Objekt- und Jahresabgrenzung,
- Leerzustände,
- Pagination langer Buchungslisten,
- E2E-Migration einer rein fiktiven v3-Datei mit sichtbarer Kosten- und
  Buchungsprüfung,
- vollständige UI-Coverage mindestens 80 Prozent,
- Build, Lint, Typecheck, Privacy-Scan und Security-Audit.

Der während der Prüfung neu gemeldete hohe `nanoid`-Befund wird über eine
zentrale pnpm-Auflösung auf die gepatchte Version 3.3.17 geschlossen.

## Datenschutz

Die Ansichten lesen ausschließlich den bereits lokal gespeicherten
Browserbestand. Es werden keine Netzwerkzugriffe, Protokollausgaben,
Analysewerkzeuge oder externen Ressourcen ergänzt.

## Rollback

Der PR kann vollständig zurückgenommen werden, ohne Datenformat oder
gespeicherte v4-Dateien zu verändern. Die Änderung betrifft nur Darstellung,
Tests und die App-Patchversion `1.0.1`.
