import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, render, screen } from '@testing-library/react'
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
      screen.getByText(/119,5 Einheiten \(geschätzt\) · Zähler HZ-12/),
    ).toBeVisible()
    expect(
      screen.getByRole('link', {
        name: 'Zählerstände und Verbrauch bearbeiten',
      }),
    ).toHaveAttribute('href', '#/verbrauch?occupancy=o2')
    expect(
      screen.queryByLabelText('Verbrauchseinheiten bearbeiten'),
    ).not.toBeInTheDocument()
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
})
