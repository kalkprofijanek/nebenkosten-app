/**
 * Prüfungen zum Eigentümerwechsel im Abrechnungsjahr (PR-30). Kosten bis zum
 * Übergabetag liegen oft nur als Erwerberabrechnung vor: gezahlte Abschläge
 * statt Rechnungsbeträgen, geschätzte Bestände, Brennstoff zum Schätzpreis.
 * Die Prüfungen gelten auch ohne Eigentümerwechsel, soweit sie Energie
 * betreffen (Abschläge, Preissprünge). Nur Warnungen.
 *
 * Offene Entscheidung: Die Preisabweichung von 20 % ist eine Prüfschwelle
 * der App ohne Rechtsgrundlage.
 */
import { isGridEnergySource } from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  FuelDelivery,
  ValidationIssue,
} from '@nebenkosten/schema'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

export const PRICE_DEVIATION_LIMIT = 0.2

function euro(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 4,
  })
}

/** Preis je Mengeneinheit in Cent, `null` ohne Menge oder Betrag. */
function unitPrice(delivery: FuelDelivery): number | null {
  const quantity = delivery.quantity?.value
  if (!quantity || delivery.amountCents == null) return null
  return delivery.amountCents / quantity
}

const BASIS_LABEL = {
  advance_payments: 'gezahlte Abschläge',
  estimate: 'eine Schätzung',
} as const

