# Changelog

Alle wesentlichen Änderungen dieses Projekts werden hier dokumentiert.

## Unveröffentlicht

## 1.4.0 – 25. Oktober 2026

Schwerpunkte: monatliche Verbrauchsinformation nach § 6a HeizKV
(Fernablesbarkeit, Monatsendstände, PDF und Versandprotokoll), Wasser nach
Wohnungswasserzählern mit Abgleich zum Hauptwasserzähler,
Abrechnungsentgelt der Heizkostenabrechnung, Belegprüfung mit
Betragsabgleich, Mieterliste- und Zählerstand-Import. Schema bleibt v5; neue Felder sind
additiv, keine Datenmigration. Dateien, die eines der neuen Felder
enthalten, lassen sich mit 1.3.0 nicht mehr öffnen.

- **Werkzeuge**: 14 Updates (u. a. pdfmake 0.3.12, React 19.3.1,
  Playwright 1.64.1, Vitest 5.0.5, Vite 8.3.5); die Artefaktprüfung lässt
  genau den pdfkit-Buildpfad aus pdfmake 0.3.12 zu (`docs/DEPLOYMENT.md`),
- **Zählerstände aus Ablesebogen/Messdienst-CSV (PR-37 Teil 3)**: Abschnitt
  unter **Heizung › Zähler** mit Vorlage „Zählerstände“, Spaltenzuordnung
  (Vorschlag nur bei eindeutigem Treffer), Probelauf mit Zeilenfehlern und
  Übernahme nach dem Prinzip alles oder nichts (`source: imported`);
  Zuordnung über die Zählernummer, keine stille Überschreibung vorhandener
  Ablesungen, Plausibilitätshinweise aus PR-31 mit Bestätigung. Stände
  gelten als Tagesende des Stichtags, Jahresbeginn und Folgetag nach
  Jahresende als Tagesbeginn,
- **Wasser nach Zählern, Abgleich mit dem Hauptwasserzähler (ADR-0013,
  E-45-3)**: Entscheidungen E-45-1 bis E-45-3 angenommen (Kalt- plus
  Warmwasser, Leerstand im Nenner, Nenner = Summe der Wohnungszähler).
  Optionales Feld „Verbrauch laut Hauptwasserzähler“ an Wasser-Kostenarten
  (`CostCategory.mainWaterMeterM3`, m³, additiv, Schema v5, nicht ins
  Folgejahr übernommen); Warnung `costs.water_main_meter_difference`, wenn
  die Summe der Wohnungszähler um mehr als 15 % vom Hauptzähler abweicht,
- **Abrechnungsentgelt Heiz-/Warmwasserkostenabrechnung (ADR-0015)**: Art
  des Entgelts an Heizungs-Kostenarten (`CostCategory.meteringFeeKind`:
  Erstellung der Abrechnung, Ablesung, Gerätemiete, Eichung, Sonstiges) und
  Rechnungsangaben am Beleg (`CostEntry.invoice`: Rechnungsnummer, -datum,
  Leistungszeitraum, Netto, Umsatzsteuer, Steuersatz; beide additiv,
  Schema v5) mit Erfassung in der Oberfläche; Vorschau
  `billingServiceFeePreview` mit Kalkulationshilfe **je erstellter
  Heizkostenabrechnung** (je bewohnte Nutzung eine, Nutzerwechsel zwei,
  Leerstand keine), Verteilung über den Heiztopf und Auswirkung je Nutzung;
  `pnpm abrechnung … --abrechnungsentgelt <netto> [--ust <prozent>]`;
  Warnungen `heating.billing_service_duplicate` und
  `costs.invoice_amount_mismatch`,
- **Legacy-v3-Import**: Grenze je Collection von 1.000 auf 10.000 Einträge
  angehoben – Objekte mit über 1.000 Bankbuchungen im Jahr wurden als
  „Eingabegrenzen überschritten“ abgelehnt,
- **Datenschutz (PR-43)**: `docs/DATENSCHUTZ-KI.md` als endgültige Fassung
  (Monatsinformation, Belegprüfung, Mieterinformation); neues Muster
  `docs/DATENSCHUTZ-MIETERINFORMATION.md` nach Art. 13 DSGVO mit
  Einwilligung in den E-Mail-Versand,
- **Betragsabgleich in der Belegprüfung (E-41-2)**: `pnpm belegpruefung …
--erfassungsliste <datei>` vergleicht den unabhängig gelesenen
  Rechnungsbetrag (Format KI-Erfassungsliste) mit der Summe der
  Kostenpositionen und Lieferungen je Rechnung (Toleranz 1 Cent); Befunde
  „Betrag weicht ab“ (mit Hinweis bei Leistungszeitraum über den
  Jahreswechsel) und „Beleg ohne Kostenposition“. Reine Logik
  `compareReceiptAmounts` in `packages/validators`,
- **Tests**: zwei Web-Testdateien (`interim-reading`, `degree-day-split`)
  liefen wegen der Endung `.test.ts` nie; umbenannt, Architekturtest
  verhindert die Endung künftig,
- **Monatsinformation, Schritt 3 (ADR-0014, PR-46)**: PDF „Verbrauchsinformation
  <Monat>“ je Mieter im Fensterkuvert-Format (Heizung und Warmwasser mit
  Vormonat, Vorjahresmonat, Durchschnittsnutzer, Erläuterungen, Annahmen,
  Kontaktsatz mit Telefon und E-Mail); Versandweg am Mietverhältnis
  (`Tenancy.monthlyInformationDelivery`, E-Mail nur mit Zustimmungsdatum);
  Versandliste auf der Seite **Monatsinformation** mit PDF je Mieter, ZIP und
  E-Mail-Entwurf je Mieter (kein BCC), „Monat versendet am“ mit Ausnahmen und
  Versandprotokoll (`billingData.monthlyInformationDispatches`, additiv);
  Warnung `rules.monthly_information_missing` je Monat ohne Protokoll. Versand
  nur bei erfasster Fernablesbarkeit; Versanddatum nicht vor Monatsende,
