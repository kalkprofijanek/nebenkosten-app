# TODO: Bauliste bis zur vollständig gesetzeskonformen Abrechnung

Stand: Oktober 2026. Sammelt alles, was für eine rechtssichere Heiz- und
Betriebskostenabrechnung noch fehlt – aus dem Abgleich mit § 6a HeizKV
([`TODO-HEIZKV-6A.md`](TODO-HEIZKV-6A.md)), einer externen KI-Prüfung echter
Abrechnungen und den Erfahrungen aus der Praxisabrechnung 2025
(Eigentümerwechsel, 65 Mietparteien, vier Heizkreise).

Legende: **P1** vor dem nächsten Versand, **P2** nächste Abrechnung,
**P3** Komfort/Qualität.

## P1 – Kürzungsrisiken (§ 12 Abs. 1 HeizKV: je 3 %)

- [ ] **Witterungsbereinigter Vorjahresvergleich** (§ 6a Abs. 3 Nr. 5):
      Klimafaktoren des DWD je PLZ und Zeitraum (Bundesanzeiger-Vereinfachung)
      je Abrechnungsjahr hinterlegen; Grafik zeigt bereinigte Werte mit Faktor
      und Quelle. Details: `TODO-HEIZKV-6A.md`.
- [ ] **Vergleich mit normiertem Durchschnittsnutzer** (§ 6a Abs. 3 Nr. 4):
      Referenzwert je Nutzerkategorie (kWh/m²·a, Quelle) je Heizkreis; Ausgabe
      in der Einzelabrechnung.
- [ ] **Warmwasser im Energieverbrauch** (§ 6a Abs. 3 S. 2) bei zentraler
      Warmwasserbereitung mitführen.
- [ ] **Fernablesbarkeit** (§ 5 Abs. 2/3): Merkmal je Zähler (fernablesbar,
      Einbaudatum); Prüfhinweis, wenn nach dem 01.12.2021 eingebaut und nicht
      fernablesbar bzw. ab 2027 generell.
- [ ] **Steuern/Abgaben und Messdienstentgelte als Beträge** (§ 6a Abs. 3
      Nr. 1b/1c) statt Pauschaltext bzw. Schlagwortsuche.
- [ ] Bezeichnung der Verbraucherschlichtungsstelle prüfen
      („Universalschlichtungsstelle des Bundes“).

## P1 – Nachvollziehbarkeit der Abrechnung (externe Prüfung)

- [x] CO₂-Einstufung mit dem auf **eine Nachkommastelle gerundeten** Ausstoß
      je m² (CO2KostAufG); ausgewiesen wird weiter der genaue Wert.
- [ ] **CO₂-Prüfblatt je Heizkreis** als geschlossene Rechenfolge:
      Brennstoff → CO₂-Menge → Preis (Herleitung, z. B. BEHG-Festpreis 2025
      55 €/t zzgl. USt) → CO₂-Kosten → kg/m²·a (gerundet) → Stufe →
      Mieter-/Vermieteranteil → **wo der Vermieteranteil abgezogen wird**.
      Bei Mischsystemen (Wärmepumpe + Gas) CO₂-relevante und nicht relevante
      Energieträger getrennt zeigen.
- [ ] **Liste der geschätzten Wohnungen** je Heizkreis in der internen
      Gesamtabrechnung (Wohnung, Fläche, Schätzwert, Grund) mit Herleitung der
      25-%-Grenze (§ 9a Abs. 2) – in Arbeit.
- [ ] **Schätzdokumentation** (§ 9a Abs. 1): Ausfallgrund, Feststellungsdatum,
      Begründung der Vergleichswohnungen; Hinweis, wenn Vergleichswerte selbst
      geschätzt sind.
- [ ] **Gradtagszahlen-Aufteilung** bei Nutzerwechsel (§ 9b) in der App
      berechnen und die Promilletabelle (VDI 2067) mit Anteil je Zeitraum
      ausweisen (bisher nur über Daten/KI-Ablauf).
- [ ] **Rundungsdifferenzen** einheitlich erklären (Restcent-Verteilung) –
      Berechnung bleibt ungerundet, nur die Anzeige rundet.
- [ ] **Abrechnungsvorlage**: zu jeder Position Formel, Einheitenbasis und
      Nutzungszeitraum; bei Schätzungen und Sonderverteilungen Rechtsgrundlage,
      betroffene Fläche und Datenquelle direkt daneben.

## P2 – Prozesse und Datenmodell

- [ ] **Zähler- und Störungsmanagement**: je Heizkreis Liste mit Zählernummer,
      Ablesedatum, Messwert, Ausfallgrund, Reparatur/Tausch, Ersatzwert.
- [ ] **Zählertausch im Datenmodell**: mehrere Zähler je Nutzung mit Aus- und
      Einbaustand und Datum statt Schätzung.
- [ ] **Wasserzählerplan**: Status je Wohnung (vorhanden, geeicht bis,
      funktionsfähig); Begründung eines Flächenschlüssels aus dem tatsächlichen
      Bestand ableiten; Prüfhinweis bei Schlüsselwechsel gegenüber Vorjahr
      (§ 556a BGB).
- [ ] **Eigentümerwechsel-Prozess**: Übergabeprotokoll (Wärme, Wasser, Strom,
      Tank-/Lagerbestände zum Stichtag), Zwischenablesung, Abgleich mit der
      Erwerberabrechnung; Vorjahreswerte des Voreigentümers übernehmen.
- [ ] **Brennstoffbestände**: Prüfregel „Anfangsbestand = Endbestand des
      Vorjahres“ (Menge und Wert), Beleg für Tankstand verlangen.
- [ ] **Überlappende Leistungszeiträume** derselben Kostenart erkennen (z. B.
      doppelte Versicherung bei Versichererwechsel).
- [ ] **Vorauszahlungsanpassung über Daten** (§ 560 BGB) setzen und als
      eigenes Schreiben ausgeben – in Arbeit.
- [ ] Vorjahreswerte (`previousConsumption`) in der Oberfläche pflegen.

## P3 – Erweiterungen

- [ ] Unterjährige/monatliche Verbrauchsinformation bei Fernablesung
      (§ 6a Abs. 1/2): Import von Messdienst-/wM-Bus-Exporten, Infoblatt.
- [ ] Fernwärme: Treibhausgasemissionen und Primärenergiefaktor (§ 6a Abs. 3
      Nr. 1a).
- [ ] Einheit **kWh** statt „Einheiten“ für Wärmemengenzähler.
- [ ] Erfassungsliste der KI direkt importieren (CSV → Kostenpositionen).
- [ ] Versand mit Nachweis (Serien-E-Mail, Zustelldatum je Mietpartei),
      Mehrbenutzer-/Mandantenbetrieb.

## Empfohlene Reihenfolge

1. Witterungsbereinigung + Durchschnittsnutzer (schließt das 3-%-Risiko aus
   § 6a für die laufende Abrechnung).
2. CO₂-Prüfblatt, Liste geschätzter Wohnungen, Schätzdokumentation
   (Nachvollziehbarkeit bei Belegeinsicht).
3. Fernablesbarkeit je Zähler + Zählertausch-Modell (Grundlage für 2026/27).
4. Eigentümerwechsel- und Bestandsprüfungen, überlappende Zeiträume.
5. P3 nach Bedarf.
