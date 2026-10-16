import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OccupancyEditor } from './OccupancyEditor'

afterEach(cleanup)

function fixture(): AppDataFile {
  const empty = createEmptyAppDataFile()
  const unit = (id: string, area: number) => ({
    id,
    propertyId: 'p',
    buildingId: 'b1',
    label: id,
    heatedAreaSqm: { value: area, unit: 'm2' as const },
  })
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      buildings: [
        { id: 'b1', propertyId: 'p', name: 'Haus A', mandateRefPrefixes: [] },
      ],
      units: [unit('u1', 50), unit('u2', 50)],
      tenancies: [{ id: 't2', unitId: 'u2', personIds: [] }],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'y',
          propertyId: 'p',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
        },
      ],
      occupancyPeriods: [
        {
          id: 'o1',
          billingPeriodId: 'y',
          unitId: 'u1',
          kind: 'tenant',
          consumptionUnits: { value: 420.5, unit: 'einheiten' },
        },
        {
          id: 'o2',
          billingPeriodId: 'y',
          unitId: 'u2',
          tenancyId: 't2',
          kind: 'tenant',
          consumptionUnits: { value: 0, unit: 'einheiten' },
        },
      ],
    },
  }
}

describe('OccupancyEditor', () => {
  it('zeigt den Heizverbrauch nur an und verweist auf die Verbrauchsseite', () => {
    const data = fixture()
    data.billingData.occupancyPeriods[1] = {
      ...data.billingData.occupancyPeriods[1]!,
      consumptionUnits: { value: 119.5, unit: 'einheiten' },
      consumptionUnitsEstimated: true,
      heatMeterReading: { meterNumber: 'HZ-12' },
      coldWater: { value: 12.5, unit: 'm3' },
    }
    render(
      <OccupancyEditor
        data={data}
        occupancy={data.billingData.occupancyPeriods[1]!}
        period={data.billingData.billingPeriods[0]!}
        saveTenant={vi.fn()}
        saveVacancy={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/119,5 Einheiten \(HKV, geschätzt\) · Zähler HZ-12/),
    ).toBeVisible()
    expect(
      screen.getByRole('link', {
        name: 'Zählerstände, Verbrauch und Wasser bearbeiten',
      }),
    ).toHaveAttribute('href', '#/verbrauch?occupancy=o2')
    expect(screen.getByText(/Wasser kalt 12,5 \/ warm – m³/)).toBeVisible()
    expect(
      screen.queryByLabelText('Verbrauchseinheiten bearbeiten'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Kaltwasser in m³ bearbeiten'),
    ).not.toBeInTheDocument()
  })

  it('weist beim Auszug im Jahr auf die Zwischenablesung hin (§ 9b HeizKV)', () => {
    const data = fixture()
    data.billingData.heatingCircuits = [
      {
        id: 'c1',
        billingPeriodId: 'y',
        heatingSystemId: 'hs1',
        buildingId: 'b1',
        hasCentralHotWater: false,
      },
    ]
    const view = (source: AppDataFile, occupancyIndex = 1) =>
      render(
        <OccupancyEditor
          data={source}
          occupancy={source.billingData.occupancyPeriods[occupancyIndex]!}
          period={source.billingData.billingPeriods[0]!}
          saveTenant={vi.fn()}
          saveVacancy={vi.fn()}
        />,
      )
    view(data)
    expect(screen.queryByRole('note')).toBeNull()
    fireEvent.change(screen.getByLabelText('Auszug bearbeiten'), {
      target: { value: '2025-06-30' },
    })
    expect(screen.getByRole('note')).toHaveTextContent(
      'Zwischenablesung zum 30.06.2025 veranlassen (§ 9b Abs. 1 HeizKV): Messdienst beauftragen bzw. Stände selbst ablesen und unter ‚Verbrauch‘ erfassen. Eine Aufteilung nach Gradtagen ist nur zulässig, wenn die Ablesung nicht möglich war.',
    )
    // Nicht blockierend: Speichern bleibt möglich.
    expect(
      screen.getByRole('button', { name: 'Nutzerdaten speichern' }),
    ).toBeEnabled()
    cleanup()

    // Ohne Heizkreis kein Hinweis.
    view(fixture())
    fireEvent.change(screen.getByLabelText('Auszug bearbeiten'), {
      target: { value: '2025-06-30' },
    })
    expect(screen.queryByRole('note')).toBeNull()
    cleanup()

    // Mit erfasstem Endstand zum Auszug kein Hinweis.
    const read = structuredClone(data)
    read.billingData.occupancyPeriods[1]!.heatMeterReading = {
      endValue: 321,
      endDate: '2025-06-30',
    }
    view(read)
    fireEvent.change(screen.getByLabelText('Auszug bearbeiten'), {
      target: { value: '2025-06-30' },
    })
    expect(screen.queryByRole('note')).toBeNull()
    cleanup()

    // Leerstand: Beginn nach Periodenbeginn.
    const vacant = structuredClone(data)
    vacant.billingData.occupancyPeriods.push({
      id: 'o3',
      billingPeriodId: 'y',
      unitId: 'u1',
      kind: 'vacancy',
    })
    view(vacant, 2)
    fireEvent.change(screen.getByLabelText('Leerstand von bearbeiten'), {
      target: { value: '2025-10-01' },
    })
    expect(screen.getByRole('note')).toHaveTextContent(
      'Zwischenablesung zum 01.10.2025',
    )
  })

  it('meldet einen fehlenden Heizverbrauch', () => {
    const data = fixture()
    render(
      <OccupancyEditor
        data={data}
        occupancy={{
          ...data.billingData.occupancyPeriods[1]!,
          consumptionUnits: undefined,
        }}
        period={data.billingData.billingPeriods[0]!}
        saveTenant={vi.fn()}
        saveVacancy={vi.fn()}
      />,
    )
    expect(screen.getByText(/Heizverbrauch: nicht erfasst/)).toBeVisible()
  })

  it('kennzeichnet alte HKV-Werte bei aktivem kWh-Messmodus als nicht verwendet', () => {
    const source = fixture()
    const data: AppDataFile = {
      ...source,
      masterData: {
        ...source.masterData,
        heatingSystems: [{ id: 'hs1', propertyId: 'p' }],
      },
      billingData: {
        ...source.billingData,
        heatingCircuits: [
          {
            id: 'c1',
            billingPeriodId: 'y',
            heatingSystemId: 'hs1',
            buildingId: 'b1',
            consumptionMode: 'metered_kwh',
            meterAssignments: [{ meterId: 'm1', unitId: 'u1' }],
            hasCentralHotWater: false,
          },
        ],
      },
    }
    render(
      <OccupancyEditor
        data={data}
        occupancy={data.billingData.occupancyPeriods[0]!}
        period={data.billingData.billingPeriods[0]!}
        saveTenant={vi.fn()}
        saveVacancy={vi.fn()}
      />,
    )
    expect(
      screen.getByText(
        /Wohnungswärme in kWh wird am Heizkreis gemessen; 420,5 Einheiten \(HKV\) — im kWh-Messmodus nicht verwendet/,
      ),
    ).toBeVisible()
  })
})
