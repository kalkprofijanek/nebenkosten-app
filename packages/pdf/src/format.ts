const euroFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

const dateFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })

const NON_BREAKING_SPACE = ' '
const NARROW_NON_BREAKING_SPACE = ' '

/**
 * `Intl.NumberFormat` liefert je nach ICU-Version ein schmales
 * geschuetztes Leerzeichen (U+202F) oder ein geschuetztes Leerzeichen
 * (U+00A0) vor "Euro" statt eines normalen Leerzeichens - fuer die
 * PDF-Textausgabe und stabile Tests wird auf ein normales Leerzeichen
 * normalisiert.
 */
function normalizeSpaces(value: string): string {
  return value
    .split(NON_BREAKING_SPACE)
    .join(' ')
    .split(NARROW_NON_BREAKING_SPACE)
    .join(' ')
}

export function formatEuroCents(cents: number): string {
  // `|| 0` vermeidet die Ausgabe „-0,00 €“ für negative Null.
  return normalizeSpaces(euroFormatter.format(cents / 100 || 0))
}

export function formatPercent(value: number): string {
  return `${normalizeSpaces(value.toLocaleString('de-DE', { maximumFractionDigits: 1 }))} %`
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '–' : dateFormatter.format(date)
}

const allocationKeyLabels: Readonly<Record<string, string>> = {
  usable_area: 'nach Wohnfläche',
  heated_area: 'nach beheizter Fläche',
  consumption_units: 'nach Verbrauchseinheiten',
  residential_units: 'je Wohneinheit',
  direct: 'direkt zugeordnet',
}

export function formatAllocationKeyLabel(
  allocationKey: string | null | undefined,
): string {
  if (!allocationKey) return '–'
  return allocationKeyLabels[allocationKey] ?? allocationKey
}

export function balanceLabel(balanceCents: number): 'Nachzahlung' | 'Guthaben' {
  return balanceCents >= 0 ? 'Nachzahlung' : 'Guthaben'
}

/** IBAN in Vierergruppen (DIN 5008), z. B. „DE48 5605 1790 …“. */
export function formatIban(iban: string): string {
  return iban
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim()
}

/** Zahl im deutschen Format mit festen Nachkommastellen. */
export function formatNumber(value: number, fractionDigits = 2): string {
  return normalizeSpaces(
    value.toLocaleString('de-DE', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
  )
}

/** Cent-Betrag je Einheit als Euro-Preis mit vier Nachkommastellen. */
export function formatUnitPrice(centsPerUnit: number, unit: string): string {
  return `${formatNumber(centsPerUnit / 100, 4)} € je ${unit}`
}

const quantityUnitLabels: Readonly<Record<string, string>> = {
  l: 'l',
  kg: 'kg',
  t: 't',
  kWh: 'kWh',
  m3: 'm³',
  m2: 'm²',
  einheiten: 'Einheiten',
  personen: 'Personen',
  stueck: 'Stück',
}

export function formatQuantityUnit(unit: string | null | undefined): string {
  if (!unit) return ''
  return quantityUnitLabels[unit] ?? unit
}

/** ISO-Datum plus Kalendertage (UTC, ohne Zeitzonen-Drift). */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
