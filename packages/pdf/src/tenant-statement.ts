import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import {
  calculateOccupancyDays,
  resolveShippingAddress,
  type HeatingCircuitTrace,
  type OperatingPositionTrace,
  type TenantAllocationBasis,
  type TenantCalculationResult,
} from '@nebenkosten/core'
import { buildRecipientBlock, buildSenderBlock } from './address'
import { meteringStatement } from './metering-statement'
import type { TenantStatementContext } from './contracts'
import { renderCoverLetter, type CoverLetterPlaceholders } from './cover-letter'
import {
  addDaysIso,
  balanceLabel,
  formatAllocationKeyLabel,
  formatEuroCents,
  formatIban,
  formatIsoDate,
  formatNumber,
  formatPercent,
  formatUnitPrice,
} from './format'
import {
  amountCell,
  buildingName,
  captureModeFor,
  circuitTitle,
  co2Table,
  consumptionUnitLabel,
  energyCarrierMixLabel,
  fuelAccountTable,
  heatingCompilationTable,
  heatingOperatingCostLines,
  heatingSplitTotalsTable,
  meteringFeeCents,
  propertyUnitLabel,
  scopeLabel,
} from './heating-summary'
import {
  BALANCED_TEXT,
  CIRCUIT_AVERAGE_LABEL,
  CONSUMPTION_INFORMATION_HEADING,
  DISPUTE_RESOLUTION_NOTICE,
  ENERGY_ADVICE_NOTICE,
  ENERGY_TAXES_NOTICE,
  ENERGY_CARRIER_MIX_LABEL,
  NO_PREVIOUS_PERIOD_CONSUMPTION,
  NO_PREVIOUS_PERIOD_DATA,
  NOT_RESIDENT_IN_PREVIOUS_PERIOD,
  PREVIOUS_PERIOD_COMPARISON_HEADING,
  PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED,
  circuitAverageExplanation,
  OBJECTION_NOTICE,
  PROPERTY_DATA_HEADING,
  ROUNDING_DIFFERENCE_NOTICE,
  SECTION_35A_NOTICE,
  TIME_FACTOR_EXPLANATION,
  additionalPaymentText,
  baseAreaLabel,
  creditText,
  estimatedConsumptionNote,
  heatingSplitExplanation,
  meteringFeesText,
} from './legal-texts'
import {
  formatMeterValue,
  hasReading,
  readingCells,
  readingDifference,
} from './meter-readings'

const BLUE = '#1a3a5c'
const LIGHT_FILL = '#eef4fb'
const MUTED = '#5a6a78'
const PAYMENT_TERM_DAYS = 30

/** Nutzungszeitraum des Mieters, auf den Abrechnungszeitraum begrenzt. */
function occupancyRange(context: TenantStatementContext) {
  const { billingPeriod, occupancyPeriod } = context
  const from =
    occupancyPeriod.from && occupancyPeriod.from > billingPeriod.periodStart
      ? occupancyPeriod.from
      : billingPeriod.periodStart
  const to =
    occupancyPeriod.to && occupancyPeriod.to < billingPeriod.periodEnd
      ? occupancyPeriod.to
      : billingPeriod.periodEnd
  return {
    from,
    to,
    partial:
      from !== billingPeriod.periodStart || to !== billingPeriod.periodEnd,
  }
}

function resolvedBuildingId(context: TenantStatementContext) {
  const { occupancyPeriod, unit } = context
  return occupancyPeriod.costScope?.kind === 'building'
    ? occupancyPeriod.costScope.buildingId
    : unit.buildingId
}

function circuitTraceFor(context: TenantStatementContext) {
  const { calculation } = context
  const buildingId = resolvedBuildingId(context)
  return calculation.heating.trace.circuits.find(
    (circuit) => circuit.buildingId === buildingId,
  )
}

function tenantResult(
  context: TenantStatementContext,
): TenantCalculationResult {
  const { calculation, occupancyPeriod } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  if (!tenant) {
    throw new Error(
      `Kein Berechnungsergebnis für Nutzungszeitraum "${occupancyPeriod.id}" gefunden.`,
    )
  }
  return tenant
}

interface TenantFacts {
  readonly days: number
  readonly periodDays: number
  readonly partial: boolean
  readonly basis: TenantAllocationBasis
}

/**
 * Nutzungstage und eigene Bezugsgrößen; ältere Rechenstände ohne Trace
 * werden aus Einheit und Nutzungszeitraum abgeleitet.
 */
