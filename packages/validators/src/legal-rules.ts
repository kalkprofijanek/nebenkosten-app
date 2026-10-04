/**
 * Regelverzeichnis: Rechtsregeln mit Geltungszeitraum, gegen die ein
 * Abrechnungsjahr geprüft wird. Eine Abrechnung wird nach dem Recht ihres
 * Zeitraums geprüft, nicht nach dem Recht von heute.
 *
 * Aufgenommen wird nur, was eine Prüfung tatsächlich anwendet. Wer eine
 * Regel ändert oder ergänzt, setzt `LEGAL_RULES_AS_OF` auf den Tag der
 * Durchsicht und begründet die Änderung im Pull Request. Idee nach
 * Mietfuchs (MIT-Lizenz), Texte eigenständig formuliert.
 */
export interface LegalRule {
  readonly code: string
  readonly title: string
  /** Rechtsgrundlage, wie sie ein Mensch nachschlägt. */
  readonly norm: string
  /** Ein bis zwei Sätze in einfachen Worten. */
  readonly summary: string
  /** ISO-Datum, inklusive; fehlt die Grenze, gilt die Regel unbegrenzt. */
  readonly validFrom?: string
  readonly validTo?: string
}

export const LEGAL_RULES_AS_OF = '2026-10-04'

export const LEGAL_RULES: readonly LegalRule[] = [
  {
    code: 'cable-tv-signal',
    title: 'Kabelfernsehen nicht mehr umlagefähig',
    norm: '§ 2 Nr. 15 BetrKV, § 230 Abs. 4 TKG',
    summary:
      'Entgelte für das Fernsehsignal eines Kabelanschlusses dürfen seit dem 01.07.2024 nicht mehr als Betriebskosten umgelegt werden. Umlagefähig bleiben je nach Anlage nur noch einzelne Kosten, etwa der Betriebsstrom einer Gemeinschaftsantenne oder das Bereitstellungsentgelt einer Glasfaser-Verteilanlage.',
    validFrom: '2024-07-01',
  },
  {
    code: 'remote-reading',
    title: 'Fernablesbare Erfassungsgeräte',
    norm: '§ 5 Abs. 2 und 3, § 6a, § 12 Abs. 1 HeizkostenV',
    summary:
      'Zähler und Heizkostenverteiler mussten bis zum 31.12.2026 fernablesbar nachgerüstet oder ersetzt werden; dann sind monatliche Verbrauchsinformationen zu erteilen. Fehlt das, darf der Mieter seinen Anteil an den Heizkosten jeweils um 3 % kürzen.',
    validFrom: '2027-01-01',
  },
]

/** Regeln, deren Geltungszeitraum den Abrechnungszeitraum berührt. */
export function legalRulesForPeriod(
  periodStart: string,
  periodEnd: string,
): LegalRule[] {
  return LEGAL_RULES.filter(
    (rule) =>
      (rule.validFrom === undefined || rule.validFrom <= periodEnd) &&
      (rule.validTo === undefined || rule.validTo >= periodStart),
  )
}

export function legalRule(code: string): LegalRule {
  const rule = LEGAL_RULES.find((entry) => entry.code === code)
  if (!rule) throw new Error(`Regel "${code}" fehlt im Regelverzeichnis.`)
  return rule
}
