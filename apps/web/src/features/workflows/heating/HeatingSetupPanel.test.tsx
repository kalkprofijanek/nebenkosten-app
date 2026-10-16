import {
  createEmptyAppDataFile,
  type AppDataFile,
  type ConsumptionBenchmark,
} from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HeatingSetupPanel } from './HeatingSetupPanel'

afterEach(cleanup)

const IDS = {
  organization: '30000000-0000-4000-8000-000000000001',
  company: '30000000-0000-4000-8000-000000000002',
  property: '30000000-0000-4000-8000-000000000003',
  building: '30000000-0000-4000-8000-000000000004',
  otherBuilding: '30000000-0000-4000-8000-000000000005',
  previousPeriod: '30000000-0000-4000-8000-000000000006',
  period: '30000000-0000-4000-8000-000000000007',
  system: '30000000-0000-4000-8000-000000000008',
  previousCircuit: '30000000-0000-4000-8000-000000000009',
  circuit: '30000000-0000-4000-8000-00000000000a',
  source: '30000000-0000-4000-8000-00000000000b',
} as const

// Fiktive Grenzen, keine Heizspiegel-Originalwerte.
const BENCHMARK: ConsumptionBenchmark = {
  source: 'Heizspiegel für Deutschland (co2online)',
  referenceYear: 2024,
  category: 'Fiktive Kategorie Vorjahr',
  includesHotWater: true,
  lowMaxKwhPerSqmYear: 70,
  mediumMaxKwhPerSqmYear: 130,
  elevatedMaxKwhPerSqmYear: 200,
}

function createData({
  current,
  previous,
}: {
  current?: ConsumptionBenchmark
  previous?: ConsumptionBenchmark
}): AppDataFile {
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
          id: IDS.previousPeriod,
          propertyId: IDS.property,
          year: 2024,
          periodStart: '2024-01-01',
          periodEnd: '2024-12-31',
          status: 'DRAFT',
        },
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
          id: IDS.previousCircuit,
          billingPeriodId: IDS.previousPeriod,
          heatingSystemId: IDS.system,
          buildingId: IDS.building,
          hasCentralHotWater: false,
          ...(previous ? { consumptionBenchmark: previous } : {}),
        },
        {
          id: IDS.circuit,
          billingPeriodId: IDS.period,
          heatingSystemId: IDS.system,
          buildingId: IDS.building,
          hasCentralHotWater: false,
          ...(current ? { consumptionBenchmark: current } : {}),
        },
      ],
      energySources: [
        {
          id: IDS.source,
          heatingCircuitId: IDS.circuit,
          key: 'haupt',
          name: 'Fiktives Gas',
          sourceType: 'Gas',
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
  const props = {
    selection: {
      ownerCompanyId: IDS.company,
      propertyId: IDS.property,
      billingPeriodId: IDS.period,
    },
    onSelectionChange: vi.fn(),
    onApply: apply,
    apply,
  }
  const view = render(<HeatingSetupPanel {...props} data={data} />)
  return {
    apply,
    current: () => data,
    rerender: () => view.rerender(<HeatingSetupPanel {...props} data={data} />),
  }
}

function circuit(data: AppDataFile) {
  return data.billingData.heatingCircuits.find(({ id }) => id === IDS.circuit)
}

function openEditor() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Fiktives Gas bearbeiten' }),
  )
  return within(
    screen
      .getByRole('button', { name: 'Heizkreis speichern' })
      .closest('form')!,
  )
}

function fill(form: ReturnType<typeof within>, label: string, value: string) {
  fireEvent.change(form.getByLabelText(label), { target: { value } })
}