function tenantFacts(
  context: TenantStatementContext,
  tenant: TenantCalculationResult,
): TenantFacts {
  const { billingPeriod, occupancyPeriod, unit, calculation } = context
  const periodDays = calculation.periodDays
  const days =
    tenant.days ??
    calculateOccupancyDays(
      billingPeriod.periodStart,
      billingPeriod.periodEnd,
      occupancyPeriod.from,
      occupancyPeriod.to,
    )
  const usable = unit.usableAreaSqm?.value ?? 0
  const basis: TenantAllocationBasis = tenant.ownBasis ?? {
    buildingId: resolvedBuildingId(context) ?? null,
    usableAreaSqm: usable,
    heatedAreaSqm: unit.heatedAreaSqm?.value || usable,
    persons: occupancyPeriod.persons?.value ?? 0,
    consumption: occupancyPeriod.consumptionUnits?.value ?? 0,
    consumptionUnit: 'Einheiten',
  }
  return { days, periodDays, partial: days !== periodDays, basis }
}

function heatingTotalCents(tenant: TenantCalculationResult): number {
  const { costBreakdown } = tenant
  return (
    costBreakdown.heatingBaseCents +
    costBreakdown.heatingConsumptionCents +
    costBreakdown.hotWaterCents
  )
}

function summaryTable(context: TenantStatementContext): Content {
  const tenant = tenantResult(context)
  const { costBreakdown } = tenant
  const operatingCents = costBreakdown.operatingByCategory.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  )
  const label = balanceLabel(tenant.balanceCents)
  const rows: [string, string][] = [
    ['Ihre Heizkosten', formatEuroCents(heatingTotalCents(tenant))],
    ['Ihr CO2-Kostenanteil', formatEuroCents(costBreakdown.heatingCo2Cents)],
    ['Ihre Betriebskosten', formatEuroCents(operatingCents)],
    ['Ihr Anteil an den Gesamtkosten', formatEuroCents(tenant.shareCents)],
    [
      'Von Ihnen geleistete Vorauszahlungen',
      formatEuroCents(tenant.prepaymentCents),
    ],
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
            noWrap: true,
            bold: emphasized,
            fillColor: balanceRow ? LIGHT_FILL : undefined,
            color:
              balanceRow && tenant.balanceCents < 0 ? '#1a6a2e' : undefined,
          },
        ]
      }),
    },
    layout: 'lightHorizontalLines',
    margin: [0, 8, 0, 4],
  }
}

/** Abrechnungsdatum: Versanddatum, sonst Erstelldatum des Schreibens. */
function statementDate(context: TenantStatementContext): string {
  return (
    context.occupancyPeriod.dispatchDate ??
    context.billingPeriod.dispatchDate ??
    context.generatedAt.toISOString().slice(0, 10)
  )
}

function paymentContent(context: TenantStatementContext): Content[] {
  const tenant = tenantResult(context)
  const { billingPeriod, unit } = context
  const sender = buildSenderBlock(context.ownerCompany, context.property)
  const amount = formatEuroCents(Math.abs(tenant.balanceCents))
  const notes = billingPeriod.notes
  if (tenant.balanceCents > 0) {
    return [
      {
        text: additionalPaymentText({
          amount,
          dueDate: formatIsoDate(
            addDaysIso(statementDate(context), PAYMENT_TERM_DAYS),
          ),
          iban: sender.iban ? formatIban(sender.iban) : null,
          reference: `NK ${billingPeriod.year} ${unit.label ?? ''}`.trim(),
        }),
        margin: [0, 0, 0, 4],
      },
      ...(notes?.additionalPayment
        ? [{ text: notes.additionalPayment, margin: [0, 0, 0, 4] } as Content]
        : []),
    ]
  }
  if (tenant.balanceCents < 0) {
    return [
      {
        text: creditText(amount, {
          movedOut: Boolean(
            context.occupancyPeriod.to &&
            context.occupancyPeriod.to < billingPeriod.periodEnd,
          ),
        }),
        margin: [0, 0, 0, 4],
      },
      ...(notes?.credit
        ? [{ text: notes.credit, margin: [0, 0, 0, 4] } as Content]
        : []),
    ]
  }
  return [{ text: BALANCED_TEXT, margin: [0, 0, 0, 4] }]
}

/**
 * Abrechnungseinheit der Betriebskosten: das Objekt (Objektanschrift bzw.
 * -nummer), bei gebäudebezogener Kostenzuordnung der Gebäudename.
 */
