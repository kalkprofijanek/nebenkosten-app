export const CONTROL_TOLERANCE_CENTS = 1

export function roundCentsHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Cent-Rundung benötigt eine endliche Zahl')
  }
  const absolute = Math.abs(value)
  const rounded = Math.floor(absolute + 0.5 + Number.EPSILON)
  if (!Number.isSafeInteger(rounded)) {
    throw new Error(
      'Gerundeter Centbetrag liegt außerhalb des sicheren Integerbereichs',
    )
  }
  if (rounded === 0) return 0
  return value < 0 ? -rounded : rounded
}
