import type {
  Content,
  ContentStack,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import { resolveShippingAddress } from '@nebenkosten/core'
import { buildRecipientBlock, buildSenderBlock } from './address'
import type { TenantStatementContext } from './contracts'
import { formatEuroCents, formatIsoDate } from './format'

const BLUE = '#1a3a5c'
const MUTED = '#5a6a78'

export const PREPAYMENT_ADJUSTMENT_TITLE =
  'Anpassung der Betriebskostenvorauszahlung gemäß § 560 Abs. 4 BGB'

/** pdfmake-ID des Rücksendeabschnitts (für Tests und spätere Layouts). */
export const PREPAYMENT_RETURN_SLIP_ID = 'vz-ruecksendeabschnitt'

/**
 * Beschlossene Anpassung der monatlichen Vorauszahlung. Alle Beträge sind
 * ganze Cent; `validFrom` ist ein ISO-Datum (Erster eines Monats).
 */
export interface PrepaymentAdjustmentLetter {
  readonly previousMonthlyCents: number
  readonly newMonthlyCents: number
  /** Kostenanteil des Abrechnungsjahres, hochgerechnet auf 365 Tage. */
  readonly annualizedCostsCents: number
  readonly validFrom: string
}

/** Monatlicher Kostenwert, kaufmännisch auf Cent gerundet. */
export function monthlyCostCents(annualizedCostsCents: number): number {
  return Math.round(annualizedCostsCents / 12)
}

/** Monatlicher Kostenwert, auf volle Euro aufgerundet. */
export function roundedUpMonthlyCents(annualizedCostsCents: number): number {
  return Math.ceil(annualizedCostsCents / 1200) * 100
}

function assertAdjustment(adjustment: PrepaymentAdjustmentLetter): void {
  const amounts = [
    adjustment.previousMonthlyCents,
    adjustment.newMonthlyCents,
    adjustment.annualizedCostsCents,
  ]
  if (amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0))
    throw new Error('Die Beträge der Vorauszahlungsanpassung sind ungültig.')
  if (!/^\d{4}-\d{2}-01$/u.test(adjustment.validFrom))
    throw new Error(
      'Die neue Vorauszahlung muss ab dem Ersten eines Monats gelten.',
    )
}

function checkbox(label: string): Content {
  return {
    columns: [
      {
        width: 14,
        canvas: [{ type: 'rect', x: 0, y: 1, w: 8, h: 8, lineWidth: 0.8 }],
      },
      { width: '*', text: label },
    ],
    margin: [0, 2, 0, 2],
  }
}

function signatureField(label: string): Content {
  return {
    stack: [
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 0.6 },
        ],
        margin: [0, 26, 0, 2],
      },
      { text: label, fontSize: 8, color: MUTED },
    ],
  }
}

function tenantReturnSlip(
  unitLabel: string,
  adjustment: PrepaymentAdjustmentLetter,
): ContentStack & { readonly id: string } {
  return {
    id: PREPAYMENT_RETURN_SLIP_ID,
    unbreakable: true,
    margin: [0, 14, 0, 0],
    stack: [
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 476,
            y2: 0,
            lineWidth: 0.6,
            dash: { length: 4, space: 3 },
          },
        ],
      },
      {
        text: 'Bitte hier abtrennen',
        fontSize: 7,
        color: MUTED,
        alignment: 'center',
        margin: [0, 2, 0, 8],
      },
      {
        text: 'Kenntnisnahme und Zahlungsbestätigung – bitte unterschrieben zurücksenden',
        bold: true,
        color: BLUE,
        margin: [0, 0, 0, 6],
      },
      {
        text: `Ich/Wir habe(n) die Anpassung der monatlichen Betriebskostenvorauszahlung für die Wohnung ${unitLabel} auf ${formatEuroCents(adjustment.newMonthlyCents)} ab dem ${formatIsoDate(adjustment.validFrom)} zur Kenntnis genommen und zahle(n) ab diesem Zeitpunkt den neuen Betrag.`,
        margin: [0, 0, 0, 6],
      },
      checkbox('per Dauerauftrag (wird angepasst)'),
      checkbox('per SEPA-Lastschrift'),
      {
        columns: [
          signatureField('Ort, Datum'),
          signatureField('Unterschrift Mieter/in'),
        ],
        columnGap: 40,
      },
      {
        text: 'Die Anpassung wird auch ohne Rücksendung wirksam; die Rücksendung dient der Bestätigung.',
        fontSize: 7,
        color: MUTED,
        margin: [0, 8, 0, 0],
      },
    ],
  }
}

