import { useState, type FormEvent } from 'react'
import type { Meter, QuantityUnit } from '@nebenkosten/schema'
import { parseEuroCents, parseOptionalNumber } from '../../../app/form-parsers'
import {
  addMeter,
  addMeterReading,
  deleteMeter,
  deleteMeterBillingStatus,
  deleteMeterReading,
  updateMeter,
  updateMeterReading,
  upsertMeterBillingStatus,
} from '../../metering/meter-commands'
import { WorkflowField } from '../form-support'
import { formOptionalText, formText } from '../form-values'
import type { WorkflowSubRouteProps } from '../route-types'
import type { WorkflowApply } from '../HeatingRoute'

const UNITS: readonly QuantityUnit[] = ['kWh', 'm3', 'l', 'kg', 'einheiten']

function meterInput(form: FormData, propertyId: string) {
  return {
    propertyId,
    kind: formText(form, 'kind') as Meter['kind'],
    address: formOptionalText(form, 'address'),
    meterNumber: formOptionalText(form, 'meterNumber'),
    maloId: formOptionalText(form, 'maloId'),
    provider: formOptionalText(form, 'provider'),
    contractOrAccountNumber: formOptionalText(form, 'contractOrAccountNumber'),
    validFrom: formOptionalText(form, 'validFrom'),
    validTo: formOptionalText(form, 'validTo'),
    meterNumberStatus: formText(form, 'meterNumberStatus') as NonNullable<
      Meter['meterNumberStatus']
    >,
    note: formOptionalText(form, 'note'),
    additionalNote: formOptionalText(form, 'additionalNote'),
  }
}

function optionalEuro(form: FormData, name: string) {
  const value = formOptionalText(form, name)
  return value === undefined ? undefined : parseEuroCents(value)
}

