import type { Content, TableCell } from 'pdfmake/interfaces'
import {
  compareTenantEnergyWithPreviousPeriod,
  compareTenantWithConsumptionBenchmark,
  consumptionEstimation,
  degreeDayPermille,
  degreeDayShareOfPeriod,
  previousPeriodComparisonBasis,
  previousPeriodConsumption,
  previousPeriodWeatherFactors,
  weatherAdjustPreviousPeriod,
  type ConsumptionEstimation,
  type PreviousPeriodComparisonBasis,
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
import { formatEuroCents, formatIsoDate, formatNumber } from './format'
import { hasReading } from './meter-readings'
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

const signed = (value: number) =>
  `${value > 0 ? '+' : ''}${formatNumber(value, 1)}`

function changeText(
  changePercent: number | null,
  weatherAdjusted = false,
): string {
  if (changePercent === null) return ''
  return ` Veränderung gegenüber dem Vorjahr${weatherAdjusted ? ' (witterungsbereinigt)' : ''}: ${signed(changePercent)} %.`
}

function smallPrint(text: string): Content {
  return { text, fontSize: 8, color: MUTED, margin: [0, 0, 0, 4] }
}

/** Kennzeichnung eines geschätzten Verbrauchs (§ 9a HeizKV). */
export const ESTIMATED_MARK = 'geschätzt (§ 9a HeizKV)'
/** Dieselbe Kennzeichnung innerhalb einer Klammer. */
const ESTIMATED_MARK_INLINE = 'geschätzt nach § 9a HeizKV'

/** Vorjahresvergleich: Klimafaktor (Jahreswert) bei Teilzeitraum nicht angewandt. */
export const CLIMATE_FACTOR_NOT_APPLIED_PARTIAL_PERIOD =
  'Keine Witterungsbereinigung mit Klimafaktoren: Die Klimafaktoren des Deutschen Wetterdienstes gelten jeweils für ein ganzes Jahr und lassen sich auf einen kürzeren Nutzungszeitraum nicht anwenden. Der jahreszeitliche Verlauf ist durch die Umrechnung nach Gradtagszahlen berücksichtigt.'

/** Vorjahresvergleich bei Schätzung aus dem Vorjahresverbrauch. */
export function circularEstimateText(year: number): string {
  return `Ihr Verbrauch ${year} ist auf Grundlage des Vorjahresverbrauchs geschätzt (§ 9a HeizKV). Ein Vergleich mit dem Vorjahr ist deshalb nicht aussagekräftig; eine Veränderung wird nicht ausgewiesen.`
}

/** Vorjahresvergleich bei sonstiger Schätzung. */
export function estimatedComparisonText(
  year: number,
  previousEstimated: boolean,
): string {
  return previousEstimated
    ? `Ihr Verbrauch ${year} und im Vorjahr ist geschätzt (§ 9a HeizKV); der Vergleich ist nur eingeschränkt aussagekräftig.`
    : `Ihr Verbrauch ${year} ist geschätzt (§ 9a HeizKV); der Vergleich ist nur eingeschränkt aussagekräftig.`
}

function estimationNotice(
  estimation: ConsumptionEstimation,
  year: number,
  previousEstimated: boolean,
): string {
  if (estimation === 'estimated_from_previous_period')
    return ` ${circularEstimateText(year)}`
  if (estimation === 'estimated' || previousEstimated)
    return ` ${estimation === 'estimated' ? estimatedComparisonText(year, previousEstimated) : 'Ihr Verbrauch im Vorjahr ist geschätzt (§ 9a HeizKV); der Vergleich ist nur eingeschränkt aussagekräftig.'}`
  return ''
}

const shortDate = (iso: string) => formatIsoDate(iso)

function inclusiveDays(from: string, to: string): number {
  return (
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000,
    ) + 1
  )
}

/**
 * Erläuterung der Umrechnung des Vorjahreswerts auf den Nutzungszeitraum
 * (Heizung nach Gradtagszahlen, Warmwasser nach Tagen).
 */
