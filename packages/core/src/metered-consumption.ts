import type { CalculationInput } from './contracts'

type Boundary = 'start_of_day' | 'end_of_day'
type MeteredCircuit = CalculationInput['heatingCircuits'][number] & {
  consumptionMode?: 'manual' | 'metered_kwh'
  meterAssignments?: readonly { meterId: string; unitId: string }[]
}
type MeteredReading = CalculationInput['meterReadings'][number] & {
  boundary?: Boundary | null
}

export interface MeteredConsumptionIssue {
  code: string
  detail: string
  heatingCircuitId?: string
  meterId?: string
  unitId?: string
  occupancyId?: string
  readingIds?: string[]
}

export interface MeteredReadingTrace {
  meterId: string
  meterNumber: string | null
  startReadingId: string
  startReadingDate: string
  startBoundary: Boundary
  endReadingId: string
  endReadingDate: string
  endBoundary: Boundary
  startValue: string
  endValue: string
  unit: 'kWh'
  kwh: string
}

export interface MeteredOccupancyTrace {
  occupancyId: string
  unitId: string
  from: string
  to: string
  kwh: string
  meters: MeteredReadingTrace[]
}

export interface MeteredCircuitTrace {
  heatingCircuitId: string
  buildingId: string
  totalKwh: string
  occupancies: MeteredOccupancyTrace[]
}

export interface MeteredConsumptionTrace {
  year: number
  billingPeriodId: string
  totalKwh: string
  circuits: MeteredCircuitTrace[]
}

export type MeteredConsumptionResolution =
  | {
      ok: true
      totalKwh: string
      circuits: MeteredCircuitTrace[]
      trace: MeteredConsumptionTrace
    }
  | { ok: false; issues: MeteredConsumptionIssue[] }

interface Decimal {
  coefficient: bigint
  scale: number
}

function decimal(value: number | string): Decimal | undefined {
  if (!Number.isFinite(Number(value))) return undefined
  const raw = String(value).toLowerCase()
  const [mantissa, exponentText] = raw.split('e')
  const exponent = Number(exponentText ?? 0)
  const negative = mantissa!.startsWith('-')
  const unsigned = negative ? mantissa!.slice(1) : mantissa!
  const [whole, fraction = ''] = unsigned.split('.')
  let coefficient = BigInt(`${whole}${fraction}` || '0') * (negative ? -1n : 1n)
  let scale = fraction.length - exponent
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale)
    scale = 0
  }
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n
    scale -= 1
  }
  return { coefficient, scale }
}

function align(left: Decimal, right: Decimal): [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale)
  return [
    left.coefficient * 10n ** BigInt(scale - left.scale),
    right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  ]
}

function subtract(left: Decimal, right: Decimal): Decimal {
  const [a, b, scale] = align(left, right)
  return { coefficient: a - b, scale }
}

function add(left: Decimal, right: Decimal): Decimal {
  const [a, b, scale] = align(left, right)
  return { coefficient: a + b, scale }
}

function format(value: Decimal): string {
  const negative = value.coefficient < 0n
  const digits = (negative ? -value.coefficient : value.coefficient)
    .toString()
    .padStart(value.scale + 1, '0')
  const rendered =
    value.scale === 0
      ? digits
      : `${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}`
  return `${negative ? '-' : ''}${rendered}`
}

function dayAfter(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1))
  return `${next.getUTCFullYear().toString().padStart(4, '0')}-${(next.getUTCMonth() + 1).toString().padStart(2, '0')}-${next.getUTCDate().toString().padStart(2, '0')}`
}

function dayBefore(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const previous = new Date(Date.UTC(year!, month! - 1, day! - 1))
  return `${previous.getUTCFullYear().toString().padStart(4, '0')}-${(previous.getUTCMonth() + 1).toString().padStart(2, '0')}-${previous.getUTCDate().toString().padStart(2, '0')}`
}

