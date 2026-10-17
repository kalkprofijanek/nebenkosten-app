import type { OwnershipChange } from '@nebenkosten/schema'
import { useState } from 'react'

/**
 * Abschnitt „Eigentümerwechsel“ eines Abrechnungsjahres (PR-30 Teil 2).
 * Die Bezeichnung des Voreigentümers ist intern und erscheint nicht im
 * Mieter-PDF.
 */
export function OwnershipChangeFields({
  initial,
  periodStart,
  periodEnd,
  error,
}: {
  readonly initial: OwnershipChange | null | undefined
  readonly periodStart: string
  readonly periodEnd: string
  readonly error?: string | null
}) {
  const [active, setActive] = useState(Boolean(initial))
  return (
    <fieldset className="split-fields ownership-change-fields">
      <legend>Eigentümerwechsel</legend>
      <label className="checkbox-field">
        <input
          type="checkbox"
          name="ownershipChangeActive"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />{' '}
        Objekt in diesem Jahr gekauft
      </label>
      {active ? (
        <>
          <label>
            <span>Übergabetag</span>
            <input
              type="date"
              name="ownershipTransferDate"
              defaultValue={initial?.transferDate ?? ''}
              min={periodStart}
              max={periodEnd}
              required
              aria-invalid={error ? true : undefined}
            />
          </label>
          <label>
            <span>Voreigentümer (nur intern)</span>
            <input
              type="text"
              name="ownershipPreviousOwner"
              maxLength={200}
              defaultValue={initial?.previousOwnerLabel ?? ''}
            />
          </label>
          <p className="form-section__hint">
            Abgerechnet wird das ganze Jahr. Beim Speichern werden Lieferungen
            und Belege vor dem Übergabetag als „vom Voreigentümer“
            gekennzeichnet, sofern dort noch nichts gewählt ist. Prüfen Sie bei
            diesen Positionen, ob eine Rechnung, Abschläge oder eine Schätzung
            zugrunde liegen; übernommene Bestände mit dem belegten
            Anschaffungspreis bewerten.
          </p>
        </>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
