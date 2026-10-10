import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import {
  interimReadingHints,
  type InterimReadingDraft,
} from './interim-reading'

/** Nicht blockierender Hinweis am Ein-/Auszugsfeld (§ 9b Abs. 1 HeizKV). */
export function InterimReadingNotice({
  data,
  period,
  draft,
}: {
  readonly data: AppDataFile
  readonly period: BillingPeriod
  readonly draft: InterimReadingDraft
}) {
  const hints = interimReadingHints(data, period, draft)
  if (hints.length === 0) return null
  return (
    <div className="interim-reading-hint" role="note" aria-live="polite">
      {hints.map((hint) => (
        <p key={hint}>{hint}</p>
      ))}
    </div>
  )
}
