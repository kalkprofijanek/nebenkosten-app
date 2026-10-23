/**
 * E-Mail-Entwurf (mailto) für die Monatsinformation eines Mieters
 * (ADR-0014, Schritt 3): je Mieter ein eigener Entwurf, kein BCC, weil die
 * Werte personenbezogen sind. mailto kann keine Anhänge mitgeben; der Text
 * nennt deshalb den Dateinamen des vorher heruntergeladenen PDFs.
 */
const monthFormatter = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** `2026-03` → „März 2026“. */
export function monthLabel(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number]
  return monthFormatter.format(new Date(Date.UTC(year, monthIndex - 1, 1)))
}

export interface MonthlyInformationMailInput {
  readonly addresses: readonly string[]
  /** Anzeigename(n) der Personen; leer = neutrale Anrede. */
  readonly salutationName: string | null
  readonly month: string
  readonly unitLabel: string
  readonly fileName: string
  /** Absender für die Grußzeile (Eigentümergesellschaft); leer = ohne. */
  readonly senderName?: string | null
}

export function monthlyInformationMailSubject(
  month: string,
  unitLabel: string,
): string {
  return `Verbrauchsinformation ${monthLabel(month)} – ${unitLabel}`
}

export function monthlyInformationMailBody(
  input: MonthlyInformationMailInput,
): string {
  const label = monthLabel(input.month)
  return [
    input.salutationName ? `Guten Tag ${input.salutationName},` : 'Guten Tag,',
    '',
    `anbei erhalten Sie die monatliche Verbrauchsinformation für Heizung und Warmwasser (§ 6a HeizKV) für ${label}, Wohnung ${input.unitLabel}.`,
    '',
    `Die Werte finden Sie im angehängten PDF „${input.fileName}“.`,
    '',
    'Mit freundlichen Grüßen',
    ...(input.senderName?.trim() ? [input.senderName.trim()] : []),
  ].join('\r\n')
}

const encode = (value: string) => encodeURIComponent(value)

/** `mailto:`-Link mit URL-kodiertem Empfänger, Betreff und Text. */
export function monthlyInformationMailto(
  input: MonthlyInformationMailInput,
): string {
  const recipients = input.addresses
    .map((address) => encode(address).replace(/%40/gu, '@'))
    .join(',')
  const subject = encode(
    monthlyInformationMailSubject(input.month, input.unitLabel),
  )
  const body = encode(monthlyInformationMailBody(input))
  return `mailto:${recipients}?subject=${subject}&body=${body}`
}
