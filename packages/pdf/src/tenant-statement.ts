import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import { buildRecipientBlock, buildSenderBlock } from './address'
import type { TenantStatementContext } from './contracts'
import { renderCoverLetter, type CoverLetterPlaceholders } from './cover-letter'
import {
  balanceLabel,
  formatAllocationKeyLabel,
  formatEuroCents,
  formatIsoDate,
} from './format'
import {
  CO2_LABEL_HEADING,
  ESTIMATED_CONSUMPTION_NOTE,
  PROPERTY_DATA_HEADING,
  TIME_FACTOR_EXPLANATION,
  co2TenantShareLine,
  heatingSplitExplanation,
} from './legal-texts'

const BLUE = '#1a3a5c'
const LIGHT_FILL = '#eef4fb'

function summaryTable(context: TenantStatementContext): Content {
  const { calculation, occupancyPeriod } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  if (!tenant) {
    throw new Error(
      `Kein Berechnungsergebnis für Nutzungszeitraum "${occupancyPeriod.id}" gefunden.`,
    )
  }
  const { costBreakdown } = tenant
  const heatingCents =
    costBreakdown.heatingBaseCents +
    costBreakdown.heatingConsumptionCents +
    costBreakdown.hotWaterCents
  const operatingCents = costBreakdown.operatingByCategory.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  )
  const label = balanceLabel(tenant.balanceCents)
  const rows: [string, string][] = [
    ['Ihre Heizkosten', formatEuroCents(heatingCents)],
    ['Ihr CO2-Kostenanteil', formatEuroCents(costBreakdown.heatingCo2Cents)],
    ['Ihre Betriebskosten', formatEuroCents(operatingCents)],
    ['Ihr Anteil an den Gesamtkosten', formatEuroCents(tenant.shareCents)],
    ['Ihre Vorauszahlung', formatEuroCents(tenant.prepaymentCents)],
    [label, formatEuroCents(Math.abs(tenant.balanceCents))],
  ]
  return {
    table: {
      widths: ['*', 'auto'],
      body: rows.map(([left, right]) => {
        const emphasized =
          left === 'Ihr Anteil an den Gesamtkosten' || left === label
        const balanceRow = left === label
        return [
          {
            text: left,
            bold: emphasized,
            fillColor: balanceRow ? LIGHT_FILL : undefined,
          },
          {
            text: right,
            alignment: 'right',
            bold: emphasized,
            fillColor: balanceRow ? LIGHT_FILL : undefined,
            color:
              balanceRow && tenant.balanceCents < 0 ? '#1a6a2e' : undefined,
          },
        ]
      }),
    },
    layout: 'lightHorizontalLines',
    margin: [0, 8, 0, 8],
  }
}

function costCategoryTable(context: TenantStatementContext): Content {
  const { calculation, occupancyPeriod, costCategories } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  const categoriesById = new Map(
    costCategories.map((category) => [category.id, category]),
  )
  const rows = (tenant?.costBreakdown.operatingByCategory ?? [])
    .map((item) => {
      const category = categoriesById.get(item.costCategoryId)
      return {
        label:
          category?.statementText ?? category?.label ?? item.costCategoryId,
        allocationKey: formatAllocationKeyLabel(category?.allocationKey),
        amountCents: item.amountCents,
      }
    })
    .filter(({ amountCents }) => amountCents !== 0)

  if (rows.length === 0) {
    return {
      text: 'Keine Betriebskosten-Positionen erfasst.',
      margin: [0, 4, 0, 8],
    }
  }

  const body: TableCell[][] = [
    [
      { text: 'Kostenart', style: 'th' },
      { text: 'Umlage', style: 'th' },
      { text: 'Betrag', style: 'th', alignment: 'right' },
    ],
    ...rows.map((row): TableCell[] => [
      row.label,
      row.allocationKey,
      { text: formatEuroCents(row.amountCents), alignment: 'right' },
    ]),
  ]

  return {
    table: { widths: ['*', 'auto', 'auto'], body },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 8],
  }
}

function heatingDetailTable(context: TenantStatementContext): Content[] {
  const { calculation, occupancyPeriod, unit } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  if (!tenant) return []
  const { costBreakdown } = tenant
  const heatingCents =
    costBreakdown.heatingBaseCents +
    costBreakdown.heatingConsumptionCents +
    costBreakdown.hotWaterCents +
    costBreakdown.heatingCo2Cents
  if (heatingCents === 0 && costBreakdown.heatingCo2Cents === 0) return []

  const circuitTrace = calculation.heating.trace.circuits.find(
    (circuit) => circuit.buildingId === unit.buildingId,
  )
  const consumptionSharePercent =
    circuitTrace?.split.consumptionSharePercent ?? 70

  return [
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          [
            { text: 'Heizkosten-Aufschlüsselung', style: 'th' },
            { text: '', style: 'th' },
          ],
          ['Grundkosten', formatEuroCents(costBreakdown.heatingBaseCents)],
          [
            'Verbrauchskosten',
            formatEuroCents(costBreakdown.heatingConsumptionCents),
          ],
          ['Warmwasser', formatEuroCents(costBreakdown.hotWaterCents)],
          ['CO2-Kosten', formatEuroCents(costBreakdown.heatingCo2Cents)],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 4, 0, 4],
    },
    {
      text: heatingSplitExplanation(consumptionSharePercent),
      fontSize: 8,
      color: '#5a6a78',
      margin: [0, 0, 0, 8],
    },
  ]
}

