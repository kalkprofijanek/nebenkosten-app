import { describe, expect, it } from 'vitest'
import { buildCombinedCostStatement } from '../src/combined-cost-statement'
import { pdfText } from '../src/format'
import { buildTenantStatement } from '../src/tenant-statement'
import {
  buildFixtureAppData,
  buildFixtureCombinedContext,
  buildFixtureTenantStatementContext,
} from './fixture'

const MARKER = 'INJECTED-NODE'

/** Ein Wert, der laut Typ Text ist, zur Laufzeit aber ein pdfmake-Knoten. */
function injectedNode(): string {
  return { stack: ['Kostenart', { qr: MARKER }] } as unknown as string
}

function containsMarkerNode(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsMarkerNode)
  if (typeof value !== 'object' || value === null) return false
  if ('qr' in value && value.qr === MARKER) return true
  return Object.values(value).some(containsMarkerNode)
}

function withInjectedPositions<
  T extends { calculation: { operatingPositions?: unknown[] } },
>(context: T): T {
  const positions = context.calculation.operatingPositions
  if (!positions?.length) throw new Error('Fixture ohne Kostenpositionen.')
  context.calculation.operatingPositions = positions.map((position) => ({
    ...(position as object),
    label: injectedNode(),
    allocationKey: injectedNode(),
    betrkvCategory: injectedNode(),
  }))
  return context
}

describe('Werte aus dem Rechen-Snapshot im PDF', () => {
  it('pdfText macht aus jedem Wert reinen Text', () => {
    expect(pdfText('Grundsteuer')).toBe('Grundsteuer')
    expect(pdfText(42)).toBe('42')
    expect(pdfText(null)).toBe('')
    expect(pdfText(undefined)).toBe('')
    expect(typeof pdfText({ qr: MARKER })).toBe('string')
  })

  it('setzt in der Einzelabrechnung keine Knoten aus dem Snapshot ein', () => {
    const context = withInjectedPositions(
      buildFixtureTenantStatementContext(buildFixtureAppData()),
    )
    expect(containsMarkerNode(buildTenantStatement(context))).toBe(false)
  })

  it.each(['internal', 'tenant'] as const)(
    'setzt in der Gesamtabrechnung (%s) keine Knoten aus dem Snapshot ein',
    (audience) => {
      const context = withInjectedPositions(
        buildFixtureCombinedContext(buildFixtureAppData(), audience),
      )
      expect(containsMarkerNode(buildCombinedCostStatement(context))).toBe(
        false,
      )
    },
  )
})
