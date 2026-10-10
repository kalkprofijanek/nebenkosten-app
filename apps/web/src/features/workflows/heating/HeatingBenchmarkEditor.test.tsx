import type { AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyEditableBillingPeriodChange } from '../../release/edit-guard'
import {
  createMeteredFixture,
  meteringId,
} from '../../metering/metered-fixture'
import type { WorkflowSelection } from '../../../WorkflowRoute'
import { HeatingSetupPanel } from './HeatingSetupPanel'

const selection: WorkflowSelection = {
  ownerCompanyId: meteringId(2),
  propertyId: meteringId(3),
  billingPeriodId: meteringId(10),
}

afterEach(cleanup)

function Harness({
  locked = false,
  creating = false,
  noBuildings = false,
}: {
  readonly locked?: boolean
  readonly creating?: boolean
  readonly noBuildings?: boolean
}) {
  const [data, setData] = useState<AppDataFile>(() => {
    const file = createMeteredFixture()
    if (creating) {
      file.masterData.heatingSystems = []
      file.billingData.heatingCircuits = []
      file.billingData.energySources = []
    }
    if (noBuildings) file.masterData.buildings = []
    file.billingData.energySources = [
      {
        id: meteringId(17),
        heatingCircuitId: meteringId(11),
        key: 'haupt',
        name: 'Fiktiver Heizkreis',
        sourceType: 'Fiktives Gas',
      },
    ]
    if (!creating)
      file.masterData.heatingSystems[0]!.name = 'Fiktives Heizsystem'
    if (locked) file.billingData.billingPeriods[0]!.status = 'FINALIZED'
    return file
  })
  const apply = (transform: (file: AppDataFile) => AppDataFile) => {
    if (locked) {
      try {
        const guarded = applyEditableBillingPeriodChange(
          data,
          meteringId(10),
          transform,
        )
        setData(guarded)
        return true
      } catch {
        return false
      }
    }
    setData(transform(data))
    return true
  }
  const circuit = data.billingData.heatingCircuits[0]
  return (
    <>
      <output aria-label="Benchmark gespeichert">
        {JSON.stringify(circuit?.consumptionBenchmark ?? null)}
      </output>
      <HeatingSetupPanel
        data={data}
        selection={selection}
        onSelectionChange={vi.fn()}
        onApply={apply}
        apply={apply}
      />
    </>
  )
}

