# PR-51 – Robustheit von CSV- und Legacy-Import

Stand: 28. Oktober 2026. Auftrag: Sicherheitsaudit vom 28.10.2026,
Härtungshinweise. Priorität 2, wegen Punkt 1 fachlich relevant.

## Umfang

### CSV (`packages/import-export/src/csv`)

1. **Dezimaltrennzeichen** (`table.ts`, `decimalText`): `12.345` wird heute
   als 12345 gelesen (Punkt als Tausendertrennzeichen). Ein Messdienst-Export
   mit Punkt als Dezimaltrennzeichen und genau drei Nachkommastellen (m³)
   wird damit stillschweigend mit 1000 multipliziert. Lösung nach E-51-1.
2. **Personenzahl** (`tenant-list.ts`): `Number()` liest auch `0x1F`, `1e3`,
   Brüche und `-0`. Ersetzen durch eine Prüfung auf ganze Zahl mit
   Obergrenze; die Obergrenze legt E-51-2 fest.
3. **Zeilennummern in Meldungen** (`tenant-list.ts`, `meter-service.ts`):
   `csvTable` überspringt Leerzeilen, die Meldungen zählen aber `index + 2`.
   Die physische Zeilennummer aus `csvTable` mitgeben.
4. **Gültigkeit des Zählers** (`monthly-readings.ts`): Ablesungen außerhalb
   von `validFrom`/`validTo` des Zählers ergeben einen eigenen Problemcode.
5. `csvCents('-0')` ergibt `0`, nicht `-0`.

### Legacy-v3-Migration (`packages/schema/src/migrations/legacy-v3`)

6. **Eindeutige ID-Ableitung** (`context.ts`, `organization-property.ts`):
   Pfade werden heute mit Punkt bzw. Doppelpunkt verbunden. Dadurch
   kollidieren z. B. `['a.b','c']` und `['a','b.c']`. Die Ableitung braucht
   eine eindeutige Kodierung (z. B. `JSON.stringify(path)`). Achtung:
   Bestehende abgeleitete IDs ändern sich. Erneute Importe derselben
   v3-Datei erzeugen dann andere IDs (E-51-3).
7. **Nutzer-ID über Objekte hinweg** (`billing-tenancy-costs.ts`): Die
   Zusammenführung nach `nutzer.id` ist auf das Objekt (`propertyId`) zu
   begrenzen, oder eine Wiederverwendung über Objekte hinweg wird als Fehler
   gemeldet.
8. **Nachschlagetabellen** (`mapping.ts`): `Object.hasOwn` oder `Map` statt
   Index auf ein einfaches Objekt. Heute schlägt das nur dank der
   nachgelagerten Enum-Prüfung sicher fehl.

### Schema

9. Prüfung auf eindeutige IDs und gültige Fremdschlüssel in der
   `AppDataFile`. Laut Audit akzeptiert das Root-Schema doppelte IDs, spätere
   Verbraucher nehmen mit `.find()` den ersten Treffer. Das ist eine
   Schemaänderung, deshalb eigene Entscheidung E-51-4.

## Freigegebene Pfade

`packages/import-export/`, `packages/schema/src/migrations/legacy-v3/`,
`apps/web/src/features/` (nur Anzeige der neuen Problemcodes),
`docs/MESSDIENST-CSV-FORMAT.md`, `CHANGELOG.md`, `docs/TASKS/`. Punkt 9 nur
nach E-51-4 mit `packages/schema/src/versions/`.

## Tests (zuerst schreiben)

- `decimalText`: Verhalten nach E-51-1 für `12.345`, `1.234,5`, `12,345`.
- Personenzahl: `0x1F`, `1e3`, `2.5`, `-0` werden abgelehnt.
- Datei mit Leerzeilen: Die Meldung nennt die physische Zeile.
- Ablesung vor `validFrom` des Zählers ergibt den Problemcode.
- v3-Datei mit ID-Kollision über Punkt-Pfade erzeugt unterschiedliche IDs.
- v3-Datei mit derselben `nutzer.id` in zwei Objekten: Verhalten nach Punkt 7.

## Offene Entscheidungen

- **E-51-1 – Dezimaltrennzeichen:**
  - A = in der Spaltenzuordnung wählbar, Vorgabe Komma. Empfehlung.
  - B = Werte, die nur Punkt-Gruppen mit genau 3 Ziffern enthalten, als
    mehrdeutig melden.
  - C = unverändert lassen und dokumentieren.
- **E-51-2 – Obergrenze Personenzahl** je Nutzungseinheit (fachliche
  Annahme, nicht im Code festschreiben, bevor entschieden).
- **E-51-3 – ID-Kodierung in der Legacy-Migration:** neue Kodierung nur für
  neue Importe (Migrationsversion erhöhen) oder unverändert lassen und
  Kollisionen nur erkennen und melden.
- **E-51-4 – Prüfung auf eindeutige IDs und Fremdschlüssel** im Root-Schema
  (Schemaversion und Migration) oder als Validator-Prüfhinweis.
