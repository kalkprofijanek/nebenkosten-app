import type { Content, TableCell } from 'pdfmake/interfaces'
import {
  compareTenantEnergyWithPreviousPeriod,
  compareTenantWithConsumptionBenchmark,
  previousPeriodConsumption,
  previousPeriodWeatherFactors,
  weatherAdjustPreviousPeriod,
  type TenantEnergyYear,
} from '@nebenkosten/core'
import type { TenantStatementContext } from './contracts'
import {
  captureModeFor,
  energyCarrierMixLabel,
  meteringFeeCents,
} from './heating-summary'
import {
  CIRCUIT_AVERAGE_LABEL,
  CONSUMPTION_BENCHMARK_CLASS_LABELS,
  CONSUMPTION_BENCHMARK_LABEL,
  CONSUMPTION_INFORMATION_HEADING,
  DISPUTE_RESOLUTION_NOTICE,
  ENERGY_ADVICE_NOTICE,
  ENERGY_CARRIER_MIX_LABEL,
  ENERGY_TAXES_NOTICE,
  NO_PREVIOUS_PERIOD_CONSUMPTION,
  NO_PREVIOUS_PERIOD_DATA,
  NOT_RESIDENT_IN_PREVIOUS_PERIOD,
  PREVIOUS_PERIOD_COMPARISON_HEADING,
  PREVIOUS_PERIOD_ENERGY_METHOD,
  PREVIOUS_PERIOD_ENERGY_NOT_WEATHER_ADJUSTED,
  PREVIOUS_PERIOD_HOT_WATER_NOT_ADJUSTED,
  PREVIOUS_PERIOD_NO_CENTRAL_HOT_WATER,
  PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED,
  baseAreaLabel,
  circuitAverageExplanation,
  consumptionBenchmarkFootnote,
  meteringFeesText,
  previousPeriodHotWaterMissingText,
  previousPeriodWeatherAdjustedText,
} from './legal-texts'
import { formatEuroCents, formatNumber } from './format'
import {
  circuitTraceFor,
  consumptionUnitFor,
  occupancyRange,
  type TenantFacts,
} from './tenant-statement-data'
import { MUTED } from './tenant-statement-tables'

/** Heller Balkenanteil (Warmwasser) neben `MUTED` (Heizwärme). */
const LIGHT = '#b8c4ce'
const BAR_WIDTH = 200

interface ChartBar {
  readonly label: string
  readonly segments: readonly {
    readonly value: number
    readonly color: string
  }[]
  readonly text: string
}

/** Balkengrafik Vorjahr / Abrechnungsjahr (§ 6a Abs. 3 HeizKV). */
function previousPeriodChart(bars: readonly ChartBar[]): Content {
  const max = Math.max(
    ...bars.flatMap(({ segments }) => [
      segments.reduce((sum, { value }) => sum + value, 0),
    ]),
    0,
  )
  const rectsOf = (segments: ChartBar['segments']) => {
    let x = 0
    const rects = segments
      .filter(({ value }) => value > 0 && max > 0)
      .map(({ value, color }) => {
        const rect = {
          type: 'rect' as const,
          x,
          y: 1,
          w: (value / max) * BAR_WIDTH,
          h: 8,
          color,
        }
        x += rect.w
        return rect
      })
    // Mindestens 1 pt, damit auch ein sehr kleiner Wert oder 0 sichtbar bleibt.
    if (x >= 1) return rects
    return [
      {
        type: 'rect' as const,
        x: 0,
        y: 1,
        w: 1,
        h: 8,
        color: segments[0]?.color ?? MUTED,
      },
    ]
  }
  return {
    table: {
      widths: [150, BAR_WIDTH + 4, '*'],
      body: bars.map(({ label, segments, text }): TableCell[] => [
        label,
        { canvas: rectsOf(segments) },
        { text, alignment: 'right', noWrap: true },
      ]),
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 2],
  }
}

const formatFactor = (value: number) => formatNumber(value, 2)

function changeText(changePercent: number | null): string {
  if (changePercent === null) return ''
  const sign = changePercent > 0 ? '+' : ''
  return ` Veränderung gegenüber dem Vorjahr: ${sign}${formatNumber(changePercent, 1)} %.`
}

function smallPrint(text: string): Content {
  return { text, fontSize: 8, color: MUTED, margin: [0, 0, 0, 4] }
}

