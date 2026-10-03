import { describe, expect, it } from 'vitest'

import { migrateV3ToCurrent } from '../src'
import { createFictionalV3File } from './fixtures'

const OPTIONS = {
  sourceSha256: 'e'.repeat(64),
  sourceFileName: 'fiktive-gebaeudezuordnung.json',
  now: () => new Date('2026-10-03T08:00:00.000Z'),
}

type UnknownRecord = Record<string, unknown>

function firstUser(input: UnknownRecord): UnknownRecord {
  const company = (input.firmen as UnknownRecord[])[0]!
  const object = (company.objekte as UnknownRecord[])[0]!
  const period = (object.abrechnungen as UnknownRecord[])[0]!
  return (period.nutzer as UnknownRecord[])[0]!
}

function migrate(change: (user: UnknownRecord) => void) {
  const input = createFictionalV3File()
  change(firstUser(input))
  const result = migrateV3ToCurrent(input, OPTIONS)
  if (!result.ok) throw new Error(result.reason)
  const unit = result.data.masterData.units.find(
    ({ label }) => label === 'WE 01',
  )!
  const warnings = result.report.issues.filter(
    ({ code }) => code === 'migration.unit_building_unresolved',
  )
  return { unit, warnings }
}

describe('Gebäudezuordnung von Legacy-Wohnungen', () => {
  it('nutzt einen anders geschriebenen Hausschlüssel wie die Alt-App', () => {
    const { unit, warnings } = migrate((user) => {
      user.mandatsref = 'tvEGli_001'
      user.kosten_scope = 'tv'
    })
    expect(unit.buildingId).toBeTruthy()
    expect(warnings).toEqual([])
  })

  it('meldet eine nicht zuordenbare Wohnung statt sie still auszulassen', () => {
    const { unit, warnings } = migrate((user) => {
      user.mandatsref = 'XX_001'
      delete user.kosten_scope
    })
    expect(unit.buildingId).toBeUndefined()
    expect(warnings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        area: 'migration',
        entity: { type: 'Unit', id: unit.id },
      }),
    ])
  })
})
