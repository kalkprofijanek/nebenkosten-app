import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import type { OperatingPositionTrace } from '@nebenkosten/core'
import type { CostCategory } from '@nebenkosten/schema'
import { buildSenderBlock } from './address'
import type { CombinedCostStatementContext } from './contracts'
import {
  formatAllocationKeyLabel,
  formatEuroCents,
  formatIsoDate,
  formatNumber,
} from './format'
import {
  amountCell,
  buildingName,
  captureModeFor,
  circuitTitle,
  co2Table,
  fuelAccountTable,
  heatingCompilationTable,
  heatingSplitTotalsTable,
  hotWaterNotice,
  scopeLabel,
} from './heating-summary'
import { meteringStatement } from './metering-statement'

const BLUE = '#1a3a5c'
const MUTED = '#5a6a78'

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

/**
 * Verbrauchte Brennstoff- bzw. Energiekosten je Heizkreis (FIFO-Bewertung).
 * Sie stehen nicht in den Kostenarten, gehören aber zu den Gesamtkosten.
 */
function fuelCostRows(context: CombinedCostStatementContext) {
  const { energySources } = context.appData.billingData
  return context.calculation.heating.trace.circuits
    .map((circuit) => {
      const sources = circuit.energySources
        .map((trace) => {
          const source = energySources.find(
            ({ id }) => id === trace.energySourceId,
          )
          return source?.name ?? source?.sourceType ?? source?.key ?? null
        })
        .filter((name): name is string => Boolean(name))
      return {
        label: `Brennstoff/Energie ${buildingName(context.appData, circuit.buildingId)}${
          sources.length > 0 ? ` (${sources.join(', ')})` : ''
        }`,
        buildingId: circuit.buildingId,
        amountCents: circuit.reconciliation.fifoConsumptionCostCents,
      }
    })
    .filter(({ amountCents }) => amountCents !== 0)
}

function distributionLabel(position: OperatingPositionTrace): string {
  switch (position.distribution) {
    case 'heating_pool':
      return 'über Heizkosten'
    case 'direct':
      return 'direkt zugeordnet'
    case 'not_allocable':
      return 'nicht umlagefähig'
    case 'key':
      return formatAllocationKeyLabel(position.allocationKey)
  }
}

function labelWithScope(label: string, scope: string): TableCell {
  return {
    stack: [label, { text: scope, fontSize: 6.5, color: MUTED }],
  }
}

interface CostTableResult {
  readonly content: Content
  readonly grossCents: number
  readonly nonAllocableCents: number | null
  readonly directCents: number | null
}

/** Ältere Rechenstände ohne Umlage-Nachweis: Kostenliste wie bisher. */
function legacyCostCategoriesTable(
  context: CombinedCostStatementContext,
): CostTableResult {
  const rows = context.costCategories
    .map((category) => ({
      category,
      amountCents: categoryAmountCents(context, category.id),
    }))
    .filter(({ amountCents }) => amountCents !== 0)
  const fuelRows = fuelCostRows(context)
  const total =
    rows.reduce((sum, row) => sum + row.amountCents, 0) +
    fuelRows.reduce((sum, row) => sum + row.amountCents, 0)
  const body: TableCell[][] = [
    [
      { text: 'BetrKV', style: 'th' },
      { text: 'Bezeichnung', style: 'th' },
      { text: 'Bereich', style: 'th' },
      { text: 'Betrag', style: 'th', alignment: 'right' },
    ],
    ...rows.map(({ category, amountCents }): TableCell[] => [
      { text: category.betrkvCategory ?? '–', noWrap: true },
      category.statementText ?? category.label,
      costKindLabels[category.kind] ?? category.kind,
      amountCell(amountCents),
    ]),
    ...fuelRows.map(({ label, amountCents }): TableCell[] => [
      { text: '§2 Nr. 4', noWrap: true },
      label,
      costKindLabels.heating,
      amountCell(amountCents),
    ]),
    [
      { text: 'Summe', colSpan: 3, bold: true },
      {},
      {},
      amountCell(total, { bold: true }),
    ],
  ]
  return {
    content: {
      table: { headerRows: 1, widths: [52, '*', 'auto', 72], body },
      layout: 'lightHorizontalLines',
      margin: [0, 4, 0, 12],
    },
    grossCents: total,
    nonAllocableCents: null,
    directCents: null,
  }
}

