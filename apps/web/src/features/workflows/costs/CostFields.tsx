import { useEffect, useRef, useState } from 'react'
import type { BankBooking, CostCategory, CostEntry } from '@nebenkosten/schema'
import { WorkflowField } from '../form-support'
import { editCostAmount, formatCostCents } from './cost-format'

export function CostCategoryFields({
  category,
  buildings,
}: {
  readonly category?: CostCategory
  readonly buildings: ReadonlyArray<{
    readonly id: string
    readonly name: string
  }>
}) {
  const currentBuildingId =
    category?.scope?.kind === 'building' ? category.scope.buildingId : ''
  const initialKind = category?.kind ?? 'operating'
  const [kind, setKind] = useState<CostCategory['kind']>(initialKind)
  const kindRef = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    // Nach „Kostenart anlegen“ setzt das Formular seine Felder zurück.
    const form = kindRef.current?.form
    if (!form) return
    const resetKind = () => setKind(initialKind)
    form.addEventListener('reset', resetKind)
    return () => form.removeEventListener('reset', resetKind)
  }, [initialKind])
  return (
    <>
      <WorkflowField
        label={category ? 'Kostenart bearbeiten' : 'Neue Kostenart'}
        name="label"
        required
        defaultValue={category?.label ?? ''}
      />
      <label>
        <span>Typ</span>
        <select
          ref={kindRef}
          name="kind"
          defaultValue={initialKind}
          onChange={(event) =>
            setKind(event.currentTarget.value as CostCategory['kind'])
          }
        >
          <option value="operating">Betriebskosten</option>
          <option value="water">Wasser</option>
          <option value="heating">Heizung</option>
        </select>
      </label>
      <label>
        <span>Umlageschlüssel</span>
        <select
          name="allocationKey"
          defaultValue={category?.allocationKey ?? 'usable_area'}
        >
          <option value="usable_area">Nutzfläche</option>
          <option value="heated_area">Beheizte Fläche</option>
          <option value="consumption_units">Verbrauchseinheiten</option>
          <option value="residential_units">Wohneinheiten</option>
          <option value="direct">Direkte Zuordnung</option>
        </select>
      </label>
      <label>
        <span>Geltungsbereich</span>
        <select
          name="scopeKind"
          defaultValue={
            category?.scope?.kind === 'building' ? 'building' : 'property'
          }
        >
          <option value="property">Gesamtes Objekt</option>
          <option value="building">Ein Gebäude</option>
        </select>
      </label>
      <label>
        <span>Gebäude im Geltungsbereich</span>
        <select name="buildingId" defaultValue={currentBuildingId}>
          <option value="">Kein einzelnes Gebäude</option>
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.name}
            </option>
          ))}
        </select>
      </label>
      <WorkflowField
        label="Text auf der Abrechnung"
        name="statementText"
        defaultValue={category?.statementText ?? ''}
      />
      <WorkflowField
        label="Umlagefähig in Prozent"
        name="allocablePercent"
        defaultValue={category?.allocablePercent ?? ''}
      />
      <WorkflowField
        label="Lohnanteil in Prozent"
        name="laborSharePercent"
        defaultValue={category?.laborSharePercent ?? ''}
      />
      {kind === 'heating' ? (
        <label>
          <span>
            Entgelt für Verbrauchserfassung und Abrechnung (§ 6a HeizKV)
          </span>
          <select
            name="meteringFee"
            defaultValue={meteringFeeChoice(category?.meteringFee)}
          >
            <option value="auto">automatisch erkennen</option>
            <option value="yes">ja</option>
            <option value="no">nein</option>
          </select>
        </label>
      ) : null}
    </>
  )
}

/** Auswahlwert für das Entgelt-Kennzeichen (ADR-0006). */
function meteringFeeChoice(
  value: boolean | null | undefined,
): 'auto' | 'yes' | 'no' {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return 'auto'
}

export function CostEntryFields({
  entry,
  categories,
  bookings,
}: {
  readonly entry?: CostEntry
  readonly categories: readonly CostCategory[]
  readonly bookings: readonly BankBooking[]
}) {
  const initialPaymentKind = entry?.bookingLink
    ? 'booking'
    : entry?.externalPayment?.confirmed
      ? 'external'
      : 'none'
  const [paymentKind, setPaymentKind] = useState(initialPaymentKind)
  return (
    <>
      <label>
        <span>Kostenart</span>
        <select
          name="costCategoryId"
          required
          defaultValue={entry?.costCategoryId ?? categories[0]?.id}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </label>
      <WorkflowField
        label="Belegdatum"
        name="date"
        type="date"
        defaultValue={entry?.date ?? ''}
      />
      <WorkflowField
        label="Beschreibung"
        name="description"
        defaultValue={entry?.description ?? ''}
      />
      <WorkflowField
        label="Belegnummer oder Referenz"
        name="receiptReference"
        defaultValue={entry?.receiptReference ?? ''}
      />
      <WorkflowField
        label="Betrag in Euro"
        name="amount"
        required
        defaultValue={entry ? editCostAmount(entry.amountCents) : ''}
      />
      <WorkflowField
        label="Umlagefähig in Prozent"
        name="allocablePercent"
        defaultValue={entry?.allocablePercent ?? ''}
      />
      <label>
        <span>Zahlungsnachweis</span>
        <select
          name="paymentKind"
          value={paymentKind}
          onChange={(event) => setPaymentKind(event.currentTarget.value)}
        >
          <option value="none">Noch nicht zugeordnet</option>
          <option value="booking">Mit Bankbuchung verknüpfen</option>
          <option value="external">Extern bezahlt</option>
        </select>
      </label>
      {paymentKind === 'booking' ? (
        <label>
          <span>Zugehörige Bankbuchung</span>
          <select
            name="bankBookingId"
            required
            defaultValue={entry?.bookingLink?.bankBookingId ?? ''}
          >
            <option value="">Bitte auswählen</option>
            {bookings.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {booking.date ?? 'Ohne Datum'} ·{' '}
                {booking.counterparty ?? booking.purpose ?? 'Ohne Bezeichnung'}{' '}
                · {formatCostCents(booking.amountCents)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {paymentKind === 'external' ? (
        <WorkflowField
          label="Begründung der externen Zahlung"
          name="externalPaymentReason"
          required
          defaultValue={entry?.externalPayment?.reason ?? ''}
        />
      ) : null}
    </>
  )
}
