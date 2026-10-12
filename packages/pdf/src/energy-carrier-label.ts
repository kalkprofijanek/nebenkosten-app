/**
 * Anzeigenamen der Energieträger im PDF. Die Eingabe ist Freitext und wird
 * aus Altdaten oft ohne Umlaut übernommen („Heizoel“, „Fernwaerme“). Für die
 * Ausgabe werden bekannte Wortstämme mit Umlaut geschrieben; unbekannte
 * Angaben bleiben unverändert.
 */
const CARRIER_WORDS: readonly (readonly [RegExp, string])[] = [
  [/heiz(?:oe|ö)l/giu, 'heizöl'],
  [/fernw(?:ae|ä)rme/giu, 'fernwärme'],
  [/nahw(?:ae|ä)rme/giu, 'nahwärme'],
  [/fl(?:ue|ü)ssiggas/giu, 'flüssiggas'],
  [/w(?:ae|ä)rmepumpe/giu, 'wärmepumpe'],
]

/** Kurzangaben (Groß-/Kleinschreibung egal), die als Ganzes ersetzt werden. */
const EXACT_LABELS: Readonly<Record<string, string>> = {
  oel: 'Heizöl',
  erdgas: 'Erdgas',
  strom: 'Strom',
  pellets: 'Pellets',
}

function withCase(original: string, replacement: string): string {
  const first = original.charAt(0)
  return first === first.toUpperCase()
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement
}

export function energyCarrierDisplayName(raw: string): string {
  const trimmed = raw.trim()
  const exact = EXACT_LABELS[trimmed.toLowerCase()]
  if (exact) return exact
  return CARRIER_WORDS.reduce(
    (text, [pattern, replacement]) =>
      text.replace(pattern, (match) => withCase(match, replacement)),
    trimmed,
  )
}