export function ownershipChangeIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  const deliveries = data.billingData.fuelDeliveries.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )
  const sources = new Map(
    data.billingData.energySources.map((source) => [source.id, source]),
  )
  const sourceLabel = (id: string) => {
    const source = sources.get(id)
    return source?.name ?? source?.sourceType ?? source?.key ?? id
  }

  // 1. Energie nach Abschlägen oder Schätzung statt Rechnung.
  for (const delivery of deliveries) {
    if (
      delivery.amountBasis !== 'advance_payments' &&
      delivery.amountBasis !== 'estimate'
    )
      continue
    add(
      issue(
        'warning',
        'heating.energy_amount_not_invoiced',
        'heating',
        'Energiekosten ohne Rechnungsbetrag',
        {
          entity: { type: 'FuelDelivery', id: delivery.id },
          detail: `Der Betrag für ${sourceLabel(delivery.energySourceId)} beruht auf ${BASIS_LABEL[delivery.amountBasis]}. Abzurechnen sind die tatsächlichen Kosten laut Rechnung bzw. Jahresabrechnung des Versorgers; Abschläge enthalten oft Vorauszahlungen für Folgemonate oder sind nicht um Gutschriften bereinigt.`,
        },
      ),
    )
  }
  const heatingCategories = new Set(
    data.billingData.costCategories
      .filter(
        (category) =>
          category.billingPeriodId === period.id && category.kind === 'heating',
      )
      .map(({ id }) => id),
  )
  for (const entry of data.billingData.costEntries) {
    if (!heatingCategories.has(entry.costCategoryId)) continue
    if (
      entry.amountBasis !== 'advance_payments' &&
      entry.amountBasis !== 'estimate'
    )
      continue
    add(
      issue(
        'warning',
        'heating.energy_amount_not_invoiced',
        'heating',
        'Heizkosten ohne Rechnungsbetrag',
        {
          entity: { type: 'CostEntry', id: entry.id },
          detail: `Die Position beruht auf ${BASIS_LABEL[entry.amountBasis]} statt auf einer Rechnung.`,
        },
      ),
    )
  }

  // 2. Verkäuferzeitraum ohne Menge (Energieeinsatz und FIFO nicht prüfbar).
  const transfer = period.ownershipChange?.transferDate
  if (transfer) {
    const bySource = new Map<string, FuelDelivery[]>()
    for (const delivery of deliveries) {
      const previous =
        delivery.origin === 'previous_owner' ||
        (delivery.origin == null &&
          delivery.date != null &&
          delivery.date < transfer)
      if (!previous) continue
      bySource.set(delivery.energySourceId, [
        ...(bySource.get(delivery.energySourceId) ?? []),
        delivery,
      ])
    }
    for (const [sourceId, items] of bySource)
      if (items.every((delivery) => !delivery.quantity?.value))
        add(
          issue(
            'warning',
            'heating.previous_owner_quantity_missing',
            'heating',
            'Verbrauch des Voreigentümers ohne Menge',
            {
              entity: { type: 'EnergySource', id: sourceId },
              detail: `Für ${sourceLabel(sourceId)} sind bis zum Übergabetag nur Beträge, keine Mengen (Liter, kg, kWh) erfasst. Ohne Menge lassen sich Energieeinsatz, Bestand und Preis nicht prüfen; bitte Zählerstände bzw. Mengen aus der Erwerberabrechnung oder den Versorgerrechnungen nachtragen.`,
            },
          ),
        )
  }

  // 3. Bestand zum Schätzwert des Voreigentümers ohne Begründung.
  for (const stock of data.billingData.fuelStocks) {
    if (stock.billingPeriodId !== period.id) continue
    if (stock.valuationBasis !== 'seller_valuation' || stock.valuationReason)
      continue
    add(
      issue(
        'warning',
        'heating.opening_stock_seller_valuation',
        'heating',
        'Anfangsbestand mit Bewertung des Voreigentümers',
        {
          entity: { type: 'FuelStock', id: stock.id },
          detail:
            'Übernommene Bestände sind nach FIFO mit dem belegten Anschaffungspreis zu bewerten. Die Bewertung des Voreigentümers ist nur zulässig, wenn kein Anschaffungspreis belegt ist; bitte Begründung angeben.',
        },
      ),
    )
  }

  // 4. Preis je Einheit weicht stark von der Folgelieferung bzw. dem Vorjahr ab.
  const previousPeriod = data.billingData.billingPeriods.find(
    (candidate) =>
      candidate.propertyId === period.propertyId &&
      candidate.year === period.year - 1,
  )
  for (const [sourceId, source] of sources) {
    // Leitungsgebundene Energie: Grundpreise und Abrechnungszeiträume lassen
    // den Preis je kWh stark schwanken; geprüft werden lagerfähige Brennstoffe.
    if (isGridEnergySource(source)) continue
    const own = deliveries
      .filter(({ energySourceId }) => energySourceId === sourceId)
      .map((delivery) => ({ delivery, price: unitPrice(delivery) }))
      .filter(
        (item): item is { delivery: FuelDelivery; price: number } =>
          item.price !== null,
      )
      .sort((left, right) =>
        (left.delivery.date ?? '').localeCompare(right.delivery.date ?? ''),
      )
    if (own.length === 0) continue
    const references: { price: number; label: string }[] = []
    const stock = data.billingData.fuelStocks.find(
      (item) =>
        item.billingPeriodId === period.id && item.energySourceId === sourceId,
    )
    const stockPrice =
      stock?.openingPricePerUnitCents ??
      (stock?.openingValueCents != null && stock.openingQuantity?.value
        ? stock.openingValueCents / stock.openingQuantity.value
        : null)
    if (stock && stockPrice != null && stockPrice > 0) {
      const next = own[0]!
      if (Math.abs(stockPrice / next.price - 1) > PRICE_DEVIATION_LIMIT)
        add(
          issue(
            'warning',
            'heating.fuel_price_deviation',
            'heating',
            'Preis des Anfangsbestands weicht stark ab',
            {
              entity: { type: 'FuelStock', id: stock.id },
              detail: `Anfangsbestand ${sourceLabel(sourceId)}: ${euro(stockPrice)} je Einheit, Folgelieferung ${euro(next.price)} (Abweichung über ${Math.round(PRICE_DEVIATION_LIMIT * 100)} %). Bitte prüfen, ob der Bestand mit dem Anschaffungspreis bewertet ist.`,
            },
          ),
        )
    }
    if (previousPeriod) {
      const previousSources = new Set(
        data.billingData.energySources
          .filter(
            (candidate) =>
              candidate.key === source.key &&
              data.billingData.heatingCircuits.some(
                (circuit) =>
                  circuit.id === candidate.heatingCircuitId &&
                  circuit.billingPeriodId === previousPeriod.id,
              ),
          )
          .map(({ id }) => id),
      )
      const previous = data.billingData.fuelDeliveries.filter(
        (delivery) =>
          delivery.billingPeriodId === previousPeriod.id &&
          previousSources.has(delivery.energySourceId),
      )
      const quantity = previous.reduce(
        (sum, delivery) => sum + (delivery.quantity?.value ?? 0),
        0,
      )
      const cents = previous.reduce(
        (sum, delivery) =>
          sum + (delivery.quantity?.value ? (delivery.amountCents ?? 0) : 0),
        0,
      )
      if (quantity > 0)
        references.push({
          price: cents / quantity,
          label: `Vorjahr ${previousPeriod.year}`,
        })
    }
    own.forEach(({ delivery, price }, index) => {
      const next = own[index + 1]
      const candidates = [
        ...(next ? [{ price: next.price, label: 'Folgelieferung' }] : []),
        ...references,
      ]
      const deviation = candidates.find(
        (reference) =>
          Math.abs(price / reference.price - 1) > PRICE_DEVIATION_LIMIT,
      )
      if (!deviation) return
      add(
        issue(
          'warning',
          'heating.fuel_price_deviation',
          'heating',
          'Preis je Einheit weicht stark ab',
          {
            entity: { type: 'FuelDelivery', id: delivery.id },
            detail: `${sourceLabel(sourceId)}${delivery.date ? ` vom ${delivery.date}` : ''}: ${euro(price)} je Einheit, ${deviation.label} ${euro(deviation.price)} (Abweichung über ${Math.round(PRICE_DEVIATION_LIMIT * 100)} %). Bitte Menge, Betrag und Einheit prüfen; bei übernommenen Positionen den Anschaffungspreis statt eines Schätzpreises ansetzen.`,
          },
        ),
      )
    })
  }
}
