# ADR-0015: Abrechnungsentgelt für die Heiz-/Warmwasserkostenabrechnung

- Status: angenommen (Schema, Core, Prüfung, Oberfläche, `pnpm abrechnung`)
- Datum: 2026-10-23
- Entscheidung des Nutzers (23. Oktober 2026): Das Entgelt des
  Abrechnungsdienstleisters fällt **je erstellter Heizkostenabrechnung** an;
  erstmals für die Abrechnung 2025, wieder für 2026.

## Kontext

Für 2025 erstellt ein Abrechnungsdienstleister die Heiz- und
Warmwasserkostenabrechnung und berechnet dafür 40,00 € netto zuzüglich 19 %
Umsatzsteuer, also 47,60 € brutto je Abrechnung (Beispielwerte). Die
Kosten der Berechnung und Aufteilung gehören zu den Kosten des Betriebs der
zentralen Heizungs- und Warmwasserversorgungsanlage (§ 7 Abs. 2, § 8 Abs. 2
HeizKV) und sind nach § 6a Abs. 3 Nr. 1c HeizKV in der Abrechnung
auszuweisen.

Bisher kannte die App nur das Kennzeichen `CostCategory.meteringFee`
(ADR-0006). Es unterscheidet nicht zwischen der Erstellung der Abrechnung
und Ablesung, Gerätemiete oder Eichung. Ein zweiter Ansatz derselben
Leistung (Messdienst mit Abrechnung und zusätzlich ein
Abrechnungsdienstleister) fiel nicht auf. Rechnungsnummer, Netto,
Umsatzsteuer und Leistungszeitraum ließen sich am Beleg nicht festhalten.

Ein erster Entwurf rechnete die Kalkulationshilfe mit „40 € netto je Wohnung
und Jahr, jede Wohnung einmal“ (62 Wohnungen). Das entspricht nicht der
Rechnung: Der Dienstleister rechnet je erstellter Abrechnung ab.

## Entscheidung

1. **Schnittstelle (additiv, Schema v5 bleibt):**
   - `CostCategory.meteringFeeKind` (optional): `billing_service`
     (Erstellung der Heiz-/Warmwasserkostenabrechnung), `reading`,
     `device_rental`, `calibration`, `other`. Leer = nicht unterschieden.
   - `CostEntry.invoice` (optional): `invoiceNumber`, `invoiceDate`,
     `servicePeriodStart`, `servicePeriodEnd`, `netCents`, `vatCents`,
     `vatRatePercent`. `amountCents` bleibt der umgelegte Betrag (bei
     Wohnraum ohne Vorsteuerabzug brutto). Der Leistungszeitraum ist der
     tatsächliche Zeitraum der Leistung, nicht das Abrechnungsjahr.
2. **Verteilung über den Heiztopf.** Das Entgelt ist eine Heizungs-
   Betriebskostenart (`kind: 'heating'`, Gebäude-Bereich des Heizkreises).
   Es wird wie die übrigen Heizungs-Betriebskosten nach Grund- und
   Verbrauchskosten und bei zentralem Warmwasser anteilig nach § 9 Abs. 1
   HeizKV verteilt. Es ist **keine Pauschale je Mieter**. Auf Leerstand
   entfallende Anteile trägt der Vermieter. Energie, CO₂-Kosten und
   CO₂-Aufteilung bleiben unberührt.
3. **Kalkulationshilfe je erstellter Heizkostenabrechnung.** Je bewohnte
   Nutzung (`OccupancyPeriod.kind = 'tenant'`) im Abrechnungsjahr entsteht
   eine Abrechnung. Ein Nutzerwechsel ergibt zwei Abrechnungen, Leerstand
   keine (`billingServiceStatementIds`, `billingServiceFeeQuote` in
   `packages/core/src/heating/billing-service-fee.ts`). Umsatzsteuer auf
   die Nettosumme, kaufmännisch gerundet. Beispiel: 10 Abrechnungen ×
   40,00 € = 400,00 € netto + 76,00 € USt = 476,00 €.
   Die Kalkulationshilfe dient nur dem Abgleich; umgelegt wird stets der
   erfasste Beleg.
4. **Vorschau** (`billingServiceFeePreview`): je Heizkreis Zahl der
   Abrechnungen, Kalkulationshilfe, erfasste Rechnung, Abweichung,
   Doppelansatz, getrennt geführte übrige Entgelte, Aufteilung Heizung/
   Warmwasser und die Mehrbelastung je Nutzung (Vergleichsrechnung mit und
   ohne Entgelt). `pnpm abrechnung … --abrechnungsentgelt <netto-euro>
   [--ust <prozent>]` gibt sie aus und schreibt sie mit `--json` als
   `billingServiceFee`.
5. **Erkennung ohne Art:** Schlagworte (`BILLING_SERVICE_PATTERN`, z. B.
   „Heizkostenabrechnung“, „Verbrauchsabrechnung“, „Erstellung der
   Heiz…“). Erwerber- oder Energieabrechnungen zählen nicht. Kostenarten
   mit `meteringFee: false` zählen nie.
6. **Prüfungen (Warnungen):**
   - `heating.billing_service_duplicate`: mehr als eine
     Abrechnungsdienstleistung mit Betrag je Heizkreis.
   - `costs.invoice_amount_mismatch`: Netto + Umsatzsteuer weicht vom
     Belegbetrag ab, oder die Umsatzsteuer passt nicht zum Steuersatz
     (Toleranz je 1 Cent).
7. **Oberfläche:** „Art des Entgelts“ an Heizungs-Kostenarten,
   „Rechnungsangaben (optional)“ an Kostenpositionen. „Kostenarten aus dem
   Vorjahr übernehmen“ übernimmt die Art.

## Offene Punkte

- Ob ein Leerstand, für den der Dienstleister dennoch eine Abrechnung
  erstellt, mitzuzählen ist, regelt der jeweilige Vertrag. Die
  Kalkulationshilfe zählt ihn nicht. Weicht die Rechnung ab, zeigt die
  Vorschau die Differenz; maßgeblich bleibt der Beleg.

## Tests

- `packages/core/tests/billing-service-fee.test.ts`: Kalkulationshilfe
  (10 × 40 € = 476,00 €), Zählung je bewohnte Nutzung mit Nutzerwechsel
  und Leerstand, Erkennung, Vorschau, Verteilung über den Heiztopf,
  unveränderte Energie und CO₂, Doppelansatz.
- `packages/validators/tests/billing-service-fee.test.ts`: Prüfhinweise.
- `packages/schema/tests/cost-entry-invoice.test.ts`: Rechnungsangaben.
- `apps/web/src/features/workflows/costs/billing-service-fee.test.tsx`:
  Erfassung in der Oberfläche, Links der Prüfhinweise.

## Migrationsauswirkungen

Keine Migration; zwei additive optionale Felder. Ältere App-Versionen lehnen
Dateien mit gesetzten Feldern ab (strikte Schemaprüfung). Der
Legacy-v3-Import setzt die Felder nicht; für 2025 setzt sie ein Overlay
außerhalb des Repositorys.
