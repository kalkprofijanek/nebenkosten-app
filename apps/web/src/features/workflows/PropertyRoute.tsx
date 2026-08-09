import { useState, type FormEvent } from 'react'
import { parseOptionalNumber } from '../../app/form-parsers'
import {
  addBuilding,
  addUnit,
  createPropertyStructure,
  deleteProperty,
  updateBuilding,
  updateProperty,
  updateUnit,
} from '../master-data/commands'
import { ExistingEntries, WorkflowField } from './form-support'
import { formOptionalText, formText } from './form-values'
import type { WorkflowSubRouteProps } from './route-types'

function idFactory(values: readonly string[]) {
  let index = 0
  return () => values[index++] ?? crypto.randomUUID()
}

function number(form: FormData, name: string) {
  return parseOptionalNumber(formText(form, name)) ?? undefined
}

export function PropertyRoute({
  data,
  selection,
  onSelectionChange,
  onApply,
}: WorkflowSubRouteProps) {
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const properties = data.masterData.properties.filter(
    ({ ownerCompanyId }) => ownerCompanyId === selection.ownerCompanyId,
  )
  const property = properties.find(({ id }) => id === selection.propertyId)
  const buildings = data.masterData.buildings.filter(
    ({ propertyId }) => propertyId === property?.id,
  )
  const units = data.masterData.units.filter(
    ({ propertyId }) => propertyId === property?.id,
  )

  function apply(transform: Parameters<typeof onApply>[0]) {
    setError(null)
    try {
      const accepted = onApply(transform)
      if (!accepted) setError('Die Änderung konnte nicht gespeichert werden.')
      return accepted
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Eingabe konnte nicht verarbeitet werden.',
      )
      return false
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const propertyId = crypto.randomUUID()
    const buildingId = crypto.randomUUID()
    const unitId = crypto.randomUUID()
    const usableAreaSqm = number(form, 'usableAreaSqm')
    if (usableAreaSqm === undefined) {
      setError('Bitte die Nutzfläche der ersten Einheit angeben.')
      return
    }
    if (
      apply((current) =>
        createPropertyStructure(
          current,
          {
            ownerCompanyId: selection.ownerCompanyId!,
            internalNumber: formOptionalText(form, 'internalNumber'),
            street: formOptionalText(form, 'street'),
            postalCodeAndCity: formOptionalText(form, 'postalCodeAndCity'),
            buildingName: formText(form, 'buildingName'),
            buildingShortName: formOptionalText(form, 'buildingShortName'),
            unitLabel: formText(form, 'unitLabel'),
            usableAreaSqm,
            heatedAreaSqm: number(form, 'heatedAreaSqm'),
          },
          { createId: idFactory([propertyId, buildingId, unitId]) },
        ),
      )
    ) {
      event.currentTarget.reset()
      onSelectionChange({ propertyId, billingPeriodId: null })
    }
  }

  function saveProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!property) return
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        updateProperty(current, property.id, {
          internalNumber: formOptionalText(form, 'internalNumber'),
          externalNumber: formOptionalText(form, 'externalNumber'),
          street: formOptionalText(form, 'street'),
          postalCodeAndCity: formOptionalText(form, 'postalCodeAndCity'),
        }),
      )
    )
      setEditing(false)
  }

  function createBuilding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!property) return
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        addBuilding(current, {
          propertyId: property.id,
          name: formText(form, 'name'),
          shortName: formOptionalText(form, 'shortName'),
        }),
      )
    )
      event.currentTarget.reset()
  }

  function saveBuilding(event: FormEvent<HTMLFormElement>, buildingId: string) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    apply((current) =>
      updateBuilding(current, buildingId, {
        name: formText(form, 'name'),
        shortName: formOptionalText(form, 'shortName'),
      }),
    )
  }

  function createUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!property) return
    const form = new FormData(event.currentTarget)
    if (
      apply((current) =>
        addUnit(current, {
          propertyId: property.id,
          buildingId: formOptionalText(form, 'buildingId'),
          label: formText(form, 'label'),
          location: formOptionalText(form, 'location'),
          usableAreaSqm: number(form, 'usableAreaSqm'),
          heatedAreaSqm: number(form, 'heatedAreaSqm'),
          roomCount: number(form, 'roomCount'),
        }),
      )
    )
      event.currentTarget.reset()
  }

  function saveUnit(event: FormEvent<HTMLFormElement>, unitId: string) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    apply((current) =>
      updateUnit(current, unitId, {
        buildingId: formOptionalText(form, 'buildingId') ?? null,
        label: formText(form, 'label'),
        location: formOptionalText(form, 'location'),
        usableAreaSqm: number(form, 'usableAreaSqm'),
        heatedAreaSqm: number(form, 'heatedAreaSqm'),
        roomCount: number(form, 'roomCount'),
      }),
    )
  }

  function confirmDelete() {
    if (!property) return
    if (apply((current) => deleteProperty(current, property.id))) {
      setEditing(false)
      setDeleteArmed(false)
      onSelectionChange({ propertyId: null, billingPeriodId: null })
    }
  }

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <form noValidate onSubmit={create}>
        <WorkflowField label="Interne Objektnummer" name="internalNumber" />
        <WorkflowField label="Straße" name="street" />
        <WorkflowField label="Postleitzahl und Ort" name="postalCodeAndCity" />
        <WorkflowField label="Gebäudename" name="buildingName" required />
        <WorkflowField label="Gebäudekürzel" name="buildingShortName" />
        <WorkflowField label="Erste Einheit" name="unitLabel" required />
        <WorkflowField label="Nutzfläche in m²" name="usableAreaSqm" required />
        <WorkflowField label="Beheizte Fläche in m²" name="heatedAreaSqm" />
        <button type="submit">Objekt anlegen</button>
      </form>
      <label>
        <span>Aktives Objekt</span>
        <select
          value={selection.propertyId ?? ''}
          onChange={(event) => {
            setEditing(false)
            setDeleteArmed(false)
            onSelectionChange({
              propertyId: event.target.value || null,
              billingPeriodId: null,
            })
          }}
        >
          <option value="">Bitte auswählen</option>
          {properties.map((item) => (
            <option key={item.id} value={item.id}>
              {item.internalNumber ??
                item.address?.street ??
                'Objekt ohne Bezeichnung'}
            </option>
          ))}
        </select>
      </label>

      {!property ? null : (
        <>
          <section
            className="record-editor"
            aria-labelledby="property-editor-title"
          >
            <div className="record-editor__heading">
              <div>
                <p className="section-kicker">Aktives Objekt</p>
                <h2 id="property-editor-title">
                  {property.internalNumber ??
                    property.address?.street ??
                    'Objekt ohne Bezeichnung'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? 'Bearbeitung schließen' : 'Objekt bearbeiten'}
              </button>
            </div>
            {editing ? (
              <form
                className="embedded-form"
                noValidate
                onSubmit={saveProperty}
              >
                <WorkflowField
                  label="Interne Objektnummer bearbeiten"
                  name="internalNumber"
                  defaultValue={property.internalNumber ?? ''}
                />
                <WorkflowField
                  label="Externe Objektnummer bearbeiten"
                  name="externalNumber"
                  defaultValue={property.externalNumber ?? ''}
                />
                <WorkflowField
                  label="Straße bearbeiten"
                  name="street"
                  defaultValue={property.address?.street ?? ''}
                />
                <WorkflowField
                  label="Postleitzahl und Ort bearbeiten"
                  name="postalCodeAndCity"
                  defaultValue={property.address?.postalCodeAndCity ?? ''}
                />
                <button type="submit">Objektdaten speichern</button>
              </form>
            ) : null}
            <div className="danger-zone">
              {deleteArmed ? (
                <>
                  <p>
                    Objekte mit Abrechnungsjahren oder abhängigen Stammdaten
                    können nicht gelöscht werden.
                  </p>
                  <button type="button" onClick={confirmDelete}>
                    Löschen bestätigen
                  </button>
                  <button type="button" onClick={() => setDeleteArmed(false)}>
                    Abbrechen
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setDeleteArmed(true)}>
                  Objekt löschen
                </button>
              )}
            </div>
          </section>

          <section className="record-editor" aria-labelledby="buildings-title">
            <h2 id="buildings-title">Gebäude</h2>
            <form
              className="embedded-form"
              noValidate
              onSubmit={createBuilding}
            >
              <WorkflowField label="Neuer Gebäudename" name="name" required />
              <WorkflowField label="Neues Gebäudekürzel" name="shortName" />
              <button type="submit">Gebäude hinzufügen</button>
            </form>
            <div className="editable-record-list">
              {buildings.map((building) => (
                <form
                  key={building.id}
                  className="embedded-form"
                  noValidate
                  onSubmit={(event) => saveBuilding(event, building.id)}
                >
                  <WorkflowField
                    label="Gebäudename bearbeiten"
                    name="name"
                    required
                    defaultValue={building.name}
                  />
                  <WorkflowField
                    label="Gebäudekürzel bearbeiten"
                    name="shortName"
                    defaultValue={building.shortName ?? ''}
                  />
                  <button type="submit">Gebäude speichern</button>
                </form>
              ))}
            </div>
          </section>

          <section className="record-editor" aria-labelledby="units-title">
            <h2 id="units-title">Einheiten</h2>
            <form className="embedded-form" noValidate onSubmit={createUnit}>
              <label>
                <span>Gebäude der neuen Einheit</span>
                <select name="buildingId">
                  <option value="">Ohne Gebäude</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </label>
              <WorkflowField
                label="Neue Einheitenbezeichnung"
                name="label"
                required
              />
              <WorkflowField label="Neue Lage" name="location" />
              <WorkflowField
                label="Neue Nutzfläche in m²"
                name="usableAreaSqm"
              />
              <WorkflowField
                label="Neue beheizte Fläche in m²"
                name="heatedAreaSqm"
              />
              <WorkflowField
                label="Neue Raumanzahl"
                name="roomCount"
                type="number"
              />
              <button type="submit">Einheit hinzufügen</button>
            </form>
            <div className="editable-record-list">
              {units.map((unit) => (
                <form
                  key={unit.id}
                  className="embedded-form"
                  noValidate
                  onSubmit={(event) => saveUnit(event, unit.id)}
                >
                  <label>
                    <span>Gebäudezuordnung bearbeiten</span>
                    <select
                      name="buildingId"
                      defaultValue={unit.buildingId ?? ''}
                    >
                      <option value="">Ohne Gebäude</option>
                      {buildings.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <WorkflowField
                    label="Einheitenbezeichnung bearbeiten"
                    name="label"
                    required
                    defaultValue={unit.label ?? ''}
                  />
                  <WorkflowField
                    label="Lage bearbeiten"
                    name="location"
                    defaultValue={unit.location ?? ''}
                  />
                  <WorkflowField
                    label="Nutzfläche bearbeiten"
                    name="usableAreaSqm"
                    defaultValue={unit.usableAreaSqm?.value ?? ''}
                  />
                  <WorkflowField
                    label="Beheizte Fläche bearbeiten"
                    name="heatedAreaSqm"
                    defaultValue={unit.heatedAreaSqm?.value ?? ''}
                  />
                  <WorkflowField
                    label="Raumanzahl bearbeiten"
                    name="roomCount"
                    type="number"
                    defaultValue={unit.roomCount ?? ''}
                  />
                  <button type="submit">Einheit speichern</button>
                </form>
              ))}
            </div>
          </section>
        </>
      )}
      <ExistingEntries empty="Noch kein Objekt angelegt.">
        {properties.length > 0 && (
          <ul>
            {properties.map((item) => (
              <li key={item.id}>
                {item.internalNumber ??
                  item.address?.street ??
                  'Objekt ohne Bezeichnung'}
              </li>
            ))}
          </ul>
        )}
      </ExistingEntries>
    </>
  )
}
