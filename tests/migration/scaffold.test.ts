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

  it('migrateV3ToCurrent ist bewusst noch nicht implementiert (PR 04)', () => {
    expect(() => migrateV3ToCurrent({ version: 3, firmen: [] })).toThrowError(
      /PR 04/u,
    )
  })
})
