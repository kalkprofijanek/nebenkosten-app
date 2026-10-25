import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBillingPeriod } from '../../billing-periods/commands'
import {
  CostCommandError,
  addCostCategory,
  updateCostCategory,
} from '../../costs/commands'
import {
  createCompany,
  createPropertyStructure,
} from '../../master-data/commands'
import { CostsRoute } from '../CostsRoute'

const IDS = {
  organization: '26000000-0000-4000-8000-000000000001',
  company: '26000000-0000-4000-8000-000000000002',
  property: '26000000-0000-4000-8000-000000000003',
  building: '26000000-0000-4000-8000-000000000004',
  unit: '26000000-0000-4000-8000-000000000005',
  period: '26000000-0000-4000-8000-000000000006',
  water: '26000000-0000-4000-8000-000000000011',
} as const

const SELECTION = {
  ownerCompanyId: IDS.company,
  propertyId: IDS.property,
  billingPeriodId: IDS.period,
}

const FIELD = 'Verbrauch laut Hauptwasserzähler in m³ (optional)'

function ids(...values: string[]) {
  return () => values.shift()!
}

/** Fiktives Objekt; keine Werte einer echten Wasserrechnung. */
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
  return addCostCategory(
    data,
    {
      billingPeriodId: IDS.period,
      kind: 'water',
      label: 'Wasser und Abwasser',
      allocationKey: 'water_consumption',
    },
    () => IDS.water,
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

function water(data: AppDataFile) {
  return data.billingData.costCategories.find(({ id }) => id === IDS.water)!
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Verbrauch laut Hauptwasserzähler an der Kostenart (ADR-0013, E-45-3)', () => {
  it('speichert den Wert und entfernt ihn mit null', () => {
    let data = updateCostCategory(seededData(), IDS.water, {
      kind: 'water',
      label: 'Wasser und Abwasser',
      allocationKey: 'water_consumption',
      mainWaterMeterM3: 412.5,
    })
    expect(water(data).mainWaterMeterM3).toBe(412.5)
    data = updateCostCategory(data, IDS.water, {
      kind: 'water',
      label: 'Wasser und Abwasser',
      mainWaterMeterM3: null,
    })
    expect('mainWaterMeterM3' in water(data)).toBe(false)
    for (const mainWaterMeterM3 of [0, -5, '100'])
      expect(() =>
        updateCostCategory(data, IDS.water, {
          kind: 'water',
          label: 'Wasser und Abwasser',
          mainWaterMeterM3,
        }),
      ).toThrow(CostCommandError)
  })

  it('bietet das Feld nur bei Art „Wasser“ an', () => {
    renderCosts(seededData())
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'water' },
    })
    expect(screen.getByLabelText(FIELD)).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'heating' },
    })
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument()
  })

  it('erfasst den Wert beim Bearbeiten mit Dezimalkomma und leert ihn wieder', () => {
    const result = renderCosts(seededData())
    fireEvent.click(
      screen.getByRole('button', { name: 'Wasser und Abwasser bearbeiten' }),
    )
    fireEvent.change(screen.getByLabelText(FIELD), {
      target: { value: '412,5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart speichern' }))
    expect(water(result.getData()).mainWaterMeterM3).toBe(412.5)

    cleanup()
    const again = renderCosts(result.getData())
    fireEvent.click(
      screen.getByRole('button', { name: 'Wasser und Abwasser bearbeiten' }),
    )
    expect(screen.getByLabelText(FIELD)).toHaveValue('412,5')
    fireEvent.change(screen.getByLabelText(FIELD), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kostenart speichern' }))
    expect('mainWaterMeterM3' in water(again.getData())).toBe(false)
  })
})
