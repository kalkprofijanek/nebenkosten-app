import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import scenarioFile from '../../../tests/characterization/scenarios.json'
import type { Scenario } from '../../../tests/characterization/types'
import { AnnualBillingRoute } from './AnnualBillingRoute'

afterEach(cleanup)
function fixture() {
  return buildAppDataFile((scenarioFile.scenarios as unknown as Scenario[])[0]!)
}
function Harness({ initial = fixture() }: { initial?: AppDataFile }) {
  const [data, setData] = useState(initial)
  return (
    <AnnualBillingRoute
      data={data}
      selection={{
        propertyId: data.masterData.properties[0]!.id,
        ownerCompanyId: data.masterData.ownerCompanies[0]!.id,
        billingPeriodId: 'bp-1',
      }}
      onApply={(transform) => {
        setData(transform(data))
        return true
      }}
      onSelectionChange={() => undefined}
    />
  )
}
describe('AnnualBillingRoute integration', () => {
  it('keeps year creation and deletion in the dedicated year management', () => {
    render(<Harness />)
    expect(
      screen.getByRole('link', { name: 'Jahresverwaltung öffnen' }),
    ).toHaveAttribute('href', '#/abrechnungsjahre')
    expect(
      screen.queryByRole('button', { name: 'Abrechnungsjahr anlegen' }),
    ).not.toBeInTheDocument()
  })
  it('reuses working editors and creates an actual preview within the journey', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Geprüft – weiter' }))
    expect(
      screen.getByRole('heading', { name: 'Wohnungen und Belegungen (2)' }),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: /3. Heizung und Warmwasser/ }),
    )
    expect(
      screen.getByRole('button', { name: 'Heizkreis anlegen' }),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: /4. Zähler und Verbrauch/ }),
    )
    expect(screen.getByRole('button', { name: 'Zähler anlegen' })).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: /5. Energie und Bestand/ }),
    )
    expect(
      screen.getByText(/Bitte zuerst einen Heizkreis mit Energiequelle/),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: /6. Kosten und Belege/ }),
    )
    expect(
      screen.getByRole('heading', { name: '6. Kosten und Belege' }),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: /7. Berechnung und Vorschau/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnung berechnen' }),
    )
    expect(
      screen.getByRole('table', { name: 'Einzelabrechnungen im Überblick' }),
    ).toHaveTextContent('Nachzahlung 120,00')
    fireEvent.click(
      screen.getByRole('button', { name: /8. Prüfung und Abschluss/ }),
    )
    expect(
      screen.getByRole('heading', { name: 'Prüfung und Freigabe' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(
      screen.getByRole('heading', { name: '7. Berechnung und Vorschau' }),
    ).toBeVisible()
  })
  it('preserves the locked-year guard inside the journey', () => {
    const data = fixture()
    render(
      <Harness
        initial={{
          ...data,
          billingData: {
            ...data.billingData,
            billingPeriods: data.billingData.billingPeriods.map((period) => ({
              ...period,
              status: 'READY_FOR_PDF',
            })),
          },
        }}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: /7. Berechnung und Vorschau/ }),
    )
    expect(
      screen.queryByRole('button', { name: 'Abrechnung berechnen' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/für neue Berechnungen gesperrt/)).toBeVisible()
  })
})
