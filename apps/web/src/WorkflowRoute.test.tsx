import { encodeCurrentAppData } from '@nebenkosten/import-export'
import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createCompany,
  createPropertyStructure,
} from './features/master-data/commands'
import { createBillingPeriod } from './features/billing-periods/commands'
import {
  addEnergySource,
  addFuelDelivery,
  addFuelStock,
  addHeatingCircuit,
  addHeatingSystem,
} from './features/heating/heating-commands'
import { addCostCategory, addCostEntry } from './features/costs/commands'
import { addTenantOccupancy } from './features/occupancies/commands'
import { WorkflowRoute, type WorkflowSelection } from './WorkflowRoute'

const TEST_CONTACT_EMAIL = ['kontakt', 'example.invalid'].join('@')

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderRoute(
  path: string,
  initialData: AppDataFile = createEmptyAppDataFile(),
  selection: WorkflowSelection = {
    ownerCompanyId: null,
    propertyId: null,
    billingPeriodId: null,
  },
) {
  let data = initialData
  const onSelectionChange = vi.fn()
  const onApply = vi.fn((transform: (file: AppDataFile) => AppDataFile) => {
    data = transform(data)
    return true
  })
  render(
    <WorkflowRoute
      path={path}
      data={data}
      selection={selection}
      onSelectionChange={onSelectionChange}
      onApply={onApply}
    />,
  )
  return { onApply, onSelectionChange, getData: () => data }
}

const SEEDED_IDS = {
  organization: '20000000-0000-4000-8000-000000000001',
  company: '20000000-0000-4000-8000-000000000002',
  property: '20000000-0000-4000-8000-000000000003',
  building: '20000000-0000-4000-8000-000000000004',
  unit: '20000000-0000-4000-8000-000000000005',
  period: '20000000-0000-4000-8000-000000000006',
} as const

function seededData(): AppDataFile {
  let data = createCompany(
    createEmptyAppDataFile(),
    { organizationName: 'Musterverwaltung', ownerCompanyName: 'Muster GmbH' },
    {
      createId: (() => {
        const ids = [SEEDED_IDS.organization, SEEDED_IDS.company]
        return () => ids.shift()!
      })(),
    },
  )
  data = createPropertyStructure(
    data,
    {
      ownerCompanyId: SEEDED_IDS.company,
      internalNumber: 'OBJ-1',
      buildingName: 'Haus A',
      unitLabel: 'Wohnung 1',
    },
    {
      createId: (() => {
        const ids = [SEEDED_IDS.property, SEEDED_IDS.building, SEEDED_IDS.unit]
        return () => ids.shift()!
      })(),
    },
  )
  return createBillingPeriod(
    data,
    { propertyId: SEEDED_IDS.property, year: 2026 },
    { createId: () => SEEDED_IDS.period },
  )
}

function seededHeatingData(): AppDataFile {
  let data = addHeatingSystem(
    seededData(),
    { propertyId: SEEDED_IDS.property, name: 'Zentralheizung' },
    { createId: () => '20000000-0000-4000-8000-000000000021' },
  )
  data = addHeatingCircuit(
    data,
    {
      billingPeriodId: SEEDED_IDS.period,
      heatingSystemId: '20000000-0000-4000-8000-000000000021',
      buildingId: SEEDED_IDS.building,
      hasCentralHotWater: false,
    },
    { createId: () => '20000000-0000-4000-8000-000000000022' },
  )
  return addEnergySource(
    data,
    {
      heatingCircuitId: '20000000-0000-4000-8000-000000000022',
      key: 'haupt',
      name: 'Fiktive Wärmequelle',
      sourceType: 'Heizöl',
    },
    { createId: () => '20000000-0000-4000-8000-000000000023' },
  )
}

const SEEDED_SELECTION: WorkflowSelection = {
  ownerCompanyId: SEEDED_IDS.company,
  propertyId: SEEDED_IDS.property,
  billingPeriodId: SEEDED_IDS.period,
}

