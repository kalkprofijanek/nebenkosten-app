import type { AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appRoutes, findRoute } from '../../app/navigation'
import { MonthlyInformationRoute } from './MonthlyInformationRoute'
import { ID, PERIOD_2026, PROPERTY, monthlyFixture } from './test-fixture'

afterEach(cleanup)

const HEADER = 'Zählernummer;Ablesedatum;Zählerstand;Einheit'

function renderRoute(
  initial: AppDataFile = monthlyFixture(),
  options: { apply?: boolean; propertyId?: string | null } = {},
) {
  let current = initial
  let next = 0
  const onApply = vi.fn((transform: (file: AppDataFile) => AppDataFile) => {
    if (options.apply === false) return false
    current = transform(current)
    return true
  })
  const props = {
    propertyId:
      options.propertyId === undefined ? PROPERTY : options.propertyId,
    onApply,
    today: () => new Date(2026, 3, 15),
    createId: () => ID(7000 + (next += 1)),
  }
  const view = render(<MonthlyInformationRoute data={current} {...props} />)
  return {
    onApply,
    getData: () => current,
    rerender: () =>
      view.rerender(<MonthlyInformationRoute data={current} {...props} />),
  }
}

function upload(text: string, size = text.length || 1) {
  fireEvent.change(screen.getByLabelText('CSV-Datei mit Zählerständen'), {
    target: {
      files: [
        {
          size,
          arrayBuffer: async () => new TextEncoder().encode(text).buffer,
        },
      ],
    },
  })
}

describe('Navigation', () => {
  it('enthält die Seite Monatsinformation', () => {
    expect(appRoutes.map(({ path }) => path)).toContain('/monatsinformation')
    expect(findRoute('/monatsinformation').label).toBe('Monatsinformation')
  })
})

