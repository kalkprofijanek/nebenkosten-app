# PR-30 – Eigentümerwechsel im Abrechnungsjahr (Erwerberabrechnung)

Stand: 16. Oktober 2026. Auftrag: Roadmap Phase 2, Punkt 1.

## Anlass

Bei einem Objektkauf im laufenden Jahr rechnet der Erwerber das ganze Jahr ab.
Kosten des Verkäufers bis zum Übergabetag liegen oft nur als
Erwerberabrechnung vor: Pauschalen, geschätzte Bestände, gezahlte Abschläge
statt Rechnungsbeträgen, Brennstoff zu einem Schätzpreis statt zum
Anschaffungspreis.

## Umfang

1. Schema (additiv, mit Migration): `BillingPeriod.ownershipChange`
   { `transferDate`, `previousOwnerLabel` } und an Kostenpositionen bzw.
   Lieferungen eine Herkunft `origin: previous_owner | own` sowie ein
   Kennzeichen `amountBasis: invoice | advance_payments | estimate`.
2. Bestände: Übernahmebestand zum Übergabetag als eigenes Los mit
   Anschaffungspreis (FIFO); Bewertung des Verkäufers nur, wenn kein
   Anschaffungspreis belegt ist (mit Begründung).
3. Validatoren: Warnung bei `advance_payments` oder `estimate` für Energie;
   Warnung, wenn der Verkäuferzeitraum für eine Energiequelle keine Menge hat;
   Warnung, wenn der Preis je Einheit mehr als 20 % von Vorjahr oder
   Folgelieferung abweicht.
4. Oberfläche: Assistent „Objekt im Jahr gekauft“ (Übergabetag, Übernahme der
   Verkäuferpositionen, Bestände).
5. PDF: neutraler Hinweis im Kostenblatt, ohne Personendaten des Verkäufers.

## Freigegebene Pfade

`packages/schema`, `packages/core` (nur Bestandsbewertung), `packages/validators`,
`apps/web/src/features/heating`, `apps/web/src/features/costs`,
`packages/pdf` (Hinweistext), Tests, diese Datei.

## Abnahme

Tests zuerst: FIFO mit Übernahmelos, Abschlag-Warnung, Preisabweichung,
Migration ohne Datenverlust. Nur fiktive Daten.

## Umsetzungsstand (Teil 1)

### Schnittstellenänderung (Schema, additiv v5)

- Grund: Erwerberabrechnungen enthalten Abschläge, Schätzungen und
  Schätzpreise; das war im Datenmodell nicht unterscheidbar.
- Vertrag (alle Felder optional, `nullish`):
  - `BillingPeriod.ownershipChange { transferDate, previousOwnerLabel }`
    (`previousOwnerLabel` nur intern, nie im Mieter-PDF),
  - `CostEntry.origin` / `FuelDelivery.origin`: `previous_owner | own`
    (leer = eigene),
  - `CostEntry.amountBasis` / `FuelDelivery.amountBasis`:
    `invoice | advance_payments | estimate` (leer = Rechnung),
  - `FuelStock.valuationBasis`: `acquisition_cost | seller_valuation`,
    `FuelStock.valuationReason`.
- Migration: keine Versionsänderung; bestehende v5-Dateien bleiben gültig,
  ältere Dateien werden wie bisher migriert (neue Felder leer).
- Rechenkern unverändert: FIFO bewertet den Übernahmebestand mit
  `openingPricePerUnitCents` wie jeden Anfangsbestand.

### Prüfungen (Validator)

- `heating.energy_amount_not_invoiced`: Energie bzw. Heizkosten nach
  Abschlägen oder Schätzung.
- `heating.previous_owner_quantity_missing`: Verkäuferzeitraum (Herkunft
  Voreigentümer oder Datum vor Übergabe) ohne Menge.
- `heating.opening_stock_seller_valuation`: Verkäuferbewertung ohne
  Begründung.
- `heating.fuel_price_deviation`: Preis je Einheit weicht über 20 % von
  Folgelieferung, Vorjahr oder Anfangsbestand ab (nur lagerfähige
  Brennstoffe).

### PDF

- Neutraler Hinweis mit Übergabetag vor dem Einwendungshinweis, ohne
  Personendaten des Voreigentümers.

## Umsetzungsstand (Teil 2: Oberfläche)

- Abrechnungsjahr: Abschnitt „Eigentümerwechsel“ (Übergabetag innerhalb des
  Zeitraums, interne Bezeichnung des Voreigentümers). Beim Speichern werden
  Lieferungen und Belege vor dem Übergabetag als „vom Voreigentümer“
  gekennzeichnet, sofern noch keine Herkunft gewählt ist
  (`apps/web/src/features/billing-periods/ownership-change.ts`).
- Heizkreise → Brennstoff: Auswahl „Betragsgrundlage“ und „Herkunft“ je
  Lieferung, „Bewertung des Anfangsbestands“ mit Begründung.
- `updateFuelDelivery` erhält Herkunft und Betragsgrundlage, wenn ein anderer
  Bearbeitungsweg sie nicht mitschickt.
- Offen: Herkunft und Betragsgrundlage auch im Formular der Kostenbelege.
