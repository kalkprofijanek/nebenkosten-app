import type { Content, TableCell } from 'pdfmake/interfaces'
import type { HeatingCircuitTrace } from '@nebenkosten/core'
import type { TenantStatementContext } from './contracts'
import {
  captureModeFor,
  circuitTitle,
  co2Table,
  fuelAccountTable,
  heatingCompilationTable,
  heatingOperatingCostLines,
  heatingSplitTotalsTable,
} from './heating-summary'
import {
  estimatedConsumptionNote,
  heatingSplitExplanation,
  SECTION_35A_NOTICE,
} from './legal-texts'
import {
  formatEuroCents,
  formatNumber,
  formatPercent,
  formatUnitPrice,
} from './format'
import {
  formatMeterValue,
  hasReading,
  readingCells,
  readingDifference,
} from './meter-readings'
import {
  circuitTraceFor,
  consumptionUnitFor,
  heatingTotalCents,
  resolvedBuildingId,
  tenantResult,
  type TenantFacts,
} from './tenant-statement-data'
import {
  MUTED,
  section12Applies,
  tenantHeatingTable,
} from './tenant-statement-tables'

const LIGHT_FILL = '#eef4fb'

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
  const unit = consumptionUnitFor(facts.basis, mode)
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
    // Erläuterung zur Herleitung (z. B. abgeleiteter Anfangsstand, Aufteilung
    // nach Gradtagszahlen bei Nutzerwechsel) auch bei gemessenem Verbrauch.
    const note = occupancyPeriod.consumptionUnitsEstimateReason?.trim()
    if (note) content.push({ text: note, fontSize: 8, margin: [0, 0, 0, 2] })
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
  if (split.areaOnlySection9a && !hasHotWater)
    lines.push(
      `Heizkosten gesamt = Heizkosten nach Fläche = ${formatEuroCents(heatingTotalCents(tenant))}`,
    )
  else
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
  // Überschrift, Erläuterung und Zählertabelle nicht über einen Seitenumbruch
  // trennen (sonst steht die Überschrift allein am Seitenende); die
  // Rechenzeilen dürfen umbrechen, damit der Block nie höher als eine Seite wird.
  const calculation = content.pop()!
  return [{ stack: content, unbreakable: true }, calculation]
}

export function heatingSection(
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

export function co2Section(context: TenantStatementContext): Content[] {
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
export function section35aContent(context: TenantStatementContext): Content[] {
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
