/**
 * Neutrale Ladeschicht der Characterization-Fixtures (PR 05).
 *
 * Dieses Modul registriert **keine** Tests. Es lädt `scenarios.json` und
 * `goldens.json`, validiert beide **zur Laufzeit** (nicht nur als
 * TypeScript-Typ) und stellt Szenarien, Golden-Werte und die gepaarten
 * Fälle bereit. Sowohl der Characterization-Test (PR 05) als auch die
 * Core-Engine (PR 06) importieren ausschließlich von hier — so werden beim
 * Import keine `it.todo`-Fälle als Nebenwirkung registriert.
 */
import { readFileSync } from 'node:fs'
import type {
  Golden,
  GoldenCircuit,
  GoldenTenant,
  Scenario,
  ScenarioFile,
} from './types'

class GoldenValidationError extends Error {}

function fail(path: string, reason: string): never {
  throw new GoldenValidationError(`${path}: ${reason}`)
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    fail(path, 'muss ein Objekt sein')
  return value as Record<string, unknown>
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'muss ein Array sein')
  return value
}

function requireInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    fail(path, 'muss eine ganze Zahl (safe integer) sein')
  return value
}

function requireFiniteNonNegative(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    fail(path, 'muss eine endliche Zahl >= 0 sein')
  return value
}

function requirePercent(value: unknown, path: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  )
    fail(path, 'muss eine Zahl in [0, 100] sein')
  return value
}

/** Inklusive Tagesanzahl zwischen zwei ISO-Datumsangaben (UTC, DST-sicher). */
function inclusiveDays(fromIso: string, toIso: string, path: string): number {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from)
    fail(path, `ungültiger Zeitraum ${fromIso}..${toIso}`)
  return Math.round((to - from) / 86_400_000) + 1
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0)
    fail(path, 'muss ein nicht-leerer String sein')
  return value
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'muss ein Boolean sein')
  return value
}

function requireKnownKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(object))
    if (!allowed.includes(key)) fail(`${path}.${key}`, 'unbekanntes Feld')
}

const TENANT_STATUS = new Set(['gruen', 'gelb', 'rot'])

function validateCircuit(raw: unknown, path: string): GoldenCircuit {
  const object = requireObject(raw, path)
  const intFields = [
    'heatingTotalCents',
    'baseCents',
    'consumptionCents',
    'fuelConsumptionCents',
    'hotWaterCents',
    'co2CostCents',
    'co2TenantCents',
    'co2LandlordCents',
  ] as const
  const nonNegFields = [
    'co2IntensityKgPerSqmYear',
    'co2Kg',
    'energyKwh',
  ] as const
  requireKnownKeys(
    object,
    ['buildingId', 'co2TenantPercent', ...intFields, ...nonNegFields],
    path,
  )
  const circuit = {
    buildingId: requireString(object.buildingId, `${path}.buildingId`),
    co2TenantPercent: requirePercent(
      object.co2TenantPercent,
      `${path}.co2TenantPercent`,
    ),
  } as Record<string, unknown>
  for (const field of intFields)
    circuit[field] = requireInt(object[field], `${path}.${field}`)
  for (const field of nonNegFields)
    circuit[field] = requireFiniteNonNegative(object[field], `${path}.${field}`)
  return circuit as unknown as GoldenCircuit
}

function validateTenant(raw: unknown, path: string): GoldenTenant {
  const object = requireObject(raw, path)
  requireKnownKeys(
    object,
    [
      'id',
      'isVacancy',
      'shareCents',
      'prepaymentCents',
      'balanceCents',
      'status',
    ],
    path,
  )
  const status = requireString(object.status, `${path}.status`)
  if (!TENANT_STATUS.has(status))
    fail(`${path}.status`, 'muss gruen | gelb | rot sein')
  return {
    id: requireString(object.id, `${path}.id`),
    isVacancy: requireBoolean(object.isVacancy, `${path}.isVacancy`),
    shareCents: requireInt(object.shareCents, `${path}.shareCents`),
    prepaymentCents: requireInt(
      object.prepaymentCents,
      `${path}.prepaymentCents`,
    ),
    balanceCents: requireInt(object.balanceCents, `${path}.balanceCents`),
    status: status as GoldenTenant['status'],
  }
}

