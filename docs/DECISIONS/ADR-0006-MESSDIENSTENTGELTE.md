# ADR-0006: Entgelte für Verbrauchserfassung als Kennzeichen der Kostenart

- Status: angenommen (Schema, Core, Prüfung, PDF nutzt den Core);
  Erfassung in der Oberfläche folgt
  (`docs/TASKS/PR-26-MESSDIENSTENTGELTE.md`)
- Datum: 2026-10-10
- Entscheidung des Nutzers (10. Oktober 2026): Weiterarbeit nach Vorschlag
  (Paket 5 aus `docs/TODO-HEIZKV-6A.md`, Bauliste Nr. 5)

## Kontext

§ 6a Abs. 3 Nr. 1c HeizKV verlangt in der Abrechnung Informationen über die
Entgelte für Gerätemiete, Eichung, Ablesung und Abrechnung. Die
Einzelabrechnung ermittelt den Betrag bisher nur über Schlagworte
(`METERING_FEE_PATTERN` im PDF-Paket). Trägt die Kostenart einen anderen
Namen (z. B. den Firmennamen des Messdienstes), fehlt der Betrag ohne
Hinweis; die Angabe ist dann unvollständig (Kürzungsrecht 3 %, § 12 Abs. 1
HeizKV).

## Entscheidung

1. **Schnittstelle (additiv, Schema v5 bleibt):**
   `CostCategory.meteringFee` (optional, boolesch). `true` = die ganze
   Kostenart ist Entgelt für Verbrauchserfassung und Abrechnung, `false` =
   ausdrücklich kein Entgelt (Schlagworte werden ignoriert), leer =
   bisherige Erkennung über Schlagworte.
2. **Keine Datenmigration.** Statt das Kennzeichen beim Laden aus den
   Schlagworten zu setzen (stille Änderung gespeicherter Daten), bleibt die
   Schlagworterkennung der Ersatz bei leerem Kennzeichen. Das Ergebnis
   bestehender Abrechnungen bleibt unverändert.
3. **Rechenvertrag in den Core verlegt** (`meteringFeeCents`,
   `isMeteringFeeCategory`, `METERING_FEE_PATTERN` in
   `packages/core/src/heating/metering-fees.ts`). Das PDF-Paket exportiert
   `meteringFeeCents` aus dem Core weiter, damit Prüfung und Einzelabrechnung
   dieselbe Regel verwenden.
4. **Prüfung:** `heating.metering_fee_not_identified` (Warnung je
   Heizkreis), wenn in den Heizungs-Betriebskosten des Gebäudes kein
   Entgelt gekennzeichnet oder erkennbar ist. Fallen keine Entgelte an
   (z. B. eigene Ablesung ohne Messdienst), wird die Warnung bestätigt.
5. **Folgejahr:** „Kostenarten aus dem Vorjahr übernehmen“ übernimmt das
   Kennzeichen.

## Steuern und Abgaben (Bauliste Nr. 5, zweiter Teil)

Entscheidung des Nutzers (10. Oktober 2026): Es bleibt beim Pauschaltext;
Beträge werden nicht je Rechnung erfasst. Begründung:

Der Wortlaut von Abs. 3 Nr. 1b verlangt „Informationen“ über Steuern,
Abgaben und Zölle, nicht ausdrücklich Beträge; die Erfassung kostet je
Rechnung drei Werte (Umsatzsteuer, Energie-/Stromsteuer, CO₂-Preis nach
BEHG). Rechtlich nicht abschließend geklärt; bei Bedarf neu entscheiden.

## Tests

- `packages/core/tests/metering-fees.test.ts`: Schlagworte, Kennzeichen
  `true`/`false`, Belegbeschreibung, Abgrenzung nach Gebäude, Art, Jahr.
- `packages/validators/tests/billing-information.test.ts`: Prüfhinweis.
- `apps/web/src/features/costs/carry-over.test.tsx`: Übernahme ins
  Folgejahr.
- Bestehende PDF-Tests (`packages/pdf/tests/heating-details.test.ts`)
  unverändert grün.

## Migrationsauswirkungen

Keine Migration; additives optionales Feld. Ältere App-Versionen lehnen
Dateien mit gesetztem Kennzeichen ab (strikte Schemaprüfung).
