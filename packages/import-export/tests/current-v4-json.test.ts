import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import {
  CurrentAppDataCodecError,
  MAX_CURRENT_APP_DATA_BYTES,
  decodeCurrentAppDataBytes,
  encodeCurrentAppData,
} from '../src'

const SAVED_AT = '2026-07-19T10:11:12.345Z'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const bytes = (text: string): Uint8Array => encoder.encode(text)

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(value))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function expectCodecError(
  action: () => unknown | Promise<unknown>,
  code:
    | 'invalid_data'
    | 'not_json_safe'
    | 'invalid_json'
    | 'invalid_utf8'
    | 'source_too_large'
    | 'unsupported_schema_version'
    | 'newer_schema_version'
    | 'hash_failed',
): Promise<CurrentAppDataCodecError> {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(CurrentAppDataCodecError)
    expect(error).toMatchObject({ code })
    return error as CurrentAppDataCodecError
  }
  throw new Error(`Expected CurrentAppDataCodecError with code ${code}`)
}

function emptyFile(): AppDataFile {
  const data = createEmptyAppDataFile()
  data.meta.appVersion = 'Fabel-ÄÖ'
  return data
}

function withUnsafeValue(
  install: (data: Record<PropertyKey, unknown>) => void,
): AppDataFile {
  const data = emptyFile() as unknown as Record<PropertyKey, unknown>
  install(data)
  return data as unknown as AppDataFile
}

describe('current v4 canonical JSON codec', () => {
  it('exports the fixed 25 MiB current-file limit', () => {
    expect(MAX_CURRENT_APP_DATA_BYTES).toBe(25 * 1024 * 1024)
  })

  it('encodes deterministic canonical UTF-8 JSON without BOM', async () => {
    const result = await encodeCurrentAppData(emptyFile(), {
      savedAt: SAVED_AT,
    })
    const expected = `{
  "billingData": {
    "auditEvents": [],
    "bankBookings": [],
    "billingPeriods": [],
    "calculationResults": [],
    "calculationRuns": [],
    "costCategories": [],
    "costEntries": [],
    "documents": [],
    "energySources": [],
    "fuelDeliveries": [],
    "fuelStocks": [],
    "heatingCircuits": [],
    "meterBillingStatuses": [],
    "meterReadings": [],
    "occupancyPeriods": [],
    "prepayments": []
  },
  "masterData": {
    "allocationRules": [],
    "buildings": [],
    "heatingSystems": [],
    "meters": [],
    "organizations": [],
    "ownerCompanies": [],
    "persons": [],
    "properties": [],
    "tenancies": [],
    "units": []
  },
  "meta": {
    "appVersion": "Fabel-ÄÖ",
    "savedAt": "2026-07-19T10:11:12.345Z"
  },
  "schemaVersion": 4
}
`

    expect(decoder.decode(result.bytes)).toBe(expected)
    expect(result.bytes).toEqual(bytes(expected))
    expect(result.bytes.slice(0, 3)).not.toEqual(
      new Uint8Array([0xef, 0xbb, 0xbf]),
    )
    expect(result.savedAt).toBe(SAVED_AT)
    expect(result.data.meta.savedAt).toBe(SAVED_AT)
  })

  it('is independent of object insertion order', async () => {
    const normal = emptyFile()
    const reversed = {
      schemaVersion: normal.schemaVersion,
      meta: Object.fromEntries(Object.entries(normal.meta).reverse()),
      masterData: Object.fromEntries(
        Object.entries(normal.masterData).reverse(),
      ),
      billingData: Object.fromEntries(
        Object.entries(normal.billingData).reverse(),
      ),
    } as AppDataFile
    const first = await encodeCurrentAppData(normal, { savedAt: SAVED_AT })
    const second = await encodeCurrentAppData(reversed, { savedAt: SAVED_AT })

    expect(second.bytes).toEqual(first.bytes)
    expect(second.revision).toBe(first.revision)
  })

  it('hashes the exact canonical bytes as lowercase SHA-256', async () => {
    const result = await encodeCurrentAppData(emptyFile(), {
      savedAt: new Date(SAVED_AT),
    })

    expect(result.revision).toMatch(/^[0-9a-f]{64}$/)
    expect(result.revision).toBe(await sha256Hex(result.bytes))
  })

  it('round-trips v4 while preserving null and missing fields', async () => {
    const data = emptyFile()
    delete data.meta.appVersion
    data.meta.migratedFrom = null
    const encoded = await encodeCurrentAppData(data, { savedAt: SAVED_AT })
    const decoded = await decodeCurrentAppDataBytes(encoded.bytes)

    expect(decoded.data).toEqual(encoded.data)
    expect(decoded.data.meta.migratedFrom).toBeNull()
    expect('appVersion' in decoded.data.meta).toBe(false)
    expect(decoded.revision).toBe(encoded.revision)
    expect(decoded.bytes).toEqual(encoded.bytes)
  })

  it('updates savedAt only on a defensive copy', async () => {
    const data = emptyFile()
    data.meta.savedAt = '2025-01-02T03:04:05.000Z'
    const before = structuredClone(data)
    const result = await encodeCurrentAppData(data, {
      savedAt: new Date(SAVED_AT),
    })

    expect(data).toEqual(before)
    expect(result.data).not.toBe(data)
    expect(result.data.meta).not.toBe(data.meta)
    expect(result.data.meta.savedAt).toBe(SAVED_AT)
  })

  it('takes a defensive byte copy before asynchronous work', async () => {
    const encoded = await encodeCurrentAppData(emptyFile(), {
      savedAt: SAVED_AT,
    })
    const originalBytes = encoded.bytes.slice()
    const callerBytes = encoded.bytes.slice()
    const pending = decodeCurrentAppDataBytes(callerBytes)
    callerBytes.fill(0x78)
    const decoded = await pending

    expect(decoded.data).toEqual(encoded.data)
    expect(decoded.bytes).toEqual(originalBytes)
    expect(decoded.bytes).not.toBe(callerBytes)
    expect(decoded.revision).toBe(await sha256Hex(originalBytes))
  })

  it('does not let later caller mutations rewrite encoded results', async () => {
    const data = emptyFile()
    data.billingData.auditEvents.push({
      id: '44444444-4444-4444-8444-444444444444',
      billingPeriodId: null,
      timestamp: SAVED_AT,
      action: 'Fiktiver Testeintrag',
      details: { nested: { value: 'vorher' } },
      legacyUnmapped: null,
    })
    const result = await encodeCurrentAppData(data, { savedAt: SAVED_AT })
    const originalBytes = result.bytes.slice()
    data.meta.appVersion = 'nachträglich verändert'
    ;(
      data.billingData.auditEvents[0]!.details as {
        nested: { value: string }
      }
    ).nested.value = 'nachher'

    expect(result.data.meta.appVersion).toBe('Fabel-ÄÖ')
    expect(result.data.billingData.auditEvents[0]!.details).toEqual({
      nested: { value: 'vorher' },
    })
    expect(result.bytes).toEqual(originalBytes)
  })
})

