import { describe, expect, it } from 'vitest'

import { migrateV3ToCurrent } from '../src'
import type { MigrationResult } from '../src'
import { createFictionalV3File } from './fixtures'

// PR-51: fiktive Legacy-Daten; prüft Melden statt stiller Verknüpfung.
const OPTIONS = {
  sourceSha256: 'e'.repeat(64),
  sourceFileName: 'fiktive-pr51.json',
  now: () => new Date('2026-11-02T08:00:00.000Z'),
}

type UnknownRecord = Record<string, unknown>
const records = (value: unknown) => value as UnknownRecord[]

function firstPeriod(input: UnknownRecord) {
  const company = records(input.firmen)[0]!
  const object = records(company.objekte)[0]!
  return records(object.abrechnungen)[0]!
}

function expectSuccess(result: MigrationResult) {
  expect(result.ok, JSON.stringify(result, null, 2)).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  return result
}

describe('PR-51: Legacy-Migration', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'übernimmt den unbekannten Status %j als Entwurf mit Hinweis',
    (status) => {
      const input = createFictionalV3File()
      firstPeriod(input).status = status
      const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
      expect(result.data.billingData.billingPeriods[0]!.status).toBe('DRAFT')
      expect(result.report.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'migration.unknown_billing_status' }),
        ]),
      )
    },
  )

  it('meldet eine Nutzer-ID, die in einer anderen Einheit erneut vorkommt', () => {
    const input = createFictionalV3File()
    const users = records(firstPeriod(input).nutzer)
    users.push({
      ...users[0],
      nr: 99,
      nutzeinheit: 'WE 99',
      lage: 'DG',
      mandatsref: 'TV_099',
    })
    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'migration.tenancy_id_reused' }),
      ]),
    )
  })

  it('meldet nichts, wenn eine Nutzer-ID nur in ihrer Einheit vorkommt', () => {
    const result = expectSuccess(
      migrateV3ToCurrent(createFictionalV3File(), OPTIONS),
    )
    expect(result.report.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'migration.tenancy_id_reused' }),
      ]),
    )
  })
})
