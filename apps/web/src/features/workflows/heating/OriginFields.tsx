import type { FuelDelivery, FuelStock } from '@nebenkosten/schema'

/**
 * Herkunft und Betragsgrundlage einer Lieferung sowie Bewertung des
 * Anfangsbestands (PR-30 Teil 2). Leere Auswahl = nicht angegeben (gilt als
 * eigene Rechnung).
 */
export function DeliveryOriginFields({
  delivery,
  suffix = '',
}: {
  readonly delivery?: Pick<FuelDelivery, 'origin' | 'amountBasis'>
  readonly suffix?: string
}) {
  const label = (text: string) => (suffix ? `${text} ${suffix}` : text)
  return (
    <>
      <label>
        <span>{label('Betragsgrundlage')}</span>
        <select name="amountBasis" defaultValue={delivery?.amountBasis ?? ''}>
          <option value="">Nicht angegeben</option>
          <option value="invoice">Rechnung</option>
          <option value="advance_payments">Gezahlte Abschläge</option>
          <option value="estimate">Schätzung</option>
        </select>
      </label>
      <label>
        <span>{label('Herkunft')}</span>
        <select name="origin" defaultValue={delivery?.origin ?? ''}>
          <option value="">Eigene</option>
          <option value="previous_owner">Vom Voreigentümer übernommen</option>
        </select>
      </label>
    </>
  )
}

export function StockValuationFields({
  stock,
}: {
  readonly stock?: Pick<FuelStock, 'valuationBasis' | 'valuationReason'>
}) {
  return (
    <>
      <label>
        <span>Bewertung des Anfangsbestands</span>
        <select
          name="valuationBasis"
          defaultValue={stock?.valuationBasis ?? ''}
        >
          <option value="">Nicht angegeben</option>
          <option value="acquisition_cost">Belegter Anschaffungspreis</option>
          <option value="seller_valuation">Bewertung des Voreigentümers</option>
        </select>
      </label>
      <label>
        <span>Begründung der Bewertung</span>
        <input
          type="text"
          name="valuationReason"
          defaultValue={stock?.valuationReason ?? ''}
        />
      </label>
    </>
  )
}
