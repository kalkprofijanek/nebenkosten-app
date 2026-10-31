import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import type {
  HeatingCircuitTrace,
  OperatingPositionTrace,
} from '@nebenkosten/core'
import type { CostCategory, OccupancyPeriod } from '@nebenkosten/schema'
import { buildSenderBlock } from './address'
import { energyCarrierDisplayName } from './energy-carrier-label'
import type { CombinedCostStatementContext } from './contracts'
import {
  formatAllocationKeyLabel,
  formatEuroCents,
  formatIsoDate,
  formatNumber,
  pdfText,
} from './format'
import {
  amountCell,
  buildingName,
  captureModeFor,
  circuitTitle,
  co2Table,
  fuelAccountTable,
  heatingCompilationTable,
  heatingOperatingCostLines,
  heatingSplitTotalsTable,
  propertyUnitLabel,
  scopeLabel,
} from './heating-summary'
import { ROUNDING_DIFFERENCE_NOTICE, baseAreaLabel } from './legal-texts'
import { circuitMeterReadingTables } from './meter-readings'
import { meteringStatement } from './metering-statement'
import { PDF_MUTED, PDF_TEXT } from './colors'

const BLUE = PDF_TEXT
const MUTED = PDF_MUTED

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
          const raw = source?.name ?? source?.sourceType ?? source?.key
          return raw ? energyCarrierDisplayName(raw) : null
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

/** Interner Kennzeichner nicht umlagefähiger Kostenarten (Legacy). */
const NOT_ALLOCABLE_CODE = /^NICHT[_ ]?UML/iu

/**
 * BetrKV-Spalte: Fundstelle in der BetrKV; der interne Code für nicht
 * umlagefähige Kosten erscheint im Klartext.
 */
export function betrkvCell(code: string | null | undefined): TableCell {
  if (!code) return { text: '–', noWrap: true }
  code = pdfText(code)
  if (NOT_ALLOCABLE_CODE.test(code))
    return { text: 'nicht umlagefähig', fontSize: 6.5, color: MUTED }
  return { text: code, noWrap: true }
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
    stack: [pdfText(label), { text: scope, fontSize: 6.5, color: MUTED }],
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
      betrkvCell(category.betrkvCategory),
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
    betrkvCell(position.betrkvCategory),
    labelWithScope(
      position.label,
      scopeLabel(context.appData, position.scope, context.property),
    ),
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
        `− Betriebsstrom-Umbuchung aus „${pdfText(position.label)}“`,
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
      label: '− Leerstandsanteil (trägt der Vermieter, Aufstellung unten)',
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
  // Nur eine tatsächliche Differenz wird als eigene Zeile ausgewiesen; die
  // Summenzeile ist stets die Summe der gedruckten Zeilen.
  if (distributed !== subtotal)
    lines.push({
      label:
        '± Rundungsausgleich (Mieteranteile einzeln auf Cent gerundet, Restcent-Verteilung)',
      cents: distributed - subtotal,
    })
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
          { text: '= auf die Mieter verteilt', bold: true },
          amountCell(printedSum, { bold: true }),
        ],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 140, 12],
  }
}

function vacancyPeriodLine(
  context: CombinedCostStatementContext,
  occupancy: OccupancyPeriod,
): string {
  const unit = context.units.find(({ id }) => id === occupancy.unitId)
  const result = context.calculation.tenants.find(
    ({ id }) => id === occupancy.id,
  )
  const circuit = context.calculation.heating.trace.circuits.find(
    ({ buildingId }) => buildingId === result?.ownBasis?.buildingId,
  )
  const from =
    occupancy.from && occupancy.from > context.billingPeriod.periodStart
      ? occupancy.from
      : context.billingPeriod.periodStart
  const to =
    occupancy.to && occupancy.to < context.billingPeriod.periodEnd
      ? occupancy.to
      : context.billingPeriod.periodEnd
  const basis = result?.ownBasis
  const areaBasis = circuit?.split.baseAreaBasis ?? 'usable_area'
  const area = basis
    ? areaBasis === 'usable_area'
      ? basis.usableAreaSqm
      : basis.heatedAreaSqm
    : (unit?.usableAreaSqm?.value ?? 0)
  return [
    `${unit?.label ?? occupancy.unitId}: ${formatIsoDate(from)} – ${formatIsoDate(to)}${
      result?.days != null ? ` (${result.days} Tage)` : ''
    }`,
    `${formatNumber(area)} m² ${baseAreaLabel(areaBasis)}`,
    basis && basis.consumption > 0
      ? `Verbrauch ${formatNumber(basis.consumption)} ${basis.consumptionUnit}`
      : null,
  ]
    .filter(Boolean)
    .join(', ')
}

