# Datenmodell (Schema-Version 4)

Stand: 2026-07-14
Verantwortlich: Claude (PR 03 – Schema und Legacy-v3-Mapping)
Quelle der Wahrheit für Laufzeit-Typen: `packages/schema/src/`

Dieses Dokument beschreibt das neue Datenmodell der Nebenkosten-App
(Masterplan Abschnitt 5). Das Legacy-Modell (Schema-Version 3) ist in
`legacy/behavior-map.md` Abschnitt 3 dokumentiert; das Feldmapping
v3 → v4 in `docs/MIGRATION.md`.

## 1. Technische Grundregeln (Masterplan 5.3)

| Regel                                           | Umsetzung in `packages/schema`                                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDs sind stabile Strings, bevorzugt UUIDs       | `entityIdSchema` (nicht-leer, URL-sicheres Zeichenset). Neu erzeugte IDs müssen UUIDs sein (`uuidSchema`); aus v3 migrierte IDs behalten ihre Legacy-Form (`f_…`, `obj_…`, `B1`, …), damit Referenzen stabil bleiben. |
| Datumswerte als ISO `YYYY-MM-DD`                | `isoDateSchema` (`z.iso.date()`, kalendarisch gültig)                                                                                                                                                                 |
| Zeitstempel als ISO-8601 mit Zeitzone           | `isoTimestampSchema` (`Z` oder Offset verpflichtend)                                                                                                                                                                  |
| Geldbeträge als ganze Centwerte                 | `moneyCentsSchema` (Integer; Fließkommawerte werden abgelehnt). Feldnamen enden auf `…Cents`.                                                                                                                         |
| Mengen mit Einheit und Dezimalwert              | `quantitySchema` = `{ value, unit }`, Einheitenkatalog `quantityUnitSchema` (`l`, `kg`, `t`, `kWh`, `m3`, `m2`, `einheiten`, `personen`, `stueck`)                                                                    |
| Prozentwerte nicht als formatierte Strings      | `percentSchema` (Zahl 0–100)                                                                                                                                                                                          |
| `null` / „nicht erfasst“ / `0` unterscheidbar   | Konvention: Feld fehlt (`undefined`) = nicht erfasst; `null` = bewusst „nicht vorhanden“; `0` = echter Wert. Schemas verwenden `.nullish()`; niemals stille Defaults auf `0`.                                         |
| Explizite `schemaVersion` je Datei              | `appDataFileSchema.schemaVersion = 4` (Literal); `CURRENT_SCHEMA_VERSION`                                                                                                                                             |
| Unbekannte neuere Versionen nicht überschreiben | `probeSchemaVersion()` liefert `newer-than-supported`; Migrations-/Ladepfade müssen dann blockieren                                                                                                                   |
| Keine stillen Feldverluste                      | Aktuelles Format: `strictObject` (unbekannte Felder ⇒ Validierungsfehler). Legacy v3: `looseObject` (unbekannte Felder bleiben erhalten).                                                                             |

## 2. Dateistruktur

Eine Datei im aktuellen Format (`appDataFileSchema`) besteht aus:

```text
AppDataFile
├── schemaVersion: 4
├── meta                  // technische Metadaten
│   ├── savedAt           // letzter Speicherzeitpunkt
│   ├── appVersion
│   └── migratedFrom      // { schemaVersion, sourceSha256, migratedAt }
├── masterData            // Stammdaten (jahresunabhängig, Masterplan 5.2)
│   ├── organizations[]
│   ├── ownerCompanies[]
│   ├── properties[]
│   ├── buildings[]
│   ├── units[]
│   ├── persons[]
│   ├── tenancies[]
│   ├── allocationRules[]
│   ├── heatingSystems[]
│   └── meters[]
└── billingData           // abrechnungsjahresbezogen (Masterplan 5.2)
    ├── billingPeriods[]
    ├── occupancyPeriods[]
    ├── prepayments[]
    ├── costCategories[]
    ├── costEntries[]
    ├── bankBookings[]
    ├── heatingCircuits[]
    ├── energySources[]
    ├── fuelStocks[]
    ├── fuelDeliveries[]
    ├── meterReadings[]
    ├── meterBillingStatuses[]
    ├── calculationRuns[]
    ├── calculationResults[]
    ├── documents[]
    └── auditEvents[]
```