describe('current v4 validation and version protection', () => {
  it('strictly rejects invalid v4 data on encode and decode', async () => {
    const data = withUnsafeValue((root) => {
      root.unknownRootField = 'fiktiver Wert'
    })
    await expectCodecError(
      () => encodeCurrentAppData(data, { savedAt: SAVED_AT }),
      'invalid_data',
    )

    const parsed = createEmptyAppDataFile() as unknown as Record<
      string,
      unknown
    >
    parsed.unknownRootField = 'fiktiver Wert'
    await expectCodecError(
      () => decodeCurrentAppDataBytes(bytes(JSON.stringify(parsed))),
      'invalid_data',
    )
  })

  it('routes legacy v3 to its explicit importer', async () => {
    const error = await expectCodecError(
      () =>
        decodeCurrentAppDataBytes(
          bytes(JSON.stringify({ version: 3, firmen: [] })),
        ),
      'unsupported_schema_version',
    )
    expect(error.schemaVersion).toBe(3)
  })

  it.each([
    ['older', { schemaVersion: 2 }, 2],
    ['missing', { fictional: true }, undefined],
    ['non-numeric', { schemaVersion: 'vier' }, undefined],
  ])(
    'rejects %s schema versions explicitly',
    async (_label, value, version) => {
      const error = await expectCodecError(
        () => decodeCurrentAppDataBytes(bytes(JSON.stringify(value))),
        'unsupported_schema_version',
      )
      expect(error.schemaVersion).toBe(version)
    },
  )

  it('blocks newer versions and exposes only their safe number', async () => {
    const error = await expectCodecError(
      () =>
        decodeCurrentAppDataBytes(
          bytes(
            JSON.stringify({
              schemaVersion: 5,
              privateNote: 'FIKTIVE-GEHEIMMARKER-NEUER',
            }),
          ),
        ),
      'newer_schema_version',
    )

    expect(error.schemaVersion).toBe(5)
    expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain(
      'FIKTIVE-GEHEIMMARKER-NEUER',
    )
  })
})

