import type {
  AllocationScope,
  CostCategory,
  CostEntry,
  OccupancyPeriod,
  Quantity,
  Unit,
} from '@nebenkosten/schema'
import {
  CORE_SNAPSHOT_FORMAT_VERSION,
  HEATING_TRACE_FORMAT_VERSION,
  type CalculationInput,
  type CalculationOutput,
  type CircuitCo2Trace,
  type CircuitHeatingSplitTrace,
  type CircuitHotWaterAllocationTrace,
  type CircuitHotWaterCostSplit,
  type CircuitHotWaterDistributionTrace,
  SECTION_9A_ESTIMATED_AREA_LIMIT,
  type CircuitWarmWaterTrace,
  type OperatingPositionTrace,
  type TenantAllocationBasis,
  type TenantCostBreakdown,
  type TenantHotWaterBasis,
  type TenantSection35a,
} from '../contracts'
import { calculateOccupancyDays, calculatePeriodDays } from '../periods'
import {
  heatingBaseTimeFactor,
  withSection9bBaseFactors,
} from '../heating/section-9b'
import { calculatePrepaymentCents } from '../prepayments'
import { allocateLargestRemainder } from '../rest-cents'
import { roundCentsHalfAwayFromZero } from '../rounding'
import { calculateEnergySourceFuel } from '../heating/fuel'
import { calculateOperatingElectricityPlan } from '../heating/operating-electricity'
import { outputCircuit, outputCircuitTrace } from '../heating/output'
import {
  circuitEnergyInputKwh,
  hotWaterEnergyTrace,
  type HotWaterUnits,
} from '../heating/hot-water'
import { resolveMeteredConsumption } from '../metered-consumption'
import type {
  AllocationBasis,
  AggregateFuelResult,
  OccupancyContext,
  PreparedCircuit,
  RawCircuitResult,
  RawCostPosition,
} from './types'

function quantityValue(
  quantity: Readonly<Quantity> | null | undefined,
  expectedUnit?: string,
): number {
  if (!quantity) return 0
  if (expectedUnit && quantity.unit !== expectedUnit) {
    throw new Error(
      `Mengeneinheit "${quantity.unit}" passt nicht zu "${expectedUnit}"`,
    )
  }
  return quantity.value
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleUpperCase('en-US')
}

function resolveBuildingId(
  occupancy: Readonly<OccupancyPeriod>,
  unit: Readonly<Unit>,
): string | undefined {
  if (occupancy.costScope?.kind === 'building') {
    return occupancy.costScope.buildingId
  }
  return unit.buildingId ?? undefined
}

function buildOccupancyContexts(input: CalculationInput): OccupancyContext[] {
  const unitsById = new Map(input.units.map((unit) => [unit.id, unit]))
  const tenanciesById = new Map(
    input.tenancies.map((tenancy) => [tenancy.id, tenancy]),
  )
  const periodDays = calculatePeriodDays(
    input.billingPeriod.periodStart,
    input.billingPeriod.periodEnd,
  )

  const contexts = input.occupancyPeriods.map((occupancy) => {
    const unit = unitsById.get(occupancy.unitId)
    if (!unit) {
      throw new Error(
        `Nutzungszeitraum "${occupancy.id}" hat keine gültige Einheit`,
      )
    }
    const days = calculateOccupancyDays(
      input.billingPeriod.periodStart,
      input.billingPeriod.periodEnd,
      occupancy.from,
      occupancy.to,
    )
    return {
      occupancy,
      unit,
      tenancy:
        occupancy.tenancyId == null
          ? undefined
          : tenanciesById.get(occupancy.tenancyId),
      days,
      timeFactor: days / periodDays,
      buildingId: resolveBuildingId(occupancy, unit),
      usableArea: quantityValue(unit.usableAreaSqm),
      heatedArea:
        quantityValue(unit.heatedAreaSqm) || quantityValue(unit.usableAreaSqm),
      persons: quantityValue(occupancy.persons),
      consumptionUnits: quantityValue(occupancy.consumptionUnits),
    }
  })
  return withSection9bBaseFactors<OccupancyContext>(
    contexts,
    input.billingPeriod,
  )
}

function occupancyMatchesScope(
  context: OccupancyContext,
  scope: Readonly<AllocationScope> | null | undefined,
): boolean {
  if (!scope || scope.kind === 'property') return true
  if (scope.kind === 'building') {
    return (
      context.buildingId === scope.buildingId ||
      (context.occupancy.costScope?.kind === 'building' &&
        context.occupancy.costScope.buildingId === scope.buildingId)
    )
  }
  if (
    context.occupancy.costScope?.kind === 'house' &&
    normalizeKey(context.occupancy.costScope.houseKey) ===
      normalizeKey(scope.houseKey)
  ) {
    return true
  }
  return normalizeKey(context.tenancy?.mandateReference).startsWith(
    normalizeKey(scope.houseKey),
  )
}

function buildAllocationBasis(
  input: CalculationInput,
  contexts: readonly OccupancyContext[],
  scope?: Readonly<AllocationScope> | null,
): AllocationBasis {
  const selected = contexts.filter((context) =>
    occupancyMatchesScope(context, scope),
  )
  const calculated = selected.reduce<AllocationBasis>(
    (sum, context) => ({
      usableArea: sum.usableArea + context.usableArea * context.timeFactor,
      heatedArea: sum.heatedArea + context.heatedArea * context.timeFactor,
      persons: sum.persons + context.persons * context.timeFactor,
      consumptionUnits:
        sum.consumptionUnits +
        (context.occupancy.kind === 'vacancy' ? 0 : context.consumptionUnits),
      residentialUnits: sum.residentialUnits + context.timeFactor,
    }),
    {
      usableArea: 0,
      heatedArea: 0,
      persons: 0,
      consumptionUnits: 0,
      residentialUnits: 0,
    },
  )
  if (scope && scope.kind !== 'property') return calculated

  const totals = input.billingPeriod.totals
  return {
    usableArea:
      quantityValue(totals?.usableAreaSqm) > 0
        ? quantityValue(totals?.usableAreaSqm)
        : calculated.usableArea,
    heatedArea:
      quantityValue(totals?.heatedAreaSqm) > 0
        ? quantityValue(totals?.heatedAreaSqm)
        : quantityValue(totals?.usableAreaSqm) > 0
          ? quantityValue(totals?.usableAreaSqm)
          : calculated.heatedArea,
    persons:
      quantityValue(totals?.persons) > 0
        ? quantityValue(totals?.persons)
        : calculated.persons,
    consumptionUnits:
      quantityValue(totals?.consumptionUnits) > 0
        ? quantityValue(totals?.consumptionUnits)
        : calculated.consumptionUnits,
    residentialUnits:
      quantityValue(totals?.residentialUnitCount) > 0
        ? quantityValue(totals?.residentialUnitCount)
        : calculated.residentialUnits,
  }
}

function categoryAmount(
  category: Readonly<CostCategory>,
  entries: readonly Readonly<CostEntry>[],
): number {
  if (entries.length > 0) {
    return entries.reduce((sum, entry) => sum + entry.amountCents, 0)
  }
  return category.totalAmountCents ?? 0
}

function allocableFactor(
  category: Readonly<CostCategory>,
  entries: readonly Readonly<CostEntry>[],
): number {
  const nonZero = entries.filter((entry) => entry.amountCents !== 0)
  const absoluteTotal = nonZero.reduce(
    (sum, entry) => sum + Math.abs(entry.amountCents),
    0,
  )
  if (absoluteTotal > 0) {
    return (
      nonZero.reduce(
        (sum, entry) =>
          sum +
          Math.abs(entry.amountCents) * ((entry.allocablePercent ?? 100) / 100),
        0,
      ) / absoluteTotal
    )
  }
  return (category.allocablePercent ?? 100) / 100
}

function costPositions(
  input: CalculationInput,
  contexts: readonly OccupancyContext[],
): RawCostPosition[] {
  return input.costCategories.map((category) => {
    const entries = input.costEntries.filter(
      ({ costCategoryId }) => costCategoryId === category.id,
    )
    const amount = categoryAmount(category, entries)
    const effectiveAmount = amount * allocableFactor(category, entries)
    return {
      category,
      amount,
      effectiveAmount,
      freeLandlordAmount: amount - effectiveAmount,
      basis: buildAllocationBasis(input, contexts, category.scope),
    }
  })
}

