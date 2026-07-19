import type {
  AllocationScope,
  CostCategory,
  CostEntry,
  OccupancyPeriod,
  Quantity,
  Tenancy,
  Unit,
} from '@nebenkosten/schema'
import {
  CORE_SNAPSHOT_FORMAT_VERSION,
  type CalculationInput,
  type CalculationOutput,
  type CircuitCalculationResult,
} from '../contracts'
import { calculateOccupancyDays, calculatePeriodDays } from '../periods'
import { calculatePrepaymentCents } from '../prepayments'
import { roundCentsHalfAwayFromZero } from '../rounding'

interface OccupancyContext {
  occupancy: Readonly<OccupancyPeriod>
  unit: Readonly<Unit>
  tenancy?: Readonly<Tenancy>
  days: number
  timeFactor: number
  buildingId?: string
  usableArea: number
  heatedArea: number
  persons: number
  consumptionUnits: number
}

interface AllocationBasis {
  usableArea: number
  heatedArea: number
  persons: number
  consumptionUnits: number
  residentialUnits: number
}

interface RawCircuitResult {
  buildingId: string
  heatingTotal: number
  baseCosts: number
  consumptionCosts: number
  fuelConsumption: number
  hotWater: number
  co2Cost: number
  co2Tenant: number
  co2Landlord: number
  co2TenantPercent: number
  co2Intensity: number
  co2Kg: number
  energyKwh: number
  basePrice: number
  consumptionPrice: number
  hotWaterPricePerPerson: number
  co2PricePerConsumptionUnit: number
}

interface RawCostPosition {
  category: Readonly<CostCategory>
  amount: number
  effectiveAmount: number
  freeLandlordAmount: number
  basis: AllocationBasis
}

interface FuelResult {
  fullCost: number
  consumedQuantity: number
  energyKwh: number
  co2Kg: number
}

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

function calculateFuel(
  sourceId: string,
  input: CalculationInput,
  calorificValue: number,
  co2Factor: number,
): FuelResult {
  const stock = input.fuelStocks.find(
    ({ energySourceId }) => energySourceId === sourceId,
  )
  const deliveries = input.fuelDeliveries
    .filter(({ energySourceId }) => energySourceId === sourceId)
    .slice()
    .sort((left, right) => {
      const byDate = (left.date ?? '').localeCompare(right.date ?? '')
      return byDate || left.id.localeCompare(right.id)
    })
  const expectedUnit =
    stock?.openingQuantity?.unit ??
    stock?.remainingQuantity?.unit ??
    deliveries.find(({ quantity }) => quantity)?.quantity?.unit
  const openingQuantity = quantityValue(stock?.openingQuantity, expectedUnit)
  const lots = [
    ...(stock?.openingQuantity || stock?.openingValueCents
      ? [
          {
            quantity: openingQuantity,
            amount: stock.openingValueCents ?? 0,
          },
        ]
      : []),
    ...deliveries.map((delivery) => ({
      quantity: quantityValue(delivery.quantity, expectedUnit),
      amount: delivery.amountCents ?? 0,
    })),
  ]
  const totalQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0)
  const totalValue = lots.reduce((sum, lot) => sum + lot.amount, 0)
  const remainingInput = Math.max(
    0,
    quantityValue(stock?.remainingQuantity, expectedUnit),
  )
  if (totalQuantity <= 0) {
    return {
      fullCost: Math.max(0, totalValue),
      consumedQuantity: 0,
      energyKwh: 0,
      co2Kg: 0,
    }
  }

  let remaining = Math.min(remainingInput, totalQuantity)
  let remainingValue = 0
  for (let index = lots.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const lot = lots[index]!
    const quantity = Math.max(0, lot.quantity)
    if (quantity === 0) continue
    const retained = Math.min(quantity, remaining)
    remainingValue += retained * (lot.amount / quantity)
    remaining -= retained
  }
  const consumedQuantity =
    totalQuantity - Math.min(remainingInput, totalQuantity)
  const energyKwh = consumedQuantity * calorificValue
  return {
    fullCost: Math.max(0, totalValue - remainingValue),
    consumedQuantity,
    energyKwh,
    co2Kg: energyKwh * co2Factor,
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

function roundQuantity(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function rawCircuitResults(
  input: CalculationInput,
  contexts: readonly OccupancyContext[],
  positions: readonly RawCostPosition[],
  periodDays: number,
): RawCircuitResult[] {
  const defaults = input.billingPeriod.heatingDefaults
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
    const fuel = sources.reduce<FuelResult>(
      (sum, source) => {
        const result = calculateFuel(
          source.id,
          input,
          source.calorificValueKwhPerUnit ?? 0,
          source.co2FactorKgPerKwh ?? circuit?.co2?.co2FactorKgPerKwh ?? 0,
        )
        return {
          fullCost: sum.fullCost + result.fullCost,
          consumedQuantity: sum.consumedQuantity + result.consumedQuantity,
          energyKwh: sum.energyKwh + result.energyKwh,
          co2Kg: sum.co2Kg + result.co2Kg,
        }
      },
      { fullCost: 0, consumedQuantity: 0, energyKwh: 0, co2Kg: 0 },
    )
    const heatedArea = circuitContexts.reduce(
      (sum, context) => sum + context.heatedArea,
      0,
    )
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
          category.scope.buildingId === building.id,
      )
      .reduce((sum, position) => sum + position.effectiveAmount, 0)
    const heatingTotal = fuelConsumption - hotWater + heatingOperating
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
    const basis = buildAllocationBasis(input, contexts, {
      kind: 'building',
      buildingId: building.id,
    })
    const useUsableArea = defaults?.baseCostAreaBasis === 'usable_area'
    const baseDenominator = useUsableArea ? basis.usableArea : basis.heatedArea
    const hotWaterPersons =
      circuitContexts.reduce((sum, context) => {
        if (context.occupancy.kind === 'vacancy') return sum
        return (
          sum + (context.persons > 0 ? context.persons : 1) * context.timeFactor
        )
      }, 0) || 1
    return {
      buildingId: building.id,
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
      hotWaterPricePerPerson: hotWater / hotWaterPersons,
      co2PricePerConsumptionUnit:
        basis.consumptionUnits > 0 ? co2Tenant / basis.consumptionUnits : 0,
    }
  })
}

