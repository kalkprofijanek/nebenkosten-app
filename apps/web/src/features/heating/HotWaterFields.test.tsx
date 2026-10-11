import {
  createEmptyAppDataFile,
  type AppDataFile,
  type HeatingCircuit,
} from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HeatingSetupPanel } from '../workflows/heating/HeatingSetupPanel'
import { readHotWaterForm, HOT_WATER_FIELD_NAMES } from './hot-water-form'

afterEach(cleanup)

const IDS = {
  organization: '40000000-0000-4000-8000-000000000001',
  company: '40000000-0000-4000-8000-000000000002',
  property: '40000000-0000-4000-8000-000000000003',
  building: '40000000-0000-4000-8000-000000000004',
  otherBuilding: '40000000-0000-4000-8000-000000000005',
  period: '40000000-0000-4000-8000-000000000006',
  system: '40000000-0000-4000-8000-000000000007',
  circuit: '40000000-0000-4000-8000-000000000008',
  source: '40000000-0000-4000-8000-000000000009',
} as const

function createData(
  circuit: Partial<HeatingCircuit> = {},
  sourceType = 'Heizöl',
): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [{ id: IDS.organization, name: 'Testverwaltung' }],
      ownerCompanies: [
        {
          id: IDS.company,
          organizationId: IDS.organization,
          name: 'Testgesellschaft',
          additionalNameLines: [],
        },
      ],
      properties: [{ id: IDS.property, ownerCompanyId: IDS.company }],
      buildings: [
        {
          id: IDS.building,
          propertyId: IDS.property,
          name: 'Haus A',
          mandateRefPrefixes: [],
        },
        {
          id: IDS.otherBuilding,
          propertyId: IDS.property,
          name: 'Haus B',
          mandateRefPrefixes: [],
        },
      ],
      heatingSystems: [
        { id: IDS.system, propertyId: IDS.property, name: 'Testanlage' },
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: IDS.period,
          propertyId: IDS.property,
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
        },
      ],
      heatingCircuits: [
        {
          id: IDS.circuit,
          billingPeriodId: IDS.period,
          heatingSystemId: IDS.system,
          buildingId: IDS.building,
          hasCentralHotWater: true,
          hotWaterSharePercent: 18,
          ...circuit,
        },
      ],
      energySources: [
        {
          id: IDS.source,
          heatingCircuitId: IDS.circuit,
          key: 'haupt',
          name: 'Fiktive Quelle',
          sourceType,
        },
      ],
    },
  }
}

function renderPanel(initial: AppDataFile) {
  let data = initial
  const apply = vi.fn(
    (transform: (current: AppDataFile) => AppDataFile): boolean => {
      data = transform(data)
      return true
    },
  )
  render(
    <HeatingSetupPanel
      data={data}
      selection={{
        ownerCompanyId: IDS.company,
        propertyId: IDS.property,
        billingPeriodId: IDS.period,
      }}
      onSelectionChange={vi.fn()}
      onApply={apply}
      apply={apply}
    />,
  )
  return { apply, current: () => data }
}

function openEditor() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Fiktive Quelle bearbeiten' }),
  )
  return within(
    screen
      .getByRole('button', { name: 'Heizkreis speichern' })
      .closest('form')!,
  )
}

function stored(data: AppDataFile) {
  return data.billingData.heatingCircuits.find(({ id }) => id === IDS.circuit)
}

function select(form: ReturnType<typeof within>, label: string, value: string) {
  fireEvent.change(form.getByLabelText(label), { target: { value } })
}

