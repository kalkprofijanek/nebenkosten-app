import { describe, expect, it } from 'vitest'

import { migrateV3ToCurrent } from '../src'
import {
  MigrationContext,
  pathToString,
} from '../src/migrations/legacy-v3/context'
import { deterministicUuid } from '../src/migrations/legacy-v3/ids'
import {
  inferFuelUnit,
  mapAllocationKey,
  mapBillingStatus,
  mapCostKind,
  mapQuantityUnit,
  mapScope,
  quantity,
  requiredString,
  requiredYear,
  splitEnergyReference,
} from '../src/migrations/legacy-v3/mapping'
import {
  addUnmapped,
  preserveUnknownKeys,
} from '../src/migrations/legacy-v3/unknown-fields'
import {
  numberish,
  optionalBoolean,
  optionalCents,
  optionalDate,
  optionalInteger,
  optionalNonNegative,
  optionalNumber,
  optionalPercent,
  optionalTimestamp,
} from '../src/migrations/legacy-v3/values'
import type { LegacyUnmappedEntry } from '../src/entities/shared'
import { createMinimalFictionalV3File } from './fixtures'

const HASH = 'a'.repeat(64)
const OPTIONS = {
  sourceSha256: HASH,
  sourceFileName: 'rein-fiktiv.json',
  now: () => new Date('2026-04-05T06:07:08.000Z'),
}

function setup(): {
  context: MigrationContext
  legacy: LegacyUnmappedEntry[]
} {
  return { context: new MigrationContext(OPTIONS), legacy: [] }
}

describe('Legacy-v3 Wertehilfen', () => {
  it.each([
    [undefined, undefined],
    [null, null],
    [12.5, 12.5],
    [Number.POSITIVE_INFINITY, undefined],
    [true, undefined],
    ['', null],
    [' 1.234,50 ', 1234.5],
    ['12,5', 12.5],
    ['1.234.567', 1234567],
    ['keine-zahl', undefined],
  ])('liest den fiktiven Zahlenwert %j', (input, expected) => {
    expect(numberish(input)).toBe(expected)
  })

  it('behandelt optionale Zahlen, Ganzzahlen und Warnpfade', () => {
    const { context, legacy } = setup()
    expect(
      optionalNumber(context, undefined, ['n'], ['n'], legacy),
    ).toBeUndefined()
    expect(optionalNumber(context, '7,5', ['n'], ['n'], legacy)).toBe(7.5)
    expect(optionalNumber(context, 'x', ['n'], ['n'], legacy)).toBeUndefined()
    expect(optionalInteger(context, 4, ['i'], ['i'], legacy)).toBe(4)
    expect(optionalInteger(context, null, ['i'], ['i'], legacy)).toBeNull()
    expect(optionalInteger(context, 4.25, ['i'], ['i'], legacy)).toBeUndefined()
    expect(context.issues.map(({ code }) => code)).toEqual([
      'migration.invalid_number',
      'migration.invalid_integer',
    ])
    expect(legacy).toEqual([
      { path: ['n'], value: 'x' },
      { path: ['i'], value: 4.25 },
    ])
  })

  it.each([
    [undefined, undefined],
    [null, null],
    [true, true],
    [0, false],
    [2, true],
    [' JA ', true],
    ['off', false],
    ['', false],
  ])('liest optionale Wahrheitswerte %j', (input, expected) => {
    const { context, legacy } = setup()
    expect(optionalBoolean(context, input, ['b'], ['b'], legacy)).toBe(expected)
    expect(context.issues).toHaveLength(0)
  })

  it('konserviert einen unlesbaren Wahrheitswert', () => {
    const { context, legacy } = setup()
    expect(
      optionalBoolean(context, 'vielleicht', ['b'], ['b'], legacy),
    ).toBeUndefined()
    expect(context.issues[0]?.code).toBe('migration.invalid_boolean')
    expect(legacy).toEqual([{ path: ['b'], value: 'vielleicht' }])
  })

  it('validiert Datum und Zeitstempel vollständig', () => {
    const { context, legacy } = setup()
    expect(optionalDate(context, null, ['d'], ['d'], legacy)).toBeNull()
    expect(optionalDate(context, ' ', ['d'], ['d'], legacy)).toBeNull()
    expect(optionalDate(context, '2024-02-29', ['d'], ['d'], legacy)).toBe(
      '2024-02-29',
    )
    expect(
      optionalDate(context, '29.02.2024', ['d'], ['d'], legacy),
    ).toBeUndefined()
    expect(
      optionalTimestamp(context, undefined, ['t'], ['t'], legacy),
    ).toBeUndefined()
    expect(optionalTimestamp(context, '', ['t'], ['t'], legacy)).toBeNull()
    expect(optionalTimestamp(context, 0, ['t'], ['t'], legacy)).toBe(
      '1970-01-01T00:00:00.000Z',
    )
    expect(optionalTimestamp(context, {}, ['t'], ['t'], legacy)).toBeUndefined()
    expect(context.issues.map(({ code }) => code)).toEqual([
      'migration.invalid_date',
      'migration.invalid_timestamp',
    ])
  })

  it('wandelt Centwerte, meldet Rundung und fängt den Wertebereich ab', () => {
    const { context, legacy } = setup()
    expect(optionalCents(context, null, ['a'], ['a'], legacy)).toBeNull()
    expect(optionalCents(context, 1.0049, ['a'], ['a'], legacy)).toBe(100)
    expect(
      optionalCents(context, Number.MAX_SAFE_INTEGER, ['a'], ['a'], legacy),
    ).toBeUndefined()
    // Der Wertehelfer kennt den Zielpfad nicht; der aufrufende Mapper
    // protokolliert die Transformation mit dem tatsächlichen Schema-4-Pfad.
    expect(context.changedFields).toHaveLength(0)
    expect(context.issues.map(({ code }) => code)).toContain(
      'migration.euro_cents_rounding',
    )
    expect(context.issues.map(({ code }) => code)).toContain(
      'migration.amount_out_of_range',
    )
  })

  it('begrenzt Prozentwerte und nichtnegative Zahlen', () => {
    const { context, legacy } = setup()
    expect(
      optionalPercent(context, undefined, ['p'], ['p'], legacy),
    ).toBeUndefined()
    expect(optionalPercent(context, 100, ['p'], ['p'], legacy)).toBe(100)
    expect(optionalPercent(context, 101, ['p'], ['p'], legacy)).toBeUndefined()
    expect(optionalNonNegative(context, null, ['x'], ['x'], legacy)).toBeNull()
    expect(optionalNonNegative(context, 0, ['x'], ['x'], legacy)).toBe(0)
    expect(
      optionalNonNegative(context, -1, ['x'], ['x'], legacy),
    ).toBeUndefined()
    expect(context.issues.map(({ code }) => code)).toEqual([
      'migration.invalid_percent',
      'migration.invalid_nonnegative_number',
    ])
  })
})

