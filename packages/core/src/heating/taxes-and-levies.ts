/**
 * Steuern und Abgaben in den Energiekosten eines Heizkreises
 * (§ 6a Abs. 3 Nr. 1 b HeizKV, ADR-0011).
 *
 * Grundlage sind die an den Lieferungen erfassten Angaben
 * (`FuelDelivery.taxesAndLevies`). Wie in `fuel.ts` wird der Verbrauch FIFO
 * aus den Losen entnommen; je Los wird der verbrauchte Anteil seiner
 * ausgewiesenen Steuern und Abgaben angesetzt. Lose ohne Angaben (insbesondere
 * der Anfangsbestand) werden als „nicht ausgewiesen“ mit ihrem verbrauchten
 * Wert gezählt.
 */
import type { FuelDelivery } from '@nebenkosten/schema'
import type {
  EnergySourceCalculationTrace,
  HeatingCircuitTrace,
} from '../contracts'
import { roundCentsHalfAwayFromZero } from '../rounding'

/** Umsatzsteuer eines Satzes (Satz `null` = auf der Rechnung nicht angegeben). */
export interface VatAmount {
  readonly ratePercent: number | null
  readonly cents: number
}

/** Sonstige Abgabe mit Bezeichnung laut Rechnung (`null` = ohne Bezeichnung). */
export interface OtherLevyAmount {
  readonly label: string | null
  readonly cents: number
}

export interface TaxesAndLeviesAmounts {
  /** Umsatzsteuer je Steuersatz, aufsteigend nach Satz. */
  readonly vat: readonly VatAmount[]
  /** Energiesteuer bzw. Stromsteuer. */
  readonly energyTaxCents: number
  /** CO₂-Kosten nach BEHG. */
  readonly co2LevyCents: number
  /** Sonstige Abgaben und Umlagen je Bezeichnung. */
  readonly otherLevies: readonly OtherLevyAmount[]
  /** Summe aller Zeilen in Cent. */
  readonly totalCents: number
}

export interface CircuitTaxesAndLevies extends TaxesAndLeviesAmounts {
  readonly buildingId: string
  readonly heatingCircuitId: string | null
  /**
   * Herkunft des BEHG-Betrags: `invoice` = Summe der auf den Rechnungen
   * ausgewiesenen CO₂-Kosten aller verbrauchten Lose; `calculated` = die
   * berechneten CO₂-Kosten des Heizkreises (CO2KostAufG), weil nicht für
   * alle verbrauchten Lose ein Rechnungsbetrag erfasst ist.
   */
  readonly co2LevySource: 'invoice' | 'calculated'
  /**
   * Verbrauchter Brennstoffwert in Cent aus Losen ohne Angaben
   * (Anfangsbestand, Rechnungen ohne erfasste Steuern und Abgaben); deren
   * Steuern und Abgaben sind nicht ausgewiesen.
   */
  readonly notStatedValueCents: number
}

export interface TenantTaxesAndLeviesBasis {
  /** Heizkostenanteil des Mieters (Grund-, Verbrauchs- und Warmwasserkosten). */
  readonly tenantHeatingCents: number
  /** CO₂-Kostenanteil des Mieters. */
  readonly tenantCo2Cents: number
}

export interface TenantTaxesAndLevies extends TaxesAndLeviesAmounts {
  /** Anteil des Mieters an den Heiz- und Warmwasserkosten (0–1). */
  readonly heatingShare: number
  /** Anteil des Mieters an den CO₂-Kosten des Heizkreises (0–1). */
  readonly co2Share: number
}

interface RawAmounts {
  readonly vat: Map<number | null, number>
  energyTax: number
  co2Levy: number
  readonly other: Map<string | null, number>
}

function hasAnyValue(delivery: Readonly<FuelDelivery> | undefined): boolean {
  const taxes = delivery?.taxesAndLevies
  return (
    taxes != null &&
    [
      taxes.vatCents,
      taxes.energyTaxCents,
      taxes.co2LevyCents,
      taxes.otherLeviesCents,
    ].some((value) => value != null)
  )
}

/**
 * Verbrauchter Anteil (0–1) je Los wie in `fuel.ts`: Der Restbestand stammt
 * aus den jüngsten Losen; Lose ohne Menge (z. B. Fracht) und das Verfahren
 * ohne Mengen gelten als vollständig verbraucht.
 */
function consumedFractions(source: EnergySourceCalculationTrace): number[] {
  if (source.method !== 'fifo') return source.lots.map(() => 1)
  let remaining = source.valuedRemainingQuantity
  const fractions = source.lots.map(() => 1)
  for (let index = source.lots.length - 1; index >= 0; index -= 1) {
    if (remaining <= 0) break
    const { quantity } = source.lots[index]!
    if (quantity <= 0) continue
    const fromLot = Math.min(remaining, quantity)
    fractions[index] = (quantity - fromLot) / quantity
    remaining -= fromLot
  }
  return fractions
}

function add<K>(map: Map<K, number>, key: K, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value)
}

function compareNullableNumbers(left: number | null, right: number | null) {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left - right
}

function round(value: number): number {
  const rounded = roundCentsHalfAwayFromZero(value)
  return Object.is(rounded, -0) ? 0 : rounded
}

