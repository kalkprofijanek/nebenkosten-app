# ADR-0010: Warmwasser, verbundene Anlage und Nutzerwechsel gesetzeskonform

- Status: angenommen (Schema-Vertrag); Umsetzung in Core, Prüfung, PDF und
  Oberfläche in diesem Arbeitspaket
- Datum: 2026-10-10
- Entscheidungen des Nutzers (10. Oktober 2026): „alles gesetzeskonform“;
  im Objekt gibt es **keine Warmwasserzähler** (Nachrüstung möglich)
- Anlass: Prüfung einer fiktiven Musterabrechnung durch acht Prüf-Agenten
  aus Mietersicht (Befunde G1–G4, A12)

## Rechtslage (Wortlaut geprüft am 10.10.2026, gesetze-im-internet.de)

- § 7 Abs. 2 HeizKV: Kosten des Betriebs der Heizungsanlage umfassen Brennstoff,
  Betriebsstrom, Wartung, Messung, Verbrauchserfassung und Abrechnung.
- § 8 Abs. 1: Warmwasserkosten 50–70 % nach erfasstem Warmwasserverbrauch,
  Rest nach Wohn- oder Nutzfläche.
- § 9 Abs. 1: Bei verbundenen Anlagen sind die **einheitlich entstandenen
  Kosten des Betriebs** (also auch Betriebsstrom, Wartung u. a.) nach den
  Anteilen am Brennstoff- bzw. Energieverbrauch aufzuteilen.
- § 9 Abs. 2: Wärmemenge Q mit Wärmezähler messen; bei unzumutbarem Aufwand
  Q = 2,5 × V × (tw − 10) mit gemessenem Volumen V; wenn weder Q noch V
  messbar: Q = 32 × A_Wohn. Erdgas brennwertbezogen × 1,11.
- § 9 Abs. 3: B = Q / Hᵢ; Anteil am Brennstoffverbrauch.
- § 9b Abs. 1–3: Zwischenablesung Pflicht; ohne sie werden die **gesamten**
  Kosten nach Gradtagszahlen oder zeitanteilig aufgeteilt, Warmwasser
  zeitanteilig.
- § 7 Abs. 1 CO2KostAufG: Mieteranteil der CO₂-Kosten nach den Schlüsseln der
  §§ 6–10 HeizKV (also Heizung und Warmwasser getrennt).

## Entscheidung (Vertrag)

1. **`HeatingCircuit.hotWaterEnergy`** (§ 9 Abs. 2): `heat_meter` (Q in kWh),
   `volume_formula` (V, tw), `area_formula` (A_Wohn, Pflichtbegründung).
   Anteil Warmwasser s = Q ÷ Energieeinsatz des Heizkreises in kWh (≙ B ÷
   Brennstoffverbrauch, § 9 Abs. 3), höchstens 1.
2. **Neues Verfahren bei gesetztem `hotWaterEnergy`** (§ 9 Abs. 1): s gilt für
   Brennstoffkosten **und** Betriebsstrom **und** Heizungs-Betriebskosten.
   Der CO₂-Mieteranteil wird ebenfalls mit s in Heizung und Warmwasser
   getrennt und nach dem jeweiligen Schlüssel verteilt.
3. **`HeatingCircuit.hotWaterAllocation`** (§ 8 Abs. 1): `consumption`
   (50–70 % nach `OccupancyPeriod.warmWater` m³, Rest nach Fläche wie der
   Grundkostenschlüssel, zeitanteilig), `area` (100 % Fläche, Ersatz ohne
   Zähler), `persons` (bisher).
4. **`OccupancyPeriod.section9bAllocation`** (§ 9b Abs. 3): `degree_days` oder
   `time`. Für diese Nutzung werden auch die Grundkosten (Heizung, CO₂-Grund)
   mit dem Gradtags- bzw. Zeitanteil statt nur nach Tagen verteilt;
   Warmwasser bleibt zeitanteilig.
5. **`FuelStock.openingCo2PricePerTonCents`**: CO₂-Preis des Lieferjahres für
   den Anfangsbestand; die CO₂-Kosten ergeben sich je FIFO-Los aus seinem
   Preis.
6. **Bestandsschutz:** Ohne die neuen Felder rechnet der Kern wie bisher
   (Vergleichstests gegen die Alt-App bleiben unverändert). Die Prüfung
   meldet die nicht verordnungskonformen Altverfahren (Pauschalanteil,
   Personenschlüssel, gemischter Maßstab ohne Zwischenablesung).

## Offene Entscheidungen

- Ohne Warmwasserzähler ist keine Verteilung verbrauchsabhängig; die
  Flächenverteilung (`area`) ist der Ersatz mit dem geringsten Abstand zur
  Verordnung. Das Kürzungsrecht nach § 12 Abs. 1 HeizKV (15 %) bleibt; ob der
  Vermieter es von sich aus berücksichtigt, entscheidet er.
- Rechtsauffassungen der Prüf-Agenten sind keine Rechtsberatung.

## Migrationsauswirkungen

Additive, optionale Felder; Schema v5 bleibt; keine Migration.