describe('Legacy-v3 Mappinghilfen', () => {
  it('prüft Pflichttexte und bildet Status sowie Kostenarten ab', () => {
    const { context, legacy } = setup()
    expect(requiredString(context, ' Haus ', ['name'], 'Name fehlt')).toBe(
      ' Haus ',
    )
    expect(requiredString(context, ' ', ['name'], 'Name fehlt')).toBeUndefined()
    expect(mapBillingStatus(context, null, ['status'], legacy)).toBe('DRAFT')
    expect(mapBillingStatus(context, 'abgeschlossen', ['status'], legacy)).toBe(
      'FINALIZED',
    )
    expect(mapBillingStatus(context, 'unbekannt', ['status'], legacy)).toBe(
      'DRAFT',
    )
    expect(mapCostKind(context, 'wasser', ['typ'], legacy)).toBe('water')
    expect(mapCostKind(context, undefined, ['typ'], legacy)).toBe('operating')
    expect(mapCostKind(context, 'sonstiges', ['typ'], legacy)).toBe('operating')
    expect(legacy).toEqual([
      { path: ['status'], value: 'unbekannt' },
      { path: ['typ'], value: 'sonstiges' },
    ])
  })

  it('bildet Umlageschlüssel und Geltungsbereiche ab', () => {
    const { context, legacy } = setup()
    const buildings = new Map([['B1', 'building-1']])
    expect(mapAllocationKey(context, '', ['u'], legacy)).toBe('')
    expect(mapAllocationKey(context, 'm2_nf', ['u'], legacy)).toBe(
      'usable_area',
    )
    expect(mapAllocationKey(context, 'fremd', ['u'], legacy)).toBeUndefined()
    expect(mapScope(null, buildings)).toBeNull()
    expect(mapScope(2, buildings)).toBeUndefined()
    expect(mapScope('gesamt', buildings)).toEqual({ kind: 'property' })
    expect(mapScope('B1', buildings)).toEqual({
      kind: 'building',
      buildingId: 'building-1',
    })
    expect(mapScope('Haus-West', buildings)).toEqual({
      kind: 'house',
      houseKey: 'Haus-West',
    })
  })

  it('zerlegt Energieverweise nur bei gültigem Gebäude', () => {
    const buildings = new Map([['B1', 'building-1']])
    expect(splitEnergyReference(5, buildings)).toBeUndefined()
    expect(splitEnergyReference(':quelle', buildings)).toBeUndefined()
    expect(splitEnergyReference('B1:', buildings)).toBeUndefined()
    expect(splitEnergyReference('B2:quelle', buildings)).toBeUndefined()
    expect(splitEnergyReference('B1:quelle', buildings)).toEqual({
      heatingCircuitBuildingId: 'building-1',
      energySourceKey: 'quelle',
    })
  })

  it.each([
    [' Liter ', 'l'],
    ['KWH', 'kWh'],
    ['m3', 'm3'],
    ['Stück', 'stueck'],
    [4, undefined],
    ['unbekannt', undefined],
  ])('bildet Mengeneinheit %j ab', (input, expected) => {
    expect(mapQuantityUnit(input)).toBe(expected)
  })

  it.each([
    ['Heizöl EL', 'l'],
    ['OEL', 'l'],
    ['Pellets', 'kg'],
    ['Erdgas', 'm3'],
    ['Fernwärme', 'kWh'],
    [null, undefined],
    ['Holz', undefined],
  ])('leitet Brennstoffeinheit %j ab', (input, expected) => {
    expect(inferFuelUnit(input)).toBe(expected)
  })

  it('bildet Mengen ab und konserviert Werte ohne bekannte Einheit', () => {
    const { context, legacy } = setup()
    expect(quantity(context, null, 'kg', ['m'], ['m'], legacy)).toBeNull()
    expect(quantity(context, '2,5', 'kg', ['m'], ['m'], legacy)).toEqual({
      value: 2.5,
      unit: 'kg',
    })
    expect(
      quantity(context, 3, undefined, ['m'], ['m'], legacy),
    ).toBeUndefined()
    expect(context.issues[0]?.code).toBe('migration.unknown_quantity_unit')
  })

  it.each([
    [2024, 2024],
    ['2025', 2025],
    [1899, undefined],
    [2201, undefined],
    [2024.5, undefined],
    ['x', undefined],
  ])('prüft Abrechnungsjahr %j', (input, expected) => {
    const { context } = setup()
    expect(requiredYear(context, input, ['jahr'])).toBe(expected)
    expect(context.issues).toHaveLength(expected === undefined ? 1 : 0)
  })
})

