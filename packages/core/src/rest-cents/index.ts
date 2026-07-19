import { roundCentsHalfAwayFromZero } from '../rounding'

export interface ExactCentAllocation {
  readonly id: string
  readonly exactCents: number
}

export interface RoundedCentAllocation {
  readonly id: string
  readonly cents: number
}

/**
 * Verteilt Restcents nach dem größten Nachkomma-Rest.
 *
 * Die Rückgabe behält die Eingabereihenfolge. Bei identischen Resten
 * entscheidet die ID aufsteigend, damit das Ergebnis unabhängig von der
 * Eingabereihenfolge reproduzierbar bleibt.
 */
export function allocateLargestRemainder(
  allocations: readonly ExactCentAllocation[],
): RoundedCentAllocation[] {
  const ids = new Set<string>()
  const prepared = allocations.map(({ id, exactCents }, index) => {
    if (ids.has(id)) {
      throw new Error(`Restcent-Verteilung benötigt eindeutige IDs: "${id}"`)
    }
    ids.add(id)
    if (!Number.isFinite(exactCents)) {
      throw new Error('Restcent-Verteilung benötigt endliche Centbeträge')
    }
    const cents = Math.floor(exactCents)
    if (!Number.isSafeInteger(cents)) {
      throw new Error(
        'Restcent-Verteilung liegt außerhalb des sicheren Integerbereichs',
      )
    }
    return {
      id,
      index,
      cents,
      remainder: exactCents - cents,
    }
  })
  if (prepared.length === 0) return []

  const exactTotal = allocations.reduce(
    (sum, { exactCents }) => sum + exactCents,
    0,
  )
  const targetTotal = roundCentsHalfAwayFromZero(exactTotal)
  const floorTotal = prepared.reduce((sum, { cents }) => sum + cents, 0)
  const restCents = targetTotal - floorTotal
  if (
    !Number.isSafeInteger(restCents) ||
    restCents < 0 ||
    restCents > prepared.length
  ) {
    throw new Error('Restcent-Verteilung konnte nicht ausgeglichen werden')
  }

  const recipients = new Set(
    [...prepared]
      .sort(
        (left, right) =>
          right.remainder - left.remainder ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      )
      .slice(0, restCents)
      .map(({ index }) => index),
  )

  return prepared.map(({ id, index, cents }) => ({
    id,
    cents: cents + (recipients.has(index) ? 1 : 0),
  }))
}
