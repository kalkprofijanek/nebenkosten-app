import { appDataFileSchema } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../../../tests/characterization/build-app-data'
import scenarioFile from '../../../../../tests/characterization/scenarios.json'
import type { Scenario } from '../../../../../tests/characterization/types'
import {
  OwnershipChangeError,
  applyOwnershipChange,
  readOwnershipChangeForm,
} from './ownership-change'

const scenarios = scenarioFile.scenarios as unknown as Scenario[]

/** Fiktiver Ölkessel 2024 mit einer Lieferung am 1. Februar. */
function data() {
  return buildAppDataFile(
    structuredClone(
      scenarios.find(({ id }) => id === 'case-10-central-hot-water')!,
    ),
  )
}

describe('Eigentümerwechsel erfassen (PR-30 Teil 2)', () => {
  it('setzt den Übergabetag und kennzeichnet frühere Lieferungen', () => {
    const source = data()
    const { data: result, marked } = applyOwnershipChange(source, 'bp-1', {
      transferDate: '2024-04-01',
      previousOwnerLabel: 'Fiktiv',
    })
    expect(marked).toBe(1)
    expect(result.billingData.billingPeriods[0]!.ownershipChange).toEqual({
      transferDate: '2024-04-01',
      previousOwnerLabel: 'Fiktiv',
    })
    expect(result.billingData.fuelDeliveries[0]!.origin).toBe('previous_owner')
    expect(appDataFileSchema.safeParse(result).success).toBe(true)
    // Quelle unverändert, vorhandene Kennzeichen bleiben.
    expect(source.billingData.fuelDeliveries[0]!.origin).toBeUndefined()
    result.billingData.fuelDeliveries[0]!.origin = 'own'
    expect(
      applyOwnershipChange(result, 'bp-1', { transferDate: '2024-04-01' })
        .marked,
    ).toBe(0)
  })

  it('kennzeichnet nichts nach dem Übergabetag und entfernt den Wechsel', () => {
    const early = applyOwnershipChange(data(), 'bp-1', {
      transferDate: '2024-01-15',
    })
    expect(early.marked).toBe(0)
    const removed = applyOwnershipChange(early.data, 'bp-1', null)
    expect(
      removed.data.billingData.billingPeriods[0]!.ownershipChange,
    ).toBeUndefined()
  })

  it('verlangt einen Übergabetag innerhalb des Zeitraums', () => {
    for (const transferDate of ['2024-01-01', '2025-01-01'])
      expect(() =>
        applyOwnershipChange(data(), 'bp-1', { transferDate }),
      ).toThrow(OwnershipChangeError)
  })

  it('liest das Formular', () => {
    const form = new FormData()
    expect(readOwnershipChangeForm(form)).toEqual({ ok: true, value: null })
    form.set('ownershipChangeActive', 'on')
    expect(readOwnershipChangeForm(form).ok).toBe(false)
    form.set('ownershipTransferDate', '2024-04-01')
    form.set('ownershipPreviousOwner', '  ')
    expect(readOwnershipChangeForm(form)).toEqual({
      ok: true,
      value: { transferDate: '2024-04-01' },
    })
  })
})
