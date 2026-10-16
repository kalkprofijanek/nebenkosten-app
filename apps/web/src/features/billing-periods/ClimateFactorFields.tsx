import { useId, useState, type ChangeEvent } from 'react'
import type { ClimateFactor } from '@nebenkosten/schema'
import {
  climateFactorFromDwdList,
  parseDwdClimateFactorCsv,
  type DwdClimateFactorList,
} from '@nebenkosten/import-export'
import {
  CLIMATE_FACTOR_FIELD_NAMES,
  climateFactorDraft,
  emptyClimateFactorDraft,
  formatClimateFactor,
  type ClimateFactorDraft,
  type ClimateFactorErrors,
  type ClimateFactorField,
} from './climate-factor-form'

const FIELDS: readonly {
  readonly field: ClimateFactorField
  readonly label: string
  readonly type?: string
  readonly inputMode?: 'decimal' | 'numeric'
}[] = [
  { field: 'postalCode', label: 'Postleitzahl', inputMode: 'numeric' },
  { field: 'factor', label: 'Klimafaktor', inputMode: 'decimal' },
  { field: 'periodStart', label: 'Faktor-Zeitraum von', type: 'date' },
  { field: 'periodEnd', label: 'Faktor-Zeitraum bis', type: 'date' },
  { field: 'source', label: 'Quelle des Klimafaktors' },
]

type Notice = { readonly kind: 'ok' | 'error'; readonly text: string }

/**
 * Abschnitt „Klimafaktor (DWD)“ eines Abrechnungsjahres (ADR-0005). Faktor
 * und Zeitraum werden aus der DWD-Liste übernommen oder von Hand erfasst;
 * gelesen werden die Werte beim Speichern mit `readClimateFactorForm`.
 */
export function ClimateFactorFields({
  initial,
  suggestedPostalCode,
  billingPeriodStart,
  billingPeriodEnd,
  errors = {},
}: {
  readonly initial?: ClimateFactor | null
  /** Postleitzahl aus der Objektanschrift (`postalCodeFromAddress`). */
  readonly suggestedPostalCode: string | null
  readonly billingPeriodStart: string
  readonly billingPeriodEnd: string
  readonly errors?: ClimateFactorErrors
}) {
  const idPrefix = useId()
  const [draft, setDraft] = useState<ClimateFactorDraft | null>(() =>
    initial ? climateFactorDraft(initial) : null,
  )
  const [dwdList, setDwdList] = useState<DwdClimateFactorList | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  function takeFromList(
    list: DwdClimateFactorList,
    base: ClimateFactorDraft,
  ): ClimateFactorDraft {
    const postalCode = base.postalCode.trim()
    const found = climateFactorFromDwdList(list, postalCode, base.source)
    if (!found) {
      setNotice({
        kind: 'error',
        text: /^\d{5}$/u.test(postalCode)
          ? `Die Postleitzahl ${postalCode} ist in der DWD-Datei nicht enthalten.`
          : 'Bitte eine fünfstellige Postleitzahl angeben, um den Faktor aus der DWD-Datei zu übernehmen.',
      })
      return base
    }
    setNotice({
      kind: 'ok',
      text: `Klimafaktor ${formatClimateFactor(found.factor)} für Postleitzahl ${found.postalCode} aus der DWD-Datei übernommen (Zeitraum ${found.periodStart} bis ${found.periodEnd}).`,
    })
    return {
      ...base,
      factor: formatClimateFactor(found.factor),
      periodStart: found.periodStart,
      periodEnd: found.periodEnd,
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    let list: DwdClimateFactorList
    try {
      list = parseDwdClimateFactorCsv(await file.text())
    } catch (caught) {
      setDwdList(null)
      setNotice({
        kind: 'error',
        text:
          caught instanceof Error
            ? caught.message
            : 'Die DWD-Datei konnte nicht gelesen werden.',
      })
      return
    }
    setDwdList(list)
    setDraft(
      takeFromList(list, draft ?? emptyClimateFactorDraft(suggestedPostalCode)),
    )
  }

  function change(field: ClimateFactorField, value: string) {
    if (!draft) return
    const next = { ...draft, [field]: value }
    setDraft(
      field === 'postalCode' && dwdList && /^\d{5}$/u.test(value.trim())
        ? takeFromList(dwdList, next)
        : next,
    )
  }

  const periodDiffers =
    draft !== null &&
    draft.periodStart !== '' &&
    draft.periodEnd !== '' &&
    (draft.periodStart !== billingPeriodStart ||
      draft.periodEnd !== billingPeriodEnd)
  const postalCodeDiffers =
    draft !== null &&
    suggestedPostalCode !== null &&
    draft.postalCode.trim() !== '' &&
    draft.postalCode.trim() !== suggestedPostalCode

  return (
    <fieldset className="split-fields climate-factor-fields">
      <legend>Klimafaktor (DWD)</legend>
      <label className="climate-factor-fields__file">
        <span>DWD-Datei (KF_…csv) wählen</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void readFile(event)}
        />
      </label>
      {notice ? (
        <p
          className={
            notice.kind === 'error'
              ? 'field-error climate-factor-fields__notice'
              : 'climate-factor-fields__notice'
          }
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}
      {draft === null ? (
        <>
          <p className="form-section__empty">
            Kein Klimafaktor erfasst; der Vorjahresvergleich bleibt ohne
            Witterungsbereinigung.
          </p>
          <div className="form-section__actions">
            <button
              type="button"
              onClick={() =>
                setDraft(emptyClimateFactorDraft(suggestedPostalCode))
              }
            >
              Klimafaktor von Hand erfassen
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            type="hidden"
            name={CLIMATE_FACTOR_FIELD_NAMES.active}
            value="1"
          />
          {FIELDS.map(({ field, label, type, inputMode }) => {
            const errorId = `${idPrefix}-${field}-error`
            const error = errors[field]
            return (
              <div className="form-section__field" key={field}>
                <label>
                  <span>{label}</span>
                  <input
                    name={CLIMATE_FACTOR_FIELD_NAMES[field]}
                    type={type ?? 'text'}
                    inputMode={inputMode}
                    value={draft[field]}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(event) => change(field, event.target.value)}
                  />
                </label>
                {error ? (
                  <small className="field-error" id={errorId}>
                    {error}
                  </small>
                ) : null}
              </div>
            )
          })}
          {postalCodeDiffers ? (
            <p className="form-section__hint">
              Die Objektanschrift nennt die Postleitzahl {suggestedPostalCode}.
            </p>
          ) : null}
          {periodDiffers ? (
            <p className="form-section__hint">
              Der Zeitraum des Klimafaktors weicht vom Abrechnungszeitraum (
              {billingPeriodStart} bis {billingPeriodEnd}) ab; der
              Vorjahresvergleich wird dann nicht witterungsbereinigt.
            </p>
          ) : null}
          <div className="form-section__actions">
            <button
              type="button"
              onClick={() => {
                setDraft(null)
                setNotice(null)
              }}
            >
              Klimafaktor entfernen
            </button>
          </div>
        </>
      )}
    </fieldset>
  )
}