function outputCircuit(result: RawCircuitResult): CircuitCalculationResult {
  return {
    buildingId: result.buildingId,
    heatingTotalCents: roundCentsHalfAwayFromZero(result.heatingTotal),
    baseCents: roundCentsHalfAwayFromZero(result.baseCosts),
    consumptionCents: roundCentsHalfAwayFromZero(result.consumptionCosts),
    fuelConsumptionCents: roundCentsHalfAwayFromZero(result.fuelConsumption),
    hotWaterCents: roundCentsHalfAwayFromZero(result.hotWater),
    co2CostCents: roundCentsHalfAwayFromZero(result.co2Cost),
    co2TenantCents: roundCentsHalfAwayFromZero(result.co2Tenant),
    co2LandlordCents: roundCentsHalfAwayFromZero(result.co2Landlord),
    co2TenantPercent: roundQuantity(result.co2TenantPercent, 3),
    co2IntensityKgPerSqmYear: roundQuantity(result.co2Intensity, 3),
    co2Kg: roundQuantity(result.co2Kg, 3),
    energyKwh: roundQuantity(result.energyKwh, 3),
  }
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

export function calculateBilling(input: CalculationInput): CalculationOutput {
  const periodDays = calculatePeriodDays(
    input.billingPeriod.periodStart,
    input.billingPeriod.periodEnd,
  )
  const contexts = buildOccupancyContexts(input)
  const positions = costPositions(input, contexts)
  const circuits = rawCircuitResults(input, contexts, positions, periodDays)
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
  const tenants = rawShares.map(({ context, share, prepayment }) => {
    const shareCents = roundCentsHalfAwayFromZero(share)
    const balanceCents = roundCentsHalfAwayFromZero(share - prepayment)
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
  const heatingTotal = circuitHeating + heatingOperatingUnscoped
  const baseCosts =
    circuits.reduce((sum, circuit) => sum + circuit.baseCosts, 0) +
    heatingOperatingUnscoped * fallbackBaseFactor
  const consumptionCosts =
    circuits.reduce((sum, circuit) => sum + circuit.consumptionCosts, 0) +
    heatingOperatingUnscoped * fallbackConsumptionFactor
  const fuelConsumption = circuits.reduce(
    (sum, circuit) => sum + circuit.fuelConsumption,
    0,
  )
  const co2Cost = circuits.reduce((sum, circuit) => sum + circuit.co2Cost, 0)
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
      totalCents: roundCentsHalfAwayFromZero(heatingTotal),
      baseCostsCents: roundCentsHalfAwayFromZero(baseCosts),
      consumptionCostsCents: roundCentsHalfAwayFromZero(consumptionCosts),
      fuelConsumptionCents: roundCentsHalfAwayFromZero(fuelConsumption),
      unallocatedLandlordCents: roundCentsHalfAwayFromZero(
        unscopedHeatingLandlord,
      ),
      perCircuit: circuits.map(outputCircuit),
    },
    co2: {
      totalCostCents: roundCentsHalfAwayFromZero(co2Cost),
      tenantCents: roundCentsHalfAwayFromZero(co2Tenant),
      landlordCents: roundCentsHalfAwayFromZero(co2Landlord),
    },
    vacancyLandlordCents: roundCentsHalfAwayFromZero(vacancyLandlord),
    tenants,
    warnings: [],
  }
}