function costShare(
  position: RawCostPosition,
  context: OccupancyContext,
  measuredKwhByOccupancy?: ReadonlyMap<string, number>,
  measuredKwhDenominatorByBuildingId?: ReadonlyMap<string, number>,
): number {
  if (!occupancyMatchesScope(context, position.category.scope)) return 0
  switch (position.category.allocationKey) {
    case 'usable_area':
      return position.basis.usableArea
        ? (position.effectiveAmount / position.basis.usableArea) *
            context.usableArea *
            context.timeFactor
        : 0
    case 'heated_area':
      return position.basis.heatedArea
        ? (position.effectiveAmount / position.basis.heatedArea) *
            context.heatedArea *
            context.timeFactor
        : 0
    case 'consumption_units':
      if (
        position.category.kind === 'heating' &&
        measuredKwhByOccupancy &&
        measuredKwhDenominatorByBuildingId?.has(context.buildingId ?? '')
      ) {
        const measured = measuredKwhByOccupancy.get(context.occupancy.id) ?? 0
        const denominator = measuredKwhDenominatorByBuildingId.get(
          context.buildingId ?? '',
        )!
        return denominator > 0
          ? (position.effectiveAmount / denominator) * measured
          : 0
      }
      return position.basis.consumptionUnits
        ? (position.effectiveAmount / position.basis.consumptionUnits) *
            context.consumptionUnits
        : 0
    case 'residential_units':
      return position.basis.residentialUnits
        ? (position.effectiveAmount / position.basis.residentialUnits) *
            context.timeFactor
        : 0
    case 'direct':
    case null:
    case undefined:
      return 0
  }
}

function isExcludedFromOperatingShare(category: Readonly<CostCategory>) {
  return Boolean(
    category.hideWhenZero && (category.totalAmountCents ?? 0) === 0,
  )
}

function positionDenominator(
  position: RawCostPosition,
): Pick<OperatingPositionTrace, 'denominator' | 'denominatorUnit'> {
  const { basis } = position
  switch (position.category.allocationKey) {
    case 'usable_area':
      return {
        denominator: roundQuantity(basis.usableArea, 3),
        denominatorUnit: 'm²',
      }
    case 'heated_area':
      return {
        denominator: roundQuantity(basis.heatedArea, 3),
        denominatorUnit: 'm²',
      }
    case 'consumption_units':
      return {
        denominator: roundQuantity(basis.consumptionUnits, 3),
        denominatorUnit: 'Einheiten',
      }
    case 'residential_units':
      return {
        denominator: roundQuantity(basis.residentialUnits, 3),
        denominatorUnit: 'WE',
      }
    default:
      return { denominator: null, denominatorUnit: null }
  }
}

/**
 * Legt die bereits berechneten Umlagegrößen je Kostenart offen (§ 259 BGB):
 * brutto, nicht umlagefähig, umlagefähig, Betriebsstrom-Umbuchung, Nenner
 * und Leerstandsanteil. Ohne Einfluss auf die verbindlichen Beträge.
 */
function operatingPositionTraces(
  originalPositions: readonly RawCostPosition[],
  positions: readonly RawCostPosition[],
  contexts: readonly OccupancyContext[],
): OperatingPositionTrace[] {
  return positions.map((position, index) => {
    const original = originalPositions[index]!
    const { category } = position
    const common = {
      costCategoryId: category.id,
      label: category.statementText ?? category.label,
      betrkvCategory: category.betrkvCategory ?? null,
      allocationKey: category.allocationKey ?? null,
      scope: category.scope ?? null,
      grossCents: roundCentsHalfAwayFromZero(position.amount),
    }
    if (category.betrkvCategory === 'NICHT_UML') {
      return {
        ...common,
        nonAllocableCents: common.grossCents,
        allocableCents: 0,
        operatingElectricityDeductedCents: 0,
        distributedCents: 0,
        distribution: 'not_allocable' as const,
        denominator: null,
        denominatorUnit: null,
        vacancyCents: 0,
      }
    }
    const amounts = {
      nonAllocableCents: roundCentsHalfAwayFromZero(
        original.freeLandlordAmount,
      ),
      allocableCents: roundCentsHalfAwayFromZero(original.effectiveAmount),
      operatingElectricityDeductedCents: roundCentsHalfAwayFromZero(
        original.effectiveAmount - position.effectiveAmount,
      ),
      distributedCents: roundCentsHalfAwayFromZero(position.effectiveAmount),
    }
    if (category.allocationKey === 'direct' || category.kind === 'heating') {
      return {
        ...common,
        ...amounts,
        distribution:
          category.allocationKey === 'direct'
            ? ('direct' as const)
            : ('heating_pool' as const),
        denominator: null,
        denominatorUnit: null,
        vacancyCents: 0,
      }
    }
    const tenantShares = isExcludedFromOperatingShare(category)
      ? 0
      : contexts
          .filter(({ occupancy }) => occupancy.kind !== 'vacancy')
          .reduce((sum, context) => sum + costShare(position, context), 0)
    return {
      ...common,
      ...amounts,
      distribution: 'key' as const,
      ...positionDenominator(position),
      vacancyCents: roundCentsHalfAwayFromZero(
        position.effectiveAmount - tenantShares,
      ),
    }
  })
}

function tenantAllocationBasis(
  context: OccupancyContext,
  measuredKwhByOccupancy: ReadonlyMap<string, number>,
  measuredBuildingIds: ReadonlySet<string>,
): TenantAllocationBasis {
  const metered = measuredBuildingIds.has(context.buildingId ?? '')
  return {
    buildingId: context.buildingId ?? null,
    usableAreaSqm: roundQuantity(context.usableArea, 3),
    heatedAreaSqm: roundQuantity(context.heatedArea, 3),
    persons: roundQuantity(context.persons, 3),
    consumption: roundQuantity(
      metered
        ? (measuredKwhByOccupancy.get(context.occupancy.id) ?? 0)
        : context.consumptionUnits,
      3,
    ),
    consumptionUnit: metered ? 'kWh' : 'Einheiten',
  }
}

function co2TenantFactor(intensity: number): number {
  if (intensity < 12) return 1
  if (intensity < 17) return 0.9
  if (intensity < 22) return 0.8
  if (intensity < 27) return 0.7
  if (intensity < 32) return 0.6
  if (intensity < 37) return 0.5
  if (intensity < 42) return 0.4
  if (intensity < 47) return 0.3
  if (intensity < 52) return 0.2
  return 0.05
}

function co2Tier(intensity: number): number {
  if (intensity < 12) return 1
  if (intensity < 17) return 2
  if (intensity < 22) return 3
  if (intensity < 27) return 4
  if (intensity < 32) return 5
  if (intensity < 37) return 6
  if (intensity < 42) return 7
  if (intensity < 47) return 8
  if (intensity < 52) return 9
  return 10
}

