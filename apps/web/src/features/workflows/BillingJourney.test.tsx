import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createMeteredFixture, meteringId } from '../metering/metered-fixture'
import { BillingJourney } from './BillingJourney'

afterEach(cleanup)
function fixture(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      properties: [{ id: 'p', ownerCompanyId: 'c', internalNumber: 'FIKTIV' }],
      units: [{ id: 'u', propertyId: 'p', label: 'Fiktive Wohnung' }],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'y',
          propertyId: 'p',
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'DRAFT',
        },
      ],
    },
  }
}
function show(data = fixture(), periodId: string | null = 'y') {
  return (
    <BillingJourney
      data={data}
      billingPeriodId={periodId}
      renderStep={(path) => <p>Editor: {path}</p>}
    />
  )
}
describe('BillingJourney', () => {
  it('führt ohne Jahresauswahl zu den Stammdaten', () => {
    render(show(fixture(), null))
    expect(
      screen.getByRole('link', { name: 'Abrechnungsjahr auswählen' }),
    ).toHaveAttribute('href', '#/abrechnungsjahre')
  })
  it('führt durch acht Schritte und öffnet die passenden Eingaben', () => {
    render(show())
    expect(
      screen.getByRole('heading', { name: '1. Objekt und Zeitraum' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Geprüft – weiter' }))
    expect(screen.getByText('Editor: /nutzer')).toBeVisible()
    expect(
      screen.getByText('1 von 8 Schritten in dieser Sitzung durchgesehen'),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: /4. Zähler und Verbrauch/ }),
    )
    expect(screen.getByText('Editor: /heizkreise?tab=meters')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Verbrauch je Belegung bearbeiten' }),
    ).toHaveAttribute('href', '#/nutzer')
    fireEvent.click(
      screen.getByRole('button', { name: /5. Energie und Bestand/ }),
    )
    expect(screen.getByText('Editor: /heizkreise?tab=fuel')).toBeVisible()
  })
  it('zeigt gesperrte Messwerte im Zählerschritt mit Weg zur Ablesung', () => {
    const base = createMeteredFixture()
    const data: AppDataFile = {
      ...base,
      billingData: {
        ...base.billingData,
        heatingCircuits: base.billingData.heatingCircuits.map((circuit) => ({
          ...circuit,
          consumptionMode: 'metered_kwh' as const,
          meterAssignments: [{ meterId: meteringId(7), unitId: meteringId(5) }],
        })),
        meterReadings: base.billingData.meterReadings.filter(
          ({ id }) => id !== meteringId(15),
        ),
      },
    }
    render(show(data, meteringId(10)))
    fireEvent.click(
      screen.getByRole('button', { name: /4. Zähler und Verbrauch/ }),
    )
    expect(
      screen.getAllByText(/Wohnungswärme-Ablesung fehlt oder ist ungültig/)
        .length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('link', {
        name: 'Ablesungen des Zählers bearbeiten',
      })[0],
    ).toHaveAttribute('href', `#/heizkreise?tab=meters&meter=${meteringId(7)}`)
    fireEvent.click(
      screen.getByRole('button', { name: /5. Energie und Bestand/ }),
    )
    expect(
      screen.queryByText(/Wohnungswärme-Ablesung fehlt oder ist ungültig/),
    ).toBeNull()
  })
  it('setzt Durchsicht bei fachlichen Änderungen zurück, nicht bei Speicherung', () => {
    const data = fixture()
    const view = render(show(data))
    fireEvent.click(screen.getByRole('button', { name: 'Geprüft – weiter' }))
    view.rerender(
      show({
        ...data,
        meta: { ...data.meta, savedAt: '2026-09-26T10:00:00Z' },
      }),
    )
    expect(
      screen.getByText('1 von 8 Schritten in dieser Sitzung durchgesehen'),
    ).toBeVisible()
    view.rerender(
      show({ ...data, masterData: { ...data.masterData, units: [] } }),
    )
    expect(
      screen.getByText('0 von 8 Schritten in dieser Sitzung durchgesehen'),
    ).toBeVisible()
  })
  it('zeigt Freigabe und Dokumente als echte Abschlussfunktionen', () => {
    render(show())
    fireEvent.click(
      screen.getByRole('button', { name: /8. Prüfung und Abschluss/ }),
    )
    expect(screen.getByText('Editor: /freigabe')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'PDF und Einzelabrechnungen öffnen' }),
    ).toHaveAttribute('href', '#/pdf-export')
    expect(
      screen.getByRole('link', { name: 'JSON-Sicherung erstellen' }),
    ).toHaveAttribute('href', '#/sicherung')
    expect(
      screen.queryByRole('button', { name: 'Geprüft – weiter' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Durchsicht abschließen' }),
    )
    expect(
      screen.getByText('1 von 8 Schritten in dieser Sitzung durchgesehen'),
    ).toBeVisible()
  })
})
