import { calculateEnergySourceFuel } from '@nebenkosten/core'
import type { EnergySource, FuelDelivery, FuelStock } from '@nebenkosten/schema'

interface FuelSummaryProps {
  readonly source: EnergySource
  readonly billingPeriodId: string
  readonly stocks: readonly FuelStock[]
  readonly deliveries: readonly FuelDelivery[]
}

const quantityFormat = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 3,
})
const moneyFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

export function FuelSummary({
  source,
  billingPeriodId,
  stocks,
  deliveries,
}: FuelSummaryProps) {
  const selectedStocks = stocks.filter(
    (item) =>
      item.energySourceId === source.id &&
      item.billingPeriodId === billingPeriodId,
  )
  const selectedDeliveries = deliveries.filter(
    (item) =>
      item.energySourceId === source.id &&
      item.billingPeriodId === billingPeriodId,
  )
  if (selectedStocks.length + selectedDeliveries.length === 0) {
    return (
      <p>
        Noch keine Bestände oder Lieferungen für diese Energiequelle erfasst.
      </p>
    )
  }
  const hasQuantities =
    selectedStocks.some((item) => item.openingQuantity != null) ||
    selectedDeliveries.some((item) => item.quantity != null)
  const negativeQuantity =
    selectedStocks.some(
      (item) =>
        (item.openingQuantity?.value ?? 0) < 0 ||
        (item.remainingQuantity?.value ?? 0) < 0,
    ) || selectedDeliveries.some((item) => (item.quantity?.value ?? 0) < 0)
  if (negativeQuantity)
    return (
      <p role="alert">
        Negative Mengen sind nicht als Verbrauchsvorschau darstellbar. Bitte
        Bestände und Lieferungen korrigieren.
      </p>
    )
  const incomplete =
    selectedStocks.some(
      (item) =>
        (item.openingQuantity != null &&
          item.openingQuantity.value > 0 &&
          item.openingValueCents == null &&
          item.openingPricePerUnitCents == null) ||
        (hasQuantities &&
          item.openingValueCents != null &&
          item.openingQuantity == null),
    ) ||
    selectedDeliveries.some(
      (item) =>
        item.amountCents == null || (hasQuantities && item.quantity == null),
    )
  if (incomplete)
    return (
      <p role="alert">
        Mengen oder Werte fehlen. Bitte Bestände und Lieferungen ergänzen, bevor
        Sie die Verbrauchskosten prüfen.
      </p>
    )

  let trace
  try {
    trace = calculateEnergySourceFuel(
      source,
      selectedStocks,
      selectedDeliveries,
    ).trace
  } catch {
    return (
      <p role="alert">
        Die Brennstoffübersicht ist nicht berechenbar. Bitte die Mengeneinheiten
        von Bestand und Lieferungen vereinheitlichen.
      </p>
    )
  }
  if (trace.overstockQuantity > 0)
    return (
      <p role="alert">
        Der Restbestand übersteigt die verfügbare Menge. Bitte Bestand und
        Lieferungen prüfen.
      </p>
    )
  const unit = trace.quantityUnit ?? ''
  const quantity = (value: number) =>
    `${quantityFormat.format(value)} ${unit}`.trim()
  const opening = trace.lots
    .filter((lot) => lot.kind === 'opening_stock')
    .reduce((sum, lot) => sum + lot.quantity, 0)
  const delivered = trace.lots
    .filter((lot) => lot.kind === 'delivery')
    .reduce((sum, lot) => sum + lot.quantity, 0)
  const missingRest =
    selectedStocks.length === 0 ||
    selectedStocks.some((item) => item.remainingQuantity == null)
  return (
    <section className="data-panel" aria-label="Brennstoffübersicht">
      <h2>Brennstoffübersicht · {source.name ?? source.key}</h2>
      {trace.method === 'fifo' ? (
        <>
          <p>Anfangsbestand + Lieferungen − Restbestand = Verbrauch</p>
          <p>
            <strong>
              {quantity(opening)} + {quantity(delivered)} −{' '}
              {quantity(trace.requestedRemainingQuantity)} ={' '}
              {quantity(trace.consumedQuantity)}
            </strong>
          </p>
          {missingRest ? (
            <p role="alert">
              Restbestand fehlt. Die Vorschau rechnet vorläufig mit null; bitte
              den tatsächlichen Restbestand erfassen.
            </p>
          ) : null}
          <dl>
            <dt>Verfügbarer Brennstoffwert</dt>
            <dd>{moneyFormat.format(trace.availableValueCents / 100)}</dd>
            <dt>Restwert (FIFO)</dt>
            <dd>{moneyFormat.format(trace.remainingValueCents / 100)}</dd>
            <dt>Verbrauchskosten (FIFO)</dt>
            <dd>{moneyFormat.format(trace.fifoConsumptionCostCents / 100)}</dd>
          </dl>
          <p>
            Ältere Bestände werden zuerst verbraucht. Der Restwert stammt aus
            den jüngsten Lieferungen.
          </p>
        </>
      ) : (
        <>
          <p>Direkte Kosten ohne Mengenbewertung</p>
          <p>
            <strong>
              {moneyFormat.format(trace.fifoConsumptionCostCents / 100)}
            </strong>
          </p>
          <p>
            Ohne Mengen lässt sich kein Brennstoffverbrauch nach FIFO
            nachweisen.
          </p>
        </>
      )}
      <p>
        Vorschau der gespeicherten Angaben für diese Energiequelle und dieses
        Abrechnungsjahr. CO₂, Warmwasser und Heiznebenkosten folgen in der
        Abrechnung.
      </p>
    </section>
  )
}