/**
 * Aufstellung des Leerstandsanteils: leerstehende Nutzungen mit Zeitraum,
 * Fläche und Verbrauch, die Beträge je Kostenart, Heiz- und CO₂-Kosten
 * getrennt und eine sichtbare Rundungszeile. Überschrift und Tabelle bleiben
 * auf einer Seite.
 */
function vacancyTable(context: CombinedCostStatementContext): Content[] {
  const total = context.calculation.vacancyLandlordCents
  if (total === 0) return []
  const positions = (context.calculation.operatingPositions ?? []).filter(
    ({ vacancyCents }) => vacancyCents !== 0,
  )
  const vacancyOccupancies = context.occupancyPeriods.filter(
    (occupancy) =>
      occupancy.kind === 'vacancy' &&
      occupancy.billingPeriodId === context.billingPeriod.id,
  )
  const vacancyResults = context.calculation.tenants.filter(
    ({ isVacancy }) => isVacancy,
  )
  const breakdownSum = (
    pick: (
      breakdown: (typeof vacancyResults)[number]['costBreakdown'],
    ) => number,
  ) =>
    vacancyResults.reduce((sum, result) => sum + pick(result.costBreakdown), 0)
  const rows: TableCell[][] = positions.map((position): TableCell[] => [
    pdfText(position.label),
    amountCell(position.vacancyCents),
  ])
  if (positions.length > 0) {
    const heating = breakdownSum(
      (breakdown) =>
        breakdown.heatingBaseCents +
        breakdown.heatingConsumptionCents +
        breakdown.hotWaterCents,
    )
    const co2 = breakdownSum(({ heatingCo2Cents }) => heatingCo2Cents)
    if (heating !== 0)
      rows.push([
        'Heizkosten (Grund-, Verbrauchs- und Warmwasserkosten)',
        amountCell(heating),
      ])
    if (co2 !== 0) rows.push(['CO2-Kostenanteil', amountCell(co2)])
    const printed = positions.reduce(
      (sum, position) => sum + position.vacancyCents,
      heating + co2,
    )
    const rest = total - printed
    // Wenige Cent sind Rundung der einzeln gerundeten Zeilen; ein größerer
    // Rest stammt aus nicht als Nutzung erfassten Leerstandszeiten/-flächen
    // (Gesamtnenner größer als die Summe der Nutzungen).
    if (rest !== 0)
      rows.push(
        Math.abs(rest) <= rows.length
          ? [
              {
                text: 'Rundungsausgleich (Zeilen einzeln auf Cent gerundet)',
                color: MUTED,
              },
              amountCell(rest),
            ]
          : [
              'Heiz- und CO2-Kosten nicht als Nutzung erfasster Leerstandszeiten bzw. -flächen (einschl. Rundung)',
              amountCell(rest),
            ],
      )
  }
  rows.push([
    { text: 'Leerstandsanteil gesamt (Vermieter)', bold: true },
    amountCell(total, { bold: true }),
  ])
  const details: Content[] =
    vacancyOccupancies.length > 0
      ? [
          {
            ul: vacancyOccupancies.map((occupancy) =>
              vacancyPeriodLine(context, occupancy),
            ),
            fontSize: 8,
            margin: [0, 0, 0, 4],
          },
        ]
      : []
  return [
    {
      unbreakable: true,
      stack: [
        { text: 'Leerstandsanteil', style: 'th', margin: [0, 0, 0, 4] },
        ...details,
        {
          table: { widths: ['*', 90], body: rows },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 140, 12],
        },
      ],
    },
  ]
}