function roundQuantity(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function prepareCircuits(
  input: CalculationInput,
  contexts: readonly OccupancyContext[],
): PreparedCircuit[] {
  return input.buildings.map((building) => {
    const circuit = input.heatingCircuits.find(
      ({ buildingId }) => buildingId === building.id,
    )
    const circuitContexts = contexts.filter(
      ({ buildingId }) => buildingId === building.id,
    )
    const sources = circuit
      ? input.energySources.filter(
          ({ heatingCircuitId }) => heatingCircuitId === circuit.id,
        )
      : []
    // CO₂-Preis des Abrechnungsjahres (nur Modus auto, wie bisher 45 €/t
    // als Vorgabe); Grundlage der Los-Bewertung nach ADR-0010 (A12).
    const yearCo2Price =
      circuit?.co2?.mode === 'manual'
        ? null
        : (circuit?.co2?.co2PricePerTonCents ?? 4_500)
    const summed = sources.reduce<
      Omit<AggregateFuelResult, 'co2CostByLots'> & {
        co2LotSources: { co2KgRaw: number; costRaw: number | null }[]
      }
    >(
      (sum, source) => {
        const result = calculateEnergySourceFuel(
          source,
          input.fuelStocks,
          input.fuelDeliveries,
          circuit?.co2?.co2FactorKgPerKwh ?? 0,
          { co2PricePerTonCents: yearCo2Price },
        )
        return {
          fullCost: sum.fullCost + result.fullCostCentsRaw,
          energyKwh: sum.energyKwh + result.energyKwhRaw,
          co2Kg: sum.co2Kg + result.co2KgRaw,
          co2LotSources: [
            ...sum.co2LotSources,
            { co2KgRaw: result.co2KgRaw, costRaw: result.co2CostCentsRaw },
          ],
          sources: [...sum.sources, result.trace],
        }
      },
      { fullCost: 0, energyKwh: 0, co2Kg: 0, co2LotSources: [], sources: [] },
    )
    // Nur wenn ein Los einen eigenen CO₂-Preis trägt, werden die Kosten je
    // Los summiert (Quellen ohne eigenen Preis: Emissionen × Jahrespreis).
    const co2CostByLots =
      yearCo2Price != null &&
      summed.co2LotSources.some(({ costRaw }) => costRaw !== null)
        ? summed.co2LotSources.reduce(
            (sum, { co2KgRaw, costRaw }) =>
              sum + (costRaw ?? (co2KgRaw / 1_000) * yearCo2Price),
            0,
          )
        : null
    const fuel: AggregateFuelResult = {
      fullCost: summed.fullCost,
      energyKwh: summed.energyKwh,
      co2Kg: summed.co2Kg,
      co2CostByLots,
      sources: summed.sources,
    }
    return { buildingId: building.id, circuit, contexts: circuitContexts, fuel }
  })
}

function rawCircuitResults(
  input: CalculationInput,
  preparedCircuits: readonly PreparedCircuit[],
  positions: readonly RawCostPosition[],
  periodDays: number,
  operatingElectricityByBuildingId: ReadonlyMap<string, number>,
  measuredKwhDenominatorByBuildingId?: ReadonlyMap<string, number>,
): RawCircuitResult[] {
  const defaults = input.billingPeriod.heatingDefaults
  return preparedCircuits.map(
    ({ buildingId, circuit, contexts: circuitContexts, fuel }) => {
      const basis = buildAllocationBasis(input, circuitContexts, {
        kind: 'building',
        buildingId,
      })
      // Trägt ein Leerstand Heizverbrauch (z. B. nach Gradtagszahlen
      // aufgeteilt, § 9b HeizKV), wird er ihm auch berechnet – dann muss er
      // im Nenner stehen, sonst wird mehr verteilt als angefallen ist.
      const vacancyConsumptionUnits = circuitContexts
        .filter(
          (context) =>
            context.occupancy.kind === 'vacancy' &&
            occupancyMatchesScope(context, { kind: 'building', buildingId }),
        )
        .reduce((sum, context) => sum + context.consumptionUnits, 0)
      const consumptionDenominator =
        measuredKwhDenominatorByBuildingId?.get(buildingId) ??
        basis.consumptionUnits + vacancyConsumptionUnits
      const heatedArea = basis.heatedArea
      const automaticIntensity =
        heatedArea > 0 ? (fuel.co2Kg * (365 / periodDays)) / heatedArea : 0
      const co2Config = circuit?.co2
      const manual = co2Config?.mode === 'manual'
      const co2Cost = manual
        ? (co2Config.levyCents ?? 0)
        : (fuel.co2CostByLots ??
          (fuel.co2Kg / 1_000) * (co2Config?.co2PricePerTonCents ?? 4_500))
      const intensity = manual
        ? (co2Config.intensityKgPerSqmYear ?? 0)
        : automaticIntensity
      const tenantFactor = manual
        ? 1 - (co2Config.landlordSharePercent ?? 0) / 100
        : co2TenantFactor(intensity)
      const co2Tenant = co2Cost * tenantFactor
      const co2Landlord = co2Cost - co2Tenant
      const fuelConsumption = Math.max(0, fuel.fullCost - co2Cost)
      // § 9 Abs. 2/3 HeizKV (ADR-0010): Anteil s aus der Wärmemenge Q; ohne
      // `hotWaterEnergy` bzw. ohne bekannten Energieeinsatz bisheriger
      // Pauschalanteil `hotWaterSharePercent`.
      const hotWaterEnergy =
        circuit?.hasCentralHotWater && circuit.hotWaterEnergy
          ? hotWaterEnergyTrace(
              circuit.hotWaterEnergy,
              circuitUsableAreaSqm(circuitContexts),
              circuitEnergyInputKwh(fuel.energyKwh, fuel.sources),
            )
          : undefined
      const hotWaterSection9Share =
        hotWaterEnergy && !hotWaterEnergy.energyInputMissing
          ? hotWaterEnergy.shareExact
          : null
      const hotWaterShare = circuit?.hasCentralHotWater
        ? (hotWaterSection9Share ?? (circuit.hotWaterSharePercent ?? 18) / 100)
        : 0
      const hotWaterFuel = fuelConsumption * hotWaterShare
      const heatingOperating = positions
        .filter(
          ({ category }) =>
            category.kind === 'heating' &&
            category.scope?.kind === 'building' &&
            category.scope.buildingId === buildingId,
        )
        .reduce((sum, position) => sum + position.effectiveAmount, 0)
      const operatingElectricityShare =
        (circuit?.overrides?.operatingElectricitySharePercent ??
          defaults?.operatingElectricitySharePercent ??
          0) / 100
      const operatingElectricityIntended =
        fuelConsumption * operatingElectricityShare
      const operatingElectricity =
        operatingElectricityByBuildingId.get(buildingId) ?? 0
      // § 9 Abs. 1 HeizKV: Die einheitlich entstandenen Kosten des Betriebs
      // (Betriebsstrom, Wartung, Messdienst u. a.) werden mit demselben
      // Anteil s aufgeteilt; im Pauschalverfahren bleiben sie Heizkosten.
      const hotWaterElectricity =
        hotWaterSection9Share === null
          ? 0
          : operatingElectricity * hotWaterSection9Share
      const hotWaterOperating =
        hotWaterSection9Share === null
          ? 0
          : heatingOperating * hotWaterSection9Share
      const hotWater = hotWaterFuel + hotWaterElectricity + hotWaterOperating
      const heatingTotal =
        fuelConsumption - hotWater + heatingOperating + operatingElectricity
      const estimatedAreaShare = measuredKwhDenominatorByBuildingId?.has(
        buildingId,
      )
        ? 0
        : estimatedHeatedAreaShare(circuitContexts)
      // § 9a Abs. 2 HeizKV: Ist für mehr als 25 % der beheizten Fläche der
      // Verbrauch nicht ordnungsgemäß erfasst (hier: geschätzt), sind die
      // Kosten ausschließlich nach der Fläche zu verteilen.
      const areaOnlySection9a =
        estimatedAreaShare > SECTION_9A_ESTIMATED_AREA_LIMIT
      const consumptionFactor = areaOnlySection9a
        ? 0
        : (circuit?.overrides?.consumptionSharePercent ??
            defaults?.consumptionSharePercent ??
            70) / 100
      const baseFactor = areaOnlySection9a
        ? 1
        : (circuit?.overrides?.baseSharePercent ??
            defaults?.baseSharePercent ??
            30) / 100
      const baseCosts = heatingTotal * baseFactor
      const consumptionCosts = heatingTotal * consumptionFactor
      const useUsableArea = defaults?.baseCostAreaBasis === 'usable_area'
      const baseDenominator = useUsableArea
        ? basis.usableArea
        : basis.heatedArea
      const fallbackOccupancyIds = circuit?.hasCentralHotWater
        ? circuitContexts
            .filter(
              ({ occupancy, persons }) =>
                occupancy.kind !== 'vacancy' && persons <= 0,
            )
            .map(({ occupancy }) => occupancy.id)
        : []
      const calculatedHotWaterPersons = circuitContexts.reduce(
        (sum, context) => {
          if (context.occupancy.kind === 'vacancy') return sum
          return (
            sum +
            (context.persons > 0 ? context.persons : 1) * context.timeFactor
          )
        },
        0,
      )
      const hotWaterPersons = circuit?.hasCentralHotWater
        ? calculatedHotWaterPersons || 1
        : 0
      // CO2KostAufG § 7 Abs. 1: Mieteranteil nach den Schlüsseln für
      // Heizung und Warmwasser getrennt (nur im § 9-Verfahren).
      const hotWaterCo2Tenant =
        hotWaterSection9Share === null ? 0 : co2Tenant * hotWaterSection9Share
      const co2TenantHeating = co2Tenant - hotWaterCo2Tenant
      const hotWaterAllocation = hotWaterAllocationPlan(
        circuit,
        circuitContexts.filter((context) =>
          occupancyMatchesScope(context, { kind: 'building', buildingId }),
        ),
        useUsableArea ? 'usable_area' : 'heated_area',
        baseDenominator,
        hotWaterPersons,
        hotWater,
        hotWaterCo2Tenant,
      )
      const roundedCo2Split = new Map(
        allocateLargestRemainder([
          { id: 'tenant', exactCents: co2Tenant },
          { id: 'landlord', exactCents: co2Landlord },
        ]).map(({ id, cents }) => [id, cents]),
      )
      const co2Trace: CircuitCo2Trace = {
        mode: manual ? 'manual' : 'auto',
        pricePerTonCents: manual
          ? (co2Config.co2PricePerTonCents ?? null)
          : (co2Config?.co2PricePerTonCents ?? 4_500),
        heatedAreaSqm: roundQuantity(heatedArea, 3),
        periodDays,
        annualizationFactor: roundQuantity(365 / periodDays, 6),
        intensityKgPerSqmYear: roundQuantity(intensity, 3),
        tier: manual ? 'manual' : co2Tier(intensity),
        tenantPercent: roundQuantity(tenantFactor * 100, 3),
        landlordPercent: roundQuantity((1 - tenantFactor) * 100, 3),
        totalCents: roundCentsHalfAwayFromZero(co2Cost),
        tenantCents: roundedCo2Split.get('tenant')!,
        landlordCents: roundedCo2Split.get('landlord')!,
      }
      const byPersons = hotWaterAllocation.key === 'persons'
      const warmWaterTrace: CircuitWarmWaterTrace = {
        method: !circuit?.hasCentralHotWater
          ? 'none'
          : hotWaterSection9Share !== null
            ? 'section9_energy'
            : byPersons
              ? 'fuel_percentage_by_persons'
              : 'fuel_percentage',
        sharePercent: circuit?.hasCentralHotWater
          ? roundQuantity(hotWaterShare * 100, 3)
          : 0,
        poolCents: roundCentsHalfAwayFromZero(hotWater),
        personTimeDenominator:
          circuit?.hasCentralHotWater && byPersons
            ? roundQuantity(hotWaterPersons, 3)
            : 0,
        fallbackOccupancyIds: byPersons ? fallbackOccupancyIds : [],
        ...(circuit?.hasCentralHotWater
          ? {
              ...(hotWaterEnergy ? { energy: hotWaterEnergy } : {}),
              ...(hotWaterSection9Share === null
                ? {}
                : {
                    costSplit: hotWaterCostSplit(
                      hotWaterFuel,
                      hotWaterElectricity,
                      hotWaterOperating,
                      hotWaterCo2Tenant,
                    ),
                  }),
              allocation: hotWaterAllocation.trace,
            }
          : {}),
      }
      const roundedHeatingSplit = new Map(
        allocateLargestRemainder([
          { id: 'base', exactCents: baseCosts },
          { id: 'consumption', exactCents: consumptionCosts },
        ]).map(({ id, cents }) => [id, cents]),
      )
      const splitTrace: CircuitHeatingSplitTrace = {
        baseSharePercent: roundQuantity(baseFactor * 100, 3),
        consumptionSharePercent: roundQuantity(consumptionFactor * 100, 3),
        baseAreaBasis: useUsableArea ? 'usable_area' : 'heated_area',
        baseDenominator: roundQuantity(baseDenominator, 3),
        consumptionDenominator: roundQuantity(consumptionDenominator, 3),
        baseCents: roundedHeatingSplit.get('base')!,
        consumptionCents: roundedHeatingSplit.get('consumption')!,
        estimatedAreaSharePercent: roundQuantity(estimatedAreaShare * 100, 3),
        areaOnlySection9a,
      }
      return {
        buildingId,
        heatingCircuitId: circuit?.id ?? null,
        heatingTotal,
        baseCosts,
        consumptionCosts,
        fuelConsumption,
        hotWater,
        co2Cost,
        co2Tenant,
        co2Landlord,
        co2TenantPercent: tenantFactor * 100,
        co2Intensity: intensity,
        co2Kg: manual ? 0 : fuel.co2Kg,
        energyKwh: fuel.energyKwh,
        basePrice: baseDenominator > 0 ? baseCosts / baseDenominator : 0,
        consumptionPrice:
          consumptionDenominator > 0
            ? consumptionCosts / consumptionDenominator
            : 0,
        hotWaterPricePerPerson:
          byPersons && hotWaterPersons > 0 ? hotWater / hotWaterPersons : 0,
        // CO2-Mieteranteil nach dem Heizkreis-Schlüssel wie die
        // Brennstoffkosten (Vermieterentscheidung, siehe docs/HEATING-CO2.md);
        // im § 9-Verfahren nur der Heizungsanteil (1 − s).
        co2BasePrice:
          baseDenominator > 0
            ? (co2TenantHeating * baseFactor) / baseDenominator
            : 0,
        co2ConsumptionPrice:
          consumptionDenominator > 0
            ? (co2TenantHeating * consumptionFactor) / consumptionDenominator
            : 0,
        energySources: fuel.sources,
        co2Trace,
        warmWaterTrace,
        heatingOperating,
        operatingElectricity,
        operatingElectricityIntended,
        splitTrace,
        areaOnlySection9a,
        operatingElectricitySharePercent: operatingElectricityShare * 100,
        hotWaterKey: hotWaterAllocation.key,
        hotWaterExtended: Boolean(
          circuit?.hasCentralHotWater &&
          (circuit.hotWaterEnergy || circuit.hotWaterAllocation),
        ),
        hotWaterSection9Share,
        hotWaterCo2Tenant,
        hotWaterAreaPrice: hotWaterAllocation.areaPrice,
        hotWaterM3Price: hotWaterAllocation.m3Price,
        co2HotWaterPricePerPerson: hotWaterAllocation.co2PricePerPerson,
        co2HotWaterAreaPrice: hotWaterAllocation.co2AreaPrice,
        co2HotWaterM3Price: hotWaterAllocation.co2M3Price,
      }
    },
  )
}

/**
 * Wohnfläche der Einheiten eines Heizkreises (jede Einheit einmal) als
 * Ersatz für A_Wohn der Flächenformel nach § 9 Abs. 2 HeizKV.
 */
function circuitUsableAreaSqm(contexts: readonly OccupancyContext[]): number {
  const byUnit = new Map<string, number>()
  for (const context of contexts)
    byUnit.set(context.unit.id, context.usableArea)
  return [...byUnit.values()].reduce((sum, area) => sum + area, 0)
}

/** Warmwasseranteile je Kostenart, Restcent nach größtem Rest (§ 9 Abs. 1). */
function hotWaterCostSplit(
  fuel: number,
  operatingElectricity: number,
  heatingOperating: number,
  co2Tenant: number,
): CircuitHotWaterCostSplit {
  const split = new Map(
    allocateLargestRemainder([
      { id: 'fuel', exactCents: fuel },
      { id: 'operatingElectricity', exactCents: operatingElectricity },
      { id: 'heatingOperating', exactCents: heatingOperating },
    ]).map(({ id, cents }) => [id, cents]),
  )
  return {
    fuelCents: split.get('fuel')!,
    operatingElectricityCents: split.get('operatingElectricity')!,
    heatingOperatingCents: split.get('heatingOperating')!,
    co2TenantCents: roundCentsHalfAwayFromZero(co2Tenant),
  }
}

interface HotWaterAllocationPlan {
  key: 'persons' | 'area' | 'consumption'
  areaPrice: number
  m3Price: number
  co2PricePerPerson: number
  co2AreaPrice: number
  co2M3Price: number
  trace: CircuitHotWaterAllocationTrace
}

/**
 * Schlüssel der Warmwasserkosten nach § 8 Abs. 1 HeizKV (ADR-0010):
 * `consumption` = Anteil nach erfasstem Warmwasser (m³), Rest nach Fläche
 * × Zeitanteil wie der Grundkostenschlüssel; `area` = vollständig nach
 * Fläche × Zeitanteil; `persons` (leer) = bisher nach Personen × Zeitanteil.
 * Bei Fläche und Verbrauch trägt ein Leerstand seinen Anteil (Vermieter).
 */
function hotWaterAllocationPlan(
  circuit: PreparedCircuit['circuit'],
  contexts: readonly OccupancyContext[],
  areaBasis: 'usable_area' | 'heated_area',
  areaTimeDenominator: number,
  personTimeDenominator: number,
  hotWater: number,
  hotWaterCo2Tenant: number,
): HotWaterAllocationPlan {
  const key = circuit?.hotWaterAllocation?.key ?? 'persons'
  if (key === 'persons') {
    return {
      key,
      areaPrice: 0,
      m3Price: 0,
      co2PricePerPerson:
        personTimeDenominator > 0
          ? hotWaterCo2Tenant / personTimeDenominator
          : 0,
      co2AreaPrice: 0,
      co2M3Price: 0,
      trace: {
        key,
        consumptionSharePercent: 0,
        areaBasis,
        areaTimeDenominator: null,
        warmWaterM3Denominator: null,
        personTimeDenominator,
        areaCents: 0,
        consumptionCents: 0,
        consumptionFallbackToArea: false,
      },
    }
  }
  const warmWaterM3Denominator = contexts.reduce(
    (sum, context) => sum + quantityValue(context.occupancy.warmWater),
    0,
  )
  // Offene Entscheidung: Ohne erfassten Warmwasserverbrauch wird ersatzweise
  // vollständig nach Fläche verteilt (die Prüfung meldet einen Fehler).
  const consumptionFallbackToArea =
    key === 'consumption' && !(warmWaterM3Denominator > 0)
  const consumptionFraction =
    key === 'consumption' && !consumptionFallbackToArea
      ? (circuit?.hotWaterAllocation?.consumptionSharePercent ?? 70) / 100
      : 0
  const areaFraction = 1 - consumptionFraction
  const perArea = (amount: number) =>
    areaTimeDenominator > 0 ? (amount * areaFraction) / areaTimeDenominator : 0
  const perM3 = (amount: number) =>
    consumptionFraction > 0
      ? (amount * consumptionFraction) / warmWaterM3Denominator
      : 0
  const parts = new Map(
    allocateLargestRemainder([
      { id: 'area', exactCents: hotWater * areaFraction },
      { id: 'consumption', exactCents: hotWater * consumptionFraction },
    ]).map(({ id, cents }) => [id, cents]),
  )
  return {
    key,
    areaPrice: perArea(hotWater),
    m3Price: perM3(hotWater),
    co2PricePerPerson: 0,
    co2AreaPrice: perArea(hotWaterCo2Tenant),
    co2M3Price: perM3(hotWaterCo2Tenant),
    trace: {
      key,
      consumptionSharePercent: roundQuantity(consumptionFraction * 100, 3),
      areaBasis,
      areaTimeDenominator,
      warmWaterM3Denominator:
        key === 'consumption' ? warmWaterM3Denominator : null,
      personTimeDenominator: null,
      areaCents: parts.get('area')!,
      consumptionCents: parts.get('consumption')!,
      consumptionFallbackToArea,
    },
  }
}

/** Bezugsgrößen einer Nutzung für die Warmwasserverteilung (ungerundet). */
function hotWaterUnitsOf(
  context: OccupancyContext,
  baseArea: number,
): HotWaterUnits {
  return {
    personTime:
      context.occupancy.kind === 'vacancy'
        ? 0
        : (context.persons > 0 ? context.persons : 1) * context.timeFactor,
    areaTime: baseArea * context.timeFactor,
    warmWaterM3: quantityValue(context.occupancy.warmWater),
  }
}

/**
 * Warmwasserkosten und CO2-Warmwasseranteil einer Nutzung (ungerundet, vor
 * einer Kürzung nach § 12 HeizKV). Beim Personenschlüssel unverändert
 * `Preis × Personen × Zeitfaktor` wie bisher.
 */
function rawHotWater(
  circuit: RawCircuitResult,
  context: OccupancyContext,
  baseArea: number,
): { cost: number; co2: number } {
  if (circuit.hotWaterKey === 'persons') {
    const persons =
      context.occupancy.kind === 'vacancy'
        ? 0
        : context.persons > 0
          ? context.persons
          : 1
    return {
      cost: circuit.hotWaterPricePerPerson * persons * context.timeFactor,
      co2: circuit.co2HotWaterPricePerPerson * persons * context.timeFactor,
    }
  }
  const units = hotWaterUnitsOf(context, baseArea)
  return {
    cost:
      circuit.hotWaterAreaPrice * units.areaTime +
      circuit.hotWaterM3Price * units.warmWaterM3,
    co2:
      circuit.co2HotWaterAreaPrice * units.areaTime +
      circuit.co2HotWaterM3Price * units.warmWaterM3,
  }
}

/** § 12 Abs. 1 HeizKV: Kürzung um 15 % (Bedingungen wie bisher). */
function section12Factor(
  context: OccupancyContext,
  circuit: RawCircuitResult,
  isMeteredOccupancy: boolean,
): number {
  return context.occupancy.applySection12Reduction &&
    !isMeteredOccupancy &&
    !circuit.areaOnlySection9a &&
    context.occupancy.consumptionUnitsEstimated
    ? 0.85
    : 1
}

/**
 * Zeitanteiliger Anteil der beheizten Fläche von Mieter-Nutzungen mit als
 * geschätzt gekennzeichnetem Verbrauch (§ 9a HeizKV); Leerstände zählen
 * nicht, weil für sie im manuellen Modus kein Verbrauch erfasst wird.
 */
function estimatedHeatedAreaShare(
  contexts: readonly OccupancyContext[],
): number {
  let total = 0
  let estimated = 0
  for (const context of contexts) {
    if (context.occupancy.kind === 'vacancy') continue
    const weight = context.heatedArea * context.timeFactor
    total += weight
    if (context.occupancy.consumptionUnitsEstimated) estimated += weight
  }
  return total > 0 ? estimated / total : 0
}

function rawTenantShare(
  context: OccupancyContext,
  positions: readonly RawCostPosition[],
  circuits: readonly RawCircuitResult[],
  defaultsBasis: 'usable_area' | 'heated_area',
  measuredKwhByOccupancy?: ReadonlyMap<string, number>,
  measuredKwhDenominatorByBuildingId?: ReadonlyMap<string, number>,
): number {
  const circuit = circuits.find(
    ({ buildingId }) => buildingId === context.buildingId,
  )
  const isMeteredOccupancy = Boolean(
    circuit &&
    measuredKwhDenominatorByBuildingId?.has(context.buildingId ?? ''),
  )
  const operating = positions
    .filter(
      ({ category }) =>
        category.kind !== 'heating' &&
        category.betrkvCategory !== 'NICHT_UML' &&
        category.allocationKey !== 'direct' &&
        !isExcludedFromOperatingShare(category),
    )
    .reduce(
      (sum, position) =>
        sum +
        costShare(
          position,
          context,
          isMeteredOccupancy ? measuredKwhByOccupancy : undefined,
          measuredKwhDenominatorByBuildingId,
        ),
      0,
    )
  if (!circuit) return operating
  const baseArea =
    defaultsBasis === 'usable_area' ? context.usableArea : context.heatedArea
  let heating =
    circuit.basePrice * baseArea * heatingBaseTimeFactor(context) +
    circuit.consumptionPrice *
      (isMeteredOccupancy
        ? measuredKwhByOccupancy!.get(context.occupancy.id)!
        : context.consumptionUnits)
  const hotWater = rawHotWater(circuit, context, baseArea)
  heating += hotWater.cost
  // § 12 HeizKV gilt nicht, wenn nach § 9a Abs. 2 HeizKV zulässig nur nach
  // Fläche verteilt wird.
  if (
    !isMeteredOccupancy &&
    !circuit.areaOnlySection9a &&
    context.occupancy.consumptionUnitsEstimated &&
    context.occupancy.applySection12Reduction
  ) {
    heating *= 0.85
  }
  const co2 =
    circuit.co2BasePrice * baseArea * heatingBaseTimeFactor(context) +
    circuit.co2ConsumptionPrice *
      (isMeteredOccupancy
        ? measuredKwhByOccupancy!.get(context.occupancy.id)!
        : context.consumptionUnits)
  return (
    operating +
    heating +
    (circuit.hotWaterSection9Share === null ? co2 : co2 + hotWater.co2)
  )
}

/**
 * § 35a EStG: Lohnanteil je Kostenart, der auf diesen Nutzer entfällt
 * (Legacy `lohn35a`). Betriebs- und Wasserkosten: Anteil des Nutzers ×
 * Lohnanteil der Kostenart. Heizungs-Betriebskosten des Heizkreises:
 * umlagefähiger Betrag × Lohnanteil × Anteil des Nutzers an Grund- und
 * Verbrauchskosten (ohne Kürzung nach § 12 HeizKV, wie Legacy).
 */
function rawTenantSection35a(
  context: OccupancyContext,
  positions: readonly RawCostPosition[],
  circuits: readonly RawCircuitResult[],
  defaultsBasis: 'usable_area' | 'heated_area',
  measuredKwhByOccupancy?: ReadonlyMap<string, number>,
  measuredKwhDenominatorByBuildingId?: ReadonlyMap<string, number>,
): TenantSection35a {
  const laborPercent = (position: RawCostPosition) =>
    (position.category.laborSharePercent ?? 0) / 100
  const circuit = circuits.find(
    ({ buildingId }) => buildingId === context.buildingId,
  )
  const isMeteredOccupancy = Boolean(
    circuit &&
    measuredKwhDenominatorByBuildingId?.has(context.buildingId ?? ''),
  )
  const exactItems = positions
    .filter(
      (position) =>
        laborPercent(position) > 0 &&
        position.category.kind !== 'heating' &&
        position.category.betrkvCategory !== 'NICHT_UML' &&
        position.category.allocationKey !== 'direct' &&
        !isExcludedFromOperatingShare(position.category),
    )
    .map((position) => ({
      costCategoryId: position.category.id,
      exactCents:
        costShare(
          position,
          context,
          isMeteredOccupancy ? measuredKwhByOccupancy : undefined,
          measuredKwhDenominatorByBuildingId,
        ) * laborPercent(position),
    }))
  if (circuit && circuit.heatingTotal > 0) {
    const baseArea =
      defaultsBasis === 'usable_area' ? context.usableArea : context.heatedArea
    const tenantHeating =
      circuit.basePrice * baseArea * heatingBaseTimeFactor(context) +
      circuit.consumptionPrice *
        (isMeteredOccupancy
          ? (measuredKwhByOccupancy!.get(context.occupancy.id) ?? 0)
          : context.consumptionUnits)
    const heatingFraction = tenantHeating / circuit.heatingTotal
    // § 9 Abs. 1 HeizKV: Im § 9-Verfahren trägt der Warmwasseranteil s der
    // Heizungs-Betriebskosten den Warmwasserschlüssel.
    const share = circuit.hotWaterSection9Share
    const tenantFraction =
      share === null
        ? heatingFraction
        : (1 - share) * heatingFraction +
          (circuit.hotWater > 0
            ? share *
              (rawHotWater(circuit, context, baseArea).cost / circuit.hotWater)
            : 0)
    for (const position of positions) {
      if (
        laborPercent(position) > 0 &&
        position.category.kind === 'heating' &&
        position.category.scope?.kind === 'building' &&
        position.category.scope.buildingId === circuit.buildingId
      ) {
        exactItems.push({
          costCategoryId: position.category.id,
          exactCents:
            position.effectiveAmount * laborPercent(position) * tenantFraction,
        })
      }
    }
  }
  const items = exactItems
    .map(({ costCategoryId, exactCents }) => ({
      costCategoryId,
      laborCents: roundCentsHalfAwayFromZero(exactCents),
    }))
    .filter(({ laborCents }) => laborCents !== 0)
  return {
    totalCents: roundCentsHalfAwayFromZero(
      exactItems.reduce((sum, { exactCents }) => sum + exactCents, 0),
    ),
    items,
  }
}

/**
 * Zusätzliche, rein informative Aufschlüsselung je Mieter für die
 * Einzelabrechnung (PR 11). Berechnet unabhängig von `rawTenantShare` und
 * hat keinerlei Einfluss auf `shareCents`/`balanceCents` oder die
 * Restcent-Verteilung — Einzelposten können daher in Summe geringfügig von
 * der (verbindlichen) Gesamtsumme abweichen, wie bei jeder Einzelrundung.
 */
function rawTenantShareBreakdown(
  context: OccupancyContext,
  positions: readonly RawCostPosition[],
  circuits: readonly RawCircuitResult[],
  defaultsBasis: 'usable_area' | 'heated_area',
  measuredKwhByOccupancy?: ReadonlyMap<string, number>,
  measuredKwhDenominatorByBuildingId?: ReadonlyMap<string, number>,
): TenantCostBreakdown {
  const circuit = circuits.find(
    ({ buildingId }) => buildingId === context.buildingId,
  )
  const isMeteredOccupancy = Boolean(
    circuit &&
    measuredKwhDenominatorByBuildingId?.has(context.buildingId ?? ''),
  )
  const operatingByCategory = positions
    .filter(
      ({ category }) =>
        category.kind !== 'heating' &&
        category.betrkvCategory !== 'NICHT_UML' &&
        category.allocationKey !== 'direct' &&
        !isExcludedFromOperatingShare(category),
    )
    .map((position) => ({
      costCategoryId: position.category.id,
      amountCents: roundCentsHalfAwayFromZero(
        costShare(
          position,
          context,
          isMeteredOccupancy ? measuredKwhByOccupancy : undefined,
          measuredKwhDenominatorByBuildingId,
        ),
      ),
    }))
    .filter(({ amountCents }) => amountCents !== 0)
  if (!circuit) {
    return {
      operatingByCategory,
      heatingBaseCents: 0,
      heatingConsumptionCents: 0,
      hotWaterCents: 0,
      heatingCo2Cents: 0,
    }
  }
  const baseArea =
    defaultsBasis === 'usable_area' ? context.usableArea : context.heatedArea
  const reduction = section12Factor(context, circuit, isMeteredOccupancy)
  const hotWater = rawHotWater(circuit, context, baseArea)
  const heatingCo2 =
    circuit.co2BasePrice * baseArea * heatingBaseTimeFactor(context) +
    circuit.co2ConsumptionPrice *
      (isMeteredOccupancy
        ? measuredKwhByOccupancy!.get(context.occupancy.id)!
        : context.consumptionUnits)
  return {
    operatingByCategory,
    heatingBaseCents: roundCentsHalfAwayFromZero(
      circuit.basePrice * baseArea * heatingBaseTimeFactor(context) * reduction,
    ),
    heatingConsumptionCents: roundCentsHalfAwayFromZero(
      circuit.consumptionPrice *
        (isMeteredOccupancy
          ? measuredKwhByOccupancy!.get(context.occupancy.id)!
          : context.consumptionUnits) *
        reduction,
    ),
    hotWaterCents: roundCentsHalfAwayFromZero(hotWater.cost * reduction),
    heatingCo2Cents: roundCentsHalfAwayFromZero(
      circuit.hotWaterSection9Share === null
        ? heatingCo2
        : heatingCo2 + hotWater.co2,
    ),
    ...(circuit.hotWaterSection9Share === null
      ? {}
      : { hotWaterCo2Cents: roundCentsHalfAwayFromZero(hotWater.co2) }),
  }
}

/** Warmwasser-Bezugsgröße der Nutzung (nur im neuen Verfahren, ADR-0010). */
function tenantHotWaterBasis(
  context: OccupancyContext,
  circuits: readonly RawCircuitResult[],
  defaultsBasis: 'usable_area' | 'heated_area',
): { hotWaterBasis?: TenantHotWaterBasis } {
  const circuit = circuits.find(
    ({ buildingId }) => buildingId === context.buildingId,
  )
  if (!circuit?.hotWaterExtended) return {}
  const baseArea =
    defaultsBasis === 'usable_area' ? context.usableArea : context.heatedArea
  return {
    hotWaterBasis: {
      key: circuit.hotWaterKey,
      ...hotWaterUnitsOf(context, baseArea),
    },
  }
}

/**
 * Kontrolle der Warmwasserverteilung eines Heizkreises: Summe der gerundeten
 * Einzelbeträge von Mietern und Leerstand, Kürzung nach § 12 HeizKV und der
 * verbleibende Rundungsrest – sichtbar statt im Leerstand verrechnet.
 */
function hotWaterDistribution(
  circuit: RawCircuitResult,
  contexts: readonly OccupancyContext[],
  tenants: readonly { id: string; costBreakdown: TenantCostBreakdown }[],
  defaultsBasis: 'usable_area' | 'heated_area',
  measuredKwhDenominatorByBuildingId?: ReadonlyMap<string, number>,
): CircuitHotWaterDistributionTrace {
  const centsById = new Map(
    tenants.map(({ id, costBreakdown }) => [id, costBreakdown.hotWaterCents]),
  )
  const isMetered = Boolean(
    measuredKwhDenominatorByBuildingId?.has(circuit.buildingId),
  )
  let tenantsCents = 0
  let vacancyCents = 0
  let reduction = 0
  for (const context of contexts) {
    if (context.buildingId !== circuit.buildingId) continue
    const cents = centsById.get(context.occupancy.id) ?? 0
    if (context.occupancy.kind === 'vacancy') vacancyCents += cents
    else tenantsCents += cents
    const baseArea =
      defaultsBasis === 'usable_area' ? context.usableArea : context.heatedArea
    reduction +=
      rawHotWater(circuit, context, baseArea).cost *
      (1 - section12Factor(context, circuit, isMetered))
  }
  const section12ReductionCents = roundCentsHalfAwayFromZero(reduction)
  return {
    tenantsCents,
    vacancyCents,
    section12ReductionCents,
    roundingDifferenceCents:
      circuit.warmWaterTrace.poolCents -
      tenantsCents -
      vacancyCents -
      section12ReductionCents,
  }
}

export function calculateBilling(input: CalculationInput): CalculationOutput {
  const metering = resolveMeteredConsumption(input)
  if (!metering.ok) {
    const summary = metering.issues
      .map(
        ({ code, heatingCircuitId, unitId, meterId }) =>
          `${code}${heatingCircuitId ? ` [${heatingCircuitId}]` : ''}${unitId ? ` [${unitId}]` : ''}${meterId ? ` [${meterId}]` : ''}`,
      )
      .join('; ')
    throw new Error(
      `Wohnungswärme-Ablesungen sind unvollständig oder ungültig: ${summary}`,
    )
  }
  const measuredKwhByOccupancy = new Map(
    metering.circuits.flatMap((circuit) =>
      circuit.occupancies.map(
        ({ occupancyId, kwh }) => [occupancyId, Number(kwh)] as const,
      ),
    ),
  )
  const measuredCircuitIds = new Set(
    metering.circuits.map(({ heatingCircuitId }) => heatingCircuitId),
  )
  const measuredCircuitByBuildingId = new Map(
    metering.circuits.map((circuit) => [
      circuit.buildingId,
      circuit.heatingCircuitId,
    ]),
  )
  const measuredKwhDenominatorByBuildingId = new Map(
    metering.circuits.map((circuit) => [
      circuit.buildingId,
      Number(circuit.totalKwh),
    ]),
  )
  const usesMeteredConsumption = measuredCircuitIds.size > 0
  const measuredBuildingIds = new Set(measuredCircuitByBuildingId.keys())
  const periodDays = calculatePeriodDays(
    input.billingPeriod.periodStart,
    input.billingPeriod.periodEnd,
  )
  const contexts = buildOccupancyContexts(input)
  const originalPositions = costPositions(input, contexts)
  const preparedCircuits = prepareCircuits(input, contexts)
  const preliminaryCircuits = rawCircuitResults(
    input,
    preparedCircuits,
    originalPositions,
    periodDays,
    new Map(),
    measuredKwhDenominatorByBuildingId,
  )
  const operatingElectricityPlan = calculateOperatingElectricityPlan(
    preliminaryCircuits.map(({ buildingId, operatingElectricityIntended }) => ({
      buildingId,
      intendedCentsExact: operatingElectricityIntended,
    })),
    originalPositions
      .filter(
        ({ category, effectiveAmount }) =>
          category.kind !== 'heating' &&
          category.betrkvCategory !== 'NICHT_UML' &&
          category.allocationKey !== 'direct' &&
          category.scope?.kind !== 'house' &&
          category.isOperatingElectricitySource === true &&
          effectiveAmount > 0,
      )
      .map(({ category, effectiveAmount }) => ({
        costCategoryId: category.id,
        availableCentsExact: effectiveAmount,
        buildingId:
          category.scope?.kind === 'building'
            ? category.scope.buildingId
            : null,
      })),
  )
  const positions = originalPositions.map((position) => ({
    ...position,
    effectiveAmount:
      position.effectiveAmount -
      (operatingElectricityPlan.deductedCentsExactByCostCategoryId.get(
        position.category.id,
      ) ?? 0),
  }))
  const circuits = rawCircuitResults(
    input,
    preparedCircuits,
    positions,
    periodDays,
    operatingElectricityPlan.movedCentsExactByBuildingId,
    measuredKwhDenominatorByBuildingId,
  )
  const defaultsBasis =
    input.billingPeriod.heatingDefaults?.baseCostAreaBasis ?? 'heated_area'
  const prepaymentsByOccupancy = new Map(
    input.prepayments.map((prepayment) => [
      prepayment.occupancyPeriodId,
      prepayment,
    ]),
  )
  const rawShares = contexts.map((context) => ({
    context,
    share: rawTenantShare(
      context,
      positions,
      circuits,
      defaultsBasis,
      usesMeteredConsumption ? measuredKwhByOccupancy : undefined,
      usesMeteredConsumption ? measuredKwhDenominatorByBuildingId : undefined,
    ),
    prepayment: calculatePrepaymentCents(
      prepaymentsByOccupancy.get(context.occupancy.id),
      context.occupancy,
      input.billingPeriod,
    ),
  }))
  const roundedSharesByKind = new Map(
    (['tenant', 'vacancy'] as const).map((kind) => [
      kind,
      new Map(
        allocateLargestRemainder(
          rawShares
            .filter(({ context }) => context.occupancy.kind === kind)
            .map(({ context, share }) => ({
              id: context.occupancy.id,
              exactCents: share,
            })),
        ).map(({ id, cents }) => [id, cents]),
      ),
    ]),
  )
  const tenants = rawShares.map(({ context, share, prepayment }) => {
    const shareCents =
      roundedSharesByKind
        .get(context.occupancy.kind)
        ?.get(context.occupancy.id) ?? roundCentsHalfAwayFromZero(share)
    const balanceCents = shareCents - prepayment
    const circuitIsMetered = measuredCircuitByBuildingId.has(
      context.buildingId ?? '',
    )
    const hasMissingConsumption = circuitIsMetered
      ? !measuredKwhByOccupancy.has(context.occupancy.id)
      : context.consumptionUnits <= 0
    return {
      id: context.occupancy.id,
      isVacancy: context.occupancy.kind === 'vacancy',
      shareCents,
      prepaymentCents: prepayment,
      balanceCents,
      status:
        !Number.isFinite(share) || share < 0
          ? ('rot' as const)
          : hasMissingConsumption
            ? ('gelb' as const)
            : ('gruen' as const),
      costBreakdown: rawTenantShareBreakdown(
        context,
        positions,
        circuits,
        defaultsBasis,
        usesMeteredConsumption ? measuredKwhByOccupancy : undefined,
        usesMeteredConsumption ? measuredKwhDenominatorByBuildingId : undefined,
      ),
      days: context.days,
      timeFactor: roundQuantity(context.timeFactor, 6),
      ownBasis: tenantAllocationBasis(
        context,
        measuredKwhByOccupancy,
        measuredBuildingIds,
      ),
      section35a: rawTenantSection35a(
        context,
        positions,
        circuits,
        defaultsBasis,
        usesMeteredConsumption ? measuredKwhByOccupancy : undefined,
        usesMeteredConsumption ? measuredKwhDenominatorByBuildingId : undefined,
      ),
      ...tenantHotWaterBasis(context, circuits, defaultsBasis),
    }
  })

  const internalCosts = positions
    .filter(({ category }) => category.betrkvCategory === 'NICHT_UML')
    .reduce((sum, position) => sum + position.amount, 0)
  const directCosts = positions
    .filter(
      ({ category }) =>
        category.betrkvCategory !== 'NICHT_UML' &&
        category.allocationKey === 'direct',
    )
    .reduce((sum, position) => sum + position.amount, 0)
  const distributablePositions = positions.filter(
    ({ category }) =>
      category.betrkvCategory !== 'NICHT_UML' &&
      category.allocationKey !== 'direct',
  )
  const heatingOperatingUnscoped = distributablePositions
    .filter(
      ({ category }) =>
        category.kind === 'heating' &&
        (!category.scope || category.scope.kind === 'property'),
    )
    .reduce((sum, position) => sum + position.effectiveAmount, 0)
  const unscopedHeatingLandlord = contexts.some(({ buildingId }) => !buildingId)
    ? 0
    : heatingOperatingUnscoped
  const circuitHeating = circuits.reduce(
    (sum, circuit) => sum + circuit.heatingTotal,
    0,
  )
  const fallbackBaseFactor =
    (input.billingPeriod.heatingDefaults?.baseSharePercent ?? 30) / 100
  const fallbackConsumptionFactor =
    (input.billingPeriod.heatingDefaults?.consumptionSharePercent ?? 70) / 100
  const co2Tenant = circuits.reduce(
    (sum, circuit) => sum + circuit.co2Tenant,
    0,
  )
  const co2Landlord = circuits.reduce(
    (sum, circuit) => sum + circuit.co2Landlord,
    0,
  )
  const nonHeatingFullCosts = distributablePositions
    .filter(({ category }) => category.kind !== 'heating')
    .reduce((sum, position) => sum + position.amount, 0)
  const heatingOperatingFullCosts = distributablePositions
    .filter(({ category }) => category.kind === 'heating')
    .reduce((sum, position) => sum + position.amount, 0)
  const fullFuelCosts = circuits.reduce(
    (sum, circuit) => sum + circuit.fuelConsumption + circuit.co2Cost,
    0,
  )
  const freeLandlord = distributablePositions.reduce(
    (sum, position) => sum + position.freeLandlordAmount,
    0,
  )
  const recordedCosts =
    fullFuelCosts + heatingOperatingFullCosts + nonHeatingFullCosts
  const tenantTotal = rawShares
    .filter(({ context }) => context.occupancy.kind !== 'vacancy')
    .reduce((sum, result) => sum + result.share, 0)
  const vacancyRows = rawShares
    .filter(({ context }) => context.occupancy.kind === 'vacancy')
    .reduce((sum, result) => sum + result.share, 0)
  const allDistributed = rawShares.reduce(
    (sum, result) => sum + result.share,
    0,
  )
  const effectiveNonHeating = distributablePositions
    .filter(({ category }) => category.kind !== 'heating')
    .reduce((sum, position) => sum + position.effectiveAmount, 0)
  const distributable =
    circuitHeating +
    (contexts.some(({ buildingId }) => !buildingId)
      ? heatingOperatingUnscoped
      : 0) +
    effectiveNonHeating +
    co2Tenant
  const openVacancy = Math.max(0, distributable - allDistributed)
  const vacancyLandlord = vacancyRows + openVacancy
  const landlordTotal =
    co2Landlord + vacancyLandlord + unscopedHeatingLandlord + freeLandlord
  const controlDifference = recordedCosts - tenantTotal - landlordTotal
  const prepayments = rawShares
    .filter(({ context }) => context.occupancy.kind !== 'vacancy')
    .reduce((sum, result) => sum + result.prepayment, 0)
  const circuitOutputs = circuits.map(outputCircuit)
  const sumCircuitOutput = (
    select: (circuit: (typeof circuitOutputs)[number]) => number,
  ): number => circuitOutputs.reduce((sum, circuit) => sum + select(circuit), 0)
  const fallbackHeatingSplit = new Map(
    allocateLargestRemainder([
      {
        id: 'base',
        exactCents: heatingOperatingUnscoped * fallbackBaseFactor,
      },
      {
        id: 'consumption',
        exactCents: heatingOperatingUnscoped * fallbackConsumptionFactor,
      },
    ]).map(({ id, cents }) => [id, cents]),
  )
  const circuitTraces = circuits.map((circuit) =>
    outputCircuitTrace(
      circuit,
      operatingElectricityPlan.circuitResultsByBuildingId.get(
        circuit.buildingId,
      ) ?? {
        intendedCents: 0,
        movedCents: 0,
        uncoveredCents: 0,
      },
      circuit.warmWaterTrace.method === 'none'
        ? undefined
        : hotWaterDistribution(
            circuit,
            contexts,
            tenants,
            defaultsBasis,
            usesMeteredConsumption
              ? measuredKwhDenominatorByBuildingId
              : undefined,
          ),
    ),
  )

  return {
    snapshotFormatVersion: CORE_SNAPSHOT_FORMAT_VERSION,
    periodDays,
    totals: {
      recordedCostsCents: roundCentsHalfAwayFromZero(recordedCosts),
      tenantTotalCents: roundCentsHalfAwayFromZero(tenantTotal),
      landlordTotalCents: roundCentsHalfAwayFromZero(landlordTotal),
      unallocatedCents: 0,
      prepaymentsCents: roundCentsHalfAwayFromZero(prepayments),
      controlDifferenceCents: roundCentsHalfAwayFromZero(controlDifference),
      directCostsCents: roundCentsHalfAwayFromZero(directCosts),
      internalCostsCents: roundCentsHalfAwayFromZero(internalCosts),
    },
    heating: {
      totalCents:
        sumCircuitOutput(({ heatingTotalCents }) => heatingTotalCents) +
        roundCentsHalfAwayFromZero(heatingOperatingUnscoped),
      baseCostsCents:
        sumCircuitOutput(({ baseCents }) => baseCents) +
        fallbackHeatingSplit.get('base')!,
      consumptionCostsCents:
        sumCircuitOutput(({ consumptionCents }) => consumptionCents) +
        fallbackHeatingSplit.get('consumption')!,
      fuelConsumptionCents: sumCircuitOutput(
        ({ fuelConsumptionCents }) => fuelConsumptionCents,
      ),
      unallocatedLandlordCents: roundCentsHalfAwayFromZero(
        unscopedHeatingLandlord,
      ),
      perCircuit: circuitOutputs,
      operatingElectricity: operatingElectricityPlan.publicResult,
      trace: {
        traceFormatVersion: HEATING_TRACE_FORMAT_VERSION,
        operatingElectricity: operatingElectricityPlan.publicResult,
        circuits: circuitTraces,
      },
    },
    co2: {
      totalCostCents: sumCircuitOutput(({ co2CostCents }) => co2CostCents),
      tenantCents: sumCircuitOutput(({ co2TenantCents }) => co2TenantCents),
      landlordCents: sumCircuitOutput(
        ({ co2LandlordCents }) => co2LandlordCents,
      ),
    },
    vacancyLandlordCents: roundCentsHalfAwayFromZero(vacancyLandlord),
    tenants,
    warnings: [],
    operatingPositions: operatingPositionTraces(
      originalPositions,
      positions,
      contexts,
    ),
    ...(usesMeteredConsumption ? { meteringTrace: metering.trace } : {}),
  }
}
