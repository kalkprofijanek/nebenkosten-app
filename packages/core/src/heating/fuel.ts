import type { EnergySource, FuelDelivery, FuelStock } from '@nebenkosten/schema'
import type {
  EnergySourceCalculationTrace,
  FuelLotCo2Trace,
  FuelLotTrace,
} from '../contracts'
import { roundCentsHalfAwayFromZero } from '../rounding'

export interface EnergySourceFuelCalculation {
  readonly trace: EnergySourceCalculationTrace
  readonly fullCostCentsRaw: number
  readonly energyKwhRaw: number
  readonly co2KgRaw: number
  /**
   * CO₂-Kosten in Cent (ungerundet) als Summe je verbrauchtem FIFO-Los
   * (ADR-0010, A12). `null`, wenn kein Anfangsbestand einen eigenen CO₂-Preis
   * trägt oder kein Jahrespreis übergeben wurde – dann rechnet der Aufrufer
   * wie bisher mit Gesamtemissionen × Jahrespreis.
   */
  readonly co2CostCentsRaw: number | null
}

export interface EnergySourceFuelOptions {
  /** CO₂-Preis des Abrechnungsjahres in Cent je Tonne (Heizkreis, Modus auto). */
  readonly co2PricePerTonCents?: number | null
}

interface FuelLot {
  readonly kind: FuelLotTrace['kind']
  readonly sourceId: string
  readonly date: string | null
  readonly quantity: number
  readonly valueCents: number
  readonly unit: string | null
  /** Eigener CO₂-Preis des Loses (nur Anfangsbestand mit Lieferjahrespreis). */
  readonly co2PricePerTonCents: number | null
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

/** Verbrauchte Menge je Los: FIFO, der Restbestand stammt aus den jüngsten Losen. */
function consumedQuantities(
  lots: readonly FuelLot[],
  requestedRemainingQuantity: number,
): number[] {
  let remainingToAssign = Math.min(
    requestedRemainingQuantity,
    sumQuantity(lots),
  )
  const consumed = lots.map(({ quantity }) => quantity)
  for (let index = lots.length - 1; index >= 0; index -= 1) {
    if (remainingToAssign <= 0) break
    const lot = lots[index]!
    if (lot.quantity <= 0) continue
    const remainingFromLot = Math.min(remainingToAssign, lot.quantity)
    consumed[index] = lot.quantity - remainingFromLot
    remainingToAssign -= remainingFromLot
  }
  return consumed
}

interface LotCo2Result {
  readonly costCentsRaw: number
  readonly trace: FuelLotCo2Trace[]
}

/**
 * CO₂-Kosten je verbrauchtem Los (ADR-0010, A12): Anfangsbestand mit dem
 * Preis seines Lieferjahres, alle übrigen Lose mit dem Jahrespreis.
 * Lieferungen tragen im Schema keinen eigenen CO₂-Preis; sie stammen aus dem
 * Abrechnungsjahr (§ 10 BEHG: maßgeblich ist das Jahr des Inverkehrbringens).
 */
function lotCo2Costs(
  lots: readonly FuelLot[],
  consumed: readonly number[],
  calorificValueKwhPerUnit: number,
  co2FactorKgPerKwh: number,
  yearPricePerTonCents: number,
): LotCo2Result {
  let costCentsRaw = 0
  const trace: FuelLotCo2Trace[] = []
  lots.forEach((lot, index) => {
    const consumedQuantity = consumed[index] ?? 0
    if (consumedQuantity <= 0) return
    const energyKwh = consumedQuantity * calorificValueKwhPerUnit
    const co2Kg = energyKwh * co2FactorKgPerKwh
    const ownPrice = lot.co2PricePerTonCents
    const pricePerTonCents = ownPrice ?? yearPricePerTonCents
    const lotCostCentsRaw = (co2Kg / 1_000) * pricePerTonCents
    costCentsRaw += lotCostCentsRaw
    trace.push({
      kind: lot.kind,
      sourceId: lot.sourceId,
      consumedQuantity: roundQuantity(consumedQuantity),
      energyKwh: roundQuantity(energyKwh),
      co2Kg: roundQuantity(co2Kg),
      pricePerTonCents,
      priceSource: ownPrice == null ? 'billing_year' : 'opening_stock',
      costCents: roundCentsHalfAwayFromZero(lotCostCentsRaw),
    })
  })
  return { costCentsRaw, trace }
}

export function calculateEnergySourceFuel(
  source: Readonly<EnergySource>,
  fuelStocks: readonly Readonly<FuelStock>[],
  fuelDeliveries: readonly Readonly<FuelDelivery>[],
  fallbackCo2Factor = 0,
  options: EnergySourceFuelOptions = {},
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
      co2PricePerTonCents: stock.openingCo2PricePerTonCents ?? null,
    }))
  const deliveryLots: FuelLot[] = deliveries.map((delivery) => ({
    kind: 'delivery',
    sourceId: delivery.id,
    date: delivery.date ?? null,
    quantity: nonNegative(delivery.quantity?.value),
    valueCents: delivery.amountCents ?? 0,
    unit: delivery.quantity?.unit ?? null,
    co2PricePerTonCents: null,
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
  // Ohne eigenen Preis eines Loses bleibt es beim bisherigen Verfahren
  // (Bestandsschutz, ADR-0010 Nr. 6): kein Los-Ausweis, Aufrufer rechnet.
  const yearPrice = options.co2PricePerTonCents
  const lotPricing =
    usesFifo &&
    yearPrice != null &&
    lots.some(({ co2PricePerTonCents }) => co2PricePerTonCents != null)
      ? lotCo2Costs(
          lots,
          consumedQuantities(lots, requestedRemainingQuantityRaw),
          calorificValueKwhPerUnit,
          co2FactorKgPerKwh,
          yearPrice,
        )
      : null

  return {
    fullCostCentsRaw,
    energyKwhRaw,
    co2KgRaw,
    co2CostCentsRaw: lotPricing?.costCentsRaw ?? null,
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
      ...(lotPricing
        ? {
            co2Lots: lotPricing.trace,
            co2CostCents: roundCentsHalfAwayFromZero(lotPricing.costCentsRaw),
          }
        : {}),
    },
  }
}