Alle Entitäten liegen flach in Arrays und referenzieren einander über
IDs (keine Verschachtelung wie im Legacy-Baum `firmen→objekte→…`). Das
macht Migrationen, Diffs und spätere Datenbank-Anbindung (Phase 2)
mechanisch einfacher und erzwingt saubere Beziehungsdefinitionen.

Feldspezifische Einheiten und fachlich unplausible Vorzeichen werden bewusst
in `packages/validators` (PR 10) geprüft. Das Strukturschema lässt solche
Legacy-Werte zunächst zu, damit die Migration sie nicht verwirft; PR 04 meldet
sie als Issue und bewahrt den Originalwert gegebenenfalls in
`legacyUnmapped`. Die Einheit selbst bleibt im `Quantity` immer explizit.

## 3. Entitäten

Notation: „P“ = Pflichtfeld, „opt“ = optional (`.nullish()`,
Konvention aus Abschnitt 1). Legacy-Spalte = Quellfeld im v3-Format
(Details in `docs/MIGRATION.md`).

### 3.1 Organization / Mandant (`organizationSchema`)

Neu (v3 kennt keine Mandanten; eine Datei = ein impliziter Mandant).

| Feld        | Typ          | P/opt | Legacy                                 |
| ----------- | ------------ | ----- | -------------------------------------- |
| `id`        | EntityId     | P     | — (neu)                                |
| `name`      | string       | P     | — (neu, aus Dateiname/Benutzereingabe) |
| `createdAt` | IsoTimestamp | opt   | —                                      |

### 3.2 OwnerCompany / Eigentümergesellschaft (`ownerCompanySchema`)

| Feld                  | Typ              | P/opt | Legacy               |
| --------------------- | ---------------- | ----- | -------------------- |
| `id`                  | EntityId         | P     | `Firma.id`           |
| `organizationId`      | EntityId         | P     | —                    |
| `name`                | string           | P     | `name1`              |
| `additionalNameLines` | string[] (max 3) | P     | `name2..name4`       |
| `address`             | Address          | opt   | `strasse`, `plz_ort` |
| `postBox`             | string           | opt   | `postfach`           |
| `contact`             | ContactPerson    | opt   | `ansprechpartner`    |
| `bankAccount`         | BankAccount      | opt   | `bank`               |

`Address.postalCodeAndCity` bleibt bewusst kombiniert (Legacy `plz_ort`
ist nicht verlustfrei zerlegbar; Normalisierung wäre eine stille
Datenänderung).

### 3.3 Property / Liegenschaft (`propertySchema`)

| Feld               | Typ         | P/opt | Legacy                    |
| ------------------ | ----------- | ----- | ------------------------- |
| `id`               | EntityId    | P     | `Objekt.id`               |
| `ownerCompanyId`   | EntityId    | P     | Position im Baum          |
| `internalNumber`   | string      | opt   | `eigene_nr`               |
| `externalNumber`   | string      | opt   | `objekt_nr`               |
| `address`          | Address     | opt   | `strasse`, `plz_ort`      |
| `bankAccount`      | BankAccount | opt   | `iban`, `kontoinhaber`    |
| `legacySourceInfo` | Record      | opt   | `excel_quelle` (verbatim) |

### 3.4 Building / Gebäudeblock (`buildingSchema`)

Legacy: `Block` (`B1`…`B9`), jahresunabhängige Heizkreis-Blöcke.