function operatingUnitLabel(context: TenantStatementContext): string {
  const { occupancyPeriod } = context
  if (occupancyPeriod.costScope?.kind === 'building')
    return `Gebäude ${buildingName(context.appData, occupancyPeriod.costScope.buildingId)}`
  return propertyUnitLabel(context.property)
}

function basisTable(
  context: TenantStatementContext,
  facts: TenantFacts,
  circuit: HeatingCircuitTrace | undefined,
): Content {
  const rows: TableCell[][] = [
    [
      'Ihre Nutzungstage',
      `${facts.days} von ${facts.periodDays} Tagen (Zeitfaktor ${formatNumber(facts.days / facts.periodDays, 4)})`,
    ],
    ['Ihre Wohnfläche', `${formatNumber(facts.basis.usableAreaSqm)} m²`],
  ]
  if (facts.basis.heatedAreaSqm !== facts.basis.usableAreaSqm) {
    rows.push([
      'Ihre beheizte Fläche',
      `${formatNumber(facts.basis.heatedAreaSqm)} m²`,
    ])
  }
  rows.push(
    ['Abrechnungseinheit Betriebskosten', operatingUnitLabel(context)],
    [
      'Abrechnungseinheit Heizkosten',
      circuit
        ? circuitTitle(context.appData, circuit)
        : `Gebäude ${buildingName(context.appData, resolvedBuildingId(context))}`,
    ],
  )
  return {
    table: { widths: ['*', 'auto'], body: rows },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 8],
  }
}

/** Eigene Einheiten zum Umlageschlüssel einer Kostenart. */
function ownUnits(
  position: OperatingPositionTrace,
  facts: TenantFacts,
): string {
  const timeSuffix = facts.partial
    ? ` × ${facts.days}/${facts.periodDays} Tage`
    : ''
  switch (position.allocationKey) {
    case 'usable_area':
      return `${formatNumber(facts.basis.usableAreaSqm)} m²${timeSuffix}`
    case 'heated_area':
      return `${formatNumber(facts.basis.heatedAreaSqm)} m²${timeSuffix}`
    case 'residential_units':
      return `1 WE${timeSuffix}`
    case 'consumption_units':
      return facts.basis.consumptionUnit === 'Einheiten'
        ? `${formatNumber(facts.basis.consumption)} Einheiten`
        : '–'
    default:
      return '–'
  }
}

function denominatorText(position: OperatingPositionTrace): string {
  if (position.denominator == null || position.denominatorUnit == null)
    return '–'
  return `${formatNumber(position.denominator)} ${position.denominatorUnit}`
}

function legacyCostCategoryTable(context: TenantStatementContext): Content {
  const tenant = tenantResult(context)
  const categoriesById = new Map(
    context.costCategories.map((category) => [category.id, category]),
  )
  const body: TableCell[][] = [
    [
      { text: 'Kostenart', style: 'th' },
      { text: 'Schlüssel', style: 'th' },
      { text: 'Ihr Anteil', style: 'th', alignment: 'right' },
    ],
    ...tenant.costBreakdown.operatingByCategory.map((item): TableCell[] => {
      const category = categoriesById.get(item.costCategoryId)
      return [
        category?.statementText ?? category?.label ?? item.costCategoryId,
        formatAllocationKeyLabel(category?.allocationKey),
        amountCell(item.amountCents),
      ]
    }),
  ]
  return {
    table: { widths: ['*', 'auto', 'auto'], body },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 8],
  }
}

