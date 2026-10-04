# Prüfkatalog mit Handrechnung

Jeder Fall ist ein kleiner, frei erfundener Datenbestand (`cases.json`) mit
einem **von Hand hergeleiteten** Ergebnis in ganzen Cent. Anders als die
Legacy-Goldens (`../goldens.json`), die aus der Alt-App berechnet wurden,
prüft dieser Katalog die Engine unabhängig gegen die Rechtslage.

`hand-calculated.test.ts` rechnet jeden Fall und vergleicht **ohne Toleranz**:
Anteil, Vorauszahlung und Saldo je Nutzer, Summen, Leerstandsanteil und – bei
Heizfällen – die CO₂-Aufteilung. Die Kontrolldifferenz muss 0 sein.

**Eine Abweichung ist nie ein Testproblem.** Entweder rechnet die Engine
falsch, oder die Herleitung stimmt nicht. Eine geänderte Erwartung braucht
eine fachliche Begründung in diesem Dokument.

Idee und Aufbau sind angelehnt an den Prüfkatalog von
[Mietfuchs](https://github.com/speedone/mietfuchs) (MIT-Lizenz); Fälle,
Zahlen und Herleitungen sind eigenständig für diese Engine erstellt.

## Allgemeine Regeln der Herleitung

- **Zeitanteil:** belegte Tage ÷ Tage des Abrechnungszeitraums, beide
  inklusive Anfangs- und Endtag (2024: 366 Tage, 2025: 365 Tage).
- **Verteilbasis Fläche/Wohneinheiten:** Summe aus Fläche × Zeitanteil über
  alle Nutzungszeiträume einschließlich Leerstand. Der Leerstandsanteil trägt
  der Vermieter.
- **Verbrauchseinheiten:** Summe der erfassten Einheiten der Mieter (ohne
  Zeitanteil, Leerstand zählt nicht).
- **Vorauszahlung (monatlich):** Monatsbetrag × belegte Monatsanteile.
- **Rundung:** Zwischenwerte ungerundet; je Nutzer erst am Ende nach dem
  Größter-Rest-Verfahren auf Cent (`docs/ROUNDING.md` Abschnitt 5):
  abrunden, fehlende Cent nach größtem Rest, bei Gleichstand nach Nutzer-ID
  aufsteigend. Mieter und Leerstand werden getrennt ausgeglichen.

## H01-mieterwechsel-stichtag

2025 (365 Tage). Wohnung u1 60 m²: t1 01.01.–30.06. (181 Tage), t2
01.07.–31.12. (184 Tage). Wohnung u2 40 m²: t3 ganzjährig. Grundsteuer
1.000,00 € nach Fläche (§ 2 Nr. 1 BetrKV, § 556a Abs. 1 BGB).

- Basis = 60 × 181/365 + 60 × 184/365 + 40 = 100 m² → 10,00 €/m².
- t1 = 600 € × 181/365 = 297,5342… €; t2 = 600 € × 184/365 = 302,4657… €;
  t3 = 400,00 €. Kein Tag doppelt oder fehlend: 181 + 184 = 365.
- Restcent: abgerundet 297,53 + 302,46 + 400,00 = 999,99 €; Ziel 1.000,00 €.
  Größter Rest t2 (0,58 Cent) → t2 = 302,47 €.
- Vorauszahlungen 6 × 50 € = 300 € (t1, t2), 12 × 40 € = 480 € (t3).
- Saldo: t1 −2,47 €, t2 +2,47 €, t3 −80,00 €.

## H02-schaltjahr-leerstand

2024 (Schaltjahr, 366 Tage). Zwei Wohnungen je 50 m². u1: t1 ganzjährig.
u2: Leerstand 01.01.–31.03. (31 + 29 + 31 = 91 Tage), t2 ab 01.04.
(275 Tage). Gebäudeversicherung 732,00 € nach Fläche (§ 2 Nr. 13 BetrKV).

- Basis = 50 + 50 × 91/366 + 50 × 275/366 = 100 m² → 7,32 €/m².
- t1 = 366,00 €; Leerstand = 366 € × 91/366 = 91,00 € (Vermieter);
  t2 = 366 € × 275/366 = 275,00 €.
- Vorauszahlungen 12 × 30 € = 360 € (t1), 9 × 30 € = 270 € (t2).
- Mieter gesamt 641,00 €, Vermieter (Leerstand) 91,00 €.

## H03-restcent-gleichstand

2025, drei gleiche Wohnungen ganzjährig, Müllbeseitigung 100,00 € nach
Wohneinheiten (§ 2 Nr. 8 BetrKV).

- Je Einheit 33,333… €. Abgerundet 3 × 33,33 € = 99,99 €; Ziel 100,00 €.
- Gleichstand der Reste → Nutzer-ID aufsteigend: t1 = 33,34 €,
  t2 = t3 = 33,33 €. Summe exakt 100,00 €.

## H04-nicht-umlagefaehig

2025, u1 70 m² (t1), u2 30 m² (t2), ganzjährig.

- Hauswart 1.200,00 € (§ 2 Nr. 14 BetrKV) mit 25 % Reparatur-/
  Verwaltungsanteil, der nicht umlagefähig ist: umlagefähig 75 % = 900,00 €,
  Vermieter 300,00 €.
- Verwaltungskosten 600,00 € sind keine Betriebskosten (§ 1 Abs. 2 Nr. 1
  BetrKV): nicht verteilt, nicht in den erfassten umlagefähigen Kosten,
  ausgewiesen als interne Kosten 600,00 €.
- t1 = 900 € × 70/100 = 630,00 €; t2 = 270,00 €.
- Vorauszahlungen 12 × 60 € = 720 € und 12 × 25 € = 300 €.
- Erfasste Kosten 1.200,00 € = Mieter 900,00 € + Vermieter 300,00 €.

## H05-gemischte-schluessel

2025, drei Wohnungen. u1: t1 ganzjährig, 50 Einheiten. u2: t2
01.01.–31.03. (90 Tage, 10 Einheiten), t3 ab 01.04. (275 Tage,
30 Einheiten). u3: t4 ganzjährig, 70 Einheiten.

- Müllbeseitigung 360,00 € nach Wohneinheiten: Basis 1 + 90/365 + 275/365
  - 1 = 3 → 120,00 € je Einheit und Jahr. t1 = t4 = 120,00 €;
    t2 = 120 € × 90/365 = 29,5890… €; t3 = 120 € × 275/365 = 90,4109… €.
- Wasser 800,00 € nach Verbrauchseinheiten (§ 556a Abs. 1 Satz 2 BGB):
  Summe 160 Einheiten → 5,00 €/Einheit. t1 250 €, t2 50 €, t3 150 €,
  t4 350 €.
- Summen: t1 370,00 €; t2 79,5890… €; t3 240,4109… €; t4 470,00 €.
  Abgerundet 1.159,99 €, Ziel 1.160,00 €; größter Rest t2 → 79,59 €,
  t3 → 240,41 €.

## H06-heizung-fifo-co2-manuell

2025, ein Heizkreis, Heizöl. Anfangsbestand 1.000 l zu 1.000,00 €,
Lieferung 01.03. 2.000 l zu 2.400,00 €, Endbestand 500 l. Wartung
200,00 € (§ 2 Nr. 4a BetrKV). u1 80 m² mit 600 Verbrauchseinheiten (t1),
u2 40 m² mit 200 Einheiten (t2). Verteilung 30 % Fläche / 70 % Verbrauch
(§ 7 Abs. 1 HeizkostenV).

- **FIFO:** Verbraucht 1.000 + 2.000 − 500 = 2.500 l. Zuerst der Altbestand
  (1.000 l × 1,00 € = 1.000 €), dann 1.500 l aus der Lieferung
  (× 1,20 € = 1.800 €) → Brennstoffkosten 2.800,00 €. Der Endbestand ist
  mit dem jüngsten Preis bewertet (500 l × 1,20 € = 600 €).
- **CO₂ manuell:** Die Brennstoffrechnung enthält 300,00 € CO₂-Abgabe;
  Vermieteranteil 40 % (vorgegeben) → Vermieter 120,00 €, Mieter 180,00 €.
- **Heiztopf:** 2.800 € − 300 € CO₂ + 200 € Wartung = 2.700,00 €.
  Grundkosten 30 % = 810 € ÷ 120 m² = 6,75 €/m²; Verbrauchskosten 70 % =
  1.890 € ÷ 800 Einheiten = 2,3625 €/Einheit.
- **CO₂-Mieteranteil** nach demselben Schlüssel: 54 € ÷ 120 m² = 0,45 €/m²;
  126 € ÷ 800 = 0,1575 €/Einheit.
- t1 = 540 + 1.417,50 + 36 + 94,50 = 2.088,00 €;
  t2 = 270 + 472,50 + 18 + 31,50 = 792,00 €.
- Erfasst 3.000,00 € = Mieter 2.880,00 € + Vermieter 120,00 €.

## H07-heizung-co2-stufenmodell

Wie H06, aber CO₂-Kosten automatisch nach CO2KostAufG.

- Energie: 2.500 l × 10 kWh/l = 25.000 kWh; Emissionen
  25.000 kWh × 0,266 kg/kWh = 6.650 kg.
- CO₂-Preis 2025: 55 €/t (§ 10 Abs. 2 BEHG) → 6,65 t × 55 € = 365,75 €.
- Kennwert: 6.650 kg ÷ 120 m² = 55,42 kg CO₂/m²a ≥ 52 → Stufe 10:
  Mieter 5 %, Vermieter 95 % (Anlage zu § 5 CO2KostAufG).
  Mieter 18,2875 €, Vermieter 347,4625 €. Auf Cent nach größtem Rest:
  Mieter 18,29 €, Vermieter 347,46 €.
- Heiztopf: 2.800 € − 365,75 € + 200 € = 2.634,25 €. Grundkosten 790,275 €
  ÷ 120 = 6,585625 €/m²; Verbrauch 1.843,975 € ÷ 800 = 2,30496875 €/Einheit.
- CO₂-Mieteranteil: Fläche 5,48625 € ÷ 120; Verbrauch 12,80125 € ÷ 800.
- t1 = 526,85 + 1.382,98125 + 3,6575 + 9,6009375 = 1.923,0896875 €;
  t2 = 263,425 + 460,99375 + 1,82875 + 3,2003125 = 729,4478125 €.
- Restcent: abgerundet 1.923,08 + 729,44 = 2.652,52 €; Ziel
  2.652,54 € (2.652,5375 € gerundet) → beide +1 Cent: t1 1.923,09 €,
  t2 729,45 €.
- Vermieter 347,46 €; Kontrolle 3.000,00 € = 2.652,54 € + 347,46 €.
