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
