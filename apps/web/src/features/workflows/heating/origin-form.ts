/** Formularwerte zu Herkunft, Betragsgrundlage und Bestandsbewertung (PR-30). */
function choice<T extends string>(
  form: FormData,
  name: string,
  allowed: readonly T[],
): T | null {
  const value = String(form.get(name) ?? '')
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

/** Formularwerte; `null` löscht ein zuvor gesetztes Kennzeichen. */
export function readDeliveryOrigin(form: FormData) {
  return {
    origin: choice(form, 'origin', ['previous_owner', 'own'] as const),
    amountBasis: choice(form, 'amountBasis', [
      'invoice',
      'advance_payments',
      'estimate',
    ] as const),
  }
}

export function readStockValuation(form: FormData) {
  const reason = String(form.get('valuationReason') ?? '').trim()
  return {
    valuationBasis: choice(form, 'valuationBasis', [
      'acquisition_cost',
      'seller_valuation',
    ] as const),
    valuationReason: reason || null,
  }
}
