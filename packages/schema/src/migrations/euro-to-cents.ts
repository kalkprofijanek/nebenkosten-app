/**
 * Verbindliche Implementierung der Migrationsregel `euro_to_cents`.
 * Die kanonische Dezimaldarstellung des JavaScript-Werts wird mit BigInt
 * skaliert. So bleiben signifikante Stellen erhalten und halbe Cent werden
 * für beide Vorzeichen symmetrisch weg von Null gerundet.
 */
interface ScaledCents {
  denominator: bigint
  quotient: bigint
  remainder: bigint
  sign: 1 | -1
}

const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER)

function scaleEuroToCents(euro: number): ScaledCents {
  if (!Number.isFinite(euro)) {
    throw new RangeError(`euroToCents: Betrag ist nicht endlich: ${euro}`)
  }

  const [coefficient, exponentText] = Math.abs(euro)
    .toString()
    .toLowerCase()
    .split('e')
  const exponent = exponentText === undefined ? 0 : Number(exponentText)
  const [integerPart, fractionPart = ''] = coefficient!.split('.')
  const digits = BigInt(`${integerPart}${fractionPart}`)
  const centExponent = exponent - fractionPart.length + 2

  if (centExponent >= 0) {
    return {
      denominator: 1n,
      quotient: digits * 10n ** BigInt(centExponent),
      remainder: 0n,
      sign: euro < 0 ? -1 : 1,
    }
  }

  const denominator = 10n ** BigInt(-centExponent)
  return {
    denominator,
    quotient: digits / denominator,
    remainder: digits % denominator,
    sign: euro < 0 ? -1 : 1,
  }
}

function roundedSafeCents(parts: ScaledCents): number {
  const roundUp = parts.remainder * 2n >= parts.denominator
  const absoluteCents = parts.quotient + (roundUp ? 1n : 0n)
  if (absoluteCents > MAX_SAFE_CENTS) {
    throw new RangeError(
      'euroToCents: Ergebnis liegt außerhalb des sicheren Centbereichs',
    )
  }
  if (absoluteCents === 0n) return 0
  return parts.sign * Number(absoluteCents)
}

export function euroToCents(euro: number): number {
  return roundedSafeCents(scaleEuroToCents(euro))
}

/**
 * Meldet Sub-Cent-Verlust über 0,001 Cent. Exakte Halb-Cent-Werte sind eine
 * gewollte kaufmännische Rundung und daher keine Präzisionswarnung.
 */
export function euroToCentsLostPrecision(euro: number): boolean {
  const parts = scaleEuroToCents(euro)
  roundedSafeCents(parts)
  if (parts.remainder === 0n) return false
  if (parts.remainder * 2n === parts.denominator) return false
  const distance =
    parts.remainder * 2n < parts.denominator
      ? parts.remainder
      : parts.denominator - parts.remainder
  return distance * 1_000n > parts.denominator
}
