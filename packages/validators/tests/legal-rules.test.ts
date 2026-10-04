import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import {
  LEGAL_RULES,
  LEGAL_RULES_AS_OF,
  legalRulesForPeriod,
  validateBillingPeriod,
} from '../src/index'
import { validData } from './fixture'

function periodData(year: number): AppDataFile {
  const data = validData()
  const period = data.billingData.billingPeriods[0]!
  period.year = year
  period.periodStart = `${year}-01-01`
  period.periodEnd = `${year}-12-31`
  return data
}

function issuesWithPrefix(data: AppDataFile) {
  return validateBillingPeriod(data, 'period-1').issues.filter(({ code }) =>
    code.startsWith('rules.'),
  )
}

describe('Regelverzeichnis', () => {
  it('führt jede Regel mit Norm, Zusammenfassung und Rechtsstand', () => {
    expect(LEGAL_RULES_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
    const codes = LEGAL_RULES.map(({ code }) => code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const rule of LEGAL_RULES) {
      expect(rule.norm.length).toBeGreaterThan(0)
      expect(rule.summary.length).toBeGreaterThan(0)
    }
  })

  it('wählt Regeln nach ihrem Geltungszeitraum aus', () => {
    const codes = (from: string, to: string) =>
      legalRulesForPeriod(from, to).map(({ code }) => code)
    expect(codes('2024-01-01', '2024-12-31')).toContain('cable-tv-signal')
    expect(codes('2024-01-01', '2024-06-30')).not.toContain('cable-tv-signal')
    expect(codes('2026-01-01', '2026-12-31')).not.toContain('remote-reading')
    expect(codes('2027-01-01', '2027-12-31')).toContain('remote-reading')
  })

  it('warnt vor Kabel-TV-Kosten nach dem 30.06.2024', () => {
    const data = periodData(2025)
    data.billingData.costCategories[0]!.betrkvCategory = '§2 Nr. 15'
    const [issue] = issuesWithPrefix(data)
    expect(issue).toMatchObject({
      severity: 'warning',
      code: 'rules.cable_tv_signal',
      area: 'costs',
      entity: { type: 'CostCategory', id: 'category-1' },
    })
    expect(issue!.detail).toContain('§ 2 Nr. 15 BetrKV')
  })

  it('lässt Kabel-TV vor dem Stichtag und nicht umlagefähig verbuchte Kosten in Ruhe', () => {
    const before = periodData(2023)
    before.billingData.costCategories[0]!.betrkvCategory = '§2 Nr. 15'
    expect(issuesWithPrefix(before)).toEqual([])

    const internal = periodData(2025)
    internal.billingData.costCategories[0]!.betrkvCategory = 'NICHT_UML'
    expect(issuesWithPrefix(internal)).toEqual([])
  })

  it('erinnert ab 2027 bei Heizkreisen an die Fernablesbarkeit', () => {
    const data = periodData(2027)
    data.billingData.heatingCircuits.push({
      id: 'circuit-1',
      billingPeriodId: 'period-1',
      heatingSystemId: 'system-1',
      buildingId: 'building-1',
      hasCentralHotWater: false,
    })
    const issue = issuesWithPrefix(data).find(
      ({ code }) => code === 'rules.remote_reading',
    )
    expect(issue).toMatchObject({ severity: 'info', area: 'heating' })
    expect(issue!.detail).toContain('31.12.2026')

    expect(
      issuesWithPrefix(periodData(2027)).map(({ code }) => code),
    ).not.toContain('rules.remote_reading')
  })
})

describe('Prüfhinweis-Codes', () => {
  it('entsprechen dem Schema-Muster', async () => {
    const { validationIssueSchema } = await import('@nebenkosten/schema')
    const data = periodData(2027)
    data.billingData.costCategories[0]!.betrkvCategory = '§2 Nr. 15'
    data.billingData.heatingCircuits.push({
      id: 'circuit-1',
      billingPeriodId: 'period-1',
      heatingSystemId: 'system-1',
      buildingId: 'building-1',
      hasCentralHotWater: false,
    })
    const issues = issuesWithPrefix(data)
    expect(issues).toHaveLength(2)
    for (const issue of issues) {
      const persisted = Object.fromEntries(
        Object.entries(issue).filter(([field]) => field !== 'key'),
      )
      expect(validationIssueSchema.safeParse(persisted).success).toBe(true)
    }
  })
})
