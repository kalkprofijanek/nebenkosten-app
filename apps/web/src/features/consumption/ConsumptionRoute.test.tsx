import type { AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consumptionFixture } from './consumption-fixture'
import { ConsumptionRoute } from './ConsumptionRoute'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})
afterEach(cleanup)

function Harness({
  initial,
  onData,
}: {
  readonly initial: AppDataFile
  readonly onData: (data: AppDataFile) => void
}) {
  const [data, setData] = useState(initial)
  return (
    <ConsumptionRoute
      data={data}
      billingPeriodId="y"
      onApply={(transform) => {
        const next = transform(data)
        setData(next)
        onData(next)
        return true
      }}
    />
  )
}

function renderHarness(initial = consumptionFixture()) {
  let latest = initial
  render(<Harness initial={initial} onData={(data) => (latest = data)} />)
  return {
    occupancy: (id: string) =>
      latest.billingData.occupancyPeriods.find((item) => item.id === id)!,
  }
}

const row = (name: string) =>
  screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr')!

describe('ConsumptionRoute', () => {
  it('schätzt einen fehlenden Wert erst beim Speichern', () => {
    const result = renderHarness()
    const target = within(row('Wohnung 3'))
    expect(
      target.getByText('fehlt', { selector: '.consumption-status' }),
    ).toBeVisible()
    fireEvent.click(
      target.getByRole('button', {
        name: 'Verbrauch schätzen Wohnung 3 Fiktiv 3',
      }),
    )
    expect(
      target.getByLabelText('Verbrauchseinheiten Wohnung 3 Fiktiv 3'),
    ).toHaveValue('500')
    expect(target.getByLabelText('geschätzt Wohnung 3 Fiktiv 3')).toBeChecked()
    // 50 von 150 m² geschätzt → über 25 %: Hinweis beim Klick
    expect(screen.getByRole('note')).toHaveTextContent(
      'in Haus A 33 % der Fläche geschätzt',
    )
    expect(
      (
        target.getByLabelText(
          'Schätzgrund Wohnung 3 Fiktiv 3',
        ) as HTMLTextAreaElement
      ).value,
    ).toContain('§ 9a HeizKV')
    expect(result.occupancy('o3').consumptionUnits).toBeUndefined()
    fireEvent.click(
      target.getByRole('button', {
        name: 'Verbrauch speichern Wohnung 3 Fiktiv 3',
      }),
    )
    expect(result.occupancy('o3')).toMatchObject({
      consumptionUnits: { value: 500 },
      consumptionUnitsEstimated: true,
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Verbrauch für Wohnung 3 (Fiktiv 3) gespeichert.',
    )
    expect(
      within(row('Wohnung 3')).getByText('geschätzt', {
        selector: '.consumption-status',
      }),
    ).toBeVisible()
  })

  it('übernimmt Stand neu − Stand alt und speichert Zählerstände', () => {
    const result = renderHarness()
    const target = within(row('Wohnung 1'))
    const label = 'Wohnung 1 Fiktiv 1'
    fireEvent.change(target.getByLabelText(`Zählernummer ${label}`), {
      target: { value: 'HZ-1' },
    })
    fireEvent.change(target.getByLabelText(`Stand alt ${label}`), {
      target: { value: '1000,5' },
    })
    fireEvent.change(target.getByLabelText(`Datum alt ${label}`), {
      target: { value: '2025-01-01' },
    })
    fireEvent.change(target.getByLabelText(`Stand neu ${label}`), {
      target: { value: '1420' },
    })
    fireEvent.change(target.getByLabelText(`Datum neu ${label}`), {
      target: { value: '2025-12-31' },
    })
    expect(target.getByText('= 419,5')).toBeVisible()
    fireEvent.click(
      target.getByRole('button', {
        name: `Verbrauch aus Zählerständen übernehmen ${label}`,
      }),
    )
    expect(target.getByLabelText(`Verbrauchseinheiten ${label}`)).toHaveValue(
      '419,5',
    )
    fireEvent.click(
      target.getByRole('button', { name: `Verbrauch speichern ${label}` }),
    )
    expect(result.occupancy('o1')).toMatchObject({
      consumptionUnits: { value: 419.5 },
      heatMeterReading: {
        meterNumber: 'HZ-1',
        startValue: 1000.5,
        startDate: '2025-01-01',
        endValue: 1420,
        endDate: '2025-12-31',
      },
    })
    expect(result.occupancy('o1')).not.toHaveProperty(
      'consumptionUnitsEstimated',
    )
  })

  it('pflegt Kalt- und Warmwasser und behält es bei der Sammelschätzung', () => {
    const result = renderHarness(
      consumptionFixture({ o3: { warmWater: { value: 3, unit: 'm3' } } }),
    )
    const target = within(row('Wohnung 1'))
    const label = 'Wohnung 1 Fiktiv 1'
    fireEvent.change(target.getByLabelText(`Kaltwasser ${label}`), {
      target: { value: '42,5' },
    })
    fireEvent.change(target.getByLabelText(`Warmwasser ${label}`), {
      target: { value: '18' },
    })
    fireEvent.click(
      target.getByRole('button', { name: `Verbrauch speichern ${label}` }),
    )
    expect(result.occupancy('o1')).toMatchObject({
      coldWater: { value: 42.5, unit: 'm3' },
      warmWater: { value: 18, unit: 'm3' },
      consumptionUnits: { value: 400 },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Alle fehlenden schätzen (1)' }),
    )
    expect(result.occupancy('o3')).toMatchObject({
      warmWater: { value: 3, unit: 'm3' },
      consumptionUnitsEstimated: true,
    })
  })

  it('meldet fallende Stände, ungültige Zahlen und fehlenden Schätzgrund', () => {
    renderHarness()
    const target = within(row('Wohnung 2'))
    const label = 'Wohnung 2 Fiktiv 2'
    fireEvent.change(target.getByLabelText(`Stand alt ${label}`), {
      target: { value: '9' },
    })
    fireEvent.change(target.getByLabelText(`Stand neu ${label}`), {
      target: { value: '5' },
    })
    expect(target.getByText('Stand neu kleiner als Stand alt')).toBeVisible()
    fireEvent.change(target.getByLabelText(`Stand alt ${label}`), {
      target: { value: 'abc' },
    })
    fireEvent.click(
      target.getByRole('button', { name: `Verbrauch speichern ${label}` }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Stand alt: Bitte eine gültige Zahl.',
    )
    fireEvent.click(
      target.getByRole('button', { name: `Änderung verwerfen ${label}` }),
    )
    fireEvent.click(target.getByLabelText(`geschätzt ${label}`))
    fireEvent.click(
      target.getByRole('button', { name: `Verbrauch speichern ${label}` }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Für einen geschätzten Wert bitte den Schätzgrund angeben.',
    )
  })

  it('schätzt alle fehlenden und 0-Werte auf einmal', () => {
    const result = renderHarness(
      consumptionFixture({
        o2: { consumptionUnits: { value: 0, unit: 'einheiten' } },
      }),
    )
    fireEvent.click(screen.getByLabelText(/Nur offene/))
    expect(screen.queryByRole('rowheader', { name: /Wohnung 1/ })).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Alle fehlenden schätzen (2)' }),
    )
    // Nur Wohnung 1 ist gemessen: 400 / 50 m² → 400 je Wohnung
    for (const id of ['o2', 'o3'])
      expect(result.occupancy(id)).toMatchObject({
        consumptionUnits: { value: 400 },
        consumptionUnitsEstimated: true,
      })
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 fehlende Verbrauchswerte geschätzt und gespeichert.',
    )
    expect(
      screen.getByRole('button', { name: 'Alle fehlenden schätzen (0)' }),
    ).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent(
      'Hinweis § 9a Abs. 2 HeizKV: Mit dieser Schätzung sind in Haus A 67 % der Fläche geschätzt.',
    )
    expect(
      screen.getByText(/Haus A: 67 % der Fläche geschätzt – Heizkosten werden/),
    ).toBeVisible()
  })

  it('nennt den Grund, wenn nicht geschätzt werden kann', () => {
    const data = consumptionFixture()
    data.masterData.units = data.masterData.units.map((unit) =>
      unit.id === 'u3' ? { ...unit, heatedAreaSqm: null } : unit,
    )
    renderHarness(data)
    expect(
      within(row('Wohnung 3')).getByText(
        /Schätzung nicht möglich: Für die Wohnung ist keine beheizte Fläche/,
      ),
    ).toBeVisible()
  })

  it('hebt die verlinkte Zeile hervor und zeigt gesperrte Jahre nur lesend', () => {
    window.location.hash = '#/verbrauch?occupancy=o2'
    const onApply = vi.fn(() => true)
    render(
      <ConsumptionRoute
        data={consumptionFixture(
          {
            o2: {
              consumptionUnitsEstimated: true,
              consumptionUnitsEstimateReason: 'Fiktiver Grund',
              heatMeterReading: { startValue: 1, startDate: '2025-01-01' },
            },
          },
          'READY_FOR_PDF',
        )}
        billingPeriodId="y"
        onApply={onApply}
      />,
    )
    expect(row('Wohnung 2')).toHaveClass('consumption-row--highlighted')
    expect(screen.getByText(/ist gesperrt/)).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Fiktiver Grund')).toBeVisible()
    expect(screen.getByText('01.01.2025')).toBeVisible()
  })

  it('meldet fehlendes oder unbekanntes Abrechnungsjahr', () => {
    const { rerender } = render(
      <ConsumptionRoute
        data={consumptionFixture()}
        billingPeriodId={null}
        onApply={() => true}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte zuerst ein Abrechnungsjahr auswählen.',
    )
    rerender(
      <ConsumptionRoute
        data={consumptionFixture()}
        billingPeriodId="fehlt"
        onApply={() => true}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('nicht mehr vorhanden')
  })

  it('meldet eine abgelehnte Speicherung', () => {
    render(
      <ConsumptionRoute
        data={consumptionFixture()}
        billingPeriodId="y"
        onApply={() => false}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Alle fehlenden schätzen (1)' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Änderung konnte nicht gespeichert werden.',
    )
  })
})
