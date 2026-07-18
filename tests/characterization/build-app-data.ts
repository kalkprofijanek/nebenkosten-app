/**
 * Scenario -> v4-Eingabe-Fixture (`AppDataFile`).
 *
 * Erzeugt aus der kompakten Szenariobeschreibung (`scenarios.json`) das
 * normalisierte Ziel-Datenmodell (Masterplan 5). Der Testrunner validiert
 * das Ergebnis gegen `appDataFileSchema`. Geldbetraege werden ausschliesslich
 * ueber `euroToCents` konvertiert (docs/MIGRATION.md, docs/ROUNDING.md).
 *
 * Diese Funktion ist bewusst exportiert, damit die Core-Engine (PR 06) die
 * identischen Eingaben verwenden kann, gegen die die Golden-Werte gelten.
 */
import {
  CURRENT_SCHEMA_VERSION,
  euroToCents,
  type AllocationScope,
  type AppDataFile,
  type BillingData,
  type Co2Config,
  type CostCategory,
  type EnergySource,
  type FuelDelivery,
  type FuelStock,
  type HeatingCircuit,
  type HeatingCircuitOverrides,
  type MasterData,
  type OccupancyPeriod,
  type Prepayment,
  type Quantity,
  type QuantityUnit,
  type Tenancy,
  type Unit,
} from '@nebenkosten/schema'
import type {
  Scenario,
  ScenarioAllocationKey,
  ScenarioCircuit,
  ScenarioCost,
  ScenarioScope,
  ScenarioTenant,
} from './types'

const PROPERTY_ID = 'prop-1'
const ORG_ID = 'org-1'
const OWNER_ID = 'oc-1'
const HEATING_SYSTEM_ID = 'hs-1'
const BILLING_PERIOD_ID = 'bp-1'

const ALLOCATION_KEY: Record<
  ScenarioAllocationKey,
  CostCategory['allocationKey']
> = {
  usable_area: 'usable_area',
  heated_area: 'heated_area',
  consumption_units: 'consumption_units',
  residential_units: 'residential_units',
  direct: 'direct',
}

const COST_KIND: Record<ScenarioCost['kind'], CostCategory['kind']> = {
  operating: 'operating',
  water: 'water',
  heating: 'heating',
}

function toScope(scope: ScenarioScope): AllocationScope {
  if (scope.kind === 'building')
    return { kind: 'building', buildingId: scope.buildingId }
  if (scope.kind === 'house')
    return { kind: 'house', houseKey: scope.houseKey.toUpperCase() }
  return { kind: 'property' }
}

function quantity(value: number, unit: QuantityUnit): Quantity {
  return { value, unit }
}

function toQuantityUnit(unit: string): QuantityUnit {
  const allowed: QuantityUnit[] = [
    'l',
    'kg',
    't',
    'kWh',
    'm3',
    'm2',
    'einheiten',
    'personen',
    'stueck',
  ]
  const found = allowed.find((candidate) => candidate === unit)
  if (!found) throw new Error(`Unbekannte Mengeneinheit im Szenario: ${unit}`)
  return found
}

function circuitId(buildingId: string): string {
  return `hc-${buildingId}`
}

function toCo2(circuit: ScenarioCircuit): Co2Config {
  const co2 = circuit.co2
  if (co2.mode === 'manual') {
    return {
      mode: 'manual',
      levyCents: euroToCents(co2.levyEur ?? 0),
      landlordSharePercent: co2.landlordPercent ?? 0,
      intensityKgPerSqmYear: co2.intensity ?? 0,
    }
  }
  return {
    mode: 'auto',
    co2FactorKgPerKwh: co2.factorKgPerKwh ?? undefined,
    co2PricePerTonCents: euroToCents(co2.pricePerTonEur ?? 0),
  }
}

function toOverrides(
  circuit: ScenarioCircuit,
): HeatingCircuitOverrides | undefined {
  const overrides = circuit.overrides
  if (!overrides) return undefined
  return {
    consumptionSharePercent: overrides.consumptionPercent,
    baseSharePercent: overrides.basePercent,
    operatingElectricitySharePercent: overrides.operatingElectricityPercent,
  }
}

function prefixOf(scenario: Scenario, buildingId: string): string {
  const building = scenario.buildings.find((item) => item.id === buildingId)
  return building?.mandatePrefixes[0] ?? buildingId
}