describe('Heizspiegel-Vergleichswerte am Heizkreis', () => {
  it('legt Heizsystem, Heizkreis und Energiequelle über das vorhandene Formular an', () => {
    render(<Harness creating />)
    fireEvent.change(screen.getByLabelText('Heizsystem'), {
      target: { value: 'Fiktive neue Anlage' },
    })
    fireEvent.change(screen.getByLabelText('Quellenschlüssel'), {
      target: { value: 'haupt' },
    })
    fireEvent.change(screen.getByLabelText('Energiequelle'), {
      target: { value: 'Fiktive neue Quelle' },
    })
    fireEvent.change(screen.getByLabelText('Energieträger'), {
      target: { value: 'Fiktiver Energieträger' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Heizkreis anlegen' }))
    expect(
      screen.getByRole('heading', { name: 'Fiktive neue Quelle' }),
    ).toBeVisible()
    expect(
      screen.getByText(
        'Kein Vergleich mit dem Durchschnittsnutzer hinterlegt.',
      ),
    ).toBeVisible()
  })

  it('erklärt, wenn für das Objekt noch kein Gebäude eingerichtet ist', () => {
    render(<Harness noBuildings />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Für dieses Objekt ist noch kein Gebäude vorhanden.',
    )
  })

  it('lässt reguläre Heizkreisänderungen ohne optionale Vergleichswerte zu', () => {
    render(<Harness />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' }),
    )
    const form = screen
      .getByRole('button', { name: 'Heizkreis speichern' })
      .closest('form')!
    expect(
      within(form).getByLabelText('Nutzerkategorie Vergleichswerte'),
    ).toBeDisabled()
    fireEvent.change(within(form).getByLabelText('Heizsystem bearbeiten'), {
      target: { value: 'Geändertes fiktives Heizsystem' },
    })
    fireEvent.click(
      within(form).getByRole('button', { name: 'Heizkreis speichern' }),
    )
    expect(screen.getByLabelText('Benchmark gespeichert')).toHaveTextContent(
      'null',
    )
  })

  it('erfasst, ändert und entfernt Vergleichswerte ohne App-eigene Grenzwerte', () => {
    render(<Harness />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' }),
    )
    const form = screen
      .getByRole('button', { name: 'Heizkreis speichern' })
      .closest('form')!
    expect(within(form).getByLabelText('Quelle Vergleichswerte')).toHaveValue(
      'Heizspiegel für Deutschland (co2online)',
    )
    expect(
      within(form).getByLabelText('Fundstelle Vergleichswerte'),
    ).toHaveValue('')
    expect(
      within(form).getByLabelText('Bezugsjahr Vergleichswerte'),
    ).toHaveValue(null)
    expect(
      within(form).getByLabelText('Werte enthalten Warmwasser'),
    ).toBeChecked()
    fireEvent.click(
      within(form).getByLabelText(
        'Vergleichswerte für diesen Heizkreis hinterlegen',
      ),
    )

    fireEvent.change(
      within(form).getByLabelText('Fundstelle Vergleichswerte'),
      {
        target: { value: 'https://example.invalid/fiktiver-heizspiegel' },
      },
    )
    fireEvent.change(
      within(form).getByLabelText('Bezugsjahr Vergleichswerte'),
      {
        target: { value: '2025' },
      },
    )
    fireEvent.change(
      within(form).getByLabelText('Nutzerkategorie Vergleichswerte'),
      {
        target: { value: 'Fiktives Gas · Baualtersklasse A' },
      },
    )
    fireEvent.change(within(form).getByLabelText('Niedrig bis (kWh/m²·a)'), {
      target: { value: '70' },
    })
    fireEvent.change(within(form).getByLabelText('Mittel bis (kWh/m²·a)'), {
      target: { value: '130' },
    })
    fireEvent.change(within(form).getByLabelText('Erhöht bis (kWh/m²·a)'), {
      target: { value: '200' },
    })
    fireEvent.click(
      within(form).getByRole('button', { name: 'Heizkreis speichern' }),
    )

    expect(screen.getByLabelText('Benchmark gespeichert')).toHaveTextContent(
      '"lowMaxKwhPerSqmYear":70',
    )
    expect(screen.getByLabelText('Benchmark gespeichert')).toHaveTextContent(
      '"includesHotWater":true',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' }),
    )
    const editForm = screen
      .getByRole('button', { name: 'Heizkreis speichern' })
      .closest('form')!
    fireEvent.change(
      within(editForm).getByLabelText('Nutzerkategorie Vergleichswerte'),
      {
        target: { value: 'Fiktives Gas · Baualtersklasse B' },
      },
    )
    fireEvent.click(
      within(editForm).getByRole('button', { name: 'Heizkreis speichern' }),
    )
    expect(screen.getByLabelText('Benchmark gespeichert')).toHaveTextContent(
      'Fiktives Gas · Baualtersklasse B',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Vergleichswerte entfernen' }),
    )
    expect(screen.getByLabelText('Benchmark gespeichert')).toHaveTextContent(
      'null',
    )
  })

  it('zeigt Feldfehler auf Deutsch und speichert keine unaufsteigenden Grenzen', () => {
    render(<Harness />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' }),
    )
    const form = screen
      .getByRole('button', { name: 'Heizkreis speichern' })
      .closest('form')!
    fireEvent.click(
      within(form).getByLabelText(
        'Vergleichswerte für diesen Heizkreis hinterlegen',
      ),
    )
    fireEvent.change(
      within(form).getByLabelText('Nutzerkategorie Vergleichswerte'),
      {
        target: { value: 'Fiktive Kategorie' },
      },
    )
    fireEvent.change(
      within(form).getByLabelText('Bezugsjahr Vergleichswerte'),
      {
        target: { value: '2025' },
      },
    )
    fireEvent.change(within(form).getByLabelText('Niedrig bis (kWh/m²·a)'), {
      target: { value: '130' },
    })
    fireEvent.change(within(form).getByLabelText('Mittel bis (kWh/m²·a)'), {
      target: { value: '70' },
    })
    fireEvent.change(within(form).getByLabelText('Erhöht bis (kWh/m²·a)'), {
      target: { value: '200' },
    })
    fireEvent.click(
      within(form).getByRole('button', { name: 'Heizkreis speichern' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Klassengrenzen müssen aufsteigend sein/,
    )
    expect(screen.getByLabelText('Benchmark gespeichert')).toHaveTextContent(
      'null',
    )
  })

  it('meldet ungeeignete Fundstelle und fehlende Kategorie verständlich', () => {
    render(<Harness />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' }),
    )
    const form = screen
      .getByRole('button', { name: 'Heizkreis speichern' })
      .closest('form')!
    fireEvent.click(
      within(form).getByLabelText(
        'Vergleichswerte für diesen Heizkreis hinterlegen',
      ),
    )
    fireEvent.change(
      within(form).getByLabelText('Fundstelle Vergleichswerte'),
      {
        target: { value: 'kein-link' },
      },
    )
    fireEvent.click(
      within(form).getByRole('button', { name: 'Heizkreis speichern' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Fundstelle muss eine gültige HTTP- oder HTTPS-URL sein.',
    )

    fireEvent.change(
      within(form).getByLabelText('Fundstelle Vergleichswerte'),
      {
        target: { value: 'https://example.invalid/fiktiv' },
      },
    )
    fireEvent.click(
      within(form).getByRole('button', { name: 'Heizkreis speichern' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte ein ganzzahliges Bezugsjahr zwischen 1990 und 2100 eingeben.',
    )

    fireEvent.change(
      within(form).getByLabelText('Bezugsjahr Vergleichswerte'),
      { target: { value: '2025' } },
    )
    fireEvent.click(
      within(form).getByRole('button', { name: 'Heizkreis speichern' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte nutzerkategorie angeben.',
    )
  })

  it('blockiert Benchmark-Änderungen im gesperrten Abrechnungsjahr', () => {
    render(<Harness locked />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' }),
    )
    const form = screen
      .getByRole('button', { name: 'Heizkreis speichern' })
      .closest('form')!
    fireEvent.click(
      within(form).getByLabelText(
        'Vergleichswerte für diesen Heizkreis hinterlegen',
      ),
    )
    fireEvent.change(
      within(form).getByLabelText('Nutzerkategorie Vergleichswerte'),
      {
        target: { value: 'Fiktive Kategorie' },
      },
    )
    fireEvent.change(
      within(form).getByLabelText('Bezugsjahr Vergleichswerte'),
      {
        target: { value: '2025' },
      },
    )
    fireEvent.change(within(form).getByLabelText('Niedrig bis (kWh/m²·a)'), {
      target: { value: '70' },
    })
    fireEvent.change(within(form).getByLabelText('Mittel bis (kWh/m²·a)'), {
      target: { value: '130' },
    })
    fireEvent.change(within(form).getByLabelText('Erhöht bis (kWh/m²·a)'), {
      target: { value: '200' },
    })
    fireEvent.click(
      within(form).getByRole('button', { name: 'Heizkreis speichern' }),
    )
    expect(screen.getByLabelText('Benchmark gespeichert')).toHaveTextContent(
      'null',
    )
  })
})