- **Monatsinformation, Schritt 2 (ADR-0014, PR-46)**: Wohnungs-Warmwasserzähler
  (`unit_hot_water`, m³) mit Zuordnung am Heizkreis
  (`HeatingCircuit.hotWaterMeterAssignments`, additiv, Schema v5); CSV-Import
  der Monatsendstände mit Vorschau (`planMonthlyMeterReadings`: Zuordnung über
  Zählernummer, Einheit, Dubletten, Konflikte, fallende Stände; Übernahme nur
  ohne Probleme und nicht in gesperrte Abrechnungsjahre); Rechenkern
  `calculateMonthlyConsumptionInformation` (Monatsverbrauch je Mieter,
  Vormonat/Vorjahresmonat des eigenen Mietverhältnisses, Durchschnittsnutzer
  aus der Heizspiegel-Mitte „mittel“, Warmwasser m³ → kWh mit 60 °C als
  gekennzeichnetem Schätzwert); neue Seite **Monatsinformation**. Fix:
  Bearbeiten eines Heizkreises behält die Warmwasserzuordnungen,
- **Fernablesbarkeit und Monatsinformation, Schritt 1 (ADR-0014, PR-46)**:
  Regelverzeichnis korrigiert – die monatliche Verbrauchsinformation gilt
  bei fernablesbaren Geräten seit 01.01.2022 (`monthly-consumption-information`),
  `remote-reading` ab 2027 nur noch für die Nachrüstpflicht. Neues optionales
  Feld `Property.remoteReading` (`since`, `exemptionReason`; additiv, Schema
  v5) mit Eingabe im Objekt-Formular. Prüfhinweise: Warnung
  `rules.remote_reading_missing` ab 2027 ohne Fernablesbarkeit (Kürzung 3 %,
  § 12 Abs. 1 Satz 2 HeizKV), Hinweise `rules.remote_reading_exemption` und
  `rules.monthly_information` (Heizung bzw. Heizung und Warmwasser); der
  allgemeine Hinweis `rules.remote_reading` entfällt,
- **Belegprüfung gegen den Rechnungsordner je Objekt (PR-40/41)**:
  `pnpm belegpruefung <datendatei> --jahr <Jahr>` liest den bestehenden
  Rechnungsordner aus der privaten Zuordnung
  `private-data/objekt-ordner.json` und meldet Kosten ohne Belegangabe,
  nicht gefundene Belege, Mehrfachverwendung und Dateien ohne
  Kostenposition. Verknüpfung über das vorhandene Feld
  „Belegnummer/Dateiname“ (keine Schemaänderung); Abrechnungsjahr nach
  Leistungszeitraum, daher Dateien ohne Kostenposition jahresunabhängig;
  nur lesend. Reine Prüflogik `checkReceiptFolder` in
  `packages/validators`; Anleitung `docs/BELEGPRUEFUNG.md`,
- **Wasser nach Zähler (ADR-0013, PR-45)**: neuer Umlageschlüssel
  `water_consumption` „Wasserverbrauch (m³)“ (additiv, Schema v5): Kalt- plus
  Warmwasser je Nutzung, Leerstand im Nenner (trägt der Vermieter), ohne
  Zeitfaktor; Nenner „m³“ und eigene m³ in der Einzelabrechnung. Prüfung:
  Fehler `costs.water_consumption_missing` ohne Kaltwasserwert, Warnung
  `costs.water_meter_not_used`, wenn Zählerwerte vorliegen, Wasserkosten aber
  nach Fläche oder Wohneinheiten verteilt werden (§ 556a Abs. 1 Satz 2 BGB),
- **Screenshots und Musterabrechnungen (ADR-0012, PR-44)**: Rundgang in
  neun Bildern mit Bedienhinweisen, Vorschau der Einzelabrechnung und des
  GiroCodes sowie sechs Muster-PDFs aus dem fiktiven Beispielobjekt unter
  `docs/medien/`, eingebunden in README, Kurzanleitung und
  Beispiel-Beschreibung; erzeugt mit `pnpm medien`. Der Privacy-Scan lässt
  Binärdateien nur dort und nur mit Eintrag in `docs/medien/SHA256SUMS` zu
  und akzeptiert IBANs mit der nicht vergebenen Bankleitzahl 00000000.
  Beispielobjekt praxisnah und vollständig erfasst (keine Prüfhinweise):
  Zählerstände mit Zwischenablesung, Warmwasser nach Wärmezähler und m³,
  Heizspiegel-2026-Vergleichswerte, Klimafaktoren, Vorjahreswerte des
  Voreigentümers, Messdienst, Schornsteinfeger, Steuern und Abgaben je
  Lieferung, Anreden, neue Anschriften nach Auszug, Bankverbindung mit
  Kontoinhaber. `pnpm abrechnung` liest jetzt auch Sicherungen der App
  (Schema v4/v5), nicht nur `nk-daten.json`,
- **Korrekturen aus dem Rundgang**: Anrede „Sehr geehrte Familie Familie …“
  bei Anzeigenamen mit „Familie“ (PDF); Lieferliste unter **Heizkreise →
  Brennstoffe** mit deutschem Datum, Menge und Betrag statt `2025-02-10` und
  `3150.00 €`; Verbrauchstabelle passt bei 1440 px ohne horizontales
  Scrollen,
