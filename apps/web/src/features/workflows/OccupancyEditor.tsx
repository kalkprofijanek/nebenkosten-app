import type { FormEvent } from 'react'
import type {
  AppDataFile,
  OccupancyPeriod,
  BillingPeriod,
} from '@nebenkosten/schema'
import { WorkflowField } from './form-support'
import { formatEuroInput } from '../../app/form-parsers'
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
            Leer lassen, solange der Mieter in der Wohnung wohnt: Dann gilt
            automatisch die Wohnungs- bzw. Objektanschrift. Nach einem Auszug
            die neue Anschrift eintragen.
          </small>
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
