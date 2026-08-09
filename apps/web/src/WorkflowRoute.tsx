import type { AppDataFile } from '@nebenkosten/schema'
import { useState, type FormEvent, type ReactNode } from 'react'

import { parseEuroCents, parseOptionalNumber } from './app/form-parsers'
import { createBillingPeriod } from './features/billing-periods/commands'
import { addCostCategory, addCostEntry } from './features/costs/commands'
import { CostDataOverview } from './features/costs/CostDataOverview'
import {
  addEnergySource,
  addHeatingCircuit,
  addHeatingSystem,
} from './features/heating/heating-commands'
import {
  createCompany,
  createPropertyStructure,
} from './features/master-data/commands'
import {
  addTenantOccupancy,
  addVacancyOccupancy,
} from './features/occupancies/commands'
import { BillingPeriodsRoute } from './features/workflows/BillingPeriodsRoute'
import { CompanyRoute } from './features/workflows/CompanyRoute'
import { OccupanciesRoute } from './features/workflows/OccupanciesRoute'
import { PropertyRoute } from './features/workflows/PropertyRoute'

export interface WorkflowSelection {
  readonly ownerCompanyId: string | null
  readonly propertyId: string | null
  readonly billingPeriodId: string | null
}

interface WorkflowRouteProps {
  readonly path: string
  readonly data: AppDataFile
  readonly selection: WorkflowSelection
  readonly onSelectionChange: (patch: Partial<WorkflowSelection>) => void
  readonly onApply: (transform: (data: AppDataFile) => AppDataFile) => boolean
}

type SubmitTransform = (data: AppDataFile) => AppDataFile
interface SubmitAction {
  readonly transform: SubmitTransform
  readonly selectionPatch?: Partial<WorkflowSelection>
}

function idFactory(ids: readonly string[]) {
  let index = 0
  return () => ids[index++] ?? crypto.randomUUID()
}

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim()
}

function optionalText(form: FormData, name: string): string | undefined {
  const value = text(form, name)
  return value === '' ? undefined : value
}

function Field({
  label,
  name,
  type = 'text',
  inputMode,
  required,
  children,
}: {
  readonly label: string
  readonly name: string
  readonly type?: string
  readonly inputMode?: 'decimal' | 'numeric'
  readonly required?: boolean
  readonly children?: ReactNode
}) {
  return (
    <label>
      <span>{label}</span>
      {children ?? (
        <input
          name={name}
          type={type}
          inputMode={inputMode}
          required={required}
        />
      )}
    </label>
  )
}

function Entries({
  empty,
  children,
}: {
  readonly empty: string
  readonly children: ReactNode
}) {
  return (
    <section aria-label="Vorhandene Einträge">
      <h2>Vorhandene Einträge</h2>
      {children || <p>{empty}</p>}
    </section>
  )
}

function ContextNeeded({ children }: { readonly children: ReactNode }) {
  return <p role="alert">{children}</p>
}

