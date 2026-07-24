import type { AuditEvent } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  buildApprovalLogTable,
  buildApprovalProtocolDocument,
} from '../src/approval-log'

const events: AuditEvent[] = [
  {
    id: 'audit-1',
    billingPeriodId: 'bp-1',
    timestamp: '2026-01-10T09:00:00.000Z',
    action: 'billing_period.status_transition',
    details: { from: 'DRAFT', to: 'IN_REVIEW' },
  },
  {
    id: 'audit-2',
    billingPeriodId: 'bp-1',
    timestamp: '2026-01-12T09:00:00.000Z',
    action: 'billing_period.status_transition',
    details: { from: 'IN_REVIEW', to: 'READY_FOR_PDF' },
  },
  {
    id: 'audit-3',
    billingPeriodId: 'other-period',
    timestamp: '2026-01-13T09:00:00.000Z',
    action: 'billing_period.status_transition',
    details: { from: 'DRAFT', to: 'IN_REVIEW' },
  },
]

describe('buildApprovalLogTable', () => {
  it('zeigt nur Ereignisse des angegebenen Abrechnungsjahres', () => {
    const table = buildApprovalLogTable({
      billingPeriodId: 'bp-1',
      auditEvents: events,
      generatedAt: new Date('2026-01-15T10:00:00.000Z'),
    })
    const serialized = JSON.stringify(table)
    expect(serialized).toContain('DRAFT → IN_REVIEW')
    expect(serialized).toContain('IN_REVIEW → READY_FOR_PDF')
  })

  it('zeigt einen Platzhaltertext ohne Ereignisse', () => {
    const table = buildApprovalLogTable({
      billingPeriodId: 'bp-without-events',
      auditEvents: events,
      generatedAt: new Date('2026-01-15T10:00:00.000Z'),
    })
    expect(JSON.stringify(table)).toContain('Noch keine Statusänderung')
  })

  it('fällt bei unbekannter Aktion auf den Rohwert zurück und zeigt "kind"-Details', () => {
    const table = buildApprovalLogTable({
      billingPeriodId: 'bp-2',
      auditEvents: [
        {
          id: 'audit-4',
          billingPeriodId: 'bp-2',
          timestamp: '2026-01-14T09:00:00.000Z',
          action: 'unbekannte.aktion',
          details: { kind: 'manual' },
        },
        {
          id: 'audit-5',
          billingPeriodId: 'bp-2',
          timestamp: '2026-01-14T10:00:00.000Z',
          action: 'unbekannte.aktion',
          details: null,
        },
        {
          id: 'audit-6',
          billingPeriodId: 'bp-2',
          timestamp: '2026-01-14T11:00:00.000Z',
          action: 'unbekannte.aktion',
          details: {},
        },
      ],
      generatedAt: new Date('2026-01-15T10:00:00.000Z'),
    })
    const serialized = JSON.stringify(table)
    expect(serialized).toContain('unbekannte.aktion')
    expect(serialized).toContain('manual')
  })
})

describe('buildApprovalProtocolDocument', () => {
  it('baut ein eigenständiges Freigabeprotokoll-Dokument', () => {
    const doc = buildApprovalProtocolDocument({
      billingPeriodId: 'bp-1',
      auditEvents: events,
      generatedAt: new Date('2026-01-15T10:00:00.000Z'),
    })
    expect(doc.pageSize).toBe('A4')
    expect(JSON.stringify(doc.content)).toContain('Freigabeprotokoll')
  })
})
