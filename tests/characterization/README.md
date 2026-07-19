# Characterization Tests (PR 05)

Golden-Fixtures und erwartete Ergebnisse, gegen die die künftige
Core-Berechnungsengine (PR 06) validiert wird (Characterization-/Approval-Test-
Ansatz). Bezug: Masterplan Abschnitt 6, 9.5, 20 (PR 05); `docs/ROUNDING.md`;
`legacy/behavior-map.md` Abschnitt 5–6.

> Die Core-Engine existiert in PR 05 noch **nicht**. Dieser Ordner liefert die
> Eingaben und die erwarteten Werte vorab. Der Engine-Vergleich ist je Fall als
> `it.todo` markiert und wird in PR 06 aktiviert.

## Inhalt

| Datei                      | Zweck                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios.json`           | **Einzige Wahrheitsquelle**: 15 frei erfundene Abrechnungsfälle, fachlich kompakt (Beträge in Euro).                                                                                                                            |
| `goldens.json`             | Erwartete Ergebnisse **in ganzen Cent**, aus der Legacy-Engine hergeleitet und verifiziert.                                                                                                                                     |
| `types.ts`                 | TypeScript-Typen für Szenario und Golden.                                                                                                                                                                                       |
| `cases.ts`                 | **Neutrale Ladeschicht** (registriert keine Tests): lädt `scenarios.json`/`goldens.json`, **validiert sie zur Laufzeit** und exportiert `scenarios`, `goldens`, `goldenById`, `characterizationCases()`. Import-Ziel für PR 06. |
| `build-app-data.ts`        | Baut aus einem Szenario die **v4-Eingabe-Fixture** (`AppDataFile`). Exportiert für PR 06.                                                                                                                                       |
| `characterization.test.ts` | Testrunner (Schema-Validierung, Golden-Konsistenz, `it.todo` für PR 06). Importiert Fälle aus `cases.ts`.                                                                                                                       |
| `test-matrix.md`           | Zuordnung der Fälle zu den Rechenbereichen aus Masterplan 6.2.                                                                                                                                                                  |

## Was der Test heute prüft

1. **Laufzeitvalidierung der Golden-Werte:** `cases.ts` prüft beim Laden **jedes**
   Feld jeder Golden-Zeile auf Typ und Wertebereich (Cent-Beträge als safe
   integer, `energyKwh`/`co2Kg`/CO₂-Kennwert endlich ≥ 0, `status` ∈
   {gruen,gelb,rot}, keine unbekannten Felder). Ein fehlender, falsch typisierter
   oder vertauschter Detailwert (FIFO, Warmwasser, CO₂-Kennwert, Energiemenge …)
   lässt das Laden — und damit die CI — scheitern. Damit sind **keine** Golden-
   Felder mehr ungeprüft.
2. **Schema-Gültigkeit:** Jede Fixture wird über `build-app-data.ts` erzeugt und
   gegen `appDataFileSchema` (`@nebenkosten/schema`, Ziel-Schema v4) validiert.
3. **Golden-Konsistenz** (ohne Engine): Kontrollidentität
   `recorded = tenant + landlord + unallocated + controlDiff`, Kontrolldifferenz
   innerhalb Toleranz, `Saldo = Anteil − Vorauszahlung`, Summe der Nutzeranteile
   = Gesamtsumme (Restcent-Toleranz), Leerstandsanteil beim Vermieter; je
   Heizkreis 70/30-Aufteilung und CO₂-Mieter/Vermieter-Split, Aggregat
   `Σ Heizkreise + unverteilt = Heizkosten`, `Σ Brennstoff (FIFO) = Heiz-
Brennstoffsumme`, Warmwasseranteil im Heiztopf, sowie Plausibilität von
   CO₂-Menge/Energiemenge.
4. **Vollständigkeit:** Alle Mindest-Testfälle aus Masterplan 20 sind abgedeckt.
5. **`it.todo` je Fall:** Platzhalter für den vollständigen Engine-Vergleich in
   PR 06.

Kein Test ist rot; die Engine-Vergleiche sind bewusst pending.

## Herleitung und Verifikation der Golden-Werte

Die Golden-Werte wurden **nicht** von Hand geschätzt, sondern mit der
**faktentreu extrahierten Legacy-Rechenlogik** (`Engine.rechne` und alle reinen
Hilfsfunktionen aus `legacy/index.html`) headless in Node aus denselben
Szenarien berechnet und anschließend über `euroToCents`
(`packages/schema/src/migrations/euro-to-cents.ts`) in ganze Cent gewandelt.

Der Ableitungs-Harness lief **außerhalb des Repositorys** (Scratchpad) und
wurde **nicht** eingecheckt: Er enthielt Quelltext-Auszüge aus `legacy/`, die
laut Datenschutzregel nicht ins Repository gehören. In das Repository gelangen
ausschließlich die frei erfundenen Eingaben (`scenarios.json`) und die daraus
berechneten Ergebnisse (`goldens.json`). Herleitungslogik pro Fall:
`test-matrix.md` und die Kommentare in `scenarios.json`.

Für einfache Fälle (01–04, 13) sind die Werte zusätzlich von Hand
nachvollziehbar (runde Beträge). Für die Heiz-/FIFO-/CO₂-Fälle gilt: „per
Legacy-Algorithmus hergeleitet, in PR 06 gegen die neue Engine zu verifizieren".

## Verwendung in PR 06

Die Fälle **ausschließlich** aus dem neutralen Modul `cases.ts` beziehen (nicht
aus `characterization.test.ts` — ein Import der Testdatei würde deren Tests und
`it.todo`-Fälle als Nebenwirkung registrieren). PR 06 vergleicht das
**vollständige** Ergebnis, nicht nur `totals`:

```ts
import { characterizationCases } from '../../tests/characterization/cases'
import { buildAppDataFile } from '../../tests/characterization/build-app-data'

for (const { scenario, golden } of characterizationCases()) {
  const input = toCalculationInput(buildAppDataFile(scenario))
  const result = calculateBilling(input)
  const actual = toGolden(result) // Engine-Ergebnis in die Golden-Form bringen
  expect(actual.totals).toEqual(golden.totals)
  expect(actual.heating).toEqual(golden.heating)
  expect(actual.co2).toEqual(golden.co2)
  expect(actual.tenants).toEqual(golden.tenants)
  expect(actual.vacancyLandlordCents).toBe(golden.vacancyLandlordCents)
}
```

## Ausführen

```bash
pnpm test:characterization
```

Läuft in der CI als eigener Job (`characterization-tests`) und im
`pnpm test`-Aggregat (Pre-Push-Hook).

## Datenschutz

Alle Fixture-Daten sind frei erfunden (Mustermann/Musterstraße-Stil). Es werden
**keine** Werte aus `legacy/index.html` (auch keine sanitisierten Platzhalter)
in Fixtures, Golden-Werten oder Docs zitiert. Vor jedem Push laufen
`node scripts/scan-repository-content.mjs` und
`node scripts/verify-repository-guardrails.mjs` (beide müssen grün sein).
