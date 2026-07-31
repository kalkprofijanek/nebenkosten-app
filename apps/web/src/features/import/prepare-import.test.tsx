import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  MAX_IMPORT_BYTES,
  prepareImport,
  type ImportFailureCode,
} from './prepare-import'

const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value))

const importMetadata = {
  sourceFileName: 'fiktive-abrechnung.json',
  appVersion: 'pr12-test',
} as const

describe('prepareImport', () => {
  it('bereitet einen aktuellen v4-Bestand vor, ohne ihn zu speichern', async () => {
    const source = createEmptyAppDataFile()
    source.masterData.organizations = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Vertraulicher Testname',
      },
    ]

    const result = await prepareImport(encode(source), importMetadata)

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
    expect('migrationReport' in result).toBe(false)
    expect(Object.keys(result.summary)).toEqual([
      'organizations',
      'ownerCompanies',
      'properties',
      'buildings',
      'units',
      'persons',
      'tenancies',
      'billingPeriods',
      'occupancyPeriods',
      'costCategories',
      'costEntries',
      'heatingCircuits',
      'energySources',
      'bankBookings',
      'meters',
      'warnings',
    ])
  })

  it('bewahrt den vollständigen redigierten v3-Migrationsbericht', async () => {
    const result = await prepareImport(
      encode({
        version: 3,
        firmen: [
          {
            id: 'firma-fiktiv',
            name1: 'Fiktive Verwaltung',
            unbekannt: 'Rohwert',
          },
        ],
      }),
      importMetadata,
    )

    expect(result).toMatchObject({
      ok: true,
      sourceFormat: 'legacy-v3',
      summary: {
        organizations: 1,
        ownerCompanies: 1,
        warnings: 0,
      },
    })
    if (!result.ok) throw new Error('Importvorschau erwartet')
    expect(result.data.schemaVersion).toBe(4)
    if (result.sourceFormat !== 'legacy-v3')
      throw new Error('Legacy-Migrationsbericht erwartet')
    expect(result.migrationReport).toMatchObject({
      sourceFileName: importMetadata.sourceFileName,
      sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      detectedSchemaVersion: 3,
      targetSchemaVersion: 4,
      appVersion: importMetadata.appVersion,
      counts: {
        ownerCompanies: 1,
        properties: 0,
        billingPeriods: 0,
        occupancyPeriods: 0,
        costCategories: 0,
        costEntries: 0,
        heatingCircuits: 0,
        energySources: 0,
        bankBookings: 0,
        meters: 0,
        warnings: 0,
      },
      issues: expect.any(Array),
      changedFields: expect.any(Array),
      droppedFields: expect.any(Array),
      unmappedFields: ['firmen[0].<unknown-field>'],
      migratedAt: expect.any(String),
    })
    expect(JSON.stringify(result.migrationReport)).not.toContain('Rohwert')
  })

  it('fasst die fachliche Plausibilitätsprüfung je migriertem Abrechnungsjahr redigiert zusammen', async () => {
    const result = await prepareImport(
      encode({
        version: 3,
        firmen: [
          {
            id: 'firma-fiktiv',
            name1: 'Fiktive Verwaltung',
            objekte: [
              {
                id: 'objekt-fiktiv',
                abrechnungen: [
                  {
                    id: 'jahr-interne-kennung',
                    jahr: 2026,
                    zeitraum: {
                      von: '2026-01-01',
                      bis: '2026-12-31',
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
      importMetadata,
    )

    expect(result).toMatchObject({
      ok: true,
      sourceFormat: 'legacy-v3',
      validationSummaries: [
        {
          reference: 'abrechnungsjahr-1',
          year: 2026,
          errorCount: expect.any(Number),
          warningCount: expect.any(Number),
          infoCount: expect.any(Number),
          canBecomeReady: false,
          issueCodes: expect.arrayContaining(['master_data.iban_missing']),
        },
      ],
    })
    if (!result.ok || result.sourceFormat !== 'legacy-v3')
      throw new Error('Legacy-Migrationsbericht erwartet')
    expect(JSON.stringify(result.validationSummaries)).not.toContain(
      'jahr-interne-kennung',
    )
  })

  it('weist Dateien vor Dekodierung oberhalb von 25 MiB ab', async () => {
    const result = await prepareImport(
      new Uint8Array(MAX_IMPORT_BYTES + 1),
      importMetadata,
    )

    expect(result).toEqual({ ok: false, code: 'source_too_large' })
  })

  it('weist ungültige Bytequellen an der Systemgrenze sicher ab', async () => {
    const result = await prepareImport(
      {} as unknown as Uint8Array,
      importMetadata,
    )

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
      const result = await prepareImport(bytes, importMetadata)

      expect(result).toEqual({ ok: false, code })
      expect(JSON.stringify(result)).not.toContain('Dieser Wert')
      expect(JSON.stringify(result)).not.toContain('nicht ausgeben')
    },
  )

  it('arbeitet auf einer Bytekopie statt auf dem veränderbaren Aufruferpuffer', async () => {
    const source = encode(createEmptyAppDataFile())
    const pending = prepareImport(source, importMetadata)
    source.fill(0)

    const result = await pending

    expect(result).toMatchObject({ ok: true, sourceFormat: 'current-v4' })
  })

  it('arbeitet auf einer Metadatenkopie statt auf dem veränderbaren Aufruferobjekt', async () => {
    const metadata = {
      sourceFileName: 'fiktiver-ursprung.json',
      appVersion: 'pr12-test',
    }
    const pending = prepareImport(encode({ version: 3, firmen: [] }), metadata)
    metadata.sourceFileName = '..\\nachtraeglich-veraendert.json'
    metadata.appVersion = 'nachtraeglich-veraendert'

    const result = await pending

    expect(result).toMatchObject({
      ok: true,
      sourceFormat: 'legacy-v3',
      migrationReport: {
        sourceFileName: 'fiktiver-ursprung.json',
        appVersion: 'pr12-test',
      },
    })
  })

  it('weist unsichere Herkunftsmetadaten ohne Rohwert im Ergebnis ab', async () => {
    const result = await prepareImport(encode({ version: 3, firmen: [] }), {
      sourceFileName: '..\\vertraulich.json',
      appVersion: 'pr12-test',
    })

    expect(result).toEqual({ ok: false, code: 'invalid_source' })
    expect(JSON.stringify(result)).not.toContain('vertraulich')
  })

  it.each([
    ['fehlende Metadaten', undefined],
    ['kein einfaches Objekt', Object.create(null)],
    ['fehlende App-Version', { sourceFileName: 'fiktiv.json' }],
    ['leere App-Version', { sourceFileName: 'fiktiv.json', appVersion: '' }],
    [
      'Steuerzeichen in App-Version',
      { sourceFileName: 'fiktiv.json', appVersion: 'pr12\u0000privat' },
    ],
  ])('redigiert %s an der Metadatengrenze', async (_, metadata) => {
    const result = await prepareImport(
      encode(createEmptyAppDataFile()),
      metadata as typeof importMetadata,
    )

    expect(result).toEqual({ ok: false, code: 'invalid_source' })
    expect(JSON.stringify(result)).not.toContain('privat')
  })

  it('wertet keine Metadaten-Getter aus', async () => {
    const metadata = Object.defineProperty({}, 'sourceFileName', {
      get() {
        throw new Error('vertraulicher Getter')
      },
    })

    const result = await prepareImport(
      encode(createEmptyAppDataFile()),
      metadata as typeof importMetadata,
    )

    expect(result).toEqual({ ok: false, code: 'invalid_source' })
    expect(JSON.stringify(result)).not.toContain('vertraulich')
  })
})
