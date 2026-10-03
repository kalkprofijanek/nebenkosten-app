import { describe, expect, it } from 'vitest'
import {
  appDataFileSchema,
  createEmptyAppDataFile,
  migrateV4ToV5,
  v4AppDataFileSchema,
} from '../src'

function oldFile() {
  return { ...createEmptyAppDataFile(), schemaVersion: 4 }
}

describe('explicit v4 to v5 migration', () => {
  it('preserves all old values without enabling automatic consumption', () => {
    const source = oldFile()
    const before = structuredClone(source)
    const result = migrateV4ToV5(source)
    expect(result.schemaVersion).toBe(5)
    expect({ ...result, schemaVersion: 4 }).toEqual(source)
    expect(source).toEqual(before)
    expect(appDataFileSchema.safeParse(result).success).toBe(true)
    expect(v4AppDataFileSchema.safeParse(result).success).toBe(false)
  })
  it('rejects unknown fields and never accepts newer files as v4', () => {
    expect(() => migrateV4ToV5({ ...oldFile(), unknown: true })).toThrow()
    expect(() => migrateV4ToV5({ ...oldFile(), schemaVersion: 6 })).toThrow()
  })
  it('does not smuggle v5 meter roles into the v4 contract', () => {
    const source = oldFile()
    const changed = {
      ...source,
      masterData: {
        ...source.masterData,
        meters: [{ id: 'm', propertyId: 'p', kind: 'unit_heat' }],
      },
    }
    expect(v4AppDataFileSchema.safeParse(changed).success).toBe(false)
    expect(
      appDataFileSchema.safeParse({ ...changed, schemaVersion: 5 }).success,
    ).toBe(true)
  })
})
