import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it, vi } from 'vitest'

import { applyEditableBillingPeriodChange } from './edit-guard'

const PERIOD_ID = '40000000-0000-4000-8000-000000000001'

function fileWithStatus(
  status: 'DRAFT' | 'IN_REVIEW' | 'READY_FOR_PDF' | 'FINALIZED' | 'SUPERSEDED',
): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: PERIOD_ID,
          propertyId: '40000000-0000-4000-8000-000000000002',
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status,
        },
      ],
    },
  }
}

const dependencies = {
  createId: () => '40000000-0000-4000-8000-000000000003',
  now: () => new Date('2026-07-21T10:00:00.000Z'),
}

describe('applyEditableBillingPeriodChange', () => {
  it('wendet eine fachliche Änderung im Entwurf unveränderlich an', () => {
    const data = fileWithStatus('DRAFT')
    const original = structuredClone(data)

    const result = applyEditableBillingPeriodChange(
      data,
      PERIOD_ID,
      (current) => ({
        ...current,
        meta: { ...current.meta, appVersion: 'pr10-test' },
      }),
      dependencies,
    )

    expect(result.meta.appVersion).toBe('pr10-test')
    expect(result.billingData.billingPeriods[0]?.status).toBe('DRAFT')
    expect(result.billingData.auditEvents).toHaveLength(0)
    expect(data).toEqual(original)
  })

  it('setzt eine laufende Prüfung vor einer fachlichen Änderung kontrolliert zurück', () => {
    const data = fileWithStatus('IN_REVIEW')

    const result = applyEditableBillingPeriodChange(
      data,
      PERIOD_ID,
      (current) => ({
        ...current,
        meta: { ...current.meta, appVersion: 'changed' },
      }),
      dependencies,
    )

    expect(result.billingData.billingPeriods[0]?.status).toBe('DRAFT')
    expect(result.billingData.billingPeriods[0]?.lastModifiedAt).toBe(
      '2026-07-21T10:00:00.000Z',
    )
    expect(result.billingData.auditEvents).toEqual([
      expect.objectContaining({
        id: '40000000-0000-4000-8000-000000000003',
        billingPeriodId: PERIOD_ID,
        timestamp: '2026-07-21T10:00:00.000Z',
        action: 'billing_period.review_invalidated',
      }),
    ])
    expect(result.meta.appVersion).toBe('changed')
  })

  it.each(['READY_FOR_PDF', 'FINALIZED', 'SUPERSEDED'] as const)(
    'blockiert fachliche Änderungen im Status %s',
    (status) => {
      const transform = vi.fn((current: AppDataFile) => current)

      expect(() =>
        applyEditableBillingPeriodChange(
          fileWithStatus(status),
          PERIOD_ID,
          transform,
          dependencies,
        ),
      ).toThrow(/gesperrt/i)
      expect(transform).not.toHaveBeenCalled()
    },
  )

  it('lehnt einen unbekannten Abrechnungszeitraum ab', () => {
    expect(() =>
      applyEditableBillingPeriodChange(
        fileWithStatus('DRAFT'),
        'missing',
        (current) => current,
        dependencies,
      ),
    ).toThrow(/nicht gefunden/i)
  })
})