- **GiroCode bei Nachzahlung (PR-39)**: Die Einzelabrechnung druckt neben
  der Zahlungsaufforderung einen EPC-QR-Code (EPC069-12, Version 002,
  UTF-8, Fehlerkorrektur M) mit Kontoinhaber, IBAN, ggf. BIC, Betrag und
  Verwendungszweck. Kein Code bei Guthaben, ausgeglichenem Saldo,
  ungültiger IBAN/BIC oder fehlendem Kontoinhaber (kein Ersatzname wegen
  der Empfängerüberprüfung der Banken); neuer Hinweis
  `master_data.account_holder_missing` (Stufe info, blockiert die Freigabe
  nicht). Bei Mieterwechsel im Jahr erhält
  der nachfolgende Mieter den Verwendungszweck „NK <Jahr> <Einheit> ab
  TT.MM.“ (QR-Code und Text);
  Berechnung unverändert, keine neue Abhängigkeit (pdfmake-QR),
- **Mieterliste aus Excel/CSV (PR-37 Teil 2)**: Vorlage „Mieterliste“ zum
  Herunterladen unter **Nutzer**; je Zeile eine Belegung (Wohnung mit Fläche,
  Mieter oder Leerstand, Von/Bis, Personen, Vorauszahlung monatlich, jährlich
  oder keine). Vorschau mit Probelauf, Fehlerliste mit Zeilennummern, Übernahme
  nur vollständig; vorhandene Wohnungen werden über die Bezeichnung
  zugeordnet, fehlende angelegt, abweichende Flächen oder Gebäude nie still
  überschrieben. Auch nutzbar, solange ein Objekt noch keine Wohnung hat.
- **Warmwasseranteil bei Wärmepumpen (ADR-0010 „Wärmepumpen“)**: s = Q ÷
  erzeugte Wärme statt ÷ Strom-kWh; neue optionale Felder
  `HeatingCircuit.generatedHeatKwh` (gemessene Wärmemenge am Erzeuger) und
  `EnergySource.seasonalPerformanceFactor` (Jahresarbeitszahl, 1–8) mit
  `seasonalPerformanceFactorEstimated`/`seasonalPerformanceFactorReason`
  (Schätzwert mit Pflichtbegründung), Schema v5 ohne Migration; Rechenweg je
  Quelle im PDF mit Kennzeichnung der Schätzung; Prüffehler
  `heating_compliance.heat_pump_heat_output_missing`, Warnung bei geschätzter
  Jahresarbeitszahl, Fehler ohne Begründung; keine Standard-Jahresarbeitszahl;
  Eingabe im Heizkreis-Formular,
- **Steuern und Abgaben (ADR-0011)**: `FuelDelivery.taxesAndLevies`
  (Umsatzsteuer mit Satz, Energie-/Stromsteuer, CO₂-Kosten BEHG, sonstige
  Abgaben); Einzelabrechnung weist die enthaltenen Beträge je Art für das
  Gebäude und den Mieteranteil aus (§ 6a Abs. 3 Nr. 1 b HeizKV), sonst
  Hinweis mit konkretem CO₂-Betrag; Eingabe an der Lieferung mit
  Umsatzsteuer-Rechner; Prüfhinweis `heating.taxes_and_levies_missing`,
- **Warmwasser gesetzeskonform (ADR-0010)**: Wärmemenge nach § 9 Abs. 2
  HeizKV (Wärmezähler, Volumenformel 2,5 × V × (tw − 10) oder Flächenformel
  32 × A, Erdgas × 1,11); Anteil gilt nach § 9 Abs. 1 für Brennstoff,
  Betriebsstrom und Heizungs-Betriebskosten; Verteilung nach § 8 Abs. 1
  (50–70 % Verbrauch, Rest Fläche) oder ersatzweise nach Fläche; CO₂-Mieteranteil
  getrennt nach Heizung und Warmwasser; Rechenweg im Mieterblatt; Prüfregeln
  `heating_compliance.*` für Altverfahren und § 12-Hinweis; Eingabe im
  Heizkreis-Formular,
- **§ 9b Abs. 3 HeizKV ohne gemischten Maßstab**: Nutzerwechsel ohne
  Zwischenablesung werden für die gesamten Heizkosten einheitlich nach
  Gradtagszahlen oder zeitanteilig aufgeteilt (Warmwasser zeitanteilig);
  Rechenweg im PDF; Prüfregeln `heating.section9b_*`,
- **CO₂-Preis je Brennstoff-Los**: Anfangsbestand mit dem CO₂-Preis seines
  Lieferjahres; Berechnungsgrundlagen nach § 7 Abs. 3 CO2KostAufG im PDF;
  Prüfhinweis `co2.opening_stock_price_missing`,
- **§ 6a-Block**: Vorjahresvergleich auf gleichem Zeitraum (Gradtage),
  Klimafaktor nur bei vollen Jahren, eindeutige Beschriftung gemessen /
  witterungsbereinigt, Kennzeichnung geschätzter Werte (§ 9a),
- **Gesamtabrechnung und Rundung**: Verteilungsgrundlagen (Verbrauchssumme,
  Personenjahre), Leerstandsblock, Klartext statt interner Kennung,
  sichtbarer Rundungsausgleich,
- **Prüfung**: Kabel-TV ab 01.07.2024 als Fehler (§ 2 Nr. 15 BetrKV),
  Heizspiegel-Kategorie gegen Gebäudefläche und Energieträger, Schätzungen
  ohne Begründung, mit starker Vorjahresabweichung oder über 25 % der Fläche,

