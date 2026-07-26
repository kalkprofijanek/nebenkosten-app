import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import type { CombinedCostStatementContext } from './contracts'
import { formatEuroCents, formatIsoDate } from './format'

const BLUE = '#1a3a5c'

function categoryAmountCents(
  context: CombinedCostStatementContext,
  categoryId: string,
): number {
  const entries = context.appData.billingData.costEntries.filter(
    ({ costCategoryId }) => costCategoryId === categoryId,
  )
  if (entries.length > 0) {
    return entries.reduce((sum, entry) => sum + entry.amountCents, 0)
  }
  const category = context.costCategories.find(({ id }) => id === categoryId)
  return category?.totalAmountCents ?? 0
}

function costCategoriesTable(context: CombinedCostStatementContext): Content {
  const rows = context.costCategories
    .map((category) => ({
      category,
      amountCents: categoryAmountCents(context, category.id),
    }))
    .filter(({ amountCents }) => amountCents !== 0)

  const total = rows.reduce((sum, row) => sum + row.amountCents, 0)

  const body: TableCell[][] = [
    [
      { text: 'BetrKV', style: 'th' },
      { text: 'Bezeichnung', style: 'th' },
      { text: 'Bereich', style: 'th' },
      { text: 'Betrag', style: 'th', alignment: 'right' },
    ],
    ...rows.map(({ category, amountCents }): TableCell[] => [
      category.betrkvCategory ?? '–',
      category.statementText ?? category.label,
      category.kind,
      { text: formatEuroCents(amountCents), alignment: 'right' },
    ]),
    [
      { text: 'Summe', colSpan: 3, bold: true },
      {},
      {},
      { text: formatEuroCents(total), alignment: 'right', bold: true },
    ],
  ]

  return {
    table: { widths: ['auto', '*', 'auto', 'auto'], body },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 12],
  }
}

function tenantBalancesTable(context: CombinedCostStatementContext): Content {
  const rows = context.occupancyPeriods
    .filter((occupancy) => occupancy.kind === 'tenant')
    .map((occupancy) => {
      const unit = context.units.find(({ id }) => id === occupancy.unitId)
      const tenancy = context.tenancies.find(
        ({ id }) => id === occupancy.tenancyId,
      )
      const tenant = context.calculation.tenants.find(
        ({ id }) => id === occupancy.id,
      )
      return {
        unitLabel: unit?.label ?? '–',
        mandateReference: tenancy?.mandateReference ?? '–',
        shareCents: tenant?.shareCents ?? 0,
        prepaymentCents: tenant?.prepaymentCents ?? 0,
        balanceCents: tenant?.balanceCents ?? 0,
      }
    })

  const body: TableCell[][] = [
    [
      { text: 'Nutzungseinheit', style: 'th' },
      { text: 'Mandatsreferenz', style: 'th' },
      { text: 'Kosten', style: 'th', alignment: 'right' },
      { text: 'VZ gezahlt', style: 'th', alignment: 'right' },
      { text: 'Saldo', style: 'th', alignment: 'right' },
    ],
    ...rows.map((row): TableCell[] => [
      row.unitLabel,
      row.mandateReference,
      { text: formatEuroCents(row.shareCents), alignment: 'right' },
      { text: formatEuroCents(row.prepaymentCents), alignment: 'right' },
      { text: formatEuroCents(row.balanceCents), alignment: 'right' },
    ]),
  ]

  return {
    table: { widths: ['auto', 'auto', 'auto', 'auto', 'auto'], body },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 12],
  }
}

/** Baut die objektweite Gesamtabrechnung/Kostenaufstellung (Legacy `pdfGesamtDoc`). */
export function buildCombinedCostStatement(
  context: CombinedCostStatementContext,
): TDocumentDefinitions {
  const controlDifference = context.calculation.totals.controlDifferenceCents
  const controlOk = Math.abs(controlDifference) <= 1

  return {
    pageSize: 'A4',
    pageMargins: [40, 55, 40, 45],
    content: [
      {
        text: `Kostenaufstellung ${context.billingPeriod.year}`,
        style: 'title',
        margin: [0, 0, 0, 4],
      },
      {
        text: [
          context.property.address?.street,
          context.property.address?.postalCodeAndCity,
        ]
          .filter(Boolean)
          .join(', '),
        margin: [0, 0, 0, 4],
      },
      {
        text: `Erstellt am ${formatIsoDate(context.generatedAt.toISOString().slice(0, 10))}`,
        fontSize: 8,
        color: '#5a6a78',
        margin: [0, 0, 0, 12],
      },
      { text: 'Kostenarten', style: 'th', margin: [0, 0, 0, 4] },
      costCategoriesTable(context),
      { text: 'Mieter-Salden', style: 'th', margin: [0, 0, 0, 4] },
      tenantBalancesTable(context),
      {
        text: `Kontrollsumme (muss 0 sein): ${formatEuroCents(controlDifference)}`,
        bold: true,
        color: controlOk ? '#1a6a2e' : '#a11919',
        margin: [0, 8, 0, 0],
      },
    ],
    styles: {
      title: { fontSize: 14, bold: true, color: BLUE },
      th: { fontSize: 9, bold: true, color: BLUE },
      header: { fontSize: 11, bold: true },
    },
    defaultStyle: { fontSize: 9, color: '#1f2a36', font: 'Roboto' },
  }
}
