import type { Content, TableCell } from 'pdfmake/interfaces'
import {
  meterReadingConsumption,
  type EnergySourceCalculationTrace,
  type FuelLotCo2Trace,
  section9bShares,
  type HeatingCircuitTrace,
  type Section9bShare,
} from '@nebenkosten/core'
import type { TenantStatementContext } from './contracts'
import { energyCarrierDisplayName } from './energy-carrier-label'
import { section9bOwnNote } from './section9b-note'
import {
  amountCell,
  captureModeFor,
  circuitTitle,
  co2Table,
  hasNoBehgCo2Costs,
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
  formatIsoDate,
  formatNumber,
  formatPercent,
  formatQuantityUnit,
  formatUnitPrice,
} from './format'
import {
  formatMeterValue,
  hasReading,
  hasReplacement,
  readingDifference,
  readingRows,
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

/** Summe der Abschnitte bei Zählertausch, z. B. „120 + 35,5“. */
function replacementSum(
  reading: Parameters<typeof meterReadingConsumption>[0],
): string {
  const result = meterReadingConsumption(reading)
  return result.status === 'complete'
    ? result.segments
        .map(({ consumption }) => formatMeterValue(consumption))
        .join(' + ')
    : '–'
}

const flexible = (value: number) =>
  value.toLocaleString('de-DE', { maximumFractionDigits: 3 })

/** Anteil nach § 9b Abs. 3 HeizKV dieser Nutzung, falls festgelegt. */
function section9bShare(
  context: TenantStatementContext,
): Section9bShare | undefined {
  return section9bShares(
    context.appData.billingData.occupancyPeriods.filter(
      ({ billingPeriodId }) => billingPeriodId === context.billingPeriod.id,
    ),
    context.billingPeriod,
  ).get(context.occupancyPeriod.id)
}

/**
 * Faktor der Grundkosten im Rechenweg: „90/365 Tage“ bzw. nach § 9b Abs. 3
 * „450 ‰ ÷ 1.000 ‰“ (bei Teilabdeckung mit dem Zeitanteil der Gruppe).
 */
function baseFactorText(
  share: Section9bShare | undefined,
  timeText: string,
  periodDays: number,
): string {
  if (share?.allocation !== 'degree_days') return timeText
  const ratio = `${flexible(share.permille)} ‰ ÷ ${flexible(share.groupPermille)} ‰`
  const groupDays = Math.round(share.groupTimeFactor * periodDays)
  return groupDays === periodDays
    ? ratio
    : `${groupDays}/${periodDays} Tage × ${ratio}`
}

/**
 * Rechenweg der Aufteilung ohne Zwischenablesung (§ 9b Abs. 3 HeizKV):
 * Wechseltag, Maßstab, eigener Anteil und – bei HKV-Einheiten – die
 * Herleitung der eigenen Einheiten aus dem Gesamtverbrauch der Wohnung.
 */
function section9bCalculation(
  context: TenantStatementContext,
  share: Section9bShare,
  periodDays: number,
  unit: string,
  metered: boolean,
  hasHotWater: boolean,
): string {
  const dates = share.changeDates.map((date) => formatIsoDate(date))
  const own = `${formatIsoDate(share.from)} bis ${formatIsoDate(share.to)}`
  const groupDays = Math.round(share.groupTimeFactor * periodDays)
  const head = `Keine Zwischenablesung beim Nutzerwechsel${dates.length > 0 ? ` am ${dates.join(' und ')}` : ''}; Aufteilung nach § 9b Abs. 3 HeizKV`
  const occupancies = context.appData.billingData.occupancyPeriods.filter(
    (item) =>
      item.billingPeriodId === context.billingPeriod.id &&
      item.unitId === share.unitId &&
      item.section9bAllocation != null,
  )
  const total = occupancies.reduce(
    (sum, item) => sum + (item.consumptionUnits?.value ?? 0),
    0,
  )
  const ownUnits = context.occupancyPeriod.consumptionUnits?.value ?? 0
  if (share.allocation === 'degree_days') {
    const units = metered
      ? ''
      : `; Ihre ${unit} = Gesamt ${flexible(total)} ${unit} × ${flexible(share.permille)} ‰ ÷ ${flexible(share.groupPermille)} ‰ = ${flexible(ownUnits)} ${unit}`
    return `${head} nach Gradtagszahlen (VDI 2067) für die gesamten Heizkosten${hasHotWater ? ', Warmwasser zeitanteilig' : ''}: Ihr Zeitraum ${own} = ${flexible(share.permille)} ‰ von ${flexible(share.groupPermille)} ‰${units}.`
  }
  const units = metered
    ? ''
    : `; Ihre ${unit} = Gesamt ${flexible(total)} ${unit} × ${share.days} ÷ ${groupDays} Tage = ${flexible(ownUnits)} ${unit}`
  return `${head} zeitanteilig für die gesamten Heizkosten${hasHotWater ? ' und Warmwasser' : ''}: Ihr Zeitraum ${own} = ${share.days} von ${groupDays} Tagen${units}.`
}

interface Co2HeatingFactors {
  hotWaterPoolCents: number
  ownArea: number
  baseText: string
  baseTimeFactor: number
  consumption: number
  unit: string
  unitSingular: string
}

/**
 * CO2-Anteil Warmwasser des Mieters nach dem Warmwasserschlüssel
 * (§ 7 Abs. 1 CO2KostAufG i. V. m. § 8 HeizKV): Rechenweg und Betrag.
 */
function hotWaterCo2Part(
  context: TenantStatementContext,
  circuit: HeatingCircuitTrace,
  facts: TenantFacts,
  poolCents: number,
): { text: string; cents: number } {
  const tenant = tenantResult(context)
  const { warmWater } = circuit
  const allocation = warmWater.allocation
  const basis = tenant.hotWaterBasis
  const time = `${facts.days}/${facts.periodDays} Tage`
  const fraction = facts.days / facts.periodDays
  const pool = formatEuroCents(poolCents)
  if (!allocation || allocation.key === 'persons') {
    const denominator =
      allocation?.personTimeDenominator ?? warmWater.personTimeDenominator
    const persons =
      facts.basis.persons > 0 ? facts.basis.persons : tenant.isVacancy ? 0 : 1
    const own = basis?.personTime ?? persons * fraction
    const price = denominator > 0 ? poolCents / denominator : 0
    const cents = Math.round(price * own)
    return {
      text: `CO2 Warmwasser nach Personen und Nutzungszeit = ${pool} : ${formatNumber(denominator, 4)} Personenjahre = ${formatUnitPrice(price, 'Personenjahr')} × ${formatNumber(own, 4)} Personenjahre = ${formatEuroCents(cents)}`,
      cents,
    }
  }
  const ownArea =
    allocation.areaBasis === 'usable_area'
      ? facts.basis.usableAreaSqm
      : facts.basis.heatedAreaSqm
  const areaTime = basis?.areaTime ?? ownArea * fraction
  const areaDenominator = allocation.areaTimeDenominator ?? 0
  const consumptionFraction =
    allocation.key === 'consumption'
      ? allocation.consumptionSharePercent / 100
      : 0
  const areaPool = poolCents * (1 - consumptionFraction)
  const areaPrice = areaDenominator > 0 ? areaPool / areaDenominator : 0
  const areaCents = Math.round(areaPrice * areaTime)
  const areaText = `${formatUnitPrice(areaPrice, 'm²')} × ${formatNumber(areaTime, 4)} m² (${formatNumber(ownArea)} m² × ${time})`
  if (consumptionFraction === 0) {
    return {
      text: `CO2 Warmwasser nach Fläche = ${pool} : ${formatNumber(areaDenominator, 4)} m² = ${areaText} = ${formatEuroCents(areaCents)}`,
      cents: areaCents,
    }
  }
  const m3 = basis?.warmWaterM3 ?? context.occupancyPeriod.warmWater?.value ?? 0
  const m3Denominator = allocation.warmWaterM3Denominator ?? 0
  const m3Price =
    m3Denominator > 0 ? (poolCents * consumptionFraction) / m3Denominator : 0
  const m3Cents = Math.round(m3Price * m3)
  return {
    text: `CO2 Warmwasser = ${pool}: ${formatPercent(allocation.consumptionSharePercent)} nach Verbrauch ${formatUnitPrice(m3Price, 'm³')} × ${formatNumber(m3, 3)} m³ = ${formatEuroCents(m3Cents)}; ${formatPercent(100 - allocation.consumptionSharePercent)} nach Fläche ${areaText} = ${formatEuroCents(areaCents)}`,
    cents: m3Cents + areaCents,
  }
}

/**
 * CO2-Rechenweg im § 9-Verfahren: Der Mieteranteil des Heizkreises wird in
 * den Warmwasseranteil (Warmwasserschlüssel) und den Heizungsanteil
 * (Grund-/Verbrauchsanteil) getrennt; die Zeilen summieren sich auf den
 * verbindlichen CO2-Anteil, eine Rundungsdifferenz wird ausgewiesen.
 */
function co2LinesWithHotWater(
  context: TenantStatementContext,
  circuit: HeatingCircuitTrace,
  facts: TenantFacts,
  factors: Co2HeatingFactors,
): string[] {
  const { split, co2, warmWater } = circuit
  const { costBreakdown } = tenantResult(context)
  const heatingPool = co2.tenantCents - factors.hotWaterPoolCents
  const basePrice =
    split.baseDenominator > 0
      ? (heatingPool * (split.baseSharePercent / 100)) / split.baseDenominator
      : 0
  const consumptionPrice =
    split.consumptionDenominator > 0
      ? (heatingPool * (split.consumptionSharePercent / 100)) /
        split.consumptionDenominator
      : 0
  const hotWater = hotWaterCo2Part(
    context,
    circuit,
    facts,
    factors.hotWaterPoolCents,
  )
  const baseCents = Math.round(
    basePrice * factors.ownArea * factors.baseTimeFactor,
  )
  const consumptionCents = Math.round(consumptionPrice * factors.consumption)
  const rounding =
    costBreakdown.heatingCo2Cents -
    hotWater.cents -
    baseCents -
    consumptionCents
  const sharePercent = `${formatNumber(warmWater.sharePercent, 2)} %`
  return [
    `CO2-Kosten Mieteranteil des Heizkreises = ${formatEuroCents(co2.tenantCents)}, davon Warmwasser ${sharePercent} = ${formatEuroCents(factors.hotWaterPoolCents)} (nach dem Warmwasserschlüssel) und Heizung ${formatEuroCents(heatingPool)} (${formatPercent(split.baseSharePercent)} Grundanteil, ${formatPercent(split.consumptionSharePercent)} Verbrauchsanteil)`,
    hotWater.text,
    `CO2-Grundanteil Heizung = ${formatEuroCents(heatingPool)} × ${formatPercent(split.baseSharePercent)} : ${formatNumber(split.baseDenominator)} m² = ${formatUnitPrice(basePrice, 'm²')} × ${formatNumber(factors.ownArea)} m² × ${factors.baseText} = ${formatEuroCents(baseCents)}`,
    `CO2-Verbrauchsanteil Heizung = ${formatEuroCents(heatingPool)} × ${formatPercent(split.consumptionSharePercent)} : ${formatNumber(split.consumptionDenominator)} ${factors.unit} = ${formatUnitPrice(consumptionPrice, factors.unitSingular)} × ${formatNumber(factors.consumption)} ${factors.unit} = ${formatEuroCents(consumptionCents)}`,
    `Ihr CO2-Kostenanteil = ${[hotWater.cents, baseCents, consumptionCents]
      .map(formatEuroCents)
      .join(
        ' + ',
      )}${rounding !== 0 ? ` ${rounding > 0 ? '+' : '−'} Rundungsausgleich ${formatEuroCents(Math.abs(rounding))}` : ''} = ${formatEuroCents(costBreakdown.heatingCo2Cents)}`,
  ]
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
  const share9b = section9bShare(context)
  const baseText = baseFactorText(share9b, timeText, facts.periodDays)
  const baseTimeFactor =
    share9b?.baseTimeFactor ?? facts.days / facts.periodDays
  const reading = occupancyPeriod.heatMeterReading
  const estimated = Boolean(
    occupancyPeriod.consumptionUnitsEstimated && !isMeteredOccupancy(context),
  )
  const content: Content[] = [
    { text: 'Ihre Verbrauchserfassung', style: 'th', margin: [0, 6, 0, 2] },
  ]
  const lines: string[] = []
  if (share9b)
    content.push({
      text: section9bCalculation(
        context,
        share9b,
        facts.periodDays,
        unit,
        isMeteredOccupancy(context),
        circuit.warmWater.method !== 'none',
      ),
      fontSize: 8,
      margin: [0, 0, 0, 2],
    })
  // Bei § 9b Abs. 3 steht der Rechenweg bereits oben; vom gespeicherten
  // Text bleibt nur eine darüber hinausgehende Anmerkung.
  const section9bNote = share9b
    ? section9bOwnNote(occupancyPeriod.consumptionUnitsEstimateReason)
    : null
  const ownNote = share9b
    ? section9bNote && `Anmerkung: ${section9bNote}`
    : occupancyPeriod.consumptionUnitsEstimateReason?.trim()
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
    if (ownNote)
      content.push({ text: ownNote, fontSize: 8, margin: [0, 0, 0, 2] })
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
          ...readingRows(reading, unit),
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
        hasReplacement(reading)
          ? `Verbrauch gesamt (Zählertausch) = ${replacementSum(reading)} = ${formatMeterValue(difference)} ${unit}`
          : `Verbrauch = Stand neu − Stand alt = ${formatMeterValue(reading.endValue!)} − ${formatMeterValue(reading.startValue!)} = ${formatMeterValue(difference)} ${unit}`,
      )
      if (Math.abs(difference - consumption) > 0.5)
        lines.push(
          `Abgerechnet werden ${formatNumber(consumption)} ${unit} laut Verbrauchserfassung.`,
        )
    }
  } else {
    // Erläuterung (z. B. Grund und Rechenweg der Aufteilung) immer ausgeben.
    if (ownNote)
      content.push({ text: ownNote, fontSize: 8, margin: [0, 0, 0, 2] })
    lines.push(
      `Verbrauch laut Erfassung = ${formatNumber(consumption)} ${unit}`,
    )
  }
  lines.push(
    split.areaOnlySection9a
      ? 'Verbrauchskosten entfallen (§ 9a Abs. 2 HeizKV): Verteilung ausschließlich nach Fläche'
      : `Verbrauchskosten = ${formatUnitPrice(consumptionPrice, unitSingular)} × ${formatNumber(consumption)} ${unit}${reduction} = ${formatEuroCents(costBreakdown.heatingConsumptionCents)}`,
    `${split.areaOnlySection9a ? 'Heizkosten nach Fläche' : 'Grundkosten'} = ${formatUnitPrice(basePrice, 'm²')} × ${formatNumber(ownArea)} m² × ${baseText}${reduction} = ${formatEuroCents(costBreakdown.heatingBaseCents)}`,
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
  const hotWaterCo2Pool = circuit.warmWater.costSplit?.co2TenantCents
  if (
    costBreakdown.heatingCo2Cents !== 0 &&
    co2.tenantCents !== 0 &&
    costBreakdown.hotWaterCo2Cents !== undefined &&
    hotWaterCo2Pool !== undefined
  ) {
    lines.push(
      ...co2LinesWithHotWater(context, circuit, facts, {
        hotWaterPoolCents: hotWaterCo2Pool,
        ownArea,
        baseText,
        baseTimeFactor,
        consumption,
        unit,
        unitSingular,
      }),
    )
  } else if (costBreakdown.heatingCo2Cents !== 0 && co2.tenantCents !== 0) {
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
    const co2BaseCents = Math.round(co2BasePrice * ownArea * baseTimeFactor)
    const co2ConsumptionCents = costBreakdown.heatingCo2Cents - co2BaseCents
    lines.push(
      `CO2-Kosten Mieteranteil des Heizkreises = ${formatEuroCents(co2.tenantCents)} (${formatPercent(split.baseSharePercent)} Grundanteil, ${formatPercent(split.consumptionSharePercent)} Verbrauchsanteil)`,
      `CO2-Grundanteil = ${formatUnitPrice(co2BasePrice, 'm²')} × ${formatNumber(ownArea)} m² × ${baseText} = ${formatEuroCents(co2BaseCents)}`,
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

function co2SourceName(
  context: TenantStatementContext,
  trace: EnergySourceCalculationTrace,
): string {
  const source = context.appData.billingData.energySources.find(
    ({ id }) => id === trace.energySourceId,
  )
  return energyCarrierDisplayName(
    source?.sourceType ?? source?.name ?? source?.key ?? 'Energiequelle',
  )
}

function co2LotLabel(
  context: TenantStatementContext,
  lot: FuelLotCo2Trace,
): string {
  if (lot.kind === 'opening_stock') return 'Anfangsbestand (Vorjahr)'
  const delivery = context.appData.billingData.fuelDeliveries.find(
    ({ id }) => id === lot.sourceId,
  )
  return `Lieferung ${formatIsoDate(delivery?.date)}`
}

function rightCell(text: string, bold?: boolean): TableCell {
  return { text, alignment: 'right', noWrap: true, bold }
}

/** Tonnen CO2 mit drei Nachkommastellen (kg-genau). */
function formatTons(kg: number): string {
  return `${formatNumber(kg / 1_000, 3)} t`
}

/**
 * Berechnungsgrundlagen nach § 7 Abs. 3 CO2KostAufG je Energiequelle:
 * Energiegehalt der verbrauchten Brennstoffmenge, Emissionsfaktor und
 * Brennstoffemissionen; bei Preisen je FIFO-Los (ADR-0010, A12) zusätzlich
 * die Aufschlüsselung je Los.
 */
function co2CalculationBasis(
  context: TenantStatementContext,
  circuit: HeatingCircuitTrace,
): Content[] {
  if (hasNoBehgCo2Costs(circuit)) return []
  const sources = circuit.energySources.filter(
    ({ energyKwh, co2Kg }) => energyKwh > 0 || co2Kg > 0,
  )
  if (sources.length === 0) return []
  const named = sources.length > 1
  const rows: TableCell[][] = sources.flatMap((trace) => {
    const prefix = named ? `${co2SourceName(context, trace)}: ` : ''
    const unit = formatQuantityUnit(trace.quantityUnit)
    return [
      [
        `${prefix}Energiegehalt der verbrauchten Brennstoffmenge`,
        rightCell(
          trace.calorificValueKwhPerUnit > 0 && unit
            ? `${formatNumber(trace.consumedQuantity, 3)} ${unit} × ${formatNumber(trace.calorificValueKwhPerUnit, 3)} kWh/${unit} = ${formatNumber(trace.energyKwh, 0)} kWh`
            : `${formatNumber(trace.energyKwh, 0)} kWh`,
        ),
      ],
      [
        `${prefix}Emissionsfaktor`,
        rightCell(`${formatNumber(trace.co2FactorKgPerKwh, 4)} kg CO2/kWh`),
      ],
      [`${prefix}Brennstoffemissionen`, rightCell(formatTons(trace.co2Kg))],
    ]
  })
  const content: Content[] = [
    {
      text: 'Berechnungsgrundlagen der CO2-Kosten (§ 7 Abs. 3 CO2KostAufG)',
      style: 'th',
      margin: [0, 4, 0, 4],
    },
    {
      table: { widths: ['*', 'auto'], body: rows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 4],
    },
  ]
  const lotSources = sources.filter(({ co2Lots }) => co2Lots?.length)
  if (lotSources.length === 0) return content
  const header = [
    'Brennstoff-Los',
    'Menge',
    'kWh',
    't CO2',
    'CO2-Preis je t',
    'CO2-Kosten',
  ].map((text, index) => ({
    text,
    bold: true,
    alignment: index === 0 ? 'left' : 'right',
  })) as TableCell[]
  const lotRows: TableCell[][] = lotSources.flatMap((trace) => {
    const unit = formatQuantityUnit(trace.quantityUnit)
    const prefix = named ? `${co2SourceName(context, trace)}: ` : ''
    return [
      ...(trace.co2Lots ?? []).map((lot): TableCell[] => [
        `${prefix}${co2LotLabel(context, lot)}`,
        rightCell(`${formatNumber(lot.consumedQuantity, 3)} ${unit}`.trim()),
        rightCell(formatNumber(lot.energyKwh, 0)),
        rightCell(formatNumber(lot.co2Kg / 1_000, 3)),
        rightCell(formatEuroCents(lot.pricePerTonCents)),
        amountCell(lot.costCents),
      ]),
      [
        { text: `${prefix}Summe CO2-Kosten`, bold: true, colSpan: 5 },
        {},
        {},
        {},
        {},
        amountCell(trace.co2CostCents ?? 0, { bold: true }),
      ],
    ]
  })
  content.push(
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: [header, ...lotRows],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 2],
    },
    {
      text: 'Der Anfangsbestand wurde vor dem Abrechnungszeitraum geliefert und ist mit dem CO2-Preis seines Lieferjahres bewertet; Lieferungen im Abrechnungszeitraum mit dem CO2-Preis des Abrechnungsjahres. Verbrauch nach dem FIFO-Verfahren.',
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  )
  return content
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
  return [
    ...co2Table(context.appData, circuit, tenant.costBreakdown.heatingCo2Cents),
    ...co2CalculationBasis(context, circuit),
  ]
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
