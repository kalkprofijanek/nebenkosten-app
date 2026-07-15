/**
 * Verbindliche Implementierung der Migrationsregel `euro_to_cents`
 * (docs/MIGRATION.md Abschnitt 3). PR 04 MUSS diese Funktion verwenden —
 * eine eigene Rundung wäre eine stille Vertragsabweichung.
 *
 * Anforderungen:
 * - kaufmännische Rundung „halbe Cent weg von Null“ — auch für negative
 *   Beträge (`Math.round` allein rundet -0,5 fälschlich Richtung +∞);
 * - robust gegen binäre Fließkommadarstellung (z. B. ist
 *   `1.005 * 100 === 100.49999…`; naives Runden ergäbe 100 statt 101).
 *   Dafür wird der Zwischenwert auf 15 signifikante Dezimalstellen
 *   normalisiert, bevor gerundet wird.
 */
export function euroToCents(euro: number): number {
  if (!Number.isFinite(euro)) {
    throw new RangeError(`euroToCents: Betrag ist nicht endlich: ${euro}`)
  }
  const sign = euro < 0 ? -1 : 1
  const centsExact = Number((Math.abs(euro) * 100).toPrecision(15))
  const cents = sign * Math.round(centsExact)
  // -0 vermeiden (0 und -0 sind in JSON/Vergleichen nicht unterscheidbar,
  // aber Object.is-Tests und Serialisierer stolpern darüber).
  return cents === 0 ? 0 : cents
}

/**
 * Prüft, ob die Euro→Cent-Konvertierung einen echten Präzisionsverlust
 * jenseits der Float-Darstellung hatte (docs/MIGRATION.md: erzeugt eine
 * `warning`). Toleranz: 0,001 Cent auf den normalisierten Zwischenwert.
 */
export function euroToCentsLostPrecision(euro: number): boolean {
  const centsExact = Number((Math.abs(euro) * 100).toPrecision(15))
  const remainder = Math.abs(centsExact - Math.round(centsExact))
  // Genau ,5 Cent ist gewollte kaufmännische Rundung, kein Verlust.
  if (Math.abs(remainder - 0.5) < 1e-9) return false
  return remainder > 0.001
}