function effectiveBoundary(reading: MeteredReading): string | undefined {
  if (!reading.date || !reading.boundary) return undefined
  return reading.boundary === 'end_of_day'
    ? dayAfter(reading.date)
    : reading.date
}

function occupancyInterval(
  input: CalculationInput,
  row: CalculationInput['occupancyPeriods'][number],
): { from: string; to: string } | undefined {
  const from =
    row.from && row.from > input.billingPeriod.periodStart
      ? row.from
      : input.billingPeriod.periodStart
  const to =
    row.to && row.to < input.billingPeriod.periodEnd
      ? row.to
      : input.billingPeriod.periodEnd
  return from <= to ? { from, to: dayAfter(to) } : undefined
}

function issue(
  code: string,
  detail: string,
  fields: Partial<MeteredConsumptionIssue> = {},
): MeteredConsumptionIssue {
  return { code, detail, ...fields }
}

/** Resolve measured kWh for every opted-in circuit without changing source records. */
export function resolveMeteredConsumption(
  input: CalculationInput,
): MeteredConsumptionResolution {
  const circuits = input.heatingCircuits as readonly MeteredCircuit[]
  const active = circuits.filter(
    (circuit) => circuit.consumptionMode === 'metered_kwh',
  )
  if (active.length === 0) {
    return {
      ok: true,
      totalKwh: '0',
      circuits: [],
      trace: {
        year: input.billingPeriod.year,
        billingPeriodId: input.billingPeriod.id,
        totalKwh: '0',
        circuits: [],
      },
    }
  }
  const issues: MeteredConsumptionIssue[] = []
  const meters = new Map(input.meters.map((meter) => [meter.id, meter]))
  const units = new Map(input.units.map((unit) => [unit.id, unit]))
  const readings = input.meterReadings as readonly MeteredReading[]
  const occupancyRows = input.occupancyPeriods.filter(
    ({ billingPeriodId }) => billingPeriodId === input.billingPeriod.id,
  )
  const assignmentsAcrossCircuits = new Map<string, Set<string>>()
  for (const circuit of circuits) {
    for (const assignment of circuit.meterAssignments ?? []) {
      const owners =
        assignmentsAcrossCircuits.get(assignment.meterId) ?? new Set<string>()
      owners.add(circuit.id)
      assignmentsAcrossCircuits.set(assignment.meterId, owners)
    }
  }
  const results: MeteredCircuitTrace[] = []

  for (const circuit of active) {
    const circuitIssuesStart = issues.length
    const circuitOccupancies = occupancyRows.flatMap((row) => {
      const unit = units.get(row.unitId)
      return unit?.buildingId === circuit.buildingId &&
        unit?.propertyId === input.property.id
        ? [{ row, interval: occupancyInterval(input, row) }]
        : []
    })
    const circuitUnitIds = input.units
      .filter(
        ({ propertyId, buildingId }) =>
          propertyId === input.property.id && buildingId === circuit.buildingId,
      )
      .map(({ id }) => id)
    const assignments = circuit.meterAssignments ?? []
    if (assignments.length === 0)
      issues.push(
        issue(
          'metered.assignment_missing',
          'Für den Messmodus ist kein Wohnungszähler zugeordnet.',
          { heatingCircuitId: circuit.id },
        ),
      )
    const assignmentsByUnit = new Map<string, string[]>()
    const assignedMeters = new Set<string>()
    for (const assignment of assignments) {
      const meter = meters.get(assignment.meterId)
      const unit = units.get(assignment.unitId)
      if (!meter || meter.kind !== 'unit_heat')
        issues.push(
          issue(
            'metered.meter_kind_invalid',
            'Zuordnung verweist nicht auf einen Wohnungs-Wärmemengenzähler.',
            {
              heatingCircuitId: circuit.id,
              meterId: assignment.meterId,
              unitId: assignment.unitId,
            },
          ),
        )
      if (meter && meter.propertyId !== input.property.id)
        issues.push(
          issue(
            'metered.property_mismatch',
            'Zähler gehört zu einem anderen Objekt.',
            { heatingCircuitId: circuit.id, meterId: meter.id },
          ),
        )
      if (
        !unit ||
        unit.propertyId !== input.property.id ||
        unit.buildingId !== circuit.buildingId
      )
        issues.push(
          issue(
            'metered.unit_building_mismatch',
            'Einheit gehört nicht zum Objekt und Gebäude des Heizkreises.',
            {
              heatingCircuitId: circuit.id,
              meterId: assignment.meterId,
              unitId: assignment.unitId,
            },
          ),
        )
      if (meter) {
        if (
          (meter.validFrom &&
            meter.validFrom > input.billingPeriod.periodStart) ||
          (meter.validTo && meter.validTo < input.billingPeriod.periodEnd)
        )
          issues.push(
            issue(
              'metered.meter_validity_incomplete',
              'Zähler ist nicht für den gesamten Abrechnungszeitraum gültig.',
              { heatingCircuitId: circuit.id, meterId: meter.id },
            ),
          )
        if ((assignmentsAcrossCircuits.get(meter.id)?.size ?? 0) > 1)
          issues.push(
            issue(
              'metered.duplicate_assignment',
              'Zähler ist mehreren Heizkreisen zugeordnet.',
              { heatingCircuitId: circuit.id, meterId: meter.id },
            ),
          )
      }
      if (assignedMeters.has(assignment.meterId))
        issues.push(
          issue(
            'metered.duplicate_assignment',
            'Zähler ist mehrfach zugeordnet.',
            { heatingCircuitId: circuit.id, meterId: assignment.meterId },
          ),
        )
      assignedMeters.add(assignment.meterId)
      assignmentsByUnit.set(assignment.unitId, [
        ...(assignmentsByUnit.get(assignment.unitId) ?? []),
        assignment.meterId,
      ])
      if (!circuitUnitIds.includes(assignment.unitId))
        issues.push(
          issue(
            'metered.assignment_unit_invalid',
            'Zuordnung verweist auf keine Einheit im Gebäude des Heizkreises.',
            {
              heatingCircuitId: circuit.id,
              meterId: assignment.meterId,
              unitId: assignment.unitId,
            },
          ),
        )
    }
    for (const { row, interval } of circuitOccupancies) {
      if (!interval)
        issues.push(
          issue(
            'metered.occupancy_invalid_range',
            'Nutzungszeitraum ist ungültig.',
            {
              heatingCircuitId: circuit.id,
              occupancyId: row.id,
              unitId: row.unitId,
            },
          ),
        )
      if (!assignmentsByUnit.get(row.unitId)?.length)
        issues.push(
          issue(
            'metered.assignment_missing',
            'Für diese Einheit ist kein Wohnungszähler zugeordnet.',
            {
              heatingCircuitId: circuit.id,
              occupancyId: row.id,
              unitId: row.unitId,
            },
          ),
        )
    }
    for (const unitId of circuitUnitIds) {
      if (!circuitOccupancies.some(({ row }) => row.unitId === unitId))
        issues.push(
          issue(
            'metered.occupancy_missing',
            'Für eine Einheit im Gebäude ist kein Nutzungszeitraum erfasst.',
            { heatingCircuitId: circuit.id, unitId },
          ),
        )
    }
    validateOccupancyCoverage(
      input,
      circuit.id,
      circuitUnitIds,
      circuitOccupancies,
      issues,
    )

    const meterReadingIndexes = new Map<string, Map<string, MeteredReading[]>>()
    for (const meterId of assignedMeters) {
      const meterReadings = readings.filter(({ meterId: id }) => id === meterId)
      const relevant = meterReadings.filter((reading) => {
        if (reading.billingPeriodId === input.billingPeriod.id) return true
        if (reading.billingPeriodId != null) return false
        return Boolean(
          (reading.date === dayBefore(input.billingPeriod.periodStart) &&
            reading.boundary === 'end_of_day') ||
          (reading.date === dayAfter(input.billingPeriod.periodEnd) &&
            reading.boundary === 'start_of_day'),
        )
      })
      for (const reading of relevant) {
        if (!reading.date || !reading.boundary)
          issues.push(
            issue(
              'metered.boundary_missing',
              'Ablesung hat keine ausdrückliche Tagesgrenze.',
              {
                heatingCircuitId: circuit.id,
                meterId,
                readingIds: [reading.id],
              },
            ),
          )
        if (reading.source !== 'manual' && reading.source !== 'imported')
          issues.push(
            issue(
              'metered.reading_source_invalid',
              'Nur manuelle oder importierte Ablesungen sind zulässig.',
              {
                heatingCircuitId: circuit.id,
                meterId,
                readingIds: [reading.id],
              },
            ),
          )
        if (reading.value.unit !== 'kWh')
          issues.push(
            issue('metered.unit_invalid', 'Ablesung muss in kWh vorliegen.', {
              heatingCircuitId: circuit.id,
              meterId,
              readingIds: [reading.id],
            }),
          )
        if (reading.value.value < 0 || !decimal(reading.value.value))
          issues.push(
            issue('metered.value_invalid', 'Ablesestand ist ungültig.', {
              heatingCircuitId: circuit.id,
              meterId,
              readingIds: [reading.id],
            }),
          )
        const boundary = effectiveBoundary(reading)
        if (
          boundary &&
          (boundary < input.billingPeriod.periodStart ||
            boundary > dayAfter(input.billingPeriod.periodEnd))
        )
          issues.push(
            issue(
              'metered.reading_date_invalid',
              'Ablesung liegt außerhalb des Abrechnungszeitraums.',
              {
                heatingCircuitId: circuit.id,
                meterId,
                readingIds: [reading.id],
              },
            ),
          )
      }
      const index = new Map<string, MeteredReading[]>()
      for (const reading of relevant) {
        const boundary = effectiveBoundary(reading)
        if (
          boundary &&
          boundary >= input.billingPeriod.periodStart &&
          boundary <= dayAfter(input.billingPeriod.periodEnd)
        )
          index.set(boundary, [...(index.get(boundary) ?? []), reading])
      }
      for (const [boundary, duplicates] of index)
        if (duplicates.length > 1)
          issues.push(
            issue(
              'metered.duplicate_boundary',
              `Mehrere Ablesungen liegen an derselben wirksamen Grenze ${boundary}.`,
              {
                heatingCircuitId: circuit.id,
                meterId,
                readingIds: duplicates.map(({ id }) => id),
              },
            ),
          )
      const ordered = [...index.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      )
      for (let i = 1; i < ordered.length; i += 1) {
        const previous = ordered[i - 1]![1][0]!
        const current = ordered[i]![1][0]!
        const before = decimal(previous.value.value)
        const after = decimal(current.value.value)
        if (before && after && subtract(after, before).coefficient < 0n)
          issues.push(
            issue(
              'metered.reading_decreased',
              'Zählerstand ist gegenüber der vorherigen Ablesung gesunken.',
              {
                heatingCircuitId: circuit.id,
                meterId,
                readingIds: [previous.id, current.id],
              },
            ),
          )
      }
      meterReadingIndexes.set(meterId, index)
    }

    const occupancyTraces: MeteredOccupancyTrace[] = []
    for (const { row, interval } of circuitOccupancies) {
      if (!interval) continue
      const contributions: MeteredReadingTrace[] = []
      for (const meterId of assignmentsByUnit.get(row.unitId) ?? []) {
        const index = meterReadingIndexes.get(meterId)
        const start = index?.get(interval.from)?.[0]
        const end = index?.get(interval.to)?.[0]
        if (!start || !end) {
          issues.push(
            issue(
              'metered.boundary_missing',
              'Für den vollständigen Nutzungszeitraum fehlt eine Grenzablesung.',
              {
                heatingCircuitId: circuit.id,
                meterId,
                unitId: row.unitId,
                occupancyId: row.id,
                readingIds: [start?.id, end?.id].filter((id): id is string =>
                  Boolean(id),
                ),
              },
            ),
          )
          continue
        }
        const startValue = decimal(start.value.value)
        const endValue = decimal(end.value.value)
        if (!startValue || !endValue) continue
        const delta = subtract(endValue, startValue)
        if (delta.coefficient < 0n) continue
        contributions.push({
          meterId,
          meterNumber: meters.get(meterId)?.meterNumber ?? null,
          startReadingId: start.id,
          startReadingDate: start.date!,
          startBoundary: start.boundary!,
          endReadingId: end.id,
          endReadingDate: end.date!,
          endBoundary: end.boundary!,
          startValue: format(startValue),
          endValue: format(endValue),
          unit: 'kWh',
          kwh: format(delta),
        })
      }
      const total = contributions.reduce(
        (sum, contribution) => add(sum, decimal(contribution.kwh)!),
        { coefficient: 0n, scale: 0 },
      )
      occupancyTraces.push({
        occupancyId: row.id,
        unitId: row.unitId,
        from: interval.from,
        to: dayBefore(interval.to),
        kwh: format(total),
        meters: contributions,
      })
    }
    if (issues.length === circuitIssuesStart) {
      const total = occupancyTraces.reduce(
        (sum, occupancy) => add(sum, decimal(occupancy.kwh)!),
        { coefficient: 0n, scale: 0 },
      )
      results.push({
        heatingCircuitId: circuit.id,
        buildingId: circuit.buildingId,
        totalKwh: format(total),
        occupancies: occupancyTraces,
      })
    }
  }
  if (issues.length > 0) return { ok: false, issues }
  const total = results.reduce(
    (sum, circuit) => add(sum, decimal(circuit.totalKwh)!),
    { coefficient: 0n, scale: 0 },
  )
  const totalKwh = format(total)
  const trace = {
    year: input.billingPeriod.year,
    billingPeriodId: input.billingPeriod.id,
    totalKwh,
    circuits: results,
  }
  return { ok: true, totalKwh, circuits: results, trace }
}

