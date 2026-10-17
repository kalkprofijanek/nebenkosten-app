import { describe, expect, it } from 'vitest'
import { buildTenantStatement } from '../src/tenant-statement'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

describe('Hinweis Eigentümerwechsel im Mieter-PDF (PR-30)', () => {
  it('nennt den Übergabetag, aber nicht den Voreigentümer', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)
    const without = JSON.stringify(buildTenantStatement(context).content)
    expect(without).not.toContain('den Eigentümer gewechselt')

    const withChange = JSON.stringify(
      buildTenantStatement({
        ...context,
        billingPeriod: {
          ...context.billingPeriod,
          ownershipChange: {
            transferDate: `${context.billingPeriod.year}-07-01`,
            previousOwnerLabel: 'Fiktive Verkäufer GmbH',
          },
        },
      }).content,
    )
    expect(withChange).toContain(
      `Übergabe am 01.07.${context.billingPeriod.year}`,
    )
    expect(withChange).not.toContain('Fiktive Verkäufer GmbH')
  })
})