function toPrepayment(tenant: ScenarioTenant): Prepayment | null {
  const occupancyPeriodId = `op-${tenant.id}`
  const id = `pp-${tenant.id}`
  const prepay = tenant.prepay
  if (prepay.mode === 'monthly')
    return {
      id,
      occupancyPeriodId,
      mode: 'monthly',
      monthlyAmountCents: euroToCents(prepay.amountEur ?? 0),
    }
  if (prepay.mode === 'annual')
    return {
      id,
      occupancyPeriodId,
      mode: 'annual',
      annualAmountCents: euroToCents(prepay.amountEur ?? 0),
    }
  return { id, occupancyPeriodId, mode: 'none_agreed' }
}

function buildMasterData(scenario: Scenario): MasterData {
  const unitsById = new Map<string, Unit>()
  const tenancies: Tenancy[] = []
  const persons: MasterData['persons'] = []

  for (const tenant of scenario.tenants) {
    if (!unitsById.has(tenant.unitId)) {
      unitsById.set(tenant.unitId, {
        id: tenant.unitId,
        propertyId: PROPERTY_ID,
        buildingId: tenant.buildingId,
        label: `Einheit ${tenant.unitId}`,
        usableAreaSqm:
          tenant.usableAreaSqm != null
            ? quantity(tenant.usableAreaSqm, 'm2')
            : undefined,
        heatedAreaSqm:
          tenant.heatedAreaSqm != null
            ? quantity(tenant.heatedAreaSqm, 'm2')
            : undefined,
      })
    }
    if (tenant.kind === 'tenant') {
      persons.push({
        id: `p-${tenant.id}`,
        organizationId: ORG_ID,
        displayName: `Mieter ${tenant.id.toUpperCase()}`,
        companyOrPrivate: 'Privat',
      })
      tenancies.push({
        id: `ten-${tenant.id}`,
        unitId: tenant.unitId,
        personIds: [`p-${tenant.id}`],
        mandateReference: `${prefixOf(scenario, tenant.buildingId)}_${tenant.mandateSuffix}`,
        movedIn: tenant.from ?? undefined,
        movedOut: tenant.to ?? undefined,
      })
    }
  }

  return {
    organizations: [{ id: ORG_ID, name: 'Musterverwaltung' }],
    ownerCompanies: [
      {
        id: OWNER_ID,
        organizationId: ORG_ID,
        name: 'Mustermann Immobilien GmbH',
        additionalNameLines: [],
      },
    ],
    properties: [
      {
        id: PROPERTY_ID,
        ownerCompanyId: OWNER_ID,
        address: {
          street: 'Beispielangabe',
          postalCodeAndCity: '00000 Musterstadt',
        },
      },
    ],
    buildings: scenario.buildings.map((building) => ({
      id: building.id,
      propertyId: PROPERTY_ID,
      name: building.name,
      shortName: building.shortName,
      defaultEnergySourceType: building.energyType ?? undefined,
      mandateRefPrefixes: building.mandatePrefixes,
    })),
    units: [...unitsById.values()],
    persons,
    tenancies,
    allocationRules: [],
    heatingSystems:
      scenario.circuits.length > 0
        ? [
            {
              id: HEATING_SYSTEM_ID,
              propertyId: PROPERTY_ID,
              name: 'Heizanlage',
            },
          ]
        : [],
    meters: [],
  }
}

