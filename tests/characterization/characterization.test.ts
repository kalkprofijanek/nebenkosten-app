/**
 * Characterization-Tests (PR 05).
 *
 * Die Core-Berechnungsengine existiert noch nicht (PR 06). Dieser Test liefert
 * daher die Golden-Fixtures und prueft, was ohne Engine pruefbar ist:
 *
 *  (a) jede Eingabe-Fixture (v4) validiert gegen `appDataFileSchema`;
 *  (b) die aus der Legacy-Engine hergeleiteten Golden-Werte sind in sich
 *      konsistent (Kontrollidentitaet, Saldo = Anteil - Vorauszahlung,
 *      CO2- und Heizkostenaufteilung, Restcent-Toleranz);
 *  (c) je Fall ein `it.todo`, das in PR 06 die neue Engine gegen die Golden-
 *      Werte aktiviert (Vergleichsrahmen; siehe `expectedFor`).
 *
 * Kein Test ist rot; die Engine-Vergleiche sind bewusst als pending markiert.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { appDataFileSchema } from '@nebenkosten/schema'
import { buildAppDataFile } from './build-app-data'
import type { Golden, Scenario, ScenarioFile } from './types'

const scenarioFile = JSON.parse(
  readFileSync(new URL('./scenarios.json', import.meta.url), 'utf8'),
) as ScenarioFile
const scenarios: Scenario[] = scenarioFile.scenarios

const goldens = JSON.parse(
  readFileSync(new URL('./goldens.json', import.meta.url), 'utf8'),
) as Golden[]

const goldenById = new Map(goldens.map((golden) => [golden.id, golden]))

/**
 * Kontrolldifferenz-Toleranz. Masterplan 6.3 fordert <= 0,01 EUR (1 Cent);
 * die Legacy-App verwendet fachlich 0,50 EUR (behavior-map Abschnitt 6). Fuer
 * die Golden-Fixtures gilt die strengere Zielvorgabe — offene Entscheidung,
 * siehe docs/ROUNDING.md.
 */
const CONTROL_TOLERANCE_CENTS = 1

/** Restcent aus Zeilenrundung: bis zu 1 Cent je Nutzer/Position (docs/ROUNDING.md). */
const roundingSlack = (count: number): number => Math.max(1, count)

/** Mindest-Testfaelle laut Masterplan 20 (PR 05) — jede muss abgedeckt sein. */
const REQUIRED_COVERAGE: string[] = [
  'daily-periods',
  'tenant-change',
  'vacancy',
  'multi-building',
  'multi-circuit',
  'fuel-fifo',
  'fuel-pellets',
  'heat-pump',
  'hybrid-heating',
  'central-hot-water',
  'decentral-hot-water',
  'co2-split',
  'direct-costs',
  'missing-assignment',
  'negative-values',
]

