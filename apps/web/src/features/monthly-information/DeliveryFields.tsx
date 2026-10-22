import {
  DELIVERY_FIELD_NAMES,
  EMAIL_CONSENT_REQUIRED,
  deliveryDraftInvalid,
  type DeliveryDraft,
} from './delivery'

interface Props {
  readonly draft: DeliveryDraft
  readonly onChange: (draft: DeliveryDraft) => void
  /** Mindestens eine Person des Mietverhältnisses hat eine E-Mail-Adresse. */
  readonly hasEmailAddress: boolean
  /** Fehlermeldung anzeigen (nach einem Speicherversuch). */
  readonly showError: boolean
}

/**
 * Versandweg der Monatsinformation im Mietverhältnis-Formular
 * (ADR-0014, Schritt 3).
 */
export function DeliveryFields({
  draft,
  onChange,
  hasEmailAddress,
  showError,
}: Props) {
  const error = showError && deliveryDraftInvalid(draft)
  return (
    <fieldset>
      <legend>Monatliche Verbrauchsinformation</legend>
      <label>
        <span>Monatsinformation per</span>
        <select
          name={DELIVERY_FIELD_NAMES.channel}
          value={draft.channel}
          onChange={(event) =>
            onChange({
              ...draft,
              channel: event.target.value === 'email' ? 'email' : 'letter',
            })
          }
        >
          <option value="letter">Brief</option>
          <option value="email">E-Mail</option>
        </select>
      </label>
      <label>
        <span>E-Mail-Zustimmung vom</span>
        <input
          type="date"
          name={DELIVERY_FIELD_NAMES.emailConsentDate}
          value={draft.emailConsentDate}
          required={draft.channel === 'email'}
          aria-invalid={error || undefined}
          aria-describedby={
            error ? 'monthly-information-consent-error' : undefined
          }
          onChange={(event) =>
            onChange({ ...draft, emailConsentDate: event.target.value })
          }
        />
      </label>
      {error ? (
        <p id="monthly-information-consent-error" role="alert">
          {EMAIL_CONSENT_REQUIRED}
        </p>
      ) : null}
      {draft.channel === 'email' && !hasEmailAddress ? (
        <p role="status">
          Keine Person dieses Mietverhältnisses hat eine E-Mail-Adresse. Ohne
          Adresse wird die Monatsinformation per Brief versandt.
        </p>
      ) : null}
    </fieldset>
  )
}
