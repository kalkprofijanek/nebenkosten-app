import type { ReferenceSource } from './reference-sources'

/** Hinweis mit Link auf die Datenquelle eines Referenzwerts (PR-36). */
export function ReferenceSourceHint({
  source,
}: {
  readonly source: ReferenceSource
}) {
  return (
    <p className="form-section__hint">
      Quelle:{' '}
      <a href={source.href} target="_blank" rel="noopener noreferrer">
        {source.label}
      </a>
      . {source.note}
    </p>
  )
}
