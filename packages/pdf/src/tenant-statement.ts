import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { resolveShippingAddress } from '@nebenkosten/core'
import { buildRecipientBlock, buildSenderBlock } from './address'
import { meteringStatement } from './metering-statement'
import type { TenantStatementContext } from './contracts'
import { renderCoverLetter, type CoverLetterPlaceholders } from './cover-letter'
import {
  balanceLabel,
  formatEuroCents,
  formatIban,
  formatIsoDate,
} from './format'
import {
  OBJECTION_NOTICE,
  PROPERTY_DATA_HEADING,
  ROUNDING_DIFFERENCE_NOTICE,
  TIME_FACTOR_EXPLANATION,
  estimatedConsumptionNote,
} from './legal-texts'
import {
  circuitTraceFor,
  heatingTotalCents,
  occupancyRange,
  tenantFacts,
  tenantResult,
} from './tenant-statement-data'
import {
  basisTable,
  costCategoryTable,
  MUTED,
  operatingUnitLabel,
  paymentContent,
  summaryTable,
} from './tenant-statement-tables'
import {
  co2Section,
  heatingSection,
  section35aContent,
} from './tenant-statement-heating'
import { consumptionInformation } from './tenant-statement-consumption'

const BLUE = '#1a3a5c'

function propertyDataFooter(context: TenantStatementContext): Content {
  const { billingPeriod, property } = context
  const range = occupancyRange(context)
  return {
    stack: [
      { text: PROPERTY_DATA_HEADING, style: 'th', margin: [0, 8, 0, 4] },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              'Objekt',
              [property.address?.street, property.address?.postalCodeAndCity]
                .filter(Boolean)
                .join(', ') || '–',
            ],
            ['Abrechnungseinheit Betriebskosten', operatingUnitLabel(context)],
            [
              'Abrechnungszeitraum',
              `${formatIsoDate(billingPeriod.periodStart)} – ${formatIsoDate(billingPeriod.periodEnd)}`,
            ],
            [
              'Ihr Nutzungszeitraum',
              `${formatIsoDate(range.from)} – ${formatIsoDate(range.to)}`,
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ],
    margin: [0, 8, 0, 0],
  }
}

function recipientBlock(context: TenantStatementContext) {
  return buildRecipientBlock(
    context.tenancy,
    context.persons,
    resolveShippingAddress({
      tenancy: context.tenancy,
      occupancy: context.occupancyPeriod,
      property: context.property,
      billingPeriod: context.billingPeriod,
    }),
  )
}

function coverLetterPlaceholders(
  context: TenantStatementContext,
): CoverLetterPlaceholders {
  const {
    calculation,
    occupancyPeriod,
    unit,
    property,
    billingPeriod,
    persons,
  } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  const balance = tenant?.balanceCents ?? 0
  return {
    anrede: recipientBlock(context).salutationLine,
    name: persons.map((person) => person.displayName ?? '').join(' und '),
    nutzeinheit: unit.label ?? '',
    jahr: String(billingPeriod.year),
    objekt: property.address?.street ?? '',
    saldo: formatEuroCents(Math.abs(balance)),
    saldo_art: balanceLabel(balance),
    datum: formatIsoDate(context.generatedAt.toISOString().slice(0, 10)),
    frist: formatIsoDate(billingPeriod.dispatchDate),
  }
}

function estimationNote(context: TenantStatementContext): Content {
  const { occupancyPeriod, calculation } = context
  const metered = calculation.meteringTrace?.circuits.some((circuit) =>
    circuit.occupancies.some(
      (occupancy) => occupancy.occupancyId === occupancyPeriod.id,
    ),
  )
  if (!occupancyPeriod.consumptionUnitsEstimated || metered) return { text: '' }
  // Mit Heizkosten steht der Schätzgrund vollständig unter „Ihre
  // Verbrauchserfassung“; vorne genügt der Hinweis, sonst erscheint er doppelt.
  const tenant = tenantResult(context)
  const hasConsumptionCapture =
    heatingTotalCents(tenant) + tenant.costBreakdown.heatingCo2Cents !== 0
  return {
    text: hasConsumptionCapture
      ? `${estimatedConsumptionNote()} Die Begründung finden Sie unter „Ihre Verbrauchserfassung“.`
      : estimatedConsumptionNote(
          occupancyPeriod.consumptionUnitsEstimateReason,
        ),
    fontSize: 8,
    italics: true,
    margin: [0, 0, 0, 8],
  }
}

/**
 * Baut die Einzelabrechnung eines Mieters (Legacy `pdfEinzelDoc`). Wirft
 * `MissingShippingAddressError`, wenn keine Versandadresse vorliegt (durch
 * `packages/validators` bereits als Fehler vor `READY_FOR_PDF` geblockt).
 */
/**
 * Anschriftfeld für Fensterkuverts und Druck-/Versanddienste (DIN 5008
 * Form B, Positionen in pt; 1 mm = 2,835 pt): Die Rücksendeangabe steht im
 * Fenster oberhalb der Anschriftzone, die Empfängeranschrift beginnt bei
 * ca. 56 mm von oben und 25 mm von links und bleibt damit sicher innerhalb
 * der Prüfbox der Versanddienste (ca. 20–96 mm × 52–90 mm). Der Titel
 * beginnt erst unterhalb des Fensters.
 */
export const ADDRESS_WINDOW = {
  returnLine: { x: 71, y: 133 },
  recipient: { x: 71, y: 159 },
  titleTop: 290,
} as const

