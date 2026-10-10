import type { AppDataFile, OccupancyPeriod } from '@nebenkosten/schema'

/** The circuit mode determines whether saved HKV units affect this period. */
export function occupancyUsesMeteredKwh(
  data: AppDataFile,
  occupancy: OccupancyPeriod,
): boolean {
  const unit = data.masterData.units.find(({ id }) => id === occupancy.unitId)
  const buildingId =
    occupancy.costScope?.kind === 'building'
      ? occupancy.costScope.buildingId
      : unit?.buildingId
  if (!buildingId) return false
  return data.billingData.heatingCircuits.some(
    (circuit) =>
      circuit.billingPeriodId === occupancy.billingPeriodId &&
      circuit.buildingId === buildingId &&
      circuit.consumptionMode === 'metered_kwh',
  )
}

/** A stored WMZ number identifies the unit only when it matches a unit-heat meter. */
export function occupancyReadingUsesKwh(
  data: AppDataFile,
  occupancy: OccupancyPeriod,
): boolean {
  const meterNumber = occupancy.heatMeterReading?.meterNumber
  if (!meterNumber) return false
  const unit = data.masterData.units.find(({ id }) => id === occupancy.unitId)
  return data.masterData.meters.some(
    (meter) =>
      meter.kind === 'unit_heat' &&
      meter.propertyId === unit?.propertyId &&
      meter.meterNumber === meterNumber,
  )
}