- **§ 6a HeizKV in der Einzelabrechnung**: Vergleich mit dem
  Durchschnittsnutzer (Heizspiegel-Klassen, eigener Wert in kWh je m² und
  Jahr, Grenzen auf eigene Fläche und Nutzungszeit); Vorjahresvergleich
  witterungsbereinigt mit DWD-Klimafaktoren und – wenn das Vorjahr im System
  liegt – als Energieverbrauch in kWh aus Heizwärme und Warmwasser (nur die
  Heizwärme bereinigt); neue Prüfung `heating.previous_period_not_weather_adjusted`;
  `heating.consumption_benchmark_missing` je Heizkreis ohne Vergleichswerte,
- **Eingaben**: Vergleichswerte (Heizspiegel) am Heizkreis, Klimafaktor am
  Abrechnungsjahr mit Import der DWD-Liste (Postleitzahl aus der
  Objektanschrift), Klimafaktor Vorjahr beim übernommenen Vorjahresverbrauch,
  Auswahl „Entgelt für Verbrauchserfassung“ an Heizungs-Kostenarten,
- **Verbrauchsseite**: Zählertausch erfassen; Aufteilung nach Gradtagszahlen
  bei Nutzerwechsel ohne Zwischenablesung (mit Pflichtbegründung, § 9b Abs. 3
  HeizKV); Hinweis „Zwischenablesung veranlassen“ bei Ein- und Auszug;
  Markierung von Wechseln ohne Zwischenablesung,
- Einzel- und Gesamtabrechnung: Zählerstände bei Zählertausch je Abschnitt
  mit Summenzeile,
- Korrektur: Speichern des Vorjahresverbrauchs verwirft den Klimafaktor des
  Vorjahres nicht mehr,
- **Zwischenablesung bei Nutzerwechsel** (§ 9b Abs. 1 HeizKV): Erkennung der
  Nutzerwechsel je Wohnung im Core; Prüfhinweis
  `heating.interim_reading_missing`, wenn zum Wechsel kein Ablesestand
  erfasst ist (ADR-0009). Hinweis bei der Erfassung des Auszugs folgt,
- `docs/RELEASE-STATUS.md`: Produktionsmigration als abgeschlossen vermerkt,
- **Zählertausch** im Datenmodell: `heatMeterReading.replacements` mit
  Tauschtag, Endstand alt und Anfangsstand neu; Verbrauch = Summe der
  Abschnitte, eine Regel im Core für Prüfung, PDF und Verbrauchsseite; neue
  Warnung `heating.meter_replacement_invalid` (ADR-0008, Schema v5 additiv).
  Erfassung in der Oberfläche folgt,
- **Gradtagszahlen nach VDI 2067** im Core: Anteil eines Zeitraums in
  Promille und Aufteilung eines Verbrauchs bei Nutzerwechsel ohne
  Zwischenablesung (§ 9b Abs. 2 HeizKV); der Vergleich mit dem
  Durchschnittsnutzer rechnet mit Nutzungszeitraum die Heizwärme nach
  Gradtagen statt linear hoch (ADR-0007). Aufteilung in der Oberfläche folgt,
- **Entgelte für Verbrauchserfassung** (§ 6a Abs. 3 Nr. 1c HeizKV): neues
  Kennzeichen `CostCategory.meteringFee` hat Vorrang vor der
  Schlagworterkennung; Erkennung im Core statt im PDF; Prüfhinweis
  `heating.metering_fee_not_identified`, wenn kein Entgelt erkennbar ist;
  Übernahme ins Folgejahr (ADR-0006, Schema v5 additiv),
- **Witterungsbereinigung des Vorjahresvergleichs** (§ 6a Abs. 3 Satz 3/4
  HeizKV), Grundlage: DWD-Klimafaktor je Postleitzahl am Abrechnungsjahr
  (`BillingPeriod.climateFactor`) und am übernommenen Vorjahresverbrauch;
  Bereinigung Verbrauch × Klimafaktor für beide Perioden; Prüfhinweise zu
  Zeitraum, Postleitzahl und fehlendem Vorjahresfaktor (ADR-0005, Schema v5
  additiv). Import der DWD-Liste, Erfassung und PDF-Ausgabe folgen,
- **Vergleich mit dem normierten Durchschnittsnutzer** (§ 6a Abs. 3 Nr. 4
  HeizKV), Grundlage: Vergleichswerte (z. B. Heizspiegel für Deutschland,
  co2online) je Heizkreis mit Quelle, Kategorie, Bezugsjahr und
  Klassengrenzen; Berechnung des eigenen Verbrauchs in kWh je m² und Jahr als
  Anteil am Energieeinsatz und Einstufung („niedrig“ bis „zu hoch“); neue
  Prüfhinweise `heating.consumption_benchmark_not_comparable` und
  `heating.consumption_benchmark_year_mismatch` (ADR-0004, Schema v5 additiv
  um `HeatingCircuit.consumptionBenchmark` ergänzt). Ausgabe in der
  Einzelabrechnung und Erfassung in der Oberfläche folgen,
