import { describe, expect, it } from 'vitest'
import {
  BillingPeriodTransitionError,
  transitionBillingPeriod,
  validateBillingPeriod,
} from '../src/index'
import { validData } from './fixture'

const OPTIONS = {
  now: '2026-07-21T10:00:00.000Z',
  actor: 'test-user',
  auditEventId: 'audit-1',
}

describe('transitionBillingPeriod', () => {
  it('führt die Vorwärts-FSM immutable und auditierbar bis FINALIZED', () => {
    const original = validData()
    const review = transitionBillingPeriod(
      original,
      'period-1',
      'IN_REVIEW',
      OPTIONS,
    )
    expect(original.billingData.billingPeriods[0]!.status).toBe('DRAFT')
    expect(review.billingData.billingPeriods[0]!.status).toBe('IN_REVIEW')
    const ready = transitionBillingPeriod(review, 'period-1', 'READY_FOR_PDF', {
      ...OPTIONS,
      auditEventId: 'audit-2',
    })
    const final = transitionBillingPeriod(ready, 'period-1', 'FINALIZED', {
      ...OPTIONS,
      auditEventId: 'audit-3',
      dispatchDate: '2026-07-21',
    })
    expect(final.billingData.billingPeriods[0]).toMatchObject({
      status: 'FINALIZED',
      dispatchDate: '2026-07-21',
    })
    expect(final.billingData.auditEvents.at(-1)!.details).toMatchObject({
      from: 'READY_FOR_PDF',
      to: 'FINALIZED',
      actor: 'test-user',
    })
    expect(final.billingData.auditEvents).toHaveLength(3)
  })

  it('verlangt alle aktuellen Warnungsbestätigungen für READY', () => {
    const data = validData()
    data.billingData.billingPeriods[0]!.status = 'IN_REVIEW'
    data.billingData.costEntries[0]!.amountCents = -10_000
    data.billingData.costCategories[0]!.totalAmountCents = -10_000
    const report = validateBillingPeriod(data, 'period-1')
    expect(() =>
      transitionBillingPeriod(data, 'period-1', 'READY_FOR_PDF', OPTIONS),
    ).toThrow(BillingPeriodTransitionError)
    expect(
      transitionBillingPeriod(data, 'period-1', 'READY_FOR_PDF', {
        ...OPTIONS,
        confirmedWarningKeys: report.unconfirmedWarningKeys,
      }).billingData.billingPeriods[0]!.status,
    ).toBe('READY_FOR_PDF')
  })

  it('verlangt Gründe für Rückkanten/SUPERSEDED und ein Versanddatum für FINALIZED', () => {
    const data = validData()
    data.billingData.billingPeriods[0]!.status = 'READY_FOR_PDF'
    expect(() =>
      transitionBillingPeriod(data, 'period-1', 'IN_REVIEW', OPTIONS),
    ).toThrow(/Begründung/)
    expect(() =>
      transitionBillingPeriod(data, 'period-1', 'FINALIZED', OPTIONS),
    ).toThrow(/Versanddatum/)
    data.billingData.billingPeriods[0]!.status = 'FINALIZED'
    expect(() =>
      transitionBillingPeriod(data, 'period-1', 'SUPERSEDED', OPTIONS),
    ).toThrow(/Begründung/)
  })

  it('weist Sprünge und jeden Ausgang aus SUPERSEDED zurück', () => {
    const data = validData()
    expect(() =>
      transitionBillingPeriod(data, 'period-1', 'FINALIZED', {
        ...OPTIONS,
        dispatchDate: '2026-07-21',
      }),
    ).toThrow(/nicht zulässig/)
    data.billingData.billingPeriods[0]!.status = 'SUPERSEDED'
    expect(() =>
      transitionBillingPeriod(data, 'period-1', 'DRAFT', {
        ...OPTIONS,
        reason: 'Test',
      }),
    ).toThrow(/terminal/)
  })

  it('führt begründete Rückkanten und SUPERSEDED aus', () => {
    const review = validData()
    review.billingData.billingPeriods[0]!.status = 'IN_REVIEW'
    const draft = transitionBillingPeriod(review, 'period-1', 'DRAFT', {
      ...OPTIONS,
      reason: 'Eingaben ergänzen',
    })
    expect(draft.billingData.billingPeriods[0]!.status).toBe('DRAFT')

    const finalized = validData()
    finalized.billingData.billingPeriods[0]!.status = 'FINALIZED'
    const superseded = transitionBillingPeriod(
      finalized,
      'period-1',
      'SUPERSEDED',
      { ...OPTIONS, reason: 'Neue Fassung' },
    )
    expect(superseded.billingData.billingPeriods[0]!.status).toBe('SUPERSEDED')
  })

  it('weist ungültige Daten, unbekannte Perioden und Audit-Zeitpunkte zurück', () => {
    expect(() => transitionBillingPeriod({}, 'period-1', 'IN_REVIEW')).toThrow(
      /Datenbestand/,
    )
    expect(() =>
      transitionBillingPeriod(validData(), 'missing', 'IN_REVIEW'),
    ).toThrow(/nicht gefunden/)
    expect(() =>
      transitionBillingPeriod(validData(), 'period-1', 'IN_REVIEW', {
        now: 'kein-zeitpunkt',
      }),
    ).toThrow(/Audit-Zeitpunkt/)
  })

  it('verhindert doppelte Audit-IDs', () => {
    const data = validData()
    data.billingData.auditEvents.push({
      id: 'audit-1',
      billingPeriodId: 'period-1',
      timestamp: '2026-07-20T10:00:00.000Z',
      action: 'existing',
    })
    expect(() =>
      transitionBillingPeriod(data, 'period-1', 'IN_REVIEW', OPTIONS),
    ).toThrow(/Audit-ID/)
  })
})
