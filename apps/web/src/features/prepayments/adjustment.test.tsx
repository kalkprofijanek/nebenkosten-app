import type { AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../../../tests/characterization/build-app-data'
import { scenarios, settledYear, withFollowYear } from './prepayment-fixture'
import { latestCalculationSnapshot } from '../pdf/context'
import {
  PREPAYMENT_ADJUSTMENT_ACTION,
  acceptedAdjustmentLetter,
  adjustmentTarget,
  adjustmentTargetMessage,
  calculateAdjustment,
  decidePrepaymentAdjustment,
  defaultValidFrom,
  earliestValidFrom,
  isFirstOfMonth,
  latestAdjustmentDecision,
  localIsoDate,
  proposePrepaymentAdjustments,
  proposalsFromCalculation,
} from './adjustment'
import { buildTenantStatementWithAdjustment } from './statement-with-adjustment'
import { buildTenantStatementContext } from '../pdf/context'

function deps() {
  let counter = 0
  return {
    createId: () => `audit-${(counter += 1)}`,
    now: () => new Date('2025-03-10T09:00:00.000Z'),
  }
}

function prepaymentOf(data: AppDataFile, occupancyPeriodId: string) {
  return data.billingData.prepayments.find(
    (item) => item.occupancyPeriodId === occupancyPeriodId,
  )
}

const accept = {
  billingPeriodId: 'bp-1',
  occupancyPeriodId: 'op-t1',
  accepted: true,
  newMonthlyCents: 6000,
  validFrom: '2025-01-01',
}

describe('calculateAdjustment', () => {
  it('rechnet Teiljahre auf 365 Tage hoch und rundet auf volle Euro auf', () => {
    expect(
      calculateAdjustment({
        shareCents: 30_000,
        occupiedDays: 182,
        previousMonthlyCents: 4_000,
      }),
    ).toEqual({
      annualizedCostsCents: 60_165,
      proposedMonthlyCents: 5_100,
      increaseCents: 1_100,
      uncertain: false,
    })
  })

  it('schlägt erst ab einer Erhöhung von 5 Euro vor', () => {
    const base = { shareCents: 60_000, occupiedDays: 365 }
    expect(
      calculateAdjustment({ ...base, previousMonthlyCents: 4_600 }),
    ).toBeNull()
    expect(
      calculateAdjustment({ ...base, previousMonthlyCents: 4_500 }),
    ).toMatchObject({ proposedMonthlyCents: 5_000, increaseCents: 500 })
  })

  it('markiert kurze Belegungen als unsicher und ignoriert leere', () => {
    expect(
      calculateAdjustment({
        shareCents: 10_000,
        occupiedDays: 60,
        previousMonthlyCents: 0,
      })?.uncertain,
    ).toBe(true)
    expect(
      calculateAdjustment({
        shareCents: 10_000,
        occupiedDays: 0,
        previousMonthlyCents: 0,
      }),
    ).toBeNull()
  })
})

describe('Vorschläge aus dem Rechenstand', () => {
  it('schlägt nur Mieter mit Nachzahlung und monatlicher VZ vor', () => {
    const proposals = proposePrepaymentAdjustments(settledYear(), 'bp-1')
    expect(proposals).toHaveLength(1)
    expect(proposals![0]).toMatchObject({
      occupancyPeriodId: 'op-t1',
      tenancyId: 'ten-t1',
      occupiedDays: 366,
      shareCents: 72_000,
      balanceCents: 12_000,
      previousMonthlyCents: 5_000,
      annualizedCostsCents: 71_803,
      proposedMonthlyCents: 6_000,
      uncertain: false,
      dispatchDate: null,
    })
  })

  it('liefert null ohne Rechenstand oder Jahr', () => {
    const data = buildAppDataFile(scenarios[0]!)
    expect(proposePrepaymentAdjustments(data, 'bp-1')).toBeNull()
    expect(proposePrepaymentAdjustments(data, 'fehlt')).toBeNull()
  })

  function proposalsWith(change: (data: AppDataFile) => AppDataFile) {
    const data = settledYear()
    const period = data.billingData.billingPeriods[0]!
    const calculation = latestCalculationSnapshot(data, 'bp-1')!.output
    return proposalsFromCalculation(change(data), period, calculation)
  }

  it('schließt Auszug, fehlende monatliche VZ und Guthaben aus', () => {
    const movedOut = proposalsWith((data) => ({
      ...data,
      billingData: {
        ...data.billingData,
        occupancyPeriods: data.billingData.occupancyPeriods.map((item) =>
          item.id === 'op-t1' ? { ...item, to: '2024-11-30' } : item,
        ),
      },
    }))
    expect(movedOut).toEqual([])

    const tenancyEnded = proposalsWith((data) => ({
      ...data,
      masterData: {
        ...data.masterData,
        tenancies: data.masterData.tenancies.map((item) =>
          item.id === 'ten-t1' ? { ...item, movedOut: '2024-12-31' } : item,
        ),
      },
    }))
    expect(tenancyEnded).toEqual([])

    for (const prepayment of [
      { mode: 'annual', annualAmountCents: 60_000 },
      { mode: 'none_agreed' },
    ] as const) {
      const other = proposalsWith((data) => ({
        ...data,
        billingData: {
          ...data.billingData,
          prepayments: data.billingData.prepayments.map((item) =>
            item.id === 'pp-t1'
              ? { id: item.id, occupancyPeriodId: 'op-t1', ...prepayment }
              : item,
          ),
        },
      }))
      expect(other).toEqual([])
    }

    const data = settledYear()
    const calculation = latestCalculationSnapshot(data, 'bp-1')!.output
    const credit = proposalsFromCalculation(
      data,
      data.billingData.billingPeriods[0]!,
      {
        ...calculation,
        tenants: calculation.tenants.map((tenant) => ({
          ...tenant,
          balanceCents: -100,
        })),
      },
    )
    expect(credit).toEqual([])
  })

  it('übernimmt das Versanddatum der Belegung oder des Jahres', () => {
    const proposals = proposalsWith((data) => ({
      ...data,
      billingData: {
        ...data.billingData,
        occupancyPeriods: data.billingData.occupancyPeriods.map((item) => ({
          ...item,
          dispatchDate: '2025-05-02',
        })),
      },
    }))
    expect(proposals[0]!.dispatchDate).toBe('2025-05-02')
  })
})

describe('Termine', () => {
  it('nutzt den nächsten zulässigen 01.01. nach Versand und prüft den frühesten Termin', () => {
    const period = settledYear().billingData.billingPeriods[0]!
    expect(defaultValidFrom(period, `${period.year}-02-15`)).toBe(
      `${period.year + 1}-01-01`,
    )
    expect(defaultValidFrom(period, `${period.year + 1}-10-03`)).toBe(
      `${period.year + 2}-01-01`,
    )
    expect(defaultValidFrom(period, `${period.year + 1}-12-10`)).toBe(
      `${period.year + 3}-01-01`,
    )
    expect(earliestValidFrom('2024-10-31')).toBe('2024-12-01')
    expect(earliestValidFrom('2024-11-15')).toBe('2025-01-01')
    expect(earliestValidFrom('2024-12-03')).toBe('2025-02-01')
    expect(isFirstOfMonth('2025-01-01')).toBe(true)
    expect(isFirstOfMonth('2025-01-02')).toBe(false)
    expect(localIsoDate(new Date(2026, 9, 3))).toBe('2026-10-03')
  })
})

describe('decidePrepaymentAdjustment', () => {
  it('setzt bei „Ja“ die VZ im Folgejahr und protokolliert ein Audit-Event', () => {
    const data = withFollowYear()
    const result = decidePrepaymentAdjustment(data, accept, deps())

    expect(prepaymentOf(result, 'op-t1-2025')).toMatchObject({
      mode: 'monthly',
      monthlyAmountCents: 6000,
    })
    expect(prepaymentOf(result, 'op-t1')).toEqual(prepaymentOf(data, 'op-t1'))
    // Rechenstand des abgerechneten Jahres bleibt unverändert erhalten.
    expect(result.billingData.calculationResults).toEqual(
      data.billingData.calculationResults,
    )
    const event = result.billingData.auditEvents.at(-1)!
    expect(event).toMatchObject({
      id: 'audit-1',
      billingPeriodId: 'bp-1',
      action: PREPAYMENT_ADJUSTMENT_ACTION,
      timestamp: '2025-03-10T09:00:00.000Z',
      details: {
        billingYear: 2024,
        occupancyPeriodId: 'op-t1',
        tenancyId: 'ten-t1',
        accepted: true,
        previousMonthlyCents: 5000,
        newMonthlyCents: 6000,
        proposedMonthlyCents: 6000,
        annualizedCostsCents: 71_803,
        validFrom: '2025-01-01',
        targetBillingPeriodId: 'bp-2',
        targetOccupancyPeriodId: 'op-t1-2025',
        targetPreviousPrepayment: {
          mode: 'monthly',
          monthlyAmountCents: 5000,
        },
      },
    })
    expect(latestAdjustmentDecision(result, 'bp-1', 'op-t1')).toMatchObject({
      accepted: true,
      newMonthlyCents: 6000,
    })
    const period = result.billingData.billingPeriods[0]!
    const calculation = latestCalculationSnapshot(result, 'bp-1')!.output
    expect(
      acceptedAdjustmentLetter(result, period, calculation, 'op-t1'),
    ).toEqual({
      previousMonthlyCents: 5000,
      newMonthlyCents: 6000,
      annualizedCostsCents: 71_803,
      validFrom: '2025-01-01',
    })
  })

  it('setzt bei „Nein“ eine zuvor übernommene VZ zurück', () => {
    const dependencies = deps()
    const accepted = decidePrepaymentAdjustment(
      withFollowYear(),
      accept,
      dependencies,
    )
    const reaccepted = decidePrepaymentAdjustment(
      accepted,
      { ...accept, newMonthlyCents: 6500 },
      dependencies,
    )
    expect(
      latestAdjustmentDecision(reaccepted, 'bp-1', 'op-t1')
        ?.targetPreviousPrepayment,
    ).toEqual({ mode: 'monthly', monthlyAmountCents: 5000 })
    const declined = decidePrepaymentAdjustment(
      reaccepted,
      { ...accept, accepted: false, newMonthlyCents: 6500 },
      dependencies,
    )
    expect(prepaymentOf(declined, 'op-t1-2025')).toMatchObject({
      monthlyAmountCents: 5000,
    })
    const decision = latestAdjustmentDecision(declined, 'bp-1', 'op-t1')!
    expect(decision.accepted).toBe(false)
    expect(decision.targetOccupancyPeriodId).toBe('op-t1-2025')
    const period = declined.billingData.billingPeriods[0]!
    const calculation = latestCalculationSnapshot(declined, 'bp-1')!.output
    expect(
      acceptedAdjustmentLetter(declined, period, calculation, 'op-t1'),
    ).toBeUndefined()
  })

  it('lässt manuell geänderte Folgejahr-VZ bei „Nein“ unverändert', () => {
    const dependencies = deps()
    const accepted = decidePrepaymentAdjustment(
      withFollowYear(),
      accept,
      dependencies,
    )
    const manual: AppDataFile = {
      ...accepted,
      billingData: {
        ...accepted.billingData,
        prepayments: accepted.billingData.prepayments.map((item) =>
          item.id === 'pp-t1-2025'
            ? {
                id: item.id,
                occupancyPeriodId: 'op-t1-2025',
                mode: 'monthly',
                monthlyAmountCents: 7000,
              }
            : item,
        ),
      },
    }
    const declined = decidePrepaymentAdjustment(
      manual,
      { ...accept, accepted: false },
      dependencies,
    )
    expect(prepaymentOf(declined, 'op-t1-2025')).toMatchObject({
      monthlyAmountCents: 7000,
    })
    expect(
      latestAdjustmentDecision(declined, 'bp-1', 'op-t1')
        ?.targetOccupancyPeriodId,
    ).toBeNull()
  })

  it('speichert die Entscheidung auch ohne Folgejahr mit klarer Meldung', () => {
    const data = settledYear()
    const target = adjustmentTarget(data, 'bp-1', 'ten-t1', '2025-01-01')
    expect(target).toEqual({ kind: 'missing_year', year: 2025 })
    expect(adjustmentTargetMessage(target)).toMatch(
      /Abrechnungsjahr 2025 ist noch nicht angelegt/u,
    )
    const result = decidePrepaymentAdjustment(data, accept, deps())
    expect(result.billingData.prepayments).toEqual(data.billingData.prepayments)
    expect(result.billingData.auditEvents.at(-1)?.details).toMatchObject({
      accepted: true,
      targetBillingPeriodId: null,
      targetOccupancyPeriodId: null,
    })
  })

  it('verweigert „Ja“ bei gesperrtem Folgejahr', () => {
    const data = withFollowYear(settledYear(), 'READY_FOR_PDF')
    expect(() => decidePrepaymentAdjustment(data, accept, deps())).toThrow(
      /Abrechnungsjahr 2025 ist gesperrt/u,
    )
  })

  it('erkennt fehlende Belegung und unterjährige Termine', () => {
    const data = withFollowYear()
    const missing = adjustmentTarget(data, 'bp-1', 'ten-t2', '2025-01-01')
    expect(missing.kind).toBe('missing_occupancy')
    expect(adjustmentTargetMessage(missing)).toMatch(/keine Belegung/u)
    const midYear = adjustmentTarget(data, 'bp-1', 'ten-t1', '2025-03-01')
    expect(midYear.kind).toBe('mid_year')
    expect(adjustmentTargetMessage(midYear)).toMatch(/im Lauf/u)
    const found = adjustmentTarget(data, 'bp-1', 'ten-t1', '2025-01-01')
    expect(adjustmentTargetMessage(found)).toMatch(/2025 eingetragen/u)
    expect(() =>
      adjustmentTarget(data, 'fehlt', 'ten-t1', '2025-01-01'),
    ).toThrow(/nicht gefunden/u)

    const result = decidePrepaymentAdjustment(
      data,
      { ...accept, validFrom: '2025-03-01' },
      deps(),
    )
    expect(prepaymentOf(result, 'op-t1-2025')).toMatchObject({
      monthlyAmountCents: 5000,
    })
  })

  it('meldet fehlende Vorauszahlung im Folgejahr', () => {
    const data = withFollowYear()
    const withoutPrepayment = {
      ...data,
      billingData: {
        ...data.billingData,
        prepayments: data.billingData.prepayments.filter(
          ({ id }) => id !== 'pp-t1-2025',
        ),
      },
    }
    expect(() =>
      decidePrepaymentAdjustment(withoutPrepayment, accept, deps()),
    ).toThrow(/keine Vorauszahlung erfasst/u)
  })

  it('prüft Eingaben', () => {
    const data = withFollowYear()
    expect(() =>
      decidePrepaymentAdjustment(
        data,
        { ...accept, billingPeriodId: 'x' },
        deps(),
      ),
    ).toThrow(/nicht gefunden/u)
    expect(() =>
      decidePrepaymentAdjustment(
        data,
        { ...accept, newMonthlyCents: 0 },
        deps(),
      ),
    ).toThrow(/gültige neue Vorauszahlung/u)
    expect(() =>
      decidePrepaymentAdjustment(
        data,
        { ...accept, validFrom: '2025-01-15' },
        deps(),
      ),
    ).toThrow(/Ersten eines Monats/u)
    expect(() =>
      decidePrepaymentAdjustment(
        data,
        { ...accept, validFrom: '2024-12-01' },
        deps(),
      ),
    ).toThrow(/nach dem Abrechnungsjahr/u)
    expect(() =>
      decidePrepaymentAdjustment(
        data,
        { ...accept, occupancyPeriodId: 'op-t2' },
        deps(),
      ),
    ).toThrow(/keine Anpassung vorgesehen/u)
    const duplicate = decidePrepaymentAdjustment(data, accept, deps())
    expect(() => decidePrepaymentAdjustment(duplicate, accept, deps())).toThrow(
      /eindeutig/u,
    )
  })
})

describe('Anpassungsschreiben an der Einzelabrechnung', () => {
  function statementPages(data: AppDataFile) {
    const period = data.billingData.billingPeriods[0]!
    const calculation = latestCalculationSnapshot(data, 'bp-1')!.output
    const occupancy = data.billingData.occupancyPeriods.find(
      ({ id }) => id === 'op-t1',
    )!
    const definition = buildTenantStatementWithAdjustment(
      buildTenantStatementContext(data, period, calculation, occupancy),
    )
    return JSON.stringify(definition.content)
  }

  it('hängt das Schreiben nur bei gültigem „Ja“ an', () => {
    const data = withFollowYear()
    expect(statementPages(data)).not.toContain('§ 560 Abs. 4 BGB')
    const accepted = decidePrepaymentAdjustment(data, accept, deps())
    const pages = statementPages(accepted)
    expect(pages).toContain(
      'Anpassung der Betriebskostenvorauszahlung gemäß § 560 Abs. 4 BGB',
    )
    expect(pages).toContain('"pageBreak":"before"')
  })

  it('verwirft veraltete oder unlesbare Entscheidungen', () => {
    const accepted = decidePrepaymentAdjustment(
      withFollowYear(),
      accept,
      deps(),
    )
    const stale: AppDataFile = {
      ...accepted,
      billingData: {
        ...accepted.billingData,
        auditEvents: accepted.billingData.auditEvents.map((event) => ({
          ...event,
          details: { ...event.details, annualizedCostsCents: 1 },
        })),
      },
    }
    expect(statementPages(stale)).not.toContain('§ 560 Abs. 4 BGB')
    const broken: AppDataFile = {
      ...accepted,
      billingData: {
        ...accepted.billingData,
        auditEvents: accepted.billingData.auditEvents.map((event) => ({
          ...event,
          details: { ...event.details, validFrom: 'irgendwann' },
        })),
      },
    }
    expect(latestAdjustmentDecision(broken, 'bp-1', 'op-t1')).toBeUndefined()
    const odd: AppDataFile = {
      ...accepted,
      billingData: {
        ...accepted.billingData,
        auditEvents: accepted.billingData.auditEvents.map((event) => ({
          ...event,
          details: {
            ...event.details,
            targetOccupancyPeriodId: 5,
            targetPreviousPrepayment: { mode: 'annual', annualAmountCents: 12 },
          },
        })),
      },
    }
    expect(latestAdjustmentDecision(odd, 'bp-1', 'op-t1')).toMatchObject({
      targetOccupancyPeriodId: null,
      targetPreviousPrepayment: { mode: 'annual', annualAmountCents: 12 },
    })
    const none: AppDataFile = {
      ...accepted,
      billingData: {
        ...accepted.billingData,
        auditEvents: accepted.billingData.auditEvents.map((event) => ({
          ...event,
          details: {
            ...event.details,
            targetPreviousPrepayment: { mode: 'none_agreed' },
          },
        })),
      },
    }
    expect(
      latestAdjustmentDecision(none, 'bp-1', 'op-t1')?.targetPreviousPrepayment,
    ).toEqual({ mode: 'none_agreed' })
  })
})

describe('Entscheidung aus den Daten (Legacy-Import vz_anpassung*)', () => {
  const today = new Date(2025, 2, 10)

  function withDataDecision(
    details: Record<string, unknown>,
    data: AppDataFile = withFollowYear(),
  ): AppDataFile {
    return {
      ...data,
      billingData: {
        ...data.billingData,
        auditEvents: [
          ...data.billingData.auditEvents,
          {
            id: 'legacy-decision',
            billingPeriodId: 'bp-1',
            timestamp: '2025-03-01T00:00:00.000Z',
            action: PREPAYMENT_ADJUSTMENT_ACTION,
            details: {
              source: 'legacy_v3',
              occupancyPeriodId: 'op-t1',
              tenancyId: 'ten-t1',
              accepted: true,
              previousMonthlyCents: 5000,
              newMonthlyCents: null,
              validFrom: null,
              ...details,
            },
          },
        ],
      },
    }
  }

  function letterOf(data: AppDataFile) {
    const period = data.billingData.billingPeriods[0]!
    const calculation = latestCalculationSnapshot(data, 'bp-1')!.output
    return acceptedAdjustmentLetter(data, period, calculation, 'op-t1', today)
  }

  it('ergänzt Vorschlag und Standardtermin aus dem Rechenstand', () => {
    expect(letterOf(withDataDecision({}))).toEqual({
      previousMonthlyCents: 5000,
      newMonthlyCents: 6000,
      annualizedCostsCents: 71_803,
      validFrom: '2026-01-01',
    })
  })

  it('übernimmt angegebenen Betrag und Termin', () => {
    expect(
      letterOf(
        withDataDecision({ newMonthlyCents: 6500, validFrom: '2025-04-01' }),
      ),
    ).toEqual({
      previousMonthlyCents: 5000,
      newMonthlyCents: 6500,
      annualizedCostsCents: 71_803,
      validFrom: '2025-04-01',
    })
  })

  it('hängt das Schreiben an die Einzelabrechnung an', () => {
    const data = withDataDecision({ validFrom: '2025-04-01' })
    const period = data.billingData.billingPeriods[0]!
    const calculation = latestCalculationSnapshot(data, 'bp-1')!.output
    const occupancy = data.billingData.occupancyPeriods.find(
      ({ id }) => id === 'op-t1',
    )!
    const definition = buildTenantStatementWithAdjustment(
      buildTenantStatementContext(data, period, calculation, occupancy),
    )
    expect(JSON.stringify(definition.content)).toContain(
      'Anpassung der Betriebskostenvorauszahlung gemäß § 560 Abs. 4 BGB',
    )
  })

  it('wird nur mit Vorschlag ausgewertet und verwirft unpassende Angaben', () => {
    expect(
      latestAdjustmentDecision(withDataDecision({}), 'bp-1', 'op-t1'),
    ).toBeUndefined()
    expect(letterOf(withDataDecision({ accepted: false }))).toBeUndefined()
    expect(
      letterOf(withDataDecision({ previousMonthlyCents: 4000 })),
    ).toBeUndefined()
    expect(
      letterOf(withDataDecision({ previousMonthlyCents: null })),
    ).toBeUndefined()
    expect(letterOf(withDataDecision({ validFrom: '2024-12-01' }))).toBe(
      undefined,
    )
    expect(letterOf(withDataDecision({ validFrom: 7 }))).toBeUndefined()
    expect(letterOf(withDataDecision({ newMonthlyCents: -1 }))).toBeUndefined()
  })

  it('wird durch eine spätere Entscheidung in der App ersetzt', () => {
    const declined = decidePrepaymentAdjustment(
      withDataDecision({}),
      { ...accept, accepted: false },
      deps(),
    )
    expect(letterOf(declined)).toBeUndefined()
    expect(prepaymentOf(declined, 'op-t1-2025')).toMatchObject({
      monthlyAmountCents: 5000,
    })
  })
})
