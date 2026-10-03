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
