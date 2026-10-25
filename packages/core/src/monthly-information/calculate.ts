/**
 * Monatliche Verbrauchsinformation nach § 6a Abs. 2 HeizKV (ADR-0014,
 * Schritt 2). Reine Funktion ohne I/O.
 *
 * - Monatsverbrauch je Einheit = Monatsendstand(M) − Monatsendstand(M−1)
 *   der zugeordneten Wohnungszähler (Heizung `unit_heat` in kWh,
 *   Warmwasser `unit_hot_water` in m³). Fehlende oder widersprüchliche
 *   Stände und negativer Verbrauch ergeben keinen Wert (kein Glattrechnen).
 * - Zuordnungen (Heizkreise) stammen aus dem Abrechnungszeitraum des
 *   betrachteten Monats; Zählerstände sind zeitraumunabhängig (`meterId`).
 * - Ausgabe je Mieter-Nutzungszeitraum; Leerstand wird nicht ausgegeben.
 *   Mehrere Nutzungen im Monat: Heizung nach Gradtagszahlen (VDI 2067,
 *   ADR-0007), Warmwasser nach Kalendertagen. Der Anteil bezieht sich auf
 *   den ganzen Monat, sodass Lücken (nicht erfasste Nutzung) keinem Mieter
 *   zugerechnet werden.
 * - Vergleiche: Vormonat und Vorjahresmonat derselben Nutzung (gleiches
 *   Mietverhältnis), „nicht erhoben“, soweit nicht ermittelbar.
 * - Durchschnittsnutzer: Mitte der Heizspiegel-Klasse „mittel“ ×
 *   Fläche × Gradtagsanteil (E-46-3, entschieden 21.10.2026).
 */
import type {
  AppDataFile,
  BillingPeriod,
  HeatingCircuit,
  Meter,
  MeterReading,
  OccupancyPeriod,
  Unit,
} from '@nebenkosten/schema'
import { degreeDayPermille } from '../heating/degree-days'
import {
  type CalendarMonth,
  type DateInterval,
  inclusiveDays,
  intersect,
  parseMonth,
  shiftMonth,
} from './dates'
import { selectMonthEndReading } from './readings'
import type {
  MonthlyAverageUserComparison,
  MonthlyConsumptionInformation,
  MonthlyConsumptionInformationInput,
  MonthlyHotWaterInformation,
  MonthlyHotWaterValue,
  MonthlyInformationIssue,
  MonthlyMeterTrace,
  MonthlyReadingRef,
  MonthlyValue,
  MonthlyValueUnavailableReason,
} from './types'

/**
 * Mittlere Warmwassertemperatur tw in °C, wenn der Heizkreis keine nach
 * § 9 Abs. 2 HeizKV gemessene oder geschätzte Temperatur angibt (offene
 * Annahme, im Ergebnis gekennzeichnet).
 */
export const DEFAULT_HOT_WATER_TEMPERATURE_C = 60

/** Wärmemenge Warmwasser nach § 9 Abs. 2 HeizKV: 2,5 × V × (tw − 10). */
export function hotWaterKwhFromVolume(
  volumeM3: number,
  temperatureC: number,
): number {
  return 2.5 * volumeM3 * (temperatureC - 10)
}

const OPEN_END = '9999-12-31'

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

type Consumption =
  | { ok: true; value: number; traces: MonthlyMeterTrace[] }
  | {
      ok: false
      reason: MonthlyValueUnavailableReason
      traces: MonthlyMeterTrace[]
    }

interface Usage {
  from: string
  to: string
  heatingFraction: number
  hotWaterFraction: number
}

type UsageResult =
  | { ok: true; usage: Usage }
  | { ok: false; reason: 'no_usage' | 'usage_unknown' }

/** Interner Monatswert mit ungerundetem Betrag. */
interface RawValue {
  output: MonthlyValue
  raw: number | null
}

function notCollected(reason: MonthlyValueUnavailableReason): RawValue {
  return { output: { status: 'not_collected', value: null, reason }, raw: null }
}