| Feld                      | Typ      | P/opt | Legacy                                                   |
| ------------------------- | -------- | ----- | -------------------------------------------------------- |
| `id`                      | EntityId | P     | `<Property.id>:<Block.id>` (lokale Legacy-ID namespaced) |
| `propertyId`              | EntityId | P     | Position im Baum                                         |
| `name`                    | string   | P     | `name`                                                   |
| `shortName`               | string   | opt   | `kuerzel`                                                |
| `defaultEnergySourceType` | string   | opt   | `energietraeger`                                         |
| `mandateRefPrefixes`      | string[] | P     | `prefix`                                                 |

### 3.5 Unit / Nutzungseinheit (`unitSchema`)

Neu als eigene Entität (v3 vermischt Einheit, Person und Vertrag im
`Nutzer`-Objekt).

| Feld            | Typ          | P/opt | Legacy                           |
| --------------- | ------------ | ----- | -------------------------------- |
| `id`            | EntityId     | P     | — (neu, aus `Nutzer` extrahiert) |
| `propertyId`    | EntityId     | P     | Position im Baum                 |
| `buildingId`    | EntityId     | opt   | abgeleitet aus `mandatsref`      |
| `label`         | string       | opt   | `nutzeinheit`                    |
| `location`      | string       | opt   | `lage`                           |
| `usableAreaSqm` | Quantity(m2) | opt   | `flaeche_nf`                     |
| `heatedAreaSqm` | Quantity(m2) | opt   | `flaeche_nf_hzg`                 |
| `roomCount`     | number       | opt   | `zimmer`                         |

### 3.6 Person / Vertragspartner (`personSchema`)

| Feld                    | Typ                                       | P/opt | Legacy                           |
| ----------------------- | ----------------------------------------- | ----- | -------------------------------- |
| `id`                    | EntityId                                  | P     | — (neu, aus `Nutzer` extrahiert) |
| `organizationId`        | EntityId                                  | P     | —                                |
| `salutation`            | Enum (`Herr`, `Frau`, `Familie`, `Firma`) | opt   | `anrede`                         |
| `firstName`, `lastName` | string                                    | opt   | `vorname`, `nachname`            |
| `displayName`           | string                                    | opt   | `name` (Freitext-Alternative)    |
| `companyOrPrivate`      | string                                    | opt   | `firma_privat`                   |
| `email`                 | string                                    | opt   | `email`                          |
| `note`                  | string                                    | opt   | —                                |

### 3.7 Tenancy / Mietverhältnis (`tenancySchema`)

| Feld                                                        | Typ        | P/opt | Legacy                                                |
| ----------------------------------------------------------- | ---------- | ----- | ----------------------------------------------------- |
| `id`                                                        | EntityId   | P     | `Nutzer.id` (stabil übernommen)                       |
| `unitId`                                                    | EntityId   | P     | —                                                     |
| `personIds`                                                 | EntityId[] | P     | —                                                     |
| `mandateReference`                                          | string     | opt   | `mandatsref`                                          |
| `movedIn`, `movedOut`                                       | IsoDate    | opt   | `eingezogen`, `ausgezogen`                            |
| `monthlyRentCents`                                          | MoneyCents | opt   | `miete_monat` (in Berechnung ungenutzt, wird bewahrt) |
| `shippingAddressStreet`, `shippingAddressPostalCodeAndCity` | string     | opt   | `versand_strasse`, `versand_plz_ort`                  |

### 3.8 OccupancyPeriod / Nutzungszeitraum (`occupancyPeriodSchema`)

