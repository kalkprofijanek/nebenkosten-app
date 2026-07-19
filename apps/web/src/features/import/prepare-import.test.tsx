import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  MAX_IMPORT_BYTES,
  prepareImport,
  type ImportFailureCode,
} from './prepare-import'

const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value))

describe('prepareImport', () => {
  it('bereitet einen aktuellen v4-Bestand vor, ohne ihn zu speichern', async () => {
    const source = createEmptyAppDataFile()
    source.masterData.organizations = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Vertraulicher Testname',
      },
    ]

    const result = await prepareImport(encode(source))

    expect(result).toMatchObject({
      ok: true,
      sourceFormat: 'current-v4',
      summary: {
        organizations: 1,
        ownerCompanies: 0,
        properties: 0,
        buildings: 0,
        units: 0,
        persons: 0,
        tenancies: 0,
        billingPeriods: 0,
        costEntries: 0,
        heatingCircuits: 0,
        warnings: 0,
      },
    })
    if (!result.ok) throw new Error('Importvorschau erwartet')
    expect(result.data).toEqual(source)
    expect(Object.keys(result.summary)).toEqual([
      'organizations',
      'ownerCompanies',
      'properties',
      'buildings',
      'units',
      'persons',
      'tenancies',
      'billingPeriods',
      'costEntries',
      'heatingCircuits',
      'warnings',
    ])
  })

  it('migriert v3 nur in eine Vorschau und meldet Warnungen als Anzahl', async () => {
    const result = await prepareImport(encode({ version: 3, firmen: [] }))

    expect(result).toMatchObject({
      ok: true,
      sourceFormat: 'legacy-v3',
      summary: {
        organizations: 1,
        ownerCompanies: 0,
        warnings: 0,
      },
    })
    if (!result.ok) throw new Error('Importvorschau erwartet')
    expect(result.data.schemaVersion).toBe(4)
  })

  it('weist Dateien vor Dekodierung oberhalb von 25 MiB ab', async () => {
    const result = await prepareImport(new Uint8Array(MAX_IMPORT_BYTES + 1))

    expect(result).toEqual({ ok: false, code: 'source_too_large' })
  })

  it('weist ungültige Bytequellen an der Systemgrenze sicher ab', async () => {
    const result = await prepareImport({} as unknown as Uint8Array)

    expect(result).toEqual({ ok: false, code: 'invalid_source' })
  })

  it.each([
    [
      'ungültiges JSON',
      new TextEncoder().encode('{vertraulich'),
      'invalid_json',
    ],
    ['ungültiges UTF-8', Uint8Array.from([0xc3, 0x28]), 'invalid_utf8'],
    [
      'neuere Version',
      encode({ schemaVersion: 99, private: 'nicht ausgeben' }),
      'newer_schema_version',
    ],
    [
      'alte nicht unterstützte Version',
      encode({ version: 2, firmen: [] }),
      'unsupported_schema_version',
    ],
    [
      'strukturell defektes v4',
      encode({
        schemaVersion: 4,
        private: 'Dieser Wert darf nie in Fehlern erscheinen',
      }),
      'invalid_data',
    ],
  ] satisfies ReadonlyArray<readonly [string, Uint8Array, ImportFailureCode]>)(
    'liefert für %s nur einen sicheren Fehlercode',
    async (_, bytes, code) => {
      const result = await prepareImport(bytes)

      expect(result).toEqual({ ok: false, code })
      expect(JSON.stringify(result)).not.toContain('Dieser Wert')
      expect(JSON.stringify(result)).not.toContain('nicht ausgeben')
    },
  )

  it('arbeitet auf einer Bytekopie statt auf dem veränderbaren Aufruferpuffer', async () => {
    const source = encode(createEmptyAppDataFile())
    const pending = prepareImport(source)
    source.fill(0)

    const result = await pending

    expect(result).toMatchObject({ ok: true, sourceFormat: 'current-v4' })
  })
})
