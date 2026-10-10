import type { Content, TableCell } from 'pdfmake/interfaces'
import {
  checkClimateFactor,
  compareTenantWithConsumptionBenchmark,
  previousPeriodClimateFactor,
  weatherAdjustPreviousPeriod,
} from '@nebenkosten/core'
import type { TenantStatementContext } from './contracts'
import {
  captureModeFor,
  energyCarrierMixLabel,
  meteringFeeCents,
} from './heating-summary'
import {
  CIRCUIT_AVERAGE_LABEL,
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
  PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED,
  baseAreaLabel,
  circuitAverageExplanation,
  meteringFeesText,
} from './legal-texts'
import { formatEuroCents, formatNumber } from './format'
import {
  circuitTraceFor,
  consumptionUnitFor,
  type TenantFacts,
} from './tenant-statement-data'
import { MUTED } from './tenant-statement-tables'

type PreviousPeriodComparison =
  | { readonly kind: 'no_period' }
  | { readonly kind: 'not_resident' }
  | { readonly kind: 'no_consumption' }
  | {
      readonly kind: 'available'
      readonly year: number
      readonly value: number
      readonly source?: string | null
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
  // Ohne Vorjahresabrechnung im System: Vorjahreswert der Nutzungsperiode
  // (z. B. aus der Abrechnung des Voreigentümers), sonst Einzug im Jahr.
  const stored = occupancyPeriod.previousConsumption
  if (
    stored &&
    stored.year === billingPeriod.year - 1 &&
    (!previousPeriod ||
      !appData.billingData.occupancyPeriods.some(
        (occupancy) => occupancy.billingPeriodId === previousPeriod.id,
      ))
  )
    return {
      kind: 'available',
      year: stored.year,
      value: stored.value,
      source: stored.source ?? null,
    }
  if (!previousPeriod)
    return occupancyPeriod.kind === 'tenant' &&
      occupancyPeriod.from != null &&
      occupancyPeriod.from > billingPeriod.periodStart
      ? { kind: 'not_resident' }
      : { kind: 'no_period' }
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

const benchmarkClassLabel = {
  low: 'niedrig',
  medium: 'mittel',
  elevated: 'erhöht',
  high: 'zu hoch',
} as const

function consumptionBenchmarkInformation(
  context: TenantStatementContext,
  circuit: NonNullable<ReturnType<typeof circuitTraceFor>>,
): { readonly row: TableCell[]; readonly note: string } | null {
  const heatingCircuit = context.appData.billingData.heatingCircuits.find(
    (item) =>
      item.billingPeriodId === context.billingPeriod.id &&
      item.buildingId === circuit.buildingId,
  )
  const comparison = compareTenantWithConsumptionBenchmark(
    context.calculation,
    context.occupancyPeriod.id,
    heatingCircuit,
  )
  if (comparison.status !== 'compared') return null

  const { benchmark, rangeKwh } = comparison
  const classLimits = [
    `niedrig bis ${formatNumber(benchmark.lowMaxKwhPerSqmYear)}`,
    `mittel bis ${formatNumber(benchmark.mediumMaxKwhPerSqmYear)}`,
    `erhöht bis ${formatNumber(benchmark.elevatedMaxKwhPerSqmYear)}`,
    'darüber zu hoch',
  ].join('; ')
  const ownPeriodLimits = [
    `niedrig bis ${formatNumber(rangeKwh.lowMax)} kWh`,
    `mittel bis ${formatNumber(rangeKwh.mediumMax)} kWh`,
    `erhöht bis ${formatNumber(rangeKwh.elevatedMax)} kWh`,
    'darüber zu hoch',
  ].join('; ')
  const hotWaterNote = benchmark.includesHotWater
    ? 'Die Vergleichswerte enthalten Warmwasser.'
    : 'Die Vergleichswerte enthalten kein Warmwasser.'
  const sourceReference = benchmark.sourceUrl
    ? `${benchmark.source} (${benchmark.sourceUrl})`
    : benchmark.source
  const annualization = comparison.annualized
    ? ' Ihr Wert wurde auf ein Jahr hochgerechnet.'
    : ''

  return {
    row: [
      CONSUMPTION_BENCHMARK_LABEL,
      `${formatNumber(comparison.kwhPerSqmYear)} kWh je m² und Jahr (${benchmarkClassLabel[comparison.benchmarkClass]})`,
    ],
    note: [
      `${sourceReference}; Kategorie: ${benchmark.category}; Bezugsjahr: ${benchmark.referenceYear}.`,
      `Klassengrenzen: ${classLimits} kWh je m² und Jahr. Für Ihre Fläche und Nutzungsdauer: ${ownPeriodLimits}.`,
      `Eingesetzte Energieträger: ${energyCarrierMixLabel(context.appData, circuit)}.`,
      hotWaterNote,
      'Heizwärme und gegebenenfalls Warmwasser wurden anteilig am Energieeinsatz des Heizkreises nach den jeweiligen Verteilungsschlüsseln ermittelt.',
      annualization.trim(),
    ]
      .filter(Boolean)
      .join(' '),
  }
}

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
  const currentClimateCheck = checkClimateFactor(
    context.billingPeriod,
    context.property,
  )
  const previousClimateFactor = previousPeriodClimateFactor(
    context.appData,
    context.billingPeriod,
    context.occupancyPeriod,
  )
  const previousBillingPeriod = context.appData.billingData.billingPeriods.find(
    (period) =>
      period.propertyId === context.billingPeriod.propertyId &&
      period.year === context.billingPeriod.year - 1,
  )
  const previousHasOccupancies =
    previousBillingPeriod !== undefined &&
    context.appData.billingData.occupancyPeriods.some(
      ({ billingPeriodId }) => billingPeriodId === previousBillingPeriod.id,
    )
  const previousClimateMatches =
    previousBillingPeriod === undefined ||
    !previousHasOccupancies ||
    checkClimateFactor(previousBillingPeriod, context.property).status ===
      'matching'
  const weatherAdjusted =
    comparison.year === context.billingPeriod.year - 1 &&
    currentClimateCheck.status === 'matching' &&
    previousClimateFactor !== null &&
    previousClimateMatches
      ? weatherAdjustPreviousPeriod(
          {
            value: facts.basis.consumption,
            climateFactor: currentClimateCheck.factor,
          },
          {
            value: comparison.value,
            climateFactor: previousClimateFactor,
          },
        )
      : null
  const previousValue = weatherAdjusted?.previous.adjusted ?? comparison.value
  const currentValue =
    weatherAdjusted?.current.adjusted ?? facts.basis.consumption
  const climatePostalCode =
    context.billingPeriod.climateFactor?.postalCode ??
    currentClimateCheck.expectedPostalCode
  const comparisonNote = weatherAdjusted
    ? `Witterungsbereinigt mit Klimafaktoren des DWD (Postleitzahl ${climatePostalCode ?? 'nicht angegeben'}, Faktor Vorjahr ${formatNumber(weatherAdjusted.previous.climateFactor)}, Abrechnungsjahr ${formatNumber(weatherAdjusted.current.climateFactor)}). Die verglichenen Heizverbrauchswerte enthalten kein Warmwasser.`
    : PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED
  return [
    heading,
    previousPeriodChart(
      [
        {
          label: `Ihr Verbrauch im Vorjahr (${comparison.year})`,
          value: previousValue,
        },
        {
          label: `Ihr Verbrauch (${context.billingPeriod.year})`,
          value: currentValue,
        },
      ],
      unit,
    ),
    {
      text: comparison.source
        ? `${comparisonNote} Vorjahreswert: ${comparison.source}`
        : comparisonNote,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 4],
    },
  ]
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
  const benchmarkInfo = consumptionBenchmarkInformation(context, circuit)
  if (benchmarkInfo) rows.push(benchmarkInfo.row)
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
    ...(benchmarkInfo
      ? [
          {
            text: benchmarkInfo.note,
            fontSize: 8,
            color: MUTED,
            margin: [0, 0, 0, 4],
          } satisfies Content,
        ]
      : []),
    ...previousPeriodSection(context, facts, unit),
    {
      text: `${averageText}${ENERGY_TAXES_NOTICE} ${ENERGY_ADVICE_NOTICE} ${DISPUTE_RESOLUTION_NOTICE}`,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}