function toUsage(
  intervals: readonly DateInterval[],
  month: CalendarMonth,
): Usage {
  const monthPermille = degreeDayPermille(month.from, month.to)
  let permille = 0
  let days = 0
  for (const { from, to } of intervals) {
    permille += degreeDayPermille(from, to)
    days += inclusiveDays(from, to)
  }
  return {
    from: intervals.map(({ from }) => from).sort()[0]!,
    to: intervals
      .map(({ to }) => to)
      .sort()
      .at(-1)!,
    heatingFraction: Math.min(1, permille / monthPermille),
    hotWaterFraction: Math.min(1, days / month.days),
  }
}

function occupancyInterval(
  row: OccupancyPeriod,
  period: BillingPeriod,
): DateInterval | null {
  return intersect(
    { from: row.from ?? period.periodStart, to: row.to ?? period.periodEnd },
    { from: period.periodStart, to: period.periodEnd },
  )
}

export function calculateMonthlyConsumptionInformation(
  data: AppDataFile,
  input: MonthlyConsumptionInformationInput,
): MonthlyConsumptionInformation {
  const month = parseMonth(input.month)
  const issues: MonthlyInformationIssue[] = []
  const result: MonthlyConsumptionInformation = {
    propertyId: input.propertyId,
    month: month.key,
    from: month.from,
    to: month.to,
    billingPeriodId: null,
    tenants: [],
    assumptions: [],
    issues,
  }
  const issue = (
    code: string,
    detail: string,
    fields: Omit<MonthlyInformationIssue, 'code' | 'detail'> = {},
  ) => issues.push({ code, detail, ...fields })

  const { masterData, billingData } = data
  if (!masterData.properties.some(({ id }) => id === input.propertyId)) {
    issue('monthly.property_missing', 'Objekt nicht gefunden.')
    return result
  }

  const periods = billingData.billingPeriods
    .filter(({ propertyId }) => propertyId === input.propertyId)
    .sort(
      (left, right) =>
        left.periodStart.localeCompare(right.periodStart) ||
        left.id.localeCompare(right.id),
    )
  const periodsOf = (target: CalendarMonth) =>
    periods.filter(
      ({ periodStart, periodEnd }) =>
        periodStart <= target.to && periodEnd >= target.from,
    )
  const periodOf = (target: CalendarMonth): BillingPeriod | undefined =>
    periodsOf(target)[0]

  const candidates = periodsOf(month)
  const period = candidates[0]
  if (!period) {
    issue(
      'monthly.billing_period_missing',
      `Für ${month.key} ist kein Abrechnungszeitraum des Objekts angelegt.`,
    )
    return result
  }
  if (candidates.length > 1)
    issue(
      'monthly.billing_period_ambiguous',
      `Mehrere Abrechnungszeiträume berühren ${month.key}; maßgeblich ist der zuerst beginnende.`,
    )
  result.billingPeriodId = period.id

  const units = new Map(
    masterData.units
      .filter(({ propertyId }) => propertyId === input.propertyId)
      .map((unit, index) => [unit.id, { unit, index }] as const),
  )
  const meters = new Map(masterData.meters.map((meter) => [meter.id, meter]))
  const tenancies = new Map(
    masterData.tenancies.map((tenancy) => [tenancy.id, tenancy]),
  )
  const circuits = billingData.heatingCircuits.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )

  // Zuordnungen des Abrechnungszeitraums des betrachteten Monats.
  const heatMeters = new Map<
    string,
    { meterId: string; circuit: HeatingCircuit }[]
  >()
  const hotWaterMeters = new Map<
    string,
    { meterId: string; circuit: HeatingCircuit }[]
  >()
  const assignedMeterIds = new Set<string>()
  const register = (
    target: typeof heatMeters,
    circuit: HeatingCircuit,
    assignment: { meterId: string; unitId: string },
    kind: Meter['kind'],
  ) => {
    assignedMeterIds.add(assignment.meterId)
    const meter = meters.get(assignment.meterId)
    const fields = {
      heatingCircuitId: circuit.id,
      meterId: assignment.meterId,
      unitId: assignment.unitId,
    }
    if (!meter) {
      issue(
        'monthly.meter_missing',
        'Zugeordneter Zähler existiert nicht.',
        fields,
      )
      return
    }
    if (meter.kind !== kind) {
      issue(
        'monthly.meter_kind_invalid',
        kind === 'unit_heat'
          ? 'Zuordnung verweist nicht auf einen Wohnungs-Wärmemengenzähler.'
          : 'Zuordnung verweist nicht auf einen Wohnungs-Warmwasserzähler.',
        fields,
      )
      return
    }
    if (kind === 'unit_hot_water' && !circuit.hasCentralHotWater) {
      issue(
        'monthly.hot_water_not_central',
        'Warmwasserzähler ist einem Heizkreis ohne zentrale Warmwasserbereitung zugeordnet; keine Warmwasserangabe.',
        fields,
      )
      return
    }
    target.set(assignment.unitId, [
      ...(target.get(assignment.unitId) ?? []),
      { meterId: assignment.meterId, circuit },
    ])
  }
  for (const circuit of circuits) {
    for (const assignment of circuit.meterAssignments ?? [])
      register(heatMeters, circuit, assignment, 'unit_heat')
    for (const assignment of circuit.hotWaterMeterAssignments ?? [])
      register(hotWaterMeters, circuit, assignment, 'unit_hot_water')
  }
  for (const meter of masterData.meters)
    if (
      meter.propertyId === input.propertyId &&
      (meter.kind === 'unit_heat' || meter.kind === 'unit_hot_water') &&
      !assignedMeterIds.has(meter.id)
    )
      issue(
        'monthly.meter_unassigned',
        'Wohnungszähler ist im Abrechnungszeitraum keiner Einheit zugeordnet.',
        { meterId: meter.id },
      )

  // Ablesungen je Zähler, nur mit passender Einheit.
  const readingsByMeter = new Map<string, MeterReading[]>()
  const expectedUnit = (meterId: string) =>
    meters.get(meterId)?.kind === 'unit_hot_water' ? 'm3' : 'kWh'
  const relevantMeterIds = new Set(
    [...heatMeters.values(), ...hotWaterMeters.values()].flatMap((list) =>
      list.map(({ meterId }) => meterId),
    ),
  )
  for (const reading of billingData.meterReadings) {
    if (!relevantMeterIds.has(reading.meterId)) continue
    if (reading.value.unit !== expectedUnit(reading.meterId)) {
      issue(
        'monthly.reading_unit_invalid',
        `Ablesung muss in ${expectedUnit(reading.meterId)} vorliegen und bleibt unberücksichtigt.`,
        { meterId: reading.meterId, readingIds: [reading.id] },
      )
      continue
    }
    readingsByMeter.set(reading.meterId, [
      ...(readingsByMeter.get(reading.meterId) ?? []),
      reading,
    ])
  }

  const meterConsumptionCache = new Map<string, Consumption>()
  const meterConsumption = (meterId: string, target: CalendarMonth) => {
    const key = `${meterId}|${target.key}`
    const cached = meterConsumptionCache.get(key)
    if (cached) return cached
    const readings = readingsByMeter.get(meterId) ?? []
    const end = selectMonthEndReading(readings, target.to)
    const start = selectMonthEndReading(readings, shiftMonth(target, -1).to)
    const ref = (selection: typeof end): MonthlyReadingRef | null =>
      selection.status === 'found'
        ? {
            readingId: selection.reading.id,
            date: selection.reading.date!,
            value: selection.reading.value.value,
          }
        : null
    const traces: MonthlyMeterTrace[] = [
      {
        meterId,
        meterNumber: meters.get(meterId)?.meterNumber ?? null,
        startReading: ref(start),
        endReading: ref(end),
      },
    ]
    let computed: Consumption
    if (start.status === 'conflict' || end.status === 'conflict')
      computed = { ok: false, reason: 'reading_conflict', traces }
    else if (start.status === 'missing' || end.status === 'missing')
      computed = { ok: false, reason: 'reading_missing', traces }
    else {
      const value = end.reading.value.value - start.reading.value.value
      computed =
        value < 0
          ? { ok: false, reason: 'negative_consumption', traces }
          : { ok: true, value, traces }
    }
    meterConsumptionCache.set(key, computed)
    return computed
  }
  const unitConsumption = (
    meterIds: readonly string[],
    target: CalendarMonth,
  ): Consumption => {
    if (meterIds.length === 0)
      return { ok: false, reason: 'meter_not_assigned', traces: [] }
    const parts = meterIds.map((meterId) => meterConsumption(meterId, target))
    const traces = parts.flatMap(({ traces: list }) => list)
    const failed = parts.find((part) => !part.ok)
    if (failed && !failed.ok)
      return { ok: false, reason: failed.reason, traces }
    return {
      ok: true,
      value: parts.reduce((sum, part) => sum + (part.ok ? part.value : 0), 0),
      traces,
    }
  }

  /** Nutzung desselben Mietverhältnisses im Vergleichsmonat. */
  const comparisonUsage = (
    row: OccupancyPeriod,
    target: CalendarMonth,
  ): UsageResult => {
    const targetPeriod = periodOf(target)
    let intervals: DateInterval[]
    if (targetPeriod) {
      intervals = billingData.occupancyPeriods.flatMap((candidate) => {
        if (
          candidate.billingPeriodId !== targetPeriod.id ||
          candidate.kind !== 'tenant' ||
          candidate.unitId !== row.unitId ||
          (row.tenancyId
            ? candidate.tenancyId !== row.tenancyId
            : candidate.id !== row.id)
        )
          return []
        const interval = occupancyInterval(candidate, targetPeriod)
        const inMonth = interval && intersect(interval, target)
        return inMonth ? [inMonth] : []
      })
    } else {
      // Kein Abrechnungszeitraum: Ein- und Auszug des Mietverhältnisses.
      const tenancy = row.tenancyId ? tenancies.get(row.tenancyId) : undefined
      if (!tenancy?.movedIn) return { ok: false, reason: 'usage_unknown' }
      const inMonth = intersect(
        { from: tenancy.movedIn, to: tenancy.movedOut ?? OPEN_END },
        target,
      )
      intervals = inMonth ? [inMonth] : []
    }
    return intervals.length === 0
      ? { ok: false, reason: 'no_usage' }
      : { ok: true, usage: toUsage(intervals, target) }
  }

  const shareOf = (
    consumption: Consumption,
    usage: UsageResult,
    fraction: (usage: Usage) => number,
    digits: number,
    transform: (value: number) => number = (value) => value,
  ): RawValue => {
    if (!usage.ok) return notCollected(usage.reason)
    if (!consumption.ok) return notCollected(consumption.reason)
    const raw = transform(consumption.value * fraction(usage.usage))
    return {
      output: {
        status: 'collected',
        value: round(raw, digits),
        from: usage.usage.from,
        to: usage.usage.to,
      },
      raw,
    }
  }

  const tenantRows = billingData.occupancyPeriods
    .flatMap((row) => {
      if (
        row.billingPeriodId !== period.id ||
        row.kind !== 'tenant' ||
        !units.has(row.unitId)
      )
        return []
      const interval = occupancyInterval(row, period)
      const inMonth = interval && intersect(interval, month)
      return inMonth ? [{ row, interval: inMonth }] : []
    })
    .sort(
      (left, right) =>
        units.get(left.row.unitId)!.index -
          units.get(right.row.unitId)!.index ||
        left.interval.from.localeCompare(right.interval.from) ||
        left.row.id.localeCompare(right.row.id),
    )

  // Überschneidungen von Mieter-Nutzungen derselben Einheit im Monat.
  for (let index = 1; index < tenantRows.length; index += 1) {
    const previous = tenantRows[index - 1]!
    const current = tenantRows[index]!
    if (
      previous.row.unitId === current.row.unitId &&
      current.interval.from <= previous.interval.to
    )
      issue(
        'monthly.occupancy_overlap',
        'Mieter-Nutzungszeiträume derselben Einheit überschneiden sich im Monat.',
        { unitId: current.row.unitId, occupancyPeriodId: current.row.id },
      )
  }

  const reportedUnits = new Set<string>()
  let defaultTemperatureUsed = false
  const previousMonth = shiftMonth(month, -1)
  const previousYearMonth = shiftMonth(month, -12)

  for (const { row, interval } of tenantRows) {
    const unit = units.get(row.unitId)!.unit
    const heatAssignments = heatMeters.get(unit.id) ?? []
    const hotWaterAssignments = hotWaterMeters.get(unit.id) ?? []
    const circuit =
      heatAssignments[0]?.circuit ??
      circuits.find(({ buildingId }) => buildingId === unit.buildingId)
    if (!reportedUnits.has(unit.id)) {
      reportedUnits.add(unit.id)
      if (heatAssignments.length === 0)
        issue(
          'monthly.heat_meter_assignment_missing',
          'Für die Einheit ist kein Wohnungs-Wärmemengenzähler zugeordnet.',
          { unitId: unit.id, heatingCircuitId: circuit?.id },
        )
      if (hotWaterAssignments.length === 0 && circuit?.hasCentralHotWater)
        issue(
          'monthly.hot_water_meter_assignment_missing',
          'Zentrales Warmwasser, aber kein Warmwasserzähler für die Einheit zugeordnet.',
          { unitId: unit.id, heatingCircuitId: circuit.id },
        )
    }

    const currentUsage: UsageResult = {
      ok: true,
      usage: toUsage([interval], month),
    }
    const usages = {
      current: currentUsage,
      previousMonth: comparisonUsage(row, previousMonth),
      previousYearMonth: comparisonUsage(row, previousYearMonth),
    }
    const months = { current: month, previousMonth, previousYearMonth }
    const keys = ['current', 'previousMonth', 'previousYearMonth'] as const

    const heatMeterIds = heatAssignments.map(({ meterId }) => meterId)
    const heatingRaw = Object.fromEntries(
      keys.map((key) => [
        key,
        shareOf(
          unitConsumption(heatMeterIds, months[key]),
          usages[key],
          ({ heatingFraction }) => heatingFraction,
          0,
        ),
      ]),
    ) as Record<(typeof keys)[number], RawValue>

    let hotWater: MonthlyHotWaterInformation | null = null
    let hotWaterCurrentKwh: number | null = null
    const hotWaterCircuit = hotWaterAssignments[0]?.circuit
    if (hotWaterCircuit) {
      const energy = hotWaterCircuit.hotWaterEnergy
      const measured = energy?.method === 'volume_formula' ? energy : null
      const temperatureC =
        measured?.temperatureC ?? DEFAULT_HOT_WATER_TEMPERATURE_C
      if (!measured) defaultTemperatureUsed = true
      const meterIds = hotWaterAssignments.map(({ meterId }) => meterId)
      const values = Object.fromEntries(
        keys.map((key) => {
          const consumption = unitConsumption(meterIds, months[key])
          const fraction = ({ hotWaterFraction }: Usage) => hotWaterFraction
          const m3 = shareOf(consumption, usages[key], fraction, 2)
          const kwh = shareOf(consumption, usages[key], fraction, 0, (value) =>
            hotWaterKwhFromVolume(value, temperatureC),
          )
          if (key === 'current') hotWaterCurrentKwh = kwh.raw
          return [key, { m3: m3.output, kwh: kwh.output }]
        }),
      ) as Record<(typeof keys)[number], MonthlyHotWaterValue>
      hotWater = {
        heatingCircuitId: hotWaterCircuit.id,
        temperatureC,
        temperatureEstimated:
          !measured || measured.temperatureEstimated === true,
        ...values,
        meters: unitConsumption(meterIds, month).traces,
      }
    }

    const averageUser = compareWithAverageUser(
      unit,
      circuit,
      interval,
      heatingRaw.current.raw,
      hotWater ? hotWaterCurrentKwh : undefined,
    )

    result.tenants.push({
      occupancyPeriodId: row.id,
      tenancyId: row.tenancyId ?? null,
      unitId: unit.id,
      heatingCircuitId: circuit?.id ?? null,
      from: interval.from,
      to: interval.to,
      days: inclusiveDays(interval.from, interval.to),
      heatingAllocation: 'degree_days',
      hotWaterAllocation: 'days',
      heatingShare: round(currentUsage.usage.heatingFraction, 4),
      hotWaterShare: round(currentUsage.usage.hotWaterFraction, 4),
      heating: {
        unit: 'kWh',
        current: heatingRaw.current.output,
        previousMonth: heatingRaw.previousMonth.output,
        previousYearMonth: heatingRaw.previousYearMonth.output,
        meters: unitConsumption(heatMeterIds, month).traces,
      },
      hotWater,
      averageUser,
    })
  }

  if (
    result.tenants.some(({ averageUser }) => averageUser.status === 'compared')
  )
    result.assumptions.push({
      code: 'E-46-3',
      detail:
        'Durchschnittsnutzer: Mitte der Heizspiegel-Klasse „mittel“ ((Grenze niedrig + Grenze mittel) ÷ 2, in kWh je m² und Jahr) × Wohnfläche, auf den Monat verteilt nach Gradtagszahlen.',
    })
  if (defaultTemperatureUsed)
    result.assumptions.push({
      code: 'hot_water_temperature',
      detail: `Warmwassertemperatur nicht gemessen; geschätzt ${DEFAULT_HOT_WATER_TEMPERATURE_C} °C (Umrechnung nach § 9 Abs. 2 HeizKV).`,
    })
  return result
}

