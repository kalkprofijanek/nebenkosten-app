import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_V3_SCHEMA_VERSION,
  migrateV3ToCurrent,
  probeSchemaVersion,
} from '@nebenkosten/schema'

describe('migration scaffold', () => {
  it('exportiert die Schema-Versionen (PR 03)', () => {
    expect(LEGACY_V3_SCHEMA_VERSION).toBe(3)
    expect(CURRENT_SCHEMA_VERSION).toBe(4)
  })

  it('erkennt neuere Schema-Versionen und gibt sie niemals zur Migration frei', () => {
    expect(probeSchemaVersion({ schemaVersion: 99 })).toEqual({
      kind: 'newer-than-supported',
      schemaVersion: 99,
    })
    expect(probeSchemaVersion({ version: 3 })).toEqual({ kind: 'legacy-v3' })
  })

  it('migrateV3ToCurrent liefert ab PR 04 das aktuelle Schema', () => {
    const result = migrateV3ToCurrent(
      { version: 3, gespeichert: null, firmen: [] },
      {
        sourceSha256: 'a'.repeat(64),
        now: () => new Date('2026-03-04T05:06:07.000Z'),
      },
    )

    expect(result).toMatchObject({ ok: true, data: { schemaVersion: 4 } })
  })
})