| Feld                             | Typ                   | P/opt                      | Legacy                                           |
| -------------------------------- | --------------------- | -------------------------- | ------------------------------------------------ |
| `id`                             | EntityId              | P                          | — (neu)                                          |
| `billingPeriodId`, `unitId`      | EntityId              | P                          | Position im Baum                                 |
| `tenancyId`                      | EntityId              | opt (`null` bei Leerstand) | `Nutzer.id`                                      |
| `kind`                           | `tenant` \| `vacancy` | P                          | `istLeerstand()`-Disjunktion                     |
| `legacyActiveFlag`               | string                | opt                        | `aktiv` (Anzeige-Ampel, ohne Rechenwirkung)      |
| `displayOrder`                   | int                   | opt                        | `nr`                                             |
| `from`, `to`                     | IsoDate               | opt                        | `eingezogen`, `ausgezogen` (auf Periode bezogen) |
| `persons`                        | Quantity(personen)    | opt                        | `personen`                                       |
| `consumptionUnits`               | Quantity(einheiten)   | opt                        | `einheiten`                                      |
| `consumptionUnitsEstimated`      | boolean               | opt                        | `einheiten_geschaetzt`                           |
| `consumptionUnitsEstimateReason` | string                | opt                        | `einheiten_schatz_grund`                         |
| `applySection12Reduction`        | boolean               | opt                        | `kuerzung12_anwenden` (§ 12 HeizKV)              |
| `costScope`, `propertyTaxScope`  | AllocationScope       | opt                        | `kosten_scope`, `grundsteuer_key`                |
| `coldWater`, `warmWater`         | Quantity(m3)          | opt                        | `kaltwasser_m3`, `wasser_m3`                     |
| `dispatchDate`                   | IsoDate               | opt                        | `versanddatum_nutzer`                            |
| `note`                           | string                | opt                        | `bemerkung`                                      |

### 3.9 BillingPeriod / Abrechnungsjahr (`billingPeriodSchema`)

| Feld                         | Typ                                                               | P/opt | Legacy                                       |
| ---------------------------- | ----------------------------------------------------------------- | ----- | -------------------------------------------- |
| `id`                         | EntityId                                                          | P     | `Abrechnung.id`                              |
| `propertyId`                 | EntityId                                                          | P     | Position im Baum                             |
| `year`                       | int                                                               | P     | `jahr`                                       |
| `periodStart`, `periodEnd`   | IsoDate                                                           | P     | `zeitraum.von/bis`                           |
| `status`                     | Enum `DRAFT`/`IN_REVIEW`/`READY_FOR_PDF`/`FINALIZED`/`SUPERSEDED` | P     | `status` (Stringwerte, siehe MIGRATION.md 3) |
| `dispatchDate`               | IsoDate                                                           | opt   | `versanddatum`                               |
| `heatingDefaults`            | HeatingDefaults                                                   | opt   | `vorgaben`                                   |
| `totals`                     | BillingTotals (Quantities)                                        | opt   | `gesamt`                                     |
| `standardCostCategoryStatus` | Record<key, {active, reason}>                                     | opt   | `standardKostenartenStatus`                  |
| `notes`                      | {general, credit, additionalPayment}                              | opt   | `hinweise`                                   |
| `coverLetter`                | {active, text}                                                    | opt   | `anschreiben`                                |
| `lastModifiedAt`             | IsoTimestamp                                                      | opt   | `_ts` (ms-Epoch → ISO)                       |

### 3.10 CostCategory / Kostenart (`costCategorySchema`)

| Feld                           | Typ                           | P/opt | Legacy                                  |
| ------------------------------ | ----------------------------- | ----- | --------------------------------------- |
| `id`                           | EntityId                      | P     | `Kostenart.id`                          |
| `billingPeriodId`              | EntityId                      | P     | Position im Baum                        |
| `standardKey`                  | string                        | opt   | `standard_key`                          |
| `kind`                         | `operating`/`water`/`heating` | P     | `typ` (`betrieb`/`wasser`/`heizung`)    |
| `label`                        | string                        | P     | `bezeichnung`                           |
| `statementText`                | string                        | opt   | `kostentext`                            |
| `betrkvCategory`               | string                        | opt   | `betrKV_kat` (inkl. `NICHT_UML`)        |
| `allocationKey`                | AllocationKey                 | opt   | `umlage_nach`                           |
| `scope`                        | AllocationScope               | opt   | `scope_key`                             |
| `totalAmountCents`             | MoneyCents                    | opt   | `betrag` (Euro→Cent)                    |
| `date`                         | IsoDate                       | opt   | `datum`                                 |
| `isOperatingElectricitySource` | boolean                       | opt   | `betriebsstrom_abzug`                   |
| `hideWhenZero`                 | boolean                       | opt   | `abrechnung_ausblenden`                 |
| `allocablePercent`             | Percent                       | opt   | `umlage_proz`                           |
| `laborSharePercent`            | Percent                       | opt   | `lohn_anteil_proz` (§ 35a EStG)         |
| `fromPropertyTaxImport`        | boolean                       | opt   | `aus_grundsteuer_import`                |
| `propertyTaxAssessmentCents`   | MoneyCents                    | opt   | `grundsteuermessbetrag_eur` (Euro→Cent) |

