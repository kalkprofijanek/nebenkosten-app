import { useState, type FormEvent } from 'react'
import type { QuantityUnit } from '@nebenkosten/schema'
import {
  formatEuroInput,
  parseEuroCents,
  parseOptionalNumber,
} from '../../../app/form-parsers'
import {
  addFuelDelivery,
  addFuelStock,
  deleteFuelDelivery,
  deleteFuelStock,
  updateFuelDelivery,
  updateFuelStock,
} from '../../heating/heating-commands'
import { WorkflowField } from '../form-support'
import { formOptionalText, formText } from '../form-values'
import type { WorkflowSubRouteProps } from '../route-types'
import type { WorkflowApply } from '../HeatingRoute'

const UNITS: readonly QuantityUnit[] = ['l', 'kg', 't', 'kWh', 'm3']

function optionalQuantity(form: FormData, name: string, unit: QuantityUnit) {
  const value = parseOptionalNumber(formText(form, name))
  return value === null ? undefined : { value, unit }
}

function optionalEuro(form: FormData, name: string) {
  const value = formOptionalText(form, name)
  return value === undefined ? undefined : parseEuroCents(value)
}

export function FuelPanel({
  data,
  selection,
  apply,
}: WorkflowSubRouteProps & { readonly apply: WorkflowApply }) {
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === selection.billingPeriodId,
  )!
  const circuitIds = new Set(
    data.billingData.heatingCircuits
      .filter(({ billingPeriodId }) => billingPeriodId === period.id)
      .map(({ id }) => id),
  )
  const sources = data.billingData.energySources.filter(
    ({ heatingCircuitId }) => circuitIds.has(heatingCircuitId),
  )
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const source = sources.find(({ id }) => id === sourceId) ?? sources[0]
  const stock = data.billingData.fuelStocks.find(
    ({ energySourceId, billingPeriodId }) =>
      energySourceId === source?.id && billingPeriodId === period.id,
  )
  const deliveries = data.billingData.fuelDeliveries.filter(
    ({ energySourceId, billingPeriodId }) =>
      energySourceId === source?.id && billingPeriodId === period.id,
  )
  const defaultUnit =
    stock?.openingQuantity?.unit ??
    stock?.remainingQuantity?.unit ??
    deliveries.find(({ quantity }) => quantity)?.quantity?.unit ??
    'l'

  function saveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!source) return
    const form = new FormData(event.currentTarget)
    const unit = formText(form, 'unit') as QuantityUnit
    const input = {
      energySourceId: source.id,
      billingPeriodId: period.id,
      openingQuantity: optionalQuantity(form, 'openingQuantity', unit),
      openingValueCents: optionalEuro(form, 'openingValue'),
      openingPricePerUnitCents: optionalEuro(form, 'openingPricePerUnit'),
      remainingQuantity: optionalQuantity(form, 'remainingQuantity', unit),
    }
    apply((current) =>
      stock
        ? updateFuelStock(current, stock.id, input)
        : addFuelStock(current, input, { createId: () => crypto.randomUUID() }),
    )
  }

  function addDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!source) return
    const form = new FormData(event.currentTarget)
    const unit = formText(form, 'unit') as QuantityUnit
    if (
      apply((current) =>
        addFuelDelivery(
          current,
          {
            energySourceId: source.id,
            billingPeriodId: period.id,
            date: formOptionalText(form, 'date'),
            quantity: optionalQuantity(form, 'quantity', unit),
            quantityStatus: formOptionalText(form, 'quantityStatus'),
            quantityNote: formOptionalText(form, 'quantityNote'),
            amountCents: optionalEuro(form, 'amount'),
            description: formOptionalText(form, 'description'),
            receiptReference: formOptionalText(form, 'receiptReference'),
          },
          { createId: () => crypto.randomUUID() },
        ),
      )
    )
      event.currentTarget.reset()
  }

  function saveDelivery(event: FormEvent<HTMLFormElement>, deliveryId: string) {
    event.preventDefault()
    if (!source) return
    const form = new FormData(event.currentTarget)
    const unit = formText(form, 'unit') as QuantityUnit
    if (
      apply((current) =>
        updateFuelDelivery(current, deliveryId, {
          energySourceId: source.id,
          billingPeriodId: period.id,
          date: formOptionalText(form, 'date'),
          quantity: optionalQuantity(form, 'quantity', unit),
          quantityStatus: formOptionalText(form, 'quantityStatus'),
          quantityNote: formOptionalText(form, 'quantityNote'),
          amountCents: optionalEuro(form, 'amount'),
          description: formOptionalText(form, 'description'),
          receiptReference: formOptionalText(form, 'receiptReference'),
        }),
      )
    )
      setEditingId(null)
  }

  function confirmDelete() {
    if (!deleteId) return
    const transform =
      stock?.id === deleteId ? deleteFuelStock : deleteFuelDelivery
    if (apply((current) => transform(current, deleteId))) setDeleteId(null)
  }

  if (!source)
    return (
      <p role="alert">
        Bitte zuerst einen Heizkreis mit Energiequelle anlegen.
      </p>
    )

  return (
    <>
      <label>
        <span>Aktive Energiequelle</span>
        <select
          value={source.id}
          onChange={(event) => setSourceId(event.target.value)}
        >
          {sources.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name ?? item.sourceType ?? item.key}
            </option>
          ))}
        </select>
      </label>
      <form noValidate onSubmit={saveStock}>
        <h2>Brennstoffbestand</h2>
        <label>
          <span>Mengeneinheit</span>
          <select name="unit" defaultValue={defaultUnit}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
        <WorkflowField
          label="Anfangsbestand Menge"
          name="openingQuantity"
          defaultValue={stock?.openingQuantity?.value ?? ''}
        />
        <WorkflowField
          label="Anfangsbestand Wert in Euro"
          name="openingValue"
          defaultValue={
            stock?.openingValueCents == null
              ? ''
              : formatEuroInput(stock.openingValueCents)
          }
        />
        <WorkflowField
          label="Preis je Einheit in Euro"
          name="openingPricePerUnit"
          defaultValue={
            stock?.openingPricePerUnitCents == null
              ? ''
              : formatEuroInput(stock.openingPricePerUnitCents)
          }
        />
        <WorkflowField
          label="Restbestand Menge"
          name="remainingQuantity"
          defaultValue={stock?.remainingQuantity?.value ?? ''}
        />
        <button type="submit">Bestand speichern</button>
        {stock ? (
          <button type="button" onClick={() => setDeleteId(stock.id)}>
            Bestand löschen
          </button>
        ) : null}
      </form>
      <form noValidate onSubmit={addDelivery}>
        <h2>Lieferung erfassen</h2>
        <WorkflowField label="Lieferdatum" name="date" type="date" />
        <WorkflowField label="Liefermenge" name="quantity" />
        <label>
          <span>Liefermengeneinheit</span>
          <select name="unit" defaultValue={defaultUnit}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
        <WorkflowField label="Lieferbetrag in Euro" name="amount" />
        <WorkflowField label="Beschreibung der Lieferung" name="description" />
        <WorkflowField
          label="Belegreferenz der Lieferung"
          name="receiptReference"
        />
        <WorkflowField label="Mengenstatus" name="quantityStatus" />
        <WorkflowField label="Mengenhinweis" name="quantityNote" />
        <button type="submit">Lieferung hinzufügen</button>
      </form>
      <section className="editable-records" aria-labelledby="deliveries-title">
        <div className="data-panel__heading">
          <h2 id="deliveries-title">
            Brennstofflieferungen ({deliveries.length})
          </h2>
          <span>{source.name ?? source.key}</span>
        </div>
        <div className="records-grid">
          {deliveries.map((delivery) => {
            const title =
              delivery.description ?? delivery.receiptReference ?? 'Lieferung'
            return (
              <article className="record-editor" key={delivery.id}>
                <div className="record-editor__heading">
                  <div>
                    <p className="section-kicker">
                      {delivery.date ?? 'Ohne Datum'}
                    </p>
                    <h3>{title}</h3>
                    <small>
                      {delivery.quantity?.value ?? '–'}{' '}
                      {delivery.quantity?.unit ?? ''} ·{' '}
                      {delivery.amountCents == null
                        ? 'ohne Betrag'
                        : `${(delivery.amountCents / 100).toFixed(2)} €`}
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-label={`${title} bearbeiten`}
                    onClick={() =>
                      setEditingId(
                        editingId === delivery.id ? null : delivery.id,
                      )
                    }
                  >
                    Bearbeiten
                  </button>
                </div>
                {editingId === delivery.id ? (
                  <form
                    className="embedded-form"
                    noValidate
                    onSubmit={(event) => saveDelivery(event, delivery.id)}
                  >
                    <WorkflowField
                      label="Lieferdatum bearbeiten"
                      name="date"
                      type="date"
                      defaultValue={delivery.date ?? ''}
                    />
                    <WorkflowField
                      label="Liefermenge bearbeiten"
                      name="quantity"
                      defaultValue={delivery.quantity?.value ?? ''}
                    />
                    <label>
                      <span>Liefermengeneinheit bearbeiten</span>
                      <select
                        name="unit"
                        defaultValue={delivery.quantity?.unit ?? defaultUnit}
                      >
                        {UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </label>
                    <WorkflowField
                      label="Lieferbetrag bearbeiten"
                      name="amount"
                      defaultValue={
                        delivery.amountCents == null
                          ? ''
                          : formatEuroInput(delivery.amountCents)
                      }
                    />
                    <WorkflowField
                      label="Lieferbeschreibung bearbeiten"
                      name="description"
                      defaultValue={delivery.description ?? ''}
                    />
                    <WorkflowField
                      label="Belegreferenz bearbeiten"
                      name="receiptReference"
                      defaultValue={delivery.receiptReference ?? ''}
                    />
                    <WorkflowField
                      label="Mengenstatus bearbeiten"
                      name="quantityStatus"
                      defaultValue={delivery.quantityStatus ?? ''}
                    />
                    <WorkflowField
                      label="Mengenhinweis bearbeiten"
                      name="quantityNote"
                      defaultValue={delivery.quantityNote ?? ''}
                    />
                    <button type="submit">Lieferung speichern</button>
                  </form>
                ) : null}
                <div className="danger-zone">
                  <button
                    type="button"
                    onClick={() => setDeleteId(delivery.id)}
                  >
                    Lieferung löschen
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
      {deleteId ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-fuel-title"
          >
            <h2 id="delete-fuel-title">Brennstoffdatensatz löschen?</h2>
            <div className="dialog-actions">
              <button type="button" onClick={() => setDeleteId(null)}>
                Abbrechen
              </button>
              <button type="button" onClick={confirmDelete}>
                Löschen bestätigen
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
