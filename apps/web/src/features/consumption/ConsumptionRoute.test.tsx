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
      target.getByLabelText('HKV-Verbrauchseinheiten Wohnung 3 Fiktiv 3'),
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
    expect(
      target.getByLabelText(`HKV-Verbrauchseinheiten ${label}`),
    ).toHaveValue('419,5')
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

  it('kennzeichnet verknüpfte Wohnungswärmezählerstände mit kWh', () => {
    const source = consumptionFixture({
      o1: {
        heatMeterReading: {
          meterNumber: 'WMZ-TEST-1',
          startValue: 1000,
          endValue: 1400,
        },
      },
    })
    const data: AppDataFile = {
      ...source,
      masterData: {
        ...source.masterData,
        meters: [
          {
            id: 'meter-1',
            propertyId: 'p',
            kind: 'unit_heat',
            meterNumber: 'WMZ-TEST-1',
          },
        ],
      },
    }
    renderHarness(data)
    const target = within(row('Wohnung 1'))
    const label = 'Wohnung 1 Fiktiv 1'
    expect(target.getByLabelText(`Stand alt (kWh) ${label}`)).toHaveValue(
      '1000',
    )
    expect(target.getByLabelText(`Stand neu (kWh) ${label}`)).toHaveValue(
      '1400',
    )
    expect(target.getByText('= 400 kWh')).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'HKV-Verbrauchseinheiten' }),
    ).toBeVisible()
  })

  it('bearbeitet den Vorjahresverbrauch und unterscheidet fehlend von 0', () => {
    const initial = consumptionFixture({
      o1: {
        previousConsumption: {
          year: 2024,
          value: 1234.5,
          source: 'Fiktive Vorjahresabrechnung',
        },
      },
    })
    const result = renderHarness(initial)
    const target = within(row('Wohnung 1'))
    const label = 'Wohnung 1 Fiktiv 1'
    fireEvent.click(
      target.getByRole('button', {
        name: `Vorjahresverbrauch bearbeiten ${label}`,
      }),
    )

    expect(target.getByLabelText(`Vorjahresverbrauch ${label}`)).toHaveValue(
      '1234,5',
    )
    expect(
      target.getByLabelText(`Jahr Vorjahresverbrauch ${label}`),
    ).toHaveValue('2024')
    fireEvent.change(
      target.getByLabelText(`Jahr Vorjahresverbrauch ${label}`),
      {
        target: { value: '2023' },
      },
    )
    fireEvent.click(
      target.getByRole('button', {
        name: `Vorjahresverbrauch speichern ${label}`,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Der Vorjahresverbrauch muss zum Vorjahr 2024 gehören.',
    )
    fireEvent.change(
      target.getByLabelText(`Jahr Vorjahresverbrauch ${label}`),
      {
        target: { value: '2024' },
      },
    )
    fireEvent.change(
      target.getByLabelText(`Quelle Vorjahresverbrauch ${label}`),
      { target: { value: 'Fiktive Bestätigung' } },
    )
    fireEvent.change(target.getByLabelText(`Vorjahresverbrauch ${label}`), {
      target: { value: '0' },
    })
    fireEvent.click(
      target.getByRole('button', {
        name: `Vorjahresverbrauch speichern ${label}`,
      }),
    )
    expect(result.occupancy('o1').previousConsumption).toEqual({
      year: 2024,
      value: 0,
      source: 'Fiktive Bestätigung',
    })

    const editedTarget = within(row('Wohnung 1'))
    fireEvent.click(
      editedTarget.getByRole('button', {
        name: `Vorjahresverbrauch bearbeiten ${label}`,
      }),
    )
    const openedTarget = within(row('Wohnung 1'))
    fireEvent.change(
      openedTarget.getByLabelText(`Vorjahresverbrauch ${label}`),
      {
        target: { value: '' },
      },
    )
    fireEvent.click(
      openedTarget.getByRole('button', {
        name: `Vorjahresverbrauch speichern ${label}`,
      }),
    )
    expect(result.occupancy('o1').previousConsumption).toBeUndefined()
  })

  it('sperrt Vorjahresverbrauch in freigegebenen Jahren', () => {
    const fixture = consumptionFixture({}, 'READY_FOR_PDF')
    renderHarness(fixture)
    const target = within(row('Wohnung 1'))
    const label = 'Wohnung 1 Fiktiv 1'
    expect(
      target.queryByLabelText(`Vorjahresverbrauch ${label}`),
    ).not.toBeInTheDocument()
    expect(
      target.queryByRole('button', {
        name: `Vorjahresverbrauch bearbeiten ${label}`,
      }),
    ).not.toBeInTheDocument()
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

const CIRCUIT = {
  id: 'hc',
  billingPeriodId: 'y',
  heatingSystemId: 'hs',
  buildingId: 'b1',
  hasCentralHotWater: false,
}

/** Wohnung 1: Mieter bis 31.03., danach Leerstand; Jahr mit Heizkreis. */
function changeData(
  vacancy: Partial<AppDataFile['billingData']['occupancyPeriods'][number]> = {},
  status: 'DRAFT' | 'READY_FOR_PDF' = 'DRAFT',
): AppDataFile {
  const data = consumptionFixture({ o1: { to: '2025-03-31' } }, status)
  data.billingData.occupancyPeriods.push({
    id: 'o4',
    billingPeriodId: 'y',
    unitId: 'u1',
    kind: 'vacancy',
    from: '2025-04-01',
    ...vacancy,
  })
  data.billingData.heatingCircuits.push(CIRCUIT)
  return data
}

describe('ConsumptionRoute – Zählertausch, Nutzerwechsel und Klimafaktor', () => {
  it('erfasst einen Zählertausch und übernimmt den Verbrauch über alle Abschnitte', () => {
    const result = renderHarness()
    const target = within(row('Wohnung 1'))
    const label = 'Wohnung 1 Fiktiv 1'
    const change = (name: string, value: string) =>
      fireEvent.change(target.getByLabelText(`${name} ${label}`), {
        target: { value },
      })
    change('Zählernummer', 'HKV-ALT')
    change('Stand alt', '100')
    change('Datum alt', '2025-01-01')
    change('Stand neu', '30')
    change('Datum neu', '2025-12-31')
    expect(target.getByText('Stand neu kleiner als Stand alt')).toBeVisible()
    fireEvent.click(
      target.getByRole('button', { name: `Zähler getauscht ${label}` }),
    )
    fireEvent.click(
      target.getByRole('button', { name: `Verbrauch speichern ${label}` }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Zählertausch 1: Bitte Tauschdatum, Endstand alt und Anfangsstand neu angeben.',
    )
    change('Tauschdatum 1', '2025-06-30')
    change('Endstand alt 1', '140')
    change('Neue Zählernummer 1', 'HKV-NEU')
    change('Anfangsstand neu 1', '0')
    // (140 − 100) + (30 − 0) = 70
    expect(target.getByText('= 70')).toBeVisible()
    expect(target.queryByText('Stand neu kleiner als Stand alt')).toBeNull()
    fireEvent.click(
      target.getByRole('button', {
        name: `Verbrauch aus Zählerständen übernehmen ${label}`,
      }),
    )
    expect(
      target.getByLabelText(`HKV-Verbrauchseinheiten ${label}`),
    ).toHaveValue('70')
    fireEvent.click(
      target.getByRole('button', { name: `Verbrauch speichern ${label}` }),
    )
    expect(result.occupancy('o1')).toMatchObject({
      consumptionUnits: { value: 70 },
      heatMeterReading: {
        meterNumber: 'HKV-ALT',
        startValue: 100,
        endValue: 30,
        replacements: [
          {
            date: '2025-06-30',
            removedEndValue: 140,
            installedMeterNumber: 'HKV-NEU',
            installedStartValue: 0,
          },
        ],
      },
    })

    const saved = within(row('Wohnung 1'))
    expect(saved.getByLabelText(`Tauschdatum 1 ${label}`)).toHaveValue(
      '2025-06-30',
    )
    fireEvent.change(saved.getByLabelText(`Tauschdatum 1 ${label}`), {
      target: { value: '2026-01-15' },
    })
    expect(
      saved.getByText(
        'Zählertausch: Ein Tauschdatum liegt außerhalb von Datum alt bis Datum neu.',
      ),
    ).toBeVisible()
    fireEvent.change(saved.getByLabelText(`Tauschdatum 1 ${label}`), {
      target: { value: '2025-06-30' },
    })
    fireEvent.click(
      saved.getByRole('button', { name: `Zähler getauscht ${label}` }),
    )
    fireEvent.change(saved.getByLabelText(`Tauschdatum 2 ${label}`), {
      target: { value: '2025-03-01' },
    })
    fireEvent.change(saved.getByLabelText(`Endstand alt 2 ${label}`), {
      target: { value: '5' },
    })
    fireEvent.change(saved.getByLabelText(`Anfangsstand neu 2 ${label}`), {
      target: { value: '0' },
    })
    expect(
      saved.getByText(
        'Zählertausch: Die Tauschtage müssen zeitlich aufsteigend erfasst sein.',
      ),
    ).toBeVisible()
    fireEvent.click(
      saved.getByRole('button', {
        name: `Zählertausch 2 entfernen ${label}`,
      }),
    )
    expect(saved.queryByLabelText(`Tauschdatum 2 ${label}`)).toBeNull()
  })

  it('zeigt einen Zählertausch in gesperrten Jahren nur lesend', () => {
    render(
      <ConsumptionRoute
        data={consumptionFixture(
          {
            o1: {
              heatMeterReading: {
                startValue: 100,
                endValue: 30,
                replacements: [
                  {
                    date: '2025-06-30',
                    removedEndValue: 140,
                    installedMeterNumber: 'HKV-NEU',
                    installedStartValue: 0,
                  },
                ],
              },
            },
          },
          'READY_FOR_PDF',
        )}
        billingPeriodId="y"
        onApply={() => true}
      />,
    )
    expect(
      within(row('Wohnung 1')).getByText(
        /Zählertausch 1 am 30\.06\.2025: Endstand alt 140, neuer Zähler HKV-NEU ab 0/,
      ),
    ).toBeVisible()
  })

  it('markiert Wechsel ohne Zwischenablesung und filtert sie als offen', () => {
    renderHarness(changeData())
    expect(
      within(row('Wohnung 1')).getByText(
        /Nutzerwechsel zum 01\.04\.2025 ohne Zwischenablesung/,
      ),
    ).toBeVisible()
    expect(within(row('Wohnung 2')).queryByText(/Nutzerwechsel/)).toBeNull()
    const filter = screen.getByLabelText(/Nur offene/)
    expect(filter.closest('label')).toHaveTextContent(
      'Nur offene und abweichende Zeilen (1 offen, 1 ohne Zwischenablesung)',
    )
    fireEvent.click(filter)
    expect(screen.getByRole('rowheader', { name: /Wohnung 1/ })).toBeVisible()
    expect(screen.getByRole('rowheader', { name: /Wohnung 3/ })).toBeVisible()
    expect(screen.queryByRole('rowheader', { name: /Wohnung 2/ })).toBeNull()
  })

  it('teilt den Verbrauch einer Wohnung nach Gradtagszahlen auf', () => {
    const result = renderHarness(changeData())
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Nach Gradtagszahlen aufteilen Wohnung 1',
      }),
    )
    fireEvent.change(screen.getByLabelText('Gesamtverbrauch Wohnung 1'), {
      target: { value: '1000' },
    })
    const preview = within(
      screen.getByRole('table', { name: 'Vorschau Gradtagszahlen Wohnung 1' }),
    )
    const tenant = within(
      preview.getByRole('rowheader', { name: 'Fiktiv 1' }).closest('tr')!,
    )
    expect(tenant.getByText('01.01.2025 – 31.03.2025')).toBeVisible()
    expect(tenant.getByText('450 ‰')).toBeVisible()
    expect(tenant.getByText('450')).toBeVisible()
    const vacancy = within(
      preview.getByRole('rowheader', { name: 'Leerstand' }).closest('tr')!,
    )
    expect(vacancy.getByText('550 ‰')).toBeVisible()
    expect(vacancy.getByText('550')).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'Aufteilung übernehmen' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte angeben, warum keine Zwischenablesung möglich war.',
    )
    expect(result.occupancy('o1').consumptionUnits?.value).toBe(400)
    fireEvent.change(
      screen.getByLabelText(
        'Warum war keine Zwischenablesung möglich? Wohnung 1',
      ),
      { target: { value: 'Wohnung zum Auszug nicht zugänglich' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Aufteilung übernehmen' }),
    )
    expect(result.occupancy('o1')).toMatchObject({
      consumptionUnits: { value: 450 },
      consumptionUnitsEstimateReason: expect.stringContaining(
        'Keine Zwischenablesung möglich: Wohnung zum Auszug nicht zugänglich. Aufteilung nach Gradtagszahlen',
      ),
    })
    expect(result.occupancy('o1')).not.toHaveProperty(
      'consumptionUnitsEstimated',
    )
    expect(result.occupancy('o4').consumptionUnits?.value).toBe(550)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Verbrauch von Wohnung 1 nach Gradtagszahlen aufgeteilt und gespeichert.',
    )
  })

  it('meldet Lücken und ungültige Gesamtverbrauchswerte bei der Aufteilung', () => {
    const { unmount } = render(
      <ConsumptionRoute
        data={changeData({ from: '2025-04-03' })}
        billingPeriodId="y"
        onApply={() => true}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Nach Gradtagszahlen aufteilen Wohnung 1',
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Lücke vom 01.04.2025 bis 02.04.2025',
    )
    expect(
      screen.getByRole('button', { name: 'Aufteilung übernehmen' }),
    ).toBeDisabled()
    unmount()

    renderHarness(changeData())
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Nach Gradtagszahlen aufteilen Wohnung 1',
      }),
    )
    fireEvent.change(screen.getByLabelText('Gesamtverbrauch Wohnung 1'), {
      target: { value: 'abc' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Aufteilung übernehmen' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Gesamtverbrauch: Bitte eine Zahl ab 0 eingeben.',
    )
  })

  it('bietet die Aufteilung in gesperrten Jahren nicht an', () => {
    render(
      <ConsumptionRoute
        data={changeData({}, 'READY_FOR_PDF')}
        billingPeriodId="y"
        onApply={() => true}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /Nach Gradtagszahlen/ }),
    ).toBeNull()
  })

  it('setzt, ändert und löscht den Klimafaktor des Vorjahres', () => {
    const result = renderHarness(
      consumptionFixture({
        o1: {
          previousConsumption: { year: 2024, value: 900, climateFactor: 0.97 },
        },
      }),
    )
    const label = 'Wohnung 1 Fiktiv 1'
    expect(
      within(row('Wohnung 1')).getByText('Klimafaktor Vorjahr 0,97'),
    ).toBeVisible()
    const edit = () => {
      fireEvent.click(
        within(row('Wohnung 1')).getByRole('button', {
          name: `Vorjahresverbrauch bearbeiten ${label}`,
        }),
      )
      return within(row('Wohnung 1'))
    }
    const save = (target: ReturnType<typeof edit>) =>
      fireEvent.click(
        target.getByRole('button', {
          name: `Vorjahresverbrauch speichern ${label}`,
        }),
      )
    let target = edit()
    const field = `Klimafaktor Vorjahr (DWD) ${label}`
    expect(target.getByLabelText(field)).toHaveValue('0,97')
    fireEvent.change(target.getByLabelText(field), { target: { value: '0' } })
    save(target)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Klimafaktor Vorjahr: Bitte eine Zahl größer 0 eingeben',
    )
    fireEvent.change(target.getByLabelText(field), {
      target: { value: '1,05' },
    })
    save(target)
    expect(result.occupancy('o1').previousConsumption).toEqual({
      year: 2024,
      value: 900,
      climateFactor: 1.05,
    })
    target = edit()
    fireEvent.change(target.getByLabelText(field), { target: { value: '' } })
    save(target)
    expect(result.occupancy('o1').previousConsumption).toEqual({
      year: 2024,
      value: 900,
    })
  })
})
