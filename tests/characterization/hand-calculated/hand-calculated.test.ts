/**
 * Prüfkatalog mit Handrechnung.
 *
 * Anders als die Legacy-Goldens (`../goldens.json`) sind die erwarteten
 * Werte hier **von Hand aus der Rechtslage hergeleitet** (README.md), nicht
 * aus einem Programm abgelesen. Verglichen wird ohne Toleranz.
 *
 * Eine Abweichung ist nie ein Testproblem: Entweder rechnet die Engine
 * falsch oder die Herleitung stimmt nicht. Eine geänderte Erwartung braucht
 * eine fachliche Begründung in der README.md.
 */
import { readFileSync } from 'node:fs'
import { calculateBilling, createCalculationInput } from '@nebenkosten/core'
import { appDataFileSchema } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../build-app-data'
import type { Scenario } from '../types'

interface ExpectedTenant {
  id: string
  shareCents: number
  prepaymentCents: number
  balanceCents: number
  /** § 35a EStG: Lohnanteil des Mieters (nur angegeben, wenn geprüft). */
  section35aCents?: number
}

interface HandCalculatedCase {
  scenario: Scenario
  expected: {
    periodDays: number
    tenants: ExpectedTenant[]
    totals: Record<string, number>
    vacancyLandlordCents: number
    co2?: { totalCostCents: number; tenantCents: number; landlordCents: number }
  }
}

const file = JSON.parse(
  readFileSync(new URL('./cases.json', import.meta.url), 'utf8'),
) as { cases: HandCalculatedCase[] }

describe('Prüfkatalog mit Handrechnung: Struktur', () => {
  it('hat eindeutige Fall-IDs mit Dokumentation in der README', () => {
    const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8')
    const ids = file.cases.map(({ scenario }) => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(readme, `Handrechnung fehlt: ${id}`).toContain(`## ${id}`)
    }
  })

  it('hat in sich stimmige Erwartungen (Saldo = Anteil − Vorauszahlung)', () => {
    for (const { expected } of file.cases) {
      for (const tenant of expected.tenants) {
        expect(tenant.balanceCents).toBe(
          tenant.shareCents - tenant.prepaymentCents,
        )
      }
    }
  })
})

describe.each(file.cases.map((entry) => [entry.scenario.id, entry] as const))(
  'Handrechnung %s',
  (_id, { scenario, expected }) => {
    const appData = buildAppDataFile(scenario)

    it('ist eine gültige Eingabe', () => {
      expect(appDataFileSchema.safeParse(appData).success).toBe(true)
    })

    it('rechnet centgenau wie die Handrechnung', () => {
      const actual = calculateBilling(createCalculationInput(appData, 'bp-1'))

      expect(actual.periodDays).toBe(expected.periodDays)
      expect(
        actual.tenants.map((tenant) => ({
          id: tenant.id.replace(/^op-/u, ''),
          shareCents: tenant.shareCents,
          prepaymentCents: tenant.prepaymentCents,
          balanceCents: tenant.balanceCents,
        })),
      ).toEqual(
        expected.tenants.map((tenant) => ({
          id: tenant.id,
          shareCents: tenant.shareCents,
          prepaymentCents: tenant.prepaymentCents,
          balanceCents: tenant.balanceCents,
        })),
      )
      expect(actual.totals).toMatchObject(expected.totals)
      expect(actual.totals.controlDifferenceCents).toBe(0)
      expect(actual.vacancyLandlordCents).toBe(expected.vacancyLandlordCents)
      for (const tenant of expected.tenants) {
        if (tenant.section35aCents === undefined) continue
        const result = actual.tenants.find(
          ({ id }) => id.replace(/^op-/u, '') === tenant.id,
        )
        expect(result?.section35a?.totalCents, tenant.id).toBe(
          tenant.section35aCents,
        )
      }
      if (expected.co2) expect(actual.co2).toEqual(expected.co2)
    })
  },
)