- **Vorjahresvergleich nach Eigentümerwechsel** (§ 6a HeizKV): Vorjahresverbrauch je Nutzungsperiode (`vorjahr_verbrauch`/`vorjahr_jahr`/`vorjahr_quelle`) wird als Grafik mit Quellenangabe dargestellt, wenn keine Vorjahresabrechnung im System liegt; bei Einzug im Abrechnungsjahr Hinweis „noch nicht genutzt“,
- Einzelabrechnung: **„Ihre Verbrauchserfassung“** zeigt die Herleitung auch bei gemessenem Verbrauch (z. B. abgeleiteter Anfangsstand, Gradtag-Aufteilung) und wird nicht mehr über einen Seitenumbruch getrennt,
- **`pnpm abrechnung`**: Import, Berechnung, Prüfung und PDF-Erzeugung ohne Browser – Grundlage für die Arbeit mit einem KI-Coding-Agenten (README, docs/KI-ANLEITUNG.md),
- **Heizkosten bei Leerstand mit Verbrauch** (§ 9b HeizKV): Verbrauchseinheiten
  eines Leerstands zählen jetzt im Heizkosten-Nenner mit. Vorher wurde bei
  einem nach Gradtagen aufgeteilten Verbrauch mehr verteilt als angefallen,
- Einzelabrechnung: Einheitspreise unter 1 € mit 6 Nachkommastellen,
  Rundungshinweis „wenige Cent“, „Heizkosten nach Fläche“ bei § 9a Abs. 2,
  übernommener Verbrauch als „+ Verbrauch …“ statt „Lieferung“, kein
  CO2-Abzugssatz bei 0 € Vermieteranteil, Verbrauch je m² bei Teilzeitraum
  aufs Jahr hochgerechnet, Gradtagszahlen- und Belegkopie-Hinweis,

- Einzelabrechnung: Der **Schätzgrund (§ 9a HeizKV)** steht nur noch einmal
  unter „Ihre Verbrauchserfassung“; oben bleibt ein kurzer Hinweis mit
  Verweis darauf (vorher erschien die Begründung doppelt),
- Einzelabrechnung bei **§ 9a Abs. 2 HeizKV** (über 25 % geschätzt):
  „Verteilung nach § 9a Abs. 2 HeizKV: 100 % nach Fläche“ statt
  „Grundkosten 100 %“, „Heizkosten nach Fläche“ statt „Grundkosten“; der
  geschätzte Verbrauch ist als „nur zur Information“ gekennzeichnet,
- **Guthaben nach Auszug**: kein Verweis mehr auf die Verrechnung mit der
  „nächsten Miete“, stattdessen Bitte um die Bankverbindung,
- Brennstoffkonto: Lieferzeilen nennen die Belegbezeichnung (z. B. vom
  Voreigentümer übernommener Verbrauch),
- **Mietkonto** (neue Seite): Soll aus Kaltmiete und Vorauszahlung je
  Monat, Ist aus zugeordneten Mieteingängen, Monatsübersicht
  (bezahlt/teilweise/offen), Rückstand und Guthaben. Eindeutige Mieteingänge
  werden nach dem CSV-Import automatisch zugeordnet (Name oder
  Mandatsreferenz), mehrdeutige von Hand. Die Abrechnung rechnet weiter mit
  den vereinbarten Vorauszahlungen; ein Rückstand erscheint als Prüfhinweis
  (ADR-0003, Schema v5 additiv um `tenancyId`/`tenancyAssignment` ergänzt),
- **Regelverzeichnis**: Rechtsregeln mit Geltungszeitraum; Warnung bei
  Kabel-TV-Kosten (§ 2 Nr. 15 BetrKV) nach dem 30.06.2024, Hinweis auf
  Fernablesbarkeit nach HeizkostenV ab dem Abrechnungsjahr 2027,
- Einzelabrechnung: **Bescheinigung nach § 35a EStG** mit dem Lohnanteil je
  Kostenart und Summe. Der Lohnanteil wurde schon erfasst, seit der Migration
  aber nicht mehr ausgewiesen (Alt-App: Hinweis `lohn35a`). Heizungs-Wartung
  wird nach dem Anteil an Grund- und Verbrauchskosten zugerechnet,
- Kosten: **„Kostenarten aus <Vorjahr> übernehmen“** legt fehlende
  Kostenarten mit Umlageschlüssel, Anteilen und Abrechnungstext an – ohne
  Beträge und Belege,
- Prüfhinweis **„Rechnung möglicherweise doppelt erfasst“** bei gleicher
  Belegnummer im Abrechnungsjahr oder gleichem Betrag am gleichen Tag in
  derselben Kostenart,
- Prüfkatalog mit **Handrechnung**: sieben Fälle (Mieterwechsel, Schaltjahr
  und Leerstand, Restcent, nicht umlagefähige Anteile, gemischte Schlüssel,
  Heizöl-FIFO mit CO₂-Aufteilung manuell und nach Stufenmodell, § 35a), von
  Hand aus der Rechtslage hergeleitet und ohne Toleranz geprüft.

## 1.3.0 – 4. Oktober 2026

- Neuer Arbeitsbereich „Verbrauch“ (zwischen „Nutzer“ und
  „Vorauszahlungen“): Zählernummer, Stand alt/neu mit Ablesedatum, Differenz,
  Verbrauchseinheiten, Kalt- und Warmwasser (m³) und Status aller Mieter eines
  Abrechnungsjahres in einer Tabelle; zeilenweise speichern oder verwerfen,
  Filter „Nur offene und abweichende Zeilen“,
- Schätzung nach § 9a HeizKV je Zeile („Schätzen“) und für alle fehlenden
  oder 0-Werte auf einmal („Alle fehlenden schätzen“); ist keine Schätzung
  möglich, nennt die Zeile den Grund (kein Gebäude, keine beheizte Fläche,
  keine gemessenen Vergleichsnutzungen),
