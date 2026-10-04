# ADR-0003: Mietkonto mit Zuordnung von Mieteingängen

- Status: angenommen
- Datum: 2026-10-04
- Entscheidungen des Nutzers: Mietkonto aufnehmen; eindeutige Zahlungen
  ohne Rückfrage zuordnen; Abrechnung rechnet weiter mit dem Soll der
  Vorauszahlungen

## Kontext

Vermieter wollen sehen, welche Monate bezahlt sind und ob Rückstände
bestehen. Die Mieteingänge liegen bereits als Bankbuchungen (Kategorie
„Mieteingang“) vor, sind aber keinem Mietverhältnis zugeordnet. Die
Kaltmiete ist am Mietverhältnis erfasst (`Tenancy.monthlyRentCents`), wurde
bisher aber nicht verwendet.

## Entscheidung

1. **Schnittstelle (additiv):** `BankBooking` erhält zwei optionale Felder
   `tenancyId` (Mietverhältnis) und `tenancyAssignment` (`auto` | `manual`).
   Die Schema-Version bleibt 5, wie beim ebenfalls additiven Feld
   `heatMeterReading` (1.2.1).
2. **Rechenvertrag:** `calculateRentLedger` (`packages/core/src/rent-ledger`)
   bildet je Monat das Soll aus Kaltmiete und vereinbarter Vorauszahlung des
   Nutzungszeitraums, bei Teilmonaten taggenau anteilig, gerundet je Monat
   (kaufmännisch). Ist sind die zugeordneten Mieteingänge des Jahres; sie
   füllen die Monate der Reihe nach. Rückstand = fälliges Soll bis Stichtag −
   Ist; Guthaben = Ist − Jahressoll.
3. **Zuordnung:** `matchRentPaymentTenancy` vergleicht Nachname bzw.
   Anzeigename der Mieter und die Mandatsreferenz (ganze Wörter, mindestens
   drei Zeichen) mit Auftraggeber und Verwendungszweck. Berücksichtigt werden
   nur Mietverhältnisse des Objekts, die am Zahltag bestehen. Bei genau einem
   Treffer wird ohne Rückfrage zugeordnet; noch offene, ungeprüfte Eingänge
   zusätzlich nur, wenn der Betrag genau dem Monatssoll entspricht – sie
   werden dann als „Mieteingang“ eingestuft. Mehrdeutige Treffer bleiben zur
   Zuordnung von Hand stehen. Die Zuordnung läuft nach jedem CSV-Import und
   per Knopf auf der Seite „Mietkonto“.
4. **Abrechnung unverändert:** Die Nebenkostenabrechnung rechnet weiter mit
   den vereinbarten Vorauszahlungen. Zeigt das Mietkonto im Abrechnungsjahr
   einen Rückstand, meldet die Prüfung `rent.arrears` (Warnung).

## Tests

- `packages/core/tests/rent-ledger.test.ts`: Soll, Teilmonat, Reihenfolge der
  Zahlungen, Rückstand, Guthaben, Zuordnungsregeln.
- `apps/web/src/features/rent-ledger/*.test.tsx`: automatische und manuelle
  Zuordnung, Seite „Mietkonto“.
- `packages/validators/tests/rent-arrears.test.ts`: Prüfhinweis.

## Migrationsauswirkungen

- Bestehende Dateien bleiben gültig; es ist keine Migration nötig.
- Eine Datei mit zugeordneten Mieteingängen kann von App-Versionen bis
  1.3.0 nicht mehr geöffnet werden (strikte Schemaprüfung). Das betrifft nur
  Nutzer, die zu einer älteren Version zurückkehren.
- Offen: Kaltmiete als Staffel (heute ein Wert je Mietverhältnis) und das
  Ansetzen tatsächlich gezahlter Vorauszahlungen in der Abrechnung.
