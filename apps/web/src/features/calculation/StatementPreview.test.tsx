import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../../../tests/characterization/build-app-data'
import scenarioFile from '../../../../../tests/characterization/scenarios.json'
import type { Scenario } from '../../../../../tests/characterization/types'
const scenarios = scenarioFile.scenarios as unknown as Scenario[]
import { runCalculation } from './calculate-preview'
import { StatementPreview } from './StatementPreview'

afterEach(cleanup)

function fixture(id = 'case-01-full-year') {
  return runCalculation(
    buildAppDataFile(scenarios.find((item) => item.id === id)!),
    'bp-1',
  )
}

describe('StatementPreview', () => {
  it('shows saved tenant costs, prepayments and settlement without recalculating stored data', () => {
    const data = fixture()
    const before = structuredClone(data)
    render(<StatementPreview data={data} billingPeriodId="bp-1" />)
    const table = screen.getByRole('table', {
      name: 'Einzelabrechnungen im Überblick',
    })
    expect(within(table).getByText(/720,00/)).toBeVisible()
    expect(within(table).getByText(/600,00/)).toBeVisible()
    const body = table.querySelector('tbody')!
    expect(within(body).getByText(/Nachzahlung.*120,00/)).toBeVisible()
    expect(within(body).getByText('Ausgeglichen')).toBeVisible()
    expect(data).toEqual(before)
  })

  it('sums back-payments, credits and the tenant balance', () => {
    render(<StatementPreview data={fixture()} billingPeriodId="bp-1" />)
    const summary = screen.getByLabelText('Summen Nachzahlungen und Guthaben')
    expect(within(summary).getByText('Nachzahlungen (1 Mieter)')).toBeVisible()
    expect(within(summary).getByText('Saldo aller Mieter')).toBeVisible()
    const table = screen.getByRole('table', {
      name: 'Einzelabrechnungen im Überblick',
    })
    const footer = within(table)
      .getByText(/Summe Mieter/)
      .closest('tr')!
    expect(within(footer).getByText(/Nachzahlung.*120,00/)).toBeVisible()
  })

  it('shows vacancy as landlord costs rather than a tenant payment demand', () => {
    render(
      <StatementPreview
        data={fixture('case-03-vacancy')}
        billingPeriodId="bp-1"
      />,
    )
    const row = screen.getByText('Leerstand').closest('tr')!
    expect(within(row).getByText('Vermieter trägt den Anteil')).toBeVisible()
    expect(within(row).queryByText(/Nachzahlung/)).not.toBeInTheDocument()
  })

  it('keeps showing results after reload from canonical storage with sorted keys', () => {
    const data = fixture()
    const sortKeys = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(sortKeys)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [
                  key,
                  sortKeys((value as Record<string, unknown>)[key]),
                ]),
            )
          : value
    const reloaded = sortKeys(data) as typeof data
    render(<StatementPreview data={reloaded} billingPeriodId="bp-1" />)
    expect(
      screen.getByRole('table', { name: 'Einzelabrechnungen im Überblick' }),
    ).toBeVisible()
  })

  it('marks changed calculations as stale and withholds individual figures', () => {
    const data = fixture()
    const changed = {
      ...data,
      billingData: { ...data.billingData, prepayments: [] },
    }
    render(<StatementPreview data={changed} billingPeriodId="bp-1" />)
    expect(
      screen.getByText(/Eingaben wurden seit der Berechnung geändert/),
    ).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('explains incompatible snapshots instead of rendering unvalidated values', () => {
    const data = fixture()
    const changed = {
      ...data,
      billingData: {
        ...data.billingData,
        calculationResults: data.billingData.calculationResults.map(
          (result) => ({ ...result, resultSnapshot: {} }),
        ),
      },
    }
    render(<StatementPreview data={changed} billingPeriodId="bp-1" />)
    expect(
      screen.getByText(
        /Gespeicherte Einzelabrechnungen können nicht angezeigt werden/,
      ),
    ).toBeVisible()
  })

  it('prompts for a calculation when no saved run exists', () => {
    const data = fixture()
    render(
      <StatementPreview
        data={{
          ...data,
          billingData: { ...data.billingData, calculationRuns: [] },
        }}
        billingPeriodId="bp-1"
      />,
    )
    expect(screen.getByText(/Berechne zuerst die Abrechnung/)).toBeVisible()
  })
})