- § 9a Abs. 2 HeizKV: Sind in einem Heizkreis mehr als 25 % der beheizten
  Fläche (zeitanteilig) geschätzt, verteilt die Berechnung dessen Heizkosten
  und CO₂-Mieteranteil ausschließlich nach Fläche; eine § 12-Kürzung entfällt
  dann. Die Einzelabrechnung begründet das; die Verbrauchsseite zeigt beim
  Klick auf „Schätzen“ einen Hinweis, sobald die Grenze überschritten wird,
- Prüfung: `heating.meter_reading_mismatch` entfällt bei einer begründeten
  Schätzung (Kennzeichen „geschätzt“ und Schätzgrund), z. B. bei defektem
  Zähler; ohne Schätzgrund bleibt die Warnung,
- Nutzerbearbeitung zeigt Heizverbrauch und Wasser nur noch an und verlinkt
  auf die neue Seite; Speichern dort lässt diese Werte unverändert,
- Prüfhinweise `heating.consumption_units_missing`,
  `heating.meter_reading_mismatch` und `heating.meter_reading_incomplete`
  sowie die geführte Jahresabrechnung führen zur betroffenen Zeile der
  Verbrauchsseite. Keine Schemaänderung.

## 1.2.3 – 4. Oktober 2026

- § 6a HeizKV: Der mittlere Verbrauch des Heizkreises wird nicht mehr als
  Vergleichswert („Durchschnitt …, kein normierter Durchschnittsnutzer“)
  ausgegeben, sondern nur als „Mittlerer Verbrauch im Heizkreis“; neue
  Prüfwarnung `heating.consumption_benchmark_missing`, solange kein Vergleich
  mit einem normierten Durchschnittsnutzer hinterlegt werden kann,
- § 6a HeizKV: Anteile der Energieträger am Energieeinsatz (kWh) in der
  Einzelabrechnung, z. B. „Flüssiggas 77 %, Strom 23 %“; Prüfwarnung, wenn
  Menge oder Heizwert fehlen,
- Vorjahresvergleich: getrennte Begründungen für fehlende
  Vorjahresabrechnung (Eigentümer- bzw. Abrechnungswechsel), fehlende Nutzung
  und fehlende Verbrauchswerte; vorhandene Vorjahreswerte als Balkengrafik,
- Strom/Wärmepumpe, Fernwärme, Erdgas: Darstellung als „Energierechnungen“
  („Rechnung vom … : Beschreibung“) statt Brennstoffkonto mit Anfangs-,
  Endbestand und FIFO; Prüfwarnungen für Rechnungen ohne kWh und für
  Rechnungen außerhalb des Abrechnungszeitraums ohne angegebenen
  Verbrauchszeitraum,
- Brennstoffrechnungen ohne Liefermenge heißen „Rechnung vom … ohne
  Liefermenge“ statt „Lieferung … 0,00 l“; Prüfwarnung ohne Beschreibung,
- Prüfung: Hinweis `costs.entry_ambiguous` bei gleich bezeichneten Belegen
  derselben Kostenart am selben Tag (mögliche Doppelposition),
- Öffnung für Dritte (nur Dokumentation und Repository-Einstellungen, keine
  Codeänderung): Lizenz AGPL-3.0, Benutzerhandbuch, Anleitung für Claude/ChatGPT
  mit Erfassungsliste und Arbeitsanweisung, Beschreibung des Bank-CSV-Formats
  mit erfundener Beispieldatei, neue `CONTRIBUTING.md` (Fork-Workflow),
  Verhaltenskodex, Issue-Vorlagen, erweiterte Pull-Request-Vorlage, Regeln für
  externe Agenten in `AGENTS.md`, aktualisierte Datenschutzhinweise.

## 1.2.2 – 4. Oktober 2026

- Einzelabrechnung: Anschriftfeld nach DIN 5008 Form B verschoben (Empfänger
  ab ca. 56 mm von oben, Rücksendeangabe darüber, Titel unterhalb des
  Fensters), damit die Anschrift in der Prüfbox von Druck- und
  Versanddiensten liegt; Test sichert die Lage ab,
- Betriebskostentabelle: Zeilen werden nicht mehr über einen Seitenumbruch
  getrennt,
- § 6a HeizKV: „Erwerberabrechnung“ o. Ä. zählt nicht mehr als Entgelt für
  Verbrauchserfassung (nur Heizkosten-/Verbrauchsabrechnung, Messdienst,
  Gerätemiete, Eichung u. Ä.).

## 1.2.1 – 4. Oktober 2026

- Zählerstände je Nutzer: An der Belegung können Zählernummer, Stand alt und
  neu mit Ablesedatum erfasst werden (optionales Feld `heatMeterReading`,
  Schema v5 bleibt gültig); der Legacy-Import übernimmt `wmz_nr`,
  `wmz_stand_alt`, `wmz_datum_alt`, `wmz_stand_neu` und `wmz_datum_neu`,
- Nutzerbearbeitung: Felder für die Zählerstände und Schaltfläche „Verbrauch
  aus Zählerständen übernehmen“ (belegt die Verbrauchseinheiten vor; erst
  „Speichern“ übernimmt sie),
- Prüfung: Warnung `heating.meter_reading_mismatch`, wenn Stand neu − Stand
  alt um mehr als 0,5 von den Verbrauchseinheiten abweicht, und Hinweis
  `heating.meter_reading_incomplete` bei Zählernummer ohne beide Stände, je
  mit Wohnung und Link zur Nutzerbearbeitung,
- Einzelabrechnung: Abschnitt „Ihre Verbrauchserfassung“ mit Zählerständen
  (bzw. Schätzgrund) und der vollständigen Rechnung von Verbrauch,
  Verbrauchs-, Grund- und Heizkosten sowie des CO₂-Anteils; die interne
  Gesamtabrechnung listet alle Zählerstände je Heizkreis,
