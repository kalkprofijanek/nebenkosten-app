/**
 * Harte Ressourcenlimits für direkte und dateibasierte Legacy-v3-Importe.
 * Die Prüfung läuft vor Zod und vor der fachlichen Transformation linear
 * über ausschließlich eigene Dateneigenschaften.
 */
// Die Mapper bauen unveränderliche Ergebnisarrays auf. Diese Grenzen halten
// deren kumulative Kopierkosten auch bei absichtlich breiten Eingaben begrenzt.
export const MAX_LEGACY_COLLECTION_ITEMS = 1_000
export const MAX_LEGACY_INPUT_NODES = 10_000
export const MAX_LEGACY_INPUT_SCALARS = 50_000
export const MAX_LEGACY_INPUT_DEPTH = 64
export const MAX_LEGACY_INPUT_STRING_CHARS = 10 * 1024 * 1024

export type LegacyInputInspection =
  'ok' | 'invalid' | 'limits-exceeded' | 'reserved-key'

interface InspectionBudget {
  nodes: number
  scalars: number
  stringChars: number
  seen: WeakSet<object>
}

function inspectValue(
  value: unknown,
  depth: number,
  budget: InspectionBudget,
): LegacyInputInspection {
  if (typeof value === 'string') {
    budget.scalars += 1
    budget.stringChars += value.length
    return budget.scalars > MAX_LEGACY_INPUT_SCALARS ||
      budget.stringChars > MAX_LEGACY_INPUT_STRING_CHARS
      ? 'limits-exceeded'
      : 'ok'
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    budget.scalars += 1
    return budget.scalars > MAX_LEGACY_INPUT_SCALARS ? 'limits-exceeded' : 'ok'
  }
  if (typeof value !== 'object' || budget.seen.has(value)) return 'invalid'
  budget.nodes += 1
  if (budget.nodes > MAX_LEGACY_INPUT_NODES || depth > MAX_LEGACY_INPUT_DEPTH)
    return 'limits-exceeded'
  budget.seen.add(value)

  const isArray = Array.isArray(value)
  const expectedPrototype = isArray ? Array.prototype : Object.prototype
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== expectedPrototype && prototype !== null) return 'invalid'

  if (isArray) {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (
      !lengthDescriptor ||
      !('value' in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    )
      return 'invalid'
    if (lengthDescriptor.value > MAX_LEGACY_COLLECTION_ITEMS)
      return 'limits-exceeded'
  }

  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length' && isArray) continue
    if (typeof key !== 'string') return 'invalid'
    if (key === '__proto__') return 'reserved-key'
    budget.stringChars += key.length
    if (budget.stringChars > MAX_LEGACY_INPUT_STRING_CHARS)
      return 'limits-exceeded'
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) return 'invalid'
    const childResult = inspectValue(descriptor.value, depth + 1, budget)
    if (childResult !== 'ok') return childResult
  }
  return 'ok'
}

export function inspectLegacyInput(input: unknown): LegacyInputInspection {
  try {
    return inspectValue(input, 0, {
      nodes: 0,
      scalars: 0,
      stringChars: 0,
      seen: new WeakSet(),
    })
  } catch {
    return 'invalid'
  }
}
