import type { Content, TableCell } from 'pdfmake/interfaces'
import type {
  CalculationOutput,
  EnergySourceCalculationTrace,
  HeatingCircuitTrace,
} from '@nebenkosten/core'
import type { AllocationScope, AppDataFile } from '@nebenkosten/schema'
import {
  formatEuroCents,
  formatIsoDate,
  formatNumber,
  formatPercent,
  formatQuantityUnit,
  formatUnitPrice,
} from './format'
import {
  CO2_COST_ALLOCATION_HEADING,
  NO_BEHG_CO2_COSTS,
  NO_CENTRAL_HOT_WATER,
  baseAreaLabel,
  co2DistributionSentence,
  co2LandlordDeductedSentence,
  type ConsumptionCaptureMode,
} from './legal-texts'

const MUTED = '#5a6a78'

/** Rechtsbündige Betragszelle ohne Zeilenumbruch. */
export function amountCell(
  cents: number,
  options: { readonly bold?: boolean; readonly prefix?: string } = {},
): TableCell {
  return {
    text: `${options.prefix ?? ''}${formatEuroCents(cents)}`,
    alignment: 'right',
    noWrap: true,
    bold: options.bold,
  }
}

export function buildingName(
  appData: AppDataFile,
  buildingId: string | null | undefined,
): string {
  if (!buildingId) return 'ohne Gebäudezuordnung'
  const building = appData.masterData.buildings.find(
    ({ id }) => id === buildingId,
  )
  return building?.name ?? buildingId
}

/** Abrechnungseinheit einer Kostenart (Wohnanlage gesamt, Gebäude, Haus). */
export function scopeLabel(
  appData: AppDataFile,
  scope: AllocationScope | null | undefined,
): string {
  if (!scope || scope.kind === 'property') return 'Wohnanlage gesamt'
  if (scope.kind === 'building')
    return `Gebäude ${buildingName(appData, scope.buildingId)}`
  return `Haus ${scope.houseKey}`
}

export function circuitTitle(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
): string {
  return `Heizkreis ${buildingName(appData, circuit.buildingId)}`
}

function sourceLabel(
  appData: AppDataFile,
  trace: EnergySourceCalculationTrace,
): string {
  const source = appData.billingData.energySources.find(
    ({ id }) => id === trace.energySourceId,
  )
  return source?.name ?? source?.sourceType ?? source?.key ?? 'Energiequelle'
}

/** Energieträger eines Heizkreises (Namen bzw. Art der Energiequellen). */
export function energyCarrierLabel(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
): string {
  const labels = [
    ...new Set(
      circuit.energySources.map((trace) => {
        const source = appData.billingData.energySources.find(
          ({ id }) => id === trace.energySourceId,
        )
        return source?.sourceType ?? source?.name ?? source?.key ?? null
      }),
    ),
  ].filter((label): label is string => Boolean(label))
  return labels.length > 0 ? labels.join(', ') : 'nicht angegeben'
}

/** Messart des Heizkreises: Wärmemengenzähler (kWh) oder Ablesung. */
export function captureModeFor(
  calculation: CalculationOutput,
  buildingId: string | null | undefined,
): ConsumptionCaptureMode {
  return calculation.meteringTrace?.circuits.some(
    (circuit) => circuit.buildingId === buildingId,
  )
    ? 'heat_meter'
    : 'manual_reading'
}

export function consumptionUnitLabel(mode: ConsumptionCaptureMode): string {
  return mode === 'heat_meter' ? 'kWh' : 'Einheiten'
}

function quantity(value: number, unit: string | null): string {
  const label = formatQuantityUnit(unit)
  return `${formatNumber(value, 2)}${label ? ` ${label}` : ''}`
}

