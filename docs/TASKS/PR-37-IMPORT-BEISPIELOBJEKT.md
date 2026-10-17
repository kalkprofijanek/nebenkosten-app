# PR-37 – Import aus Excel/CSV und anonymes Beispielobjekt

Stand: 16. Oktober 2026. Auftrag: Roadmap Phase 2, Punkt 8. Baut auf PR-HEIZKV-IMPORT auf.

## Anlass

Neue Nutzer haben Mieterlisten und Ablesebögen meist als Excel; Messdienste
liefern CSV. Ein fertiges Beispielobjekt senkt die Einstiegshürde.

## Umfang

1. Vorlagen (CSV/XLSX) für Wohnungen und Mieter, Vorauszahlungen,
   Zählerstände (mit Datum und Einheit) und Kostenpositionen.
2. Import mit Vorschau, Zuordnung und Fehlerliste; keine Übernahme bei
   Mehrdeutigkeit; Zählerstände durchlaufen die Prüfung aus PR-31.
3. Fiktives Beispielobjekt (2 Häuser, 12 Wohnungen, Öl und
   Wärmepumpe, Nutzerwechsel, Leerstand, Eigentümerwechsel) als ladbare Datei.

## Freigegebene Pfade

`packages/import-export`, `apps/web/src/features/import`, `docs/beispiel`,
Tests, diese Datei.

## Abnahme

Tests je Vorlage; Privacy-Scan grün; Beispielobjekt rechnet ohne Fehler.

## Umsetzungsstand (Teil 1: Beispielobjekt)

- `docs/beispiel/beispielobjekt.json`: 2 Häuser (Heizöl mit zentralem
  Warmwasser, Wärmepumpe mit JAZ), 12 Wohnungen, Nutzerwechsel zum 1. Juli,
  Leerstand ganzjährig und ab Oktober, Eigentümerwechsel zum 1. April (baut
  auf PR-30 auf).
- Erzeugt und abgesichert durch `tests/integration/beispielobjekt.test.ts`
  (Datei aktuell, Schema gültig, Kontrolldifferenz ≤ 1 Cent, einziger Fehler
  „IBAN fehlt“, weil eine Beispiel-IBAN der Privacy-Scan meldet; seit
  PR-44 fiktive IBAN mit Bankleitzahl 00000000, keine Prüfhinweise mehr) und
  `apps/web/src/features/import/beispielobjekt.test.tsx` (lädt über den
  normalen Import).
- Beschreibung: `docs/beispiel/README.md`.

## Umsetzungsstand (Teil 2: Mieterliste)

- Vorlage „Mieterliste“ (`packages/import-export/src/csv/tenant-list.ts`):
  Wohnungen mit Fläche und Lage, Mieter oder Leerstand, Von/Bis, Personen und
  Vorauszahlung (monatlich, jährlich oder keine) in einer CSV; Fehler werden
  je Zeile gesammelt.
- Übernahme (`apps/web/src/features/import/tenant-list-import.ts`): Probelauf
  für die Vorschau, alles oder nichts, Zuordnung vorhandener Wohnungen über
  die Bezeichnung, Anlage fehlender Wohnungen, keine stille Änderung von
  Flächen oder Gebäuden, Überschneidungs- und Zeitraumprüfung der
  bestehenden Belegungs-Commands.
- Oberfläche: Abschnitt „Mieterliste aus Excel/CSV übernehmen“ auf der Seite
  **Nutzer** (`TenantListCsvImport.tsx`), auch ohne vorhandene Wohnungen.
  Zusätzlich freigegebener Pfad für die Einbindung:
  `apps/web/src/features/workflows/OccupanciesRoute.tsx`.
- Kosten: bereits über die KI-Erfassungsliste (`parseAiCostCsv`) abgedeckt.
- Offen (Teil 3): Zählerstände mit Datum aus Ablesebogen/Messdienst-CSV in
  der Oberfläche (Parser `parseMeterServiceCsv` vorhanden, Prüfung aus PR-31
  anbinden); XLSX direkt statt CSV.
