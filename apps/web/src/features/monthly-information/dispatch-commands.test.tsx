import { appDataFileSchema, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { MonthlyInformationCommandError } from './commands'
import {
  findMonthlyDispatch,
  monthlyDispatchRecipients,
  recordMonthlyDispatch,
  removeMonthlyDispatch,
  summarizeMonthlyDispatch,
  type RecordMonthlyDispatchInput,
} from './dispatch-commands'
import {
  effectiveMonthlyInformationChannel,
  tenancyEmailAddresses,
} from './delivery'
import {
  ID,
  PERIOD_2026,
  PROPERTY,
  UNIT_A,
  UNIT_B,
  monthlyFixture,
} from './test-fixture'

const TENANCY_A = ID(12)
const TENANCY_B = ID(13)
const DISPATCH_ID = ID(9001)
const createId = () => DISPATCH_ID

/** Erika Beispiel (Wohnung A) mit E-Mail und Zustimmung. */
function withEmailTenant(): AppDataFile {
  const data = monthlyFixture()
  data.masterData.persons[0]!.email = ['erika', 'example.invalid'].join('@')
  data.masterData.tenancies[0]!.monthlyInformationDelivery = {
    channel: 'email',
    emailConsentDate: '2025-12-01',
  }
  return data
}

const input: RecordMonthlyDispatchInput = {
  propertyId: PROPERTY,
  month: '2026-03',
  dispatchedOn: '2026-04-05',
  exceptions: [],
  createId,
}

describe('Versandweg', () => {
  it('nutzt E-Mail nur mit Zustimmungsdatum und Adresse, sonst Brief', () => {
    const data = withEmailTenant()
    expect(effectiveMonthlyInformationChannel(data, TENANCY_A)).toBe('email')
    expect(effectiveMonthlyInformationChannel(data, TENANCY_B)).toBe('letter')
    expect(effectiveMonthlyInformationChannel(data, null)).toBe('letter')
    expect(tenancyEmailAddresses(data, 'unbekannt')).toEqual([])
    data.masterData.persons[0]!.email = '  '
    expect(effectiveMonthlyInformationChannel(data, TENANCY_A)).toBe('letter')
  })
})

describe('recordMonthlyDispatch', () => {
  it('protokolliert alle Mieter des Monats mit ihrem Versandweg', () => {
    const data = withEmailTenant()
    expect(monthlyDispatchRecipients(data, PROPERTY, '2026-03')).toEqual([
      { tenancyId: TENANCY_A, unitId: UNIT_A, channel: 'email' },
      { tenancyId: TENANCY_B, unitId: UNIT_B, channel: 'letter' },
    ])
    const result = recordMonthlyDispatch(data, input)
    expect(appDataFileSchema.safeParse(result).success).toBe(true)
    expect(data.billingData.monthlyInformationDispatches).toBeUndefined()
    const dispatch = findMonthlyDispatch(result, PROPERTY, '2026-03')
    expect(dispatch).toEqual({
      id: DISPATCH_ID,
      propertyId: PROPERTY,
      month: '2026-03',
      dispatchedOn: '2026-04-05',
      entries: [
        { tenancyId: TENANCY_A, channel: 'email', status: 'sent' },
        { tenancyId: TENANCY_B, channel: 'letter', status: 'sent' },
      ],
    })
    expect(summarizeMonthlyDispatch(dispatch!)).toEqual({
      email: 1,
      letter: 1,
      notSent: 0,
    })
    expect(findMonthlyDispatch(result, PROPERTY, '2026-02')).toBeUndefined()
  })

  it('vermerkt Ausnahmen mit Begründung als nicht versendet', () => {
    const result = recordMonthlyDispatch(withEmailTenant(), {
      ...input,
      exceptions: [{ tenancyId: TENANCY_B, note: '  Brief zurückgekommen ' }],
    })
    const dispatch = findMonthlyDispatch(result, PROPERTY, '2026-03')!
    expect(dispatch.entries[1]).toEqual({
      tenancyId: TENANCY_B,
      channel: 'letter',
      status: 'not_sent',
      note: 'Brief zurückgekommen',
    })
    expect(summarizeMonthlyDispatch(dispatch)).toEqual({
      email: 1,
      letter: 0,
      notSent: 1,
    })
  })

  it('ersetzt ein vorhandenes Protokoll nicht stillschweigend', () => {
    const first = recordMonthlyDispatch(withEmailTenant(), input)
    expect(() =>
      recordMonthlyDispatch(first, { ...input, createId: () => ID(9002) }),
    ).toThrow(/bereits protokolliert/)
    const removed = removeMonthlyDispatch(first, DISPATCH_ID)
    expect(removed.billingData.monthlyInformationDispatches).toEqual([])
    expect(() => removeMonthlyDispatch(removed, DISPATCH_ID)).toThrow(
      'Versandprotokoll wurde nicht gefunden.',
    )
    expect(
      findMonthlyDispatch(
        recordMonthlyDispatch(removed, input),
        PROPERTY,
        '2026-03',
      ),
    ).toBeDefined()
  })

  it('lehnt ungültige Eingaben ab', () => {
    const data = withEmailTenant()
    const cases: Array<[Partial<RecordMonthlyDispatchInput>, RegExp]> = [
      [{ propertyId: ID(999) }, /Objekt wurde nicht gefunden/],
      [{ month: '2026-13' }, /Monat im Format JJJJ-MM/],
      [{ month: '2024-01' }, /keine Mieter/],
      [{ dispatchedOn: '05.04.2026' }, /Dateischema/],
      [{ dispatchedOn: '2026-03-30' }, /vor dem Ende des Monats/],
      [{ exceptions: [{ tenancyId: TENANCY_B, note: '   ' }] }, /Begründung/],
      [
        { exceptions: [{ tenancyId: ID(999), note: 'x' }] },
        /nicht unter den Mietern/,
      ],
      [
        {
          exceptions: [
            { tenancyId: TENANCY_B, note: 'x' },
            { tenancyId: TENANCY_B, note: 'y' },
          ],
        },
        /mehrfach/,
      ],
      [{ createId: () => 'keine-id mit leerzeichen'.repeat(10) }, /ID/],
    ]
    for (const [patch, message] of cases) {
      let caught: unknown
      try {
        recordMonthlyDispatch(data, { ...input, ...patch })
      } catch (error) {
        caught = error
      }
      expect(caught, String(message)).toBeInstanceOf(
        MonthlyInformationCommandError,
      )
      expect((caught as Error).message).toMatch(message)
    }
  })

  it('verweigert Protokoll und Entfernen in gesperrten Abrechnungsjahren', () => {
    const data = withEmailTenant()
    const recorded = recordMonthlyDispatch(data, input)
    for (const source of [data, recorded])
      source.billingData.billingPeriods = source.billingData.billingPeriods.map(
        (period) =>
          period.id === PERIOD_2026
            ? { ...period, status: 'FINALIZED' as const }
            : period,
      )
    expect(() => recordMonthlyDispatch(data, input)).toThrow(
      /gesperrtes Abrechnungsjahr \(2026\)/,
    )
    expect(() => removeMonthlyDispatch(recorded, DISPATCH_ID)).toThrow(
      /gesperrtes Abrechnungsjahr \(2026\)/,
    )
  })
})