describe('Characterization-Fixtures: Struktur', () => {
  it('deckt alle Mindest-Testfaelle aus Masterplan 20 ab', () => {
    const covered = new Set(scenarios.flatMap((scenario) => scenario.coverage))
    for (const tag of REQUIRED_COVERAGE) {
      expect(covered.has(tag), `Rechenbereich fehlt: ${tag}`).toBe(true)
    }
  })

  it('hat zu jedem Szenario genau einen Golden-Datensatz', () => {
    expect(goldens.length).toBe(scenarios.length)
    for (const scenario of scenarios) {
      expect(goldenById.has(scenario.id), `Golden fehlt: ${scenario.id}`).toBe(
        true,
      )
    }
  })

  it('hat eindeutige Szenario-IDs', () => {
    const ids = scenarios.map((scenario) => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe.each(scenarios.map((scenario) => [scenario.id, scenario] as const))(
  'Characterization-Fall %s',
  (id, scenario) => {
    const golden = goldenById.get(id)!

    it('erzeugt eine gegen appDataFileSchema gueltige v4-Eingabe-Fixture', () => {
      const appData = buildAppDataFile(scenario)
      const result = appDataFileSchema.safeParse(appData)
      expect(
        result.success,
        result.success
          ? ''
          : JSON.stringify(result.error.issues.slice(0, 5), null, 2),
      ).toBe(true)
    })

    it('bildet Szenario-Entitaeten vollstaendig in die Fixture ab', () => {
      const appData = buildAppDataFile(scenario)
      expect(appData.billingData.costCategories.length).toBe(
        scenario.costs.length,
      )
      expect(appData.billingData.occupancyPeriods.length).toBe(
        scenario.tenants.length,
      )
      expect(appData.billingData.prepayments.length).toBe(
        scenario.tenants.length,
      )
      expect(appData.masterData.buildings.length).toBe(
        scenario.buildings.length,
      )
      expect(appData.billingData.heatingCircuits.length).toBe(
        scenario.circuits.length,
      )
    })

    it('erfuellt die Kontrollidentitaet recorded = tenant + landlord + unallocated + controlDiff', () => {
      const t = golden.totals
      expect(t.recordedCostsCents).toBe(
        t.tenantTotalCents +
          t.landlordTotalCents +
          t.unallocatedCents +
          t.controlDifferenceCents,
      )
    })

    it('haelt die Kontrolldifferenz innerhalb der Toleranz', () => {
      expect(
        Math.abs(golden.totals.controlDifferenceCents),
      ).toBeLessThanOrEqual(CONTROL_TOLERANCE_CENTS)
    })

    it('summiert Nutzeranteile (ohne Leerstand) zur Mieter-Gesamtsumme (Restcent-Toleranz)', () => {
      const tenantSum = golden.tenants
        .filter((tenant) => !tenant.isVacancy)
        .reduce((sum, tenant) => sum + tenant.shareCents, 0)
      expect(
        Math.abs(tenantSum - golden.totals.tenantTotalCents),
      ).toBeLessThanOrEqual(roundingSlack(golden.tenants.length))
    })

    it('summiert Vorauszahlungen (ohne Leerstand) zur VZ-Gesamtsumme', () => {
      const prepaySum = golden.tenants
        .filter((tenant) => !tenant.isVacancy)
        .reduce((sum, tenant) => sum + tenant.prepaymentCents, 0)
      expect(
        Math.abs(prepaySum - golden.totals.prepaymentsCents),
      ).toBeLessThanOrEqual(roundingSlack(golden.tenants.length))
    })

    it('haelt je Nutzer Saldo = Anteil - Vorauszahlung ein (Restcent-Toleranz)', () => {
      for (const tenant of golden.tenants) {
        expect(
          Math.abs(
            tenant.balanceCents - (tenant.shareCents - tenant.prepaymentCents),
          ),
          `Saldo weicht ab bei ${tenant.id}`,
        ).toBeLessThanOrEqual(1)
      }
    })

    it('weist Leerstandsanteile dem Vermieter zu', () => {
      const vacancySum = golden.tenants
        .filter((tenant) => tenant.isVacancy)
        .reduce((sum, tenant) => sum + tenant.shareCents, 0)
      expect(golden.vacancyLandlordCents).toBe(vacancySum)
      expect(golden.vacancyLandlordCents).toBeLessThanOrEqual(
        golden.totals.landlordTotalCents,
      )
    })

    it('teilt CO2-Kosten konsistent in Mieter- und Vermieteranteil', () => {
      expect(
        Math.abs(
          golden.co2.totalCostCents -
            (golden.co2.tenantCents + golden.co2.landlordCents),
        ),
      ).toBeLessThanOrEqual(1)
      const perCircuitCo2 = golden.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.co2CostCents,
        0,
      )
      expect(
        Math.abs(perCircuitCo2 - golden.co2.totalCostCents),
      ).toBeLessThanOrEqual(roundingSlack(golden.heating.perCircuit.length))
    })

    it('teilt je Heizkreis den 70/30-Topf konsistent auf (Grund + Verbrauch = Heiztopf)', () => {
      for (const circuit of golden.heating.perCircuit) {
        expect(
          Math.abs(
            circuit.heatingTotalCents -
              (circuit.baseCents + circuit.consumptionCents),
          ),
          `70/30-Aufteilung weicht ab bei ${circuit.buildingId}`,
        ).toBeLessThanOrEqual(1)
      }
    })

    // PR 06: die neue Core-Engine gegen die Golden-Werte pruefen.
    // Aktivieren, sobald `calculateBilling` (Masterplan 6.1) existiert:
    //   const result = calculateBilling(toCalculationInput(buildAppDataFile(scenario)))
    //   expect(toCents(result.totals)).toEqual(golden.totals)
    it.todo(`PR 06: Engine-Ergebnis gegen Golden-Werte vergleichen (${id})`)
  },
)

/**
 * Vergleichsrahmen fuer PR 06: liefert Eingabe-Fixture und Golden-Werte eines
 * Falls. Die Core-Engine importiert dies, um ihr Ergebnis zu validieren.
 */
export function characterizationCases(): {
  scenario: Scenario
  golden: Golden
}[] {
  return scenarios.map((scenario) => ({
    scenario,
    golden: goldenById.get(scenario.id)!,
  }))
}
