import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { AppDataFile } from '@nebenkosten/schema'
import {
  createHotWaterFixture,
  createMeteredFixture,
  meteringId as id,
} from '../../metering/metered-fixture'
import { MeterHotWaterPanel } from './MeterHotWaterPanel'

afterEach(cleanup)

function Harness({ initial }: { readonly initial: AppDataFile }) {
  const [data, setData] = useState(initial)
  return (
    <>
      <MeterHotWaterPanel
        data={data}
        billingPeriodId={id(10)}
        apply={(transform) => {
          try {
            const next = transform(data)
            setData(next)
            return true
          } catch {
            return false
          }
        }}
      />
      <output data-testid="stored">
        {JSON.stringify(
          data.billingData.heatingCircuits.map(
            (circuit) => circuit.hotWaterMeterAssignments ?? null,
          ),
        )}
      </output>
    </>
  )
}

describe('MeterHotWaterPanel', () => {
  it('ordnet Warmwasserzähler Wohnungen zu und entfernt Zuordnungen', () => {
    render(<Harness initial={createHotWaterFixture()} />)
    expect(
      screen.getByRole('heading', { name: 'Warmwasserzähler je Wohnung' }),
    ).toBeVisible()
    expect(
      screen.queryByLabelText('Wohnung für Warmwasserzähler TEST-WMZ-1'),
    ).toBeNull()
    fireEvent.change(
      screen.getByLabelText('Wohnung für Warmwasserzähler TEST-WW-1'),
      { target: { value: id(5) } },
    )
    fireEvent.change(
      screen.getByLabelText('Wohnung für Warmwasserzähler TEST-WW-2'),
      { target: { value: id(40) } },
    )
    expect(screen.getByText(/zuerst speichern/)).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Warmwasserzuordnung speichern' }),
    )
    expect(JSON.parse(screen.getByTestId('stored').textContent!)).toEqual([
      [
        { meterId: id(41), unitId: id(5) },
        { meterId: id(42), unitId: id(40) },
      ],
    ])
    expect(screen.queryByText(/zuerst speichern/)).toBeNull()
    expect(
      screen.getByLabelText('Wohnung für Warmwasserzähler TEST-WW-2'),
    ).toHaveValue(id(40))
    fireEvent.change(
      screen.getByLabelText('Wohnung für Warmwasserzähler TEST-WW-2'),
      { target: { value: '' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Warmwasserzuordnung speichern' }),
    )
    expect(JSON.parse(screen.getByTestId('stored').textContent!)).toEqual([
      [{ meterId: id(41), unitId: id(5) }],
    ])
  })

  it('weist ohne zentrale Warmwasserbereitung nur darauf hin', () => {
    render(<Harness initial={createHotWaterFixture(false)} />)
    expect(screen.getByText(/keine zentrale Warmwasserbereitung/)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Warmwasserzuordnung speichern' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Warmwasserzuordnung entfernen' }),
    ).toBeNull()
  })

  it('bietet verwaiste Zuordnungen ohne zentrales Warmwasser zum Entfernen an', () => {
    const source = createHotWaterFixture(false)
    const stale = {
      ...source,
      billingData: {
        ...source.billingData,
        heatingCircuits: source.billingData.heatingCircuits.map((circuit) => ({
          ...circuit,
          hotWaterMeterAssignments: [{ meterId: id(41), unitId: id(5) }],
        })),
      },
    }
    render(<Harness initial={stale} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Warmwasserzuordnung entfernen' }),
    )
    expect(JSON.parse(screen.getByTestId('stored').textContent!)).toEqual([[]])
  })

  it('erklärt fehlende Zähler und fehlende Heizkreise', () => {
    const withoutMeters = {
      ...createMeteredFixture(),
    }
    withoutMeters.billingData = {
      ...withoutMeters.billingData,
      heatingCircuits: withoutMeters.billingData.heatingCircuits.map(
        (circuit) => ({
          ...circuit,
          hasCentralHotWater: true,
          hotWaterSharePercent: 30,
        }),
      ),
    }
    render(<Harness initial={withoutMeters} />)
    expect(
      screen.getByText(/Wohnungs-Warmwasserzähler \(m³\)/, { selector: 'p' }),
    ).toBeVisible()
    cleanup()
    render(
      <MeterHotWaterPanel
        data={{
          ...withoutMeters,
          billingData: { ...withoutMeters.billingData, heatingCircuits: [] },
        }}
        billingPeriodId={id(10)}
        apply={vi.fn(() => true)}
      />,
    )
    expect(
      screen.getByText(/Lege zuerst einen Heizkreis an, um Warmwasserzähler/),
    ).toBeVisible()
  })

  it('wechselt den Heizkreis und behält abgelehnte Änderungen', () => {
    const source = createHotWaterFixture()
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
          ...source.billingData.heatingCircuits,
          {
            ...source.billingData.heatingCircuits[0]!,
            id: id(21),
            buildingId: id(20),
            hasCentralHotWater: false,
            hotWaterSharePercent: undefined,
          },
        ],
      },
    }
    const apply = vi.fn(() => false)
    render(
      <MeterHotWaterPanel data={data} billingPeriodId={id(10)} apply={apply} />,
    )
    fireEvent.change(
      screen.getByLabelText('Wohnung für Warmwasserzähler TEST-WW-1'),
      { target: { value: id(5) } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Warmwasserzuordnung speichern' }),
    )
    expect(apply).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/zuerst speichern/)).toBeVisible()
    fireEvent.change(screen.getByLabelText('Heizkreis für Warmwasser'), {
      target: { value: id(21) },
    })
    expect(screen.getByText(/keine zentrale Warmwasserbereitung/)).toBeVisible()
    expect(screen.queryByText(/zuerst speichern/)).toBeNull()
  })
})