/**
 * Seiteninhalt des Anpassungsschreibens nach § 560 Abs. 4 BGB. Der erste
 * Block beginnt mit `pageBreak: 'before'`, damit sich der Inhalt an eine
 * Einzelabrechnung anhängen lässt. Das Schreiben enthält bewusst keine
 * Unterschrift des Vermieters; nur der Rücksendeabschnitt hat Felder für
 * die Unterschrift des Mieters.
 */
export function buildPrepaymentAdjustmentContent(
  context: TenantStatementContext,
  adjustment: PrepaymentAdjustmentLetter,
): Content[] {
  assertAdjustment(adjustment)
  const { billingPeriod, calculation, occupancyPeriod, unit } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  if (!tenant)
    throw new Error(
      `Kein Berechnungsergebnis für Nutzungszeitraum "${occupancyPeriod.id}" gefunden.`,
    )
  const sender = buildSenderBlock(context.ownerCompany, context.property)
  const recipient = buildRecipientBlock(
    context.tenancy,
    context.persons,
    resolveShippingAddress({
      tenancy: context.tenancy,
      occupancy: occupancyPeriod,
      property: context.property,
      billingPeriod,
    }),
  )
  const year = String(billingPeriod.year)
  const oldAmount = formatEuroCents(adjustment.previousMonthlyCents)
  const newAmount = formatEuroCents(adjustment.newMonthlyCents)
  const validFrom = formatIsoDate(adjustment.validFrom)
  const roundedUp = roundedUpMonthlyCents(adjustment.annualizedCostsCents)
  const senderAddressLines = [sender.street, sender.postalCodeAndCity].filter(
    (line): line is string => Boolean(line),
  )
  const unitLabel = unit.label ?? occupancyPeriod.unitId

  const letter: Content[] = [
    {
      columns: [
        {
          width: '*',
          stack: [
            {
              text: [...sender.nameLines, ...senderAddressLines].join(' · '),
              fontSize: 7,
              decoration: 'underline',
              margin: [0, 0, 0, 4],
            },
            ...recipient.nameLines,
            recipient.street,
            recipient.postalCodeAndCity,
          ],
          fontSize: 10,
        },
        {
          width: 'auto',
          stack: [
            { text: sender.nameLines.join('\n'), bold: true },
            ...senderAddressLines,
            ...sender.contactLines,
            {
              text: formatIsoDate(
                context.generatedAt.toISOString().slice(0, 10),
              ),
              margin: [0, 8, 0, 0],
            },
          ],
          fontSize: 9,
          alignment: 'right',
        },
      ],
      margin: [0, 0, 0, 28],
    },
    { text: PREPAYMENT_ADJUSTMENT_TITLE, style: 'title', margin: [0, 0, 0, 4] },
    {
      text: `Nutzungseinheit ${unitLabel} — Abrechnungsjahr ${year}`,
      margin: [0, 0, 0, 12],
    },
    { text: `${recipient.salutationLine},`, margin: [0, 0, 0, 6] },
    {
      text: `mit diesem Schreiben erhalten Sie die Betriebs- und Heizkostenabrechnung für das Jahr ${year}. Sie schließt mit einer Nachzahlung von ${formatEuroCents(Math.max(tenant.balanceCents, 0))}. Die bisherigen Vorauszahlungen decken die tatsächlichen Kosten demnach nicht. Auf Grundlage dieser Abrechnung passen wir die monatliche Betriebskostenvorauszahlung nach § 560 Abs. 4 BGB auf eine angemessene Höhe an.`,
      margin: [0, 0, 0, 8],
    },
    { text: 'Berechnung', style: 'th', margin: [0, 4, 0, 4] },
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          [
            `Ihre Kosten ${year}, hochgerechnet auf 12 Monate`,
            {
              text: formatEuroCents(adjustment.annualizedCostsCents),
              alignment: 'right',
            },
          ],
          [
            `${formatEuroCents(adjustment.annualizedCostsCents)} : 12`,
            {
              text: formatEuroCents(
                monthlyCostCents(adjustment.annualizedCostsCents),
              ),
              alignment: 'right',
            },
          ],
          [
            'aufgerundet auf volle Euro',
            { text: formatEuroCents(roundedUp), alignment: 'right' },
          ],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 8],
    },
    ...(roundedUp === adjustment.newMonthlyCents
      ? []
      : [
          {
            text: `Abweichend vom rechnerischen Wert setzen wir die neue Vorauszahlung auf ${newAmount} fest.`,
            margin: [0, 0, 0, 8],
          } satisfies Content,
        ]),
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          [
            { text: 'Monatliche Betriebskostenvorauszahlung', style: 'th' },
            { text: 'Betrag', style: 'th', alignment: 'right' },
          ],
          ['bisherige Vorauszahlung', { text: oldAmount, alignment: 'right' }],
          [
            { text: `neue Vorauszahlung ab ${validFrom}`, bold: true },
            { text: newAmount, alignment: 'right', bold: true },
          ],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 10],
    },
    {
      text: `Die neue Vorauszahlung gilt ab dem ${validFrom}. Bitte zahlen Sie ab diesem Monat ${newAmount} statt ${oldAmount} monatlich. Die Grundmiete und die übrigen Bestandteile der Miete bleiben unverändert.`,
      margin: [0, 0, 0, 6],
    },
    {
      text: 'Zahlen Sie per Dauerauftrag, passen Sie diesen bitte rechtzeitig an. Haben Sie uns ein SEPA-Lastschriftmandat erteilt, ziehen wir den neuen Betrag ab dem genannten Monat ein; Sie müssen dann nichts weiter veranlassen.',
      margin: [0, 0, 0, 6],
    },
    {
      text: 'Diese Anpassung ist eine einseitige Erklärung nach § 560 Abs. 4 BGB und wird mit Zugang wirksam. Sollten sich Ihre Kosten künftig deutlich verringern, können auch Sie nach einer Abrechnung eine Anpassung verlangen.',
      margin: [0, 0, 0, 10],
    },
    { text: 'Mit freundlichen Grüßen', margin: [0, 0, 0, 6] },
    { text: sender.nameLines.join('\n') },
  ]

  return [
    {
      pageBreak: 'before',
      stack: [...letter, tenantReturnSlip(unitLabel, adjustment)],
    },
  ]
}

/** Hängt das Anpassungsschreiben als eigene Seite an eine Einzelabrechnung. */
export function appendPrepaymentAdjustment(
  definition: TDocumentDefinitions,
  context: TenantStatementContext,
  adjustment: PrepaymentAdjustmentLetter,
): TDocumentDefinitions {
  const content = Array.isArray(definition.content)
    ? definition.content
    : [definition.content]
  return {
    ...definition,
    styles: {
      title: { fontSize: 14, bold: true, color: BLUE },
      th: { fontSize: 9, bold: true, color: BLUE },
      ...definition.styles,
    },
    content: [
      ...content,
      ...buildPrepaymentAdjustmentContent(context, adjustment),
    ],
  }
}