function validateGolden(raw: unknown, index: number): Golden {
  const path = `goldens[${index}]`
  const object = requireObject(raw, path)
  requireKnownKeys(
    object,
    [
      'id',
      'periodDays',
      'totals',
      'heating',
      'co2',
      'vacancyLandlordCents',
      'tenants',
    ],
    path,
  )

  const totalsRaw = requireObject(object.totals, `${path}.totals`)
  const totalsFields = [
    'recordedCostsCents',
    'tenantTotalCents',
    'landlordTotalCents',
    'unallocatedCents',
    'prepaymentsCents',
    'controlDifferenceCents',
    'directCostsCents',
    'internalCostsCents',
  ] as const
  requireKnownKeys(totalsRaw, totalsFields, `${path}.totals`)
  const totals = Object.fromEntries(
    totalsFields.map((field) => [
      field,
      requireInt(totalsRaw[field], `${path}.totals.${field}`),
    ]),
  ) as unknown as Golden['totals']

  const heatingRaw = requireObject(object.heating, `${path}.heating`)
  const heatingIntFields = [
    'totalCents',
    'baseCostsCents',
    'consumptionCostsCents',
    'fuelConsumptionCents',
    'unallocatedLandlordCents',
  ] as const
  requireKnownKeys(
    heatingRaw,
    [...heatingIntFields, 'perCircuit'],
    `${path}.heating`,
  )
  const perCircuit = requireArray(
    heatingRaw.perCircuit,
    `${path}.heating.perCircuit`,
  ).map((entry, circuitIndex) =>
    validateCircuit(entry, `${path}.heating.perCircuit[${circuitIndex}]`),
  )
  const heating = {
    ...Object.fromEntries(
      heatingIntFields.map((field) => [
        field,
        requireInt(heatingRaw[field], `${path}.heating.${field}`),
      ]),
    ),
    perCircuit,
  } as unknown as Golden['heating']

  const co2Raw = requireObject(object.co2, `${path}.co2`)
  const co2Fields = ['totalCostCents', 'tenantCents', 'landlordCents'] as const
  requireKnownKeys(co2Raw, co2Fields, `${path}.co2`)
  const co2 = Object.fromEntries(
    co2Fields.map((field) => [
      field,
      requireInt(co2Raw[field], `${path}.co2.${field}`),
    ]),
  ) as unknown as Golden['co2']

  const tenants = requireArray(object.tenants, `${path}.tenants`).map(
    (entry, tenantIndex) =>
      validateTenant(entry, `${path}.tenants[${tenantIndex}]`),
  )

  return {
    id: requireString(object.id, `${path}.id`),
    periodDays: requireInt(object.periodDays, `${path}.periodDays`),
    totals,
    heating,
    co2,
    vacancyLandlordCents: requireInt(
      object.vacancyLandlordCents,
      `${path}.vacancyLandlordCents`,
    ),
    tenants,
  }
}

function loadJson<T>(fileName: string): T {
  return JSON.parse(
    readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8'),
  ) as T
}

const scenarioFile = loadJson<ScenarioFile>('scenarios.json')
export const scenarios: readonly Scenario[] = scenarioFile.scenarios

export const goldens: readonly Golden[] = loadJson<unknown[]>(
  'goldens.json',
).map((raw, index) => validateGolden(raw, index))

export const goldenById: ReadonlyMap<string, Golden> = new Map(
  goldens.map((golden) => [golden.id, golden]),
)

// Kreuzprüfung beim Laden: `periodDays` jeder Golden-Zeile muss der
// inklusiven Tagesdifferenz aus `scenario.from`/`scenario.to` entsprechen —
// ein falscher Wert (z. B. 999) fällt so beim Import auf, obwohl kein Test
// das Feld direkt vergleicht.
for (const scenario of scenarios) {
  const golden = goldenById.get(scenario.id)
  if (!golden)
    fail(`scenario ${scenario.id}`, 'kein zugehöriger Golden-Datensatz')
  const expected = inclusiveDays(
    scenario.from,
    scenario.to,
    `scenario ${scenario.id} Zeitraum`,
  )
  if (golden.periodDays !== expected)
    fail(
      `goldens[${scenario.id}].periodDays`,
      `muss ${expected} sein (inklusive ${scenario.from}..${scenario.to}), war ${golden.periodDays}`,
    )
}

/**
 * Gepaarte Fälle für PR 06. Die Core-Engine importiert dies, um ihr
 * vollständiges Ergebnis (nicht nur `totals`) gegen die Golden-Werte zu
 * validieren.
 */
export function characterizationCases(): {
  scenario: Scenario
  golden: Golden
}[] {
  return scenarios.map((scenario) => {
    const golden = goldenById.get(scenario.id)
    if (!golden)
      fail(`scenario ${scenario.id}`, 'kein zugehöriger Golden-Datensatz')
    return { scenario, golden }
  })
}