/**
 * Durchschnittsnutzer im Nutzungszeitraum. `hotWaterKwh`: `undefined`, wenn
 * kein Warmwasser ausgewiesen wird; `null`, wenn der Wert fehlt.
 */
function compareWithAverageUser(
  unit: Unit,
  circuit: HeatingCircuit | undefined,
  interval: DateInterval,
  heatingKwh: number | null,
  hotWaterKwh: number | null | undefined,
): MonthlyAverageUserComparison {
  const unavailable = (
    reason: Extract<
      MonthlyAverageUserComparison,
      { status: 'unavailable' }
    >['reason'],
  ): MonthlyAverageUserComparison => ({
    status: 'unavailable',
    value: null,
    reason,
  })
  const benchmark = circuit?.consumptionBenchmark
  if (!benchmark) return unavailable('no_benchmark')
  const heated = unit.heatedAreaSqm?.value ?? 0
  const usable = unit.usableAreaSqm?.value ?? 0
  const areaBasis =
    heated > 0 ? 'heated_area' : usable > 0 ? 'usable_area' : null
  if (!areaBasis) return unavailable('area_unknown')
  if (benchmark.includesHotWater && hotWaterKwh === undefined)
    return unavailable('hot_water_energy_unknown')
  const areaSqm = areaBasis === 'heated_area' ? heated : usable
  const benchmarkKwhPerSqmYear =
    (benchmark.lowMaxKwhPerSqmYear + benchmark.mediumMaxKwhPerSqmYear) / 2
  const permille = degreeDayPermille(interval.from, interval.to)
  const own =
    heatingKwh === null
      ? null
      : benchmark.includesHotWater
        ? hotWaterKwh == null
          ? null
          : heatingKwh + hotWaterKwh
        : heatingKwh
  return {
    status: 'compared',
    method: 'heizspiegel_medium_midpoint',
    approximation: benchmark.includesHotWater,
    includesHotWater: benchmark.includesHotWater,
    source: benchmark.source,
    category: benchmark.category,
    referenceYear: benchmark.referenceYear,
    benchmarkKwhPerSqmYear,
    areaSqm,
    areaBasis,
    degreeDayPermille: round(permille, 3),
    value: round((benchmarkKwhPerSqmYear * areaSqm * permille) / 1000, 0),
    ownKwh: own === null ? null : round(own, 0),
  }
}
