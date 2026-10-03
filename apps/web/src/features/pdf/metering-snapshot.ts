import { isoDateSchema } from '@nebenkosten/schema'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function decimal(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^\d+(?:\.\d+)?$/u.test(value) &&
    Number.isFinite(Number(value))
  )
}
function boundary(value: unknown): boolean {
  return value === 'start_of_day' || value === 'end_of_day'
}
function meter(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.meterId === 'string' &&
    (value.meterNumber === null || typeof value.meterNumber === 'string') &&
    typeof value.startReadingId === 'string' &&
    typeof value.endReadingId === 'string' &&
    isoDateSchema.safeParse(value.startReadingDate).success &&
    isoDateSchema.safeParse(value.endReadingDate).success &&
    boundary(value.startBoundary) &&
    boundary(value.endBoundary) &&
    decimal(value.startValue) &&
    decimal(value.endValue) &&
    decimal(value.kwh) &&
    value.unit === 'kWh'
  )
}
function occupancy(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.occupancyId === 'string' &&
    typeof value.unitId === 'string' &&
    isoDateSchema.safeParse(value.from).success &&
    isoDateSchema.safeParse(value.to).success &&
    decimal(value.kwh) &&
    Array.isArray(value.meters) &&
    value.meters.length > 0 &&
    value.meters.every(meter)
  )
}
export function compatibleMeteringTrace(value: unknown): boolean {
  return (
    record(value) &&
    Number.isInteger(value.year) &&
    typeof value.billingPeriodId === 'string' &&
    decimal(value.totalKwh) &&
    Array.isArray(value.circuits) &&
    value.circuits.every(
      (circuit) =>
        record(circuit) &&
        typeof circuit.heatingCircuitId === 'string' &&
        typeof circuit.buildingId === 'string' &&
        decimal(circuit.totalKwh) &&
        Array.isArray(circuit.occupancies) &&
        circuit.occupancies.length > 0 &&
        circuit.occupancies.every(occupancy),
    )
  )
}