Umlageschlüssel (`allocationKeySchema`): `usable_area` (`m2_nf`),
`heated_area` (`m2_nf_hzg`), `consumption_units` (`einheiten`),
`residential_units` (`we_anzahl`), `direct` (`direkt`).

### 3.11 CostEntry / Kostenbuchung oder Rechnung (`costEntrySchema`)

Legacy: `Beleg` (`Kostenart.rechnungen[]`).

| Feld               | Typ                              | P/opt | Legacy                                                                |
| ------------------ | -------------------------------- | ----- | --------------------------------------------------------------------- |
| `id`               | EntityId                         | P     | — (neu; Belege haben in v3 keine ID)                                  |
| `costCategoryId`   | EntityId                         | P     | Position im Baum                                                      |
| `date`             | IsoDate                          | opt   | `datum`                                                               |
| `description`      | string                           | opt   | `bezeichnung`                                                         |
| `amountCents`      | MoneyCents                       | P     | `betrag` (Euro→Cent)                                                  |
| `receiptReference` | string                           | opt   | `beleg`                                                               |
| `attachment`       | {fileName, mimeType, dataBase64} | opt   | `datei_name`, `datei_typ`, `datei_data`; PDF/JPEG/PNG/WEBP, max. 4 MB |
| `allocablePercent` | Percent                          | opt   | `umlage_proz`                                                         |
| `bookingLink`      | {bankBookingId, splitId}         | opt   | `_buchung`, `_buchung_split`                                          |
| `externalPayment`  | {confirmed, reason}              | opt   | `_extern_ok`, `_extern_grund`                                         |
| `meterId`          | EntityId                         | opt   | `_stromzaehler_id`                                                    |
| `estimate`         | {isEstimated, reason}            | opt   | `_geschaetzt`, `_schaetzung_grund`                                    |

### 3.12 AllocationRule / Umlageregel (`allocationRuleSchema`)

Neu als Stammdaten-Entität (v3 kennt nur das Feld `umlage_nach` je
Kostenart): `id`, `organizationId`, `name`, `key: AllocationKey`,
`description?`. Die Migration erzeugt die fünf Standardregeln.

### 3.13 HeatingSystem / Heizsystem (`heatingSystemSchema`)

Neu (v3 implizit: ein Objekt = eine Anlage): `id`, `propertyId`,
`name?`. Die Migration erzeugt genau eines je Liegenschaft.

### 3.14 HeatingCircuit / Heizkreis (`heatingCircuitSchema`)

| Feld                                 | Typ                                                                           | P/opt | Legacy                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------- |
| `id`                                 | EntityId                                                                      | P     | — (neu; v3 nutzt Block-ID doppelt)                                   |
| `billingPeriodId`, `heatingSystemId` | EntityId                                                                      | P     | Position im Baum                                                     |
| `buildingId`                         | EntityId                                                                      | P     | `Heizkreis.id` (= Block-ID)                                          |
| `co2`                                | Co2Config (`auto`/`manual`)                                                   | opt   | `co2`                                                                |
| `overrides`                          | {consumptionSharePercent, baseSharePercent, operatingElectricitySharePercent} | opt   | `vorgaben`                                                           |
| `hasCentralHotWater`                 | boolean                                                                       | P     | `hat_warmwasser`                                                     |
| `hotWaterSharePercent`               | Percent                                                                       | opt   | `ww_anteil_proz` (18–70, § 9 HeizKV; Bereichsprüfung in Validatoren) |

