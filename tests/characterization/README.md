# Characterization Tests (PR 05, Engine-Vergleich ab PR 06)

Golden-Fixtures und erwartete Ergebnisse, gegen die die künftige
Core-Berechnungsengine validiert wird (Characterization-/Approval-Test-Ansatz).
Bezug: Masterplan Abschnitt 6, 9.5, 20 (PR 05/06); `docs/ROUNDING.md`;
`legacy/behavior-map.md` Abschnitt 5–6.

> PR 06 hat alle 15 vollständigen Engine-Vergleiche aktiviert. Derselbe
> Testrunner läuft außerdem im Coverage-Gate des Core-Pakets.

## Inhalt

| Datei                      | Zweck                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios.json`           | **Einzige Wahrheitsquelle**: 15 frei erfundene Abrechnungsfälle, fachlich kompakt (Beträge in Euro).                                                                                                                            |
| `goldens.json`             | Erwartete Ergebnisse **in ganzen Cent**, aus der Legacy-Engine hergeleitet und verifiziert.                                                                                                                                     |
| `types.ts`                 | TypeScript-Typen für Szenario und Golden.                                                                                                                                                                                       |
| `cases.ts`                 | **Neutrale Ladeschicht** (registriert keine Tests): lädt `scenarios.json`/`goldens.json`, **validiert sie zur Laufzeit** und exportiert `scenarios`, `goldens`, `goldenById`, `characterizationCases()`. Import-Ziel für PR 06. |
| `build-app-data.ts`        | Baut aus einem Szenario die **v4-Eingabe-Fixture** (`AppDataFile`). Exportiert für PR 06.                                                                                                                                       |
| `characterization.test.ts` | Testrunner (Schema-Validierung, Golden-Konsistenz und vollständiger Engine-/Golden-Vergleich). Importiert Fälle aus `cases.ts`.                                                                                                 |
| `test-matrix.md`           | Zuordnung der Fälle zu den Rechenbereichen aus Masterplan 6.2.                                                                                                                                                                  |

## Was der Test prüft

1. **Laufzeitvalidierung der Golden-Werte:** `cases.ts` prüft beim Laden **jedes**
   Feld jeder Golden-Zeile auf Typ und Wertebereich (Cent-Beträge als safe
   integer, `energyKwh`/`co2Kg`/CO₂-Kennwert endlich ≥ 0, `status` ∈
   {gruen,gelb,rot}, keine unbekannten Felder). Ein fehlender, falsch typisierter
   oder vertauschter Detailwert (FIFO, Warmwasser, CO₂-Kennwert, Energiemenge …)
   lässt das Laden — und damit die CI — scheitern. Damit sind **keine** Golden-
   Felder mehr ungeprüft.
2. **Schema-Gültigkeit:** Jede Fixture wird über `build-app-data.ts` erzeugt und
   gegen `appDataFileSchema` (`@nebenkosten/schema`, Ziel-Schema v4) validiert.
3. **Golden-Konsistenz:** Kontrollidentität
   `recorded = tenant + landlord + unallocated + controlDiff`, Kontrolldifferenz
   innerhalb Toleranz, `Saldo = Anteil − Vorauszahlung`, Summe der Nutzeranteile
   = Gesamtsumme (Restcent-Toleranz), Leerstandsanteil beim Vermieter; je
   Heizkreis 70/30-Aufteilung und CO₂-Mieter/Vermieter-Split, Aggregat
   `Σ Heizkreise + unverteilt = Heizkosten`, `Σ Brennstoff (FIFO) = Heiz-
Brennstoffsumme`, Warmwasseranteil im Heiztopf, sowie Plausibilität von
   CO₂-Menge/Energiemenge.
4. **Vollständigkeit:** Alle Mindest-Testfälle aus Masterplan 20 sind abgedeckt.
5. **Vollständiger Engine-Vergleich:** `periodDays`, `totals`, `heating`, `co2`,
   alle Nutzerzeilen und der Leerstandsanteil werden je Fall exakt verglichen.

Alle Engine-Vergleiche sind aktiv; es gibt keine `todo`-Fälle mehr.

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

Die Fälle für weitere fachliche Tests **ausschließlich** aus dem neutralen Modul
`cases.ts` beziehen. Die Testdatei selbst registriert beim Import Vitest-Tests.
PR 06 vergleicht das
**vollständige** Ergebnis, nicht nur `totals`:

```ts
import { characterizationCases } from '../../tests/characterization/cases'
import { buildAppDataFile } from '../../tests/characterization/build-app-data'

for (const { scenario, golden } of characterizationCases()) {
  const input = createCalculationInput(buildAppDataFile(scenario), 'bp-1')
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