describe('Monatsinformation', () => {
  it('fordert ohne Objekt eine Auswahl an', () => {
    renderRoute(monthlyFixture(), { propertyId: null })
    expect(screen.getByText('Bitte zuerst ein Objekt auswählen.')).toBeVisible()
  })

  it('erklärt Pflicht und monatlichen Ablauf', () => {
    renderRoute()
    expect(screen.getByText(/§ 6a HeizKV/)).toBeVisible()
    expect(
      screen.getByRole('list', { name: 'Ablauf je Monat' }),
    ).toHaveTextContent('PDF')
  })

  it('zeigt die Monatsübersicht mit erhobenen und nicht erhobenen Werten', () => {
    renderRoute()
    const month = screen.getByLabelText('Monat')
    expect(month).toHaveValue('2026-03')
    const table = screen.getByRole('table', {
      name: 'Verbrauch je Mieter im Monat',
    })
    const [rowA, rowB] = within(table)
      .getAllByRole('row')
      .filter((row) => within(row).queryByRole('rowheader'))
    expect(rowA).toHaveTextContent('EG links')
    expect(rowA).toHaveTextContent('Erika Beispiel')
    expect(rowA).toHaveTextContent('01.03.2026 – 31.03.2026')
    // Heizung 10.850,4 − 10.000 = 850 kWh, Vormonat 1.000 kWh.
    expect(within(rowA!).getByTestId('heating-current')).toHaveTextContent(
      '850',
    )
    expect(
      within(rowA!).getByTestId('heating-previousMonth'),
    ).toHaveTextContent('1.000')
    expect(
      within(rowA!).getByTestId('heating-previousYearMonth'),
    ).toHaveTextContent('nicht erhoben')
    expect(
      within(rowA!).getByTestId('heating-previousYearMonth'),
    ).toHaveTextContent('Zählerstand zum Monatsende fehlt')
    expect(within(rowA!).getByTestId('average-user')).toHaveTextContent(
      /^\d{1,3}(\.\d{3})*$/,
    )
    // Warmwasser zentral: 3,456 m³ → 3,46 m³; 2,5 × 3,456 × (60 − 10) = 432 kWh.
    expect(within(rowA!).getByTestId('hot-water-m3')).toHaveTextContent('3,46')
    expect(within(rowA!).getByTestId('hot-water-kwh')).toHaveTextContent('432')
    expect(
      within(rowA!).getByTestId('hot-water-previousMonth'),
    ).toHaveTextContent('nicht erhoben')

    expect(rowB).toHaveTextContent('OG rechts')
    expect(rowB).toHaveTextContent('Max Muster')
    expect(within(rowB!).getByTestId('heating-current')).toHaveTextContent(
      'nicht erhoben',
    )
    expect(
      within(rowB!).getByTestId('heating-previousYearMonth'),
    ).toHaveTextContent('in diesem Monat nicht bewohnt')
    expect(within(rowB!).getByTestId('average-user')).toHaveTextContent(
      'keine Vergleichswerte',
    )
    // Warmwasser dezentral: keine Angabe.
    expect(within(rowB!).getByTestId('hot-water-m3')).toHaveTextContent('–')
    expect(within(rowB!).getByTestId('hot-water-kwh')).toHaveTextContent('–')

    const assumptions = screen.getByRole('list', { name: 'Annahmen' })
    expect(assumptions).toHaveTextContent('60 °C')
    expect(assumptions).toHaveTextContent('Heizspiegel-Klasse „mittel“')
    expect(screen.getByText('Keine Hinweise.')).toBeVisible()
  })

  it('nennt Wohnung und Zähler in den Hinweisen', () => {
    const data = monthlyFixture()
    for (const circuit of data.billingData.heatingCircuits)
      if (
        circuit.billingPeriodId === PERIOD_2026 &&
        !circuit.hasCentralHotWater
      )
        circuit.meterAssignments = []
    renderRoute(data)
    const issues = screen.getByRole('list', { name: 'Hinweise' })
    expect(issues).toHaveTextContent('Zähler HZ-2: Wohnungszähler ist')
    expect(issues).toHaveTextContent('OG rechts: Für die Einheit ist kein')
  })

  it('wechselt den Monat und meldet fehlende Abrechnungszeiträume', () => {
    renderRoute()
    fireEvent.change(screen.getByLabelText('Monat'), {
      target: { value: '2024-03' },
    })
    expect(
      screen.queryByRole('table', { name: 'Verbrauch je Mieter im Monat' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Hinweise' })).toHaveTextContent(
      'kein Abrechnungszeitraum',
    )
    fireEvent.change(screen.getByLabelText('Monat'), {
      target: { value: '' },
    })
    expect(
      screen.getByText('Bitte einen Monat im Format JJJJ-MM wählen.'),
    ).toBeVisible()
  })

  it('zeigt die Import-Vorschau ohne Probleme und übernimmt erst auf Klick', async () => {
    const view = renderRoute()
    const before = view.getData().billingData.meterReadings.length
    upload(
      [
        HEADER,
        'HZ-1;30.04.2026;11.500;kWh',
        'WW-1;30.04.2026;105,5;m3',
        'HZ-1;31.03.2026;10850,4;kWh',
      ].join('\n'),
    )
    const summary = await screen.findByRole('region', {
      name: 'Vorschau des Imports',
    })
    expect(screen.getByLabelText('Zählernummer')).toHaveValue('Zählernummer')
    expect(screen.getByLabelText('Ablesedatum')).toHaveValue('Ablesedatum')
    expect(screen.getByLabelText('Zählerstand')).toHaveValue('Zählerstand')
    expect(screen.getByLabelText('Einheit')).toHaveValue('Einheit')
    expect(summary).toHaveTextContent('2 neue Zählerstände')
    expect(summary).toHaveTextContent('1 Dublette übersprungen')
    expect(summary).toHaveTextContent('keine Probleme')
    expect(
      within(summary).getByRole('table', { name: 'Neue Zählerstände' }),
    ).toHaveTextContent('11.500')
    expect(view.onApply).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: 'Zählerstände übernehmen' }),
    )
    expect(view.onApply).toHaveBeenCalledOnce()
    expect(view.getData().billingData.meterReadings).toHaveLength(before + 2)
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 Zählerstände übernommen.',
    )
    expect(
      screen.queryByRole('region', { name: 'Vorschau des Imports' }),
    ).not.toBeInTheDocument()
  })

  it('zeigt Probleme mit Zeilennummer und sperrt die Übernahme', async () => {
    const view = renderRoute()
    upload(
      [
        HEADER,
        'HZ-1;30.04.2026;11500;kWh',
        'XX-9;30.04.2026;1;kWh',
        'WW-1;30.04.2026;5;kWh',
      ].join('\n'),
    )
    const problems = await screen.findByRole('list', {
      name: 'Probleme im Import',
    })
    expect(problems).toHaveTextContent('Datenzeile 2: Zähler XX-9')
    expect(problems).toHaveTextContent('Datenzeile 3:')
    const button = screen.getByRole('button', {
      name: 'Zählerstände übernehmen',
    })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(
      /2 Probleme.*Übernahme ist erst möglich/,
    )
    expect(view.onApply).not.toHaveBeenCalled()
  })

  it('sperrt die Übernahme, wenn nur Dubletten enthalten sind', async () => {
    renderRoute()
    upload([HEADER, 'HZ-1;31.03.2026;10850,4;kWh'].join('\n'))
    const button = await screen.findByRole('button', {
      name: 'Zählerstände übernehmen',
    })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/keine neuen Zählerstände/i)
  })

  it('lässt Spalten von Hand zuordnen', async () => {
    renderRoute()
    upload(['Nr;Tag;Wert;ME', 'HZ-1;30.04.2026;11500;kWh'].join('\n'))
    await screen.findByLabelText('Zählernummer')
    expect(
      screen.getByText(/Bitte jeder Angabe eine eigene Spalte zuordnen/),
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Zählernummer'), {
      target: { value: 'Nr' },
    })
    fireEvent.change(screen.getByLabelText('Ablesedatum'), {
      target: { value: 'Tag' },
    })
    fireEvent.change(screen.getByLabelText('Einheit'), {
      target: { value: 'ME' },
    })
    expect(
      await screen.findByRole('region', { name: 'Vorschau des Imports' }),
    ).toHaveTextContent('1 neuer Zählerstand')
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau verwerfen' }))
    expect(screen.queryByLabelText('Zählernummer')).not.toBeInTheDocument()
  })

  it('meldet Lesefehler der Datei mit Zeilennummer', async () => {
    renderRoute()
    upload([HEADER, 'HZ-1;30.04.2026;11500;kWh', 'HZ-1;x;1;kWh'].join('\n'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Datenzeile 2: Ablesedatum ist ungültig (TT.MM.JJJJ erwartet).',
      ),
    )
    expect(
      screen.queryByRole('button', { name: 'Zählerstände übernehmen' }),
    ).not.toBeInTheDocument()
  })

  it('meldet leere, zu große und nicht lesbare Dateien', async () => {
    renderRoute()
    upload('', 0)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('5 MB'),
    )
    fireEvent.change(screen.getByLabelText('CSV-Datei mit Zählerständen'), {
      target: {
        files: [
          {
            size: 3,
            arrayBuffer: async () => new Uint8Array([0xff, 0xfe, 0xfd]).buffer,
          },
        ],
      },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('UTF-8'),
    )
    upload('Nur eine Spalte\n', 17)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('mindestens vier'),
    )
  })

  it('meldet, wenn die Übernahme nicht gespeichert wurde', async () => {
    const view = renderRoute(monthlyFixture(), { apply: false })
    upload([HEADER, 'HZ-1;30.04.2026;11500;kWh'].join('\n'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Zählerstände übernehmen' }),
    )
    expect(view.onApply).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('nicht gespeichert')
  })

  it('meldet Fehler des Befehls bei der Übernahme', async () => {
    const data = monthlyFixture()
    let current = data
    render(
      <MonthlyInformationRoute
        data={data}
        propertyId={PROPERTY}
        today={() => new Date(2026, 3, 15)}
        onApply={(transform) => {
          // Zwischenzeitlich wurde derselbe Stand mit anderem Wert erfasst.
          current = {
            ...current,
            billingData: {
              ...current.billingData,
              meterReadings: [
                ...current.billingData.meterReadings,
                {
                  id: ID(9999),
                  meterId: ID(30),
                  date: '2026-04-30',
                  value: { value: 11000, unit: 'kWh' },
                },
              ],
            },
          }
          current = transform(current)
          return true
        }}
      />,
    )
    upload([HEADER, 'HZ-1;30.04.2026;11500;kWh'].join('\n'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Zählerstände übernehmen' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Probleme')
  })
})