function buildBillingData(scenario: Scenario): BillingData {
  const occupancyPeriods: OccupancyPeriod[] = scenario.tenants.map(
    (tenant) => ({
      id: `op-${tenant.id}`,
      billingPeriodId: BILLING_PERIOD_ID,
      unitId: tenant.unitId,
      tenancyId: tenant.kind === 'tenant' ? `ten-${tenant.id}` : null,
      kind: tenant.kind,
      from: tenant.from ?? undefined,
      to: tenant.to ?? undefined,
      persons:
        tenant.persons != null
          ? quantity(tenant.persons, 'personen')
          : undefined,
      consumptionUnits:
        tenant.consumptionUnits != null
          ? quantity(tenant.consumptionUnits, 'einheiten')
          : undefined,
      consumptionUnitsEstimated: tenant.consumptionUnitsEstimated ?? undefined,
      applySection12Reduction: tenant.applyReduction ?? undefined,
      costScope: tenant.costScope ? toScope(tenant.costScope) : undefined,
    }),
  )

  const prepayments: Prepayment[] = scenario.tenants
    .map(toPrepayment)
    .filter((entry): entry is Prepayment => entry !== null)

  const costCategories: CostCategory[] = scenario.costs.map((cost) => ({
    id: cost.id,
    billingPeriodId: BILLING_PERIOD_ID,
    kind: COST_KIND[cost.kind],
    label: cost.label,
    statementText: cost.statementText,
    betrkvCategory: cost.betrkv,
    allocationKey: ALLOCATION_KEY[cost.allocationKey],
    scope: toScope(cost.scope),
    totalAmountCents: euroToCents(cost.amountEur),
    isOperatingElectricitySource: cost.operatingElectricitySource ?? undefined,
    hideWhenZero: cost.hideWhenZero ?? undefined,
    allocablePercent: cost.allocablePercent ?? undefined,
    laborSharePercent: cost.laborPercent ?? undefined,
  }))

  const heatingCircuits: HeatingCircuit[] = scenario.circuits.map(
    (circuit) => ({
      id: circuitId(circuit.buildingId),
      billingPeriodId: BILLING_PERIOD_ID,
      heatingSystemId: HEATING_SYSTEM_ID,
      buildingId: circuit.buildingId,
      co2: toCo2(circuit),
      overrides: toOverrides(circuit),
      hasCentralHotWater: circuit.hasCentralHotWater,
      hotWaterSharePercent: circuit.hotWaterPercent ?? undefined,
    }),
  )

  const energySources: EnergySource[] = []
  const fuelStocks: FuelStock[] = []
  const fuelDeliveries: FuelDelivery[] = []
  for (const circuit of scenario.circuits) {
    for (const source of circuit.sources) {
      const energySourceId = `es-${circuit.buildingId}-${source.key}`
      const openingUnit = toQuantityUnit(source.openingUnit ?? 'l')
      energySources.push({
        id: energySourceId,
        heatingCircuitId: circuitId(circuit.buildingId),
        key: source.key,
        name: source.name,
        sourceType: source.type,
        calorificValueKwhPerUnit: source.calorificKwh,
        co2FactorKgPerKwh: source.co2FactorKgPerKwh,
      })
      fuelStocks.push({
        id: `fs-${circuit.buildingId}-${source.key}`,
        energySourceId,
        billingPeriodId: BILLING_PERIOD_ID,
        openingQuantity: quantity(source.openingQuantity ?? 0, openingUnit),
        openingValueCents: euroToCents(source.openingValueEur ?? 0),
        remainingQuantity: quantity(source.remainingQuantity ?? 0, openingUnit),
      })
      source.deliveries.forEach((delivery, index) => {
        fuelDeliveries.push({
          id: `fd-${circuit.buildingId}-${source.key}-${index}`,
          energySourceId,
          billingPeriodId: BILLING_PERIOD_ID,
          date: delivery.date,
          quantity: quantity(delivery.quantity, toQuantityUnit(delivery.unit)),
          amountCents: euroToCents(delivery.amountEur),
        })
      })
    }
  }

  const totals = scenario.totals
  return {
    billingPeriods: [
      {
        id: BILLING_PERIOD_ID,
        propertyId: PROPERTY_ID,
        year: scenario.year,
        periodStart: scenario.from,
        periodEnd: scenario.to,
        status: 'DRAFT',
        heatingDefaults: {
          consumptionSharePercent: scenario.defaults.consumptionPercent,
          baseSharePercent: scenario.defaults.basePercent,
          baseCostAreaBasis:
            scenario.defaults.baseArea === 'usable'
              ? 'usable_area'
              : 'heated_area',
          operatingElectricitySharePercent:
            scenario.defaults.operatingElectricityPercent ?? 0,
        },
        totals: totals
          ? {
              usableAreaSqm:
                totals.usableAreaSqm != null
                  ? quantity(totals.usableAreaSqm, 'm2')
                  : undefined,
              heatedAreaSqm:
                totals.heatedAreaSqm != null
                  ? quantity(totals.heatedAreaSqm, 'm2')
                  : undefined,
              persons:
                totals.persons != null
                  ? quantity(totals.persons, 'personen')
                  : undefined,
              consumptionUnits:
                totals.consumptionUnits != null
                  ? quantity(totals.consumptionUnits, 'einheiten')
                  : undefined,
              residentialUnitCount:
                totals.residentialUnits != null
                  ? quantity(totals.residentialUnits, 'stueck')
                  : undefined,
            }
          : undefined,
      },
    ],
    occupancyPeriods,
    prepayments,
    costCategories,
    costEntries: [],
    bankBookings: [],
    heatingCircuits,
    energySources,
    fuelStocks,
    fuelDeliveries,
    meterReadings: [],
    meterBillingStatuses: [],
    calculationRuns: [],
    calculationResults: [],
    documents: [],
    auditEvents: [],
  }
}

/** Baut die vollstaendige, schema-gueltige v4-Eingabe-Fixture eines Szenarios. */
export function buildAppDataFile(scenario: Scenario): AppDataFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { appVersion: 'characterization-fixture' },
    masterData: buildMasterData(scenario),
    billingData: buildBillingData(scenario),
  }
}
