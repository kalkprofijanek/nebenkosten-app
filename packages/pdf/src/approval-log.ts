import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { ApprovalLogContext } from './contracts'
import { formatIsoDate } from './format'

const BLUE = '#1a3a5c'

const actionLabels: Readonly<Record<string, string>> = {
  'billing_period.status_transition': 'Statuswechsel',
  'billing_period.review_invalidated': 'Prüfung zurückgesetzt',
  'document.generated': 'Dokument erzeugt',
}

function detailText(
  details: Record<string, unknown> | null | undefined,
): string {
  if (!details) return '–'
  const from = typeof details.from === 'string' ? details.from : null
  const to = typeof details.to === 'string' ? details.to : null
  if (from && to) return `${from} → ${to}`
  const kind = typeof details.kind === 'string' ? details.kind : null
  if (kind) return kind
  return '–'
}

/** Baut die Freigabeprotokoll-Tabelle (Legacy: `abr._protokoll`). */
export function buildApprovalLogTable(context: ApprovalLogContext): Content {
  const events = context.auditEvents.filter(
    (event) => event.billingPeriodId === context.billingPeriodId,
  )
  if (events.length === 0) {
    return { text: 'Noch keine Statusänderung protokolliert.' }
  }
  return {
    table: {
      widths: ['auto', 'auto', '*'],
      body: [
        [
          { text: 'Zeitpunkt', style: 'th' },
          { text: 'Aktion', style: 'th' },
          { text: 'Details', style: 'th' },
        ],
        ...events.map((event) => [
          new Date(event.timestamp).toLocaleString('de-DE'),
          actionLabels[event.action] ?? event.action,
          detailText(event.details),
        ]),
      ],
    },
    layout: 'lightHorizontalLines',
  }
}

/** Baut das eigenständige Freigabeprotokoll-Dokument (`documentKind: 'approval_protocol'`). */
export function buildApprovalProtocolDocument(
  context: ApprovalLogContext,
): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [40, 55, 40, 45],
    content: [
      { text: 'Freigabeprotokoll', style: 'title', margin: [0, 0, 0, 4] },
      {
        text: `Erstellt am ${formatIsoDate(context.generatedAt.toISOString().slice(0, 10))}`,
        fontSize: 8,
        color: '#5a6a78',
        margin: [0, 0, 0, 12],
      },
      buildApprovalLogTable(context),
    ],
    styles: {
      title: { fontSize: 14, bold: true, color: BLUE },
      th: { fontSize: 9, bold: true, color: BLUE },
    },
    defaultStyle: { fontSize: 9, color: '#1f2a36', font: 'Roboto' },
  }
}