function co2Section(context: TenantStatementContext): Content[] {
  const { calculation, occupancyPeriod, unit } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  const circuitTrace = calculation.heating.trace.circuits.find(
    (circuit) => circuit.buildingId === unit.buildingId,
  )
  if (!tenant || !circuitTrace) return []
  const percent = circuitTrace?.co2.tenantPercent ?? 0
  const emissionFree = circuitTrace.co2.intensityKgPerSqmYear === 0

  return [
    { text: CO2_LABEL_HEADING, style: 'th', margin: [0, 8, 0, 4] },
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          [
            co2TenantShareLine(percent, emissionFree),
            formatEuroCents(tenant.costBreakdown.heatingCo2Cents),
          ],
          ...(circuitTrace
            ? [
                [
                  'Energieverbrauchskennwert',
                  `${circuitTrace.co2.intensityKgPerSqmYear.toFixed(1)} kg CO2/m²·a`,
                ],
              ]
            : []),
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 8],
    },
  ]
}

function propertyDataFooter(context: TenantStatementContext): Content {
  const { billingPeriod, property } = context
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
            [
              'Abrechnungszeitraum',
              `${formatIsoDate(billingPeriod.periodStart)} – ${formatIsoDate(billingPeriod.periodEnd)}`,
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ],
    margin: [0, 8, 0, 0],
  }
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
    anrede: buildRecipientBlock(context.tenancy, persons).salutationLine,
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

/**
 * Baut die Einzelabrechnung eines Mieters (Legacy `pdfEinzelDoc`). Wirft
 * `MissingShippingAddressError`, wenn keine Versandadresse vorliegt (durch
 * `packages/validators` bereits als Fehler vor `READY_FOR_PDF` geblockt).
 */
export function buildTenantStatement(
  context: TenantStatementContext,
): TDocumentDefinitions {
  const sender = buildSenderBlock(context.ownerCompany, context.property)
  const recipient = buildRecipientBlock(context.tenancy, context.persons)
  const { billingPeriod, unit } = context

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

  return {
    pageSize: 'A4',
    pageMargins: [71, 46, 48, 58],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${sender.nameLines.join(' · ')}${sender.iban ? ` · ${sender.iban}` : ''}     Seite ${currentPage}/${pageCount}`,
      fontSize: 7,
      color: '#5a6a78',
      margin: [71, 0, 48, 0],
    }),
    content: [
      {
        text: sender.nameLines.join(' · '),
        absolutePosition: { x: 71, y: 99 },
        fontSize: 8,
      },
      {
        stack: [
          recipient.salutationLine,
          ...recipient.nameLines,
          recipient.street,
          recipient.postalCodeAndCity,
        ],
        absolutePosition: { x: 71, y: 130 },
        fontSize: 10,
      },
      {
        stack: [...sender.nameLines],
        absolutePosition: { x: 340, y: 56 },
        fontSize: 9,
        alignment: 'right',
      },
      {
        text: formatIsoDate(context.generatedAt.toISOString().slice(0, 10)),
        absolutePosition: { x: 340, y: 128 },
        fontSize: 9,
        alignment: 'right',
      },
      {
        text: `Heiz- und Hausnebenkostenabrechnung ${billingPeriod.year}`,
        style: 'title',
        margin: [0, 210, 0, 4],
      },
      {
        text: `Nutzungseinheit ${unit.label ?? ''} — Abrechnungszeitraum ${formatIsoDate(billingPeriod.periodStart)} bis ${formatIsoDate(billingPeriod.periodEnd)}`,
        margin: [0, 0, 0, 12],
      },
      ...coverLetterContent,
      context.occupancyPeriod.consumptionUnitsEstimated
        ? {
            text: ESTIMATED_CONSUMPTION_NOTE,
            fontSize: 8,
            italics: true,
            margin: [0, 0, 0, 8],
          }
        : { text: '' },
      summaryTable(context),
      { text: 'Kostenaufstellung', style: 'th', margin: [0, 8, 0, 4] },
      costCategoryTable(context),
      ...heatingDetailTable(context),
      {
        text: TIME_FACTOR_EXPLANATION,
        fontSize: 8,
        color: '#5a6a78',
        margin: [0, 0, 0, 8],
      },
      sender.iban
        ? {
            text: `Bankverbindung: ${sender.iban}${sender.bic ? ` (${sender.bic})` : ''}`,
            margin: [0, 4, 0, 4],
          }
        : { text: '' },
      ...co2Section(context),
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
