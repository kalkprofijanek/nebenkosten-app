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
  type CircuitWarmWaterTrace,
  type TenantCostBreakdown,
} from '../contracts'
import { calculateOccupancyDays, calculatePeriodDays } from '../periods'
import { calculatePrepaymentCents } from '../prepayments'
import { allocateLargestRemainder } from '../rest-cents'
import { roundCentsHalfAwayFromZero } from '../rounding'
import { calculateEnergySourceFuel } from '../heating/fuel'
import { calculateOperatingElectricityPlan } from '../heating/operating-electricity'
import { outputCircuit, outputCircuitTrace } from '../heating/output'
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

  return input.occupancyPeriods.map((occupancy) => {
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
    const fuel = sources.reduce<AggregateFuelResult>(
      (sum, source) => {
        const result = calculateEnergySourceFuel(
          source,
          input.fuelStocks,
          input.fuelDeliveries,
          circuit?.co2?.co2FactorKgPerKwh ?? 0,
        )
        return {
          fullCost: sum.fullCost + result.fullCostCentsRaw,
          energyKwh: sum.energyKwh + result.energyKwhRaw,
          co2Kg: sum.co2Kg + result.co2KgRaw,
          sources: [...sum.sources, result.trace],
        }
      },
      { fullCost: 0, energyKwh: 0, co2Kg: 0, sources: [] },
    )
    return { buildingId: building.id, circuit, contexts: circuitContexts, fuel }
  })
}

