import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import type { CostCategory } from '@nebenkosten/schema'
import type { CombinedCostStatementContext } from './contracts'
import { formatEuroCents, formatIsoDate } from './format'
import { meteringStatement } from './metering-statement'

const BLUE = '#1a3a5c'

const costKindLabels: Readonly<Record<CostCategory['kind'], string>> = {
  operating: 'Betriebskosten',
  water: 'Wasser',
  heating: 'Heizung',
}

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
      costKindLabels[category.kind] ?? category.kind,
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

function balanceResult(balanceCents: number): string {
  if (balanceCents === 0) return 'Ausgeglichen'
  return balanceCents > 0 ? 'Nachzahlung' : 'Guthaben'
}

function tenantBalanceRows(context: CombinedCostStatementContext) {
  return context.occupancyPeriods
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
}

type TenantBalanceRow = ReturnType<typeof tenantBalanceRows>[number]

const sum = (rows: readonly TenantBalanceRow[], pick: keyof TenantBalanceRow) =>
  rows.reduce((total, row) => total + (row[pick] as number), 0)

function tenantBalancesTable(rows: readonly TenantBalanceRow[]): Content {
  const right = (text: string, bold = false): TableCell => ({
    text,
    alignment: 'right',
    bold,
  })
  const body: TableCell[][] = [
    [
      { text: 'Nutzungseinheit', style: 'th' },
      { text: 'Mandatsreferenz', style: 'th' },
      { text: 'Kosten', style: 'th', alignment: 'right' },
      { text: 'VZ gezahlt', style: 'th', alignment: 'right' },
      { text: 'Saldo', style: 'th', alignment: 'right' },
      { text: 'Ergebnis', style: 'th' },
    ],
    ...rows.map((row): TableCell[] => [
      row.unitLabel,
      row.mandateReference,
      right(formatEuroCents(row.shareCents)),
      right(formatEuroCents(row.prepaymentCents)),
      right(formatEuroCents(row.balanceCents)),
      balanceResult(row.balanceCents),
    ]),
    [
      { text: 'Summe Mieter', colSpan: 2, bold: true },
      {},
      right(formatEuroCents(sum(rows, 'shareCents')), true),
      right(formatEuroCents(sum(rows, 'prepaymentCents')), true),
      right(formatEuroCents(sum(rows, 'balanceCents')), true),
      '',
    ],
  ]

  return {
    table: { widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*'], body },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 12],
  }
}

function balanceSummaryTable(
  rows: readonly TenantBalanceRow[],
  context: CombinedCostStatementContext,
): Content {
  const due = rows.filter(({ balanceCents }) => balanceCents > 0)
  const credit = rows.filter(({ balanceCents }) => balanceCents < 0)
  const vacancyCents = context.occupancyPeriods
    .filter((occupancy) => occupancy.kind === 'vacancy')
    .reduce(
      (total, occupancy) =>
        total +
        (context.calculation.tenants.find(({ id }) => id === occupancy.id)
          ?.shareCents ?? 0),
      0,
    )
  const line = (label: string, cents: number, bold = false): TableCell[] => [
    { text: label, bold },
    { text: formatEuroCents(cents), alignment: 'right', bold },
  ]
  return {
    table: {
      widths: ['*', 'auto'],
      body: [
        line(`Nachzahlungen (${due.length} Mieter)`, sum(due, 'balanceCents')),
        line(`Guthaben (${credit.length} Mieter)`, sum(credit, 'balanceCents')),
        line('Saldo aller Mieter', sum(rows, 'balanceCents'), true),
        line('Leerstandskosten (Vermieter)', vacancyCents),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 260, 12],
  }
}

/** Baut die objektweite Gesamtabrechnung/Kostenaufstellung (Legacy `pdfGesamtDoc`). */
export function buildCombinedCostStatement(
  context: CombinedCostStatementContext,
): TDocumentDefinitions {
  const controlDifference = context.calculation.totals.controlDifferenceCents
  const controlOk = Math.abs(controlDifference) <= 1
  const balanceRows = tenantBalanceRows(context)

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
      { text: 'Nachzahlungen und Guthaben', style: 'th', margin: [0, 0, 0, 4] },
      balanceSummaryTable(balanceRows, context),
      { text: 'Mieter-Salden', style: 'th', margin: [0, 0, 0, 4] },
      tenantBalancesTable(balanceRows),
      ...meteringStatement(context.calculation),
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
