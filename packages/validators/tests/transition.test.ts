import { describe, expect, it } from 'vitest'
import {
  BillingPeriodTransitionError,
  getFinalizationDocumentStatus,
  latestCalculationRun,
  transitionBillingPeriod,
  validateBillingPeriod,
} from '../src/index'
import { validData } from './fixture'

const OPTIONS = {
  now: '2026-07-21T10:00:00.000Z',
  actor: 'test-user',
  auditEventId: 'audit-1',
}

function addCurrentCalculationAndDocuments(
  data: ReturnType<typeof validData>,
  options: {
    readonly combined?: boolean
    readonly tenant?: boolean
    readonly calculationRunId?: string
  } = {},
) {
  const calculationRunId = options.calculationRunId ?? 'run-current'
  data.billingData.calculationRuns.push({
    id: calculationRunId,
    billingPeriodId: 'period-1',
    startedAt: '2026-07-21T09:00:00.000Z',
  })
  data.billingData.calculationResults.push({
    id: 'result-current',
    calculationRunId,
    totals: {
      recordedCostsCents: 10_000,
      tenantTotalCents: 10_000,
      landlordTotalCents: 0,
      unallocatedCents: 0,
      prepaymentsCents: 8_000,
      controlDifferenceCents: 0,
    },
    warnings: [],
    snapshotFormatVersion: 3,
    resultSnapshot: {},
  })
  if (options.combined ?? true)
    data.billingData.documents.push({
      id: 'document-combined',
      billingPeriodId: 'period-1',
      calculationRunId,
      kind: 'combined_statement',
      createdAt: '2026-07-21T09:30:00.000Z',
      fileName: 'NK_2025_Kostenaufstellung.pdf',
      sha256: 'a'.repeat(64),
    })
  if (options.tenant ?? true)
    data.billingData.documents.push({
      id: 'document-tenant',
      billingPeriodId: 'period-1',
      calculationRunId,
      occupancyPeriodId: 'occupancy-1',
      kind: 'tenant_statement',
      createdAt: '2026-07-21T09:31:00.000Z',
      fileName: 'NK_2025_WE1.pdf',
      sha256: 'b'.repeat(64),
    })
  return data
}

describe('transitionBillingPeriod', () => {
  it('bestimmt den jüngsten Rechenlauf nach Zeitstempel statt Array-Position', () => {
    const runs = [
      {
        id: 'run-new',
        billingPeriodId: 'period-1',
        startedAt: '2026-07-21T10:00:00.000Z',
      },
      {
        id: 'run-old',
        billingPeriodId: 'period-1',
        startedAt: '2026-07-21T09:00:00.000Z',
      },
    ]

    expect(latestCalculationRun(runs, 'period-1')?.id).toBe('run-new')
  })

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
    addCurrentCalculationAndDocuments(ready)
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
    addCurrentCalculationAndDocuments(data)
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

  it('finalisiert nur mit vollständigen Dokumenten des aktuellen Rechenlaufs', () => {
    const withoutDocuments = validData()
    withoutDocuments.billingData.billingPeriods[0]!.status = 'READY_FOR_PDF'
    addCurrentCalculationAndDocuments(withoutDocuments, {
      combined: false,
      tenant: false,
    })
    expect(
      getFinalizationDocumentStatus(withoutDocuments, 'period-1'),
    ).toMatchObject({
      complete: false,
      missingCombinedStatement: true,
      missingTenantStatementCount: 1,
    })
    expect(() =>
      transitionBillingPeriod(withoutDocuments, 'period-1', 'FINALIZED', {
        ...OPTIONS,
        dispatchDate: '2026-07-21',
      }),
    ).toThrow(/Dokument/)

    const missingTenant = validData()
    missingTenant.billingData.billingPeriods[0]!.status = 'READY_FOR_PDF'
    addCurrentCalculationAndDocuments(missingTenant, { tenant: false })
    expect(
      getFinalizationDocumentStatus(missingTenant, 'period-1'),
    ).toMatchObject({
      complete: false,
      missingCombinedStatement: false,
      missingTenantStatementCount: 1,
    })

    const complete = validData()
    complete.billingData.billingPeriods[0]!.status = 'READY_FOR_PDF'
    addCurrentCalculationAndDocuments(complete)
    expect(getFinalizationDocumentStatus(complete, 'period-1').complete).toBe(
      true,
    )
  })

  it('akzeptiert keine Dokumente eines veralteten Rechenlaufs', () => {
    const data = validData()
    data.billingData.billingPeriods[0]!.status = 'READY_FOR_PDF'
    addCurrentCalculationAndDocuments(data, {
      calculationRunId: 'run-old',
    })
    data.billingData.calculationRuns.push({
      id: 'run-current',
      billingPeriodId: 'period-1',
      startedAt: '2026-07-21T10:00:00.000Z',
    })
    data.billingData.calculationResults.push({
      id: 'result-new',
      calculationRunId: 'run-current',
      totals: {
        recordedCostsCents: 10_000,
        tenantTotalCents: 10_000,
        landlordTotalCents: 0,
        unallocatedCents: 0,
        prepaymentsCents: 8_000,
        controlDifferenceCents: 0,
      },
      warnings: [],
      snapshotFormatVersion: 3,
      resultSnapshot: {},
    })

    expect(getFinalizationDocumentStatus(data, 'period-1').complete).toBe(false)
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
