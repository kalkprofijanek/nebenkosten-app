import type {
  CircuitOperatingElectricityResult,
  OperatingElectricityResult,
} from '../contracts'
import { roundCentsHalfAwayFromZero } from '../rounding'

export interface OperatingElectricityCircuitInput {
  readonly buildingId: string
  readonly intendedCentsExact: number
}

export interface OperatingElectricitySourceInput {
  readonly costCategoryId: string
  readonly availableCentsExact: number
  readonly buildingId: string | null
}

export interface OperatingElectricityPlan {
  readonly movedCentsExactByBuildingId: ReadonlyMap<string, number>
  readonly deductedCentsExactByCostCategoryId: ReadonlyMap<string, number>
  readonly publicResult: OperatingElectricityResult
  readonly circuitResultsByBuildingId: ReadonlyMap<
    string,
    CircuitOperatingElectricityResult
  >
}

interface ExactAllocation {
  readonly id: string
  readonly exactCents: number
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function requireUniqueNonNegativeInputs(
  inputs: readonly ExactAllocation[],
  kind: string,
): void {
  const ids = new Set<string>()
  for (const { id, exactCents } of inputs) {
    if (id.length === 0) {
      throw new Error(`${kind} benötigt eine nicht leere ID`)
    }
    if (ids.has(id)) {
      throw new Error(`${kind} benötigt eindeutige IDs: "${id}"`)
    }
    if (!Number.isFinite(exactCents) || exactCents < 0) {
      throw new Error(`${kind} benötigt endliche, nicht negative Centbeträge`)
    }
    ids.add(id)
  }
}

/**
 * Rundet eine Verteilung auf ein vorgegebenes Aggregat, ohne eine bereits
 * gerundete Obergrenze je Position zu überschreiten.
 */
function roundBoundedAllocations(
  allocations: readonly ExactAllocation[],
  targetCents: number,
  capacityById: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const prepared = allocations.map(({ id, exactCents }) => {
    const capacity = capacityById.get(id)
    if (capacity === undefined) {
      throw new Error(`Gerundete Obergrenze für "${id}" fehlt`)
    }
    return {
      id,
      cents: Math.min(Math.floor(exactCents), capacity),
      remainder: exactCents - Math.floor(exactCents),
      capacity: Math.min(Math.ceil(exactCents), capacity),
    }
  })
  let assigned = prepared.reduce((sum, { cents }) => sum + cents, 0)
  if (assigned > targetCents) {
    throw new Error('Gerundete Verteilung überschreitet ihr Zielaggregat')
  }

  const ranked = [...prepared].sort(
    (left, right) =>
      right.remainder - left.remainder || compareIds(left.id, right.id),
  )
  while (assigned < targetCents) {
    const recipient = ranked.find(({ cents, capacity }) => cents < capacity)
    if (!recipient) {
      throw new Error('Gerundete Verteilung konnte nicht ausgeglichen werden')
    }
    recipient.cents += 1
    assigned += 1
  }

  return new Map(prepared.map(({ id, cents }) => [id, cents]))
}

function roundedCapacities(
  allocations: readonly ExactAllocation[],
): ReadonlyMap<string, number> {
  const target = roundCentsHalfAwayFromZero(
    allocations.reduce((sum, { exactCents }) => sum + exactCents, 0),
  )
  const unlimited = new Map(
    allocations.map(({ id }) => [id, Number.MAX_SAFE_INTEGER]),
  )
  return roundBoundedAllocations(allocations, target, unlimited)
}

/**
 * Plant die kostenneutrale Umbuchung des Heizungs-Betriebsstroms.
 *
 * Gebäudebezogene Quellen bedienen ausschließlich den eigenen Heizkreis und
 * haben Vorrang. Das anschließend noch verfügbare globale Budget wird
 * proportional zu den verbleibenden Sollbeträgen aufgeteilt.
 */
export function calculateOperatingElectricityPlan(
  circuits: readonly OperatingElectricityCircuitInput[],
  sources: readonly OperatingElectricitySourceInput[],
): OperatingElectricityPlan {
  const circuitAllocations = circuits.map(
    ({ buildingId, intendedCentsExact }) => ({
      id: buildingId,
      exactCents: intendedCentsExact,
    }),
  )
  const sourceAllocations = sources.map(
    ({ costCategoryId, availableCentsExact }) => ({
      id: costCategoryId,
      exactCents: availableCentsExact,
    }),
  )
  requireUniqueNonNegativeInputs(circuitAllocations, 'Betriebsstrom-Heizkreis')
  requireUniqueNonNegativeInputs(sourceAllocations, 'Betriebsstrom-Quelle')
  if (sources.some(({ buildingId }) => buildingId === '')) {
    throw new Error(
      'Gebäudebezogene Betriebsstrom-Quellen benötigen eine nicht leere Gebäude-ID',
    )
  }

  const sortedCircuits = [...circuits].sort((left, right) =>
    compareIds(left.buildingId, right.buildingId),
  )
  const sortedSources = [...sources].sort((left, right) =>
    compareIds(left.costCategoryId, right.costCategoryId),
  )
  const remainingByBuildingId = new Map(
    sortedCircuits.map(({ buildingId, intendedCentsExact }) => [
      buildingId,
      intendedCentsExact,
    ]),
  )
  const movedByBuildingId = new Map(
    sortedCircuits.map(({ buildingId }) => [buildingId, 0]),
  )
  const deductedBySourceId = new Map(
    sortedSources.map(({ costCategoryId }) => [costCategoryId, 0]),
  )

  for (const source of sortedSources.filter(
    ({ buildingId }) => buildingId !== null,
  )) {
    const buildingId = source.buildingId as string
    const remaining = remainingByBuildingId.get(buildingId)
    if (remaining === undefined) continue
    const moved = Math.min(remaining, source.availableCentsExact)
    remainingByBuildingId.set(buildingId, remaining - moved)
    movedByBuildingId.set(
      buildingId,
      (movedByBuildingId.get(buildingId) ?? 0) + moved,
    )
    deductedBySourceId.set(source.costCategoryId, moved)
  }

  const globalSources = sortedSources.filter(
    ({ buildingId }) => buildingId === null,
  )
  const globalBudget = globalSources.reduce(
    (sum, { availableCentsExact }) => sum + availableCentsExact,
    0,
  )
  const totalRemaining = [...remainingByBuildingId.values()].reduce(
    (sum, value) => sum + value,
    0,
  )
  const globalMoved = Math.min(globalBudget, totalRemaining)

  if (globalMoved > 0 && totalRemaining > 0) {
    for (const circuit of sortedCircuits) {
      const remaining = remainingByBuildingId.get(circuit.buildingId) ?? 0
      const moved = (globalMoved * remaining) / totalRemaining
      movedByBuildingId.set(
        circuit.buildingId,
        (movedByBuildingId.get(circuit.buildingId) ?? 0) + moved,
      )
      remainingByBuildingId.set(circuit.buildingId, remaining - moved)
    }

    let budgetToDeduct = globalMoved
    for (const source of globalSources) {
      const deducted = Math.min(source.availableCentsExact, budgetToDeduct)
      deductedBySourceId.set(source.costCategoryId, deducted)
      budgetToDeduct -= deducted
    }
  }

  const intendedTotalExact = circuitAllocations.reduce(
    (sum, { exactCents }) => sum + exactCents,
    0,
  )
  const movedTotalExact = [...movedByBuildingId.values()].reduce(
    (sum, value) => sum + value,
    0,
  )
  const intendedCents = roundCentsHalfAwayFromZero(intendedTotalExact)
  const movedCents = roundCentsHalfAwayFromZero(movedTotalExact)
  const sourceBudgetCents = roundCentsHalfAwayFromZero(
    sourceAllocations.reduce((sum, { exactCents }) => sum + exactCents, 0),
  )

  const intendedRounded = roundedCapacities(circuitAllocations)
  const movedRounded = roundBoundedAllocations(
    sortedCircuits.map(({ buildingId }) => ({
      id: buildingId,
      exactCents: movedByBuildingId.get(buildingId) ?? 0,
    })),
    movedCents,
    intendedRounded,
  )
  const sourceAvailableRounded = roundedCapacities(sourceAllocations)
  const sourceDeductedRounded = roundBoundedAllocations(
    sortedSources.map(({ costCategoryId }) => ({
      id: costCategoryId,
      exactCents: deductedBySourceId.get(costCategoryId) ?? 0,
    })),
    movedCents,
    sourceAvailableRounded,
  )

  const circuitResultsByBuildingId = new Map(
    sortedCircuits.map(({ buildingId }) => {
      const intended = intendedRounded.get(buildingId) ?? 0
      const moved = movedRounded.get(buildingId) ?? 0
      return [
        buildingId,
        {
          intendedCents: intended,
          movedCents: moved,
          uncoveredCents: intended - moved,
        },
      ]
    }),
  )
  const publicResult: OperatingElectricityResult = {
    sourceBudgetCents,
    intendedCents,
    movedCents,
    uncoveredCents: intendedCents - movedCents,
    sources: sortedSources.map(({ costCategoryId }) => ({
      costCategoryId,
      availableCents: sourceAvailableRounded.get(costCategoryId) ?? 0,
      deductedCents: sourceDeductedRounded.get(costCategoryId) ?? 0,
    })),
  }

  return {
    movedCentsExactByBuildingId: new Map(movedByBuildingId),
    deductedCentsExactByCostCategoryId: new Map(deductedBySourceId),
    publicResult,
    circuitResultsByBuildingId,
  }
}
