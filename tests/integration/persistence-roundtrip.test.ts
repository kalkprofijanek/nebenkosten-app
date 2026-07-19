import { importLegacyV3Bytes } from '@nebenkosten/import-export'
import { MemoryStorageAdapter } from '@nebenkosten/persistence'
import { appDataFileSchema } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

const SAVED_AT = new Date('2026-07-19T12:00:00.000Z')

describe('Legacy-Import bis lokale Persistenz', () => {
  it('migriert fiktive v3-Bytes und lädt den v4-Stand verlustfrei wieder', async () => {
    const sourceBytes = new TextEncoder().encode(
      JSON.stringify({
        version: 3,
        gespeichert: null,
        firmen: [],
        fiktiveErweiterung: {
          leer: '',
          nullwert: null,
          nullzahl: 0,
        },
      }),
    )
    const migration = await importLegacyV3Bytes(sourceBytes, {
      appVersion: '8.0.0-test',
      now: () => new Date('2026-07-19T11:59:00.000Z'),
      sourceFileName: 'fiktiver-bestand.json',
    })

    expect(migration.ok).toBe(true)
    if (!migration.ok) return
    expect(appDataFileSchema.safeParse(migration.data).success).toBe(true)

    const storage = new MemoryStorageAdapter({
      now: () => new Date(SAVED_AT),
    })
    const saved = await storage.save(migration.data, {
      expectedRevision: null,
    })
    const loaded = await storage.load()

    expect(loaded).toEqual({
      data: saved.data,
      revision: saved.revision,
    })
    expect(loaded?.data.meta.migratedFrom?.sourceSha256).toBe(
      migration.report.sourceSha256,
    )
    expect(loaded?.data.meta.savedAt).toBe(SAVED_AT.toISOString())
    expect(migration.data.meta.savedAt).not.toBe(SAVED_AT.toISOString())
  })
})