describe('current v4 JSON-safety boundary', () => {
  const unsafeCases: Array<
    [string, (data: Record<PropertyKey, unknown>) => void]
  > = [
    ['undefined object values', (data) => (data.unsafe = undefined)],
    ['undefined array values', (data) => (data.unsafe = [undefined])],
    ['NaN', (data) => (data.unsafe = Number.NaN)],
    ['positive Infinity', (data) => (data.unsafe = Number.POSITIVE_INFINITY)],
    ['negative Infinity', (data) => (data.unsafe = Number.NEGATIVE_INFINITY)],
    ['negative zero', (data) => (data.unsafe = -0)],
    ['BigInt', (data) => (data.unsafe = 1n)],
    ['functions', (data) => (data.unsafe = () => 'fiktiv')],
    ['symbol values', (data) => (data.unsafe = Symbol('fiktiv'))],
    ['symbol keys', (data) => (data[Symbol('fiktiver-schlüssel')] = true)],
    [
      'cycles',
      (data) => {
        data.unsafe = data
      },
    ],
    ['sparse arrays', (data) => (data.unsafe = Array(2))],
    ['Date instances', (data) => (data.unsafe = new Date(SAVED_AT))],
    ['null-prototype objects', (data) => (data.unsafe = Object.create(null))],
    [
      'custom-prototype objects',
      (data) => (data.unsafe = Object.create({ fictionalPrototype: true })),
    ],
  ]

  it.each(unsafeCases)(
    'rejects %s before JSON changes it',
    async (_name, install) => {
      await expectCodecError(
        () =>
          encodeCurrentAppData(withUnsafeValue(install), { savedAt: SAVED_AT }),
        'not_json_safe',
      )
    },
  )

  it('rejects accessors without invoking them', async () => {
    let reads = 0
    const data = emptyFile()
    Object.defineProperty(data.meta, 'appVersion', {
      enumerable: true,
      get() {
        reads += 1
        throw new Error('FIKTIVE-GEHEIMMARKER-ACCESSOR')
      },
    })
    const error = await expectCodecError(
      () => encodeCurrentAppData(data, { savedAt: SAVED_AT }),
      'not_json_safe',
    )

    expect(reads).toBe(0)
    expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain(
      'FIKTIVE-GEHEIMMARKER-ACCESSOR',
    )
  })

  it('turns excessive nesting into a typed, redacted boundary error', async () => {
    const data = emptyFile() as unknown as Record<string, unknown>
    let cursor: Record<string, unknown> = {}
    data.unsafe = cursor
    for (let depth = 0; depth < 20_000; depth += 1) {
      const next: Record<string, unknown> = {}
      cursor.next = next
      cursor = next
    }

    await expectCodecError(
      () =>
        encodeCurrentAppData(data as unknown as AppDataFile, {
          savedAt: SAVED_AT,
        }),
      'not_json_safe',
    )
  })
})

describe('current v4 hostile bytes and size limits', () => {
  it('rejects invalid UTF-8 without replacement decoding', async () => {
    await expectCodecError(
      () =>
        decodeCurrentAppDataBytes(
          new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
        ),
      'invalid_utf8',
    )
  })

  it('rejects malformed JSON with a redacted stable error', async () => {
    const marker = 'FIKTIVE-GEHEIMMARKER-JSON'
    const error = await expectCodecError(
      () => decodeCurrentAppDataBytes(bytes(`{"private":"${marker}",`)),
      'invalid_json',
    )
    const publicError = `${String(error)} ${JSON.stringify(error)}`
    expect(publicError).not.toContain(marker)
    expect(publicError).not.toContain('Unexpected')
    expect(error.cause).toBeUndefined()
  })

  it('checks the default limit before decoding or parsing', async () => {
    const oversizedInvalidUtf8 = new Uint8Array(MAX_CURRENT_APP_DATA_BYTES + 1)
    oversizedInvalidUtf8.fill(0xff)
    await expectCodecError(
      () => decodeCurrentAppDataBytes(oversizedInvalidUtf8),
      'source_too_large',
    )
  })

  it('applies an exact inclusive custom limit on decode', async () => {
    const encoded = await encodeCurrentAppData(emptyFile(), {
      savedAt: SAVED_AT,
    })
    await expect(
      decodeCurrentAppDataBytes(encoded.bytes, {
        maxBytes: encoded.bytes.byteLength,
      }),
    ).resolves.toMatchObject({ data: encoded.data })
    await expectCodecError(
      () =>
        decodeCurrentAppDataBytes(encoded.bytes, {
          maxBytes: encoded.bytes.byteLength - 1,
        }),
      'source_too_large',
    )
  })

  it('applies the same exact inclusive custom limit on encode', async () => {
    const baseline = await encodeCurrentAppData(emptyFile(), {
      savedAt: SAVED_AT,
    })
    await expect(
      encodeCurrentAppData(emptyFile(), {
        savedAt: SAVED_AT,
        maxBytes: baseline.bytes.byteLength,
      }),
    ).resolves.toMatchObject({ revision: baseline.revision })
    await expectCodecError(
      () =>
        encodeCurrentAppData(emptyFile(), {
          savedAt: SAVED_AT,
          maxBytes: baseline.bytes.byteLength - 1,
        }),
      'source_too_large',
    )
  })
})
