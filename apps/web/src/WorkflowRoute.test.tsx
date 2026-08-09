import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createCompany,
  createPropertyStructure,
} from './features/master-data/commands'
import { createBillingPeriod } from './features/billing-periods/commands'
import { WorkflowRoute, type WorkflowSelection } from './WorkflowRoute'

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

  it('erfasst Kostenart und Buchung atomar', () => {
    const result = renderRoute('/kosten', seededData(), SEEDED_SELECTION)

    fireEvent.change(screen.getByLabelText('Kostenart'), {
      target: { value: 'Gebäudereinigung' },
    })
    fireEvent.change(screen.getByLabelText('Umlageschlüssel'), {
      target: { value: 'residential_units' },
    })
    fireEvent.change(screen.getByLabelText('Belegdatum'), {
      target: { value: '2026-03-15' },
    })
    fireEvent.change(screen.getByLabelText('Betrag in Euro'), {
      target: { value: '1000,99' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kosten erfassen' }))

    expect(result.getData().billingData.costCategories).toHaveLength(1)
    expect(result.getData().billingData.costEntries[0]?.amountCents).toBe(
      100_099,
    )
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
    expect(
      screen.getByRole('heading', { name: 'Kostenpositionen (1)' }),
    ).toBeVisible()
    expect(screen.getByText('Fiktive Rechnung')).toBeVisible()
    expect(screen.getByText('TEST-17')).toBeVisible()
    expect(screen.getAllByText(/1\.234,56\s€/u)).toHaveLength(2)
    expect(
      screen.getByRole('heading', { name: 'Bankbuchungen (1)' }),
    ).toBeVisible()
    expect(screen.getByText('Musterfirma Dienstleistung')).toBeVisible()
    expect(screen.getByText('Testleistung März')).toBeVisible()
    expect(screen.getByText(/-250,50\s€/u)).toBeVisible()
    expect(screen.queryByText('Fremdes Objekt')).not.toBeInTheDocument()
  })

  it('legt Heizsystem, Heizkreis und Energiequelle gemeinsam an', () => {
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
    fireEvent.change(screen.getByLabelText('Kostenart'), {
      target: { value: 'Hausstrom' },
    })
    fireEvent.change(screen.getByLabelText('Betrag in Euro'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kosten erfassen' }))
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
