import type { Content, ContentTable, TableCell } from 'pdfmake/interfaces'
import type { TenantCalculationResult } from '@nebenkosten/core'
import type { TenantStatementContext } from './contracts'
import { formatEuroCents } from './format'
import { ROUNDING_DIFFERENCE_NOTICE } from './legal-texts'
import { heatingTotalCents, tenantResult } from './tenant-statement-data'
import { MUTED, summaryTable } from './tenant-statement-tables'

/** Beschriftung der sichtbaren Rundungszeile in der Übersicht. */
export const SUMMARY_ROUNDING_LABEL = 'Rundungsausgleich'

/** Erläuterung der Rundungszeile (docs/ROUNDING.md, Abschnitt 5). */
export const SUMMARY_ROUNDING_NOTICE =
  'Ihr Anteil an den Gesamtkosten wird aus den ungerundeten Einzelbeträgen gebildet und erst dann auf ganze Cent gerundet (Restcent-Verteilung nach dem größten Rest). Die Zeile „Rundungsausgleich“ weist die Differenz zu den einzeln gerundeten Teilbeträgen offen aus; die Summe der gedruckten Zeilen ergibt Ihren Anteil.'

/**
 * Differenz zwischen dem verbindlichen, als Ganzes gerundeten Anteil und der
 * Summe der einzeln gerundeten Teilbeträge der Übersicht (Heizkosten,
 * CO₂-Kostenanteil, Betriebskosten) in Cent.
 */
export function summaryRoundingCents(tenant: TenantCalculationResult): number {
  const { costBreakdown } = tenant
  const parts =
    heatingTotalCents(tenant) +
    costBreakdown.heatingCo2Cents +
    costBreakdown.operatingByCategory.reduce(
      (sum, item) => sum + item.amountCents,
      0,
    )
  return tenant.shareCents - parts
}

const ANCHOR = 'Ihr Anteil an den Gesamtkosten'

function cellText(cell: TableCell | undefined): string | null {
  if (typeof cell === 'string') return cell
  if (cell && typeof cell === 'object' && 'text' in cell)
    return typeof cell.text === 'string' ? cell.text : null
  return null
}

/**
 * Übersicht der Einzelabrechnung mit sichtbarer Rundungszeile: Weicht der
 * verbindliche Anteil von der Summe der gedruckten Teilbeträge ab, steht die
 * Differenz als eigene Zeile vor „Ihr Anteil an den Gesamtkosten“. Die
 * Kernverteilung bleibt unverändert; nur die Darstellung wird summentreu.
 */
export function summaryWithRounding(
  context: TenantStatementContext,
): Content[] {
  const table = summaryTable(context)
  const difference = summaryRoundingCents(tenantResult(context))
  const notice = (text: string): Content => ({
    text,
    fontSize: 7,
    color: MUTED,
    margin: [0, 0, 0, 6],
  })
  if (difference === 0) return [table, notice(ROUNDING_DIFFERENCE_NOTICE)]
  const body = (table as ContentTable).table?.body
  const index = Array.isArray(body)
    ? body.findIndex((row) => cellText(row[0]) === ANCHOR)
    : -1
  if (!body || index < 0)
    return [
      table,
      notice(
        `${SUMMARY_ROUNDING_LABEL}: ${formatEuroCents(difference)}. ${SUMMARY_ROUNDING_NOTICE}`,
      ),
    ]
  const roundingRow: TableCell[] = [
    { text: SUMMARY_ROUNDING_LABEL, color: MUTED },
    {
      text: formatEuroCents(difference),
      alignment: 'right',
      noWrap: true,
      color: MUTED,
    },
  ]
  const patched: ContentTable = {
    ...(table as ContentTable),
    table: {
      ...(table as ContentTable).table,
      body: [...body.slice(0, index), roundingRow, ...body.slice(index)],
    },
  }
  return [patched, notice(SUMMARY_ROUNDING_NOTICE)]
}
