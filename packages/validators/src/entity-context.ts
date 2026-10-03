import type { AppDataFile, ValidationIssue } from '@nebenkosten/schema'

const text = (value: string | null | undefined) =>
  value?.trim() ? value.trim() : undefined

const euro = (cents: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  )

function buildingName(
  data: AppDataFile,
  buildingId: string | null | undefined,
) {
  return data.masterData.buildings.find(({ id }) => id === buildingId)?.name
}

function circuitBuilding(data: AppDataFile, circuitId: string) {
  const circuit = data.billingData.heatingCircuits.find(
    ({ id }) => id === circuitId,
  )
  return circuit ? buildingName(data, circuit.buildingId) : undefined
}

function sourceLabel(data: AppDataFile, sourceId: string) {
  const source = data.billingData.energySources.find(
    ({ id }) => id === sourceId,
  )
  if (!source) return undefined
  const name = source.name ?? source.sourceType ?? source.key
  const building = circuitBuilding(data, source.heatingCircuitId)
  return building ? `${name} (${building})` : name
}

/**
 * Human-readable location of a finding ("Betrifft: …") so a warning names
 * the circuit, meter or receipt it concerns. Returns undefined when the entity
 * carries no useful description.
 */
export function describeEntity(
  data: AppDataFile,
  entity: ValidationIssue['entity'],
): string | undefined {
  if (!entity) return undefined
  switch (entity.type) {
    case 'HeatingCircuit': {
      const building = circuitBuilding(data, entity.id)
      return building ? `Heizkreis ${building}` : undefined
    }
    case 'EnergySource':
      return sourceLabel(data, entity.id)
    case 'FuelDelivery': {
      const delivery = data.billingData.fuelDeliveries.find(
        ({ id }) => id === entity.id,
      )
      if (!delivery) return undefined
      return [
        delivery.date ? `Lieferung vom ${delivery.date}` : 'Lieferung',
        delivery.amountCents != null ? euro(delivery.amountCents) : undefined,
        delivery.description ?? undefined,
        sourceLabel(data, delivery.energySourceId),
      ]
        .filter(Boolean)
        .join(' · ')
    }
    case 'Meter': {
      const meter = data.masterData.meters.find(({ id }) => id === entity.id)
      if (!meter) return undefined
      return `Zähler ${text(meter.meterNumber) ?? text(meter.address) ?? 'ohne Nummer'}${
        text(meter.provider) ? ` (${text(meter.provider)})` : ''
      }`
    }
    case 'Property': {
      const property = data.masterData.properties.find(
        ({ id }) => id === entity.id,
      )
      const name =
        text(property?.address?.street) ?? text(property?.internalNumber)
      return name ? `Objekt ${name}` : undefined
    }
    case 'CostCategory':
      return data.billingData.costCategories.find(({ id }) => id === entity.id)
        ?.label
    case 'CostEntry': {
      const entry = data.billingData.costEntries.find(
        ({ id }) => id === entity.id,
      )
      if (!entry) return undefined
      return [entry.date, euro(entry.amountCents), entry.description]
        .filter(Boolean)
        .join(' · ')
    }
    case 'Unit': {
      const unit = data.masterData.units.find(({ id }) => id === entity.id)
      return unit
        ? `Wohnung ${unit.label ?? unit.location ?? 'ohne Bezeichnung'}`
        : undefined
    }
    default:
      return undefined
  }
}

export function withEntityContext(
  data: AppDataFile,
  issues: ValidationIssue[],
): ValidationIssue[] {
  return issues.map((item) => {
    if (item.detail) return item
    const context = describeEntity(data, item.entity)
    return context ? { ...item, detail: `Betrifft: ${context}` } : item
  })
}