### 3.15 EnergySource / Energiequelle (`energySourceSchema`)

Liegt im `billingData`-Container: Energiequellen hängen am
jahresbezogenen Heizkreis (v3: `Heizkreis.energiequellen[]` je
Abrechnung) — eine Stammdaten-Verortung würde bei mehreren
Abrechnungsjahren instabile oder doppelte Referenzen erzeugen.

| Feld                       | Typ      | P/opt | Legacy                                             |
| -------------------------- | -------- | ----- | -------------------------------------------------- |
| `id`                       | EntityId | P     | — (neu)                                            |
| `heatingCircuitId`         | EntityId | P     | Position im Baum                                   |
| `key`                      | string   | P     | `Energiequelle.id` (`haupt`, `wp_strom`, `gas`, …) |
| `name`                     | string   | opt   | `name`                                             |
| `sourceType`               | string   | opt   | `art`                                              |
| `calorificValueKwhPerUnit` | number   | opt   | `heizwert_kwh`                                     |
| `co2FactorKgPerKwh`        | number   | opt   | `co2_faktor_kg_kwh`                                |

### 3.16 FuelStock / Brennstoffbestand (`fuelStockSchema`)

| Feld                                | Typ        | P/opt | Legacy                             |
| ----------------------------------- | ---------- | ----- | ---------------------------------- |
| `id`                                | EntityId   | P     | — (neu)                            |
| `energySourceId`, `billingPeriodId` | EntityId   | P     | Position im Baum                   |
| `openingQuantity`                   | Quantity   | opt   | `anfangsbestand_menge`             |
| `openingValueCents`                 | MoneyCents | opt   | `anfangsbestand_wert` (Euro→Cent)  |
| `openingPricePerUnitCents`          | MoneyCents | opt   | `anfangsbestand_preis` (Euro→Cent) |
| `remainingQuantity`                 | Quantity   | opt   | `restbestand_menge`                |

### 3.17 FuelDelivery / Lieferung (`fuelDeliverySchema`)

| Feld                                | Typ             | P/opt | Legacy                                    |
| ----------------------------------- | --------------- | ----- | ----------------------------------------- |
| `id`                                | EntityId        | P     | — (neu; Lieferungen haben in v3 keine ID) |
| `energySourceId`, `billingPeriodId` | EntityId        | P     | Position im Baum                          |
| `date`                              | IsoDate         | opt   | `datum`                                   |
| `quantity`                          | Quantity        | opt   | `menge` + `mengeneinheit`                 |
| `quantityStatus`, `quantityNote`    | string          | opt   | `mengenstatus`, `mengenhinweis`           |
| `quantityManuallySet`               | boolean         | opt   | `_menge_manuell`                          |
| `amountCents`                       | MoneyCents      | opt   | `betrag` (Euro→Cent)                      |
| `description`, `receiptReference`   | string          | opt   | `bezeichnung`, `beleg`                    |
| `bookingLink`                       | BookingLink     | opt   | `_buchung`, `_buchung_split`              |
| `externalPayment`                   | ExternalPayment | opt   | `_extern_ok`, `_extern_grund`             |
| `meterId`                           | EntityId        | opt   | `_stromzaehler_id`                        |
| `convertedFromCostCategoryId`       | EntityId        | opt   | `_konvertiert_von_kostenart`              |

### 3.18 Meter / Zähler (`meterSchema`)

