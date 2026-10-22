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
    // § 6a Abs. 1 Nr. 2 HeizKV gilt seit 2022, nicht erst ab der Nachrüstfrist.
    expect(codes('2021-01-01', '2021-12-31')).not.toContain(
      'monthly-consumption-information',
    )
    expect(codes('2022-01-01', '2022-12-31')).toContain(
      'monthly-consumption-information',
    )
  })

  it('sperrt Kabel-TV-Kosten in Zeiträumen nach dem 30.06.2024', () => {
    const data = periodData(2025)
    data.billingData.costCategories[0]!.betrkvCategory = '§2 Nr. 15'
    const [issue] = issuesWithPrefix(data)
    expect(issue).toMatchObject({
      severity: 'error',
      code: 'rules.cable_tv_signal',
      area: 'costs',
      entity: { type: 'CostCategory', id: 'category-1' },
    })
    expect(issue!.detail).toContain('§ 2 Nr. 15 BetrKV')
    expect(issue!.detail).toContain('vollständig nach dem 30.06.2024')
    expect(validateBillingPeriod(data, 'period-1').canBecomeReady).toBe(false)
  })

  it('akzeptiert nach dem Stichtag nur einen Umlagegrad von 0 %', () => {
    const data = periodData(2025)
    data.billingData.costCategories[0]!.betrkvCategory = '§ 2 Nr. 15 b'
    data.billingData.costEntries[0]!.allocablePercent = 0
    expect(issuesWithPrefix(data)).toEqual([])
  })

  it('verlangt bei Zeiträumen über den Stichtag eine zeitanteilige Abgrenzung', () => {
    const data = periodData(2024)
    data.billingData.costCategories[0]!.betrkvCategory = '§2 Nr. 15'
    const [issue] = issuesWithPrefix(data)
    expect(issue).toMatchObject({
      severity: 'error',
      code: 'rules.cable_tv_signal',
    })
    // 01.01.–30.06.2024 = 182 von 366 Tagen.
    expect(issue!.detail).toContain('182 von 366 Tagen')
    expect(issue!.detail).toContain('zeitanteilige Abgrenzung')

    data.billingData.costEntries[0]!.allocablePercent = 49.73
    expect(issuesWithPrefix(data)).toEqual([])
    data.billingData.costEntries[0]!.allocablePercent = 60
    expect(issuesWithPrefix(data)).toHaveLength(1)
  })

  it('nutzt ohne Belege den Umlagegrad der Kostenart', () => {
    const data = periodData(2024)
    data.billingData.costCategories[0]!.betrkvCategory = '§2 Nr. 15'
    data.billingData.costEntries = []
    data.billingData.costCategories[0]!.allocablePercent = 40
    expect(issuesWithPrefix(data)).toEqual([])
  })

  it('lässt Kabel-TV vor dem Stichtag und nicht umlagefähig verbuchte Kosten in Ruhe', () => {
    const before = periodData(2023)
    before.billingData.costCategories[0]!.betrkvCategory = '§2 Nr. 15'
    expect(issuesWithPrefix(before)).toEqual([])

    const internal = periodData(2025)
    internal.billingData.costCategories[0]!.betrkvCategory = 'NICHT_UML'
    expect(issuesWithPrefix(internal)).toEqual([])
  })

  function withCircuit(year: number, hasCentralHotWater = false) {
    const data = periodData(year)
    data.billingData.heatingCircuits.push({
      id: 'circuit-1',
      billingPeriodId: 'period-1',
      heatingSystemId: 'system-1',
      buildingId: 'building-1',
      hasCentralHotWater,
    })
    return data
  }
  const codesOf = (data: AppDataFile) =>
    issuesWithPrefix(data).map(({ code }) => code)

  it('warnt ab 2027 bei nicht fernablesbaren Geräten (ADR-0014)', () => {
    const issue = issuesWithPrefix(withCircuit(2027)).find(
      ({ code }) => code === 'rules.remote_reading_missing',
    )
    expect(issue).toMatchObject({ severity: 'warning', area: 'heating' })
    expect(issue!.detail).toContain('3 %')
    expect(issue!.detail).toContain('§ 12 Abs. 1')

    // Vor 2027 keine Warnung, ohne Heizkreis ebenfalls nicht.
    expect(codesOf(withCircuit(2026))).not.toContain(
      'rules.remote_reading_missing',
    )
    expect(codesOf(periodData(2027))).not.toContain(
      'rules.remote_reading_missing',
    )
  })

  it('akzeptiert Fernablesbarkeit ab Periodenbeginn, warnt bei späterem Einbau', () => {
    const inTime = withCircuit(2027)
    inTime.masterData.properties[0]!.remoteReading = { since: '2026-11-15' }
    expect(codesOf(inTime)).not.toContain('rules.remote_reading_missing')

    const late = withCircuit(2027)
    late.masterData.properties[0]!.remoteReading = { since: '2027-03-01' }
    const issue = issuesWithPrefix(late).find(
      ({ code }) => code === 'rules.remote_reading_missing',
    )
    expect(issue!.detail).toContain('01.03.2027')
  })

  it('zeigt eine begründete Ausnahme statt der Warnung', () => {
    const data = withCircuit(2027)
    data.masterData.properties[0]!.remoteReading = {
      exemptionReason: 'Nachrüstung technisch unmöglich (Gutachten liegt vor)',
    }
    const issues = issuesWithPrefix(data)
    expect(issues.map(({ code }) => code)).not.toContain(
      'rules.remote_reading_missing',
    )
    const exemption = issues.find(
      ({ code }) => code === 'rules.remote_reading_exemption',
    )
    expect(exemption).toMatchObject({ severity: 'info' })
    expect(exemption!.detail).toContain('Gutachten liegt vor')
  })

  it('erinnert bei fernablesbaren Geräten an die Monatsinformation, auch vor 2027', () => {
    const data = withCircuit(2025, true)
    data.masterData.properties[0]!.remoteReading = { since: '2025-06-01' }
    const issue = issuesWithPrefix(data).find(
      ({ code }) => code === 'rules.monthly_information',
    )
    expect(issue).toMatchObject({ severity: 'info', area: 'heating' })
    expect(issue!.detail).toContain('01.06.2025')
    expect(issue!.detail).toContain('für Heizung und Warmwasser erforderlich')

    const heatingOnly = withCircuit(2025)
    heatingOnly.masterData.properties[0]!.remoteReading = {
      since: '2024-01-01',
    }
    const heatingIssue = issuesWithPrefix(heatingOnly).find(
      ({ code }) => code === 'rules.monthly_information',
    )
    expect(heatingIssue!.detail).toContain('01.01.2025')
    expect(heatingIssue!.detail).toContain('für Heizung erforderlich')

    // Einbau nach Periodenende oder ohne Fernablesung: kein Hinweis.
    const later = withCircuit(2025)
    later.masterData.properties[0]!.remoteReading = { since: '2026-02-01' }
    expect(codesOf(later)).not.toContain('rules.monthly_information')
    expect(codesOf(withCircuit(2025))).not.toContain(
      'rules.monthly_information',
    )
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
