import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../../../tests/characterization/build-app-data'
import scenarioFile from '../../../../../tests/characterization/scenarios.json'
import type { Scenario } from '../../../../../tests/characterization/types'
import { ImportChecklistPanel } from './ImportChecklistPanel'
import { importChecklist } from './import-checklist'

const scenarios = scenarioFile.scenarios as unknown as Scenario[]

afterEach(cleanup)

/** Fiktiver Ölkessel mit zentralem Warmwasser, ohne neue Angaben. */
function data() {
  return buildAppDataFile(
    structuredClone(
      scenarios.find(({ id }) => id === 'case-10-central-hot-water')!,
    ),
  )
}

describe('Prüfliste neue Angaben nach Import (PR-35)', () => {
  it('listet fehlende Angaben je Heizkreis und Jahr', () => {
    const appData = data()
    const keys = importChecklist(
      appData,
      appData.billingData.billingPeriods[0]!,
    ).map(({ key }) => key.split(':')[0])
    expect(keys).toEqual(['climate-factor', 'hot-water', 'benchmark', 'taxes'])
  })

  it('meldet Nutzerwechsel ohne Zwischenablesung und § 9b-Auswahl', () => {
    const appData = data()
    const [first] = appData.billingData.occupancyPeriods
    first!.to = '2024-06-30'
    appData.billingData.occupancyPeriods.push({
      ...first!,
      id: 'op-neu',
      tenancyId: null,
      kind: 'vacancy',
      from: '2024-07-01',
      to: null,
    })
    const period = appData.billingData.billingPeriods[0]!
    const item = importChecklist(appData, period).find(({ key }) =>
      key.startsWith('section9b:'),
    )
    expect(item?.href).toBe('#/verbrauch?occupancy=op-neu')
    first!.section9bAllocation = 'time'
    expect(
      importChecklist(appData, period).some(({ key }) =>
        key.startsWith('section9b:'),
      ),
    ).toBe(false)
  })

  it('zeigt das Panel nur bei fehlenden Angaben', () => {
    const appData = data()
    const period = appData.billingData.billingPeriods[0]!
    const { unmount } = render(
      <ImportChecklistPanel data={appData} period={period} />,
    )
    expect(screen.getByText(/Wärmemenge für Warmwasser fehlt/)).toBeVisible()
    expect(screen.getAllByRole('link', { name: 'Ergänzen' })).toHaveLength(4)
    unmount()

    const circuit = appData.billingData.heatingCircuits[0]!
    circuit.hasCentralHotWater = false
    circuit.consumptionBenchmark = {
      source: 'Fiktiv',
      category: 'Fiktiv',
      lowMaxKwhPerSqm: 1,
      mediumMaxKwhPerSqm: 2,
      elevatedMaxKwhPerSqm: 3,
    } as never
    for (const delivery of appData.billingData.fuelDeliveries)
      delivery.taxesAndLevies = { vatCents: 0 } as never
    period.climateFactor = {
      postalCode: '00000',
      factor: 1,
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      source: 'Fiktiv',
    }
    render(<ImportChecklistPanel data={appData} period={period} />)
    expect(screen.queryByText('Neue Angaben ergänzen')).toBeNull()
  })
})
