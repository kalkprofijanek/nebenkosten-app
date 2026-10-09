import { describe, expect, it } from 'vitest'

import {
  appDataFileSchema,
  migrateV3ToCurrent,
  PREPAYMENT_ADJUSTMENT_DATA_SOURCE,
  PREPAYMENT_ADJUSTMENT_DECIDED_ACTION,
  v3NutzerSchema,
} from '../src'
import type { MigrationResult } from '../src'
import { createFictionalV3File } from './fixtures'

const OPTIONS = {
  sourceSha256: 'f'.repeat(64),
  sourceFileName: 'fiktive-vz-anpassung.json',
  now: () => new Date('2026-10-09T08:00:00.000Z'),
}

type UnknownRecord = Record<string, unknown>

function firstPeriod(input: UnknownRecord) {
  const company = (input.firmen as UnknownRecord[])[0]!
  const object = (company.objekte as UnknownRecord[])[0]!
  return (object.abrechnungen as UnknownRecord[])[0]!
}

function migrateWithUsers(...users: UnknownRecord[]) {
  const input = createFictionalV3File() as UnknownRecord
  const period = firstPeriod(input)
  const legacyUsers = period.nutzer as UnknownRecord[]
  users.forEach((fields, index) => Object.assign(legacyUsers[index]!, fields))
  const result: MigrationResult = migrateV3ToCurrent(input, OPTIONS)
  expect(result.ok, JSON.stringify(result, null, 2)).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  return { result, periodId: period.id as string }
}

function decisionEvents(result: Extract<MigrationResult, { ok: true }>) {
  return result.data.billingData.auditEvents.filter(
    ({ action }) => action === PREPAYMENT_ADJUSTMENT_DECIDED_ACTION,
  )
}

describe('VZ-Anpassung aus Legacy-Nutzerfeldern (vz_anpassung*)', () => {
  it('akzeptiert die neuen Felder im v3-Schema', () => {
    expect(
      v3NutzerSchema.safeParse({
        id: 'n_1',
        vz_anpassung: 'ja',
        vz_anpassung_neu_monat: '195,00',
        vz_anpassung_ab: '2027-01-01',
      }).success,
    ).toBe(true)
  })

  it('übernimmt „ja“ mit Betrag und Termin als Entscheidungs-Event', () => {
    const { result, periodId } = migrateWithUsers({
      vz_anpassung: 'ja',
      vz_anpassung_neu_monat: '195,00',
      vz_anpassung_ab: '2027-02-01',
    })
    const occupancy = result.data.billingData.occupancyPeriods.find(
      ({ tenancyId }) => tenancyId === 'n_test001',
    )!
    const events = decisionEvents(result)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      billingPeriodId: periodId,
      timestamp: '2026-10-09T08:00:00.000Z',
      details: {
        source: PREPAYMENT_ADJUSTMENT_DATA_SOURCE,
        occupancyPeriodId: occupancy.id,
        tenancyId: 'n_test001',
        accepted: true,
        previousMonthlyCents: 18_000,
        newMonthlyCents: 19_500,
        validFrom: '2027-02-01',
      },
    })
    expect(
      result.report.unmappedFields.filter((field) =>
        field.includes('vz_anpassung'),
      ),
    ).toEqual([])
    expect(JSON.stringify(occupancy.legacyUnmapped ?? [])).not.toContain(
      'vz_anpassung',
    )
    expect(appDataFileSchema.safeParse(result.data).success).toBe(true)
  })

  it('lässt Betrag und Termin offen (Vorschlag/Standardtermin) und kennt „nein“', () => {
    const accepted = migrateWithUsers({ vz_anpassung: 'ja' }).result
    expect(decisionEvents(accepted)[0]!.details).toMatchObject({
      accepted: true,
      newMonthlyCents: null,
      validFrom: null,
    })
    const declined = migrateWithUsers({ vz_anpassung: 'nein' }).result
    expect(decisionEvents(declined)[0]!.details).toMatchObject({
      accepted: false,
    })
    expect(decisionEvents(migrateWithUsers({}).result)).toEqual([])
  })

  it('meldet und konserviert ungültige oder unpassende Angaben', () => {
    const invalid = migrateWithUsers({
      vz_anpassung: 'ja',
      vz_anpassung_neu_monat: 0,
      vz_anpassung_ab: '2027-01-15',
    }).result
    expect(decisionEvents(invalid)[0]!.details).toMatchObject({
      newMonthlyCents: null,
      validFrom: null,
    })
    const codes = invalid.report.issues.map(({ code }) => code)
    expect(codes).toContain('migration.prepayment_adjustment_amount_invalid')
    expect(codes).toContain('migration.prepayment_adjustment_date_invalid')

    const withoutDecision = migrateWithUsers({
      vz_anpassung_neu_monat: 200,
    }).result
    expect(decisionEvents(withoutDecision)).toEqual([])
    expect(withoutDecision.report.issues.map(({ code }) => code)).toContain(
      'migration.prepayment_adjustment_without_decision',
    )

    const vacancy = migrateWithUsers({}, { vz_anpassung: 'ja' }).result
    expect(decisionEvents(vacancy)).toEqual([])
    expect(vacancy.report.issues.map(({ code }) => code)).toContain(
      'migration.prepayment_adjustment_without_tenant',
    )
    expect(vacancy.report.unmappedFields.join('\n')).toContain('vz_anpassung')
  })
})
