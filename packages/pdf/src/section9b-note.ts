/**
 * Eigene Anmerkung zu einer Aufteilung nach § 9b Abs. 3 HeizKV.
 *
 * Der Rechenweg (Gradtagszahlen bzw. Tage) wird im PDF automatisch aus den
 * Daten erzeugt. Der gespeicherte Begründungstext enthält ihn häufig ein
 * zweites Mal, weil die Erfassungsmaske ihn vorbelegt
 * (`degreeDaySplitExplanation` in apps/web: „Keine Zwischenablesung
 * möglich: <Grund>. Aufteilung nach Gradtagszahlen (§ 9b Abs. 3 HeizKV,
 * VDI 2067), Zeitraum …: … = … Einheiten.“). Hier bleibt nur der frei
 * formulierte Teil übrig; `null`, wenn der Text nichts darüber hinaus enthält.
 */
const GENERATED_CALCULATION =
  /\s*(?:Zeitanteilige Aufteilung|Aufteilung nach Gradtagszahlen|Aufteilung nach Tagen)\s*\(§\s*9b[\s\S]*$/u

const NO_INTERIM_READING_PREFIX =
  /^Keine Zwischenablesung (?:möglich|beim Nutzerwechsel)\s*(?:\((?<inner>[^)]*)\)\s*[.:;]?|[:;.,–-])?\s*/u

export function section9bOwnNote(
  reason: string | null | undefined,
): string | null {
  let text = (reason ?? '').trim().replace(GENERATED_CALCULATION, '').trim()
  const prefix = NO_INTERIM_READING_PREFIX.exec(text)
  if (prefix) {
    const inner = prefix.groups?.inner?.trim() ?? ''
    text = `${inner}${inner && text.length > prefix[0].length ? '. ' : ''}${text.slice(prefix[0].length)}`
  }
  text = text.trim().replace(/[.\s]+$/u, '')
  return text.length > 0 ? `${text}.` : null
}
