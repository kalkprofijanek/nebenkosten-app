# PR – HeizKV-Verbrauchsoberfläche und Kostenroute

## Umfang

1. Die Verbrauchsseite ermöglicht das Erfassen und Ändern des bereits
   vorhandenen `OccupancyPeriod.previousConsumption`-Werts einschließlich
   Jahr und Quelle. Es gibt keine Schemaänderung. Fehlend und ein echter Wert
   von 0 bleiben unterscheidbar. Änderungen verwenden weiterhin die
   Abrechnungsjahressperre und den vorhandenen Auditpfad.
2. Heizungszählerstände und abgeleitete Wärmeverbräuche werden in der
   Weboberfläche sichtbar mit `kWh` bezeichnet.
3. `CostsRoute.tsx` wird in kleinere, fachlich zusammenhängende Komponenten
   gegliedert. Kostenarten, Kostenpositionen, Bankbuchungen, CSV-Import,
   Filter, Summen, Tastaturbedienung, Löschschutz, Fehlerbehandlung und
   Korrekturlinks behalten ihr Verhalten.

## Grenzen

- Nur `apps/web/src/` und dieses Dokument dürfen geändert werden.
- Kein Schema-, Core-, Validator- oder Rechenwegwechsel.
- Keine produktiven Daten, externen Abhängigkeiten, Pushes oder Publikation.
- Sperren und Auditprotokollierung bleiben aktiv.
- Desktop-Browser gemäß ADR-0002.

## Abnahme

- Tests zuerst, einschließlich fehlend/0, Bearbeitung und Sperre für den
  Vorjahresverbrauch sowie kWh-Beschriftungen.
- Vorhandene Kostenroutenabläufe behalten ihre Funktionen nach dem Refactor.
- Format, Lint, Typecheck, Web-Tests und Build; mindestens 80 % Web-Coverage.
- Kleine, nachvollziehbare Commits.
