const GERMAN_EURO = /^-?(?:0|[1-9]\d{0,2}(?:\.\d{3})*|[1-9]\d*)(?:,\d{1,2})?$/u
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:[,.]\d+)?$/u

export function formatEuroInput(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error('Der Centbetrag ist ungültig.')
  }
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function parseEuroCents(rawValue: string): number {
  const value = rawValue.trim()
  if (!GERMAN_EURO.test(value)) {
    throw new Error('Bitte einen gültigen Eurobetrag eingeben.')
  }
  const normalized = value.replaceAll('.', '').replace(',', '.')
  const cents = Math.round(Number(normalized) * 100)
  if (!Number.isSafeInteger(cents)) {
    throw new Error('Der Eurobetrag ist zu groß.')
  }
  return cents
}

export function parseOptionalNumber(rawValue: string): number | null {
  const value = rawValue.trim()
  if (value === '') return null
  if (!DECIMAL.test(value)) {
    throw new Error('Bitte eine gültige Zahl eingeben.')
  }
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed)) {
    throw new Error('Bitte eine endliche Zahl eingeben.')
  }
  return parsed
}
