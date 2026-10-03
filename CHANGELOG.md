# Changelog

Alle wesentlichen Änderungen dieses Projekts werden hier dokumentiert.

## Unveröffentlicht

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
