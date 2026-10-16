/**
 * CO₂-Preis des Anfangsbestands (ADR-0010, A12): Im Vorjahr gelieferter
 * Brennstoff trägt den CO₂-Preis seines Lieferjahres. Fehlt die Angabe am
 * Brennstoffbestand, bewertet die Berechnung den Anfangsbestand mit dem
 * Preis des Abrechnungsjahres.
 */
import type {
  AppDataFile,
  BillingPeriod,
  HeatingCircuit,
  ValidationIssue,
} from '@nebenkosten/schema'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

/** Vorgabe der Berechnung, wenn am Heizkreis kein Preis hinterlegt ist. */
const DEFAULT_CO2_PRICE_PER_TON_CENTS = 4_500

function formatEuroPerTon(cents: number): string {
  return `${(cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €/t`
}

/** CO₂-Preis des Vorjahres am Heizkreis desselben Gebäudes, sonst `null`. */
function previousYearPrice(
  data: AppDataFile,
  period: BillingPeriod,
  circuit: HeatingCircuit,
): number | null {
  const previousPeriod = data.billingData.billingPeriods.find(
    (candidate) =>
      candidate.propertyId === period.propertyId &&
      candidate.year === period.year - 1,
  )
  if (!previousPeriod) return null
  const previousCircuit = data.billingData.heatingCircuits.find(
    (candidate) =>
      candidate.billingPeriodId === previousPeriod.id &&
      candidate.buildingId === circuit.buildingId,
  )
  if (previousCircuit?.co2?.mode !== 'auto') return null
  return previousCircuit.co2.co2PricePerTonCents ?? null
}

/**
 * Warnung, wenn ein Anfangsbestand ohne CO₂-Preis des Lieferjahres erfasst
 * ist und der Vorjahrespreis vom Jahrespreis abweicht. Offene Entscheidung:
 * Ist der Vorjahrespreis nicht ermittelbar (keine Vorjahresabrechnung im
 * System), wird ebenfalls gewarnt, weil eine Abweichung nicht ausgeschlossen
 * werden kann.
 */
export function co2OpeningPriceIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  const circuits = data.billingData.heatingCircuits.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )
  for (const circuit of circuits) {
    if (circuit.co2?.mode === 'manual') continue
    const yearPrice =
      circuit.co2?.co2PricePerTonCents ?? DEFAULT_CO2_PRICE_PER_TON_CENTS
    const previousPrice = previousYearPrice(data, period, circuit)
    if (previousPrice === yearPrice) continue
    const sources = data.billingData.energySources.filter(
      ({ heatingCircuitId }) => heatingCircuitId === circuit.id,
    )
    for (const source of sources) {
      const factor =
        source.co2FactorKgPerKwh ?? circuit.co2?.co2FactorKgPerKwh ?? 0
      if (factor <= 0) continue
      const stocks = data.billingData.fuelStocks.filter(
        (stock) =>
          stock.energySourceId === source.id &&
          stock.billingPeriodId === period.id &&
          (stock.openingQuantity?.value ?? 0) > 0 &&
          stock.openingCo2PricePerTonCents == null,
      )
      for (const stock of stocks)
        add(
          issue(
            'warning',
            'co2.opening_stock_price_missing',
            'co2',
            'CO₂-Preis des Anfangsbestands fehlt; es wird der Preis des Abrechnungsjahres angesetzt (§ 10 BEHG Lieferjahr)',
            {
              entity: { type: 'FuelStock', id: stock.id },
              path: ['openingCo2PricePerTonCents'],
              detail: `${
                previousPrice === null
                  ? 'Der CO₂-Preis des Vorjahres ist nicht ermittelbar.'
                  : `CO₂-Preis des Vorjahres ${formatEuroPerTon(previousPrice)}, des Abrechnungsjahres ${formatEuroPerTon(yearPrice)}.`
              } Der Anfangsbestand wurde vor dem Abrechnungsjahr geliefert; im Lieferpreis ist der CO₂-Preis des Lieferjahres enthalten. Bitte diesen Preis am Brennstoffbestand hinterlegen. Hinweis, keine Rechtsberatung.`,
            },
          ),
        )
    }
  }
}