- Betriebskosten der Heizungsanlage werden in der Heizkosten-Zusammenstellung
  als „davon“-Zeilen (Datum, Bezeichnung, Betrag) aufgeschlüsselt; die Summe
  entspricht exakt dem Betrag der Zusammenstellung,
- Warmwasser: Ohne konfigurierte Warmwasserabgrenzung enthalten die PDFs
  keinen Satz mehr zum Warmwasser,
- Rechtstexte: Rundungshinweis unter den Ergebnissen, „Liegenschafts- und
  Abrechnungsdaten“, neuer Zeitfaktor-Text, ausdrücklich benannte
  Abrechnungseinheit der Betriebskosten (Objekt bzw. Gebäude), § 6a HeizKV
  mit Steuern und Abgaben, Entgelten der Verbrauchserfassung, Hinweis auf die
  Verbraucherschlichtungsstelle, Vorjahresvergleich bzw. Begründung und
  „Durchschnitt Ihres Heizkreises“,
- Freigabe: Das Bestätigen einzelner Warnungen löst keine erneute Prüfung
  mehr aus; neue Schaltfläche „Alle angezeigten Warnungen bestätigen“; die
  Prüfung wird je Datenstand nur einmal berechnet (auch für Kopfzeile,
  Berechnung, geführte Jahresabrechnung und Nutzerübersicht),
- Vorauszahlungen: Übersicht und Anpassungsvorschläge werden nur bei
  geändertem Datenstand neu berechnet; Erläuterung, in welches
  Abrechnungsjahr die neue Vorauszahlung eingetragen wird.

## 1.2.0 – 3. Oktober 2026

- Einzel- und Gesamtabrechnung nach mietrechtlicher Prüfung überarbeitet:
  Gesamtkosten, Schlüssel, Gesamteinheiten und eigene Einheiten je Kostenart,
  Nutzungstage, Heizkosten-Zusammenstellung je Heizkreis (§ 7 Abs. 2 HeizKV)
  mit Brennstoffkonto, vollständige CO₂-Angaben (§ 7 Abs. 3 CO2KostAufG),
  Angaben nach § 6a HeizKV, Zahlungsziel mit Verwendungszweck,
  Einwendungshinweis nach § 556 Abs. 3 BGB; Gesamtabrechnung als interne
  Fassung (mit Mieter-Salden) und als Fassung für Mieter (ohne Daten anderer
  Mieter),

- **Fachliche Änderung (Vermieterentscheidung):** Der CO₂-Mieteranteil wird
  wie die Brennstoffkosten nach dem Heizkreis-Schlüssel verteilt (z. B. 30 %
  nach beheizter Fläche, 70 % nach Verbrauch) statt zu 100 % nach Verbrauch;
  bestehende Rechenstände bleiben unverändert, bis neu berechnet wird
  (siehe `docs/HEATING-CO2.md`),
- Berechnung: Umlage-Nachweis je Kostenart (brutto, nicht umlagefähig,
  umlagefähig, Betriebsstrom-Umbuchung, Schlüssel, Gesamteinheiten, Bereich,
  Leerstandsanteil) sowie je Mieter Nutzungstage, Zeitfaktor und eigene
  Bezugsgrößen; ältere Rechenstände bleiben für die PDF-Ausgabe lesbar,
- Prüfung: Warnung, wenn für einen Heizkreis mit fossilem Energieträger kein
  CO₂-Preis hinterlegt ist (ersatzweise 45 €/t),
- neuer Menüpunkt „Vorauszahlungen“ (nach „Nutzer“): Tabelle aller Mieter des
  Abrechnungsjahres mit Modus, Monatsbetrag (je Zeile bearbeitbar), Jahressoll,
  Betrag desselben Mietverhältnisses im Vorjahr, Differenz und Summenzeile;
  gesperrte Jahre sind nur lesbar,
- VZ-Anpassung nach § 560 Abs. 4 BGB: Für Mieter mit Nachzahlung, laufendem
  Mietverhältnis und monatlicher Vorauszahlung wird aus dem Kostenanteil
  (hochgerechnet auf 365 Tage, durch 12, auf volle Euro aufgerundet) ab 5 €
  Erhöhung eine neue Vorauszahlung vorgeschlagen; Hinweise bei Belegung unter
  90 Tagen und bei zu frühem Gültigkeitstermin; „Ja“ trägt den Betrag im
  Jahr ein, ab dem sie gilt; Standard ist der nächste 01.01., der frühestens am
  Ersten des übernächsten Monats nach Versand liegt (keine rückwirkende
  Erhöhung); jede Entscheidung wird im Änderungsprotokoll festgehalten,
- bei „Ja“ wird der Einzelabrechnung (Vorschau, Einzel-PDF und ZIP) ein
  Anpassungsschreiben mit Rücksendeabschnitt für den Mieter angehängt; das
  Schreiben enthält keine Unterschrift des Vermieters,
- die Abrechnungsvorschau unter „Berechnung“ öffnet die Einzelabrechnung als
  Entwurf mit Wasserzeichen und verweist bei Nachzahlungen auf die
  VZ-Anpassung.

## 1.1.4 – 3. Oktober 2026

- PDF-Download: Nach der Erzeugung erscheint oben ein fester Hinweis mit dem
  Link „Datei speichern“, falls der Browser den automatischen Download
  blockiert; Fehler werden dort ebenfalls sichtbar angezeigt,
