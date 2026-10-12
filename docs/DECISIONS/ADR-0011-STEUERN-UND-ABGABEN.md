# ADR-0011: Steuern und Abgaben in den Energiekosten (§ 6a Abs. 3 Nr. 1 b HeizKV)

- Status: angenommen (Schema, Rechenvertrag, PDF, Oberfläche, Prüfung)
- Datum: 2026-10-12
- Entscheidung des Nutzers: Die Beträge werden aus den Brennstoff- und
  Energierechnungen ausgelesen und an der Lieferung erfasst.

## Kontext

§ 6a Abs. 3 Satz 1 Nr. 1 b HeizKV verlangt in der Abrechnung Angaben zu den
„erhobenen Steuern und Abgaben“ in den Brennstoff- und Energiekosten. Die
Einzelabrechnung enthielt bisher nur den pauschalen Satz „… enthalten
(Umsatzsteuer, Energiesteuer, ggf. CO2-Kosten nach BEHG)“. Ob ein solcher
pauschaler Hinweis genügt oder ob das Kürzungsrecht von 3 % nach § 12 Abs. 1
Satz 3 HeizKV greift, ist streitig.

## Entscheidung

1. **Schnittstelle (additiv, Schema v5, keine Migration):**
   `FuelDelivery.taxesAndLevies` (`fuelDeliveryTaxesAndLeviesSchema`,
   optional) mit `vatCents`, `vatRatePercent`, `energyTaxCents`,
   `co2LevyCents`, `otherLeviesCents`, `otherLeviesLabel`. Alle Beträge in
   Cent, nicht negativ, und Bestandteile des Rechnungsbetrags
   `amountCents` (brutto einschließlich Umsatzsteuer, wie bisher erfasst).
   Leer = nicht erfasst. Der Anfangsbestand (`FuelStock`) erhält keine
   Angaben.
2. **Rechenvertrag** (`packages/core/src/heating/taxes-and-levies.ts`):
   - `circuitTaxesAndLevies(circuitTrace, fuelDeliveries)`: Je Los wird der
     FIFO-verbrauchte Anteil (wie `fuel.ts`, Restbestand aus den jüngsten
     Losen; Lose ohne Menge und das Verfahren ohne Mengen gelten als voll
     verbraucht) der erfassten Beträge angesetzt. Lose ohne Angaben zählen
     mit ihrem verbrauchten Wert als `notStatedValueCents`. Ohne Angaben an
     einer verbrauchten Lieferung ist das Ergebnis `null`.
   - CO₂-Kosten (BEHG): Tragen alle verbrauchten Lose einen
     Rechnungsbetrag, gilt dessen Summe (`co2LevySource: 'invoice'`), sonst
     die berechneten CO₂-Kosten des Heizkreises (`'calculated'`).
   - `tenantTaxesAndLevies(...)`: Anteil des Mieters an Umsatzsteuer,
     Energiesteuer und sonstigen Abgaben im Verhältnis seiner Heiz- und
     Warmwasserkosten zu denen des Heizkreises; CO₂-Kosten nach seinem
     tatsächlichen CO₂-Kostenanteil (CO2KostAufG).
   - Die Abrechnungsbeträge ändern sich nicht; die Angaben sind rein
     informativ.
3. **PDF:** Im § 6a-Block steht die Tabelle „In den Energiekosten
   enthaltene Steuern und Abgaben (§ 6a Abs. 3 Nr. 1 b HeizKV)“ mit
   „Gebäude gesamt“ und „Ihr Anteil“ je Art. Ohne Angaben bleibt der
   Hinweistext, jedoch ohne „ggf.“ und mit dem konkreten CO₂-Betrag des
   Heizkreises (bzw. „nicht angefallen“).
4. **Oberfläche:** Felder an der Brennstofflieferung mit der Hilfe
   „Umsatzsteuer aus Bruttobetrag berechnen“ (brutto × Satz ÷ (100 + Satz),
   Satz 19 % oder 7 %).
5. **Prüfung:** `heating.taxes_and_levies_missing` (Hinweis, `info`) je
   Heizkreis, wenn Rechnungen mit Betrag im Zeitraum keine Angaben tragen.

## Offene Entscheidungen

- **Schlüssel des Mieteranteils:** Die HeizKV nennt keinen. Gewählt ist der
  Anteil an den Heiz- und Warmwasserkosten (einschließlich Betriebsstrom und
  Heizungs-Betriebskosten, die keine Brennstoffsteuern enthalten).
- **Netzentgelte, Umlagen und Messstellenbetrieb bei Gas und
  Wärmepumpenstrom:** Netzentgelte sind keine Abgaben; Konzessionsabgabe und
  gesetzliche Umlagen (z. B. KWKG-, Offshore-Netz-Umlage, § 19 StromNEV,
  Gasspeicherumlage) werden als „sonstige Abgaben“ mit Bezeichnung erfasst.
  Ob Umlagen als Abgaben im Sinne von § 6a gelten, ist nicht abschließend
  geklärt.
- **Umsatzsteuer auf die CO₂-Kosten** und auf die Energiesteuer ist in der
  Umsatzsteuerzeile enthalten; eine weitere Aufteilung erfolgt nicht.
- **Anfangsbestand:** Steuern des Vorjahresbestands werden nicht erfasst
  und als „nicht ausgewiesen“ mit dem verbrauchten Wert genannt.
- **Schweregrad der Prüfung:** `info`, solange die Rechtsfolge (§ 12 Abs. 1
  HeizKV) streitig ist.