/** Brennstoffkonto je Energiequelle: Anfang + Lieferungen − Ende = Verbrauch. */
function fuelAccountRows(
  appData: AppDataFile,
  trace: EnergySourceCalculationTrace,
): TableCell[][] {
  const title: TableCell[] = [
    { text: sourceLabel(appData, trace), bold: true, colSpan: 3 },
    {},
    {},
  ]
  if (trace.method === 'direct_cost_without_quantity') {
    return [
      title,
      [
        'Energiekosten laut Rechnungen (ohne Mengenangabe)',
        { text: '–', alignment: 'right' },
        amountCell(trace.fifoConsumptionCostCents),
      ],
    ]
  }
  const unit = trace.quantityUnit
  const lots = trace.lots.map((lot): TableCell[] => [
    lot.kind === 'opening_stock'
      ? 'Anfangsbestand'
      : `+ Lieferung ${formatIsoDate(lot.date)}`,
    { text: quantity(lot.quantity, unit), alignment: 'right', noWrap: true },
    amountCell(lot.valueCents),
  ])
  return [
    title,
    ...(trace.lots.some(({ kind }) => kind === 'opening_stock')
      ? []
      : [
          [
            'Anfangsbestand',
            { text: quantity(0, unit), alignment: 'right', noWrap: true },
            amountCell(0),
          ] as TableCell[],
        ]),
    ...lots,
    [
      '− Endbestand',
      {
        text: quantity(trace.valuedRemainingQuantity, unit),
        alignment: 'right',
        noWrap: true,
      },
      amountCell(trace.remainingValueCents),
    ],
    [
      { text: '= Verbrauch (FIFO-Bewertung)', bold: true },
      {
        text: quantity(trace.consumedQuantity, unit),
        alignment: 'right',
        noWrap: true,
        bold: true,
      },
      amountCell(trace.fifoConsumptionCostCents, { bold: true }),
    ],
  ]
}

export function fuelAccountTable(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
): Content {
  if (circuit.energySources.length === 0) {
    return {
      text: 'Für diesen Heizkreis sind keine Energiequellen erfasst.',
      margin: [0, 2, 0, 4],
    }
  }
  return {
    table: {
      headerRows: 1,
      widths: ['*', 90, 80],
      body: [
        [
          { text: 'Brennstoffkonto', style: 'th' },
          { text: 'Menge', style: 'th', alignment: 'right' },
          { text: 'Betrag', style: 'th', alignment: 'right' },
        ],
        ...circuit.energySources.flatMap((trace) =>
          fuelAccountRows(appData, trace),
        ),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, 4],
  }
}

/** Zusammenstellung der Heizkosten des Heizkreises (§ 7 Abs. 2 HeizKV). */
export function heatingCompilationTable(circuit: HeatingCircuitTrace): Content {
  const { reconciliation } = circuit
  const rows: TableCell[][] = [
    [
      'Brennstoff-/Energiekosten (Verbrauch)',
      amountCell(reconciliation.fifoConsumptionCostCents),
    ],
    [
      '− darin enthaltene CO2-Kosten (gesondert verteilt)',
      amountCell(reconciliation.minusCo2Cents),
    ],
  ]
  if (circuit.warmWater.method !== 'none') {
    rows.push([
      `− Kosten der Warmwasserbereitung (${formatPercent(circuit.warmWater.sharePercent)})`,
      amountCell(reconciliation.minusHotWaterCents),
    ])
  }
  rows.push(
    [
      '+ Betriebsstrom der Heizungsanlage',
      amountCell(reconciliation.plusOperatingElectricityCents),
    ],
    [
      '+ Betriebskosten der Heizungsanlage (Wartung, Messdienst u. a.)',
      amountCell(reconciliation.plusHeatingOperatingCostsCents),
    ],
  )
  if (reconciliation.roundingDifferenceCents !== 0) {
    rows.push([
      '± Rundungsdifferenz',
      amountCell(reconciliation.roundingDifferenceCents),
    ])
  }
  rows.push([
    { text: '= Heizkosten des Heizkreises', bold: true },
    amountCell(reconciliation.heatingPoolCents, { bold: true }),
  ])
  return {
    table: { widths: ['*', 80], body: rows },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, 4],
  }
}

