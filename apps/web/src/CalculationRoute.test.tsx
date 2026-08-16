import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CalculationRoute } from './CalculationRoute'

afterEach(cleanup)

function fileWithResult(
  status:
    | 'DRAFT'
    | 'IN_REVIEW'
    | 'READY_FOR_PDF'
    | 'FINALIZED'
    | 'SUPERSEDED' = 'DRAFT',
): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'period-1',
          propertyId: 'property-1',
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status,
        },
      ],
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
          snapshotFormatVersion: 3,
          resultSnapshot: {},
        },
      ],
    },
  }
}

function fileWithControlDifference(): AppDataFile {
  const data = fileWithResult()
  const result = data.billingData.calculationResults[0]!
  return {
    ...data,
    billingData: {
      ...data.billingData,
      calculationResults: [
        {
          ...result,
          totals: {
            ...result.totals,
            controlDifferenceCents: 133_101,
          },
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
        billingPeriodId="period-1"
        onApply={(transform) => {
          transform(createEmptyAppDataFile())
          return true
        }}
      />,
    )

    expect(screen.getByText((text) => text.includes('123,45'))).toBeVisible()
    expect(screen.getByText((text) => text.includes('100,00'))).toBeVisible()
    expect(screen.getByText(/Berechnet am/)).toHaveTextContent('01.01.2026')
    expect(screen.getByText('Rechenstand aktuell')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnung berechnen' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Abrechnungsperiode "period-1" nicht gefunden',
    )
  })

  it('zeigt Rechenwarnungen mit dem passenden Korrekturziel', () => {
    const data = fileWithResult()
    const result = data.billingData.calculationResults[0]!
    const dataWithWarning: AppDataFile = {
      ...data,
      billingData: {
        ...data.billingData,
        calculationResults: [
          {
            ...result,
            warnings: [
              {
                severity: 'warning',
                code: 'costs.unallocated',
                area: 'costs',
                title: 'Kosten sind noch nicht vollständig zugeordnet',
              },
            ],
          },
        ],
      },
    }

    render(
      <CalculationRoute
        data={dataWithWarning}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Kosten sind noch nicht vollständig zugeordnet'),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Kosten bearbeiten' }),
    ).toHaveAttribute('href', '#/kosten')
  })

  it('kennzeichnet eine unzulässige Kontrolldifferenz statt Entwarnung zu geben', () => {
    render(
      <CalculationRoute
        data={fileWithControlDifference()}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Kontrolldifferenz ist größer als 1 Cent',
    )
    expect(screen.getByText('Rechenstand fehlerhaft')).toBeVisible()
    expect(screen.getByText('Noch nicht verteilt')).toBeVisible()
    expect(screen.getAllByText(/1\.331,01\s€/u)).toHaveLength(2)
    expect(
      screen.queryByText(/Kontrolldifferenz liegt im zulässigen Bereich/i),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kosten prüfen' })).toHaveAttribute(
      'href',
      '#/kosten',
    )
    expect(
      screen.getByRole('link', { name: 'Heizung prüfen' }),
    ).toHaveAttribute('href', '#/heizkreise')
  })

  it.each(['READY_FOR_PDF', 'FINALIZED', 'SUPERSEDED'] as const)(
    'sperrt neue Berechnungsläufe im Status %s',
    (status) => {
      render(
        <CalculationRoute
          data={fileWithResult(status)}
          billingPeriodId="period-1"
          onApply={vi.fn()}
        />,
      )
      expect(screen.getByText(/für neue Berechnungen gesperrt/i)).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Abrechnung berechnen' }),
      ).not.toBeInTheDocument()
    },
  )
})
