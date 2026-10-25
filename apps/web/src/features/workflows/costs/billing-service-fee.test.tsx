import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBillingPeriod } from '../../billing-periods/commands'
import {
  CostCommandError,
  addCostCategory,
  addCostEntry,
  updateCostEntry,
} from '../../costs/commands'
import {
  createCompany,
  createPropertyStructure,
} from '../../master-data/commands'
import { validationIssueLink } from '../../release/validation-links'
import { CostsRoute } from '../CostsRoute'

const IDS = {
  organization: '25000000-0000-4000-8000-000000000001',
  company: '25000000-0000-4000-8000-000000000002',
  property: '25000000-0000-4000-8000-000000000003',
  building: '25000000-0000-4000-8000-000000000004',
  unit: '25000000-0000-4000-8000-000000000005',
  period: '25000000-0000-4000-8000-000000000006',
  service: '25000000-0000-4000-8000-000000000011',
  entry: '25000000-0000-4000-8000-000000000012',
} as const

const SELECTION = {
  ownerCompanyId: IDS.company,
  propertyId: IDS.property,
  billingPeriodId: IDS.period,
}

function ids(...values: string[]) {
  return () => values.shift()!
}

function seededData(): AppDataFile {
  let data = createCompany(
    createEmptyAppDataFile(),
    { organizationName: 'Testverwaltung', ownerCompanyName: 'Test GmbH' },
    { createId: ids(IDS.organization, IDS.company) },
  )
  data = createPropertyStructure(
    data,
    {
      ownerCompanyId: IDS.company,
      internalNumber: 'OBJ-T',
      buildingName: 'Haus Test',
      unitLabel: 'Wohnung 1',
    },
    { createId: ids(IDS.property, IDS.building, IDS.unit) },
  )
  data = createBillingPeriod(
    data,
    { propertyId: IDS.property, year: 2025 },
    { createId: () => IDS.period },
  )
  return addCostCategory(
    data,
    {
      billingPeriodId: IDS.period,
      kind: 'heating',
      label: 'Fiktiver Abrechnungsdienst',
      scope: { kind: 'building', buildingId: IDS.building },
      meteringFee: true,
      meteringFeeKind: 'billing_service',
    },
    () => IDS.service,
  )
}

function renderCosts(initialData: AppDataFile) {
  let data = initialData
  const onApply = vi.fn((transform: (file: AppDataFile) => AppDataFile) => {
    data = transform(data)
    return true
  })
  render(
    <CostsRoute
      data={data}
      selection={SELECTION}
      onSelectionChange={vi.fn()}
      onApply={onApply}
    />,
  )
  return { getData: () => data }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const INVOICE = {
  invoiceNumber: 'F-0001',
  invoiceDate: '2026-03-01',
  servicePeriodStart: '2026-02-01',
  servicePeriodEnd: '2026-02-28',
  netCents: 4_000,
  vatCents: 760,
  vatRatePercent: 19,
}

describe('Rechnungsangaben und Art des Entgelts (ADR-0015)', () => {
  it('verlinkt die neuen Prüfhinweise', () => {
    expect(
      validationIssueLink({
        area: 'heating',
        code: 'heating.billing_service_duplicate',
        entity: { type: 'HeatingCircuit', id: 'k' },
      })?.href,
    ).toBe('#/kosten?tab=categories&kind=heating')
    expect(
      validationIssueLink({
        area: 'costs',
        code: 'costs.invoice_amount_mismatch',
        entity: { type: 'CostEntry', id: 'e1' },
      })?.href,
    ).toBe('#/kosten?tab=entries&edit=e1')
  })

  it('speichert die Art des Entgelts an der Kostenart', () => {
    const data = seededData()
    expect(data.billingData.costCategories[0]?.meteringFeeKind).toBe(
      'billing_service',
    )
    expect(() =>
      addCostCategory(data, {
        billingPeriodId: IDS.period,
        kind: 'heating',
        label: 'Ungültig',
        meteringFeeKind: 'consulting',
      }),
    ).toThrow(CostCommandError)
  })

  it('speichert Rechnungsangaben am Beleg und entfernt sie mit null', () => {
    let data = addCostEntry(
      seededData(),
      {
        costCategoryId: IDS.service,
        amountCents: 4_760,
        date: '2025-12-31',
        invoice: INVOICE,
      },
      () => IDS.entry,
    )
    expect(data.billingData.costEntries[0]?.invoice).toEqual(INVOICE)
    data = updateCostEntry(data, IDS.entry, {
      costCategoryId: IDS.service,
      amountCents: 4_760,
      invoice: null,
    })
    expect('invoice' in data.billingData.costEntries[0]!).toBe(false)
    for (const invoice of [
      { invoiceNumber: 'x', unknown: 1 },
      { netCents: 1.5 },
      { servicePeriodStart: '2026-03-01', servicePeriodEnd: '2026-02-01' },
    ])
      expect(() =>
        updateCostEntry(data, IDS.entry, {
          costCategoryId: IDS.service,
          amountCents: 4_760,
          invoice,
        }),
      ).toThrow(CostCommandError)
  })

  it('bietet die Art des Entgelts nur bei Heizung an', () => {
    renderCosts(seededData())
    expect(screen.queryByLabelText('Art des Entgelts')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'heating' },
    })
    expect(screen.getByLabelText('Art des Entgelts')).toHaveValue('')
    expect(
      screen.getByRole('option', {
        name: 'Erstellung der Heiz-/Warmwasserkostenabrechnung',
      }),
    ).toBeInTheDocument()
  })

  it('erfasst Rechnungsnummer, Datum, Leistungszeitraum, Netto und Umsatzsteuer in der Oberfläche', () => {
    const result = renderCosts(seededData())
    fireEvent.click(screen.getByRole('button', { name: 'Kostenpositionen' }))
    fireEvent.change(screen.getByLabelText('Betrag in Euro'), {
      target: { value: '47,60' },
    })
    const set = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    set('Rechnungsnummer', 'F-0001')
    set('Rechnungsdatum', '2026-03-01')
    set('Leistungszeitraum von', '2026-02-01')
    set('Leistungszeitraum bis', '2026-02-28')
    set('Netto in Euro', '40,00')
    set('Umsatzsteuer in Euro', '7,60')
    set('Umsatzsteuersatz in Prozent', '19')
    fireEvent.click(
      screen.getByRole('button', { name: 'Kostenposition anlegen' }),
    )
    expect(result.getData().billingData.costEntries[0]?.invoice).toEqual({
      ...INVOICE,
      netCents: 4_000,
      vatCents: 760,
    })
  })
})
