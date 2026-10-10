# Vergleich mit dem normierten Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4 HeizKV)

Stand: 10. Oktober 2026. Ausgangspunkt: `main` bei d356e78. Entscheidung:
`docs/DECISIONS/ADR-0004-VERGLEICH-DURCHSCHNITTSNUTZER.md`.

## Änderungsgrund

Die Einzelabrechnung enthält keinen Vergleich mit einem normierten
Durchschnittsnutzer; der Mieter kann seinen Heizkostenanteil deshalb um 3 %
kürzen (§ 12 Abs. 1 HeizKV). Quelle der Vergleichswerte ist nach Entscheidung
des Nutzers der Heizspiegel für Deutschland (co2online).

## Teil A – Claude (dieser PR): Schema, Rechenvertrag, Prüfung

- `packages/schema`: `consumptionBenchmarkSchema`,
  `HeatingCircuit.consumptionBenchmark` (optional, Schema v5 bleibt).
- `packages/core`: `compareTenantWithConsumptionBenchmark`,
  `classifyConsumptionBenchmark`, Typen `TenantConsumptionBenchmark`,
  `ConsumptionBenchmarkClass` (`low` | `medium` | `elevated` | `high`),
  `ConsumptionBenchmarkUnavailableReason`. Export über
  `packages/core/src/index.ts`.
- `packages/validators`: `heating.consumption_benchmark_not_comparable`
  (Warnung), `heating.consumption_benchmark_year_mismatch` (Hinweis).
- `apps/web`: `updateHeatingCircuit` übernimmt `consumptionBenchmark`
  unverändert (sonst Datenverlust beim Speichern des Heizkreises).
- Keine Änderung an Kostenverteilung, Rundung, Legacy oder PDF.

## Teil B – Codex (Folge-PR): Ausgabe und Erfassung

Erst nach dem Merge von Teil A beginnen.

1. **PDF** (`packages/pdf/src/tenant-statement.ts`, `consumptionInformation`):
   - Zeile „Vergleich mit dem Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4 HeizKV)“
     aus `compareTenantWithConsumptionBenchmark(context.calculation, …)`:
     eigener Wert in kWh je m² und Jahr, Klasse („niedrig“, „mittel“,
     „erhöht“, „zu hoch“) und die drei Grenzen, umgerechnet auf die eigene
     Fläche und Nutzungszeit (`rangeKwh`).
   - Fußnote: Quelle, Kategorie, Bezugsjahr; bei `annualized` „auf ein Jahr
     hochgerechnet“; Hinweis, dass Heizwärme und Warmwasser als Anteil am
     Energieeinsatz des Gebäudes nach den Verteilschlüsseln ermittelt sind.
   - Neue Texte in `packages/pdf/src/legal-texts.ts`; der Mittelwert des
     Heizkreises bleibt zusätzlich stehen.
   - Bei `status: 'unavailable'` keine Zeile.
2. **Prüfung** (`packages/validators/src/billing-information.ts`):
   `heating.consumption_benchmark_missing` nur noch je Heizkreis **ohne**
   `consumptionBenchmark` melden (Entität `HeatingCircuit`); Test in
   `billing-information.test.ts` anpassen. Erst zusammen mit Punkt 1 ändern.
3. **Oberfläche** (Heizkreis-Bearbeitung, `HeatingSetupPanel.tsx`,
   `heating-commands.ts`): Abschnitt „Vergleichswerte (Heizspiegel)“ mit
   Quelle (Vorbelegung „Heizspiegel für Deutschland (co2online)“), Fundstelle,
   Bezugsjahr, Kategorie, „Werte enthalten Warmwasser“ (Vorbelegung ja) und
   den drei Grenzen „niedrig bis“, „mittel bis“, „erhöht bis“. Validierung
   über `consumptionBenchmarkSchema`; Feldfehler auf Deutsch. Optional:
   „Vergleichswerte aus dem Vorjahr übernehmen“.
4. **Tests:** PDF-Text mit/ohne Vergleichswerte und bei Teilzeitraum;
   Oberflächentest Erfassen/Ändern/Entfernen; keine echten Heizspiegel-Werte
   in Fixtures (fiktive Grenzen wie 70/130/200 verwenden).
5. **Doku:** Benutzerhandbuch (wo die Werte im Heizspiegel-Flyer stehen:
   Energieträger, Baualtersklasse, Gebäudefläche), CHANGELOG,
   `docs/TODO-HEIZKV-6A.md` Zeile Abs. 3 Nr. 4 auf „erfüllt“.

## Tests (Teil A)

Siehe ADR-0004, Abschnitt „Tests“.

## Migrationsauswirkungen

Keine Migration; additives optionales Feld. Ältere App-Versionen lehnen
Dateien mit dem neuen Feld ab (strikte Schemaprüfung).