function costCategoriesTable(
  context: CombinedCostStatementContext,
): CostTableResult {
  const positions = context.calculation.operatingPositions
  if (!positions) return legacyCostCategoriesTable(context)

  const visible = positions.filter(({ grossCents }) => grossCents !== 0)
  const fuelRows = fuelCostRows(context)
  const dash: TableCell = { text: '–', alignment: 'right' }
  const categoryRows = visible.map((position): TableCell[] => [
    { text: position.betrkvCategory ?? '–', noWrap: true },
    labelWithScope(position.label, scopeLabel(context.appData, position.scope)),
    amountCell(position.grossCents),
    amountCell(position.nonAllocableCents),
    amountCell(position.allocableCents),
    distributionLabel(position),
    position.denominator == null || position.denominatorUnit == null
      ? dash
      : {
          text: `${formatNumber(position.denominator)} ${position.denominatorUnit}`,
          alignment: 'right',
          noWrap: true,
        },
  ])
  const fuelTableRows = fuelRows.map((row): TableCell[] => [
    { text: '§2 Nr. 4', noWrap: true },
    labelWithScope(
      row.label,
      scopeLabel(context.appData, {
        kind: 'building',
        buildingId: row.buildingId,
      }),
    ),
    amountCell(row.amountCents),
    amountCell(0),
    amountCell(row.amountCents),
    'über Heizkosten',
    dash,
  ])
  const electricityRows: TableCell[][] = [
    ...positions
      .filter(
        ({ operatingElectricityDeductedCents }) =>
          operatingElectricityDeductedCents !== 0,
      )
      .map((position): TableCell[] => [
        '',
        `− Betriebsstrom-Umbuchung aus „${position.label}“`,
        '',
        '',
        amountCell(-position.operatingElectricityDeductedCents),
        'in Heizkosten',
        '',
      ]),
    ...context.calculation.heating.trace.circuits
      .filter(
        ({ operatingElectricity }) => operatingElectricity.movedCents !== 0,
      )
      .map((circuit): TableCell[] => [
        '',
        `+ Betriebsstrom in den Heizkosten (${circuitTitle(context.appData, circuit)})`,
        '',
        '',
        amountCell(circuit.operatingElectricity.movedCents),
        'über Heizkosten',
        '',
      ]),
  ]
  const sumOf = (pick: (position: OperatingPositionTrace) => number) =>
    visible.reduce((sum, position) => sum + pick(position), 0)
  const fuelTotal = fuelRows.reduce((sum, row) => sum + row.amountCents, 0)
  const electricityNet =
    context.calculation.heating.trace.circuits.reduce(
      (sum, circuit) => sum + circuit.operatingElectricity.movedCents,
      0,
    ) -
    positions.reduce(
      (sum, position) => sum + position.operatingElectricityDeductedCents,
      0,
    )
  const grossCents = sumOf(({ grossCents }) => grossCents) + fuelTotal
  const nonAllocableCents = positions.reduce(
    (sum, position) => sum + position.nonAllocableCents,
    0,
  )
  const directCents = positions
    .filter(({ distribution }) => distribution === 'direct')
    .reduce((sum, position) => sum + position.allocableCents, 0)
  const th = (label: string, right = false): TableCell => ({
    text: label,
    style: 'th',
    fontSize: 7.5,
    alignment: right ? 'right' : 'left',
  })
  const header: TableCell[] = [
    th('BetrKV'),
    th('Kostenart / Abrechnungseinheit'),
    th('Brutto', true),
    th('nicht umlagefähig', true),
    th('umlagefähig', true),
    th('Schlüssel'),
    th('Gesamt-einheiten', true),
  ]
  return {
    content: {
      table: {
        headerRows: 1,
        widths: [38, '*', 56, 54, 56, 66, 52],
        body: [
          header,
          ...categoryRows,
          ...fuelTableRows,
          ...electricityRows,
          [
            { text: 'Summe', colSpan: 2, bold: true },
            {},
            amountCell(grossCents, { bold: true }),
            amountCell(nonAllocableCents, { bold: true }),
            amountCell(
              sumOf(({ allocableCents }) => allocableCents) +
                fuelTotal +
                electricityNet,
              { bold: true },
            ),
            '',
            '',
          ],
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 7.5,
      margin: [0, 4, 0, 12],
    },
    grossCents,
    nonAllocableCents,
    directCents,
  }
}

function tenantShareTotalCents(context: CombinedCostStatementContext): number {
  return context.calculation.tenants
    .filter(({ isVacancy }) => !isVacancy)
    .reduce((sum, tenant) => sum + tenant.shareCents, 0)
}

/**
 * Überleitung von den Gesamtkosten zum auf die Mieter verteilten Betrag.
 * Die Summenzeile wird aus den gedruckten Zeilen gebildet.
 */
function reconciliationTable(
  context: CombinedCostStatementContext,
  costs: CostTableResult,
): Content {
  const { calculation } = context
  const { totals } = calculation
  const unassignedHeating = calculation.heating.unallocatedLandlordCents
  const nonAllocable =
    costs.nonAllocableCents ??
    totals.internalCostsCents +
      (totals.landlordTotalCents -
        calculation.co2.landlordCents -
        calculation.vacancyLandlordCents -
        unassignedHeating)
  const direct = costs.directCents ?? totals.directCostsCents
  const lines: Array<{ label: string; cents: number }> = [
    {
      label: 'Gesamtkosten (brutto, inkl. Brennstoff)',
      cents: costs.grossCents,
    },
    { label: '− nicht umlagefähige Kosten', cents: -nonAllocable },
  ]
  if (direct !== 0) {
    lines.push({
      label: '− direkt zugeordnete Kosten (außerhalb der Umlage)',
      cents: -direct,
    })
  }
  lines.push(
    {
      label: '− CO2-Kosten Vermieteranteil (CO2KostAufG)',
      cents: -calculation.co2.landlordCents,
    },
    {
      label: '− Leerstandsanteil (trägt der Vermieter)',
      cents: -calculation.vacancyLandlordCents,
    },
  )
  if (unassignedHeating !== 0) {
    lines.push({
      label: '− nicht zuordenbare Heizungs-Betriebskosten (Vermieter)',
      cents: -unassignedHeating,
    })
  }
  const distributed = tenantShareTotalCents(context)
  const subtotal = lines.reduce((sum, line) => sum + line.cents, 0)
  lines.push({ label: '± Rundung', cents: distributed - subtotal })
  const printedSum = lines.reduce((sum, line) => sum + line.cents, 0)
  return {
    table: {
      widths: ['*', 90],
      body: [
        ...lines.map((line): TableCell[] => [
          line.label,
          amountCell(line.cents),
        ]),
        [
          { text: '= auf Mieter verteilt (Summe der Zeilen)', bold: true },
          amountCell(printedSum, { bold: true }),
        ],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 140, 12],
  }
}

function vacancyTable(context: CombinedCostStatementContext): Content[] {
  const total = context.calculation.vacancyLandlordCents
  if (total === 0) return []
  const positions = (context.calculation.operatingPositions ?? []).filter(
    ({ vacancyCents }) => vacancyCents !== 0,
  )
  const operatingVacancy = positions.reduce(
    (sum, position) => sum + position.vacancyCents,
    0,
  )
  const rows: TableCell[][] = positions.map((position): TableCell[] => [
    position.label,
    amountCell(position.vacancyCents),
  ])
  if (positions.length > 0 && total - operatingVacancy !== 0) {
    rows.push([
      'Heiz- und CO2-Kosten sowie Rundung',
      amountCell(total - operatingVacancy),
    ])
  }
  rows.push([
    { text: 'Leerstandsanteil gesamt (Vermieter)', bold: true },
    amountCell(total, { bold: true }),
  ])
  return [
    { text: 'Leerstandsanteil', style: 'th', margin: [0, 0, 0, 4] },
    {
      table: { widths: ['*', 90], body: rows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 140, 12],
    },
  ]
}

function heatingSections(context: CombinedCostStatementContext): Content[] {
  return context.calculation.heating.trace.circuits
    .filter(
      (circuit) =>
        circuit.energySources.length > 0 ||
        circuit.reconciliation.heatingPoolCents !== 0,
    )
    .flatMap((circuit): Content[] => [
      {
        text: `Heizkosten – Zusammenstellung ${circuitTitle(context.appData, circuit)} (§ 7 Abs. 2 HeizKV)`,
        style: 'th',
        margin: [0, 8, 0, 4],
      },
      fuelAccountTable(context.appData, circuit),
      heatingCompilationTable(circuit),
      heatingSplitTotalsTable(
        circuit,
        captureModeFor(context.calculation, circuit.buildingId),
      ),
      ...hotWaterNotice(circuit),
      ...co2Table(context.appData, circuit),
    ])
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
      amountCell(row.shareCents),
      amountCell(row.prepaymentCents),
      amountCell(row.balanceCents),
      balanceResult(row.balanceCents),
    ]),
    [
      { text: 'Summe Mieter', colSpan: 2, bold: true },
      {},
      amountCell(sum(rows, 'shareCents'), { bold: true }),
      amountCell(sum(rows, 'prepaymentCents'), { bold: true }),
      amountCell(sum(rows, 'balanceCents'), { bold: true }),
      '',
    ],
  ]

  return {
    table: {
      headerRows: 1,
      widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*'],
      body,
    },
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
    amountCell(cents, { bold }),
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

function headerTable(context: CombinedCostStatementContext): Content {
  const sender = buildSenderBlock(context.ownerCompany, context.property)
  return {
    table: {
      widths: ['auto', '*'],
      body: [
        [
          'Vermieter',
          [
            ...sender.nameLines,
            [sender.street, sender.postalCodeAndCity]
              .filter(Boolean)
              .join(', '),
          ]
            .filter(Boolean)
            .join(', '),
        ],
        [
          'Objekt',
          [
            context.property.address?.street,
            context.property.address?.postalCodeAndCity,
          ]
            .filter(Boolean)
            .join(', ') || '–',
        ],
        [
          'Abrechnungszeitraum',
          `${formatIsoDate(context.billingPeriod.periodStart)} – ${formatIsoDate(context.billingPeriod.periodEnd)} (${context.calculation.periodDays} Tage)`,
        ],
        [
          'Erstellt am',
          formatIsoDate(context.generatedAt.toISOString().slice(0, 10)),
        ],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 12],
  }
}

/**
 * Baut die objektweite Gesamtabrechnung (Legacy `pdfGesamtDoc`) in der
 * internen Fassung (mit Mieter-Salden und Mandatsreferenzen) oder in der
 * Fassung für Mieter (ohne Daten einzelner Mieter).
 */
export function buildCombinedCostStatement(
  context: CombinedCostStatementContext,
): TDocumentDefinitions {
  const internal = context.audience === 'internal'
  const controlDifference = context.calculation.totals.controlDifferenceCents
  const controlOk = Math.abs(controlDifference) <= 1
  const costs = costCategoriesTable(context)
  const balanceRows = internal ? tenantBalanceRows(context) : []

  const internalContent: Content[] = internal
    ? [
        {
          text: 'Nachzahlungen und Guthaben',
          style: 'th',
          margin: [0, 0, 0, 4],
        },
        balanceSummaryTable(balanceRows, context),
        { text: 'Mieter-Salden', style: 'th', margin: [0, 0, 0, 4] },
        tenantBalancesTable(balanceRows),
        ...meteringStatement(context.calculation),
      ]
    : [
        {
          text: 'Diese Fassung enthält keine Daten einzelner Mieter. Ihren persönlichen Anteil entnehmen Sie Ihrer Einzelabrechnung.',
          fontSize: 8,
          color: MUTED,
          margin: [0, 0, 0, 8],
        },
      ]

  return {
    pageSize: 'A4',
    pageMargins: [40, 55, 40, 45],
    footer: (currentPage: number, pageCount: number) => ({
      text: `Gesamtabrechnung ${context.billingPeriod.year} – ${internal ? 'interne Fassung' : 'Fassung für Mieter'}     Seite ${currentPage}/${pageCount}`,
      fontSize: 7,
      color: MUTED,
      margin: [40, 0, 40, 0],
    }),
    content: [
      {
        text: `Gesamtabrechnung Heiz- und Betriebskosten ${context.billingPeriod.year}`,
        style: 'title',
        margin: [0, 0, 0, 2],
      },
      {
        text: internal
          ? 'Interne Fassung mit Mieter-Salden'
          : 'Fassung für Mieter (Kostenaufstellung der Abrechnungseinheit)',
        color: MUTED,
        margin: [0, 0, 0, 8],
      },
      headerTable(context),
      { text: 'Kostenarten', style: 'th', margin: [0, 0, 0, 4] },
      costs.content,
      {
        text: 'Überleitung von den Gesamtkosten zu den auf Mieter verteilten Kosten',
        style: 'th',
        margin: [0, 0, 0, 4],
      },
      reconciliationTable(context, costs),
      ...vacancyTable(context),
      ...heatingSections(context),
      ...internalContent,
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