- Einzelabrechnung: Absender ist die Eigentümergesellschaft mit Anschrift und
  Ansprechpartner; die Anrede steht im Brieftext statt im Adressfeld; bei
  Teilzeiträumen wird der eigene Nutzungszeitraum genannt; die IBAN ist in
  Vierergruppen mit Kontoinhaber angegeben,
- Gesamtabrechnung: Die Kostenliste enthält die Brennstoff- und Energiekosten
  je Heizkreis; die Summe entspricht damit den erfassten Gesamtkosten.

## 1.1.3 – 3. Oktober 2026

- unter „Berechnung“ fasst eine Übersicht Nachzahlungen und Guthaben (Anzahl
  und Summe), den Saldo aller Mieter und die Leerstandskosten des Vermieters
  zusammen; die Tabelle hat eine Summenzeile,
- die Abrechnungsvorschau bleibt nach dem Neuladen der App sichtbar; bisher
  galt der gespeicherte Rechenstand wegen anders sortierter Felder fälschlich
  als veraltet,
- die Gesamtabrechnung (PDF) enthält Summen für Nachzahlungen, Guthaben, den
  Mietersaldo und die Leerstandskosten sowie eine Ergebnis-Spalte; der Bereich
  der Kostenarten steht auf Deutsch.

## 1.1.2 – 3. Oktober 2026

- Prüfhinweise nennen unter „Betrifft:“ den konkreten Heizkreis, Zähler, Beleg
  oder die Kostenart; der Betriebsstrom-Hinweis zeigt den ungedeckten Betrag,
- nicht umlagefähige Kosten (NICHT_UML) lösen keinen Hinweis „direkt
  zugeordnet ohne Ziel“ mehr aus,
- die Importvorschau zeigt die fachliche Plausibilitätsprüfung zuerst; das
  technische Protokoll ist eingeklappt,
- im Nutzungseditor lassen sich fehlende Verbrauchseinheiten aus dem mittleren
  Verbrauch je m² gemessener Nutzungen desselben Heizkreises schätzen (§ 9a
  HeizKV); Wert, Kennzeichen „geschätzt“ und Schätzgrund werden nur
  vorbelegt und erst mit „Speichern“ übernommen.

## 1.1.1 – 3. Oktober 2026

- nach einem Auszug ohne bekannte neue Anschrift bleibt die bisherige
  Wohnungs- bzw. Objektanschrift bestehen; statt eines Freigabefehlers erscheint
  ein Hinweis mit Link zur Nutzerbearbeitung,
- Flüssiggas- und Propanbestände werden beim Legacy-Import in Litern statt
  Kubikmetern übernommen,
- Lieferungen ohne Brennstoffmenge (Restzahlung, Tankmiete, Wartung) gelten in
  der Brennstoffübersicht als Kosten und nicht mehr als fehlende Angabe,
- die Importvorschau fasst Prüfbefunde mit Schweregrad, Titel und Anzahl
  zusammen statt roher Codes,
- der Startbildschirm nennt die aktuelle Schema-Version.

## 1.1.0 – 3. Oktober 2026

- Schema-Version 5 mit bestätigter, gesicherter Umstellung von Version 4,
- Belegungen je Wohnung mit Leerständen und Nutzerwechseln,
- geführte Jahresabrechnung in acht Schritten mit Prüfhinweisen je Schritt,
- optionaler Wohnungswärme-Messverbrauch (kWh) aus Grenzablesungen mit
  Messnachweis im PDF; Fehler führen direkt zur Korrekturstelle,
- Legacy-Import ordnet Wohnungen auch bei abweichender Schreibweise des
  Hausschlüssels eindeutig dem Gebäude zu und meldet nicht zuordenbare Wohnungen,
- neue Prüfungen für Wohnungen ohne Gebäude, Heizkreise mit Heizkosten ohne
  Nutzungen und Mieter ohne Verbrauchseinheiten,
- Bewohner ohne erfasste Versandanschrift erhalten automatisch die Wohnungs-
  bzw. Objektanschrift; nach Auszug bleibt eine eigene Anschrift Pflicht,
- ausschließlich Desktop-Nutzung (ADR-0002),
- GitHub-Actions aktualisiert (checkout 7.0.1, deploy-pages 5.0.0,
  upload-artifact 7.0.1),
- migrierte Kostenarten mit Umlageschlüssel, Positionszahl und Gesamtbetrag
  sichtbar,
- Kostenpositionen mit Datum, Beschreibung, Belegreferenz und Betrag sichtbar,
- Bankbuchungen des aktiven Objekts/Jahres einschließlich offener Zuordnungen
  sichtbar,
- Pagination für lange produktive Listen,
- indirekte Build-Abhängigkeit `nanoid` auf die gepatchte Version 3.3.17
  festgesetzt.

## 1.0.0 – 7. August 2026

- kontrollierte Legacy-v3-zu-v4-Migration ohne stillen Feldverlust,
- deterministische Nebenkosten-, Heizkosten- und CO₂-Berechnung in Cent,
- lokale Persistenz, Snapshots, Backup und atomare Wiederherstellung,
- Prüf- und Freigabeablauf mit unveränderlichen Berechnungssnapshots,
- Einzelabrechnungen, Gesamtabrechnung, PDF- und ZIP-Export,
- produktiver lokaler Migrations- und Vergleichsablauf ohne Daten im Git,
- reproduzierbarer, datenschutzgeprüfter statischer Release-Build,
- vorbereiteter manueller GitHub-Pages-Workflow.

Bekannte Grenzen: keine Cloud, keine Anmeldung, kein Mehrbenutzerbetrieb, keine
serverseitige Speicherung und keine automatische rechtliche Freigabe.