export function WorkflowRoute({
  path,
  data,
  selection,
  onSelectionChange,
  onApply,
}: WorkflowRouteProps) {
  const [error, setError] = useState<string | null>(null)

  const submit = (
    event: FormEvent<HTMLFormElement>,
    build: (form: FormData) => SubmitTransform | SubmitAction,
  ) => {
    event.preventDefault()
    setError(null)
    try {
      const built = build(new FormData(event.currentTarget))
      const action: SubmitAction =
        typeof built === 'function' ? { transform: built } : built
      const applied = onApply(action.transform)
      if (!applied) {
        setError('Die Änderung konnte nicht gespeichert werden.')
        return
      }
      event.currentTarget.reset()
      if (action.selectionPatch) onSelectionChange(action.selectionPatch)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Eingabe konnte nicht verarbeitet werden.',
      )
    }
  }

  const errorMessage = error ? <p role="alert">{error}</p> : null

  if (path === '/firmen') {
    return (
      <CompanyRoute
        data={data}
        selection={selection}
        onSelectionChange={onSelectionChange}
        onApply={onApply}
      />
    )
  }

  if (path === '/abrechnungsjahre') {
    if (!selection.propertyId) {
      return <ContextNeeded>Bitte zuerst ein Objekt auswählen.</ContextNeeded>
    }
    return (
      <BillingPeriodsRoute
        data={data}
        selection={selection}
        onSelectionChange={onSelectionChange}
        onApply={onApply}
      />
    )
  }

  if (path === '/objekte') {
    if (!selection.ownerCompanyId) {
      return (
        <ContextNeeded>
          Bitte zuerst eine Firma auswählen oder anlegen.
        </ContextNeeded>
      )
    }
    return (
      <PropertyRoute
        data={data}
        selection={selection}
        onSelectionChange={onSelectionChange}
        onApply={onApply}
      />
    )
  }

  if (path === '/firmen-legacy') {
    return (
      <>
        {errorMessage}
        <form
          noValidate
          onSubmit={(event) =>
            submit(event, (form) => {
              const organizationId = crypto.randomUUID()
              const ownerCompanyId = crypto.randomUUID()
              return {
                transform: (current) =>
                  createCompany(
                    current,
                    {
                      organizationName: text(form, 'organizationName'),
                      ownerCompanyName: text(form, 'ownerCompanyName'),
                      additionalNameLines: [
                        optionalText(form, 'additionalName'),
                      ].flatMap((value) => (value ? [value] : [])),
                    },
                    { createId: idFactory([organizationId, ownerCompanyId]) },
                  ),
                selectionPatch: {
                  ownerCompanyId,
                  propertyId: null,
                  billingPeriodId: null,
                },
              }
            })
          }
        >
          <Field label="Mandantenname" name="organizationName" required />
          <Field label="Firmenname" name="ownerCompanyName" required />
          <Field label="Zusätzliche Namenszeile" name="additionalName" />
          <button type="submit">Firma anlegen</button>
        </form>
        <label>
          <span>Aktive Firma</span>
          <select
            value={selection.ownerCompanyId ?? ''}
            onChange={(event) =>
              onSelectionChange({
                ownerCompanyId: event.target.value || null,
                propertyId: null,
                billingPeriodId: null,
              })
            }
          >
            <option value="">Bitte auswählen</option>
            {data.masterData.ownerCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <Entries empty="Noch keine Firma angelegt.">
          {data.masterData.ownerCompanies.length > 0 && (
            <ul>
              {data.masterData.ownerCompanies.map((company) => (
                <li key={company.id}>{company.name}</li>
              ))}
            </ul>
          )}
        </Entries>
      </>
    )
  }

  if (path === '/objekte-legacy') {
    if (!selection.ownerCompanyId)
      return (
        <ContextNeeded>
          Bitte zuerst eine Firma auswählen oder anlegen.
        </ContextNeeded>
      )
    const properties = data.masterData.properties.filter(
      ({ ownerCompanyId }) => ownerCompanyId === selection.ownerCompanyId,
    )
    return (
      <>
        {errorMessage}
        <form
          noValidate
          onSubmit={(event) =>
            submit(event, (form) => {
              const propertyId = crypto.randomUUID()
              const buildingId = crypto.randomUUID()
              const unitId = crypto.randomUUID()
              const usableAreaSqm = parseOptionalNumber(
                text(form, 'usableAreaSqm'),
              )
              if (usableAreaSqm === null) {
                throw new Error(
                  'Bitte die Nutzfläche der ersten Einheit angeben.',
                )
              }
              return {
                transform: (current) =>
                  createPropertyStructure(
                    current,
                    {
                      ownerCompanyId: selection.ownerCompanyId!,
                      internalNumber: optionalText(form, 'internalNumber'),
                      street: optionalText(form, 'street'),
                      postalCodeAndCity: optionalText(
                        form,
                        'postalCodeAndCity',
                      ),
                      buildingName: text(form, 'buildingName'),
                      buildingShortName: optionalText(
                        form,
                        'buildingShortName',
                      ),
                      unitLabel: text(form, 'unitLabel'),
                      usableAreaSqm,
                      heatedAreaSqm:
                        parseOptionalNumber(text(form, 'heatedAreaSqm')) ??
                        undefined,
                    },
                    {
                      createId: idFactory([propertyId, buildingId, unitId]),
                    },
                  ),
                selectionPatch: { propertyId, billingPeriodId: null },
              }
            })
          }
        >
          <Field label="Interne Objektnummer" name="internalNumber" />
          <Field label="Straße" name="street" />
          <Field label="Postleitzahl und Ort" name="postalCodeAndCity" />
          <Field label="Gebäudename" name="buildingName" required />
          <Field label="Gebäudekürzel" name="buildingShortName" />
          <Field label="Erste Einheit" name="unitLabel" required />
          <Field
            label="Nutzfläche in m²"
            name="usableAreaSqm"
            inputMode="decimal"
            required
          />
          <Field
            label="Beheizte Fläche in m²"
            name="heatedAreaSqm"
            inputMode="decimal"
          />
          <button type="submit">Objekt anlegen</button>
        </form>
        <label>
          <span>Aktives Objekt</span>
          <select
            value={selection.propertyId ?? ''}
            onChange={(event) =>
              onSelectionChange({
                propertyId: event.target.value || null,
                billingPeriodId: null,
              })
            }
          >
            <option value="">Bitte auswählen</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.internalNumber ??
                  property.address?.street ??
                  'Objekt ohne Bezeichnung'}
              </option>
            ))}
          </select>
        </label>
        <Entries empty="Noch kein Objekt angelegt.">
          {properties.length > 0 && (
            <ul>
              {properties.map((property) => (
                <li key={property.id}>
                  {property.internalNumber ??
                    property.address?.street ??
                    'Objekt ohne Bezeichnung'}
                </li>
              ))}
            </ul>
          )}
        </Entries>
      </>
    )
  }

  if (path === '/abrechnungsjahre-legacy') {
    if (!selection.propertyId)
      return <ContextNeeded>Bitte zuerst ein Objekt auswählen.</ContextNeeded>
    const periods = data.billingData.billingPeriods.filter(
      ({ propertyId }) => propertyId === selection.propertyId,
    )
    return (
      <>
        {errorMessage}
        <form
          noValidate
          onSubmit={(event) =>
            submit(event, (form) => {
              const billingPeriodId = crypto.randomUUID()
              return {
                transform: (current) =>
                  createBillingPeriod(
                    current,
                    {
                      propertyId: selection.propertyId!,
                      year: Number(text(form, 'year')),
                    },
                    { createId: idFactory([billingPeriodId]) },
                  ),
                selectionPatch: { billingPeriodId },
              }
            })
          }
        >
          <Field label="Abrechnungsjahr" name="year" type="number" required />
          <button type="submit">Abrechnungsjahr anlegen</button>
        </form>
        <label>
          <span>Aktives Abrechnungsjahr</span>
          <select
            value={selection.billingPeriodId ?? ''}
            onChange={(event) =>
              onSelectionChange({
                billingPeriodId: event.target.value || null,
              })
            }
          >
            <option value="">Bitte auswählen</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.year}
              </option>
            ))}
          </select>
        </label>
        <Entries empty="Noch kein Abrechnungsjahr angelegt.">
          {periods.length > 0 && (
            <ul>
              {periods.map((period) => (
                <li key={period.id}>
                  {period.year} · {period.status}
                </li>
              ))}
            </ul>
          )}
        </Entries>
      </>
    )
  }

  if (!selection.billingPeriodId)
    return (
      <ContextNeeded>Bitte zuerst ein Abrechnungsjahr auswählen.</ContextNeeded>
    )

  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === selection.billingPeriodId,
  )
  if (!period)
    return (
      <ContextNeeded>
        Das ausgewählte Abrechnungsjahr ist nicht mehr vorhanden.
      </ContextNeeded>
    )

  if (path === '/nutzer') {
    return (
      <OccupanciesRoute
        data={data}
        selection={selection}
        onSelectionChange={onSelectionChange}
        onApply={onApply}
      />
    )
  }

  if (path === '/nutzer-legacy') {
    const units = data.masterData.units.filter(
      ({ propertyId }) => propertyId === period.propertyId,
    )
    const occupancies = data.billingData.occupancyPeriods.filter(
      ({ billingPeriodId }) => billingPeriodId === period.id,
    )
    return (
      <>
        {errorMessage}
        {units.length === 0 ? (
          <ContextNeeded>
            Für dieses Objekt ist noch keine Einheit vorhanden.
          </ContextNeeded>
        ) : (
          <form
            noValidate
            onSubmit={(event) =>
              submit(event, (form) => (current) => {
                const mode = text(form, 'prepaymentMode')
                const amount = text(form, 'prepaymentAmount')
                const prepayment =
                  mode === 'none_agreed'
                    ? ({ mode } as const)
                    : mode === 'annual'
                      ? ({
                          mode,
                          annualAmountCents: parseEuroCents(amount),
                        } as const)
                      : ({
                          mode: 'monthly',
                          monthlyAmountCents: parseEuroCents(amount),
                        } as const)
                return addTenantOccupancy(current, {
                  billingPeriodId: period.id,
                  unitId: text(form, 'unitId'),
                  person: { displayName: text(form, 'displayName') },
                  occupancy: {
                    from: optionalText(form, 'from'),
                    to: optionalText(form, 'to'),
                    persons:
                      parseOptionalNumber(text(form, 'persons')) ?? undefined,
                  },
                  prepayment,
                })
              })
            }
          >
            <Field label="Einheit" name="unitId">
              <select name="unitId" required>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Anzeigename" name="displayName" required />
            <Field label="Einzug" name="from" type="date" />
            <Field label="Auszug" name="to" type="date" />
            <Field label="Personenzahl" name="persons" type="number" />
            <Field label="Vorauszahlungsart" name="prepaymentMode">
              <select name="prepaymentMode">
                <option value="monthly">Monatlich</option>
                <option value="annual">Jährlich</option>
                <option value="none_agreed">Keine vereinbart</option>
              </select>
            </Field>
            <Field
              label="Vorauszahlung in Euro"
              name="prepaymentAmount"
              inputMode="decimal"
            />
            <button type="submit">Nutzer anlegen</button>
          </form>
        )}
        {units.length > 0 ? (
          <form
            noValidate
            onSubmit={(event) =>
              submit(
                event,
                (form) => (current) =>
                  addVacancyOccupancy(current, {
                    billingPeriodId: period.id,
                    unitId: text(form, 'unitId'),
                    from: optionalText(form, 'from'),
                    to: optionalText(form, 'to'),
                    note: optionalText(form, 'note'),
                  }),
              )
            }
          >
            <h2>Leerstand erfassen</h2>
            <Field label="Leerstandseinheit" name="unitId">
              <select name="unitId" required>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Leerstand von" name="from" type="date" />
            <Field label="Leerstand bis" name="to" type="date" />
            <Field label="Leerstandsnotiz" name="note" />
            <button type="submit">Leerstand anlegen</button>
          </form>
        ) : null}
        <Entries empty="Noch keine Nutzung erfasst.">
          {occupancies.length > 0 && (
            <ul>
              {occupancies.map((occupancy) => {
                const tenancy = data.masterData.tenancies.find(
                  ({ id }) => id === occupancy.tenancyId,
                )
                const person = data.masterData.persons.find(({ id }) =>
                  tenancy?.personIds.includes(id),
                )
                return (
                  <li key={occupancy.id}>
                    {occupancy.kind === 'vacancy'
                      ? 'Leerstand'
                      : (person?.displayName ?? 'Nutzer ohne Anzeigename')}
                  </li>
                )
              })}
            </ul>
          )}
        </Entries>
      </>
    )
  }

  if (path === '/kosten') {
    const categories = data.billingData.costCategories.filter(
      ({ billingPeriodId }) => billingPeriodId === period.id,
    )
    return (
      <>
        {errorMessage}
        <form
          noValidate
          onSubmit={(event) =>
            submit(event, (form) => (current) => {
              let next = addCostCategory(current, {
                billingPeriodId: period.id,
                kind: text(form, 'kind') as 'operating' | 'water' | 'heating',
                label: text(form, 'label'),
                allocationKey: text(form, 'allocationKey') as
                  | 'usable_area'
                  | 'heated_area'
                  | 'consumption_units'
                  | 'residential_units'
                  | 'direct',
                scope: { kind: 'property' },
              })
              const categoryId = next.billingData.costCategories.at(-1)!.id
              next = addCostEntry(next, {
                costCategoryId: categoryId,
                date: optionalText(form, 'date'),
                description: optionalText(form, 'description'),
                amountCents: parseEuroCents(text(form, 'amount')),
              })
              return next
            })
          }
        >
          <Field label="Kostenart" name="label" required />
          <Field label="Typ" name="kind">
            <select name="kind">
              <option value="operating">Betriebskosten</option>
              <option value="water">Wasser</option>
              <option value="heating">Heizung</option>
            </select>
          </Field>
          <Field label="Umlageschlüssel" name="allocationKey">
            <select name="allocationKey">
              <option value="usable_area">Nutzfläche</option>
              <option value="heated_area">Beheizte Fläche</option>
              <option value="residential_units">Wohneinheiten</option>
              <option value="direct">Direkt</option>
            </select>
          </Field>
          <Field label="Belegdatum" name="date" type="date" />
          <Field label="Beschreibung" name="description" />
          <Field label="Betrag in Euro" name="amount" required />
          <button type="submit">Kosten erfassen</button>
        </form>
        <CostDataOverview
          categories={categories}
          entries={data.billingData.costEntries}
          bankBookings={data.billingData.bankBookings}
          propertyId={period.propertyId}
          billingYear={period.year}
        />
      </>
    )
  }

  if (path === '/heizkreise') {
    const buildings = data.masterData.buildings.filter(
      ({ propertyId }) => propertyId === period.propertyId,
    )
    const circuits = data.billingData.heatingCircuits.filter(
      ({ billingPeriodId }) => billingPeriodId === period.id,
    )
    return (
      <>
        {errorMessage}
        {buildings.length === 0 ? (
          <ContextNeeded>
            Für dieses Objekt ist noch kein Gebäude vorhanden.
          </ContextNeeded>
        ) : (
          <form
            noValidate
            onSubmit={(event) =>
              submit(event, (form) => (current) => {
                const dependencies = { createId: () => crypto.randomUUID() }
                let next = addHeatingSystem(
                  current,
                  {
                    propertyId: period.propertyId,
                    name: text(form, 'systemName'),
                  },
                  dependencies,
                )
                const heatingSystemId =
                  next.masterData.heatingSystems.at(-1)!.id
                next = addHeatingCircuit(
                  next,
                  {
                    billingPeriodId: period.id,
                    heatingSystemId,
                    buildingId: text(form, 'buildingId'),
                    hasCentralHotWater: false,
                  },
                  dependencies,
                )
                const heatingCircuitId =
                  next.billingData.heatingCircuits.at(-1)!.id
                return addEnergySource(
                  next,
                  {
                    heatingCircuitId,
                    key: text(form, 'sourceKey'),
                    name: text(form, 'sourceName'),
                    sourceType: text(form, 'sourceType'),
                  },
                  dependencies,
                )
              })
            }
          >
            <Field label="Gebäude" name="buildingId">
              <select name="buildingId" required>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Heizsystem" name="systemName" required />
            <Field label="Quellenschlüssel" name="sourceKey" required />
            <Field label="Energiequelle" name="sourceName" required />
            <Field label="Energieträger" name="sourceType" required />
            <button type="submit">Heizkreis anlegen</button>
          </form>
        )}
        <Entries empty="Noch kein Heizkreis angelegt.">
          {circuits.length > 0 && (
            <ul>
              {circuits.map((circuit) => {
                const source = data.billingData.energySources.find(
                  ({ heatingCircuitId }) => heatingCircuitId === circuit.id,
                )
                return (
                  <li key={circuit.id}>
                    {source?.name ?? 'Heizkreis ohne Energiequelle'}
                  </li>
                )
              })}
            </ul>
          )}
        </Entries>
      </>
    )
  }

  return null
}