/** Rundet je Zeile; `factor` gilt nicht für `co2Levy` (eigener Schlüssel). */
function toAmounts(raw: RawAmounts, factor = 1): TaxesAndLeviesAmounts {
  const vat = [...raw.vat.entries()]
    .map(([ratePercent, cents]) => ({
      ratePercent,
      cents: round(cents * factor),
    }))
    .sort((left, right) =>
      compareNullableNumbers(left.ratePercent, right.ratePercent),
    )
  const otherLevies = [...raw.other.entries()]
    .map(([label, cents]) => ({ label, cents: round(cents * factor) }))
    .sort((left, right) =>
      (left.label ?? '￿').localeCompare(right.label ?? '￿', 'de'),
    )
  const energyTaxCents = round(raw.energyTax * factor)
  const co2LevyCents = round(raw.co2Levy)
  return {
    vat,
    energyTaxCents,
    co2LevyCents,
    otherLevies,
    totalCents:
      vat.reduce((sum, { cents }) => sum + cents, 0) +
      energyTaxCents +
      co2LevyCents +
      otherLevies.reduce((sum, { cents }) => sum + cents, 0),
  }
}

/**
 * Steuern und Abgaben des verbrauchten Brennstoffs eines Heizkreises.
 * `null`, wenn für keine verbrauchte Lieferung Angaben erfasst sind.
 */
export function circuitTaxesAndLevies(
  circuit: Readonly<HeatingCircuitTrace>,
  fuelDeliveries: readonly Readonly<FuelDelivery>[],
): CircuitTaxesAndLevies | null {
  const deliveriesById = new Map(
    fuelDeliveries.map((delivery) => [delivery.id, delivery]),
  )
  const raw: RawAmounts = {
    vat: new Map(),
    energyTax: 0,
    co2Levy: 0,
    other: new Map(),
  }
  let anyStated = false
  let allLotsWithCo2 = true
  let notStatedValue = 0

  for (const source of circuit.energySources) {
    const fractions = consumedFractions(source)
    source.lots.forEach((lot, index) => {
      const fraction = fractions[index] ?? 0
      if (fraction <= 0) return
      const delivery =
        lot.kind === 'delivery' ? deliveriesById.get(lot.sourceId) : undefined
      if (!hasAnyValue(delivery)) {
        notStatedValue += lot.valueCents * fraction
        if (lot.valueCents !== 0) allLotsWithCo2 = false
        return
      }
      anyStated = true
      const taxes = delivery!.taxesAndLevies!
      if (taxes.vatCents != null)
        add(raw.vat, taxes.vatRatePercent ?? null, taxes.vatCents * fraction)
      raw.energyTax += (taxes.energyTaxCents ?? 0) * fraction
      if (taxes.co2LevyCents != null)
        raw.co2Levy += taxes.co2LevyCents * fraction
      else if (lot.valueCents !== 0) allLotsWithCo2 = false
      if (taxes.otherLeviesCents != null) {
        const label = taxes.otherLeviesLabel?.trim() || null
        add(raw.other, label, taxes.otherLeviesCents * fraction)
      }
    })
  }
  if (!anyStated) return null

  // Ohne Rechnungsbetrag für jedes verbrauchte Los gelten die berechneten
  // CO₂-Kosten des Heizkreises (dieselbe Größe wie in der CO₂-Aufteilung).
  const co2LevySource = allLotsWithCo2 ? 'invoice' : 'calculated'
  if (co2LevySource === 'calculated') raw.co2Levy = circuit.co2.totalCents

  return {
    buildingId: circuit.buildingId,
    heatingCircuitId: circuit.heatingCircuitId,
    ...toAmounts(raw),
    co2LevySource,
    notStatedValueCents: round(notStatedValue),
  }
}

function clampShare(numerator: number, denominator: number): number {
  if (!(denominator > 0)) return 0
  return Math.min(1, Math.max(0, numerator / denominator))
}

/**
 * Anteil eines Mieters an den Steuern und Abgaben des Heizkreises.
 *
 * Offene Entscheidung (ADR-0011): Umsatzsteuer, Energiesteuer und sonstige
 * Abgaben werden im Verhältnis seines Heizkostenanteils (Grund-, Verbrauchs-
 * und Warmwasserkosten) zu den Heiz- und Warmwasserkosten des Heizkreises
 * angesetzt; die HeizKV schreibt keinen Schlüssel vor. Die CO₂-Kosten folgen
 * seinem tatsächlichen CO₂-Kostenanteil nach CO2KostAufG (der Vermieteranteil
 * ist darin nicht enthalten).
 */
export function tenantTaxesAndLevies(
  circuit: Readonly<HeatingCircuitTrace>,
  taxes: Readonly<CircuitTaxesAndLevies>,
  basis: Readonly<TenantTaxesAndLeviesBasis>,
): TenantTaxesAndLevies {
  const heatingShare = clampShare(
    basis.tenantHeatingCents,
    circuit.reconciliation.heatingPoolCents + circuit.warmWater.poolCents,
  )
  const co2Share = clampShare(basis.tenantCo2Cents, circuit.co2.totalCents)
  const amounts = toAmounts(
    {
      vat: new Map(
        taxes.vat.map(({ ratePercent, cents }) => [ratePercent, cents]),
      ),
      energyTax: taxes.energyTaxCents,
      co2Levy: taxes.co2LevyCents * co2Share,
      other: new Map(
        taxes.otherLevies.map(({ label, cents }) => [label, cents]),
      ),
    },
    heatingShare,
  )
  return { ...amounts, heatingShare, co2Share }
}
