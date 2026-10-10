import type { Content, TableCell } from 'pdfmake/interfaces'
import type {
  HeatingCircuitTrace,
  OperatingPositionTrace,
} from '@nebenkosten/core'
import { buildSenderBlock } from './address'
import type { TenantStatementContext } from './contracts'
import {
  addDaysIso,
  balanceLabel,
  formatAllocationKeyLabel,
  formatEuroCents,
  formatIban,
  formatIsoDate,
  formatNumber,
  formatUnitPrice,
} from './format'
import {
  amountCell,
  buildingName,
  captureModeFor,
  circuitTitle,
  propertyUnitLabel,
  scopeLabel,
} from './heating-summary'
import {
  BALANCED_TEXT,
  additionalPaymentText,
  baseAreaLabel,
  creditText,
} from './legal-texts'
import {
  circuitTraceFor,
  consumptionUnitFor,
  heatingTotalCents,
  resolvedBuildingId,
  tenantResult,
  type TenantFacts,
} from './tenant-statement-data'

const LIGHT_FILL = '#eef4fb'
export const MUTED = '#5a6a78'
const PAYMENT_TERM_DAYS = 30

export function summaryTable(context: TenantStatementContext): Content {
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

export function paymentContent(context: TenantStatementContext): Content[] {
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
export function operatingUnitLabel(context: TenantStatementContext): string {
  const { occupancyPeriod } = context
  if (occupancyPeriod.costScope?.kind === 'building')
    return `Gebäude ${buildingName(context.appData, occupancyPeriod.costScope.buildingId)}`
  return propertyUnitLabel(context.property)
}

export function basisTable(
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

export function costCategoryTable(
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

export function section12Applies(context: TenantStatementContext): boolean {
  const { occupancyPeriod } = context
  return Boolean(
    !circuitTraceFor(context)?.split.areaOnlySection9a &&
    occupancyPeriod.applySection12Reduction &&
    occupancyPeriod.consumptionUnitsEstimated &&
    captureModeFor(context.calculation, resolvedBuildingId(context)) !==
      'heat_meter',
  )
}

export function tenantHeatingTable(
  context: TenantStatementContext,
  circuit: HeatingCircuitTrace,
  facts: TenantFacts,
): Content {
  const tenant = tenantResult(context)
  const { costBreakdown } = tenant
  const { split } = circuit
  const mode = captureModeFor(context.calculation, circuit.buildingId)
  const unit = consumptionUnitFor(facts.basis, mode)
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
