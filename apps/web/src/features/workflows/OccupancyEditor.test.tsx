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
  it('füllt eine Schätzung aus dem Heizkreis-Mittel vor, ohne zu speichern', () => {
    const data = fixture()
    const saveTenant = vi.fn()
    render(
      <OccupancyEditor
        data={data}
        occupancy={data.billingData.occupancyPeriods[1]!}
        period={data.billingData.billingPeriods[0]!}
        saveTenant={saveTenant}
        saveVacancy={vi.fn()}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Aus Heizkreis-Mittel schätzen/ }),
    )
    expect(screen.getByLabelText('Verbrauchseinheiten bearbeiten')).toHaveValue(
      '420,5',
    )
    expect(
      screen.getByRole('checkbox', { name: 'Verbrauchseinheiten geschätzt' }),
    ).toBeChecked()
    expect(
      (
        screen.getByLabelText(
          'Schätzgrund Verbrauch bearbeiten',
        ) as HTMLInputElement
      ).value,
    ).toContain('§ 9a HeizKV')
    expect(saveTenant).not.toHaveBeenCalled()
  })

  it('zeigt Zählerstände und übernimmt den Verbrauch erst beim Speichern', () => {
    const data = fixture()
    data.billingData.occupancyPeriods[1] = {
      ...data.billingData.occupancyPeriods[1]!,
      consumptionUnitsEstimated: true,
      heatMeterReading: {
        meterNumber: 'HZ-12',
        startValue: 1000.5,
        startDate: '2025-01-01',
        endValue: 1120,
        endDate: '2025-12-31',
      },
    }
    const saveTenant = vi.fn()
    render(
      <OccupancyEditor
        data={data}
        occupancy={data.billingData.occupancyPeriods[1]!}
        period={data.billingData.billingPeriods[0]!}
        saveTenant={saveTenant}
        saveVacancy={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Zählernummer bearbeiten')).toHaveValue(
      'HZ-12',
    )
    expect(screen.getByLabelText('Stand alt bearbeiten')).toHaveValue('1000,5')
    expect(screen.getByLabelText('Datum neu bearbeiten')).toHaveValue(
      '2025-12-31',
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Verbrauch aus Zählerständen übernehmen',
      }),
    )
    expect(screen.getByLabelText('Verbrauchseinheiten bearbeiten')).toHaveValue(
      '119,5',
    )
    expect(
      screen.getByRole('checkbox', { name: 'Verbrauchseinheiten geschätzt' }),
    ).not.toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Verbrauch 119,5 Einheiten vorbelegt',
    )
    expect(saveTenant).not.toHaveBeenCalled()
  })

  it('meldet fehlende, ungültige oder fallende Zählerstände', () => {
    const data = fixture()
    render(
      <OccupancyEditor
        data={data}
        occupancy={data.billingData.occupancyPeriods[1]!}
        period={data.billingData.billingPeriods[0]!}
        saveTenant={vi.fn()}
        saveVacancy={vi.fn()}
      />,
    )
    const apply = () =>
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Verbrauch aus Zählerständen übernehmen',
        }),
      )
    apply()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Bitte Stand alt und Stand neu eintragen.',
    )
    fireEvent.change(screen.getByLabelText('Stand alt bearbeiten'), {
      target: { value: 'abc' },
    })
    fireEvent.change(screen.getByLabelText('Stand neu bearbeiten'), {
      target: { value: '5' },
    })
    apply()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Bitte gültige Zählerstände eingeben.',
    )
    fireEvent.change(screen.getByLabelText('Stand alt bearbeiten'), {
      target: { value: '9' },
    })
    apply()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Stand neu ist kleiner als Stand alt.',
    )
    expect(screen.getByLabelText('Verbrauchseinheiten bearbeiten')).toHaveValue(
      '0',
    )
  })
})