function proRataText(
  basis: PreviousPeriodComparisonBasis,
  previousYear: number,
  parts: {
    readonly heating: {
      readonly before: number
      readonly after: number
      readonly unit: string
    }
    readonly hotWater?: { readonly before: number; readonly after: number }
  },
): string {
  const proRata = basis.proRata
  if (!proRata) return ''
  const heating = `${formatNumber(parts.heating.before, parts.heating.unit === 'kWh' ? 0 : 2)} ${parts.heating.unit} × ${formatNumber(proRata.mappedPermille, 0)} ‰ ÷ ${formatNumber(proRata.previousPermille, 0)} ‰ = ${formatNumber(parts.heating.after, parts.heating.unit === 'kWh' ? 0 : 2)} ${parts.heating.unit}`
  const hotWater = parts.hotWater
    ? `; Warmwasser ${formatNumber(parts.hotWater.before, 0)} kWh × ${inclusiveDays(proRata.mapped.from, proRata.mapped.to)}/${inclusiveDays(basis.previous.from, basis.previous.to)} Tage = ${formatNumber(parts.hotWater.after, 0)} kWh`
    : ''
  return ` Ihre Nutzungszeiträume sind unterschiedlich lang (${previousYear}: ${shortDate(basis.previous.from)} – ${shortDate(basis.previous.to)}; Abrechnungsjahr: ${shortDate(basis.current.from)} – ${shortDate(basis.current.to)}). Der Vorjahreswert ist deshalb anteilig für den Zeitraum ${shortDate(proRata.mapped.from)} – ${shortDate(proRata.mapped.to)} nach Gradtagszahlen (VDI 2067) umgerechnet: ${parts.hotWater ? 'Heizwärme ' : ''}${heating}${hotWater}.`
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
  const estimation = consumptionEstimation(occupancyPeriod)
  const currentMark = estimation === 'none' ? '' : `, ${ESTIMATED_MARK_INLINE}`
  const previousMark = comparison.previousEstimated
    ? `, ${ESTIMATED_MARK_INLINE}`
    : ''
  const climateSource = billingPeriod.climateFactor?.source
  const energy = compareTenantEnergyWithPreviousPeriod(
    appData,
    billingPeriod,
    occupancyPeriod,
    { currentOutput: context.calculation },
  )
  if (energy.status === 'energy') {
    const { basis } = energy
    const kind = energy.weatherAdjusted
      ? 'witterungsbereinigt'
      : basis.proRata
        ? 'nicht witterungsbereinigt'
        : 'gemessen, nicht witterungsbereinigt'
    const bar = (
      label: string,
      year: TenantEnergyYear,
      mark: string,
    ): ChartBar => ({
      label: `${label} ${year.year} (${kind}${mark})`,
      segments: [
        { value: year.heatingAdjustedKwh, color: MUTED },
        { value: year.hotWaterKwh, color: LIGHT },
      ],
      text: `${formatNumber(year.totalKwh, 0)} kWh`,
    })
    const detail = (year: TenantEnergyYear, label: string) =>
      `${label}: Heizwärme ${energy.weatherAdjusted ? 'gemessen ' : ''}${formatNumber(year.heatingKwh, 0)} kWh${
        energy.weatherAdjusted
          ? ` × Klimafaktor ${formatFactor(year.climateFactor ?? 1)} = witterungsbereinigt ${formatNumber(year.heatingAdjustedKwh, 0)} kWh`
          : ''
      }${energy.centralHotWater ? `, Warmwasser ${formatNumber(year.hotWaterKwh, 0)} kWh` : ''} = ${formatNumber(year.totalKwh, 0)} kWh`
    const previousLabel = basis.proRata
      ? `Vorjahr ${energy.previous.year} anteilig ${shortDate(basis.proRata.mapped.from)} – ${shortDate(basis.proRata.mapped.to)}`
      : `Vorjahr ${energy.previous.year}`
    const currentLabel = `${energy.current.year} (${shortDate(basis.current.from)} – ${shortDate(basis.current.to)})`
    const weather = energy.climate
      ? `${previousPeriodWeatherAdjustedText(
          energy.climate.postalCode,
          formatFactor(energy.climate.previous),
          formatFactor(energy.climate.current),
        )}${climateSource ? ` Quelle: ${climateSource}.` : ''}${energy.centralHotWater ? ` ${PREVIOUS_PERIOD_HOT_WATER_NOT_ADJUSTED}` : ''}`
      : energy.climateNotAppliedPartialPeriod || basis.proRata
        ? CLIMATE_FACTOR_NOT_APPLIED_PARTIAL_PERIOD
        : PREVIOUS_PERIOD_ENERGY_NOT_WEATHER_ADJUSTED
    const measuredTotal = (year: TenantEnergyYear) =>
      year.heatingKwh + year.hotWaterKwh
    const measuredChange =
      energy.weatherAdjusted &&
      energy.changePercent !== null &&
      measuredTotal(energy.previous) > 0
        ? ` Ohne Witterungsbereinigung (gemessen): ${signed(
            Math.round(
              ((measuredTotal(energy.current) -
                measuredTotal(energy.previous)) /
                measuredTotal(energy.previous)) *
                1000,
            ) / 10,
          )} %.`
        : ''
    const before = energy.previousBeforeProRata
    const proRata = before
      ? proRataText(basis, energy.previous.year, {
          heating: {
            before: before.heatingKwh,
            after: energy.previous.heatingKwh,
            unit: 'kWh',
          },
          ...(energy.centralHotWater
            ? {
                hotWater: {
                  before: before.hotWaterKwh,
                  after: energy.previous.hotWaterKwh,
                },
              }
            : {}),
        })
      : ''
    return [
      heading,
      previousPeriodChart([
        bar('Ihr Energieverbrauch im Vorjahr', energy.previous, previousMark),
        bar('Ihr Energieverbrauch', energy.current, currentMark),
      ]),
      smallPrint(
        `${PREVIOUS_PERIOD_ENERGY_METHOD}${
          energy.centralHotWater
            ? ''
            : ` ${PREVIOUS_PERIOD_NO_CENTRAL_HOT_WATER}`
        }${proRata} ${detail(energy.previous, previousLabel)}; ${detail(energy.current, currentLabel)}. ${weather}${changeText(energy.changePercent, energy.weatherAdjusted)}${measuredChange}${estimationNotice(estimation, billingPeriod.year, energy.previousEstimated)}`,
      ),
    ]
  }
  const basis = previousPeriodComparisonBasis(
    appData,
    billingPeriod,
    occupancyPeriod,
    comparison,
  )
  const previousValue = basis.proRata
    ? comparison.value * basis.proRata.heatingFactor
    : comparison.value
  const factors = basis.fullYears
    ? previousPeriodWeatherFactors(appData, billingPeriod, occupancyPeriod)
    : null
  const adjusted = factors
    ? weatherAdjustPreviousPeriod(
        { value: facts.basis.consumption, climateFactor: factors.current },
        { value: previousValue, climateFactor: factors.previous },
      )
    : null
  const kind = adjusted ? 'witterungsbereinigt' : 'nicht witterungsbereinigt'
  const unitsBar = (label: string, value: number): ChartBar => ({
    label,
    segments: [{ value, color: MUTED }],
    text: `${formatNumber(value)} ${unit}`,
  })
  const unadjustedChange =
    previousValue > 0
      ? Math.round(
          ((facts.basis.consumption - previousValue) / previousValue) * 1000,
        ) / 10
      : null
  const change =
    estimation === 'estimated_from_previous_period'
      ? ''
      : changeText(
          adjusted ? adjusted.changePercent : unadjustedChange,
          adjusted !== null,
        )
  const weather =
    factors && adjusted
      ? `${previousPeriodWeatherAdjustedText(
          factors.postalCode,
          formatFactor(factors.previous),
          formatFactor(factors.current),
        )}${climateSource ? ` Quelle: ${climateSource}.` : ''}`
      : basis.proRata
        ? CLIMATE_FACTOR_NOT_APPLIED_PARTIAL_PERIOD
        : PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED
  const hotWater =
    energy.status === 'units_only'
      ? ` ${previousPeriodHotWaterMissingText(energy.reason)}`
      : ''
  const proRata = proRataText(basis, comparison.year, {
    heating: { before: comparison.value, after: previousValue, unit },
  })
  return [
    heading,
    previousPeriodChart([
      unitsBar(
        `Ihr Verbrauch im Vorjahr ${comparison.year}${
          basis.proRata
            ? ` anteilig ${shortDate(basis.proRata.mapped.from)} – ${shortDate(basis.proRata.mapped.to)}`
            : ''
        } (${kind}${previousMark})`,
        adjusted?.previous.adjusted ?? previousValue,
      ),
      unitsBar(
        `Ihr Verbrauch ${billingPeriod.year} (${kind}${currentMark})`,
        adjusted?.current.adjusted ?? facts.basis.consumption,
      ),
    ]),
    smallPrint(
      `${weather}${proRata}${change}${hotWater}${comparison.source ? ` Vorjahreswert: ${comparison.source}` : ''}${estimationNotice(estimation, billingPeriod.year, comparison.previousEstimated)}`,
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
  const estimated =
    consumptionEstimation(context.occupancyPeriod) === 'none'
      ? ''
      : `, ${ESTIMATED_MARK_INLINE}`
  const measured = `im Nutzungszeitraum (nicht witterungsbereinigt${estimated})`
  const energy = result.benchmark.includesHotWater
    ? `Ihr Energieverbrauch ${measured}: ${kwh(result.energyKwh)} (Heizwärme ${kwh(result.heatingKwh)}, Warmwasser ${kwh(result.hotWaterKwh)})`
    : `Ihr Energieverbrauch für Heizwärme ${measured}: ${kwh(result.energyKwh)}`
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
    footnote: `${consumptionBenchmarkFootnote(
      result.benchmark,
      result.annualization,
      circuitTraceFor(context)?.warmWater.allocation?.key ?? 'persons',
    )}${
      estimated
        ? ' Grundlage der Einstufung ist Ihr geschätzter Verbrauch (§ 9a HeizKV); sie ist daher nur eingeschränkt aussagekräftig.'
        : ''
    }`,
  }
}

/**
 * Anteil des Nutzungszeitraums am Abrechnungsjahr für die Umrechnung des
 * Heizverbrauchs: einheitlich nach Gradtagszahlen (VDI 2067) wie der
 * Vergleich mit dem Durchschnittsnutzer; ohne Gradtage (reiner Sommer)
 * nach Tagen.
 */
export function heatingPeriodShare(
  context: TenantStatementContext,
  facts: TenantFacts,
): {
  readonly share: number
  readonly method: 'none' | 'degree_days' | 'linear'
  readonly permille: number
} {
  if (!(facts.days > 0) || facts.days >= facts.periodDays)
    return { share: 1, method: 'none', permille: 1000 }
  const range = occupancyRange(context)
  const usage = {
    from: range.from,
    to: range.to,
    periodStart: context.billingPeriod.periodStart,
    periodEnd: context.billingPeriod.periodEnd,
  }
  const share = degreeDayShareOfPeriod(usage)
  return share > 0
    ? {
        share,
        method: 'degree_days',
        permille:
          (degreeDayPermille(range.from, range.to) * 1000) /
          degreeDayPermille(usage.periodStart, usage.periodEnd),
      }
    : {
        share: facts.days / facts.periodDays,
        method: 'linear',
        permille: (facts.days / facts.periodDays) * 1000,
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
  const periodShare = heatingPeriodShare(context, facts)
  const methodText =
    periodShare.method === 'degree_days'
      ? 'nach Gradtagszahlen (VDI 2067)'
      : 'nach Tagen'
  const estimation = consumptionEstimation(context.occupancyPeriod)
  const reason = context.occupancyPeriod.consumptionUnitsEstimateReason?.trim()
  const consumptionStack: Content[] = [
    `${formatNumber(facts.basis.consumption)} ${unit}${
      estimation === 'none' ? '' : ` – ${ESTIMATED_MARK}`
    }`,
  ]
  if (ownArea > 0)
    consumptionStack.push(
      periodShare.method === 'none'
        ? `${formatNumber(facts.basis.consumption / ownArea)} ${unit} je m²`
        : `${formatNumber(facts.basis.consumption / ownArea / periodShare.share)} ${unit} je m², ${methodText} auf ein ganzes Jahr hochgerechnet`,
    )
  // Die Begründung steht unter „Ihre Verbrauchserfassung“, wenn dort
  // geschätzt oder mit Zählerständen erfasst wird; sonst hier, damit z. B.
  // eine Aufteilung nach Gradtagszahlen ohne Zwischenablesung erkennbar ist.
  // Bei § 9b Abs. 3 HeizKV steht der Rechenweg samt Anmerkung unter „Ihre
  // Verbrauchserfassung“; hier nur der Verweis (keine Doppelnennung).
  const section9b = context.occupancyPeriod.section9bAllocation
  const reasonInCapture =
    estimation !== 'none' ||
    section9b != null ||
    hasReading(context.occupancyPeriod.heatMeterReading)
  if (reason || estimation !== 'none' || section9b != null)
    consumptionStack.push({
      text:
        estimation !== 'none'
          ? `Grundlage der Schätzung: siehe „Ihre Verbrauchserfassung“`
          : section9b != null
            ? `Ermittlung: Aufteilung ohne Zwischenablesung nach § 9b Abs. 3 HeizKV (${section9b === 'degree_days' ? 'nach Gradtagszahlen' : 'zeitanteilig'}), siehe „Ihre Verbrauchserfassung“`
            : `Ermittlung: ${reasonInCapture ? 'siehe „Ihre Verbrauchserfassung“' : reason}`,
      fontSize: 7.5,
      color: MUTED,
    })
  const rows: TableCell[][] = [
    [ENERGY_CARRIER_MIX_LABEL, energyCarrierMixLabel(context.appData, circuit)],
    ['Ihr Verbrauch im Nutzungszeitraum', { stack: consumptionStack }],
  ]
  const hasAverage =
    split.baseDenominator > 0 && split.consumptionDenominator > 0
  if (hasAverage) {
    const averagePerSqm = split.consumptionDenominator / split.baseDenominator
    rows.push([
      CIRCUIT_AVERAGE_LABEL,
      `${formatNumber(averagePerSqm * ownArea * periodShare.share)} ${unit} (${formatNumber(averagePerSqm)} ${unit} je m² und Jahr${
        periodShare.method === 'none'
          ? ''
          : `; Ihr Nutzungszeitraum entspricht ${methodText} ${formatNumber(periodShare.permille, 0)} ‰ des Jahres`
      })`,
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
