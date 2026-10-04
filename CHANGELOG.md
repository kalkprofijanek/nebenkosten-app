# Changelog

Alle wesentlichen Änderungen dieses Projekts werden hier dokumentiert.

## Unveröffentlicht

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