| Feld                      | Typ                                         | P/opt | Legacy                                     |
| ------------------------- | ------------------------------------------- | ----- | ------------------------------------------ |
| `id`                      | EntityId                                    | P     | `Stromzaehler.id`                          |
| `propertyId`              | EntityId                                    | P     | Position im Baum                           |
| `kind`                    | `general`/`heat`                            | P     | `art` (`allgemein`/`waerme`)               |
| `address`                 | string                                      | opt   | `adresse`                                  |
| `meterNumber`, `maloId`   | string                                      | opt   | `zaehlernummer`, `malo_id`                 |
| `provider`                | string                                      | opt   | `anbieter`                                 |
| `contractOrAccountNumber` | string                                      | opt   | `vertragsnummer_oder_konto`                |
| `energySourceRef`         | {heatingCircuitBuildingId, energySourceKey} | opt   | `heizkreis_id` (`B3:haupt`-Format zerlegt) |
| `validFrom`, `validTo`    | IsoDate                                     | opt   | `gueltig_von`, `gueltig_bis`               |
| `meterNumberStatus`       | `open`/`confirmed`                          | opt   | `zaehlernummer_status`                     |
| `note`, `additionalNote`  | string                                      | opt   | `notiz`, `zusatz_hinweis`                  |

### 3.19 MeterReading / Ablesung (`meterReadingSchema`)

Neu (v3 hat keine eigenständigen Ablesungen): `id`, `meterId`,
`billingPeriodId?`, `date?`, `value: Quantity`, `source?`
(`manual`/`imported`/`estimated`), `note?`.

### 3.20 MeterBillingStatus (`meterBillingStatusSchema`)

Legacy: `Stromzaehler.jahresstatus[jahr]` (manuell gepflegte
Jahres-Checkliste): `id`, `meterId`, `year`, `billingPeriodId`.
`year` ist immer Pflicht; `billingPeriodId` ist optional, weil ein
Legacy-Jahresstatus auf ein Jahr ohne angelegte BillingPeriod zeigen kann;
dazu `bookingPresent?`, `annualInvoicePresent?`, `note?`,
`estimateAmountCents?` (Euro→Cent), `estimateReason?`.

### 3.21 Prepayment / Vorauszahlung (`prepaymentSchema`)

Discriminated Union über `mode`:

| Modus         | Felder               | Legacy                                     |
| ------------- | -------------------- | ------------------------------------------ |
| `monthly`     | `monthlyAmountCents` | `vz_monat` (hat in v3 Vorrang, auch bei 0) |
| `annual`      | `annualAmountCents`  | `vz_gesamt`                                |
| `none_agreed` | —                    | `keine_vz_vereinbart` (§ 556 Abs. 2 BGB)   |

### 3.22 BankBooking / Kontobuchung (`bankBookingSchema`)

Bewusste Erweiterung der Masterplan-5.1-Liste (Bestandsfunktion
Buchungsabgleich, Masterplan 3 — darf nicht verloren gehen). Felder:
siehe `packages/schema/src/entities/bank-booking.ts`; Mapping in
MIGRATION.md 4.12. Kategorien-Enum identisch zu Legacy
`BUCH_KATEGORIEN`. Bankdaten sind Local-only-Daten (niemals in
Fixtures oder GitHub).

### 3.23 CalculationRun / CalculationResult

`calculationRunSchema`: `id`, `billingPeriodId`, `startedAt`,
`appVersion?`, `inputSha256?` (Snapshot-Bindung, Masterplan 10).
`calculationResultSchema`: `id`, `calculationRunId`,
`totals` (Cent-genaue Kontrollsummen inkl.
`controlDifferenceCents`), `warnings: ValidationIssue[]`,
`snapshotFormatVersion`, `resultSnapshot` (Engine-Ergebnis). Der mit
PR 07 präzisierte Vertrag liegt in `packages/core/src/contracts/`:
Snapshot v2 enthält zusätzlich die budgetgedeckte
Betriebsstrom-Umbuchung sowie einen eigenständig versionierten
Heizkosten-/CO₂-Trace v1. Die fachlichen Felder und Rechenketten sind
in `docs/HEATING-CO2.md` beschrieben. In v3 wird das
Berechnungsergebnis nicht persistiert.

### 3.24 ValidationIssue / Prüfhinweis (`validationIssueSchema`)

