# ADR-0010: Warmwasser, verbundene Anlage und Nutzerwechsel gesetzeskonform

- Status: angenommen und umgesetzt (Core, Prüfung, PDF, Oberfläche)
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

## Wärmepumpen (Ergänzung 12.10.2026)

**Problem.** s = Q ÷ Energieeinsatz in kWh setzt bei elektrischen
Wärmepumpen die Wärmemenge Q ins Verhältnis zum **Strom**. Aus einer kWh
Strom entstehen etwa so viele kWh Wärme, wie die Jahresarbeitszahl angibt.
Beispiel (fiktiv): Q = 32 kWh/m² × 400 m² = 12.800 kWh, Strom 21.500 kWh →
s = 59,5 %; bezogen auf die erzeugte Wärme (Jahresarbeitszahl 3,2 → 68.800
kWh) s = 18,6 %. Beim Hybrid (Wärmepumpe + Erdgas) ist der
Wärmepumpenanteil am Nenner entsprechend unterbewertet.

**Rechtslage.** § 9 Abs. 3 HeizKV (B = Q ÷ Hᵢ) ist für Brennstoffe
formuliert. Für elektrisch angetriebene Wärmepumpen enthält die HeizKV keine
Regel zur Aufteilung bei verbundenen Anlagen.

**Entscheidung (offene Entscheidung, sachgerechte Auslegung).** Q wird ins
Verhältnis zur **erzeugten Wärme** gesetzt:

1. `HeatingCircuit.generatedHeatKwh` (optional, > 0): gemessene, vom
   Erzeuger abgegebene Wärmemenge (Wärmemengenzähler) → s = Q ÷
   `generatedHeatKwh`.
2. Sonst `EnergySource.seasonalPerformanceFactor` (optional, 1–8,
   Jahresarbeitszahl) je Wärmepumpenquelle → Nenner = Σ kWh je Quelle ×
   Jahresarbeitszahl (Wärmepumpenstrom) bzw. × 1 (Brennstoffe, Fernwärme).
3. Wärmepumpenquelle ohne beides → bisheriges Verhalten (Strom-kWh), Trace
   `heatPumpWithoutHeatOutput`, Prüffehler
   `heating_compliance.heat_pump_heat_output_missing`.
4. **Entscheidung des Nutzers (12.10.2026):** An den Wärmepumpen gibt es
   weder Wärmemengenzähler noch eine bekannte Jahresarbeitszahl, nur
   Strom-kWh. Die Jahresarbeitszahl kann deshalb als **Schätzwert** erfasst
   werden: `EnergySource.seasonalPerformanceFactorEstimated` (Kennzeichen)
   und `EnergySource.seasonalPerformanceFactorReason` (Pflichtbegründung,
   z. B. Herstellerangabe, Planungswert). Das PDF weist sie als Schätzung
   mit Grundlage aus; die Prüfung warnt
   (`heating_compliance.heat_pump_seasonal_performance_factor_estimated`)
   und meldet einen Fehler bei fehlender Begründung
   (`heating_compliance.heat_pump_seasonal_performance_factor_reason_missing`).
   Eine nicht als geschätzt gekennzeichnete Jahresarbeitszahl ohne
   Wärmemessung erzeugt den Hinweis
   `heating_compliance.heat_pump_seasonal_performance_factor_estimate`.
   Der Kern setzt **keine Standard-Jahresarbeitszahl** an (offene
   Entscheidung, welcher Wert sachgerecht wäre).

Wärmepumpen werden erkannt an einer gesetzten Jahresarbeitszahl,
„Wärmepumpe“/Schlüssel `wp…` an der Energiequelle oder Strom als
Energieträger in einem Gebäude mit Energieträger „WP …“/„Hybrid …“
(`isHeatPumpEnergySource`). Der Trace weist Nenner-Methode, Nenner und
erzeugte Wärme je Quelle aus; das PDF zeigt den Rechenweg, z. B. „Anteil an
der erzeugten Wärme: 12.800 kWh ÷ (21.500 kWh Strom × Jahresarbeitszahl 3,2
= 68.800 kWh) = 18,60 %“.

Der § 6a-Block bleibt unverändert: Er verteilt den Energieeinsatz des
Gebäudes (bei Wärmepumpen Strom-kWh) mit dem dimensionslosen Anteil s auf
Heizung und Warmwasser; die Energieträger-Anteile bleiben Anteile am
Energieeinsatz (§ 6a Abs. 3 Nr. 2 HeizKV). Das ist mit dem neuen Nenner
konsistent.

Offen: ob der Vermieter bei Wärmepumpen statt der Jahresarbeitszahl eine
andere Schätzung (z. B. Herstellerangabe, Wärmepumpen-Effizienzmessung)
ansetzen darf; ob Strom für eine Direktheizung im Hybridgebäude von der
Freitext-Erkennung als Wärmepumpe erfasst wird (dann Jahresarbeitszahl 1
eintragen); die Jahresarbeitszahl gilt für Heizung und Warmwasser
einheitlich.

## Offene Entscheidungen

- Ohne Warmwasserzähler ist keine Verteilung verbrauchsabhängig; die
  Flächenverteilung (`area`) ist der Ersatz mit dem geringsten Abstand zur
  Verordnung. Das Kürzungsrecht nach § 12 Abs. 1 HeizKV (15 %) bleibt; ob der
  Vermieter es von sich aus berücksichtigt, entscheidet er.
- Ersatzfläche der Flächenformel: Wohnfläche der versorgten Einheiten
  (`usableAreaSqm`); ob die beheizte Fläche maßgeblich ist, ist offen.
- 32 kWh/m² werden bei Abrechnungszeiträumen ungleich einem Jahr nicht
  anteilig umgerechnet.
- § 9b Abs. 3 mit Warmwasser nach Verbrauch: m³-Werte werden nicht
  automatisch aufgeteilt (derzeit keine Warmwasserzähler im Objekt).
- Rechtsauffassungen der Prüf-Agenten sind keine Rechtsberatung.

## Migrationsauswirkungen

Additive, optionale Felder; Schema v5 bleibt; keine Migration. Das gilt
auch für `HeatingCircuit.generatedHeatKwh` und
`EnergySource.seasonalPerformanceFactor` (Wärmepumpen).
