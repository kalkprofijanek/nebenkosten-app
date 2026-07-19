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
import { describe, expect, it } from 'vitest'
import { appDataFileSchema } from '@nebenkosten/schema'
import { buildAppDataFile } from './build-app-data'
import { goldenById, goldens, scenarios } from './cases'

// Hinweis: `scenarios`/`goldens`/`goldenById` und `characterizationCases`
// stammen aus dem neutralen Modul `cases.ts`. Dort werden `goldens.json`
// und `scenarios.json` beim Laden zur Laufzeit validiert (nicht nur als
// TypeScript-Typ) — fehlende oder falsch typisierte Golden-Felder (FIFO,
// Warmwasser, CO2-Kennwert, Energiemenge, Status …) lassen das Laden und
// damit die CI scheitern.

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
          circuit.baseCents + circuit.consumptionCents,
          `70/30-Aufteilung weicht ab bei ${circuit.buildingId}`,
        ).toBe(circuit.heatingTotalCents)
      }
    })

    it('summiert Heizkreis-Töpfe inkl. unverteiltem Anteil zur Heizkosten-Gesamtsumme', () => {
      const perCircuitTotal = golden.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.heatingTotalCents,
        0,
      )
      // Masterplan 6.2 „unverteilter Heizkostenanteil": nicht einem Kreis
      // zugeordnete Heizkosten gehen als Vermieteranteil in die Summe ein.
      expect(perCircuitTotal + golden.heating.unallocatedLandlordCents).toBe(
        golden.heating.totalCents,
      )
    })

    it('summiert Heizkreis-Brennstoffkosten (FIFO) zur Heiz-Brennstoffsumme', () => {
      const perCircuitFuel = golden.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.fuelConsumptionCents,
        0,
      )
      expect(perCircuitFuel).toBe(golden.heating.fuelConsumptionCents)
    })

    it('hält je Heizkreis den Warmwasseranteil innerhalb des Heiztopfs', () => {
      for (const circuit of golden.heating.perCircuit) {
        expect(circuit.hotWaterCents).toBeGreaterThanOrEqual(0)
        expect(
          circuit.hotWaterCents,
          `Warmwasseranteil > Heiztopf bei ${circuit.buildingId}`,
        ).toBeLessThanOrEqual(circuit.heatingTotalCents)
      }
    })

    it('teilt je Heizkreis die CO₂-Kosten konsistent in Mieter/Vermieter', () => {
      const perCircuitTenant = golden.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.co2TenantCents,
        0,
      )
      const perCircuitLandlord = golden.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.co2LandlordCents,
        0,
      )
      expect(perCircuitTenant).toBe(golden.co2.tenantCents)
      expect(perCircuitLandlord).toBe(golden.co2.landlordCents)
      for (const circuit of golden.heating.perCircuit) {
        expect(
          circuit.co2TenantCents + circuit.co2LandlordCents,
          `CO₂-Kreisaufteilung weicht ab bei ${circuit.buildingId}`,
        ).toBe(circuit.co2CostCents)
      }
    })

    it('hält CO₂-Kennwert, CO₂-Menge und Energiemenge je Heizkreis plausibel', () => {
      for (const circuit of golden.heating.perCircuit) {
        // Kein CO₂ ohne Energie; keine Energie ohne (positive) Brennstoff-/
        // Verbrauchskosten — fängt vertauschte oder verlorene Detailwerte ab.
        if (circuit.co2Kg > 0) expect(circuit.energyKwh).toBeGreaterThan(0)
        if (circuit.co2CostCents > 0) expect(circuit.co2Kg).toBeGreaterThan(0)
        if (circuit.energyKwh > 0)
          expect(circuit.fuelConsumptionCents).toBeGreaterThan(0)
      }
    })

    // PR 06: die neue Core-Engine gegen die Golden-Werte pruefen.
    // Aktivieren, sobald `calculateBilling` (Masterplan 6.1) existiert;
    // Fälle über das neutrale Modul `cases.ts` (`characterizationCases()`)
    // beziehen und das VOLLSTÄNDIGE Ergebnis vergleichen — totals, heating,
    // co2, tenants und vacancyLandlordCents, nicht nur `totals`.
    it.todo(
      `PR 06: Engine-Ergebnis vollständig gegen Golden-Werte vergleichen (${id})`,
    )
  },
)