function validateOccupancyCoverage(
  input: CalculationInput,
  heatingCircuitId: string,
  unitIds: readonly string[],
  rows: readonly {
    row: CalculationInput['occupancyPeriods'][number]
    interval: { from: string; to: string } | undefined
  }[],
  issues: MeteredConsumptionIssue[],
): void {
  const byUnit = new Map<string, (typeof rows)[number][]>()
  for (const unitId of unitIds) byUnit.set(unitId, [])
  for (const item of rows)
    byUnit.set(item.row.unitId, [...(byUnit.get(item.row.unitId) ?? []), item])
  for (const [unitId, items] of byUnit) {
    const sorted = items
      .filter((item) => item.interval)
      .sort((a, b) => a.interval!.from.localeCompare(b.interval!.from))
    let cursor = input.billingPeriod.periodStart
    for (const item of sorted) {
      if (item.interval!.from < cursor)
        issues.push(
          issue(
            'metered.occupancy_overlap',
            'Nutzungszeiträume überschneiden sich.',
            { heatingCircuitId, unitId, occupancyId: item.row.id },
          ),
        )
      if (item.interval!.from > cursor)
        issues.push(
          issue(
            'metered.occupancy_gap',
            'Nutzungszeiträume decken das Jahr nicht vollständig ab.',
            { heatingCircuitId, unitId, occupancyId: item.row.id },
          ),
        )
      if (item.interval!.to > cursor) cursor = item.interval!.to
    }
    if (cursor < dayAfter(input.billingPeriod.periodEnd))
      issues.push(
        issue(
          'metered.occupancy_gap',
          'Nutzungszeiträume decken das Jahr nicht vollständig ab.',
          { heatingCircuitId, unitId },
        ),
      )
  }
}
