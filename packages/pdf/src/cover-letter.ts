/**
 * Platzhalter-Interpolation für `BillingPeriod.coverLetter.text` (Legacy
 * "Anschreiben (Begleittext im Mieter-PDF)", `legacy/index.html:3239`).
 * Unbekannte `{{...}}`-Platzhalter bleiben unverändert stehen, statt still
 * zu verschwinden — Tippfehler in der Vorlage fallen so sofort auf.
 */
export interface CoverLetterPlaceholders {
  readonly anrede: string
  readonly name: string
  readonly nutzeinheit: string
  readonly jahr: string
  readonly objekt: string
  readonly saldo: string
  readonly saldo_art: string
  readonly datum: string
  readonly frist: string
}

const PLACEHOLDER_PATTERN = /\{\{\s*(\w+)\s*\}\}/g

export function renderCoverLetter(
  template: string,
  values: CoverLetterPlaceholders,
): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    const record = values as unknown as Record<string, string>
    return key in record ? record[key]! : match
  })
}
