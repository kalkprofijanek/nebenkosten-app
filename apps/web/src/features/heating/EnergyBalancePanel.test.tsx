import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../../../tests/characterization/build-app-data'
import scenarioFile from '../../../../../tests/characterization/scenarios.json'
import type { Scenario } from '../../../../../tests/characterization/types'
import { EnergyBalancePanel } from './EnergyBalancePanel'

const scenarios = scenarioFile.scenarios as unknown as Scenario[]

afterEach(cleanup)

function data(generatedHeatKwh?: number) {
  const scenario = scenarios.find(
    ({ id }) => id === 'case-10-central-hot-water',
  )
  if (!scenario) throw new Error('Testszenario fehlt')
  const appData = structuredClone(buildAppDataFile(scenario))
  if (generatedHeatKwh)
    appData.billingData.heatingCircuits[0]!.generatedHeatKwh = generatedHeatKwh
  return appData
}

describe('EnergyBalancePanel', () => {
  it('zeigt Energieeinsatz, gemessene Wärme und Bewertung je Heizkreis', () => {
    const appData = data(1)
    render(
      <EnergyBalancePanel
        data={appData}
        period={appData.billingData.billingPeriods[0]!}
      />,
    )
    const table = screen.getByRole('table')
    expect(
      within(table).getByRole('columnheader', { name: 'Nutzungsgrad / JAZ' }),
    ).toBeVisible()
    // 1 kWh gemessene Wärme ist weit unter dem Band.
    expect(within(table).getByText('zu niedrig')).toBeVisible()
    expect(within(table).getByText('Kessel')).toBeVisible()
  })

  it('weist ohne Wärmemessung auf Heizkostenverteiler hin', () => {
    const appData = data()
    render(
      <EnergyBalancePanel
        data={appData}
        period={appData.billingData.billingPeriods[0]!}
      />,
    )
    expect(screen.getByText('keine Wärmemessung (HKV)')).toBeVisible()
  })
})
