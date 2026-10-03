import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import {
  createMeteredFixture,
  meteringId as id,
} from '../../metering/metered-fixture'
import { MeterConsumptionPanel } from './MeterConsumptionPanel'

afterEach(cleanup)
describe('meter consumption panel', () => {
  it('blocks activation when the changeover reading is missing', () => {
    const source = createMeteredFixture()
    const data = {
      ...source,
      billingData: {
        ...source.billingData,
        heatingCircuits: source.billingData.heatingCircuits.map((circuit) => ({
          ...circuit,
          meterAssignments: [{ meterId: id(7), unitId: id(5) }],
        })),
        meterReadings: source.billingData.meterReadings.filter(
          (reading) => reading.id !== id(15),
        ),
      },
    }
    render(
      <MeterConsumptionPanel
        data={data}
        billingPeriodId={id(10)}
        apply={() => false}
      />,
    )
    expect(
      screen.getByText('Automatische Ermittlung noch nicht möglich.'),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Messverbrauch aktivieren' }),
    ).toBeDisabled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: 'Ablesungen anzeigen' })[0],
    ).toHaveAttribute('href', `#/heizkreise?tab=meters&meter=${id(7)}`)
  })

  it('zeigt nur Probleme des gewählten Heizkreises mit Korrekturziel', () => {
    const source = createMeteredFixture()
    const data = {
      ...source,
      masterData: {
        ...source.masterData,
        buildings: [
          ...source.masterData.buildings,
          {
            id: id(20),
            propertyId: id(3),
            name: 'Nebenhaus',
            mandateRefPrefixes: [],
          },
        ],
      },
      billingData: {
        ...source.billingData,
        heatingCircuits: [
          {
            ...source.billingData.heatingCircuits[0]!,
            meterAssignments: [{ meterId: id(7), unitId: id(5) }],
          },
          {
            ...source.billingData.heatingCircuits[0]!,
            id: id(21),
            buildingId: id(20),
            consumptionMode: 'metered_kwh' as const,
            meterAssignments: [],
          },
        ],
        occupancyPeriods: source.billingData.occupancyPeriods.map(
          (occupancy) =>
            occupancy.id === id(13)
              ? { ...occupancy, from: '2026-08-01' }
              : occupancy,
        ),
      },
    }
    render(
      <MeterConsumptionPanel
        data={data}
        billingPeriodId={id(10)}
        apply={() => false}
      />,
    )
    const gap = screen.getByText(/decken das Jahr nicht vollständig ab/)
    expect(gap).toBeVisible()
    expect(
      screen.getAllByRole('link', { name: 'Nutzerzeitraum bearbeiten' })[0],
    ).toHaveAttribute('href', `#/nutzer?edit=${id(13)}`)
    expect(screen.queryByText(/Nebenhaus/, { selector: 'li' })).toBeNull()
    expect(
      screen
        .getAllByRole('listitem')
        .every((item) => !item.textContent?.includes('kein Wohnungszähler')),
    ).toBe(true)
  })

  it('explains missing setup before meter assignment', () => {
    const source = createMeteredFixture()
    const data = {
      ...source,
      billingData: { ...source.billingData, heatingCircuits: [] },
    }
    render(
      <MeterConsumptionPanel
        data={data}
        billingPeriodId={id(10)}
        apply={() => false}
      />,
    )
    expect(screen.getByText(/Lege zuerst einen Heizkreis/)).toBeVisible()
  })

  it('ordnet ausdrücklich zu, zeigt den Nutzerwechsel und aktiviert erst danach', () => {
    function Harness() {
      const [data, setData] = useState(createMeteredFixture)
      return (
        <MeterConsumptionPanel
          data={data}
          billingPeriodId={id(10)}
          apply={(transform) => {
            setData((current) => transform(current))
            return true
          }}
        />
      )
    }
    render(<Harness />)
    expect(
      screen.getByRole('button', { name: 'Messverbrauch aktivieren' }),
    ).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Wohnung für TEST-WMZ-1'), {
      target: { value: id(5) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zuordnung speichern' }))
    expect(screen.getByText('400 kWh')).toBeVisible()
    expect(screen.getByText('600 kWh')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Messverbrauch aktivieren' }),
    )
    expect(screen.getByText('Messverbrauch aktiv')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Manuelle Verbrauchswerte verwenden',
      }),
    )
    expect(screen.getByText('Manuelle Verbrauchswerte aktiv')).toBeVisible()
  })
})