export function MeterPanel({
  data,
  selection,
  apply,
}: WorkflowSubRouteProps & { readonly apply: WorkflowApply }) {
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === selection.billingPeriodId,
  )!
  const meters = data.masterData.meters.filter(
    ({ propertyId }) => propertyId === period.propertyId,
  )
  const [meterId, setMeterId] = useState(meters[0]?.id ?? '')
  const [editingMeter, setEditingMeter] = useState(false)
  const [editingReadingId, setEditingReadingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<
    | { readonly kind: 'meter' | 'reading' | 'status'; readonly id: string }
    | undefined
  >()
  const meter = meters.find(({ id }) => id === meterId) ?? meters[0]
  const readings = data.billingData.meterReadings.filter(
    ({ meterId: reference, billingPeriodId }) =>
      reference === meter?.id &&
      (billingPeriodId == null || billingPeriodId === period.id),
  )
  const status = data.billingData.meterBillingStatuses.find(
    ({ meterId: reference, year }) =>
      reference === meter?.id && year === period.year,
  )

  function createMeter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        addMeter(current, meterInput(form, period.propertyId), {
          createId: () => crypto.randomUUID(),
        }),
      )
    )
      event.currentTarget.reset()
  }

  function saveMeter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!meter) return
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        updateMeter(current, meter.id, meterInput(form, period.propertyId)),
      )
    )
      setEditingMeter(false)
  }

  function createReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!meter) return
    const form = new FormData(event.currentTarget)
    const value = parseOptionalNumber(formText(form, 'value'))
    if (value === null) throw new Error('Bitte einen Zählerstand eingeben.')
    if (
      apply((current) =>
        addMeterReading(
          current,
          {
            meterId: meter.id,
            billingPeriodId: period.id,
            date: formOptionalText(form, 'date'),
            value: {
              value,
              unit: formText(form, 'unit') as QuantityUnit,
            },
            source: formText(form, 'source') as
              'manual' | 'imported' | 'estimated',
            note: formOptionalText(form, 'note'),
          },
          { createId: () => crypto.randomUUID() },
        ),
      )
    )
      event.currentTarget.reset()
  }

  function saveReading(event: FormEvent<HTMLFormElement>, readingId: string) {
    event.preventDefault()
    if (!meter) return
    const form = new FormData(event.currentTarget)
    const value = parseOptionalNumber(formText(form, 'value'))
    if (value === null) throw new Error('Bitte einen Zählerstand eingeben.')
    if (
      apply((current) =>
        updateMeterReading(current, readingId, {
          meterId: meter.id,
          billingPeriodId: period.id,
          date: formOptionalText(form, 'date'),
          value: { value, unit: formText(form, 'unit') as QuantityUnit },
          source: formText(form, 'source') as
            'manual' | 'imported' | 'estimated',
          note: formOptionalText(form, 'note'),
        }),
      )
    )
      setEditingReadingId(null)
  }

  function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!meter) return
    const form = new FormData(event.currentTarget)
    apply((current) =>
      upsertMeterBillingStatus(current, {
        meterId: meter.id,
        billingPeriodId: period.id,
        year: period.year,
        bookingPresent: form.has('bookingPresent'),
        annualInvoicePresent: form.has('annualInvoicePresent'),
        note: formOptionalText(form, 'note'),
        estimateAmountCents: optionalEuro(form, 'estimateAmount'),
        estimateReason: formOptionalText(form, 'estimateReason'),
      }),
    )
  }

  function confirmDelete() {
    if (!deleteTarget) return
    const transform =
      deleteTarget.kind === 'meter'
        ? deleteMeter
        : deleteTarget.kind === 'reading'
          ? deleteMeterReading
          : deleteMeterBillingStatus
    if (apply((current) => transform(current, deleteTarget.id)))
      setDeleteTarget(undefined)
  }

  return (
    <>
      <form noValidate onSubmit={createMeter}>
        <h2>Zähler anlegen</h2>
        <label>
          <span>Zählerart</span>
          <select name="kind">
            <option value="general">Allgemeinstrom</option>
            <option value="heat">Wärmeerzeugung</option>
          </select>
        </label>
        <WorkflowField label="Zählernummer" name="meterNumber" />
        <WorkflowField label="Zähleradresse" name="address" />
        <WorkflowField label="Marktlokations-ID" name="maloId" />
        <WorkflowField label="Versorger" name="provider" />
        <WorkflowField
          label="Vertrags- oder Kontonummer"
          name="contractOrAccountNumber"
        />
        <label>
          <span>Status der Zählernummer</span>
          <select name="meterNumberStatus">
            <option value="open">Offen</option>
            <option value="confirmed">Bestätigt</option>
          </select>
        </label>
        <WorkflowField label="Gültig von" name="validFrom" type="date" />
        <WorkflowField label="Gültig bis" name="validTo" type="date" />
        <WorkflowField label="Zählernotiz" name="note" />
        <button type="submit">Zähler anlegen</button>
      </form>

      {meter ? (
        <>
          <label>
            <span>Aktiver Zähler</span>
            <select
              value={meter.id}
              onChange={(event) => {
                setMeterId(event.target.value)
                setEditingMeter(false)
              }}
            >
              {meters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.meterNumber ?? item.address ?? 'Zähler ohne Nummer'}
                </option>
              ))}
            </select>
          </label>
          <section className="record-editor" aria-labelledby="meter-title">
            <div className="record-editor__heading">
              <div>
                <p className="section-kicker">
                  {meter.kind === 'heat' ? 'Wärmezähler' : 'Allgemeinstrom'}
                </p>
                <h2 id="meter-title">
                  {meter.meterNumber ?? 'Zähler ohne Nummer'}
                </h2>
                <small>{meter.provider ?? 'Ohne Versorger'}</small>
              </div>
              <button
                type="button"
                onClick={() => setEditingMeter((value) => !value)}
              >
                Zähler bearbeiten
              </button>
            </div>
            {editingMeter ? (
              <form className="embedded-form" noValidate onSubmit={saveMeter}>
                <label>
                  <span>Zählerart bearbeiten</span>
                  <select name="kind" defaultValue={meter.kind}>
                    <option value="general">Allgemeinstrom</option>
                    <option value="heat">Wärmeerzeugung</option>
                  </select>
                </label>
                <WorkflowField
                  label="Zählernummer bearbeiten"
                  name="meterNumber"
                  defaultValue={meter.meterNumber ?? ''}
                />
                <WorkflowField
                  label="Zähleradresse bearbeiten"
                  name="address"
                  defaultValue={meter.address ?? ''}
                />
                <WorkflowField
                  label="Marktlokations-ID bearbeiten"
                  name="maloId"
                  defaultValue={meter.maloId ?? ''}
                />
                <WorkflowField
                  label="Versorger bearbeiten"
                  name="provider"
                  defaultValue={meter.provider ?? ''}
                />
                <WorkflowField
                  label="Vertragsnummer bearbeiten"
                  name="contractOrAccountNumber"
                  defaultValue={meter.contractOrAccountNumber ?? ''}
                />
                <label>
                  <span>Status der Zählernummer bearbeiten</span>
                  <select
                    name="meterNumberStatus"
                    defaultValue={meter.meterNumberStatus ?? 'open'}
                  >
                    <option value="open">Offen</option>
                    <option value="confirmed">Bestätigt</option>
                  </select>
                </label>
                <WorkflowField
                  label="Gültig von bearbeiten"
                  name="validFrom"
                  type="date"
                  defaultValue={meter.validFrom ?? ''}
                />
                <WorkflowField
                  label="Gültig bis bearbeiten"
                  name="validTo"
                  type="date"
                  defaultValue={meter.validTo ?? ''}
                />
                <WorkflowField
                  label="Zählernotiz bearbeiten"
                  name="note"
                  defaultValue={meter.note ?? ''}
                />
                <WorkflowField
                  label="Zusatznotiz bearbeiten"
                  name="additionalNote"
                  defaultValue={meter.additionalNote ?? ''}
                />
                <button type="submit">Zähler speichern</button>
              </form>
            ) : null}
            <div className="danger-zone">
              <button
                type="button"
                onClick={() => setDeleteTarget({ kind: 'meter', id: meter.id })}
              >
                Zähler löschen
              </button>
            </div>
          </section>

          <form noValidate onSubmit={createReading}>
            <h2>Ablesung erfassen</h2>
            <WorkflowField label="Ablesedatum" name="date" type="date" />
            <WorkflowField label="Zählerstand" name="value" required />
            <label>
              <span>Ableseeinheit</span>
              <select name="unit" defaultValue="kWh">
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Quelle der Ablesung</span>
              <select name="source">
                <option value="manual">Manuell</option>
                <option value="imported">Importiert</option>
                <option value="estimated">Geschätzt</option>
              </select>
            </label>
            <WorkflowField label="Ablesenotiz" name="note" />
            <button type="submit">Ablesung erfassen</button>
          </form>

          <form noValidate onSubmit={saveStatus}>
            <h2>Jahresstatus {period.year}</h2>
            <label className="checkbox-field">
              <input
                type="checkbox"
                name="bookingPresent"
                defaultChecked={status?.bookingPresent ?? false}
              />
              <span>Bankbuchung vorhanden</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                name="annualInvoicePresent"
                defaultChecked={status?.annualInvoicePresent ?? false}
              />
              <span>Jahresrechnung vorhanden</span>
            </label>
            <WorkflowField
              label="Statusnotiz"
              name="note"
              defaultValue={status?.note ?? ''}
            />
            <WorkflowField
              label="Schätzbetrag in Euro"
              name="estimateAmount"
              defaultValue={
                status?.estimateAmountCents == null
                  ? ''
                  : (status.estimateAmountCents / 100).toFixed(2)
              }
            />
            <WorkflowField
              label="Schätzgrund"
              name="estimateReason"
              defaultValue={status?.estimateReason ?? ''}
            />
            <button type="submit">Jahresstatus speichern</button>
            {status ? (
              <button
                type="button"
                onClick={() =>
                  setDeleteTarget({ kind: 'status', id: status.id })
                }
              >
                Jahresstatus löschen
              </button>
            ) : null}
          </form>

          <section
            className="editable-records"
            aria-labelledby="readings-title"
          >
            <div className="data-panel__heading">
              <h2 id="readings-title">Ablesungen ({readings.length})</h2>
              <span>Aktives Abrechnungsjahr</span>
            </div>
            <div className="records-grid">
              {readings.map((reading) => (
                <article className="record-editor" key={reading.id}>
                  <div className="record-editor__heading">
                    <div>
                      <p className="section-kicker">
                        {reading.date ?? 'Ohne Datum'}
                      </p>
                      <h3>
                        {reading.value.value} {reading.value.unit}
                      </h3>
                      <small>{reading.source ?? 'Ohne Herkunft'}</small>
                    </div>
                    <button
                      type="button"
                      aria-label={`${reading.value.value} ${reading.value.unit} bearbeiten`}
                      onClick={() =>
                        setEditingReadingId(
                          editingReadingId === reading.id ? null : reading.id,
                        )
                      }
                    >
                      Bearbeiten
                    </button>
                  </div>
                  {editingReadingId === reading.id ? (
                    <form
                      className="embedded-form"
                      noValidate
                      onSubmit={(event) => saveReading(event, reading.id)}
                    >
                      <WorkflowField
                        label="Ablesedatum bearbeiten"
                        name="date"
                        type="date"
                        defaultValue={reading.date ?? ''}
                      />
                      <WorkflowField
                        label="Zählerstand bearbeiten"
                        name="value"
                        required
                        defaultValue={reading.value.value}
                      />
                      <label>
                        <span>Ableseeinheit bearbeiten</span>
                        <select name="unit" defaultValue={reading.value.unit}>
                          {UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Quelle bearbeiten</span>
                        <select
                          name="source"
                          defaultValue={reading.source ?? 'manual'}
                        >
                          <option value="manual">Manuell</option>
                          <option value="imported">Importiert</option>
                          <option value="estimated">Geschätzt</option>
                        </select>
                      </label>
                      <WorkflowField
                        label="Ablesenotiz bearbeiten"
                        name="note"
                        defaultValue={reading.note ?? ''}
                      />
                      <button type="submit">Ablesung speichern</button>
                    </form>
                  ) : null}
                  <div className="danger-zone">
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget({ kind: 'reading', id: reading.id })
                      }
                    >
                      Ablesung löschen
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p>Noch kein Zähler für dieses Objekt angelegt.</p>
      )}

      {deleteTarget ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-meter-title"
          >
            <h2 id="delete-meter-title">Zählerdatensatz löschen?</h2>
            <p>Verknüpfte Daten werden nicht automatisch entfernt.</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setDeleteTarget(undefined)}>
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
