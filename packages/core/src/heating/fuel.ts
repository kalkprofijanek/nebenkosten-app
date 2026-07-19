import type { EnergySource, FuelDelivery, FuelStock } from '@nebenkosten/schema'
import type { EnergySourceCalculationTrace, FuelLotTrace } from '../contracts'
import { roundCentsHalfAwayFromZero } from '../rounding'

export interface EnergySourceFuelCalculation {
  readonly trace: EnergySourceCalculationTrace
  readonly fullCostCentsRaw: number
  readonly energyKwhRaw: number
  readonly co2KgRaw: number
}

interface FuelLot {
  readonly kind: FuelLotTrace['kind']
  readonly sourceId: string
  readonly date: string | null
  readonly quantity: number
  readonly valueCents: number
  readonly unit: string | null
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function roundQuantity(value: number): number {
  const rounded = roundCentsHalfAwayFromZero(value * 1_000) / 1_000
  return Object.is(rounded, -0) ? 0 : rounded
}

function nonNegative(value: number | null | undefined): number {
  return Math.max(0, value ?? 0)
}

function openingValueCents(stock: Readonly<FuelStock>): number {
  if (stock.openingValueCents != null) {
    return stock.openingValueCents
  }
  return (
    nonNegative(stock.openingQuantity?.value) *
    nonNegative(stock.openingPricePerUnitCents)
  )
}

function deliveryOrder(
  left: Readonly<FuelDelivery>,
  right: Readonly<FuelDelivery>,
): number {
  const dateOrder = compareStrings(left.date ?? '', right.date ?? '')
  return dateOrder || compareStrings(left.id, right.id)
}

function assertSingleUnit(
  lots: readonly FuelLot[],
  remainingUnits: readonly string[],
): string | null {
  const units = new Set([
    ...lots.flatMap(({ unit }) => (unit === null ? [] : [unit])),
    ...remainingUnits,
  ])
  if (units.size > 1) {
    throw new Error(
      `Energiequelle verwendet mehrere Mengeneinheiten: ${[...units].sort(compareStrings).join(', ')}`,
    )
  }
  return units.values().next().value ?? null
}

function toTraceLot(lot: FuelLot): FuelLotTrace {
  return {
    kind: lot.kind,
    sourceId: lot.sourceId,
    date: lot.date,
    quantity: roundQuantity(lot.quantity),
    valueCents: roundCentsHalfAwayFromZero(lot.valueCents),
  }
}

function sumQuantity(lots: readonly FuelLot[]): number {
  return lots.reduce((sum, { quantity }) => sum + quantity, 0)
}

function sumValue(lots: readonly FuelLot[]): number {
  return lots.reduce((sum, { valueCents }) => sum + valueCents, 0)
}

function valueRemainingStock(
  lots: readonly FuelLot[],
  requestedQuantity: number,
): number {
  let quantityToValue = Math.min(requestedQuantity, sumQuantity(lots))
  let remainingValueCents = 0

  for (const lot of [...lots].reverse()) {
    if (quantityToValue <= 0 || lot.quantity <= 0) continue
    const quantityFromLot = Math.min(quantityToValue, lot.quantity)
    remainingValueCents += quantityFromLot * (lot.valueCents / lot.quantity)
    quantityToValue -= quantityFromLot
  }

  return remainingValueCents
}

export function calculateEnergySourceFuel(
  source: Readonly<EnergySource>,
  fuelStocks: readonly Readonly<FuelStock>[],
  fuelDeliveries: readonly Readonly<FuelDelivery>[],
  fallbackCo2Factor = 0,
): EnergySourceFuelCalculation {
  const stocks = fuelStocks
    .filter(({ energySourceId }) => energySourceId === source.id)
    .sort(({ id: left }, { id: right }) => compareStrings(left, right))
  const deliveries = fuelDeliveries
    .filter(({ energySourceId }) => energySourceId === source.id)
    .sort(deliveryOrder)

  const openingLots: FuelLot[] = stocks
    .filter(
      (stock) =>
        nonNegative(stock.openingQuantity?.value) > 0 ||
        openingValueCents(stock) !== 0,
    )
    .map((stock) => ({
      kind: 'opening_stock',
      sourceId: stock.id,
      date: null,
      quantity: nonNegative(stock.openingQuantity?.value),
      valueCents: openingValueCents(stock),
      unit: stock.openingQuantity?.unit ?? null,
    }))
  const deliveryLots: FuelLot[] = deliveries.map((delivery) => ({
    kind: 'delivery',
    sourceId: delivery.id,
    date: delivery.date ?? null,
    quantity: nonNegative(delivery.quantity?.value),
    valueCents: delivery.amountCents ?? 0,
    unit: delivery.quantity?.unit ?? null,
  }))
  const lots = [...openingLots, ...deliveryLots]
  const remainingUnits = stocks.flatMap(({ remainingQuantity }) =>
    remainingQuantity ? [remainingQuantity.unit] : [],
  )
  const quantityUnit = assertSingleUnit(lots, remainingUnits)

  const availableQuantityRaw = sumQuantity(lots)
  const availableValueCentsRaw = sumValue(lots)
  const requestedRemainingQuantityRaw = stocks.reduce(
    (sum, { remainingQuantity }) => sum + nonNegative(remainingQuantity?.value),
    0,
  )
  const valuedRemainingQuantityRaw = Math.min(
    requestedRemainingQuantityRaw,
    availableQuantityRaw,
  )
  const overstockQuantityRaw = Math.max(
    0,
    requestedRemainingQuantityRaw - availableQuantityRaw,
  )
  const usesFifo = availableQuantityRaw > 0
  const remainingValueCentsRaw = usesFifo
    ? valueRemainingStock(lots, requestedRemainingQuantityRaw)
    : 0
  const fullCostCentsRaw = Math.max(
    0,
    availableValueCentsRaw - remainingValueCentsRaw,
  )
  const consumedQuantityRaw = usesFifo
    ? Math.max(0, availableQuantityRaw - valuedRemainingQuantityRaw)
    : 0
  const calorificValueKwhPerUnit = nonNegative(source.calorificValueKwhPerUnit)
  const co2FactorKgPerKwh = nonNegative(
    source.co2FactorKgPerKwh ?? fallbackCo2Factor,
  )
  const energyKwhRaw = consumedQuantityRaw * calorificValueKwhPerUnit
  const co2KgRaw = energyKwhRaw * co2FactorKgPerKwh

  return {
    fullCostCentsRaw,
    energyKwhRaw,
    co2KgRaw,
    trace: {
      energySourceId: source.id,
      quantityUnit,
      method: usesFifo ? 'fifo' : 'direct_cost_without_quantity',
      lots: lots.map(toTraceLot),
      availableQuantity: roundQuantity(availableQuantityRaw),
      availableValueCents: roundCentsHalfAwayFromZero(availableValueCentsRaw),
      requestedRemainingQuantity: roundQuantity(requestedRemainingQuantityRaw),
      valuedRemainingQuantity: roundQuantity(valuedRemainingQuantityRaw),
      remainingValueCents: roundCentsHalfAwayFromZero(remainingValueCentsRaw),
      consumedQuantity: roundQuantity(consumedQuantityRaw),
      fifoConsumptionCostCents: roundCentsHalfAwayFromZero(fullCostCentsRaw),
      overstockQuantity: roundQuantity(overstockQuantityRaw),
      calorificValueKwhPerUnit,
      energyKwh: roundQuantity(energyKwhRaw),
      co2FactorKgPerKwh,
      co2Kg: roundQuantity(co2KgRaw),
    },
  }
}
