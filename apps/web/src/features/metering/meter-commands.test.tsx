import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  addMeter,
  addMeterReading,
  deleteMeter,
  deleteMeterBillingStatus,
  deleteMeterReading,
  updateMeter,
  updateMeterReading,
  upsertMeterBillingStatus,
} from './meter-commands'

const IDS = {
  organization: '81000000-0000-4000-8000-000000000001',
  company: '81000000-0000-4000-8000-000000000002',
  property: '81000000-0000-4000-8000-000000000003',
  period: '81000000-0000-4000-8000-000000000004',
  meter: '81000000-0000-4000-8000-000000000005',
  reading: '81000000-0000-4000-8000-000000000006',
  status: '81000000-0000-4000-8000-000000000007',
} as const

function baseFile(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [{ id: IDS.organization, name: 'Fiktive Verwaltung' }],
      ownerCompanies: [
        {
          id: IDS.company,
          organizationId: IDS.organization,
          name: 'Fiktive Eigentümerin',
          additionalNameLines: [],
        },
      ],
      properties: [{ id: IDS.property, ownerCompanyId: IDS.company }],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: IDS.period,
          propertyId: IDS.property,
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'DRAFT',
        },
      ],
    },
  }
}

function withMeter(): AppDataFile {
  return addMeter(
    baseFile(),
    {
      propertyId: IDS.property,
      kind: 'general',
      meterNumber: 'TEST-Z-1',
      provider: 'Fiktiver Versorger',
      meterNumberStatus: 'open',
    },
    { createId: () => IDS.meter },
  )
}

describe('meter commands', () => {
  it('legt Zähler an und bearbeitet Stammdaten unveränderlich', () => {
    const source = withMeter()
    const result = updateMeter(source, IDS.meter, {
      propertyId: IDS.property,
      kind: 'heat',
      meterNumber: 'TEST-Z-2',
      provider: 'Fiktiver Versorger',
      meterNumberStatus: 'confirmed',
      note: 'Fiktiver Hinweis',
    })

    expect(source.masterData.meters[0]?.meterNumber).toBe('TEST-Z-1')
    expect(result.masterData.meters[0]).toMatchObject({
      kind: 'heat',
      meterNumber: 'TEST-Z-2',
      meterNumberStatus: 'confirmed',
    })
  })

  it('pflegt Ablesungen und Jahresstatus mit gültigem Objektbezug', () => {
    let result = addMeterReading(
      withMeter(),
      {
        meterId: IDS.meter,
        billingPeriodId: IDS.period,
        date: '2026-06-30',
        value: { value: 1234.5, unit: 'kWh' },
        source: 'manual',
      },
      { createId: () => IDS.reading },
    )
    result = updateMeterReading(result, IDS.reading, {
      meterId: IDS.meter,
      billingPeriodId: IDS.period,
      date: '2026-07-01',
      value: { value: 1240, unit: 'kWh' },
      source: 'manual',
    })
    result = upsertMeterBillingStatus(
      result,
      {
        meterId: IDS.meter,
        billingPeriodId: IDS.period,
        year: 2026,
        bookingPresent: true,
        annualInvoicePresent: false,
        estimateAmountCents: 12_500,
        estimateReason: 'Fiktive Schätzung',
      },
      { createId: () => IDS.status },
    )

    expect(result.billingData.meterReadings[0]).toMatchObject({
      date: '2026-07-01',
      value: { value: 1240, unit: 'kWh' },
    })
    expect(result.billingData.meterBillingStatuses[0]).toMatchObject({
      id: IDS.status,
      year: 2026,
      bookingPresent: true,
    })

    result = upsertMeterBillingStatus(result, {
      meterId: IDS.meter,
      billingPeriodId: IDS.period,
      year: 2026,
      bookingPresent: true,
      annualInvoicePresent: true,
    })
    expect(result.billingData.meterBillingStatuses).toHaveLength(1)
    expect(
      result.billingData.meterBillingStatuses[0]?.annualInvoicePresent,
    ).toBe(true)
  })

  it('schützt Zähler mit Ablesungen und löscht abhängige Jahresdaten gezielt', () => {
    let result = addMeterReading(
      withMeter(),
      {
        meterId: IDS.meter,
        billingPeriodId: IDS.period,
        value: { value: 1, unit: 'kWh' },
      },
      { createId: () => IDS.reading },
    )
    result = upsertMeterBillingStatus(
      result,
      { meterId: IDS.meter, billingPeriodId: IDS.period, year: 2026 },
      { createId: () => IDS.status },
    )

    expect(() => deleteMeter(result, IDS.meter)).toThrowError(/Ablesungen/)
    result = deleteMeterReading(result, IDS.reading)
    result = deleteMeterBillingStatus(result, IDS.status)
    expect(deleteMeter(result, IDS.meter).masterData.meters).toEqual([])
  })

  it('weist Ablesungen aus einem fremden Abrechnungsobjekt zurück', () => {
    const foreignPeriod = '81000000-0000-4000-8000-000000000008'
    const meterData = withMeter()
    const source: AppDataFile = {
      ...meterData,
      billingData: {
        ...meterData.billingData,
        billingPeriods: [
          ...meterData.billingData.billingPeriods,
          {
            id: foreignPeriod,
            propertyId: '81000000-0000-4000-8000-000000000009',
            year: 2026,
            periodStart: '2026-01-01',
            periodEnd: '2026-12-31',
            status: 'DRAFT',
          },
        ],
      },
    }
    expect(() =>
      addMeterReading(
        source,
        {
          meterId: IDS.meter,
          billingPeriodId: foreignPeriod,
          value: { value: 1, unit: 'kWh' },
        },
        { createId: () => IDS.reading },
      ),
    ).toThrowError(/Objekt/)
  })
})