/** Gesamt-Aufteilung in Grund- und Verbrauchskosten mit Nennern. */
export function heatingSplitTotalsTable(
  circuit: HeatingCircuitTrace,
  mode: ConsumptionCaptureMode,
): Content {
  const { split } = circuit
  const unit = consumptionUnitLabel(mode)
  const basePrice =
    split.baseDenominator > 0 ? split.baseCents / split.baseDenominator : 0
  const consumptionPrice =
    split.consumptionDenominator > 0
      ? split.consumptionCents / split.consumptionDenominator
      : 0
  return {
    table: {
      widths: ['*', 80],
      body: [
        [
          `Grundkosten ${formatPercent(split.baseSharePercent)}: ${formatEuroCents(split.baseCents)} : ${formatNumber(split.baseDenominator)} m² ${baseAreaLabel(split.baseAreaBasis)} = ${formatUnitPrice(basePrice, 'm²')}`,
          amountCell(split.baseCents),
        ],
        [
          `Verbrauchskosten ${formatPercent(split.consumptionSharePercent)}: ${formatEuroCents(split.consumptionCents)} : ${formatNumber(split.consumptionDenominator)} ${unit} = ${formatUnitPrice(consumptionPrice, unit === 'kWh' ? 'kWh' : 'Einheit')}`,
          amountCell(split.consumptionCents),
        ],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, 4],
  }
}

export function hotWaterNotice(circuit: HeatingCircuitTrace): Content[] {
  return circuit.warmWater.method === 'none'
    ? [{ text: NO_CENTRAL_HOT_WATER, fontSize: 8, margin: [0, 0, 0, 4] }]
    : []
}

function co2EmissionsKg(circuit: HeatingCircuitTrace): number {
  return circuit.energySources.reduce((sum, source) => sum + source.co2Kg, 0)
}

/** Keine CO2-Kosten nach BEHG (z. B. Wärmepumpe, Biomasse). */
export function hasNoBehgCo2Costs(circuit: HeatingCircuitTrace): boolean {
  return circuit.co2.totalCents === 0 && co2EmissionsKg(circuit) === 0
}

/**
 * Vollständige CO2-Tabelle nach § 7 Abs. 3 CO2KostAufG. Mit `tenantCents`
 * wird zusätzlich der Anteil des Mieters ausgewiesen.
 */
export function co2Table(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
  tenantCents?: number,
): Content[] {
  const heading: Content = {
    text: `${CO2_COST_ALLOCATION_HEADING} – ${circuitTitle(appData, circuit)}`,
    style: 'th',
    margin: [0, 8, 0, 4],
  }
  if (hasNoBehgCo2Costs(circuit)) {
    return [
      heading,
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            ['Energieträger', energyCarrierLabel(appData, circuit)],
            [{ text: NO_BEHG_CO2_COSTS, colSpan: 2 }, {}],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },
    ]
  }
  const { co2, split } = circuit
  const value = (text: string): TableCell => ({
    text,
    alignment: 'right',
    noWrap: true,
  })
  const rows: TableCell[][] = [
    ['Energieträger', value(energyCarrierLabel(appData, circuit))],
    [
      'CO2-Emissionen im Abrechnungszeitraum',
      value(`${formatNumber(co2EmissionsKg(circuit), 1)} kg`),
    ],
    [
      'CO2-Preis',
      value(
        co2.pricePerTonCents == null
          ? 'manuell festgelegt'
          : `${formatEuroCents(co2.pricePerTonCents)} je t`,
      ),
    ],
    ['CO2-Kosten gesamt', amountCell(co2.totalCents)],
    [
      'Beheizte Wohnfläche des Gebäudes',
      value(`${formatNumber(co2.heatedAreaSqm)} m²`),
    ],
    [
      'Kohlendioxidausstoß je m² Wohnfläche und Jahr',
      value(`${formatNumber(co2.intensityKgPerSqmYear, 1)} kg CO2/m²·a`),
    ],
    [
      'Einstufung (Stufenmodell § 5 CO2KostAufG)',
      value(co2.tier === 'manual' ? 'manuell' : `Stufe ${co2.tier}`),
    ],
    [
      'Anteil Mieter / Vermieter',
      value(
        `${formatPercent(co2.tenantPercent)} / ${formatPercent(co2.landlordPercent)}`,
      ),
    ],
    ['Mieteranteil (auf Nutzer verteilt)', amountCell(co2.tenantCents)],
    ['Vermieteranteil (nicht umgelegt)', amountCell(co2.landlordCents)],
  ]
  if (tenantCents !== undefined) {
    rows.push([
      { text: 'Ihr Anteil an den CO2-Kosten', bold: true },
      amountCell(tenantCents, { bold: true }),
    ])
  }
  return [
    heading,
    {
      table: { widths: ['*', 'auto'], body: rows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 2],
    },
    {
      text: `${co2LandlordDeductedSentence(formatEuroCents(co2.landlordCents))} ${co2DistributionSentence(split.baseSharePercent, split.consumptionSharePercent, split.baseAreaBasis)}`,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}