function costCategoryTable(
  context: TenantStatementContext,
  facts: TenantFacts,
): Content[] {
  const tenant = tenantResult(context)
  const items = tenant.costBreakdown.operatingByCategory.filter(
    ({ amountCents }) => amountCents !== 0,
  )
  if (items.length === 0) {
    return [
      {
        text: 'Keine Betriebskosten-Positionen erfasst.',
        margin: [0, 4, 0, 8],
      },
    ]
  }
  const positions = context.calculation.operatingPositions
  if (!positions) return [legacyCostCategoryTable(context)]

  const positionsById = new Map(
    positions.map((position) => [position.costCategoryId, position]),
  )
  const rows = items.map((item): TableCell[] => {
    const position = positionsById.get(item.costCategoryId)
    if (!position) {
      return [
        item.costCategoryId,
        '–',
        '–',
        '–',
        '–',
        amountCell(item.amountCents),
      ]
    }
    return [
      {
        stack: [
          position.label,
          {
            text: scopeLabel(context.appData, position.scope, context.property),
            fontSize: 7,
            color: MUTED,
          },
        ],
      },
      amountCell(position.distributedCents),
      formatAllocationKeyLabel(position.allocationKey),
      { text: denominatorText(position), alignment: 'right', noWrap: true },
      { text: ownUnits(position, facts), alignment: 'right' },
      amountCell(item.amountCents),
    ]
  })
  const total = items.reduce((sum, item) => sum + item.amountCents, 0)
  const movedElectricity = items.some(
    (item) =>
      (positionsById.get(item.costCategoryId)
        ?.operatingElectricityDeductedCents ?? 0) !== 0,
  )
  return [
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 62, 'auto', 58, 70, 58],
        body: [
          [
            { text: 'Kostenart', style: 'th' },
            {
              text: 'Gesamtkosten (umlagefähig)',
              style: 'th',
              alignment: 'right',
            },
            { text: 'Schlüssel', style: 'th' },
            { text: 'Gesamt-einheiten', style: 'th', alignment: 'right' },
            { text: 'Ihre Einheiten', style: 'th', alignment: 'right' },
            { text: 'Ihr Anteil', style: 'th', alignment: 'right' },
          ],
          ...rows,
          [
            { text: 'Summe Ihrer Betriebskosten', bold: true, colSpan: 5 },
            {},
            {},
            {},
            {},
            amountCell(total, { bold: true }),
          ],
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 8,
      margin: [0, 4, 0, 2],
    },
    {
      text: `Ihr Anteil = Gesamtkosten : Gesamteinheiten × Ihre Einheiten${facts.partial ? ' × Ihre Nutzungstage : Tage des Abrechnungszeitraums' : ''}.${
        movedElectricity
          ? ' Gesamtkosten nach Abzug des in die Heizkosten umgebuchten Betriebsstroms.'
          : ''
      }`,
      fontSize: 7,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}

function section12Applies(context: TenantStatementContext): boolean {
  const { occupancyPeriod } = context
  return Boolean(
    !circuitTraceFor(context)?.split.areaOnlySection9a &&
    occupancyPeriod.applySection12Reduction &&
    occupancyPeriod.consumptionUnitsEstimated &&
    captureModeFor(context.calculation, resolvedBuildingId(context)) !==
      'heat_meter',
  )
}

function tenantHeatingTable(
  context: TenantStatementContext,
  circuit: HeatingCircuitTrace,
  facts: TenantFacts,
): Content {
  const tenant = tenantResult(context)
  const { costBreakdown } = tenant
  const { split } = circuit
  const mode = captureModeFor(context.calculation, circuit.buildingId)
  const unit =
    facts.basis.consumptionUnit === 'kWh' ? 'kWh' : consumptionUnitLabel(mode)
  const ownArea =
    split.baseAreaBasis === 'usable_area'
      ? facts.basis.usableAreaSqm
      : facts.basis.heatedAreaSqm
  const basePrice =
    split.baseDenominator > 0 ? split.baseCents / split.baseDenominator : 0
  const consumptionPrice =
    split.consumptionDenominator > 0
      ? split.consumptionCents / split.consumptionDenominator
      : 0
  const reduction = section12Applies(context)
    ? ' × 85 % (Kürzung § 12 HeizKV)'
    : ''
  const rows: TableCell[][] = [
    [
      { text: 'Ihre Heizkosten-Aufschlüsselung', style: 'th' },
      { text: '', style: 'th' },
    ],
    [
      `${split.areaOnlySection9a ? 'Heizkosten nach Fläche (§ 9a Abs. 2 HeizKV)' : 'Grundkosten'}: ${formatUnitPrice(basePrice, 'm²')} × ${formatNumber(ownArea)} m² ${baseAreaLabel(split.baseAreaBasis)} × ${facts.days}/${facts.periodDays} Tage${reduction}`,
      amountCell(costBreakdown.heatingBaseCents),
    ],
    [
      split.areaOnlySection9a
        ? 'Verbrauchskosten: entfallen (§ 9a Abs. 2 HeizKV, Verteilung nur nach Fläche)'
        : `Verbrauchskosten: ${formatUnitPrice(consumptionPrice, unit === 'kWh' ? 'kWh' : 'Einheit')} × ${formatNumber(facts.basis.consumption)} ${unit}${reduction}`,
      amountCell(costBreakdown.heatingConsumptionCents),
    ],
  ]
  if (circuit.warmWater.method !== 'none') {
    rows.push([
      `Warmwasser: ${formatEuroCents(circuit.warmWater.poolCents)} : ${formatNumber(circuit.warmWater.personTimeDenominator)} Personenjahre × Ihre Personen × Zeitfaktor`,
      amountCell(costBreakdown.hotWaterCents),
    ])
  }
  rows.push([
    { text: 'Ihre Heizkosten', bold: true },
    amountCell(heatingTotalCents(tenant), { bold: true }),
  ])
  return {
    table: { widths: ['*', 80], body: rows },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 4],
  }
}