describe('WorkflowRoute', () => {
  it('legt eine Firma über beschriftete Felder an und wählt sie aus', () => {
    const result = renderRoute('/firmen')

    fireEvent.change(screen.getByLabelText('Mandantenname'), {
      target: { value: 'Beispiel Verwaltung' },
    })
    fireEvent.change(screen.getByLabelText('Firmenname'), {
      target: { value: 'Beispiel Wohnen GmbH' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Firma anlegen' }))

    expect(result.onApply).toHaveBeenCalledOnce()
    expect(result.getData().masterData.ownerCompanies).toHaveLength(1)
    expect(result.onSelectionChange).toHaveBeenCalledWith({
      ownerCompanyId: result.getData().masterData.ownerCompanies[0]!.id,
      propertyId: null,
      billingPeriodId: null,
    })
  })

  it('zeigt Fehler zugänglich an und verwirft ungültige Firmendaten', () => {
    const result = renderRoute('/firmen')

    fireEvent.change(screen.getByLabelText('Mandantenname'), {
      target: { value: ' ' },
    })
    fireEvent.change(screen.getByLabelText('Firmenname'), {
      target: { value: 'Firma' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Firma anlegen' }))

    expect(result.onApply).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('Mandantenname')
    expect(result.getData().masterData.ownerCompanies).toHaveLength(0)
  })

  it('bearbeitet die aktive Firma mit Anschrift und Bankdaten', () => {
    const result = renderRoute('/firmen', seededData(), SEEDED_SELECTION)

    fireEvent.click(screen.getByRole('button', { name: 'Firma bearbeiten' }))
    fireEvent.change(screen.getByLabelText('Firmenname bearbeiten'), {
      target: { value: 'Aktualisierte Eigentümerin' },
    })
    fireEvent.change(screen.getByLabelText('Bankname bearbeiten'), {
      target: { value: 'Fiktive Testbank' },
    })
    fireEvent.change(screen.getByLabelText('Postfach bearbeiten'), {
      target: { value: 'Testpostfach' },
    })
    fireEvent.change(screen.getByLabelText('E-Mail Kontakt bearbeiten'), {
      target: { value: TEST_CONTACT_EMAIL },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Änderungen speichern' }),
    )

    expect(result.getData().masterData.ownerCompanies[0]).toMatchObject({
      name: 'Aktualisierte Eigentümerin',
      bankAccount: { bankName: 'Fiktive Testbank' },
      postBox: 'Testpostfach',
      contact: { email: TEST_CONTACT_EMAIL },
    })
  })

  it('verlangt eine ausdrückliche Bestätigung vor dem Löschen', () => {
    const companyOnly = createCompany(
      createEmptyAppDataFile(),
      { organizationName: 'Verwaltung', ownerCompanyName: 'Firma' },
      {
        createId: (() => {
          const ids = [SEEDED_IDS.organization, SEEDED_IDS.company]
          return () => ids.shift()!
        })(),
      },
    )
    const result = renderRoute('/firmen', companyOnly, {
      ownerCompanyId: SEEDED_IDS.company,
      propertyId: null,
      billingPeriodId: null,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Firma löschen' }))
    expect(result.getData().masterData.ownerCompanies).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))

    expect(result.getData().masterData.ownerCompanies).toHaveLength(0)
    expect(result.onSelectionChange).toHaveBeenCalledWith({
      ownerCompanyId: null,
      propertyId: null,
      billingPeriodId: null,
    })
  })

  it('verlangt für Objekte eine ausgewählte Firma', () => {
    renderRoute('/objekte')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte zuerst eine Firma auswählen',
    )
    expect(
      screen.queryByRole('button', { name: 'Objekt anlegen' }),
    ).not.toBeInTheDocument()
  })

  it('begrenzt Objektlisten und Auswahl auf die aktive Firma', () => {
    const ids: ReturnType<Crypto['randomUUID']>[] = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000005',
    ]
    let index = 0
    const company = createCompany(
      createEmptyAppDataFile(),
      { organizationName: 'Verwaltung', ownerCompanyName: 'Firma A' },
      { createId: () => ids[index++]! },
    )
    const withProperty = createPropertyStructure(
      company,
      {
        ownerCompanyId: ids[1]!,
        internalNumber: 'A-01',
        buildingName: 'Haus A',
        unitLabel: 'Wohnung 1',
      },
      { createId: () => ids[index++]! },
    )

    renderRoute('/objekte', withProperty, {
      ownerCompanyId: ids[1]!,
      propertyId: null,
      billingPeriodId: null,
    })

    expect(screen.getAllByText('A-01')).toHaveLength(2)
    expect(screen.getByLabelText('Aktives Objekt')).toHaveValue('')
  })

  it('legt ein Objekt an und setzt es als aktive Auswahl', () => {
    const ids: ReturnType<Crypto['randomUUID']>[] = [
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
    ]
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => ids.shift()!)
    const companyData = createCompany(
      createEmptyAppDataFile(),
      { organizationName: 'Verwaltung', ownerCompanyName: 'Firma' },
      {
        createId: (() => {
          const ids = [SEEDED_IDS.organization, SEEDED_IDS.company]
          return () => ids.shift()!
        })(),
      },
    )
    const result = renderRoute('/objekte', companyData, {
      ownerCompanyId: SEEDED_IDS.company,
      propertyId: null,
      billingPeriodId: null,
    })

    fireEvent.change(screen.getByLabelText('Interne Objektnummer'), {
      target: { value: 'OBJ-9' },
    })
    fireEvent.change(screen.getByLabelText('Gebäudename'), {
      target: { value: 'Haupthaus' },
    })
    fireEvent.change(screen.getByLabelText('Erste Einheit'), {
      target: { value: 'Wohnung A' },
    })
    fireEvent.change(screen.getByLabelText('Nutzfläche in m²'), {
      target: { value: '72,5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Objekt anlegen' }))

    expect(result.getData().masterData.properties).toHaveLength(1)
    expect(result.getData().masterData.buildings).toHaveLength(1)
    expect(result.getData().masterData.units).toHaveLength(1)
    expect(result.getData().masterData.units[0]?.usableAreaSqm).toEqual({
      value: 72.5,
      unit: 'm2',
    })
    expect(result.onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ billingPeriodId: null }),
    )
  })

  it('bearbeitet Objekt, Gebäude und Einheit und ergänzt die Struktur', () => {
    const result = renderRoute('/objekte', seededData(), SEEDED_SELECTION)

    fireEvent.click(screen.getByRole('button', { name: 'Objekt bearbeiten' }))
    fireEvent.change(screen.getByLabelText('Interne Objektnummer bearbeiten'), {
      target: { value: 'OBJ-NEU' },
    })
    fireEvent.change(screen.getByLabelText('Objekt-Bankname bearbeiten'), {
      target: { value: 'Fiktive Objektbank' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Objektdaten speichern' }),
    )

    fireEvent.change(screen.getByLabelText('Neuer Gebäudename'), {
      target: { value: 'Haus B' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Gebäude hinzufügen' }))

    fireEvent.change(screen.getByLabelText('Neue Einheitenbezeichnung'), {
      target: { value: 'Wohnung 2' },
    })
    fireEvent.change(screen.getByLabelText('Neue Nutzfläche in m²'), {
      target: { value: '44,5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Einheit hinzufügen' }))

    expect(result.getData().masterData.properties[0]?.internalNumber).toBe(
      'OBJ-NEU',
    )
    expect(
      result.getData().masterData.properties[0]?.bankAccount?.bankName,
    ).toBe('Fiktive Objektbank')
    expect(result.getData().masterData.buildings).toHaveLength(2)
    expect(result.getData().masterData.units.at(-1)).toMatchObject({
      label: 'Wohnung 2',
      usableAreaSqm: { value: 44.5, unit: 'm2' },
    })
  })

  it('pflegt alle optionalen Objekt-, Gebäude- und Einheitsangaben', () => {
    const result = renderRoute('/objekte', seededData(), SEEDED_SELECTION)

    fireEvent.click(screen.getByRole('button', { name: 'Objekt bearbeiten' }))
    fireEvent.change(screen.getByLabelText('Externe Objektnummer bearbeiten'), {
      target: { value: 'EXT-TEST' },
    })
    fireEvent.change(screen.getByLabelText('Straße bearbeiten'), {
      target: { value: 'Fiktive Objektanschrift' },
    })
    fireEvent.change(screen.getByLabelText('Postleitzahl und Ort bearbeiten'), {
      target: { value: 'Fiktiver Ort' },
    })
    fireEvent.change(screen.getByLabelText('Objekt-IBAN bearbeiten'), {
      target: { value: 'TEST-IBAN' },
    })
    fireEvent.change(screen.getByLabelText('Objekt-BIC bearbeiten'), {
      target: { value: 'TEST-BIC' },
    })
    fireEvent.change(screen.getByLabelText('Objekt-Kontoinhaber bearbeiten'), {
      target: { value: 'Fiktiver Kontoinhaber' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Objektdaten speichern' }),
    )

    fireEvent.change(
      screen.getByLabelText('Standardenergieträger bearbeiten'),
      {
        target: { value: 'Testenergie' },
      },
    )
    fireEvent.change(
      screen.getByLabelText('Mandatsreferenz-Präfixe bearbeiten'),
      { target: { value: 'TEST-A, TEST-B' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gebäude speichern' }))
    fireEvent.change(screen.getByLabelText('Lage bearbeiten'), {
      target: { value: 'Testlage' },
    })
    fireEvent.change(screen.getByLabelText('Beheizte Fläche bearbeiten'), {
      target: { value: '55,5' },
    })
    fireEvent.change(screen.getByLabelText('Raumanzahl bearbeiten'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Einheit speichern' }))

    expect(result.getData().masterData.properties[0]).toMatchObject({
      externalNumber: 'EXT-TEST',
      address: {
        street: 'Fiktive Objektanschrift',
        postalCodeAndCity: 'Fiktiver Ort',
      },
      bankAccount: {
        iban: 'TEST-IBAN',
        bic: 'TEST-BIC',
        accountHolder: 'Fiktiver Kontoinhaber',
      },
    })
    expect(result.getData().masterData.buildings[0]).toMatchObject({
      defaultEnergySourceType: 'Testenergie',
      mandateRefPrefixes: ['TEST-A', 'TEST-B'],
    })
    expect(result.getData().masterData.units[0]).toMatchObject({
      location: 'Testlage',
      heatedAreaSqm: { value: 55.5, unit: 'm2' },
      roomCount: 3,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Objekt löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.getByRole('button', { name: 'Objekt löschen' })).toBeVisible()
  })

  it('legt ein Abrechnungsjahr an und unterstützt die Auswahl', () => {
    const data = seededData()
    const withoutPeriod: AppDataFile = {
      ...data,
      billingData: { ...data.billingData, billingPeriods: [] },
    }
    const result = renderRoute('/abrechnungsjahre', withoutPeriod, {
      ...SEEDED_SELECTION,
      billingPeriodId: null,
    })

    fireEvent.change(screen.getByLabelText('Abrechnungsjahr'), {
      target: { value: '2027' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnungsjahr anlegen' }),
    )

    expect(result.getData().billingData.billingPeriods[0]?.year).toBe(2027)
    expect(result.onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ billingPeriodId: expect.any(String) }),
    )
  })

  it('bearbeitet den Zeitraum des aktiven Abrechnungsjahres', () => {
    const result = renderRoute(
      '/abrechnungsjahre',
      seededData(),
      SEEDED_SELECTION,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnungsjahr bearbeiten' }),
    )
    fireEvent.change(screen.getByLabelText('Zeitraum von'), {
      target: { value: '2026-02-01' },
    })
    fireEvent.change(screen.getByLabelText('Zeitraum bis'), {
      target: { value: '2027-01-31' },
    })
    fireEvent.change(screen.getByLabelText('Allgemeiner Hinweis'), {
      target: { value: 'Fiktiver Jahreshinweis' },
    })
    fireEvent.change(screen.getByLabelText('Hinweis bei Guthaben'), {
      target: { value: 'Fiktiver Guthabenhinweis' },
    })
    fireEvent.change(screen.getByLabelText('Hinweis bei Nachzahlung'), {
      target: { value: 'Fiktiver Nachzahlungshinweis' },
    })
    fireEvent.click(screen.getByLabelText('Anschreiben aktiv'))
    fireEvent.change(screen.getByLabelText('Text des Anschreibens'), {
      target: { value: 'Fiktives Anschreiben' },
    })
    fireEvent.change(screen.getByLabelText('Verbrauchskostenanteil Standard'), {
      target: { value: '70' },
    })
    fireEvent.change(screen.getByLabelText('Grundkostenanteil Standard'), {
      target: { value: '30' },
    })
    fireEvent.change(screen.getByLabelText('Grundkostenfläche'), {
      target: { value: 'usable_area' },
    })
    fireEvent.change(screen.getByLabelText('Solaranteil Standard'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('Betriebsstromanteil Standard'), {
      target: { value: '3' },
    })
    fireEvent.change(screen.getByLabelText('Umsatzsteuer-Modus'), {
      target: { value: 'netto' },
    })
    fireEvent.change(screen.getByLabelText('Begründung für Abweichung'), {
      target: { value: 'Fiktive Begründung' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Änderungen speichern' }),
    )

    expect(result.getData().billingData.billingPeriods[0]).toMatchObject({
      periodStart: '2026-02-01',
      periodEnd: '2027-01-31',
      notes: {
        general: 'Fiktiver Jahreshinweis',
        credit: 'Fiktiver Guthabenhinweis',
        additionalPayment: 'Fiktiver Nachzahlungshinweis',
      },
      coverLetter: { active: true, text: 'Fiktives Anschreiben' },
      heatingDefaults: {
        consumptionSharePercent: 70,
        baseSharePercent: 30,
        baseCostAreaBasis: 'usable_area',
        solarSharePercent: 5,
        operatingElectricitySharePercent: 3,
        vatMode: 'netto',
        deviationJustification: 'Fiktive Begründung',
      },
    })
  })

  it('meldet unvollständige Objektanlage und abgelehnte Speicherung', () => {
    const data = seededData()
    const withoutProperty: AppDataFile = {
      ...data,
      masterData: {
        ...data.masterData,
        properties: [],
        buildings: [],
        units: [],
      },
      billingData: { ...data.billingData, billingPeriods: [] },
    }
    const onSelectionChange = vi.fn()
    const { rerender } = render(
      <WorkflowRoute
        path="/objekte"
        data={withoutProperty}
        selection={{
          ownerCompanyId: SEEDED_IDS.company,
          propertyId: null,
          billingPeriodId: null,
        }}
        onSelectionChange={onSelectionChange}
        onApply={vi.fn(() => true)}
      />,
    )
    fireEvent.change(screen.getByLabelText('Gebäudename'), {
      target: { value: 'Testhaus' },
    })
    fireEvent.change(screen.getByLabelText('Erste Einheit'), {
      target: { value: 'Testeinheit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Objekt anlegen' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Nutzfläche')

    rerender(
      <WorkflowRoute
        path="/objekte"
        data={data}
        selection={SEEDED_SELECTION}
        onSelectionChange={onSelectionChange}
        onApply={vi.fn(() => false)}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Objekt bearbeiten' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Objektdaten speichern' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('nicht gespeichert')
  })

  it('bricht Jahreslöschung ab und löscht einen leeren Zeitraum bewusst', () => {
    const result = renderRoute(
      '/abrechnungsjahre',
      seededData(),
      SEEDED_SELECTION,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnungsjahr löschen' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnungsjahr löschen' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
    expect(result.getData().billingData.billingPeriods).toEqual([])
    expect(result.onSelectionChange).toHaveBeenCalledWith({
      billingPeriodId: null,
    })
  })

  it('erfasst Nutzer samt monatlicher Vorauszahlung', () => {
    const result = renderRoute('/nutzer', seededData(), SEEDED_SELECTION)

    fireEvent.change(screen.getByLabelText('Anzeigename'), {
      target: { value: 'Fiktive Mieterin' },
    })
    fireEvent.change(screen.getByLabelText('Einzug'), {
      target: { value: '2026-01-01' },
    })
    fireEvent.change(screen.getByLabelText('Personenzahl'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Vorauszahlung in Euro'), {
      target: { value: '125,50' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Nutzer anlegen' }))

    expect(result.getData().masterData.persons).toHaveLength(1)
    expect(result.getData().billingData.occupancyPeriods).toHaveLength(1)
    expect(result.getData().billingData.prepayments).toHaveLength(1)
  })

  it('erfasst Leerstand als eigenen Nutzungszeitraum', () => {
    const result = renderRoute('/nutzer', seededData(), SEEDED_SELECTION)

    fireEvent.change(screen.getByLabelText('Leerstand von'), {
      target: { value: '2026-01-01' },
    })
    fireEvent.change(screen.getByLabelText('Leerstand bis'), {
      target: { value: '2026-02-28' },
    })
    fireEvent.change(screen.getByLabelText('Leerstandsnotiz'), {
      target: { value: 'Fiktiver Testleerstand' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Leerstand anlegen' }))

    expect(result.getData().billingData.occupancyPeriods).toEqual([
      expect.objectContaining({ kind: 'vacancy', tenancyId: null }),
    ])
  })

  it('bearbeitet und löscht einen Nutzer kontrolliert', () => {
    const occupancyIds = [
      '30000000-0000-4000-8000-000000000011',
      '30000000-0000-4000-8000-000000000012',
      '30000000-0000-4000-8000-000000000013',
      '30000000-0000-4000-8000-000000000014',
    ]
    const data = addTenantOccupancy(
      seededData(),
      {
        billingPeriodId: SEEDED_IDS.period,
        unitId: SEEDED_IDS.unit,
        person: { displayName: 'Fiktiver Nutzer' },
        occupancy: { from: '2026-01-01', persons: 1 },
        prepayment: { mode: 'none_agreed' },
      },
      () => occupancyIds.shift()!,
    )
    window.location.hash = '#/nutzer?edit=30000000-0000-4000-8000-000000000012'
    const result = renderRoute('/nutzer', data, SEEDED_SELECTION)

    expect(
      screen.getByRole('button', { name: 'Nutzerdaten speichern' }),
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Anzeigename bearbeiten'), {
      target: { value: 'Aktualisierter Nutzer' },
    })
    fireEvent.change(screen.getByLabelText('Personenzahl bearbeiten'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Verbrauchseinheiten bearbeiten'), {
      target: { value: '88,5' },
    })
    fireEvent.click(screen.getByLabelText('§ 12 HeizKV-Kürzung anwenden'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Nutzerdaten speichern' }),
    )

    expect(result.getData().masterData.persons[0]?.displayName).toBe(
      'Aktualisierter Nutzer',
    )
    expect(result.getData().billingData.occupancyPeriods[0]).toMatchObject({
      consumptionUnits: { value: 88.5, unit: 'einheiten' },
      applySection12Reduction: true,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Nutzer löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
    expect(result.getData().billingData.occupancyPeriods).toEqual([])
  })

  it('pflegt Versand, Verbrauch, Bereiche und jährliche Vorauszahlung', () => {
    const occupancyIds = [
      '30000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000022',
      '30000000-0000-4000-8000-000000000023',
      '30000000-0000-4000-8000-000000000024',
    ]
    const data = addTenantOccupancy(
      seededData(),
      {
        billingPeriodId: SEEDED_IDS.period,
        unitId: SEEDED_IDS.unit,
        person: { displayName: 'Fiktiver Detailnutzer' },
        occupancy: { persons: 1 },
        prepayment: { mode: 'none_agreed' },
      },
      () => occupancyIds.shift()!,
    )
    const result = renderRoute('/nutzer', data, SEEDED_SELECTION)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Fiktiver Detailnutzer bearbeiten',
      }),
    )
    fireEvent.change(screen.getByLabelText('Vorname bearbeiten'), {
      target: { value: 'Fiktiv' },
    })
    fireEvent.change(screen.getByLabelText('Nachname bearbeiten'), {
      target: { value: 'Detail' },
    })
    fireEvent.change(screen.getByLabelText('E-Mail bearbeiten'), {
      target: { value: TEST_CONTACT_EMAIL },
    })
    fireEvent.change(screen.getByLabelText('Mandatsreferenz bearbeiten'), {
      target: { value: 'TEST-MANDAT' },
    })
    fireEvent.change(screen.getByLabelText('Monatsmiete in Euro bearbeiten'), {
      target: { value: '700,50' },
    })
    fireEvent.change(screen.getByLabelText('Versandstraße bearbeiten'), {
      target: { value: 'Fiktive Versandanschrift' },
    })
    fireEvent.change(screen.getByLabelText('Versandort bearbeiten'), {
      target: { value: 'Fiktiver Versandort' },
    })
    fireEvent.change(screen.getByLabelText('Verbrauchseinheiten bearbeiten'), {
      target: { value: '99,5' },
    })
    fireEvent.click(screen.getByLabelText('Verbrauchseinheiten geschätzt'))
    fireEvent.change(
      screen.getByLabelText('Schätzgrund Verbrauch bearbeiten'),
      { target: { value: 'Fiktiver Schätzgrund' } },
    )
    fireEvent.change(screen.getByLabelText('Kaltwasser in m³ bearbeiten'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Warmwasser in m³ bearbeiten'), {
      target: { value: '4' },
    })
    fireEvent.change(screen.getByLabelText('Kostenbereich bearbeiten'), {
      target: { value: SEEDED_IDS.building },
    })
    fireEvent.change(screen.getByLabelText('Grundsteuerbereich bearbeiten'), {
      target: { value: SEEDED_IDS.building },
    })
    fireEvent.change(screen.getByLabelText('Versanddatum bearbeiten'), {
      target: { value: '2027-01-15' },
    })
    fireEvent.change(screen.getByLabelText('Nutzernotiz bearbeiten'), {
      target: { value: 'Fiktive Detailnotiz' },
    })
    fireEvent.change(screen.getByLabelText('Vorauszahlungsart bearbeiten'), {
      target: { value: 'annual' },
    })
    fireEvent.change(screen.getByLabelText('Vorauszahlung bearbeiten'), {
      target: { value: '2400' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Nutzerdaten speichern' }),
    )

    expect(result.getData().masterData.persons[0]).toMatchObject({
      firstName: 'Fiktiv',
      lastName: 'Detail',
      email: TEST_CONTACT_EMAIL,
    })
    expect(result.getData().masterData.tenancies[0]).toMatchObject({
      mandateReference: 'TEST-MANDAT',
      monthlyRentCents: 70_050,
      shippingAddressStreet: 'Fiktive Versandanschrift',
    })
    expect(result.getData().billingData.occupancyPeriods[0]).toMatchObject({
      consumptionUnitsEstimated: true,
      coldWater: { value: 10, unit: 'm3' },
      warmWater: { value: 4, unit: 'm3' },
      costScope: { kind: 'building', buildingId: SEEDED_IDS.building },
      propertyTaxScope: { kind: 'building', buildingId: SEEDED_IDS.building },
      dispatchDate: '2027-01-15',
    })
    expect(result.getData().billingData.prepayments[0]).toMatchObject({
      mode: 'annual',
      annualAmountCents: 240_000,
    })
  })

  it('bearbeitet Leerstand und bricht dessen Löschung kontrolliert ab', () => {
    const vacancyId = '30000000-0000-4000-8000-000000000031'
    const base = seededData()
    const data: AppDataFile = {
      ...base,
      billingData: {
        ...base.billingData,
        occupancyPeriods: [
          {
            id: vacancyId,
            billingPeriodId: SEEDED_IDS.period,
            unitId: SEEDED_IDS.unit,
            tenancyId: null,
            kind: 'vacancy',
          },
        ],
      },
    }
    const result = renderRoute('/nutzer', data, SEEDED_SELECTION)
    fireEvent.click(
      screen.getByRole('button', { name: 'Leerstand bearbeiten' }),
    )
    fireEvent.change(screen.getByLabelText('Leerstand von bearbeiten'), {
      target: { value: '2026-03-01' },
    })
    fireEvent.change(screen.getByLabelText('Leerstand bis bearbeiten'), {
      target: { value: '2026-04-30' },
    })
    fireEvent.change(screen.getByLabelText('Leerstandsnotiz bearbeiten'), {
      target: { value: 'Fiktiv aktualisiert' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Leerstand speichern' }))
    expect(result.getData().billingData.occupancyPeriods[0]).toMatchObject({
      from: '2026-03-01',
      to: '2026-04-30',
      note: 'Fiktiv aktualisiert',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Leerstand löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(
      screen.getByRole('button', { name: 'Leerstand löschen' }),
    ).toBeVisible()
  })

  it('erfasst Kostenarten und beliebig viele Positionen getrennt', () => {
    const result = renderRoute('/kosten', seededData(), SEEDED_SELECTION)

    fireEvent.change(screen.getByLabelText('Neue Kostenart'), {
      target: { value: 'Gebäudereinigung' },
    })
    fireEvent.change(screen.getByLabelText('Umlageschlüssel'), {
      target: { value: 'residential_units' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart anlegen' }))
    expect(result.getData().billingData.costCategories).toHaveLength(1)

    cleanup()
    const entryResult = renderRoute(
      '/kosten',
      result.getData(),
      SEEDED_SELECTION,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Kostenpositionen' }))
    fireEvent.change(screen.getByLabelText('Belegdatum'), {
      target: { value: '2026-03-15' },
    })
    fireEvent.change(screen.getByLabelText('Betrag in Euro'), {
      target: { value: '1000,99' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Kostenposition anlegen' }),
    )

    expect(entryResult.getData().billingData.costEntries[0]?.amountCents).toBe(
      100_099,
    )
  })

  it('verknüpft eine Kostenposition in der Oberfläche mit ihrer Bankbuchung', () => {
    const base = seededData()
    const categoryId = '20000000-0000-4000-8000-000000000071'
    const bookingId = '20000000-0000-4000-8000-000000000072'
    const data: AppDataFile = {
      ...base,
      billingData: {
        ...base.billingData,
        costCategories: [
          {
            id: categoryId,
            billingPeriodId: SEEDED_IDS.period,
            kind: 'operating',
            label: 'Gebäudereinigung',
            allocationKey: 'usable_area',
          },
        ],
        bankBookings: [
          {
            id: bookingId,
            propertyId: SEEDED_IDS.property,
            billingYear: 2026,
            date: '2026-03-16',
            amountCents: -100_099,
            counterparty: 'Fiktiver Dienstleister',
          },
        ],
      },
    }
    const result = renderRoute('/kosten', data, SEEDED_SELECTION)

    fireEvent.click(screen.getByRole('button', { name: 'Kostenpositionen' }))
    fireEvent.change(screen.getByLabelText('Betrag in Euro'), {
      target: { value: '1000,99' },
    })
    fireEvent.change(screen.getByLabelText('Zahlungsnachweis'), {
      target: { value: 'booking' },
    })
    fireEvent.change(screen.getByLabelText('Zugehörige Bankbuchung'), {
      target: { value: bookingId },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Kostenposition anlegen' }),
    )

    expect(result.getData().billingData.costEntries[0]?.bookingLink).toEqual({
      bankBookingId: bookingId,
    })
    expect(screen.getByLabelText('Zahlungsnachweis')).toHaveValue('none')
    expect(
      screen.queryByLabelText('Zugehörige Bankbuchung'),
    ).not.toBeInTheDocument()
  })

  it('öffnet eine verlinkte Kostenposition direkt zur Korrektur', () => {
    const categoryId = '20000000-0000-4000-8000-000000000073'
    const entryId = '20000000-0000-4000-8000-000000000074'
    const withCategory = addCostCategory(
      seededData(),
      {
        billingPeriodId: SEEDED_IDS.period,
        kind: 'operating',
        label: 'Gebäudereinigung',
      },
      () => categoryId,
    )
    const data = addCostEntry(
      withCategory,
      {
        costCategoryId: categoryId,
        description: 'Fiktive Rechnung',
        amountCents: 12_345,
      },
      () => entryId,
    )
    window.location.hash = `#/kosten?tab=entries&edit=${entryId}`

    renderRoute('/kosten', data, SEEDED_SELECTION)

    expect(
      screen.getByRole('heading', { name: 'Kostenpositionen (1)' }),
    ).toBeVisible()
    const saveButton = screen.getByRole('button', {
      name: 'Kostenposition speichern',
    })
    expect(saveButton).toBeVisible()
    expect(
      within(saveButton.closest('form')!).getByLabelText('Betrag in Euro'),
    ).toHaveValue('123,45')
  })

  it('zeigt migrierte Kostenpositionen und Bankbuchungen des aktiven Jahres', () => {
    const base = seededData()
    const categoryId = '20000000-0000-4000-8000-000000000007'
    const data: AppDataFile = {
      ...base,
      billingData: {
        ...base.billingData,
        costCategories: [
          {
            id: categoryId,
            billingPeriodId: SEEDED_IDS.period,
            kind: 'operating',
            label: 'Gebäudereinigung',
            allocationKey: 'usable_area',
          },
        ],
        costEntries: [
          {
            id: '20000000-0000-4000-8000-000000000008',
            costCategoryId: categoryId,
            date: '2026-03-15',
            description: 'Fiktive Rechnung',
            receiptReference: 'TEST-17',
            amountCents: 123_456,
          },
        ],
        bankBookings: [
          {
            id: '20000000-0000-4000-8000-000000000009',
            propertyId: SEEDED_IDS.property,
            date: '2026-03-16',
            amountCents: -25_050,
            counterparty: 'Musterfirma Dienstleistung',
            purpose: 'Testleistung März',
            category: 'NK_UMLEGBAR',
            billingYear: 2026,
            costCategoryId: categoryId,
            reviewed: true,
          },
          {
            id: '20000000-0000-4000-8000-000000000010',
            propertyId: '20000000-0000-4000-8000-000000000099',
            amountCents: -999,
            purpose: 'Fremdes Objekt',
          },
        ],
      },
    }

    renderRoute('/kosten', data, SEEDED_SELECTION)

    expect(
      screen.getByRole('heading', { name: 'Kostenarten (1)' }),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Kostenpositionen' }))
    expect(
      screen.getByRole('heading', { name: 'Kostenpositionen (1)' }),
    ).toBeVisible()
    expect(screen.getByText('Fiktive Rechnung')).toBeVisible()
    expect(screen.getByText(/TEST-17/u)).toBeVisible()
    expect(screen.getAllByText(/1\.234,56\s€/u).length).toBeGreaterThanOrEqual(
      2,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bankbuchungen' }))
    expect(
      screen.getByRole('heading', { name: 'Bankbuchungen (1)' }),
    ).toBeVisible()
    expect(screen.getByText(/Musterfirma Dienstleistung/u)).toBeVisible()
    expect(screen.getByText('Testleistung März')).toBeVisible()
    expect(screen.getAllByText(/-250,50\s€/u)[0]).toBeVisible()
    expect(screen.queryByText('Fremdes Objekt')).not.toBeInTheDocument()
  })

  it('klassifiziert Bankbuchungen und sperrt sie nach der Prüfung', () => {
    const base = seededData()
    const categoryId = '20000000-0000-4000-8000-000000000017'
    const bookingId = '20000000-0000-4000-8000-000000000018'
    const data: AppDataFile = {
      ...base,
      billingData: {
        ...base.billingData,
        costCategories: [
          {
            id: categoryId,
            billingPeriodId: SEEDED_IDS.period,
            kind: 'operating',
            label: 'Fiktive Kostenart',
            allocationKey: 'usable_area',
          },
        ],
        bankBookings: [
          {
            id: bookingId,
            propertyId: SEEDED_IDS.property,
            date: '2026-04-01',
            amountCents: -8_500,
            purpose: 'Fiktive Bankbuchung',
            category: 'OFFEN',
          },
        ],
      },
    }
    const result = renderRoute('/kosten', data, SEEDED_SELECTION)

    fireEvent.click(screen.getByRole('button', { name: 'Bankbuchungen' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktive Bankbuchung bearbeiten' }),
    )
    fireEvent.change(screen.getByLabelText('Buchungskategorie bearbeiten'), {
      target: { value: 'NK_UMLEGBAR' },
    })
    fireEvent.change(screen.getByLabelText('Kostenart zuordnen'), {
      target: { value: categoryId },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buchung speichern' }))

    expect(result.getData().billingData.bankBookings[0]).toMatchObject({
      billingYear: 2026,
      category: 'NK_UMLEGBAR',
      costCategoryId: categoryId,
      reviewed: false,
    })

    cleanup()
    const reviewedResult = renderRoute(
      '/kosten',
      result.getData(),
      SEEDED_SELECTION,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bankbuchungen' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Als geprüft markieren' }),
    )
    expect(reviewedResult.getData().billingData.bankBookings[0]?.reviewed).toBe(
      true,
    )

    cleanup()
    renderRoute('/kosten', reviewedResult.getData(), SEEDED_SELECTION)
    fireEvent.click(screen.getByRole('button', { name: 'Bankbuchungen' }))
    expect(
      screen.getByRole('button', { name: 'Buchung wieder öffnen' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', {
        name: 'Fiktive Bankbuchung bearbeiten',
      }),
    ).not.toBeInTheDocument()
  })

  it('zeigt gespeicherte Buchungsaufteilungen beim Wiederbearbeiten vollständig an', () => {
    const base = seededData()
    const categoryId = '20000000-0000-4000-8000-000000000117'
    const secondCategoryId = '20000000-0000-4000-8000-000000000118'
    const data: AppDataFile = {
      ...base,
      billingData: {
        ...base.billingData,
        costCategories: [
          {
            id: categoryId,
            billingPeriodId: SEEDED_IDS.period,
            kind: 'operating',
            label: 'Wasser fiktiv',
            allocationKey: 'usable_area',
          },
          {
            id: secondCategoryId,
            billingPeriodId: SEEDED_IDS.period,
            kind: 'operating',
            label: 'Abwasser fiktiv',
            allocationKey: 'usable_area',
          },
        ],
        bankBookings: [
          {
            id: '20000000-0000-4000-8000-000000000119',
            propertyId: SEEDED_IDS.property,
            date: '2026-04-01',
            amountCents: -33_344,
            purpose: 'Fiktive Kombirechnung',
            category: 'NK_UMLEGBAR',
            reviewed: false,
            splits: [
              {
                id: '20000000-0000-4000-8000-000000000120',
                amountCents: -20_000,
                costCategoryId: categoryId,
                billingYear: 2026,
                category: 'NK_UMLEGBAR',
              },
              {
                id: '20000000-0000-4000-8000-000000000121',
                amountCents: -13_344,
                costCategoryId: secondCategoryId,
                billingYear: 2026,
                category: 'NK_UMLEGBAR',
              },
            ],
          },
        ],
      },
    }

    renderRoute('/kosten', data, SEEDED_SELECTION)
    fireEvent.click(screen.getByRole('button', { name: 'Bankbuchungen' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktive Kombirechnung bearbeiten' }),
    )

    expect(screen.getByLabelText('Split 1 Betrag in Euro')).toHaveValue(
      '-200,00',
    )
    expect(screen.getByLabelText('Split 1 Kostenart')).toHaveValue(categoryId)
    expect(screen.getByLabelText('Split 2 Betrag in Euro')).toHaveValue(
      '-133,44',
    )
    expect(screen.getByLabelText('Split 2 Kostenart')).toHaveValue(
      secondCategoryId,
    )
  })

  it('erfasst eine Bankbuchung manuell im aktiven Objekt', () => {
    const result = renderRoute('/kosten', seededData(), SEEDED_SELECTION)

    fireEvent.click(screen.getByRole('button', { name: 'Bankbuchungen' }))
    fireEvent.change(screen.getByLabelText('Datum der Buchung'), {
      target: { value: '2026-06-15' },
    })
    fireEvent.change(
      screen.getByLabelText('Betrag in Euro (Ausgabe negativ)'),
      { target: { value: '-456,78' } },
    )
    fireEvent.change(screen.getByLabelText('Auftraggeber oder Empfänger'), {
      target: { value: 'Fiktiver Versorger' },
    })
    fireEvent.change(screen.getByLabelText('Verwendungszweck der Buchung'), {
      target: { value: 'Fiktive Abschlagsrechnung' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Manuelle Buchung anlegen' }),
    )

    expect(result.getData().billingData.bankBookings[0]).toMatchObject({
      propertyId: SEEDED_IDS.property,
      date: '2026-06-15',
      amountCents: -45_678,
      counterparty: 'Fiktiver Versorger',
      purpose: 'Fiktive Abschlagsrechnung',
      category: 'OFFEN',
    })
    expect(
      screen.getByText('Die manuelle Bankbuchung wurde als „Offen“ angelegt.'),
    ).toBeVisible()
  })

  it('legt Heizsystem, Heizkreis und Energiequelle JSON-sicher an', async () => {
    const result = renderRoute('/heizkreise', seededData(), SEEDED_SELECTION)

    fireEvent.change(screen.getByLabelText('Heizsystem'), {
      target: { value: 'Zentralheizung' },
    })
    fireEvent.change(screen.getByLabelText('Quellenschlüssel'), {
      target: { value: 'gas' },
    })
    fireEvent.change(screen.getByLabelText('Energiequelle'), {
      target: { value: 'Gaslieferung' },
    })
    fireEvent.change(screen.getByLabelText('Energieträger'), {
      target: { value: 'Erdgas' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Heizkreis anlegen' }))

    expect(result.getData().masterData.heatingSystems).toHaveLength(1)
    expect(result.getData().billingData.heatingCircuits).toHaveLength(1)
    expect(result.getData().billingData.energySources).toHaveLength(1)
    await expect(
      encodeCurrentAppData(result.getData(), {
        savedAt: new Date('2026-12-31T12:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ data: { schemaVersion: 4 } })
  })

  it('erfasst Brennstoffbestand und einzelne Lieferungen getrennt', () => {
    const result = renderRoute(
      '/heizkreise',
      seededHeatingData(),
      SEEDED_SELECTION,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Brennstoffe' }))
    fireEvent.change(screen.getByLabelText('Anfangsbestand Menge'), {
      target: { value: '1000' },
    })
    fireEvent.change(screen.getByLabelText('Restbestand Menge'), {
      target: { value: '125' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Bestand speichern' }))
    expect(result.getData().billingData.fuelStocks).toHaveLength(1)

    cleanup()
    const deliveryResult = renderRoute(
      '/heizkreise',
      result.getData(),
      SEEDED_SELECTION,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Brennstoffe' }))
    fireEvent.change(screen.getByLabelText('Lieferdatum'), {
      target: { value: '2026-04-01' },
    })
    fireEvent.change(screen.getByLabelText('Liefermenge'), {
      target: { value: '500' },
    })
    fireEvent.change(screen.getByLabelText('Lieferbetrag in Euro'), {
      target: { value: '750,50' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Lieferung hinzufügen' }),
    )
    expect(
      deliveryResult.getData().billingData.fuelDeliveries[0],
    ).toMatchObject({
      quantity: { value: 500, unit: 'l' },
      amountCents: 75_050,
    })
  })

  it('pflegt Zähler, Ablesung und Jahresstatus im aktiven Objekt', () => {
    const result = renderRoute('/heizkreise', seededData(), SEEDED_SELECTION)
    fireEvent.click(screen.getByRole('button', { name: 'Zähler' }))
    fireEvent.change(screen.getByLabelText('Zählernummer'), {
      target: { value: 'TEST-ZAEHLER' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zähler anlegen' }))
    expect(result.getData().masterData.meters).toHaveLength(1)

    cleanup()
    const readingResult = renderRoute(
      '/heizkreise',
      result.getData(),
      SEEDED_SELECTION,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zähler' }))
    fireEvent.change(screen.getByLabelText('Ablesedatum'), {
      target: { value: '2026-06-30' },
    })
    fireEvent.change(screen.getByLabelText('Zählerstand'), {
      target: { value: '1234,5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ablesung erfassen' }))
    fireEvent.click(screen.getByLabelText('Bankbuchung vorhanden'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Jahresstatus speichern' }),
    )

    expect(readingResult.getData().billingData.meterReadings).toHaveLength(1)
    expect(
      readingResult.getData().billingData.meterBillingStatuses[0],
    ).toMatchObject({ year: 2026, bookingPresent: true })
  })

  it('bearbeitet und entfernt eine vollständige Heizkreiskette', () => {
    const result = renderRoute(
      '/heizkreise',
      seededHeatingData(),
      SEEDED_SELECTION,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Fiktive Wärmequelle bearbeiten',
      }),
    )
    fireEvent.change(screen.getByLabelText('Heizsystem bearbeiten'), {
      target: { value: 'Aktualisierte Heizung' },
    })
    fireEvent.change(screen.getByLabelText('Heizwert bearbeiten'), {
      target: { value: '10,5' },
    })
    fireEvent.change(screen.getByLabelText('CO₂-Faktor bearbeiten'), {
      target: { value: '0,2' },
    })
    fireEvent.click(
      screen.getByLabelText('Zentrale Warmwasserbereitung bearbeiten'),
    )
    fireEvent.change(screen.getByLabelText('Warmwasseranteil bearbeiten'), {
      target: { value: '18' },
    })
    fireEvent.change(screen.getByLabelText('Verbrauchskostenanteil'), {
      target: { value: '70' },
    })
    fireEvent.change(screen.getByLabelText('Grundkostenanteil'), {
      target: { value: '30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Heizkreis speichern' }))

    expect(result.getData().masterData.heatingSystems[0]?.name).toBe(
      'Aktualisierte Heizung',
    )
    expect(result.getData().billingData.energySources[0]).toMatchObject({
      calorificValueKwhPerUnit: 10.5,
      co2FactorKgPerKwh: 0.2,
    })
    expect(result.getData().billingData.heatingCircuits[0]).toMatchObject({
      hasCentralHotWater: true,
      hotWaterSharePercent: 18,
      overrides: { consumptionSharePercent: 70, baseSharePercent: 30 },
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Energiequelle löschen' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Heizkreis löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Heizsystem löschen' }))
    expect(result.getData().billingData.energySources).toEqual([])
    expect(result.getData().billingData.heatingCircuits).toEqual([])
    expect(result.getData().masterData.heatingSystems).toEqual([])
  })

  it('bearbeitet und löscht Brennstoffbestand und Lieferung über die UI', () => {
    let data = addFuelStock(
      seededHeatingData(),
      {
        energySourceId: '20000000-0000-4000-8000-000000000023',
        billingPeriodId: SEEDED_IDS.period,
        openingQuantity: { value: 100, unit: 'l' },
      },
      { createId: () => '20000000-0000-4000-8000-000000000024' },
    )
    data = addFuelDelivery(
      data,
      {
        energySourceId: '20000000-0000-4000-8000-000000000023',
        billingPeriodId: SEEDED_IDS.period,
        description: 'Fiktive Lieferung',
        quantity: { value: 50, unit: 'l' },
        amountCents: 10_000,
      },
      { createId: () => '20000000-0000-4000-8000-000000000025' },
    )
    const result = renderRoute('/heizkreise', data, SEEDED_SELECTION)
    fireEvent.click(screen.getByRole('button', { name: 'Brennstoffe' }))

    fireEvent.change(screen.getByLabelText('Restbestand Menge'), {
      target: { value: '25' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Bestand speichern' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktive Lieferung bearbeiten' }),
    )
    fireEvent.change(screen.getByLabelText('Liefermenge bearbeiten'), {
      target: { value: '60' },
    })
    fireEvent.change(screen.getByLabelText('Lieferbetrag bearbeiten'), {
      target: { value: '120,50' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lieferung speichern' }))

    expect(
      result.getData().billingData.fuelStocks[0]?.remainingQuantity,
    ).toEqual({ value: 25, unit: 'l' })
    expect(result.getData().billingData.fuelDeliveries[0]).toMatchObject({
      quantity: { value: 60, unit: 'l' },
      amountCents: 12_050,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Bestand löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestand löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lieferung löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
    expect(result.getData().billingData.fuelStocks).toEqual([])
    expect(result.getData().billingData.fuelDeliveries).toEqual([])
  })

  it('zeigt Zählerfehler kontrolliert und unterstützt Bearbeiten und Löschen', () => {
    const createResult = renderRoute(
      '/heizkreise',
      seededData(),
      SEEDED_SELECTION,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zähler' }))
    fireEvent.change(screen.getByLabelText('Zählernummer'), {
      target: { value: 'TEST-ZAEHLER-2' },
    })
    fireEvent.change(screen.getByLabelText('Versorger'), {
      target: { value: 'Testversorger' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zähler anlegen' }))

    cleanup()
    const result = renderRoute(
      '/heizkreise',
      createResult.getData(),
      SEEDED_SELECTION,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zähler' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zähler bearbeiten' }))
    fireEvent.change(screen.getByLabelText('Zählernummer bearbeiten'), {
      target: { value: 'TEST-ZAEHLER-AKTUELL' },
    })
    fireEvent.change(screen.getByLabelText('Zusatznotiz bearbeiten'), {
      target: { value: 'Fiktive Zusatznotiz' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zähler speichern' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ablesung erfassen' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte einen Zählerstand eingeben',
    )
    fireEvent.change(screen.getByLabelText('Zählerstand'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('Quelle der Ablesung'), {
      target: { value: 'estimated' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ablesung erfassen' }))
    fireEvent.change(screen.getByLabelText('Schätzbetrag in Euro'), {
      target: { value: '20,25' },
    })
    fireEvent.change(screen.getByLabelText('Schätzgrund'), {
      target: { value: 'Fiktiver Grund' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Jahresstatus speichern' }),
    )

    cleanup()
    const editResult = renderRoute(
      '/heizkreise',
      result.getData(),
      SEEDED_SELECTION,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zähler' }))
    fireEvent.click(screen.getByRole('button', { name: '5 kWh bearbeiten' }))
    fireEvent.change(screen.getByLabelText('Zählerstand bearbeiten'), {
      target: { value: '6,5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ablesung speichern' }))
    expect(editResult.getData().billingData.meterReadings[0]?.value.value).toBe(
      6.5,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Jahresstatus löschen' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ablesung löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zähler löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
    expect(editResult.getData().billingData.meterBillingStatuses).toEqual([])
    expect(editResult.getData().billingData.meterReadings).toEqual([])
    expect(editResult.getData().masterData.meters).toEqual([])
  })

  it('bearbeitet und löscht Kostenarten und Kostenpositionen kontrolliert', () => {
    let data = addCostCategory(
      seededData(),
      {
        billingPeriodId: SEEDED_IDS.period,
        kind: 'operating',
        label: 'Fiktive Kostenart',
        allocationKey: 'usable_area',
      },
      () => '20000000-0000-4000-8000-000000000031',
    )
    data = addCostEntry(
      data,
      {
        costCategoryId: '20000000-0000-4000-8000-000000000031',
        description: 'Fiktive Position',
        amountCents: 5_000,
      },
      () => '20000000-0000-4000-8000-000000000032',
    )
    const result = renderRoute('/kosten', data, SEEDED_SELECTION)

    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktive Kostenart bearbeiten' }),
    )
    fireEvent.change(screen.getByLabelText('Kostenart bearbeiten'), {
      target: { value: 'Aktualisierte Kostenart' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart speichern' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kostenpositionen' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktive Position bearbeiten' }),
    )
    const entryEditor = screen
      .getByRole('heading', { name: 'Fiktive Position' })
      .closest('article')!
    fireEvent.change(within(entryEditor).getByLabelText('Betrag in Euro'), {
      target: { value: '75,50' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Kostenposition speichern' }),
    )
    expect(result.getData().billingData.costCategories[0]?.label).toBe(
      'Aktualisierte Kostenart',
    )
    expect(result.getData().billingData.costEntries[0]?.amountCents).toBe(7_550)

    fireEvent.click(
      screen.getByRole('button', { name: 'Kostenposition löschen' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
    cleanup()
    const categoryResult = renderRoute(
      '/kosten',
      result.getData(),
      SEEDED_SELECTION,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
    expect(categoryResult.getData().billingData.costCategories).toEqual([])
  })

  it('zeigt Kostenarten und Kostenpositionen als filterbare Arbeitstabellen', () => {
    let data = addCostCategory(
      seededData(),
      {
        billingPeriodId: SEEDED_IDS.period,
        kind: 'operating',
        label: 'Fiktive Reinigung',
        allocationKey: 'usable_area',
      },
      () => '20000000-0000-4000-8000-000000000191',
    )
    data = addCostEntry(
      data,
      {
        costCategoryId: '20000000-0000-4000-8000-000000000191',
        date: '2026-04-03',
        description: 'Fiktive Aprilrechnung',
        amountCents: 12_345,
      },
      () => '20000000-0000-4000-8000-000000000192',
    )

    renderRoute('/kosten', data, SEEDED_SELECTION)

    const categoryTable = screen.getByRole('table', {
      name: 'Kostenarten bearbeiten',
    })
    expect(within(categoryTable).getByText('Fiktive Reinigung')).toBeVisible()
    expect(within(categoryTable).getByText('Nutzfläche')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Kostenpositionen' }))
    const entryTable = screen.getByRole('table', {
      name: 'Kostenpositionen bearbeiten',
    })
    expect(within(entryTable).getByText('03.04.2026')).toBeVisible()
    expect(within(entryTable).getAllByText(/123,45\s€/u)[0]).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('1 Kostenposition')
  })

  it('durchsucht und filtert Kostenarten sowie Kostenpositionen ohne verdeckte Treffer', () => {
    const operatingCategoryId = '20000000-0000-4000-8000-000000000195'
    const waterCategoryId = '20000000-0000-4000-8000-000000000196'
    let data = addCostCategory(
      seededData(),
      {
        billingPeriodId: SEEDED_IDS.period,
        kind: 'operating',
        label: 'Fiktive Reinigung',
        statementText: 'Treppenhaus-Testtext',
      },
      () => operatingCategoryId,
    )
    data = addCostCategory(
      data,
      {
        billingPeriodId: SEEDED_IDS.period,
        kind: 'water',
        label: 'Fiktives Frischwasser',
      },
      () => waterCategoryId,
    )
    data = addCostEntry(
      data,
      {
        costCategoryId: operatingCategoryId,
        description: 'Rechnung Reinigung',
        amountCents: 4_000,
      },
      () => '20000000-0000-4000-8000-000000000197',
    )
    data = addCostEntry(
      data,
      {
        costCategoryId: waterCategoryId,
        receiptReference: 'WASSER-TEST-2026',
        amountCents: 6_000,
      },
      () => '20000000-0000-4000-8000-000000000198',
    )

    renderRoute('/kosten', data, SEEDED_SELECTION)

    fireEvent.change(screen.getByLabelText('Kostenarten durchsuchen'), {
      target: { value: 'treppenhaus' },
    })
    let categoryTable = screen.getByRole('table', {
      name: 'Kostenarten bearbeiten',
    })
    expect(within(categoryTable).getByText('Fiktive Reinigung')).toBeVisible()
    expect(
      within(categoryTable).queryByText('Fiktives Frischwasser'),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Kostenarten durchsuchen'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('Kostenart-Typ'), {
      target: { value: 'water' },
    })
    categoryTable = screen.getByRole('table', {
      name: 'Kostenarten bearbeiten',
    })
    expect(
      within(categoryTable).getByText('Fiktives Frischwasser'),
    ).toBeVisible()
    expect(
      within(categoryTable).queryByText('Fiktive Reinigung'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Kostenpositionen' }))
    fireEvent.change(screen.getByLabelText('Kostenpositionen durchsuchen'), {
      target: { value: 'wasser-test' },
    })
    let entryTable = screen.getByRole('table', {
      name: 'Kostenpositionen bearbeiten',
    })
    expect(within(entryTable).getAllByText('WASSER-TEST-2026')[0]).toBeVisible()
    expect(
      within(entryTable).queryByText('Rechnung Reinigung'),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Kostenpositionen durchsuchen'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('Kostenart auswählen'), {
      target: { value: operatingCategoryId },
    })
    entryTable = screen.getByRole('table', {
      name: 'Kostenpositionen bearbeiten',
    })
    expect(within(entryTable).getByText('Rechnung Reinigung')).toBeVisible()
    expect(
      within(entryTable).queryByText('WASSER-TEST-2026'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('40,00')
  })

  it('öffnet eine Kostenposition aus der Tabellenzeile mit Enter', () => {
    const categoryId = '20000000-0000-4000-8000-000000000193'
    const data = addCostEntry(
      addCostCategory(
        seededData(),
        {
          billingPeriodId: SEEDED_IDS.period,
          kind: 'operating',
          label: 'Fiktive Wartung',
        },
        () => categoryId,
      ),
      {
        costCategoryId: categoryId,
        description: 'Tastatur-Position',
        amountCents: 5_000,
      },
      () => '20000000-0000-4000-8000-000000000194',
    )

    renderRoute('/kosten', data, SEEDED_SELECTION)
    fireEvent.click(screen.getByRole('button', { name: 'Kostenpositionen' }))
    fireEvent.keyDown(screen.getByRole('row', { name: /Tastatur-Position/u }), {
      key: 'Enter',
    })

    expect(
      screen.getByRole('button', { name: 'Kostenposition speichern' }),
    ).toBeVisible()
  })

  it('filtert Bankbuchungen in einer kompakten Arbeitsliste und summiert die Treffer', () => {
    const base = seededData()
    const categoryId = '20000000-0000-4000-8000-000000000181'
    const data: AppDataFile = {
      ...base,
      billingData: {
        ...base.billingData,
        costCategories: [
          {
            id: categoryId,
            billingPeriodId: SEEDED_IDS.period,
            kind: 'operating',
            label: 'Fiktive Wartung',
            allocationKey: 'usable_area',
          },
        ],
        bankBookings: [
          {
            id: '20000000-0000-4000-8000-000000000182',
            propertyId: SEEDED_IDS.property,
            date: '2026-02-01',
            amountCents: -1_000,
            purpose: 'Offene Testbuchung',
            category: 'OFFEN',
          },
          {
            id: '20000000-0000-4000-8000-000000000183',
            propertyId: SEEDED_IDS.property,
            billingYear: 2026,
            date: '2026-02-02',
            amountCents: -2_000,
            purpose: 'Zugeordnete Testbuchung',
            category: 'NK_UMLEGBAR',
            costCategoryId: categoryId,
            reviewed: true,
          },
          {
            id: '20000000-0000-4000-8000-000000000185',
            propertyId: SEEDED_IDS.property,
            billingYear: 2026,
            date: '2026-02-03',
            amountCents: -3_000,
            counterparty: 'Fiktive Split-Firma',
            bookingText: 'Nur im Buchungstext auffindbar',
            category: 'NK_UMLEGBAR',
            reviewed: false,
            splits: [
              {
                id: '20000000-0000-4000-8000-000000000186',
                amountCents: -3_000,
                costCategoryId: categoryId,
                billingYear: 2026,
                category: 'NK_UMLEGBAR',
              },
            ],
          },
        ],
      },
    }

    renderRoute('/kosten', data, SEEDED_SELECTION)
    fireEvent.click(screen.getByRole('button', { name: 'Bankbuchungen' }))
    fireEvent.change(screen.getByLabelText('Prüfstatus'), {
      target: { value: 'unassigned' },
    })

    let table = screen.getByRole('table', {
      name: 'Bankbuchungen bearbeiten',
    })
    expect(within(table).getByText('Offene Testbuchung')).toBeVisible()
    expect(
      within(table).queryByText('Zugeordnete Testbuchung'),
    ).not.toBeInTheDocument()
    expect(
      within(table).queryByText('Fiktive Split-Firma'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 Buchung')
    expect(screen.getByRole('status')).toHaveTextContent('-10,00')

    fireEvent.change(screen.getByLabelText('Prüfstatus'), {
      target: { value: 'reviewed' },
    })
    table = screen.getByRole('table', { name: 'Bankbuchungen bearbeiten' })
    expect(within(table).getByText('Zugeordnete Testbuchung')).toBeVisible()
    expect(
      within(table).queryByText('Offene Testbuchung'),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Prüfstatus'), {
      target: { value: 'open' },
    })
    table = screen.getByRole('table', { name: 'Bankbuchungen bearbeiten' })
    expect(within(table).getByText('Offene Testbuchung')).toBeVisible()
    expect(within(table).getAllByText('Fiktive Split-Firma')[0]).toBeVisible()
    expect(
      within(table).queryByText('Zugeordnete Testbuchung'),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Prüfstatus'), {
      target: { value: 'all' },
    })
    fireEvent.change(screen.getByLabelText('Bankbuchungen durchsuchen'), {
      target: { value: 'nur im buchungstext' },
    })
    table = screen.getByRole('table', { name: 'Bankbuchungen bearbeiten' })
    expect(within(table).getAllByText('Fiktive Split-Firma')[0]).toBeVisible()
    expect(
      within(table).queryByText('Offene Testbuchung'),
    ).not.toBeInTheDocument()
  })

  it('öffnet die primäre Buchungsaktion mit Enter', () => {
    const base = seededData()
    const data: AppDataFile = {
      ...base,
      billingData: {
        ...base.billingData,
        bankBookings: [
          {
            id: '20000000-0000-4000-8000-000000000184',
            propertyId: SEEDED_IDS.property,
            date: '2026-02-03',
            amountCents: -3_000,
            purpose: 'Per Tastatur bearbeiten',
            category: 'OFFEN',
          },
        ],
      },
    }

    renderRoute('/kosten', data, SEEDED_SELECTION)
    fireEvent.click(screen.getByRole('button', { name: 'Bankbuchungen' }))
    fireEvent.keyDown(
      screen.getByRole('row', { name: /Per Tastatur bearbeiten/u }),
      { key: 'Enter' },
    )

    expect(
      screen.getByRole('button', { name: 'Buchung speichern' }),
    ).toBeVisible()
  })

  it('zeigt Nutzerzeiträume tabellarisch und schließt Details mit Escape', () => {
    const occupancyIds = [
      '30000000-0000-4000-8000-000000000181',
      '30000000-0000-4000-8000-000000000182',
      '30000000-0000-4000-8000-000000000183',
      '30000000-0000-4000-8000-000000000184',
    ]
    const data = addTenantOccupancy(
      seededData(),
      {
        billingPeriodId: SEEDED_IDS.period,
        unitId: SEEDED_IDS.unit,
        person: { displayName: 'Fiktiver Tabellen-Nutzer' },
        occupancy: { from: '2026-01-01', to: '2026-12-31', persons: 2 },
        prepayment: { mode: 'monthly', monthlyAmountCents: 15_000 },
      },
      () => occupancyIds.shift()!,
    )

    renderRoute('/nutzer', data, SEEDED_SELECTION)
    const table = screen.getByRole('table', {
      name: 'Nutzerzeiträume bearbeiten',
    })
    expect(
      within(table).getByRole('columnheader', { name: 'Einheit' }),
    ).toBeVisible()
    expect(
      within(table).getByRole('columnheader', { name: 'Zeitraum' }),
    ).toBeVisible()
    expect(
      within(table).getByRole('columnheader', { name: 'Vorauszahlung' }),
    ).toBeVisible()
    expect(
      within(table).getByRole('columnheader', { name: 'Status' }),
    ).toBeVisible()

    const row = within(table).getByRole('row', {
      name: /Fiktiver Tabellen-Nutzer/u,
    })
    expect(row).toHaveTextContent('Prüfen')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(
      screen.getByRole('button', { name: 'Nutzerdaten speichern' }),
    ).toBeVisible()

    fireEvent.keyDown(row, { key: 'Escape' })
    expect(
      screen.queryByRole('button', { name: 'Nutzerdaten speichern' }),
    ).not.toBeInTheDocument()
  })

  it('zeigt fehlende oder veraltete Auswahlkontexte verständlich', () => {
    const { rerender } = render(
      <WorkflowRoute
        path="/abrechnungsjahre"
        data={createEmptyAppDataFile()}
        selection={{
          ownerCompanyId: null,
          propertyId: null,
          billingPeriodId: null,
        }}
        onSelectionChange={vi.fn()}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('zuerst ein Objekt')

    rerender(
      <WorkflowRoute
        path="/kosten"
        data={createEmptyAppDataFile()}
        selection={{
          ownerCompanyId: null,
          propertyId: null,
          billingPeriodId: 'nicht-mehr-da',
        }}
        onSelectionChange={vi.fn()}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('nicht mehr vorhanden')
  })

  it('meldet eine abgelehnte Änderung und unbekannte Routen bleiben leer', () => {
    const data = seededData()
    const { rerender } = render(
      <WorkflowRoute
        path="/kosten"
        data={data}
        selection={SEEDED_SELECTION}
        onSelectionChange={vi.fn()}
        onApply={() => false}
      />,
    )
    fireEvent.change(screen.getByLabelText('Neue Kostenart'), {
      target: { value: 'Hausstrom' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart anlegen' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'konnte nicht gespeichert',
    )

    rerender(
      <WorkflowRoute
        path="/unbekannt"
        data={data}
        selection={SEEDED_SELECTION}
        onSelectionChange={vi.fn()}
        onApply={vi.fn()}
      />,
    )
    expect(document.body).toHaveTextContent('')
  })
})
