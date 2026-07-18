import { beforeEach, describe, expect, it, vi } from 'vitest'

const { migrateV3ToCurrentMock } = vi.hoisted(() => ({
  migrateV3ToCurrentMock: vi.fn(),
}))

vi.mock('@nebenkosten/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nebenkosten/schema')>()),
  migrateV3ToCurrent: migrateV3ToCurrentMock,
}))

import {
  MAX_LEGACY_V3_IMPORT_BYTES,
  importLegacyV3Bytes,
} from '@nebenkosten/import-export'

describe('Legacy-v3-Importgrenze', () => {
  beforeEach(() => {
    migrateV3ToCurrentMock.mockReset()
  })

  it('hasht die unveränderten Original-Bytes und übergibt das geparste JSON', async () => {
    const expectedResult = {
      ok: false as const,
      reason: 'validation_failed' as const,
      issues: [],
    }
    migrateV3ToCurrentMock.mockReturnValue(expectedResult)
    const bytes = new TextEncoder().encode('{"version":3}')

    const result = await importLegacyV3Bytes(bytes, {
      sourceFileName: 'bestand.json',
      appVersion: '4.0.0',
    })

    expect(result).toBe(expectedResult)
    expect(migrateV3ToCurrentMock).toHaveBeenCalledOnce()
    expect(migrateV3ToCurrentMock).toHaveBeenCalledWith(
      { version: 3 },
      {
        sourceSha256:
          '9af23cea10a478f3bb916ff35c07a36debe444adf9b56814ab63861ec674ab8b',
        sourceFileName: 'bestand.json',
        appVersion: '4.0.0',
      },
    )
  })

  it('weist Dateien oberhalb des festen Größenlimits vor dem Dekodieren zurück', async () => {
    const result = await importLegacyV3Bytes(
      new Uint8Array(MAX_LEGACY_V3_IMPORT_BYTES + 1),
    )

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
      issues: [{ code: 'migration.source_too_large' }],
    })
    expect(migrateV3ToCurrentMock).not.toHaveBeenCalled()
  })

  it('weist einen ungültigen Laufzeitwert als Bytequelle kontrolliert zurück', async () => {
    const result = await importLegacyV3Bytes(
      'keine Bytes' as unknown as Uint8Array,
    )

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
      issues: [{ code: 'migration.invalid_source_bytes' }],
    })
    expect(migrateV3ToCurrentMock).not.toHaveBeenCalled()
  })

  it('weist ungültiges UTF-8 ohne Rohdaten in der Fehlermeldung zurück', async () => {
    const bytes = new Uint8Array([0xc3, 0x28])

    const result = await importLegacyV3Bytes(bytes)

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
      issues: [{ code: 'migration.invalid_utf8' }],
    })
    expect(JSON.stringify(result)).not.toContain('Ã')
    expect(migrateV3ToCurrentMock).not.toHaveBeenCalled()
  })

  it('weist ungültiges JSON ohne Ausschnitte der Eingabe zurück', async () => {
    const secretFragment = 'VERTRAULICHER_ROHWERT'
    const bytes = new TextEncoder().encode(`{"name":"${secretFragment}"`)

    const result = await importLegacyV3Bytes(bytes)

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
      issues: [{ code: 'migration.invalid_json' }],
    })
    expect(JSON.stringify(result)).not.toContain(secretFragment)
    expect(migrateV3ToCurrentMock).not.toHaveBeenCalled()
  })

  it('lässt Proxy-Bytequellen und manipulierte Typed-Array-Grenzen nicht passieren', async () => {
    const proxiedBytes = new Proxy(new Uint8Array([123, 125]), {})
    class MisleadingBytes extends Uint8Array {
      override get byteLength(): number {
        return 0
      }
    }
    const oversizedBytes = new MisleadingBytes(MAX_LEGACY_V3_IMPORT_BYTES + 1)

    await expect(
      importLegacyV3Bytes(proxiedBytes as Uint8Array),
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: 'migration.invalid_source_bytes' }],
    })
    await expect(importLegacyV3Bytes(oversizedBytes)).resolves.toMatchObject({
      ok: false,
      issues: [{ code: 'migration.source_too_large' }],
    })
    expect(migrateV3ToCurrentMock).not.toHaveBeenCalled()
  })

  it('fängt werfende Options-Getter an der Importgrenze kontrolliert ab', async () => {
    const hostileOptions = Object.defineProperty({}, 'sourceFileName', {
      enumerable: true,
      get: () => {
        throw new Error('darf die Importgrenze nicht verlassen')
      },
    })

    await expect(
      importLegacyV3Bytes(
        new TextEncoder().encode('{"version":3}'),
        hostileOptions,
      ),
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ code: 'migration.invalid_import_options' }],
    })
    expect(migrateV3ToCurrentMock).not.toHaveBeenCalled()
  })
})
