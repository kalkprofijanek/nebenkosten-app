import { appDataFileSchema, type AppDataFile } from '@nebenkosten/schema'
import type { CalculationInput } from '../contracts'

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry)) as T
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]),
    ) as T
  }
  return value
}

function cloneFrozen<T>(value: T): T {
  return deepFreeze(cloneValue(value))
}

export function createCalculationInput(
  appData: AppDataFile,
  billingPeriodId: string,
): CalculationInput {
  const parsed = appDataFileSchema.parse(appData)
  const billingPeriod = parsed.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!billingPeriod) {
    throw new Error(`Abrechnungsperiode "${billingPeriodId}" nicht gefunden`)
  }

  const property = parsed.masterData.properties.find(
    ({ id }) => id === billingPeriod.propertyId,
  )
  if (!property) {
    throw new Error(
      `Abrechnungsperiode "${billingPeriod.id}" verweist auf unbekannte Property "${billingPeriod.propertyId}"`,
    )
  }

  const buildings = parsed.masterData.buildings.filter(
    ({ propertyId }) => propertyId === property.id,
  )
  const buildingIds = new Set(buildings.map(({ id }) => id))
  const units = parsed.masterData.units.filter(
    ({ propertyId }) => propertyId === property.id,
  )
  const unitIds = new Set(units.map(({ id }) => id))
  const tenancies = parsed.masterData.tenancies.filter(({ unitId }) =>
    unitIds.has(unitId),
  )
  const tenancyIds = new Set(tenancies.map(({ id }) => id))
  const occupancyPeriods = parsed.billingData.occupancyPeriods.filter(
    ({ billingPeriodId: candidate }) => candidate === billingPeriod.id,
  )
  for (const occupancy of occupancyPeriods) {
    if (!unitIds.has(occupancy.unitId)) {
      throw new Error(
        `OccupancyPeriod "${occupancy.id}" verweist auf unbekannte Unit "${occupancy.unitId}"`,
      )
    }
    if (occupancy.tenancyId != null && !tenancyIds.has(occupancy.tenancyId)) {
      throw new Error(
        `OccupancyPeriod "${occupancy.id}" verweist auf unbekannte Tenancy "${occupancy.tenancyId}"`,
      )
    }
  }

  const occupancyIds = new Set(occupancyPeriods.map(({ id }) => id))
  const allOccupancyIds = new Set(
    parsed.billingData.occupancyPeriods.map(({ id }) => id),
  )
  for (const prepayment of parsed.billingData.prepayments) {
    if (!allOccupancyIds.has(prepayment.occupancyPeriodId)) {
      throw new Error(
        `Prepayment "${prepayment.id}" verweist auf unbekannte OccupancyPeriod "${prepayment.occupancyPeriodId}"`,
      )
    }
  }
  const prepayments = parsed.billingData.prepayments.filter(
    ({ occupancyPeriodId }) => occupancyIds.has(occupancyPeriodId),
  )
  const costCategories = parsed.billingData.costCategories.filter(
    ({ billingPeriodId: candidate }) => candidate === billingPeriod.id,
  )
  const costCategoryIds = new Set(costCategories.map(({ id }) => id))
  const allCostCategoryIds = new Set(
    parsed.billingData.costCategories.map(({ id }) => id),
  )
  for (const entry of parsed.billingData.costEntries) {
    if (!allCostCategoryIds.has(entry.costCategoryId)) {
      throw new Error(
        `CostEntry "${entry.id}" verweist auf unbekannte CostCategory "${entry.costCategoryId}"`,
      )
    }
  }
  const costEntries = parsed.billingData.costEntries.filter(
    ({ costCategoryId }) => costCategoryIds.has(costCategoryId),
  )
  const heatingSystems = parsed.masterData.heatingSystems.filter(
    ({ propertyId }) => propertyId === property.id,
  )
  const heatingSystemIds = new Set(heatingSystems.map(({ id }) => id))
  const heatingCircuits = parsed.billingData.heatingCircuits.filter(
    ({ billingPeriodId: candidate }) => candidate === billingPeriod.id,
  )
  for (const circuit of heatingCircuits) {
    if (
      !buildingIds.has(circuit.buildingId) ||
      !heatingSystemIds.has(circuit.heatingSystemId)
    ) {
      throw new Error(
        `HeatingCircuit "${circuit.id}" enthält eine ungültige Gebäude- oder Heizsystemreferenz`,
      )
    }
  }
  const heatingCircuitIds = new Set(heatingCircuits.map(({ id }) => id))
  const allHeatingCircuitIds = new Set(
    parsed.billingData.heatingCircuits.map(({ id }) => id),
  )
  for (const source of parsed.billingData.energySources) {
    if (!allHeatingCircuitIds.has(source.heatingCircuitId)) {
      throw new Error(
        `EnergySource "${source.id}" verweist auf unbekannten HeatingCircuit "${source.heatingCircuitId}"`,
      )
    }
  }
  const energySources = parsed.billingData.energySources.filter(
    ({ heatingCircuitId }) => heatingCircuitIds.has(heatingCircuitId),
  )
  const energySourceIds = new Set(energySources.map(({ id }) => id))
  for (const stock of parsed.billingData.fuelStocks) {
    if (
      stock.billingPeriodId === billingPeriod.id &&
      !energySourceIds.has(stock.energySourceId)
    ) {
      throw new Error(
        `FuelStock "${stock.id}" verweist auf unbekannte EnergySource "${stock.energySourceId}" der Abrechnungsperiode`,
      )
    }
  }
  const fuelStocks = parsed.billingData.fuelStocks.filter(
    ({ billingPeriodId: candidate, energySourceId }) =>
      candidate === billingPeriod.id && energySourceIds.has(energySourceId),
  )
  for (const delivery of parsed.billingData.fuelDeliveries) {
    if (
      delivery.billingPeriodId === billingPeriod.id &&
      !energySourceIds.has(delivery.energySourceId)
    ) {
      throw new Error(
        `FuelDelivery "${delivery.id}" verweist auf unbekannte EnergySource "${delivery.energySourceId}" der Abrechnungsperiode`,
      )
    }
  }
  const fuelDeliveries = parsed.billingData.fuelDeliveries.filter(
    ({ billingPeriodId: candidate, energySourceId }) =>
      candidate === billingPeriod.id && energySourceIds.has(energySourceId),
  )
  const meters = parsed.masterData.meters.filter(
    ({ propertyId }) => propertyId === property.id,
  )
  const meterIds = new Set(meters.map(({ id }) => id))
  for (const reading of parsed.billingData.meterReadings) {
    if (
      reading.billingPeriodId === billingPeriod.id &&
      !meterIds.has(reading.meterId)
    ) {
      throw new Error(
        `MeterReading "${reading.id}" verweist auf unbekannten Meter "${reading.meterId}" der Abrechnungsperiode`,
      )
    }
  }
  const meterReadings = parsed.billingData.meterReadings.filter(
    ({ billingPeriodId: candidate, meterId }) =>
      candidate === billingPeriod.id && meterIds.has(meterId),
  )

  return cloneFrozen({
    sourceSchemaVersion: parsed.schemaVersion,
    billingPeriod,
    property,
    buildings,
    units,
    tenancies,
    occupancyPeriods,
    prepayments,
    costCategories,
    costEntries,
    heatingSystems,
    heatingCircuits,
    energySources,
    fuelStocks,
    fuelDeliveries,
    meters,
    meterReadings,
  })
}