describe('Warmwasser am Heizkreis (§§ 8, 9 HeizKV)', () => {
  it('erfasst die Wärmemenge über Volumen und Temperatur', () => {
    const panel = renderPanel(createData())
    const form = openEditor()
    expect(form.getByLabelText('Wärmemenge Warmwasser')).toHaveValue('')
    expect(form.getByText(/Pauschalanteil/, { selector: 'p' })).toBeVisible()
    select(form, 'Wärmemenge Warmwasser', 'volume_formula')
    expect(form.getByText(/§ 9 Abs. 2 Satz 2 HeizKV/)).toBeVisible()
    select(form, 'Warmwasservolumen V (m³)', '120,5')
    select(form, 'Mittlere Warmwassertemperatur tw (°C)', '55')
    fireEvent.click(form.getByLabelText('Temperatur geschätzt'))
    // Heizöl: kein Brennwertfaktor für Erdgas.
    expect(
      form.queryByLabelText('Erdgas brennwertbezogen abgerechnet (× 1,11)'),
    ).toBeNull()
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))

    expect(panel.apply).toHaveBeenCalledTimes(1)
    expect(stored(panel.current())?.hotWaterEnergy).toEqual({
      method: 'volume_formula',
      volumeM3: 120.5,
      temperatureC: 55,
      temperatureEstimated: true,
    })
    expect(stored(panel.current())).not.toHaveProperty('hotWaterAllocation')
  })

  it('verlangt bei der Flächenformel eine Begründung', () => {
    const panel = renderPanel(createData({}, 'Erdgas'))
    const form = openEditor()
    select(form, 'Wärmemenge Warmwasser', 'area_formula')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))
    expect(panel.apply).not.toHaveBeenCalled()
    expect(form.getByText(/§ 9 Abs. 2 Satz 4 HeizKV\)/)).toBeVisible()
    expect(form.getByLabelText('Begründung (Pflicht)')).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    select(form, 'Begründung (Pflicht)', 'Weder Wärmezähler noch Wasserzähler')
    select(form, 'Wohnfläche A (m², optional)', '480')
    fireEvent.click(
      form.getByLabelText('Erdgas brennwertbezogen abgerechnet (× 1,11)'),
    )
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))
    expect(stored(panel.current())?.hotWaterEnergy).toEqual({
      method: 'area_formula',
      areaSqm: 480,
      reason: 'Weder Wärmezähler noch Wasserzähler',
      condensingNaturalGas: true,
    })
  })

  it('verteilt nach Verbrauch nur mit Anteil von 50 bis 70 %', () => {
    const panel = renderPanel(createData())
    const form = openEditor()
    select(form, 'Verteilung Warmwasserkosten', 'consumption')
    expect(form.getByText(/§ 8 Abs. 1 HeizKV: 50–70 %/)).toBeVisible()
    select(form, 'Verbrauchsanteil Warmwasser (%)', '80')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))
    expect(panel.apply).not.toHaveBeenCalled()
    expect(form.getByText(/zwischen 50 und 70 Prozent/)).toBeVisible()

    select(form, 'Verbrauchsanteil Warmwasser (%)', '60')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))
    expect(stored(panel.current())?.hotWaterAllocation).toEqual({
      key: 'consumption',
      consumptionSharePercent: 60,
    })
  })

  it('zeigt gespeicherte Angaben und setzt sie auf das Altverfahren zurück', () => {
    const panel = renderPanel(
      createData({
        hotWaterEnergy: { method: 'heat_meter', heatKwh: 12_000 },
        hotWaterAllocation: { key: 'area' },
      }),
    )
    const form = openEditor()
    expect(form.getByLabelText('Wärmemenge Warmwasser (kWh)')).toHaveValue(
      '12000',
    )
    expect(form.getByLabelText('Verteilung Warmwasserkosten')).toHaveValue(
      'area',
    )
    select(form, 'Wärmemenge Warmwasser', '')
    select(form, 'Verteilung Warmwasserkosten', 'persons')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))
    expect(stored(panel.current())).not.toHaveProperty('hotWaterEnergy')
    expect(stored(panel.current())).not.toHaveProperty('hotWaterAllocation')
  })

  it('legt einen Heizkreis mit Wärmezähler und ohne Pauschalanteil an', () => {
    const panel = renderPanel(createData())
    const form = within(
      screen
        .getByRole('button', { name: 'Heizkreis anlegen' })
        .closest('form')!,
    )
    select(form, 'Gebäude', IDS.otherBuilding)
    select(form, 'Heizsystem', 'Neue Testanlage')
    select(form, 'Quellenschlüssel', 'haupt')
    select(form, 'Energiequelle', 'Fiktives Gas')
    select(form, 'Energieträger', 'Erdgas')
    fireEvent.click(form.getByLabelText('Zentrale Warmwasserbereitung'))
    select(form, 'Wärmemenge Warmwasser', 'heat_meter')
    select(form, 'Wärmemenge Warmwasser (kWh)', 'viel')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis anlegen' }))
    expect(panel.apply).not.toHaveBeenCalled()
    expect(form.getByText(/gemessene Wärmemenge/)).toBeVisible()

    select(form, 'Wärmemenge Warmwasser (kWh)', '9500')
    select(form, 'Verteilung Warmwasserkosten', 'area')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis anlegen' }))
    expect(panel.apply).toHaveBeenCalledTimes(1)
    const created = panel
      .current()
      .billingData.heatingCircuits.find(
        ({ buildingId }) => buildingId === IDS.otherBuilding,
      )
    expect(created?.hotWaterEnergy).toEqual({
      method: 'heat_meter',
      heatKwh: 9500,
    })
    expect(created?.hotWaterAllocation).toEqual({ key: 'area' })
  })
})

describe('readHotWaterForm', () => {
  it('ignoriert Angaben ohne zentrale Warmwasserbereitung', () => {
    const form = new FormData()
    form.set(HOT_WATER_FIELD_NAMES.method, 'heat_meter')
    form.set(HOT_WATER_FIELD_NAMES.allocationKey, 'area')
    expect(readHotWaterForm(form, false)).toEqual({
      ok: true,
      hotWaterEnergy: null,
      hotWaterAllocation: null,
    })
  })

  it('meldet fehlende Pflichtwerte der Volumenformel je Feld', () => {
    const form = new FormData()
    form.set(HOT_WATER_FIELD_NAMES.method, 'volume_formula')
    form.set(HOT_WATER_FIELD_NAMES.temperatureC, '5')
    const result = readHotWaterForm(form, true)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.errors).sort()).toEqual([
      'temperatureC',
      'volumeM3',
    ])
  })
})