function rawCircuitResults(
  input: CalculationInput,
  preparedCircuits: readonly PreparedCircuit[],
  positions: readonly RawCostPosition[],
  periodDays: number,
  operatingElectricityByBuildingId: ReadonlyMap<string, number>,
): RawCircuitResult[] {
  const defaults = input.billingPeriod.heatingDefaults
  return preparedCircuits.map(
    ({ buildingId, circuit, contexts: circuitContexts, fuel }) => {
      const basis = buildAllocationBasis(input, circuitContexts, {
        kind: 'building',
        buildingId,
      })
      const heatedArea = basis.heatedArea
      const automaticIntensity =
        heatedArea > 0 ? (fuel.co2Kg * (365 / periodDays)) / heatedArea : 0
      const co2Config = circuit?.co2
      const manual = co2Config?.mode === 'manual'
      const co2Cost = manual
        ? (co2Config.levyCents ?? 0)
        : (fuel.co2Kg / 1_000) * (co2Config?.co2PricePerTonCents ?? 4_500)
      const intensity = manual
        ? (co2Config.intensityKgPerSqmYear ?? 0)
        : automaticIntensity
      const tenantFactor = manual
        ? 1 - (co2Config.landlordSharePercent ?? 0) / 100
        : co2TenantFactor(intensity)
      const co2Tenant = co2Cost * tenantFactor
      const co2Landlord = co2Cost - co2Tenant
      const fuelConsumption = Math.max(0, fuel.fullCost - co2Cost)
      const hotWaterShare = circuit?.hasCentralHotWater
        ? (circuit.hotWaterSharePercent ?? 18) / 100
        : 0
      const hotWater = fuelConsumption * hotWaterShare
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
      const heatingTotal =
        fuelConsumption - hotWater + heatingOperating + operatingElectricity
      const consumptionFactor =
        (circuit?.overrides?.consumptionSharePercent ??
          defaults?.consumptionSharePercent ??
          70) / 100
      const baseFactor =
        (circuit?.overrides?.baseSharePercent ??
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
      const warmWaterTrace: CircuitWarmWaterTrace = {
        method: circuit?.hasCentralHotWater
          ? 'fuel_percentage_by_persons'
          : 'none',
        sharePercent: circuit?.hasCentralHotWater
          ? roundQuantity(hotWaterShare * 100, 3)
          : 0,
        poolCents: roundCentsHalfAwayFromZero(hotWater),
        personTimeDenominator: circuit?.hasCentralHotWater
          ? roundQuantity(hotWaterPersons, 3)
          : 0,
        fallbackOccupancyIds,
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
        consumptionDenominator: roundQuantity(basis.consumptionUnits, 3),
        baseCents: roundedHeatingSplit.get('base')!,
        consumptionCents: roundedHeatingSplit.get('consumption')!,
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
          basis.consumptionUnits > 0
            ? consumptionCosts / basis.consumptionUnits
            : 0,
        hotWaterPricePerPerson:
          hotWaterPersons > 0 ? hotWater / hotWaterPersons : 0,
        co2PricePerConsumptionUnit:
          basis.consumptionUnits > 0 ? co2Tenant / basis.consumptionUnits : 0,
        energySources: fuel.sources,
        co2Trace,
        warmWaterTrace,
        heatingOperating,
        operatingElectricity,
        operatingElectricityIntended,
        splitTrace,
      }
    },
  )
}

function rawTenantShare(
  context: OccupancyContext,
  positions: readonly RawCostPosition[],
  circuits: readonly RawCircuitResult[],
  defaultsBasis: 'usable_area' | 'heated_area',
): number {
  const operating = positions
    .filter(
      ({ category }) =>
        category.kind !== 'heating' &&
        category.betrkvCategory !== 'NICHT_UML' &&
        category.allocationKey !== 'direct' &&
        !(category.hideWhenZero && (category.totalAmountCents ?? 0) === 0),
    )
    .reduce((sum, position) => sum + costShare(position, context), 0)
  const circuit = circuits.find(
    ({ buildingId }) => buildingId === context.buildingId,
  )
  if (!circuit) return operating
  const baseArea =
    defaultsBasis === 'usable_area' ? context.usableArea : context.heatedArea
  let heating =
    circuit.basePrice * baseArea * context.timeFactor +
    circuit.consumptionPrice * context.consumptionUnits
  const persons =
    context.occupancy.kind === 'vacancy'
      ? 0
      : context.persons > 0
        ? context.persons
        : 1
  heating += circuit.hotWaterPricePerPerson * persons * context.timeFactor
  if (
    context.occupancy.consumptionUnitsEstimated &&
    context.occupancy.applySection12Reduction
  ) {
    heating *= 0.85
  }
  const co2 = circuit.co2PricePerConsumptionUnit * context.consumptionUnits
  return operating + heating + co2
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
): TenantCostBreakdown {
  const operatingByCategory = positions
    .filter(
      ({ category }) =>
        category.kind !== 'heating' &&
        category.betrkvCategory !== 'NICHT_UML' &&
        category.allocationKey !== 'direct' &&
        !(category.hideWhenZero && (category.totalAmountCents ?? 0) === 0),
    )
    .map((position) => ({
      costCategoryId: position.category.id,
      amountCents: roundCentsHalfAwayFromZero(costShare(position, context)),
    }))
    .filter(({ amountCents }) => amountCents !== 0)
  const circuit = circuits.find(
    ({ buildingId }) => buildingId === context.buildingId,
  )
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
  const persons =
    context.occupancy.kind === 'vacancy'
      ? 0
      : context.persons > 0
        ? context.persons
        : 1
  const reduction =
    context.occupancy.consumptionUnitsEstimated &&
    context.occupancy.applySection12Reduction
      ? 0.85
      : 1
  return {
    operatingByCategory,
    heatingBaseCents: roundCentsHalfAwayFromZero(
      circuit.basePrice * baseArea * context.timeFactor * reduction,
    ),
    heatingConsumptionCents: roundCentsHalfAwayFromZero(
      circuit.consumptionPrice * context.consumptionUnits * reduction,
    ),
    hotWaterCents: roundCentsHalfAwayFromZero(
      circuit.hotWaterPricePerPerson * persons * context.timeFactor * reduction,
    ),
    heatingCo2Cents: roundCentsHalfAwayFromZero(
      circuit.co2PricePerConsumptionUnit * context.consumptionUnits,
    ),
  }
}

export function calculateBilling(input: CalculationInput): CalculationOutput {
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
    share: rawTenantShare(context, positions, circuits, defaultsBasis),
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
    const hasMissingConsumption = context.consumptionUnits <= 0
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
      ),
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
  }
}