describe('Legacy-v3 IDs, Pfade und unbekannte Felder', () => {
  it('erzeugt stabile UUIDv8 mit RFC-Variante', () => {
    const first = deterministicUuid(HASH, 'firmen[0].objekte[0]')
    expect(first).toBe(deterministicUuid(HASH, 'firmen[0].objekte[0]'))
    expect(first).not.toBe(deterministicUuid(HASH, 'firmen[0].objekte[1]'))
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
  })

  it('formatiert Pfade und verhindert doppelte Berichtspfade', () => {
    const { context } = setup()
    expect(pathToString(['firmen', 2, 'name'])).toBe('firmen[2].name')
    context.unmapped(['x'])
    context.unmapped(['x'])
    context.drop(['alt'], 'nicht mehr benötigt', null)
    expect(context.unmappedFields).toEqual(['x'])
    expect(context.droppedFields[0]?.valueType).toBe('null')
  })

  it('bewahrt unbekannte eigene Datenfelder inklusive Präfix', () => {
    const { context, legacy } = setup()
    const source = Object.create(null) as Record<string, unknown>
    source.bekannt = 1
    source.neu = { test: true }
    preserveUnknownKeys(
      context,
      source,
      ['bekannt'],
      legacy,
      ['quelle'],
      ['extra'],
    )
    expect(legacy).toEqual([{ path: ['extra', 'neu'], value: { test: true } }])
    expect(context.unmappedFields).toEqual(['quelle.<unknown-field>'])
    preserveUnknownKeys(context, null, [], legacy, [])
    preserveUnknownKeys(context, [], [], legacy, [])
  })

  it('weist Symbol- und Zugriffseigenschaften ohne Getter-Ausführung zurück', () => {
    const { context, legacy } = setup()
    let accessed = false
    const getterSource = {}
    Object.defineProperty(getterSource, 'geheim', {
      enumerable: true,
      get: () => {
        accessed = true
        return 'nicht lesen'
      },
    })
    preserveUnknownKeys(context, getterSource, [], legacy, ['objekt'])
    preserveUnknownKeys(context, { [Symbol('x')]: 1 }, [], legacy, ['objekt'])
    expect(accessed).toBe(false)
    expect(context.issues.map(({ code }) => code)).toEqual([
      'migration.exotic_object',
      'migration.exotic_object',
    ])
  })

  it('weist nicht JSON-sicher konservierbare Werte kontrolliert zurück', () => {
    const { context, legacy } = setup()
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    addUnmapped(context, legacy, ['zyklus'], ['quelle', 'zyklus'], cyclic)
    expect(legacy).toEqual([])
    expect(context.issues[0]?.code).toBe('migration.unmappable_value')
  })
})

describe('migrateV3ToCurrent Randverträge', () => {
  it.each([
    [{ ...OPTIONS, sourceSha256: 'falsch' }, 'schema.invalid_source_hash'],
    [
      { ...OPTIONS, sourceFileName: '../privat.json' },
      'schema.invalid_source_file_name',
    ],
    [
      { ...OPTIONS, now: () => new Date(Number.NaN) },
      'schema.invalid_migration_time',
    ],
  ])('weist ungültige Optionen kontrolliert zurück', (options, code) => {
    const result = migrateV3ToCurrent(createMinimalFictionalV3File(), options)
    expect(result).toMatchObject({ ok: false, reason: 'validation_failed' })
    if (!result.ok) expect(result.issues[0]?.code).toBe(code)
  })

  it('weist bereits aktuelle und nicht erkennbare Dateien zurück', () => {
    expect(migrateV3ToCurrent({ schemaVersion: 4 }, OPTIONS)).toMatchObject({
      ok: false,
      reason: 'unsupported_schema_version',
    })
    expect(migrateV3ToCurrent({ version: 'alt' }, OPTIONS)).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
    })
  })
})
