# Migration Legacy v3 → Schema 4

Stand: 2026-07-14
Verantwortlich: Claude (PR 03 – Vertrag und Mapping), Codex (PR 04 – Implementierung)
Verbindliche Typen: `packages/schema/src/migrations/`, `packages/schema/src/versions/`

Dieses Dokument legt das Feldmapping und die Transformationsregeln der
v3-Migration verbindlich fest. Die Implementierung (PR 04) darf davon
nicht stillschweigend abweichen; jede Abweichung braucht eine Änderung
dieses Dokuments im selben Pull Request. Die Feldtabellen in
`docs/DATA-MODEL.md` Abschnitt 3 (Spalte „Legacy") sind normativer
Bestandteil dieses Mappings und werden hier nicht dupliziert — dieses
Dokument ergänzt Pipeline, Regeln, Strukturzerlegung und Sonderfälle.

## 1. Geltungsbereich und Grundsätze

- Eingabe: eine v3-Exportdatei (`version === 3`), wie sie die Alt-App
  (`legacy/index.html`) erzeugt — einschließlich des historischen
  Objekt-Root-Layouts vor `abrechnungen[]` (siehe `v3ObjektSchema`).
- Ausgabe: `AppDataFile` (Schema-Version 4) + `MigrationReport`
  (Masterplan 9.3), verpackt als `MigrationResult`.
- Kein Feld geht still verloren (Masterplan 9.2/25): jedes bekannte
  v3-Feld ist gemappt (DATA-MODEL Abschnitt 3), jedes bewusst
  verworfene Feld steht mit Begründung in Abschnitt 5, jedes unbekannte
  Feld wird konserviert und in `report.unmappedFields` ausgewiesen.
- Fehlende Werte werden niemals durch `0` ersetzt (Masterplan 25);
  `undefined`/`null`/`0` bleiben unterscheidbar (DATA-MODEL Abschnitt 1).
- Die Eingabe wird nicht mutiert; der Lauf ist deterministisch bei
  gleicher Eingabe und gleicher Zeitquelle (`MigrationOptions.now`).

## 2. Pipeline und Versionserkennung (Masterplan 9.2)

```text
Datei auswählen
→ JSON syntaktisch prüfen            (ok: false, invalid_json_structure)
→ Schema-Version erkennen             probeSchemaVersion()
   · version < 3                      (ok: false, unsupported_schema_version)
   · version > 4                      (ok: false, newer_schema_version — niemals überschreiben)
→ Legacy-Schema validieren            v3AppDataFileSchema (loose)
→ unveränderte Quelldatei hashen      SHA-256 über die ORIGINAL-Bytes, VOR dem Parsen;
   Verantwortung des Aufrufers (WebCrypto, asynchron) → options.sourceSha256 (Pflicht)
→ Migration in Schema 4               Regeln aus Abschnitt 3/4
→ Migrationsbericht erstellen         migrationReportSchema
→ fachliche Plausibilitätsprüfung     packages/validators (PR 10; bis dahin Migrations-issues)
→ Vorschau → bewusste Übernahme → Snapshot
```

Die letzten drei Schritte (Vorschau, Übernahme, Snapshot) sind
UI-/Persistenzaufgaben (PR 08/09) und nicht Teil von
`migrateV3ToCurrent`.

## 3. Transformationsregeln (Regelkatalog)

Jede Feldtransformation im Bericht (`report.changedFields[].rule`)
verwendet einen dieser Regelnamen:

| Regel                   | Bedeutung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verbatim`              | Wert unverändert übernommen (ggf. umbenannt/verschoben)                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `euro_to_cents`         | Euro-Zahl → ganze Cent, kaufmännisch „halbe Cent weg von Null“ — auch für negative Beträge. Verbindliche Implementierung: `euroToCents()` in `packages/schema/src/migrations/euro-to-cents.ts`. Sie skaliert die kanonische Dezimaldarstellung mit `BigInt`, verändert keine signifikanten Stellen und lehnt Ergebnisse außerhalb des sicheren Integerbereichs ab. Präzisionsverlust laut `euroToCentsLostPrecision()` erzeugt eine `warning` mit Pfad. `null`/fehlend bleibt `null`/fehlend. |
| `numberish_to_number`   | v3-„Zahl" (number \| string \| null) → number; nicht parsebare Strings erzeugen eine `warning` und das Zielfeld bleibt leer (kein 0-Default)                                                                                                                                                                                                                                                                                                                                                  |
| `booleanish_to_boolean` | v3-Wahrheitswert (boolean \| 0/1 \| string) → boolean                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ms_epoch_to_iso`       | Zahl (Unix-ms) oder Datumsstring → ISO-8601-Zeitstempel mit `Z`                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `date_to_iso`           | Datumsstring (v3 ist bereits `YYYY-MM-DD`) → validiertes ISO-Datum; ungültige Kalenderdaten erzeugen eine `warning`, Feld bleibt leer                                                                                                                                                                                                                                                                                                                                                         |
| `quantity_wrap`         | Zahl + implizite/explizite Einheit → `{ value, unit }` (`Quantity`); Einheit aus `mengeneinheit` bzw. Feldkontext (`flaeche_nf` → `m2`, `personen` → `personen`, …)                                                                                                                                                                                                                                                                                                                           |
| `enum_map`              | Stringwert → Enum laut Tabelle in Abschnitt 3.1–3.4                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ref_split`             | Kombischlüssel `<blockId>:<quelleId>` → `{ heatingCircuitBuildingId, energySourceKey }`                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tree_position_to_fk`   | Position im v3-Baum → Fremdschlüssel (`ownerCompanyId`, `propertyId`, `billingPeriodId`, …)                                                                                                                                                                                                                                                                                                                                                                                                   |
| `id_generate`           | Neue UUID für Entitäten, die in v3 keine ID haben (Belege, Lieferungen, extrahierte Units/Persons, …)                                                                                                                                                                                                                                                                                                                                                                                         |
| `preserve_unknown`      | Unbekanntes Feld verlustfrei konserviert (siehe Abschnitt 6)                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### 3.1 Freigabestatus (`BillingPeriod.status`)

| v3 (`Abrechnung.status`) | Schema 4                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `Entwurf` oder fehlend   | `DRAFT`                                                                                                                     |
| `Prüfung offen`          | `IN_REVIEW`                                                                                                                 |
| `PDF bereit`             | `READY_FOR_PDF`                                                                                                             |
| `abgeschlossen`          | `FINALIZED`                                                                                                                 |
| `veraltet`               | `SUPERSEDED`                                                                                                                |
| anderer Wert             | `DRAFT` + `warning` mit Code und Pfad; kein Rohwert im Bericht. Der Originalwert bleibt ausschließlich in `legacyUnmapped`. |

### 3.2 Kostenart-Typ (`CostCategory.kind`)

`betrieb` → `operating`, `wasser` → `water`, `heizung` → `heating`;
anderer Wert → `operating` + `warning`.

### 3.3 Umlageschlüssel (`AllocationKey`)

`m2_nf` → `usable_area`, `m2_nf_hzg` → `heated_area`,
`einheiten` → `consumption_units`, `we_anzahl` → `residential_units`,
`direkt` → `direct`; leer bleibt leer (Heizkostenarten haben in v3
keinen Schlüssel); anderer Wert → `warning`, Feld bleibt leer.

### 3.4 Issue-Schweregrade

Legacy `warn` → `warning`; `error`/`info` unverändert
(`validationIssueSchema`, DATA-MODEL 3.24).

## 4. Strukturzerlegung (v3-Baum → flache Container)

v3 ist ein verschachtelter Baum (`firmen → objekte → abrechnungen →
nutzer/kostenarten/heizkreise …`); Schema 4 hält alle Entitäten flach
mit ID-Referenzen (DATA-MODEL Abschnitt 2). Reihenfolge der Arrays
bleibt erhalten (Anzeige-Reihenfolge ist fachlich relevant,
`displayOrder`).

| §    | v3-Quelle                                                                            | Ziel-Entitäten                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4.1  | Datei-Root (`version`, `gespeichert`)                                                | `schemaVersion` (Literal 4), `meta.savedAt` (`ms_epoch_to_iso`), `meta.migratedFrom` (aus dem Lauf)                                                                                                                                                                                                                                                    |
| 4.2  | `Firma`                                                                              | eine implizite `Organization` je Datei (v3 kennt keine Mandanten; `id_generate`, `name` aus Benutzereingabe oder sicherem Dateinamen) + `OwnerCompany` je Firma (`name` aus `name1`)                                                                                                                                                                   |
| 4.3  | `Objekt`                                                                             | `Property`; `excel_quelle` verbatim nach `legacySourceInfo`                                                                                                                                                                                                                                                                                            |
| 4.4  | `Objekt.bloecke[]` (bzw. neutrale, aus Heizkreis-IDs abgeleitete Blocks, falls leer) | `Building` je Block; `hk`-Feld siehe Abschnitt 5                                                                                                                                                                                                                                                                                                       |
| 4.5  | `Abrechnung` (bzw. historisches Objekt-Root-Layout)                                  | `BillingPeriod`; Root-Layout-Felder werden zuvor logisch nach `abrechnungen[0]` gehoben (wie `migrateObjekt()` der Alt-App)                                                                                                                                                                                                                            |
| 4.6  | `Nutzer`                                                                             | Zerlegung in `Unit` (`id_generate`; Deduplizierung über `nutzeinheit`+`lage` innerhalb der Property), `Person` (`id_generate`; entfällt bei Leerstand), `Tenancy` (übernimmt `Nutzer.id`), `OccupancyPeriod` (`id_generate`, `kind` aus Leerstand-Disjunktion) und `Prepayment` (Abschnitt 4.7)                                                        |
| 4.7  | `Nutzer.vz_monat` / `vz_gesamt` / `keine_vz_vereinbart`                              | genau ein `Prepayment` je OccupancyPeriod: `vz_monat` gesetzt (auch 0) → `monthly`; sonst `vz_gesamt` → `annual`; sonst `keine_vz_vereinbart` → `none_agreed`; sonst kein Prepayment + `info`-Issue                                                                                                                                                    |
| 4.8  | `Kostenart`                                                                          | `CostCategory`; `rechnungen[]` → `CostEntry` je Beleg (`id_generate`)                                                                                                                                                                                                                                                                                  |
| 4.9  | `Heizkreis`                                                                          | `HeatingSystem` (eines je Property, `id_generate`) + `HeatingCircuit` (`buildingId` = v3-Heizkreis-`id`); `brennstoff`-Block und `energiequellen[]` → `EnergySource` (+ `FuelStock` je Quelle×Jahr, `FuelDelivery` je Lieferung); Einzelblock-Fallback (`Abrechnung.brennstoff` ohne `heizkreise[]`) erzeugt einen impliziten Heizkreis + `info`-Issue |
| 4.10 | `Abrechnung.co2`, `Heizkreis.co2`                                                    | `HeatingCircuit.co2` (`Co2Config`, Modus `auto`/`manual` aus `modus`)                                                                                                                                                                                                                                                                                  |
| 4.11 | `Stromzaehler`                                                                       | `Meter` (`heizkreis_id` per `ref_split`); `jahresstatus[jahr]` → `MeterBillingStatus` je Jahr mit vorhandener BillingPeriod; Jahre ohne BillingPeriod → `warning`, Eintrag wird trotzdem angelegt (`billingPeriodId` bleibt leer, das Legacy-Jahr bleibt im Feld `year` erhalten)                                                                      |
| 4.12 | `Buchung`                                                                            | `BankBooking` (Kategorien-Enum identisch `BUCH_KATEGORIEN`; `hash` → `dedupeHash`; `_heizkreis`/`_hk` per `ref_split` → `heatingTarget`; `_geprueft` → `reviewed`; `_importiert` → `importedAt`); `splits[]` → `BankBookingSplit`                                                                                                                      |
| 4.13 | `Abrechnung._protokoll[]`                                                            | `AuditEvent` je Eintrag (append-only; variable Felder verbatim nach `details`)                                                                                                                                                                                                                                                                         |
| 4.14 | —                                                                                    | `AllocationRule`: die fünf Standardregeln (Abschnitt 3.3) werden einmalig erzeugt (v3 kennt nur das Feld `umlage_nach`)                                                                                                                                                                                                                                |

## 5. Bewusst verworfene Felder (`report.droppedFields`)

Verwerfen ist nur mit dokumentierter Begründung zulässig. Stand PR 03
gibt es genau zwei Kandidaten:

| v3-Feld                  | Begründung                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Block.hk` (`HK1`…`HK4`) | Redundanter Anzeige-Alias der Block-ID; Zielmodell referenziert Heizkreise über `buildingId`. Wird zusätzlich als `preserve_unknown` konserviert, also nicht destruktiv. |
| `Nutzer._abrStatus`      | Transienter UI-Berechnungsstatus der Alt-App (wird bei jedem Rechenlauf neu gesetzt); im Zielmodell ersetzt durch `CalculationRun`/`CalculationResult`.                  |

Beide Werte werden im Bericht nur mit `valueType`, niemals mit Inhalt
ausgewiesen (Datenschutz, `migrationDroppedFieldSchema`).

## 6. Unbekannte Felder (`report.unmappedFields`)

Alle v3-Schemas sind `looseObject`: Felder, die dieses Mapping nicht
kennt, überleben das Parsen. Die Migration legt sie je Entität unter
`legacyUnmapped` als begrenzte Pfad-/Wert-Liste im Zielobjekt ab. Dadurch
werden unbekannte Originalschlüssel nie als Objekt-Merge-Schlüssel verwendet.
Die `strictObject`-Schemas des Zielformats führen dieses Feld explizit und die
Migration listet redigierte Platzhalterpfade in `report.unmappedFields`. Ist
das in einer Entität nicht
möglich, schlägt die Migration fehl statt still zu verwerfen
(`validation_failed`).

Das Feld `legacyUnmapped` ist seit PR 03 an allen persistierten Zielentitäten
vorhanden (`legacyUnmappedSchema` in `entities/shared.ts`). Es akzeptiert nur
JSON-sichere Werte und begrenzt Eintragszahl, Tiefe, Knoten und Textmenge.

Migrations-Issues enthalten keine rohen Legacy-Werte. Personen-, Bank-,
Beleg- oder sonstige Quelldaten bleiben im lokalen Zielbestand; der Bericht
enthält dafür nur Code, Pfad und redigierte Erläuterungen.

## 7. Migrationsbericht (Masterplan 9.3)

Sicherheitspräzisierung für PR 04: Dynamische Originalschlüssel erscheinen
ausschließlich in `legacyUnmapped`; Berichtspfade verwenden dafür den
Platzhalter `<unknown-field>`. Der reservierte Schlüssel `__proto__` ist eine
bewusste Ausnahme: Er wird an der Systemgrenze redigiert abgewiesen und nie
als Objekt-Merge-Schlüssel verarbeitet.

`migrationReportSchema` (`packages/schema/src/migrations/report.ts`):
Quelldateiname, SHA-256 der Quelldatei, erkannte/Ziel-Schema-Version,
Zählungen (`migrationCountsSchema`), Issues (Kategorienmodell 7.1),
`changedFields` (Regelkatalog Abschnitt 3), `droppedFields`
(Abschnitt 5), `unmappedFields` (Abschnitt 6), Zeitstempel, App-Version.

## 8. Round-Trip und Akzeptanz (Masterplan 9.4)

Pflichttest (PR 04):

```text
v3-Fixture → Import/Migration → Export (Schema 4)
→ erneuter Import → fachlich identischer Datenbestand
```

„Fachlich identisch" heißt: gleiche Entitätszahlen, gleiche IDs,
gleiche Beträge (Cent), gleiche Zeiträume, gleiche unbekannt-Felder.
Fixtures ausschließlich frei erfunden (`packages/schema/tests/fixtures.ts`
zeigt das Muster); niemals Werte aus `legacy/index.html` übernehmen —
auch die dortigen sanitisierten Platzhalter sind Beispieldaten, keine
Fixtures (ADR-0001).

## 9. In PR 04 geschlossene Punkte

- Umgesetzte Fixture-Suite: Volljahr, Nutzerwechsel, Leerstand,
  mehrere Blöcke/Heizkreise, Einzelblock-Fallback, historisches
  Root-Layout, unbekannte Felder, ungültige Eingaben
  (`invalid_json_structure`, `unsupported_schema_version`,
  `newer_schema_version`).
- `Block.hk` wird wie in Abschnitt 5 festgelegt als `legacyUnmapped`
  konserviert.

## 10. Implementierungsentscheidungen PR 04

PR 04 hat die offenen Vertragslücken wie folgt geschlossen:

- Die äußere Importgrenze liegt in `packages/import-export`. Sie begrenzt
  Originaldateien vor Dekodierung und Hashing auf 10 MiB, dekodiert UTF-8
  strikt, parst JSON ohne Rohdaten in Fehlermeldungen und bildet SHA-256 über
  eine unveränderte Kopie der Originalbytes.
- Neu erzeugte IDs sind deterministische UUIDv8-Werte aus Quell-SHA-256 und
  stabilem Quellpfad. Gleiche Eingabe, gleicher Hash und gleiche Zeitquelle
  ergeben deshalb bytegleiches Ergebnis ohne Zufall.
- Legacy-Block-IDs (`B1` usw.) sind nur innerhalb einer Liegenschaft eindeutig.
  `Building.id` wird daher als `<propertyId>:<legacyBlockId>` gespeichert. Alle
  Gebäude-, Heizkreis-, Scope-, Zähler- und Buchungsreferenzen verwenden
  dieselbe Zuordnung.
- Fehlt `Objekt.bloecke`, werden neutrale Blocks ausschließlich aus vorhandenen
  Heizkreis-IDs abgeleitet. Die Objekt-/Adress-spezifische Defaultliste der
  Legacy-App wird aus Datenschutzgründen weder kopiert noch als Fixture genutzt.
- Fehlen bei einer vorhandenen Jahreszahl beide Zeitraumgrenzen, wird der
  dokumentierte Volljahreszeitraum `01.01.–31.12.` erzeugt und als `info`
  gemeldet. Ein teilweise vorhandener oder ungültiger Zeitraum führt dagegen
  zu `validation_failed`.
- Ungültige optionale Werte werden redigiert gemeldet, im Zielfeld ausgelassen
  und unter `legacyUnmapped` konserviert. Ungültige Pflichtwerte (unter anderem
  Firmenname, Jahr/Zeitraum, Kostenartenname, Beleg-/Buchungsbetrag,
  Zählerart und Auditaktion) brechen den gesamten Lauf mit
  `validation_failed` ab; es werden keine fachlichen Nullwerte erfunden.
- Historische Root-Jahresfelder werden nur dann gehoben, wenn
  `abrechnungen[]` leer ist. Bei gleichzeitig vorhandenen modernen und alten
  Jahresfeldern hat `abrechnungen[]` Vorrang; die alten Werte werden mit
  Warnung konserviert.
- Anhänge benötigen sicheren Dateinamen, erlaubte MIME-/Dateiendungs-Kombination,
  korrektes Base64, höchstens 4 MiB dekodierte Größe und passende Dateisignatur
  (PDF/JPEG/PNG/WEBP). Abgewiesene Anhänge bleiben vollständig konserviert.
- `Block.hk` bleibt wie in Abschnitt 5 entschieden zusätzlich im jeweiligen
  `Building.legacyUnmapped` erhalten und wird im Bericht als verworfen sowie
  konserviert ausgewiesen.

Die in Abschnitt 9 geforderte Fixture-Suite ist in
`packages/schema/tests/pr04-*.test.ts` und
`tests/migration/legacy-v3-import.test.ts` umgesetzt. Alle Fixtures sind frei
erfunden und verwenden keine Werte aus `legacy/index.html`.

### Ressourcenlimits

Die Dateigrenze akzeptiert höchstens 10 MiB Originalbytes. Vor Zod und
Transformation gelten zusätzlich 1.000 Elemente je Collection, 10.000
Knoten insgesamt, 64 Ebenen und 10 MiB Text einschließlich Schlüsseln. Die
Collection- und Knotengrenzen begrenzen zugleich die kumulativen Kopierkosten
der unveränderlich aufgebauten Zielarrays.
Überschreitungen werden mit `migration.input_limits_exceeded` abgewiesen.
Proxy-/Typed-Array-Sonderfälle, Accessor-Eigenschaften, werfende
Options-Getter und Zeitquellen bleiben innerhalb der Importgrenze und liefern
ausschließlich redigierte Fehler.
