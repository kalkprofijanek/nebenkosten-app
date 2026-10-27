import {
  calculateBilling,
  compareYears,
  createCalculationInput,
} from '@nebenkosten/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../../../tests/characterization/build-app-data'
import scenarioFile from '../../../../../tests/characterization/scenarios.json'
import type { Scenario } from '../../../../../tests/characterization/types'
import { YearOverYearPanel } from './YearOverYearPanel'
import { yearOverYearCsv } from './year-over-year-csv'

const scenarios = scenarioFile.scenarios as unknown as Scenario[]

afterEach(cleanup)

function base(): Scenario {
  return structuredClone(
    scenarios.find(({ id }) => id === 'case-01-full-year')!,
  )
}

function year(value: Scenario) {
  const data = buildAppDataFile(value)
  const input = createCalculationInput(data, 'bp-1')
  return { data, input, output: calculateBilling(input) }
}

describe('Veränderung zum Vorjahr', () => {
  it('erzeugt eine CSV mit Ausreißern und leerer Erklärungsspalte', () => {
    const previous = year(base())
    const next = JSON.parse(
      JSON.stringify(base()).replaceAll('2024', '2025'),
    ) as Scenario
    next.costs[0]!.amountEur = 1_800
    const current = year(next)
    const csv = yearOverYearCsv(current.data, compareYears(previous, current))
    const lines = csv
      .replace(String.fromCharCode(0xfeff), '')
      .trim()
      .split('\r\n')
    expect(lines[0]).toBe(
      'Bereich;Position;2024 €;2025 €;Veränderung €;Veränderung %;Ausreißer;Hinweis;Erklärung',
    )
    expect(lines).toContain(
      'Kostenart;Muellbeseitigung;1.200,00;1.800,00;600,00;+50,0 %;ja;;',
    )
    expect(lines.some((line) => line.startsWith('Wohnung;'))).toBe(true)
  })

  it('entschärft Freitext, der in Excel als Formel ausgeführt würde', () => {
    const withLabel = (label: string) => {
      const value = base()
      value.costs[0]!.label = label
      value.costs[0]!.statementText = label
      return value
    }
    const previous = year(withLabel('=HYPERLINK("http://x";"y")'))
    const next = JSON.parse(
      JSON.stringify(withLabel('=HYPERLINK("http://x";"y")')).replaceAll(
        '2024',
        '2025',
      ),
    ) as Scenario
    next.costs[0]!.amountEur = 1_800
    const current = year(next)
    const lines = yearOverYearCsv(
      current.data,
      compareYears(previous, current),
    ).split('\r\n')
    expect(lines).toContain(
      `Kostenart;"'=HYPERLINK(""http://x"";""y"")";1.200,00;1.800,00;600,00;+50,0 %;ja;;`,
    )
  })

  it('meldet im Panel ein fehlendes Vorjahr', () => {
    const { data } = year(base())
    render(
      <YearOverYearPanel
        data={data}
        period={data.billingData.billingPeriods[0]!}
      />,
    )
    expect(screen.getByText(/Kein Vorjahr 2023/)).toBeVisible()
  })
})