describe('Vergleichswerte (Heizspiegel) am Heizkreis', () => {
  it('erfasst Vergleichswerte mit Vorbelegung von Quelle und Warmwasser', () => {
    const panel = renderPanel(createData({}))
    const form = openEditor()
    expect(form.getByText(/Keine Vergleichswerte erfasst/)).toBeVisible()
    expect(
      form.queryByRole('button', {
        name: 'Vergleichswerte aus dem Vorjahr übernehmen',
      }),
    ).toBeNull()
    fireEvent.click(
      form.getByRole('button', { name: 'Vergleichswerte erfassen' }),
    )
    expect(form.getByLabelText('Quelle')).toHaveValue(
      'Heizspiegel für Deutschland (co2online)',
    )
    expect(form.getByLabelText('Werte enthalten Warmwasser')).toBeChecked()
    fill(form, 'Fundstelle (URL, optional)', 'https://example.org/spiegel')
    fill(form, 'Bezugsjahr', '2024')
    fill(form, 'Kategorie', 'Erdgas, fiktive Kategorie')
    fill(form, 'niedrig bis (kWh/m²·a)', '70,5')
    fill(form, 'mittel bis (kWh/m²·a)', '130')
    fill(form, 'erhöht bis (kWh/m²·a)', '200')
    fireEvent.click(form.getByLabelText('Werte enthalten Warmwasser'))
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))

    expect(panel.apply).toHaveBeenCalledTimes(1)
    expect(circuit(panel.current())?.consumptionBenchmark).toEqual({
      source: 'Heizspiegel für Deutschland (co2online)',
      sourceUrl: 'https://example.org/spiegel',
      referenceYear: 2024,
      category: 'Erdgas, fiktive Kategorie',
      includesHotWater: false,
      lowMaxKwhPerSqmYear: 70.5,
      mediumMaxKwhPerSqmYear: 130,
      elevatedMaxKwhPerSqmYear: 200,
    })
  })

  it('zeigt deutsche Feldfehler und speichert ungültige Werte nicht', () => {
    const panel = renderPanel(createData({}))
    const form = openEditor()
    fireEvent.click(
      form.getByRole('button', { name: 'Vergleichswerte erfassen' }),
    )
    fill(form, 'Quelle', ' ')
    fill(form, 'Fundstelle (URL, optional)', 'ftp://example.org')
    fill(form, 'Bezugsjahr', '1980')
    fill(form, 'niedrig bis (kWh/m²·a)', 'abc')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))

    expect(panel.apply).not.toHaveBeenCalled()
    expect(form.getByText(/Quelle der Vergleichswerte/)).toBeVisible()
    expect(form.getByText(/vollständige Webadresse/)).toBeVisible()
    expect(form.getByText(/zwischen 1990 und 2100/)).toBeVisible()
    expect(form.getByText(/Kategorie laut Quelle/)).toBeVisible()
    expect(form.getByText(/„niedrig bis“/)).toBeVisible()
    expect(form.getByText(/„mittel bis“/)).toBeVisible()
    expect(form.getByLabelText('Bezugsjahr')).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    fill(form, 'Quelle', 'Testquelle')
    fill(form, 'Fundstelle (URL, optional)', '')
    fill(form, 'Bezugsjahr', '2024')
    fill(form, 'Kategorie', 'Fiktiv')
    fill(form, 'niedrig bis (kWh/m²·a)', '150')
    fill(form, 'mittel bis (kWh/m²·a)', '130')
    fill(form, 'erhöht bis (kWh/m²·a)', '200')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))
    expect(panel.apply).not.toHaveBeenCalled()
    expect(form.getByText(/aufsteigend/)).toBeVisible()
  })

  it('ändert und entfernt vorhandene Vergleichswerte', () => {
    const panel = renderPanel(createData({ current: BENCHMARK }))
    let form = openEditor()
    expect(form.getByLabelText('Kategorie')).toHaveValue(
      'Fiktive Kategorie Vorjahr',
    )
    fill(form, 'erhöht bis (kWh/m²·a)', '210')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))
    expect(
      circuit(panel.current())?.consumptionBenchmark?.elevatedMaxKwhPerSqmYear,
    ).toBe(210)

    panel.rerender()
    form = openEditor()
    fireEvent.click(
      form.getByRole('button', { name: 'Vergleichswerte entfernen' }),
    )
    expect(form.queryByLabelText('Kategorie')).toBeNull()
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))
    expect(circuit(panel.current())).not.toHaveProperty('consumptionBenchmark')
  })

  it('übernimmt Vergleichswerte aus dem Vorjahr desselben Gebäudes', () => {
    const panel = renderPanel(createData({ previous: BENCHMARK }))
    const form = openEditor()
    fireEvent.click(
      form.getByRole('button', {
        name: 'Vergleichswerte aus dem Vorjahr übernehmen',
      }),
    )
    expect(form.getByLabelText('Kategorie')).toHaveValue(
      'Fiktive Kategorie Vorjahr',
    )
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis speichern' }))
    expect(circuit(panel.current())?.consumptionBenchmark).toEqual(BENCHMARK)
  })

  it('legt einen Heizkreis mit Vergleichswerten an', () => {
    const panel = renderPanel(createData({}))
    const form = within(
      screen
        .getByRole('button', { name: 'Heizkreis anlegen' })
        .closest('form')!,
    )
    fireEvent.change(form.getByLabelText('Gebäude'), {
      target: { value: IDS.otherBuilding },
    })
    fill(form, 'Heizsystem', 'Neue Testanlage')
    fill(form, 'Quellenschlüssel', 'haupt')
    fill(form, 'Energiequelle', 'Fiktives Öl')
    fill(form, 'Energieträger', 'Heizöl')
    fireEvent.click(
      form.getByRole('button', { name: 'Vergleichswerte erfassen' }),
    )
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis anlegen' }))
    expect(panel.apply).not.toHaveBeenCalled()
    expect(form.getByText(/Kategorie laut Quelle/)).toBeVisible()

    fill(form, 'Bezugsjahr', '2024')
    fill(form, 'Kategorie', 'Heizöl, fiktiv')
    fill(form, 'niedrig bis (kWh/m²·a)', '70')
    fill(form, 'mittel bis (kWh/m²·a)', '130')
    fill(form, 'erhöht bis (kWh/m²·a)', '200')
    fireEvent.click(form.getByRole('button', { name: 'Heizkreis anlegen' }))
    expect(panel.apply).toHaveBeenCalledTimes(1)
    const created = panel
      .current()
      .billingData.heatingCircuits.find(
        ({ buildingId }) => buildingId === IDS.otherBuilding,
      )
    expect(created?.consumptionBenchmark?.category).toBe('Heizöl, fiktiv')
    expect(form.getByText(/Keine Vergleichswerte erfasst/)).toBeVisible()
  })
})