Kategorienmodell nach Masterplan 7.1 — Vertrag für
`packages/validators` (PR 10) und den Migrationsbericht (PR 04):

| Feld       | Typ                                                                                   | Bemerkung                                           |
| ---------- | ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `severity` | `error` \| `warning` \| `info`                                                        | Legacy `warn` → `warning`                           |
| `code`     | string (`^[a-z0-9_.]+$`)                                                              | stabiler, maschinenlesbarer Schlüssel               |
| `area`     | Enum (u. a. `master_data`, `costs`, `heating`, `co2`, `migration`, `schema`, `other`) | Legacy-Freitext `area` wird gemappt, Rest → `other` |
| `title`    | string                                                                                | Pflicht                                             |
| `detail`   | string                                                                                | opt                                                 |
| `path`     | (string \| int)[]                                                                     | opt, JSON-Pfad zum Befund                           |
| `entity`   | {type, id}                                                                            | opt                                                 |

### 3.25 Document / AuditEvent

`documentSchema`: erzeugte Dokumente (`tenant_statement`,
`combined_statement`, `owner_report`, `total_cost_report`,
`co2_report`, `approval_protocol`, `zip_bundle`) mit
`calculationRunId`-Bindung (snapshotbasiert, Masterplan 10).
`auditEventSchema`: Änderungsprotokoll (Legacy `_protokoll[]`,
append-only); variable Legacy-Felder landen verlustfrei in `details`.

## 4. Legacy-v3-Schema (`packages/schema/src/versions/v3/`)

Das v3-Schema bildet den Bestand ab, wie er tatsächlich ist
(behavior-map Abschnitt 3): keine Laufzeitvalidierung, Zahlen teils
als Strings/`null`, Euro-Fließkomma. Deshalb gilt dort:

- alle Objekte `looseObject` — unbekannte Felder bleiben beim Parsen
  erhalten und werden niemals still verworfen;
- tolerante Feldtypen (`v3NumberishSchema` = number|string|null usw.);
- strukturelle Mindestanforderungen bleiben hart (IDs vorhanden,
  `version === 3`, `firmen` ist ein Array);
- das historische Objekt-Root-Layout (vor `abrechnungen[]`) wird
  unterstützt (Felder dokumentiert auf `v3ObjektSchema`).

## 5. Fachliche Schlüssel-Konventionen (aus v3 übernommen)

- `mandateReference`-Format `<Präfix>_<Nr|leerstand>` steuert die
  automatische Block-/Haus-Zuordnung (`Building.mandateRefPrefixes`).
- `AllocationScope` ersetzt die Legacy-String-Schlüssel `scope_key` /
  `kosten_scope` / `grundsteuer_key` durch eine explizite Union
  (`property` | `building` | `house`).
- Das Legacy-Format `<blockId>:<quelleId>` (Zähler- und
  Buchungs-Heizkreis-Zuordnung) wird als strukturierte Referenz
  `{heatingCircuitBuildingId, energySourceKey}` geführt.

## 6. Offene Punkte

- Die verbindlichen Rundungsregeln stehen in `docs/ROUNDING.md`
  (PR 05/06); als Zieltoleranz gelten 0,01 €. Der historische
  Legacy-Warnwert von 0,50 € bleibt nur als Bestandsbeobachtung
  dokumentiert.
- Snapshot v2 und der Heizkosten-/CO₂-Trace v1 sind mit PR 07
  festgelegt. PR 08 persistiert die vollständige `AppDataFile` einschließlich
  dieser Ergebnisse; Versionsschutz, Revisionen und Restore sind in
  `docs/PERSISTENCE.md` beschrieben.
- Standardkostenarten-Katalog (`STANDARD_KOSTENARTEN`) und
  BetrKV-Kategorienkatalog werden mit der Engine/Validatoren als
  konfigurierbare Kataloge modelliert, nicht als Code-Konstanten
  (behavior-map Risiko 8.1).