function previousPeriodSection(
  context: TenantStatementContext,
  facts: TenantFacts,
  unit: string,
): Content[] {
  const { appData, billingPeriod, occupancyPeriod } = context
  const comparison = previousPeriodConsumption(
    appData,
    billingPeriod,
    occupancyPeriod,
  )
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
  const energy = compareTenantEnergyWithPreviousPeriod(
    appData,
    billingPeriod,
    occupancyPeriod,
    { currentOutput: context.calculation },
  )
  if (energy.status === 'energy') {
    const bar = (label: string, year: TenantEnergyYear): ChartBar => ({
      label: `${label} (${year.year})`,
      segments: [
        { value: year.heatingAdjustedKwh, color: MUTED },
        { value: year.hotWaterKwh, color: LIGHT },
      ],
      text: `${formatNumber(year.totalKwh, 0)} kWh`,
    })
    const detail = (year: TenantEnergyYear) =>
      `${year.year}: Heizwärme ${formatNumber(year.heatingKwh, 0)} kWh${
        energy.weatherAdjusted
          ? ` × Klimafaktor ${formatFactor(year.climateFactor ?? 1)} = ${formatNumber(year.heatingAdjustedKwh, 0)} kWh`
          : ''
      }${energy.centralHotWater ? `, Warmwasser ${formatNumber(year.hotWaterKwh, 0)} kWh` : ''}`
    const weather = energy.climate
      ? `${previousPeriodWeatherAdjustedText(
          energy.climate.postalCode,
          formatFactor(energy.climate.previous),
          formatFactor(energy.climate.current),
        )}${energy.centralHotWater ? ` ${PREVIOUS_PERIOD_HOT_WATER_NOT_ADJUSTED}` : ''}`
      : PREVIOUS_PERIOD_ENERGY_NOT_WEATHER_ADJUSTED
    return [
      heading,
      previousPeriodChart([
        bar('Ihr Energieverbrauch im Vorjahr', energy.previous),
        bar('Ihr Energieverbrauch', energy.current),
      ]),
      smallPrint(
        `${PREVIOUS_PERIOD_ENERGY_METHOD}${
          energy.centralHotWater
            ? ''
            : ` ${PREVIOUS_PERIOD_NO_CENTRAL_HOT_WATER}`
        } ${detail(energy.previous)}; ${detail(energy.current)}. ${weather}${changeText(energy.changePercent)}`,
      ),
    ]
  }
  const factors = previousPeriodWeatherFactors(
    appData,
    billingPeriod,
    occupancyPeriod,
  )
  const adjusted = factors
    ? weatherAdjustPreviousPeriod(
        { value: facts.basis.consumption, climateFactor: factors.current },
        { value: comparison.value, climateFactor: factors.previous },
      )
    : null
  const unitsBar = (label: string, value: number): ChartBar => ({
    label,
    segments: [{ value, color: MUTED }],
    text: `${formatNumber(value)} ${unit}`,
  })
  const weather =
    factors && adjusted
      ? `${previousPeriodWeatherAdjustedText(
          factors.postalCode,
          formatFactor(factors.previous),
          formatFactor(factors.current),
        )}${changeText(adjusted.changePercent)}`
      : PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED
  const hotWater =
    energy.status === 'units_only'
      ? ` ${previousPeriodHotWaterMissingText(energy.reason)}`
      : ''
  return [
    heading,
    previousPeriodChart([
      unitsBar(
        `Ihr Verbrauch im Vorjahr (${comparison.year})`,
        adjusted?.previous.adjusted ?? comparison.value,
      ),
      unitsBar(
        `Ihr Verbrauch (${billingPeriod.year})`,
        adjusted?.current.adjusted ?? facts.basis.consumption,
      ),
    ]),
    smallPrint(
      `${weather}${hotWater}${comparison.source ? ` Vorjahreswert: ${comparison.source}` : ''}`,
    ),
  ]
}

/**
 * Vergleich mit dem normierten Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4
 * HeizKV): Tabellenzeile und Fußnote; ohne Vergleich `null`.
 */
function consumptionBenchmark(
  context: TenantStatementContext,
  heatingCircuitId: string | null,
): { readonly row: TableCell[]; readonly footnote: string } | null {
  const circuit = context.appData.billingData.heatingCircuits.find(
    ({ id }) => id === heatingCircuitId,
  )
  const range = occupancyRange(context)
  const result = compareTenantWithConsumptionBenchmark(
    context.calculation,
    context.occupancyPeriod.id,
    circuit,
    {
      from: range.from,
      to: range.to,
      periodStart: context.billingPeriod.periodStart,
      periodEnd: context.billingPeriod.periodEnd,
    },
  )
  if (result.status !== 'compared') return null
  const kwh = (value: number) => `${formatNumber(value, 0)} kWh`
  const label = CONSUMPTION_BENCHMARK_CLASS_LABELS[result.benchmarkClass]
  const energy = result.benchmark.includesHotWater
    ? `Ihr Energieverbrauch: ${kwh(result.energyKwh)} (Heizwärme ${kwh(result.heatingKwh)}, Warmwasser ${kwh(result.hotWaterKwh)})`
    : `Ihr Energieverbrauch für Heizwärme: ${kwh(result.energyKwh)}`
  const { lowMax, mediumMax, elevatedMax } = result.rangeKwh
  return {
    row: [
      CONSUMPTION_BENCHMARK_LABEL,
      {
        stack: [
          `${formatNumber(result.kwhPerSqmYear, 1)} kWh je m² und Jahr – Einstufung „${label}“`,
          energy,
          `Klassengrenzen für Ihre Fläche und Nutzungszeit: niedrig bis ${kwh(lowMax)}, mittel bis ${kwh(mediumMax)}, erhöht bis ${kwh(elevatedMax)}, darüber zu hoch`,
        ],
      },
    ],
    footnote: consumptionBenchmarkFootnote(
      result.benchmark,
      result.annualization,
    ),
  }
}

/** Abrechnungs- und Verbrauchsinformationen nach § 6a HeizKV. */
export function consumptionInformation(
  context: TenantStatementContext,
  facts: TenantFacts,
): Content[] {
  const circuit = circuitTraceFor(context)
  if (!circuit) return []
  const { split } = circuit
  const mode = captureModeFor(context.calculation, circuit.buildingId)
  const unit = consumptionUnitFor(facts.basis, mode)
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
          ? facts.days < facts.periodDays && facts.days > 0
            ? ` (${formatNumber((facts.basis.consumption / ownArea) * (facts.periodDays / facts.days))} ${unit} je m², auf ein ganzes Jahr hochgerechnet)`
            : ` (${formatNumber(facts.basis.consumption / ownArea)} ${unit} je m²)`
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
  const benchmark = consumptionBenchmark(context, circuit.heatingCircuitId)
  if (benchmark) rows.push(benchmark.row)
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
      text: `${benchmark ? `${benchmark.footnote} ` : ''}${averageText}${ENERGY_TAXES_NOTICE} ${ENERGY_ADVICE_NOTICE} ${DISPUTE_RESOLUTION_NOTICE}`,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}
