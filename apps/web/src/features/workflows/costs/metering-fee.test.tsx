import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBillingPeriod } from '../../billing-periods/commands'
import { addCostCategory } from '../../costs/commands'
import {
  createCompany,
  createPropertyStructure,
} from '../../master-data/commands'
import { validationIssueLink } from '../../release/validation-links'
import { CostsRoute } from '../CostsRoute'

const IDS = {
  organization: '24000000-0000-4000-8000-000000000001',
  company: '24000000-0000-4000-8000-000000000002',
  property: '24000000-0000-4000-8000-000000000003',
  building: '24000000-0000-4000-8000-000000000004',
  unit: '24000000-0000-4000-8000-000000000005',
  period: '24000000-0000-4000-8000-000000000006',
  heating: '24000000-0000-4000-8000-000000000011',
  service: '24000000-0000-4000-8000-000000000012',
  operating: '24000000-0000-4000-8000-000000000013',
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
    { propertyId: IDS.property, year: 2026 },
    { createId: () => IDS.period },
  )
  const scope = { kind: 'building', buildingId: IDS.building } as const
  data = addCostCategory(
    data,
    {
      billingPeriodId: IDS.period,
      kind: 'heating',
      label: 'Heizkostenabrechnung',
      scope,
    },
    () => IDS.heating,
  )
  data = addCostCategory(
    data,
    {
      billingPeriodId: IDS.period,
      kind: 'heating',
      label: 'Fiktiver Dienstleister',
      scope,
    },
    () => IDS.service,
  )
  return addCostCategory(
    data,
    {
      billingPeriodId: IDS.period,
      kind: 'operating',
      label: 'Gebäudeversicherung',
    },
    () => IDS.operating,
  )
}

function renderCosts(initialData: AppDataFile) {
  let data = initialData
  const onApply = vi.fn((transform: (file: AppDataFile) => AppDataFile) => {
    data = transform(data)
    return true
  })
  const view = render(
    <CostsRoute
      data={data}
      selection={SELECTION}
      onSelectionChange={vi.fn()}
      onApply={onApply}
    />,
  )
  return {
    getData: () => data,
    rerender: () =>
      view.rerender(
        <CostsRoute
          data={data}
          selection={SELECTION}
          onSelectionChange={vi.fn()}
          onApply={onApply}
        />,
      ),
  }
}

function category(data: AppDataFile, id: string) {
  return data.billingData.costCategories.find(
    (candidate) => candidate.id === id,
  )!
}

const FIELD = 'Entgelt für Verbrauchserfassung und Abrechnung (§ 6a HeizKV)'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Entgelt für Verbrauchserfassung in der Kostenart (ADR-0006)', () => {
  it('zeigt in der Übersicht, welche Heizungs-Kostenarten als Entgelt zählen', () => {
    renderCosts(seededData())
    const table = screen.getByRole('table', { name: 'Kostenarten bearbeiten' })
    const row = (label: string) => within(table).getByText(label).closest('tr')!
    expect(
      within(row('Heizkostenabrechnung')).getByText(
        'Entgelt für Verbrauchserfassung (§ 6a HeizKV): automatisch erkannt',
      ),
    ).toBeInTheDocument()
    expect(
      within(row('Fiktiver Dienstleister')).getByText(
        'Entgelt für Verbrauchserfassung (§ 6a HeizKV): nicht erkannt',
      ),
    ).toBeInTheDocument()
    expect(
      within(row('Gebäudeversicherung')).queryByText(/§ 6a HeizKV/),
    ).not.toBeInTheDocument()
  })

  it('bietet die Auswahl nur bei Art „Heizung“ an', () => {
    renderCosts(seededData())
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'heating' },
    })
    expect(screen.getByLabelText(FIELD)).toHaveValue('auto')
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'water' },
    })
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument()
  })

  it('legt eine Heizungs-Kostenart mit Kennzeichen an und setzt das Formular zurück', () => {
    const result = renderCosts(seededData())
    fireEvent.change(screen.getByLabelText('Neue Kostenart'), {
      target: { value: 'Gerätedienst Test' },
    })
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'heating' },
    })
    fireEvent.change(screen.getByLabelText(FIELD), {
      target: { value: 'no' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart anlegen' }))
    const created = result
      .getData()
      .billingData.costCategories.find(
        ({ label }) => label === 'Gerätedienst Test',
      )
    expect(created?.meteringFee).toBe(false)
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument()
  })

  it('setzt das Kennzeichen beim Bearbeiten und setzt es wieder zurück', () => {
    const result = renderCosts(seededData())
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Dienstleister bearbeiten' }),
    )
    fireEvent.change(screen.getByLabelText(FIELD), {
      target: { value: 'yes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart speichern' }))
    expect(category(result.getData(), IDS.service).meteringFee).toBe(true)

    result.rerender()
    expect(
      screen.getByText('Entgelt für Verbrauchserfassung (§ 6a HeizKV): ja'),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Dienstleister bearbeiten' }),
    )
    expect(screen.getByLabelText(FIELD)).toHaveValue('yes')
    fireEvent.change(screen.getByLabelText(FIELD), {
      target: { value: 'auto' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart speichern' }))
    expect('meteringFee' in category(result.getData(), IDS.service)).toBe(false)
  })

  it('entfernt das Kennzeichen, wenn die Art nicht mehr Heizung ist', () => {
    let data = seededData()
    data = {
      ...data,
      billingData: {
        ...data.billingData,
        costCategories: data.billingData.costCategories.map((entry) =>
          entry.id === IDS.service ? { ...entry, meteringFee: true } : entry,
        ),
      },
    }
    const result = renderCosts(data)
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Dienstleister bearbeiten' }),
    )
    const editor = screen
      .getByRole('heading', { name: 'Fiktiver Dienstleister' })
      .closest('article')!
    fireEvent.change(within(editor).getByLabelText('Typ'), {
      target: { value: 'operating' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart speichern' }))
    expect('meteringFee' in category(result.getData(), IDS.service)).toBe(false)
  })

  it('führt den Prüfhinweis zu den gefilterten Heizungs-Kostenarten', () => {
    const link = validationIssueLink({
      area: 'heating',
      code: 'heating.metering_fee_not_identified',
      entity: { type: 'HeatingCircuit', id: 'kreis-test' },
    })
    expect(link).toEqual({
      href: '#/kosten?tab=categories&kind=heating',
      label: 'Heizungs-Kostenarten kennzeichnen',
    })
    window.history.replaceState(null, '', `/${link.href}`)
    renderCosts(seededData())
    expect(screen.getByLabelText('Kostenart-Typ')).toHaveValue('heating')
    const table = screen.getByRole('table', { name: 'Kostenarten bearbeiten' })
    expect(within(table).queryByText('Gebäudeversicherung')).toBeNull()
    expect(within(table).getByText('Fiktiver Dienstleister')).toBeVisible()
  })
})
