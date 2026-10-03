import { encodeCurrentAppData } from '@nebenkosten/import-export'
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
  it('schützt auch den Jahresstatus eines abgeschlossenen Jahres', () => {
    const source = upsertMeterBillingStatus(
      withMeter(),
      { meterId: IDS.meter, year: 2026, bookingPresent: true },
      { createId: () => IDS.status },
    )
    const locked = {
      ...source,
      billingData: {
        ...source.billingData,
        billingPeriods: source.billingData.billingPeriods.map((period) => ({
          ...period,
          status: 'FINALIZED' as const,
        })),
      },
    }
    expect(() =>
      upsertMeterBillingStatus(locked, {
        meterId: IDS.meter,
        year: 2026,
        bookingPresent: false,
      }),
    ).toThrow(/gesperrt/)
    expect(() => deleteMeterBillingStatus(locked, IDS.status)).toThrow(
      /gesperrt/,
    )
  })
  it('erlaubt ausschließlich bestätigte angrenzende Jahresgrenzen', () => {
    const source = withMeter()
    const reading = {
      meterId: IDS.meter,
      billingPeriodId: IDS.period,
      date: '2025-12-31',
      boundary: 'end_of_day',
      value: { value: 1000, unit: 'kWh' },
      source: 'manual',
    }
    expect(
      addMeterReading(source, reading, { createId: () => IDS.reading })
        .billingData.meterReadings[0],
    ).toMatchObject({ boundary: 'end_of_day' })
    expect(() =>
      addMeterReading(source, { ...reading, boundary: 'start_of_day' }),
    ).toThrow()
    expect(() =>
      addMeterReading(source, { ...reading, date: '2025-12-30' }),
    ).toThrow()
    expect(() =>
      addMeterReading(source, {
        ...reading,
        date: '2027-01-01',
        boundary: 'start_of_day',
      }),
    ).not.toThrow()
  })

  it('verhindert Änderungen an Ablesungen eines gesperrten Jahres', () => {
    const editable = addMeterReading(
      withMeter(),
      {
        meterId: IDS.meter,
        billingPeriodId: IDS.period,
        date: '2026-01-01',
        value: { value: 1000, unit: 'kWh' },
      },
      { createId: () => IDS.reading },
    )
    const locked = {
      ...editable,
      billingData: {
        ...editable.billingData,
        billingPeriods: editable.billingData.billingPeriods.map((period) => ({
          ...period,
          status: 'FINALIZED' as const,
        })),
      },
    }
    expect(() => deleteMeterReading(locked, IDS.reading)).toThrow(/gesperrt/)
    expect(() =>
      updateMeterReading(locked, IDS.reading, {
        meterId: IDS.meter,
        value: { value: 1200, unit: 'kWh' },
      }),
    ).toThrow(/gesperrt/)
    expect(() =>
      addMeterReading(locked, {
        meterId: IDS.meter,
        billingPeriodId: IDS.period,
        value: { value: 1500, unit: 'kWh' },
      }),
    ).toThrow(/gesperrt/)
  })

  it('legt Zähler an und bearbeitet Stammdaten unveränderlich', async () => {
    const source = withMeter()
    const result = updateMeter(source, IDS.meter, {
      propertyId: IDS.property,
      kind: 'heat',
      meterNumber: 'TEST-Z-2',
      address: undefined,
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
    await expect(
      encodeCurrentAppData(result, {
        savedAt: new Date('2026-12-31T12:00:00.000Z'),
      }),
    ).resolves.toBeDefined()
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

  it('weist ungültige Referenzen und fehlende Jahresdaten verständlich zurück', () => {
    expect(() =>
      addMeter(
        { ...baseFile(), schemaVersion: 3 } as unknown as AppDataFile,
        {},
      ),
    ).toThrowError(/Datenbestand/)
    expect(() => addMeter(baseFile(), { kind: 'unbekannt' })).toThrowError(
      /ungültige Felder/,
    )
    expect(() =>
      addMeter(
        baseFile(),
        {
          propertyId: '81000000-0000-4000-8000-000000000099',
          kind: 'general',
          meterNumberStatus: 'open',
        },
        { createId: () => IDS.meter },
      ),
    ).toThrowError(/Objekt/)
    expect(() =>
      addMeter(
        baseFile(),
        {
          propertyId: IDS.property,
          kind: 'general',
          meterNumberStatus: 'open',
        },
        { createId: () => IDS.property },
      ),
    ).toThrowError(/ID/)
    expect(() =>
      addMeter(
        baseFile(),
        {
          propertyId: IDS.property,
          kind: 'general',
          meterNumberStatus: 'open',
          note: ' ',
        },
        { createId: () => IDS.meter },
      ),
    ).toThrowError(/Zählernotiz/)
    expect(() =>
      addMeter(
        baseFile(),
        {
          propertyId: IDS.property,
          kind: 'heat',
          meterNumberStatus: 'confirmed',
          energySourceRef: {
            heatingCircuitBuildingId: IDS.company,
            energySourceKey: 'haupt',
          },
        },
        { createId: () => IDS.meter },
      ),
    ).toThrowError(/Energiequellen-Zuordnung/)
    expect(() =>
      updateMeter(baseFile(), IDS.meter, {
        propertyId: IDS.property,
        kind: 'general',
        meterNumberStatus: 'open',
      }),
    ).toThrowError(/nicht gefunden/)

    expect(() =>
      addMeterReading(baseFile(), {
        meterId: IDS.meter,
        value: { value: 1, unit: 'kWh' },
      }),
    ).toThrowError(/Zähler wurde nicht gefunden/)

    expect(() =>
      addMeterReading(withMeter(), {
        meterId: IDS.meter,
        value: { value: -1, unit: 'kWh' },
      }),
    ).toThrowError(/nicht negativ/)
    expect(() =>
      addMeterReading(withMeter(), {
        meterId: IDS.meter,
        billingPeriodId: IDS.period,
        date: '2027-01-01',
        value: { value: 1, unit: 'kWh' },
      }),
    ).toThrowError(/außerhalb/)
    expect(() =>
      updateMeterReading(withMeter(), IDS.reading, {
        meterId: IDS.meter,
        value: { value: 1, unit: 'kWh' },
      }),
    ).toThrowError(/nicht gefunden/)
    expect(() => deleteMeterReading(withMeter(), IDS.reading)).toThrowError(
      /nicht gefunden/,
    )

    expect(() =>
      upsertMeterBillingStatus(withMeter(), {
        meterId: IDS.meter,
        billingPeriodId: IDS.period,
        year: 2025,
      }),
    ).toThrowError(/selben Objekt und Jahr/)
    expect(() =>
      deleteMeterBillingStatus(withMeter(), IDS.status),
    ).toThrowError(/nicht gefunden/)
  })

  it('schützt Zähler auch vor dem Löschen bei vorhandenem Jahresstatus', () => {
    const source = upsertMeterBillingStatus(
      withMeter(),
      { meterId: IDS.meter, billingPeriodId: IDS.period, year: 2026 },
      { createId: () => IDS.status },
    )

    expect(() => deleteMeter(source, IDS.meter)).toThrowError(/Jahres-/)
  })
})
