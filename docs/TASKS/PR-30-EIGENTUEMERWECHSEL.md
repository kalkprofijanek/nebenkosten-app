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