/** Personenzeit einer Nutzung wie in der Warmwasserverteilung. */
function personYears(
  result: CombinedCostStatementContext['calculation']['tenants'][number],
): number {
  if (result.isVacancy || !result.ownBasis) return 0
  const persons = result.ownBasis.persons > 0 ? result.ownBasis.persons : 1
  return persons * (result.timeFactor ?? 1)
}

/**
 * Verteilungsgrundlagen eines Heizkreises: Summe der Verbräuche (davon
 * Leerstand) und – bei Warmwasser nach Personen – die Personenjahre. Die
 * interne Fassung listet die Werte je Nutzung.
 *
 * Offene Entscheidung: In der Fassung für Mieter erscheinen nur Summen,
 * keine Personenzahlen und Verbräuche einzelner Wohnungen (Datenschutz);
 * Einzelwerte bleiben der Belegeinsicht vorbehalten.
 */
function distributionBasisTable(
  context: CombinedCostStatementContext,
  circuit: HeatingCircuitTrace,
): Content[] {
  const results = context.calculation.tenants.filter(
    ({ ownBasis }) => ownBasis?.buildingId === circuit.buildingId,
  )
  if (results.length === 0) return []
  const unit = results[0]?.ownBasis?.consumptionUnit ?? 'Einheiten'
  const vacancyConsumption = results
    .filter(({ isVacancy }) => isVacancy)
    .reduce((sum, result) => sum + (result.ownBasis?.consumption ?? 0), 0)
  const tenantCount = results.filter(({ isVacancy }) => !isVacancy).length
  const hotWater = circuit.warmWater.method !== 'none'
  const rows: TableCell[][] = [
    [
      'Nutzungen im Heizkreis',
      `${tenantCount} Mieter-Nutzungen, ${results.length - tenantCount} Leerstand`,
    ],
    [
      `Fläche (${baseAreaLabel(circuit.split.baseAreaBasis)}) für die Grundkosten`,
      `${formatNumber(circuit.split.baseDenominator)} m²`,
    ],
    [
      'Verbrauch aller Nutzungen für die Verbrauchskosten',
      `${formatNumber(circuit.split.consumptionDenominator)} ${unit}${
        vacancyConsumption > 0
          ? ` (davon Leerstand ${formatNumber(vacancyConsumption)} ${unit})`
          : ''
      }`,
    ],
  ]
  const hotWaterAllocation = circuit.warmWater.allocation
  // N2: bei Warmwasser nach Fläche die Flächenbasis statt „0,000 Personenjahre“ ausweisen
  if (hotWater && hotWaterAllocation && hotWaterAllocation.key !== 'persons')
    rows.push([
      'Fläche × Nutzungszeit für die Warmwasserkosten nach Fläche',
      `${formatNumber(hotWaterAllocation.areaTimeDenominator ?? 0, 3)} m²; ${formatEuroCents(hotWaterAllocation.areaCents)} : ${formatNumber(hotWaterAllocation.areaTimeDenominator ?? 0, 3)} = ${formatNumber(
        (hotWaterAllocation.areaTimeDenominator ?? 0) > 0
          ? hotWaterAllocation.areaCents /
              100 /
              hotWaterAllocation.areaTimeDenominator!
          : 0,
        4,
      )} € je m²`,
    ])
  else if (hotWater)
    rows.push([
      'Personenjahre für die Warmwasserkosten (Personen × Nutzungstage ÷ Tage des Abrechnungszeitraums; Leerstand ohne Personen)',
      `${formatNumber(circuit.warmWater.personTimeDenominator, 3)} Personenjahre; ${formatEuroCents(circuit.warmWater.poolCents)} : ${formatNumber(circuit.warmWater.personTimeDenominator, 3)} = ${formatNumber(
        circuit.warmWater.personTimeDenominator > 0
          ? circuit.warmWater.poolCents /
              100 /
              circuit.warmWater.personTimeDenominator
          : 0,
        4,
      )} € je Personenjahr`,
    ])
  const content: Content[] = [
    {
      unbreakable: true,
      stack: [
        {
          text: `Verteilungsgrundlagen ${circuitTitle(context.appData, circuit)}`,
          style: 'th',
          margin: [0, 4, 0, 4],
        },
        {
          table: { widths: ['*', 'auto'], body: rows },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 8],
        },
      ],
    },
  ]
  if (context.audience !== 'internal') return content
  const byId = new Map(context.occupancyPeriods.map((item) => [item.id, item]))
  const detailRows: TableCell[][] = results.map((result) => {
    const occupancy = byId.get(result.id)
    const unitLabel =
      context.units.find(({ id }) => id === occupancy?.unitId)?.label ??
      occupancy?.unitId ??
      result.id
    return [
      `${unitLabel}${result.isVacancy ? ' (Leerstand)' : ''}`,
      { text: `${result.days ?? '–'}`, alignment: 'right' },
      {
        text: result.isVacancy
          ? '–'
          : formatNumber(result.ownBasis?.persons ?? 0),
        alignment: 'right',
      },
      {
        text: hotWater ? formatNumber(personYears(result), 3) : '–',
        alignment: 'right',
      },
      {
        text: `${formatNumber(result.ownBasis?.consumption ?? 0)}${
          occupancy?.consumptionUnitsEstimated ? ' (geschätzt)' : ''
        }`,
        alignment: 'right',
      },
    ]
  })
  const th = (text: string, right = true): TableCell => ({
    text,
    style: 'th',
    fontSize: 7.5,
    alignment: right ? 'right' : 'left',
  })
  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto', 'auto'],
      body: [
        [
          th('Nutzung', false),
          th('Tage'),
          th('Personen'),
          th('Personenjahre'),
          th(`Verbrauch (${unit})`),
        ],
        ...detailRows,
        [
          { text: 'Summe', bold: true },
          '',
          '',
          {
            text: hotWater
              ? formatNumber(
                  results.reduce((sum, result) => sum + personYears(result), 0),
                  3,
                )
              : '–',
            alignment: 'right',
            bold: true,
          },
          {
            text: formatNumber(
              results.reduce(
                (sum, result) => sum + (result.ownBasis?.consumption ?? 0),
                0,
              ),
            ),
            alignment: 'right',
            bold: true,
          },
        ],
      ],
    },
    layout: 'lightHorizontalLines',
    fontSize: 7.5,
    margin: [0, 0, 0, 12],
  })
  return content
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
      heatingCompilationTable(
        circuit,
        heatingOperatingCostLines(
          context.appData,
          context.billingPeriod.id,
          circuit,
        ),
      ),
      heatingSplitTotalsTable(
        circuit,
        captureModeFor(context.calculation, circuit.buildingId),
      ),
      ...co2Table(context.appData, circuit),
      ...distributionBasisTable(context, circuit),
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
          'Abrechnungseinheit Betriebskosten',
          propertyUnitLabel(context.property),
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
        {
          text: ROUNDING_DIFFERENCE_NOTICE,
          fontSize: 7,
          color: MUTED,
          margin: [0, -8, 0, 8],
        },
        ...circuitMeterReadingTables(
          context.appData,
          context.calculation,
          context.occupancyPeriods.filter(
            ({ billingPeriodId }) =>
              billingPeriodId === context.billingPeriod.id,
          ),
          context.units,
        ),
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
      {
        text: ROUNDING_DIFFERENCE_NOTICE,
        fontSize: 7,
        color: MUTED,
        margin: [0, -8, 0, 8],
      },
      ...vacancyTable(context),
      ...heatingSections(context),
      ...internalContent,
      {
        // Ohne Farbe: Eine Abweichung wird im Text als Fehler benannt.
        text: controlOk
          ? `Kontrollsumme (muss 0 sein): ${formatEuroCents(controlDifference)}`
          : `Kontrollsumme (muss 0 sein): ${formatEuroCents(controlDifference)} – FEHLER, bitte prüfen`,
        bold: true,
        margin: [0, 8, 0, 0],
      },
    ],
    styles: {
      title: { fontSize: 14, bold: true, color: BLUE },
      th: { fontSize: 9, bold: true, color: BLUE },
      header: { fontSize: 11, bold: true },
    },
    defaultStyle: { fontSize: 9, color: PDF_TEXT, font: 'Roboto' },
  }
}
