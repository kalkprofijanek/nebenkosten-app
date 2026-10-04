import { useState, type FormEvent, type MouseEvent } from 'react'
import type {
  AppDataFile,
  OccupancyPeriod,
  BillingPeriod,
} from '@nebenkosten/schema'
import { WorkflowField } from './form-support'
import { formatEuroInput, parseOptionalNumber } from '../../app/form-parsers'
import { estimateConsumptionUnits } from '../occupancies/estimate-consumption'
function decimalInput(value: number): string {
  return String(value).replace('.', ',')
}

function optionalDecimal(value: number | null | undefined): string {
  return value == null ? '' : decimalInput(value)
}

interface Props {
  data: AppDataFile
  occupancy: OccupancyPeriod
  period: BillingPeriod
  saveTenant: (event: FormEvent<HTMLFormElement>, id: string) => void
  saveVacancy: (event: FormEvent<HTMLFormElement>, id: string) => void
}
export function OccupancyEditor({
  data,
  occupancy,
  period,
  saveTenant,
  saveVacancy,
}: Props) {
  const tenancy = data.masterData.tenancies.find(
    ({ id }) => id === occupancy.tenancyId,
  )
  const person = data.masterData.persons.find(({ id }) =>
    tenancy?.personIds.includes(id),
  )
  const currentPrepayment = data.billingData.prepayments.find(
    ({ occupancyPeriodId }) => occupancyPeriodId === occupancy.id,
  )
  const amount =
    currentPrepayment?.mode === 'monthly'
      ? currentPrepayment.monthlyAmountCents
      : currentPrepayment?.mode === 'annual'
        ? currentPrepayment.annualAmountCents
        : undefined
  const estimate = estimateConsumptionUnits(data, occupancy.id)
  function applyEstimate(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    if (!form || !estimate) return
    const field = (name: string) => form.elements.namedItem(name)
    const units = field('consumptionUnits')
    const estimated = field('consumptionUnitsEstimated')
    const reason = field('consumptionUnitsEstimateReason')
    if (units instanceof HTMLInputElement)
      units.value = String(estimate.value).replace('.', ',')
    if (estimated instanceof HTMLInputElement) estimated.checked = true
    if (reason instanceof HTMLInputElement) reason.value = estimate.reason
  }
  const reading = occupancy.heatMeterReading
  const [readingMessage, setReadingMessage] = useState<string | null>(null)
  function applyMeterReadings(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    if (!form) return
    const field = (name: string) => form.elements.namedItem(name)
    const value = (name: string) => {
      const element = field(name)
      return element instanceof HTMLInputElement ? element.value : ''
    }
    let start: number | null
    let end: number | null
    try {
      start = parseOptionalNumber(value('meterStartValue'))
      end = parseOptionalNumber(value('meterEndValue'))
    } catch {
      setReadingMessage('Bitte gültige Zählerstände eingeben.')
      return
    }
    if (start === null || end === null) {
      setReadingMessage('Bitte Stand alt und Stand neu eintragen.')
      return
    }
    const consumption = Math.round((end - start) * 1000) / 1000
    if (consumption < 0) {
      setReadingMessage('Stand neu ist kleiner als Stand alt.')
      return
    }
    const units = field('consumptionUnits')
    const estimated = field('consumptionUnitsEstimated')
    if (units instanceof HTMLInputElement)
      units.value = decimalInput(consumption)
    if (estimated instanceof HTMLInputElement) estimated.checked = false
    setReadingMessage(
      `Verbrauch ${decimalInput(consumption)} Einheiten vorbelegt; erst „Speichern“ übernimmt ihn.`,
    )
  }
  return (
    <>
      {' '}
      {occupancy.kind === 'tenant' ? (
        <form
          className="embedded-form"
          noValidate
          onSubmit={(event) => saveTenant(event, occupancy.id)}
        >
          <WorkflowField
            label="Anzeigename bearbeiten"
            name="displayName"
            required
            defaultValue={person?.displayName ?? ''}
          />
          <WorkflowField
            label="Vorname bearbeiten"
            name="firstName"
            defaultValue={person?.firstName ?? ''}
          />
          <WorkflowField
            label="Nachname bearbeiten"
            name="lastName"
            defaultValue={person?.lastName ?? ''}
          />
          <WorkflowField
            label="E-Mail bearbeiten"
            name="email"
            type="email"
            defaultValue={person?.email ?? ''}
          />
          <WorkflowField
            label="Einzug bearbeiten"
            name="from"
            type="date"
            defaultValue={occupancy.from ?? ''}
          />
          <WorkflowField
            label="Auszug bearbeiten"
            name="to"
            type="date"
            defaultValue={occupancy.to ?? ''}
          />
          <WorkflowField
            label="Personenzahl bearbeiten"
            name="persons"
            type="number"
            defaultValue={occupancy.persons?.value ?? ''}
          />
          <WorkflowField
            label="Mandatsreferenz bearbeiten"
            name="mandateReference"
            defaultValue={tenancy?.mandateReference ?? ''}
          />
          <WorkflowField
            label="Monatsmiete in Euro bearbeiten"
            name="monthlyRent"
            defaultValue={
              tenancy?.monthlyRentCents == null
                ? ''
                : formatEuroInput(tenancy.monthlyRentCents)
            }
          />
          <WorkflowField
            label="Versandstraße bearbeiten"
            name="shippingAddressStreet"
            defaultValue={tenancy?.shippingAddressStreet ?? ''}
          />
          <WorkflowField
            label="Versandort bearbeiten"
            name="shippingAddressPostalCodeAndCity"
            defaultValue={tenancy?.shippingAddressPostalCodeAndCity ?? ''}
          />
          <small>
            Leer lassen: Dann gilt automatisch die Wohnungs- bzw.
            Objektanschrift, auch nach einem Auszug. Eine bekannte neue
            Anschrift hier eintragen.
          </small>
          <fieldset className="meter-reading-fields">
            <legend>Zählerstände Heizung (Verbrauchserfassung)</legend>
            <WorkflowField
              label="Zählernummer bearbeiten"
              name="meterNumber"
              defaultValue={reading?.meterNumber ?? ''}
            />
            <WorkflowField
              label="Stand alt bearbeiten"
              name="meterStartValue"
              defaultValue={optionalDecimal(reading?.startValue)}
            />
            <WorkflowField
              label="Datum alt bearbeiten"
              name="meterStartDate"
              type="date"
              defaultValue={reading?.startDate ?? ''}
            />
            <WorkflowField
              label="Stand neu bearbeiten"
              name="meterEndValue"
              defaultValue={optionalDecimal(reading?.endValue)}
            />
            <WorkflowField
              label="Datum neu bearbeiten"
              name="meterEndDate"
              type="date"
              defaultValue={reading?.endDate ?? ''}
            />
            <button type="button" onClick={applyMeterReadings}>
              Verbrauch aus Zählerständen übernehmen
            </button>
            {readingMessage ? (
              <small role="status">{readingMessage}</small>
            ) : (
              <small>
                Setzt die Verbrauchseinheiten auf Stand neu − Stand alt; erst
                „Speichern“ übernimmt den Wert.
              </small>
            )}
          </fieldset>
          <WorkflowField
            label="Verbrauchseinheiten bearbeiten"
            name="consumptionUnits"
            defaultValue={occupancy.consumptionUnits?.value ?? ''}
          />
          <label className="checkbox-field">
            <input
              type="checkbox"
              name="consumptionUnitsEstimated"
              defaultChecked={occupancy.consumptionUnitsEstimated ?? false}
            />
            <span>Verbrauchseinheiten geschätzt</span>
          </label>
          {estimate ? (
            <div className="estimate-hint">
              <button type="button" onClick={applyEstimate}>
                Aus Heizkreis-Mittel schätzen (
                {String(estimate.value).replace('.', ',')} Einheiten)
              </button>
              <small>
                Füllt Wert, „geschätzt“ und Schätzgrund vor; erst „Speichern“
                übernimmt die Schätzung. Grundlage: {estimate.comparableCount}{' '}
                gemessene Nutzungen desselben Heizkreises.
              </small>
            </div>
          ) : null}
          <WorkflowField
            label="Schätzgrund Verbrauch bearbeiten"
            name="consumptionUnitsEstimateReason"
            defaultValue={occupancy.consumptionUnitsEstimateReason ?? ''}
          />
          <WorkflowField
            label="Kaltwasser in m³ bearbeiten"
            name="coldWater"
            defaultValue={occupancy.coldWater?.value ?? ''}
          />
          <WorkflowField
            label="Warmwasser in m³ bearbeiten"
            name="warmWater"
            defaultValue={occupancy.warmWater?.value ?? ''}
          />
          <label className="checkbox-field">
            <input
              type="checkbox"
              name="applySection12Reduction"
              defaultChecked={occupancy.applySection12Reduction ?? false}
            />
            <span>§ 12 HeizKV-Kürzung anwenden</span>
          </label>
          <label>
            <span>Kostenbereich bearbeiten</span>
            <select
              name="costScopeBuildingId"
              defaultValue={
                occupancy.costScope?.kind === 'building'
                  ? occupancy.costScope.buildingId
                  : ''
              }
            >
              <option value="">Gesamtes Objekt</option>
              {data.masterData.buildings
                .filter(({ propertyId }) => propertyId === period.propertyId)
                .map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Grundsteuerbereich bearbeiten</span>
            <select
              name="propertyTaxScopeBuildingId"
              defaultValue={
                occupancy.propertyTaxScope?.kind === 'building'
                  ? occupancy.propertyTaxScope.buildingId
                  : ''
              }
            >
              <option value="">Gesamtes Objekt</option>
              {data.masterData.buildings
                .filter(({ propertyId }) => propertyId === period.propertyId)
                .map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
            </select>
          </label>
          <WorkflowField
            label="Versanddatum bearbeiten"
            name="dispatchDate"
            type="date"
            defaultValue={occupancy.dispatchDate ?? ''}
          />
          <WorkflowField
            label="Nutzernotiz bearbeiten"
            name="note"
            defaultValue={occupancy.note ?? ''}
          />
          <label>
            <span>Vorauszahlungsart bearbeiten</span>
            <select
              name="prepaymentMode"
              defaultValue={currentPrepayment?.mode ?? 'none_agreed'}
            >
              <option value="monthly">Monatlich</option>
              <option value="annual">Jährlich</option>
              <option value="none_agreed">Keine vereinbart</option>
            </select>
          </label>
          <WorkflowField
            label="Vorauszahlung bearbeiten"
            name="prepaymentAmount"
            defaultValue={amount === undefined ? '' : formatEuroInput(amount)}
          />
          <button type="submit">Nutzerdaten speichern</button>
        </form>
      ) : null}
      {occupancy.kind === 'vacancy' ? (
        <form
          className="embedded-form"
          noValidate
          onSubmit={(event) => saveVacancy(event, occupancy.id)}
        >
          <WorkflowField
            label="Leerstand von bearbeiten"
            name="from"
            type="date"
            defaultValue={occupancy.from ?? ''}
          />
          <WorkflowField
            label="Leerstand bis bearbeiten"
            name="to"
            type="date"
            defaultValue={occupancy.to ?? ''}
          />
          <WorkflowField
            label="Leerstandsnotiz bearbeiten"
            name="note"
            defaultValue={occupancy.note ?? ''}
          />
          <button type="submit">Leerstand speichern</button>
        </form>
      ) : null}
    </>
  )
}
