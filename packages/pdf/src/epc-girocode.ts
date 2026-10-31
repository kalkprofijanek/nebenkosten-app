/**
 * EPC-QR-Code („GiroCode“) nach EPC069-12, Version 002, Zeichensatz UTF-8.
 * Die Banking-App des Mieters übernimmt daraus Empfänger, IBAN, Betrag und
 * Verwendungszweck; die Abrechnung selbst ändert sich dadurch nicht.
 */
export interface EpcPaymentInput {
  readonly name: string
  readonly iban: string
  readonly bic: string | null
  readonly amountCents: number
  readonly remittance: string
}

const MAX_NAME_LENGTH = 70
const MAX_REMITTANCE_LENGTH = 140
/** Höchstbetrag laut EPC069-12: 999.999.999,99 EUR. */
const MAX_AMOUNT_CENTS = 99_999_999_999

function singleLine(value: string, maxLength: number): string {
  // NEL (U+0085) trennt Zeilen wie \n; übrige Steuerzeichen fallen weg.
  const cleaned = value
    .replace(/[\s\u0085]+/gu, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim()
  return Array.from(cleaned).slice(0, maxLength).join('')
}

function validIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
  let remainder = 0
  for (const character of rearranged) {
    const digits = /[A-Z]/.test(character)
      ? String(character.charCodeAt(0) - 55)
      : character
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

function formatAmount(cents: number): string {
  const euros = Math.floor(cents / 100)
  const rest = String(cents % 100).padStart(2, '0')
  return `EUR${euros}.${rest}`
}

/**
 * Liefert die Nutzdaten des QR-Codes oder `null`, wenn kein gültiger Code
 * möglich ist (kein positiver Betrag, ungültige IBAN/BIC, kein Empfänger).
 * Ein fehlerhafter Code wäre schlechter als keiner.
 */
export function buildEpcPayload(input: EpcPaymentInput): string | null {
  const { amountCents } = input
  if (
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > MAX_AMOUNT_CENTS
  )
    return null
  const iban = input.iban.replace(/\s+/g, '').toUpperCase()
  if (!validIban(iban)) return null
  const bic = (input.bic ?? '').replace(/\s+/g, '').toUpperCase()
  if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return null
  const name = singleLine(input.name, MAX_NAME_LENGTH)
  if (!name) return null
  return [
    'BCD',
    '002',
    '1',
    'SCT',
    bic,
    name,
    iban,
    formatAmount(amountCents),
    '',
    '',
    singleLine(input.remittance, MAX_REMITTANCE_LENGTH),
  ].join('\n')
}
