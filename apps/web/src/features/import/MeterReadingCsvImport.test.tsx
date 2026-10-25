import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { METER_SERVICE_HEADERS } from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMeteredFixture,
  meteringId as id,
} from '../metering/metered-fixture'
import { MeterReadingCsvImport } from './MeterReadingCsvImport'

const header = METER_SERVICE_HEADERS.join(';')
const csv = [
  header,
  'TEST-STROM-1;31.12.2025;100;kWh',
  'TEST-STROM-1;31.12.2026;1.250,5;kWh',
].join('\n')

afterEach(cleanup)

function data(): AppDataFile {
  const source = createMeteredFixture()
  return {
    ...source,
    masterData: {
      ...source.masterData,
      meters: [
        ...source.masterData.meters,
        {
          id: id(40),
          propertyId: id(3),
          kind: 'general',
          meterNumber: 'TEST-STROM-1',
        },
      ],
    },
  }
}

function setup(
  apply?: (transform: (current: AppDataFile) => AppDataFile) => boolean,
) {
  const source = data()
  let applied: AppDataFile | undefined
  const onApply = vi.fn(
    apply ??
      ((transform: (current: AppDataFile) => AppDataFile) => {
        applied = transform(source)
        return true
      }),
  )
  render(
    <MeterReadingCsvImport
      data={source}
      billingPeriodId={id(10)}
      onApply={onApply}
    />,
  )
  return { onApply, applied: () => applied }
}