function isMeteredOccupancy(context: TenantStatementContext): boolean {
  return Boolean(
    context.calculation.meteringTrace?.circuits.some((circuit) =>
      circuit.occupancies.some(
        (occupancy) => occupancy.occupancyId === context.occupancyPeriod.id,
      ),
    ),
  )
}

/**
 * „Ihre Verbrauchserfassung“: Zählerstände (bzw. Schätzgrund) und die
 * vollständige Rechnung der Heiz- und CO2-Kosten des Mieters.
 */
function consumptionCapture(
  context: TenantStatementContext,
  circuit: HeatingCircuitTrace,
  facts: TenantFacts,
): Content[] {
  const tenant = tenantResult(context)
  const { costBreakdown } = tenant
  const { occupancyPeriod } = context
  const { split, co2 } = circuit
  const mode = captureModeFor(context.calculation, circuit.buildingId)
  const unit =
    facts.basis.consumptionUnit === 'kWh' ? 'kWh' : consumptionUnitLabel(mode)
  const unitSingular = unit === 'kWh' ? 'kWh' : 'Einheit'
  const consumption = facts.basis.consumption
  const ownArea =
    split.baseAreaBasis === 'usable_area'
      ? facts.basis.usableAreaSqm
      : facts.basis.heatedAreaSqm
  const basePrice =
    split.baseDenominator > 0 ? split.baseCents / split.baseDenominator : 0
  const consumptionPrice =
    split.consumptionDenominator > 0
      ? split.consumptionCents / split.consumptionDenominator
      : 0
  const reduction = section12Applies(context) ? ' × 85 %' : ''
  const timeText = `${facts.days}/${facts.periodDays} Tage`
  const reading = occupancyPeriod.heatMeterReading
  const estimated = Boolean(
    occupancyPeriod.consumptionUnitsEstimated && !isMeteredOccupancy(context),
  )
  const content: Content[] = [
    { text: 'Ihre Verbrauchserfassung', style: 'th', margin: [0, 6, 0, 2] },
  ]
  const lines: string[] = []
  if (estimated) {
    content.push({
      text: estimatedConsumptionNote(
        occupancyPeriod.consumptionUnitsEstimateReason,
      ).replace(/^\* /u, ''),
      fontSize: 8,
      margin: [0, 0, 0, 2],
    })
    lines.push(
      `Verbrauch (geschätzt) = ${formatNumber(consumption)} ${unit}${split.areaOnlySection9a ? ' (nur zur Information, nicht zur Kostenverteilung verwendet)' : ''}`,
    )
  } else if (hasReading(reading)) {
    content.push({
      table: {
        headerRows: 1,
        widths: ['auto', '*', '*', 'auto'],
        body: [
          [
            { text: 'Zähler-Nr.', style: 'th' },
            { text: 'Stand alt (Datum)', style: 'th' },
            { text: 'Stand neu (Datum)', style: 'th' },
            { text: 'Verbrauch', style: 'th', alignment: 'right' },
          ],
          readingCells(reading, unit),
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 2],
    })
    const difference = readingDifference(reading)
    if (difference === null) {
      lines.push(
        `Verbrauch laut Erfassung = ${formatNumber(consumption)} ${unit}`,
      )
    } else {
      lines.push(
        `Verbrauch = Stand neu − Stand alt = ${formatMeterValue(reading.endValue!)} − ${formatMeterValue(reading.startValue!)} = ${formatMeterValue(difference)} ${unit}`,
      )
      if (Math.abs(difference - consumption) > 0.5)
        lines.push(
          `Abgerechnet werden ${formatNumber(consumption)} ${unit} laut Verbrauchserfassung.`,
        )
    }
  } else {
    lines.push(
      `Verbrauch laut Erfassung = ${formatNumber(consumption)} ${unit}`,
    )
  }
  lines.push(
    split.areaOnlySection9a
      ? 'Verbrauchskosten entfallen (§ 9a Abs. 2 HeizKV): Verteilung ausschließlich nach Fläche'
      : `Verbrauchskosten = ${formatUnitPrice(consumptionPrice, unitSingular)} × ${formatNumber(consumption)} ${unit}${reduction} = ${formatEuroCents(costBreakdown.heatingConsumptionCents)}`,
    `${split.areaOnlySection9a ? 'Heizkosten nach Fläche' : 'Grundkosten'} = ${formatUnitPrice(basePrice, 'm²')} × ${formatNumber(ownArea)} m² × ${timeText}${reduction} = ${formatEuroCents(costBreakdown.heatingBaseCents)}`,
  )
  const hasHotWater = circuit.warmWater.method !== 'none'
  if (hasHotWater)
    lines.push(`Warmwasser = ${formatEuroCents(costBreakdown.hotWaterCents)}`)
  lines.push(
    `Heizkosten gesamt = Grundkosten + Verbrauchskosten${hasHotWater ? ' + Warmwasser' : ''} = ${[
      costBreakdown.heatingBaseCents,
      costBreakdown.heatingConsumptionCents,
      ...(hasHotWater ? [costBreakdown.hotWaterCents] : []),
    ]
      .map(formatEuroCents)
      .join(' + ')} = ${formatEuroCents(heatingTotalCents(tenant))}`,
  )
  if (costBreakdown.heatingCo2Cents !== 0 && co2.tenantCents !== 0) {
    const co2BasePrice =
      split.baseDenominator > 0
        ? (co2.tenantCents * (split.baseSharePercent / 100)) /
          split.baseDenominator
        : 0
    const co2ConsumptionPrice =
      split.consumptionDenominator > 0
        ? (co2.tenantCents * (split.consumptionSharePercent / 100)) /
          split.consumptionDenominator
        : 0
    const co2BaseCents = Math.round(
      co2BasePrice * ownArea * (facts.days / facts.periodDays),
    )
    const co2ConsumptionCents = costBreakdown.heatingCo2Cents - co2BaseCents
    lines.push(
      `CO2-Kosten Mieteranteil des Heizkreises = ${formatEuroCents(co2.tenantCents)} (${formatPercent(split.baseSharePercent)} Grundanteil, ${formatPercent(split.consumptionSharePercent)} Verbrauchsanteil)`,
      `CO2-Grundanteil = ${formatUnitPrice(co2BasePrice, 'm²')} × ${formatNumber(ownArea)} m² × ${timeText} = ${formatEuroCents(co2BaseCents)}`,
      `CO2-Verbrauchsanteil = ${formatUnitPrice(co2ConsumptionPrice, unitSingular)} × ${formatNumber(consumption)} ${unit} = ${formatEuroCents(co2ConsumptionCents)}`,
      `Ihr CO2-Kostenanteil = ${formatEuroCents(co2BaseCents)} + ${formatEuroCents(co2ConsumptionCents)} = ${formatEuroCents(costBreakdown.heatingCo2Cents)}`,
    )
  }
  content.push({
    stack: lines.map((text): Content => ({ text })),
    fontSize: 8,
    margin: [0, 0, 0, 6],
  })
  return content
}

function heatingSection(
  context: TenantStatementContext,
  facts: TenantFacts,
): Content[] {
  const tenant = tenantResult(context)
  const { costBreakdown } = tenant
  const heatingCents = heatingTotalCents(tenant) + costBreakdown.heatingCo2Cents
  if (heatingCents === 0) return []

  const circuit = circuitTraceFor(context)
  if (!circuit) {
    throw new Error(
      `Kein Heizkreis-Nachweis für Nutzungszeitraum "${context.occupancyPeriod.id}" gefunden.`,
    )
  }
  const mode = captureModeFor(context.calculation, circuit.buildingId)
  return [
    {
      text: `Heizkosten – Zusammenstellung für Ihren ${circuitTitle(context.appData, circuit)} (§ 7 Abs. 2 HeizKV)`,
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
    { text: 'Aufteilung der Heizkosten', style: 'th', margin: [0, 4, 0, 2] },
    heatingSplitTotalsTable(circuit, mode),
    tenantHeatingTable(context, circuit, facts),
    ...consumptionCapture(context, circuit, facts),
    {
      text: heatingSplitExplanation(circuit.split.consumptionSharePercent, {
        baseAreaBasis: circuit.split.baseAreaBasis,
        captureMode: mode,
        hasCentralHotWater: circuit.warmWater.method !== 'none',
        areaOnlySection9aPercent: circuit.split.areaOnlySection9a
          ? circuit.split.estimatedAreaSharePercent
          : undefined,
      }),
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}

function co2Section(context: TenantStatementContext): Content[] {
  const tenant = tenantResult(context)
  const circuit = circuitTraceFor(context)
  if (!circuit) {
    if (resolvedBuildingId(context) != null) {
      throw new Error(
        `Kein CO2-Nachweis für Nutzungszeitraum "${context.occupancyPeriod.id}" gefunden.`,
      )
    }
    return []
  }
  return co2Table(
    context.appData,
    circuit,
    tenant.costBreakdown.heatingCo2Cents,
  )
}

/** Bescheinigung nach § 35a EStG; entfällt ohne erfassten Lohnanteil. */
function section35aContent(context: TenantStatementContext): Content[] {
  const section = tenantResult(context).section35a
  if (!section || section.items.length === 0) return []
  const categoriesById = new Map(
    context.costCategories.map((category) => [category.id, category]),
  )
  const rows = section.items.map(({ costCategoryId, laborCents }) => {
    const category = categoriesById.get(costCategoryId)
    const row: TableCell[] = [
      { text: category?.statementText ?? category?.label ?? costCategoryId },
      {
        text:
          category?.laborSharePercent != null
            ? formatPercent(category.laborSharePercent)
            : '',
        alignment: 'right',
        noWrap: true,
      },
      { text: formatEuroCents(laborCents), alignment: 'right', noWrap: true },
    ]
    return row
  })
  return [
    {
      text: 'Bescheinigung nach § 35a EStG',
      style: 'th',
      margin: [0, 8, 0, 4],
    },
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto'],
        body: [
          [
            { text: 'Kostenart', bold: true },
            { text: 'Lohnanteil', bold: true, alignment: 'right' },
            { text: 'Ihr Anteil', bold: true, alignment: 'right' },
          ],
          ...rows,
          [
            { text: 'Summe', bold: true, fillColor: LIGHT_FILL },
            { text: '', fillColor: LIGHT_FILL },
            {
              text: formatEuroCents(section.totalCents),
              bold: true,
              alignment: 'right',
              noWrap: true,
              fillColor: LIGHT_FILL,
            },
          ],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 4],
    },
    {
      text: SECTION_35A_NOTICE,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}
type PreviousPeriodComparison =
  | { readonly kind: 'no_period' }
  | { readonly kind: 'not_resident' }
  | { readonly kind: 'no_consumption' }
  | {
      readonly kind: 'available'
      readonly year: number
      readonly value: number
    }

/**
 * Vorjahresvergleich derselben Mietpartei (gleiches Objekt und gleiche
 * Wohnung). Unterscheidet fehlende Vorjahresabrechnung (z. B.
 * Eigentümerwechsel), fehlende Nutzung im Vorjahr und fehlende Verbrauchswerte.
 */
function previousPeriodComparison(
  context: TenantStatementContext,
): PreviousPeriodComparison {
  const { appData, billingPeriod, occupancyPeriod } = context
  const previousPeriod = appData.billingData.billingPeriods.find(
    (period) =>
      period.propertyId === billingPeriod.propertyId &&
      period.year === billingPeriod.year - 1,
  )
  if (!previousPeriod) return { kind: 'no_period' }
  const previous = appData.billingData.occupancyPeriods.filter(
    (occupancy) =>
      occupancy.billingPeriodId === previousPeriod.id &&
      occupancy.unitId === occupancyPeriod.unitId &&
      occupancy.tenancyId != null &&
      occupancy.tenancyId === occupancyPeriod.tenancyId,
  )
  if (previous.length === 0) return { kind: 'not_resident' }
  const withConsumption = previous.find(
    (occupancy) => occupancy.consumptionUnits != null,
  )
  return withConsumption?.consumptionUnits
    ? {
        kind: 'available',
        year: previousPeriod.year,
        value: withConsumption.consumptionUnits.value,
      }
    : { kind: 'no_consumption' }
}

const BAR_WIDTH = 200

/** Balkengrafik Vorjahr / Abrechnungsjahr (§ 6a Abs. 3 HeizKV). */
function previousPeriodChart(
  bars: readonly { readonly label: string; readonly value: number }[],
  unit: string,
): Content {
  const max = Math.max(...bars.map(({ value }) => value), 0)
  return {
    table: {
      widths: [150, BAR_WIDTH + 4, '*'],
      body: bars.map(({ label, value }): TableCell[] => [
        label,
        {
          canvas: [
            {
              type: 'rect',
              x: 0,
              y: 1,
              w: max > 0 ? Math.max(1, (value / max) * BAR_WIDTH) : 1,
              h: 8,
              color: MUTED,
            },
          ],
        },
        {
          text: `${formatNumber(value)} ${unit}`,
          alignment: 'right',
          noWrap: true,
        },
      ]),
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 2],
  }
}

function previousPeriodSection(
  context: TenantStatementContext,
  facts: TenantFacts,
  unit: string,
): Content[] {
  const comparison = previousPeriodComparison(context)
  const heading: Content = {
    text: PREVIOUS_PERIOD_COMPARISON_HEADING,
    bold: true,
    margin: [0, 4, 0, 2],
  }
  if (comparison.kind !== 'available') {
    const text =
      comparison.kind === 'no_period'
        ? NO_PREVIOUS_PERIOD_DATA
        : comparison.kind === 'not_resident'
          ? NOT_RESIDENT_IN_PREVIOUS_PERIOD
          : NO_PREVIOUS_PERIOD_CONSUMPTION
    return [heading, { text, margin: [0, 0, 0, 4] }]
  }
  return [
    heading,
    previousPeriodChart(
      [
        {
          label: `Ihr Verbrauch im Vorjahr (${comparison.year})`,
          value: comparison.value,
        },
        {
          label: `Ihr Verbrauch (${context.billingPeriod.year})`,
          value: facts.basis.consumption,
        },
      ],
      unit,
    ),
    {
      text: PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 4],
    },
  ]
}

/** Abrechnungs- und Verbrauchsinformationen nach § 6a HeizKV. */
function consumptionInformation(
  context: TenantStatementContext,
  facts: TenantFacts,
): Content[] {
  const circuit = circuitTraceFor(context)
  if (!circuit) return []
  const { split } = circuit
  const mode = captureModeFor(context.calculation, circuit.buildingId)
  const unit =
    facts.basis.consumptionUnit === 'kWh' ? 'kWh' : consumptionUnitLabel(mode)
  const ownArea =
    split.baseAreaBasis === 'usable_area'
      ? facts.basis.usableAreaSqm
      : facts.basis.heatedAreaSqm
  const rows: TableCell[][] = [
    [ENERGY_CARRIER_MIX_LABEL, energyCarrierMixLabel(context.appData, circuit)],
    [
      'Ihr Verbrauch im Nutzungszeitraum',
      `${formatNumber(facts.basis.consumption)} ${unit}${
        ownArea > 0
          ? ` (${formatNumber(facts.basis.consumption / ownArea)} ${unit} je m²)`
          : ''
      }`,
    ],
  ]
  const hasAverage =
    split.baseDenominator > 0 && split.consumptionDenominator > 0
  if (hasAverage) {
    const averagePerSqm = split.consumptionDenominator / split.baseDenominator
    rows.push([
      CIRCUIT_AVERAGE_LABEL,
      `${formatNumber(averagePerSqm * ownArea * (facts.days / facts.periodDays))} ${unit} (${formatNumber(averagePerSqm)} ${unit} je m²)`,
    ])
  }
  const fees = meteringFeeCents(
    context.appData,
    context.billingPeriod.id,
    circuit.buildingId,
  )
  rows.push([
    {
      text: meteringFeesText(fees === null ? null : formatEuroCents(fees)),
      colSpan: 2,
    },
    {},
  ])
  const averageText = hasAverage
    ? `${circuitAverageExplanation(
        `${formatNumber(split.consumptionDenominator)} ${unit}`,
        `${formatNumber(split.baseDenominator)} m² ${baseAreaLabel(split.baseAreaBasis)}`,
      )} `
    : ''
  return [
    {
      text: CONSUMPTION_INFORMATION_HEADING,
      style: 'th',
      margin: [0, 8, 0, 4],
    },
    {
      table: { widths: ['*', 'auto'], body: rows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 2],
    },
    ...previousPeriodSection(context, facts, unit),
    {
      text: `${averageText}${ENERGY_TAXES_NOTICE} ${ENERGY_ADVICE_NOTICE} ${DISPUTE_RESOLUTION_NOTICE}`,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}

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
