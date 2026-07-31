import {
  decodeCurrentAppDataBytes,
  type EncodedCurrentAppData,
} from '@nebenkosten/import-export'
import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import {
  createCanonicalBackup,
  downloadCanonicalBackup,
} from './canonical-backup'

describe('canonical backup', () => {
  it('creates immutable canonical v4 bytes with local verification metadata', async () => {
    const empty = createEmptyAppDataFile()
    const source = {
      ...empty,
      meta: {
        ...empty.meta,
        appVersion: '12.0.0-test',
        savedAt: '2026-07-20T08:00:00.000Z',
      },
    }
    const sourceBefore = structuredClone(source)

    const backup = await createCanonicalBackup(source, {
      createdAt: '2026-07-26T10:11:12.000Z',
    })

    expect(backup).toMatchObject({
      fileName: 'nebenkosten-backup-v4-20260726-101112.json',
      createdAt: '2026-07-26T10:11:12.000Z',
      byteLength: backup.bytes.byteLength,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(backup.bytes.at(-1)).toBe(10)
    expect(await decodeCurrentAppDataBytes(backup.bytes)).toMatchObject({
      data: {
        schemaVersion: 4,
        meta: { savedAt: '2026-07-26T10:11:12.000Z' },
      },
      revision: backup.sha256,
    })
    expect(source).toEqual(sourceBefore)
  })

  it('downloads exactly the verified bytes and always revokes the object URL', () => {
    const clicked: string[] = []
    const revoked: string[] = []
    const appended: string[] = []
    const artifact = {
      bytes: new Uint8Array([123, 125, 10]),
      byteLength: 3,
      createdAt: '2026-07-26T10:11:12.000Z',
      fileName: 'nebenkosten-backup-v4-20260726-101112.json',
      sha256: 'a'.repeat(64),
    } satisfies Omit<EncodedCurrentAppData, 'data' | 'revision' | 'savedAt'> & {
      readonly fileName: string
      readonly createdAt: string
      readonly sha256: string
      readonly byteLength: number
    }

    downloadCanonicalBackup(artifact, {
      createObjectUrl: (blob) => {
        expect(blob.size).toBe(3)
        expect(blob.type).toBe('application/json')
        return 'blob:verified-backup'
      },
      createAnchor: () => ({
        click: () => clicked.push('clicked'),
        remove: () => appended.push('removed'),
        set download(value: string) {
          appended.push(value)
        },
        set href(value: string) {
          appended.push(value)
        },
      }),
      appendAnchor: () => appended.push('appended'),
      revokeObjectUrl: (url) => revoked.push(url),
    })

    expect(clicked).toEqual(['clicked'])
    expect(revoked).toEqual(['blob:verified-backup'])
    expect(appended).toEqual([
      'blob:verified-backup',
      artifact.fileName,
      'appended',
      'removed',
    ])
  })
})