export function buildTenantStatement(
  context: TenantStatementContext,
): TDocumentDefinitions {
  const sender = buildSenderBlock(context.ownerCompany, context.property)
  const recipient = recipientBlock(context)
  const { billingPeriod, unit } = context
  const tenant = tenantResult(context)
  const facts = tenantFacts(context, tenant)

  const coverLetterContent: Content[] =
    billingPeriod.coverLetter?.active && billingPeriod.coverLetter.text
      ? [
          {
            text: renderCoverLetter(
              billingPeriod.coverLetter.text,
              coverLetterPlaceholders(context),
            ),
            margin: [0, 0, 0, 12],
          },
        ]
      : []

  const notes = billingPeriod.notes
  const notesContent: Content[] = notes?.general
    ? [{ text: notes.general, margin: [0, 8, 0, 0] }]
    : []

  const range = occupancyRange(context)
  const senderAddressLines = [sender.street, sender.postalCodeAndCity].filter(
    (line): line is string => Boolean(line),
  )
  const iban = sender.iban ? formatIban(sender.iban) : null
  const bankLine = iban
    ? [
        sender.accountHolder ? `Kontoinhaber: ${sender.accountHolder}` : null,
        `IBAN: ${iban}`,
        sender.bic ? `BIC: ${sender.bic}` : null,
        sender.bankName,
      ]
        .filter(Boolean)
        .join(' · ')
    : null
  const openingContent: Content[] =
    coverLetterContent.length > 0
      ? []
      : [
          {
            text: `${recipient.salutationLine},`,
            margin: [0, 0, 0, 6],
          },
          {
            text: `anbei erhalten Sie Ihre Heiz- und Hausnebenkostenabrechnung ${range.partial ? `für Ihren Nutzungszeitraum ${formatIsoDate(range.from)} bis ${formatIsoDate(range.to)}` : `für das Jahr ${billingPeriod.year}`}.`,
            margin: [0, 0, 0, 10],
          },
        ]
  const circuit = circuitTraceFor(context)

  return {
    pageSize: 'A4',
    pageMargins: [71, 46, 48, 58],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${[...sender.nameLines, ...senderAddressLines].join(' · ')}${iban ? ` · IBAN ${iban}` : ''}     Seite ${currentPage}/${pageCount}`,
      fontSize: 7,
      color: MUTED,
      margin: [71, 0, 48, 0],
    }),
    content: [
      {
        text: [...sender.nameLines, ...senderAddressLines].join(' · '),
        absolutePosition: ADDRESS_WINDOW.returnLine,
        fontSize: 7,
        decoration: 'underline',
      },
      {
        stack: [
          ...recipient.nameLines,
          recipient.street,
          recipient.postalCodeAndCity,
        ],
        absolutePosition: ADDRESS_WINDOW.recipient,
        fontSize: 10,
      },
      {
        stack: [
          { text: sender.nameLines.join('\n'), bold: true },
          ...senderAddressLines,
          ...sender.contactLines,
        ],
        absolutePosition: { x: 340, y: 46 },
        fontSize: 9,
        alignment: 'right',
      },
      {
        text: formatIsoDate(context.generatedAt.toISOString().slice(0, 10)),
        absolutePosition: { x: 340, y: 150 },
        fontSize: 9,
        alignment: 'right',
      },
      {
        text: `Heiz- und Hausnebenkostenabrechnung ${billingPeriod.year}`,
        style: 'title',
        margin: [0, ADDRESS_WINDOW.titleTop - 46, 0, 4],
      },
      {
        text: `Nutzungseinheit ${unit.label ?? ''} — Abrechnungszeitraum ${formatIsoDate(billingPeriod.periodStart)} bis ${formatIsoDate(billingPeriod.periodEnd)}`,
        margin: [0, 0, 0, range.partial ? 2 : 12],
      },
      range.partial
        ? {
            text: `Ihr Nutzungszeitraum: ${formatIsoDate(range.from)} bis ${formatIsoDate(range.to)}`,
            bold: true,
            margin: [0, 0, 0, 12],
          }
        : { text: '' },
      ...openingContent,
      ...coverLetterContent,
      estimationNote(context),
      summaryTable(context),
      {
        text: ROUNDING_DIFFERENCE_NOTICE,
        fontSize: 7,
        color: MUTED,
        margin: [0, 0, 0, 6],
      },
      ...paymentContent(context),
      { text: 'Abrechnungsgrundlagen', style: 'th', margin: [0, 8, 0, 2] },
      basisTable(context, facts, circuit),
      { text: 'Betriebskosten', style: 'th', margin: [0, 8, 0, 4] },
      ...costCategoryTable(context, facts),
      ...heatingSection(context, facts),
      ...meteringStatement(context.calculation, context.occupancyPeriod.id),
      ...co2Section(context),
      ...consumptionInformation(context, facts),
      ...section35aContent(context),
      {
        text: TIME_FACTOR_EXPLANATION,
        fontSize: 8,
        color: MUTED,
        margin: [0, 0, 0, 8],
      },
      { text: OBJECTION_NOTICE, margin: [0, 0, 0, 8] },
      bankLine
        ? {
            text: `Bankverbindung: ${bankLine}`,
            margin: [0, 4, 0, 4],
          }
        : { text: '' },
      ...notesContent,
      propertyDataFooter(context),
    ],
    styles: {
      title: { fontSize: 14, bold: true, color: BLUE },
      th: { fontSize: 9, bold: true, color: BLUE },
    },
    defaultStyle: { fontSize: 9, color: '#1f2a36', font: 'Roboto' },
  }
}

export type { CoverLetterPlaceholders }