function upload(text: string, size = 100) {
  fireEvent.change(screen.getByLabelText('CSV mit Zählerständen auswählen'), {
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

function check() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Zuordnung prüfen (Probelauf)' }),
  )
}

describe('Zählerstand-Import in der Oberfläche', () => {
  it('ordnet Spalten zu, zeigt den Probelauf und schreibt erst nach Übernahme', async () => {
    const { onApply, applied } = setup()
    upload(csv)
    const mapping = await screen.findByRole('group', {
      name: 'Spaltenzuordnung',
    })
    expect(
      within(mapping).getByLabelText('Spalte für Zählernummer'),
    ).toHaveValue('Zaehlernummer')
    expect(within(mapping).getByLabelText('Spalte für Einheit')).toHaveValue(
      'Einheit',
    )
    check()
    const table = screen.getByRole('table', {
      name: 'Vorschau der Zählerstände',
    })
    expect(onApply).not.toHaveBeenCalled()
    expect(table).toHaveTextContent('TEST-STROM-1')
    expect(table).toHaveTextContent('31.12.2025 (Tagesende)')
    expect(table).toHaveTextContent('1.250,5')
    fireEvent.click(
      screen.getByRole('button', { name: 'Geprüfte Zählerstände übernehmen' }),
    )
    expect(onApply).toHaveBeenCalledOnce()
    expect(
      applied()!.billingData.meterReadings.filter(
        ({ source }) => source === 'imported',
      ),
    ).toHaveLength(2)
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 Zählerstände übernommen.',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('verlangt eine vollständige Zuordnung fremder Spalten', async () => {
    setup()
    upload('Geraet;Tag;Wert;Masseinheit\nTEST-STROM-1;30.06.2026;5;kWh')
    const mapping = await screen.findByRole('group', {
      name: 'Spaltenzuordnung',
    })
    check()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte jeder Angabe eine eigene Spalte zuordnen.',
    )
    fireEvent.change(
      within(mapping).getByLabelText('Spalte für Zählernummer'),
      { target: { value: 'Geraet' } },
    )
    fireEvent.change(within(mapping).getByLabelText('Spalte für Ablesedatum'), {
      target: { value: 'Tag' },
    })
    fireEvent.change(within(mapping).getByLabelText('Spalte für Einheit'), {
      target: { value: 'Masseinheit' },
    })
    check()
    expect(
      screen.getByRole('table', { name: 'Vorschau der Zählerstände' }),
    ).toHaveTextContent('30.06.2026')
  })

  it('listet Zeilenfehler aus Datei und Probelauf mit Zeilennummer', async () => {
    const { onApply } = setup()
    upload(`${header}\n;31.12.2025;1;kWh\nTEST-STROM-1;31.12.2025;x;kWh`)
    await screen.findByRole('group', { name: 'Spaltenzuordnung' })
    check()
    const list = screen.getByRole('list', {
      name: 'Fehler in der Zählerstandsliste',
    })
    expect(list).toHaveTextContent('Zeile 2: Zählernummer fehlt.')
    expect(list).toHaveTextContent('Zeile 3: Zählerstand ist keine Zahl.')
    expect(screen.getByRole('alert')).toHaveTextContent(
      '2 Zeile(n) müssen korrigiert werden. Es wurde nichts übernommen.',
    )
    upload(`${header}\nTEST-NEU;30.06.2026;1;kWh\nTEST-ALT;30.06.2026;1;kWh`)
    await screen.findByRole('group', { name: 'Spaltenzuordnung' })
    check()
    expect(
      screen.getByRole('list', { name: 'Fehler in der Zählerstandsliste' }),
    ).toHaveTextContent('Zeile 3: Zähler „TEST-ALT“ ist nicht angelegt')
    upload(`${header}\nTEST-NEU;30.06.2026;1;kWh`)
    await screen.findByRole('group', { name: 'Spaltenzuordnung' })
    check()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Zeile 2: Zähler „TEST-NEU“ ist nicht angelegt',
    )
    expect(
      screen.queryByRole('button', {
        name: 'Geprüfte Zählerstände übernehmen',
      }),
    ).not.toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('verlangt eine Bestätigung, wenn die Plausibilitätsprüfung Hinweise meldet', async () => {
    const { onApply } = setup()
    upload(
      `${header}\nTEST-STROM-1;31.12.2025;500;kWh\nTEST-STROM-1;31.12.2026;400;kWh`,
    )
    await screen.findByRole('group', { name: 'Spaltenzuordnung' })
    check()
    expect(
      screen.getByRole('list', { name: 'Hinweise der Plausibilitätsprüfung' }),
    ).toHaveTextContent('Zählerstand rückläufig')
    const accept = screen.getByRole('button', {
      name: 'Geprüfte Zählerstände übernehmen',
    })
    expect(accept).toBeDisabled()
    fireEvent.click(
      screen.getByLabelText('Hinweise geprüft – Werte trotzdem übernehmen'),
    )
    expect(accept).toBeEnabled()
    fireEvent.click(accept)
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('meldet unlesbare, zu große und fehlerhafte Dateien', async () => {
    setup()
    upload('nur eine Zeile')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Datenzeilen'),
    )
    upload(csv, 6 * 1024 * 1024)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('5 MB'),
    )
    fireEvent.change(screen.getByLabelText('CSV mit Zählerständen auswählen'), {
      target: {
        files: [
          {
            size: 10,
            arrayBuffer: async () => {
              throw 'unbekannt'
            },
          },
        ],
      },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'konnte nicht gelesen',
      ),
    )
    fireEvent.change(screen.getByLabelText('CSV mit Zählerständen auswählen'), {
      target: { files: [] },
    })
  })

  it('verwirft die Vorschau und behandelt abgelehnte Übernahmen', async () => {
    const { onApply } = setup(() => false)
    upload(csv)
    await screen.findByRole('group', { name: 'Spaltenzuordnung' })
    check()
    const button = screen.getByRole('button', {
      name: 'Geprüfte Zählerstände übernehmen',
    })
    fireEvent.click(button)
    expect(screen.getByRole('table')).toBeInTheDocument()
    onApply.mockImplementation(() => {
      throw new Error('Gesperrt')
    })
    fireEvent.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent('Gesperrt')
    onApply.mockImplementation(() => {
      throw 'unbekannt'
    })
    fireEvent.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'konnten nicht übernommen',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau verwerfen' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Spaltenzuordnung' }),
    ).not.toBeInTheDocument()
  })

  it('bietet die Vorlage als CSV mit BOM zum Herunterladen an', () => {
    const create = vi.fn(() => 'blob:vorlage')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    vi.useFakeTimers()
    try {
      setup()
      fireEvent.click(
        screen.getByRole('button', { name: 'Vorlage herunterladen' }),
      )
      expect(create).toHaveBeenCalledOnce()
      expect(click).toHaveBeenCalledOnce()
      vi.runAllTimers()
      expect(revoke).toHaveBeenCalledWith('blob:vorlage')
    } finally {
      vi.useRealTimers()
      click.mockRestore()
    }
  })
})
