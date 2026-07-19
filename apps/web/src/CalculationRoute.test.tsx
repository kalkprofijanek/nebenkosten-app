import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CalculationRoute } from './CalculationRoute'

afterEach(cleanup)

function fileWithResult(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    billingData: {
      ...empty.billingData,
      calculationRuns: [
        {
          id: 'run-1',
          billingPeriodId: 'period-1',
          startedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      calculationResults: [
        {
          id: 'result-1',
          calculationRunId: 'run-1',
          totals: {
            recordedCostsCents: 12_345,
            tenantTotalCents: 10_000,
            landlordTotalCents: 2_345,
            unallocatedCents: 0,
            prepaymentsCents: 5_000,
            controlDifferenceCents: 0,
          },
          warnings: [],
          snapshotFormatVersion: 2,
          resultSnapshot: {},
        },
      ],
    },
  }
}

describe('CalculationRoute', () => {
  it('fordert ohne Abrechnungsjahr zur Auswahl auf', () => {
    render(
      <CalculationRoute
        data={createEmptyAppDataFile()}
        path="/berechnung"
        billingPeriodId={null}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText(/Wähle zuerst ein Objekt/)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Abrechnung berechnen' }),
    ).not.toBeInTheDocument()
  })

  it('meldet eine abgelehnte Speicherung zugänglich', () => {
    render(
      <CalculationRoute
        data={fileWithResult()}
        path="/berechnung"
        billingPeriodId="period-1"
        onApply={() => false}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnung berechnen' }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'konnte nicht gespeichert',
    )
  })

  it('zeigt Berechnungsfehler und vorhandene Summen an', () => {
    const data = fileWithResult()
    render(
      <CalculationRoute
        data={data}
        path="/berechnung"
        billingPeriodId="period-1"
        onApply={(transform) => {
          transform(createEmptyAppDataFile())
          return true
        }}
      />,
    )

    expect(screen.getByText((text) => text.includes('123,45'))).toBeVisible()
    expect(screen.getByText((text) => text.includes('100,00'))).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnung berechnen' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Abrechnungsperiode "period-1" nicht gefunden',
    )
  })

  it('hält die Freigabe mit und ohne Ergebnis bis PR 10 gesperrt', () => {
    const { rerender } = render(
      <CalculationRoute
        data={createEmptyAppDataFile()}
        path="/freigabe"
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText(/Führe zuerst eine Berechnung/)).toBeVisible()

    rerender(
      <CalculationRoute
        data={fileWithResult()}
        path="/freigabe"
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )
    expect(
      screen.getByText((text) =>
        text.startsWith('Letzte Kontrolldifferenz: 0,00'),
      ),
    ).toBeVisible()
    expect(screen.getByLabelText('Freigabe gesperrt')).toBeVisible()
  })
})
