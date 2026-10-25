import { describe, expect, it } from 'vitest'
import {
  checkReceiptFolder,
  compareReceiptAmounts,
  parseReceiptFolderMapping,
} from '../src/receipt-folder'
import { validData } from './fixture'

function dataWith(
  entries: {
    id: string
    receiptReference?: string | null
    amountBasis?: 'invoice' | 'estimate' | 'advance_payments'
  }[],
) {
  const data = validData()
  data.billingData.costEntries = entries.map((entry) => ({
    costCategoryId: 'category-1',
    amountCents: 1_000,
    ...entry,
  }))
  return data
}

describe('parseReceiptFolderMapping (PR-40)', () => {
  it('liest die private Zuordnung Objekt → Ordner', () => {
    expect(
      parseReceiptFolderMapping({
        version: 1,
        objects: [{ propertyId: 'property-1', invoiceFolder: 'C:\\Objekt-A' }],
      }),
    ).toEqual(new Map([['property-1', 'C:\\Objekt-A']]))
  })

  it.each([
    ['keine Zuordnung', null],
    ['falsche Version', { version: 2, objects: [] }],
    ['fehlende Liste', { version: 1 }],
    [
      'leerer Pfad',
      { version: 1, objects: [{ propertyId: 'p', invoiceFolder: ' ' }] },
    ],
    ['fehlende Objekt-ID', { version: 1, objects: [{ invoiceFolder: 'x' }] }],
    [
      'doppeltes Objekt',
      {
        version: 1,
        objects: [
          { propertyId: 'p', invoiceFolder: 'a' },
          { propertyId: 'p', invoiceFolder: 'b' },
        ],
      },
    ],
  ])('lehnt %s ab', (_label, value) => {
    expect(() => parseReceiptFolderMapping(value)).toThrow(/Zuordnungsdatei/)
  })
})

describe('checkReceiptFolder (PR-40/41)', () => {
  const files = [
    '2025/Wasser-Jahresrechnung.pdf',
    'Muell 2025.PDF',
    'Versicherung.pdf',
    'Schornsteinfeger.pdf',
  ]

  it('ordnet Belege über Pfad, Dateinamen oder Dateinamen ohne Endung zu', () => {
    const result = checkReceiptFolder(
      dataWith([
        { id: 'a', receiptReference: '2025\\Wasser-Jahresrechnung.pdf' },
        { id: 'b', receiptReference: 'muell 2025' },
        { id: 'c', receiptReference: 'Versicherung.pdf' },
      ]),
      { billingPeriodId: 'period-1', files },
    )
    expect(result.matched.map(({ id }) => id)).toEqual(['a', 'b', 'c'])
    expect(result.notFound).toEqual([])
    expect(result.withoutReference).toEqual([])
    // Nur zur Prüfung: nicht zugeordnete Dateien werden vom Agenten nach
    // Leistungszeitraum einem Jahr zugeordnet, nicht nach Ordner/Datum.
    expect(result.unreferencedFiles).toEqual(['Schornsteinfeger.pdf'])
  })

  it('meldet fehlende Angaben, nicht gefundene Belege und Mehrfachverwendung', () => {
    const result = checkReceiptFolder(
      dataWith([
        { id: 'a', receiptReference: null },
        { id: 'b', receiptReference: '  ' },
        { id: 'c', receiptReference: 'RE-4711' },
        { id: 'd', receiptReference: 'Versicherung.pdf' },
        { id: 'e', receiptReference: 'versicherung' },
        { id: 'f', receiptReference: null, amountBasis: 'estimate' },
      ]),
      { billingPeriodId: 'period-1', files },
    )
    expect(result.withoutReference).toEqual([
      { kind: 'costEntry', id: 'a' },
      { kind: 'costEntry', id: 'b' },
    ])
    expect(result.notFound).toEqual([
      { kind: 'costEntry', id: 'c', receiptReference: 'RE-4711' },
    ])
    expect(result.duplicates).toEqual([
      {
        file: 'Versicherung.pdf',
        sources: [
          { kind: 'costEntry', id: 'd' },
          { kind: 'costEntry', id: 'e' },
        ],
      },
    ])
  })

  it('berücksichtigt Brennstofflieferungen und nur den gewählten Zeitraum', () => {
    const data = dataWith([{ id: 'a', receiptReference: 'Versicherung.pdf' }])
    data.billingData.fuelDeliveries = [
      {
        id: 'delivery-1',
        energySourceId: 'source-1',
        billingPeriodId: 'period-1',
        receiptReference: 'Muell 2025.pdf',
      },
      {
        id: 'delivery-other',
        energySourceId: 'source-1',
        billingPeriodId: 'period-other',
        receiptReference: 'Schornsteinfeger.pdf',
      },
    ]
    const result = checkReceiptFolder(data, {
      billingPeriodId: 'period-1',
      files,
    })
    expect(result.matched).toContainEqual({
      kind: 'fuelDelivery',
      id: 'delivery-1',
      file: 'Muell 2025.PDF',
    })
    // In einem anderen Zeitraum verwendete Belege gelten als zugeordnet.
    expect(result.unreferencedFiles).toEqual(['2025/Wasser-Jahresrechnung.pdf'])
  })

  it('wirft bei unbekanntem Abrechnungszeitraum', () => {
    expect(() =>
      checkReceiptFolder(validData(), { billingPeriodId: 'x', files }),
    ).toThrow(/Abrechnungszeitraum/)
  })
})

describe('compareReceiptAmounts (E-41-2)', () => {
  function amounts(
    entries: { id: string; receiptReference: string; amountCents: number }[],
  ) {
    const data = validData()
    data.billingData.costEntries = entries.map((entry) => ({
      costCategoryId: 'category-1',
      ...entry,
    }))
    return data
  }

  it('vergleicht den Rechnungsbetrag mit der Summe der Kostenpositionen', () => {
    const result = compareReceiptAmounts(
      amounts([
        { id: 'a', receiptReference: 'Wasser.pdf', amountCents: 60_000 },
        { id: 'b', receiptReference: 'wasser', amountCents: 40_000 },
        { id: 'c', receiptReference: 'Versicherung.pdf', amountCents: 50_000 },
        { id: 'd', receiptReference: 'Muell.pdf', amountCents: 30_001 },
      ]),
      {
        billingPeriodId: 'period-1',
        receipts: [
          // auf zwei Kostenarten aufgeteilt: Summe zählt
          { receiptReference: 'Wasser.pdf', amountCents: 100_000 },
          // abweichender Betrag
          { receiptReference: 'Versicherung.pdf', amountCents: 55_000 },
          // 1 Cent Rundung gilt als gleich
          { receiptReference: '2025/Muell.pdf', amountCents: 30_000 },
          // nicht angesetzt
          { receiptReference: 'Schornsteinfeger.pdf', amountCents: 9_000 },
        ],
      },
    )
    expect(result.matched).toBe(2)
    expect(result.mismatches).toEqual([
      expect.objectContaining({
        receiptReference: 'Versicherung.pdf',
        receiptAmountCents: 55_000,
        bookedAmountCents: 50_000,
        differenceCents: -5_000,
        partialPeriod: false,
        sources: [{ kind: 'costEntry', id: 'c' }],
      }),
    ])
    expect(result.notBooked).toEqual(['Schornsteinfeger.pdf'])
  })

  it('fasst Zeilen derselben Rechnung zusammen und kennzeichnet Teilzeiträume', () => {
    const result = compareReceiptAmounts(
      amounts([{ id: 'a', receiptReference: 'Gas.pdf', amountCents: 60_000 }]),
      {
        billingPeriodId: 'period-1',
        receipts: [
          {
            receiptReference: 'Gas.pdf',
            amountCents: 70_000,
            serviceFrom: '2024-07-01',
            serviceTo: '2025-06-30',
          },
          {
            receiptReference: 'Gas.pdf',
            amountCents: 50_000,
            serviceFrom: '2024-07-01',
            serviceTo: '2025-06-30',
          },
          // ganz außerhalb des Abrechnungszeitraums: nicht Teil dieses Jahres
          {
            receiptReference: 'Alt.pdf',
            amountCents: 1_000,
            serviceFrom: '2023-01-01',
            serviceTo: '2023-12-31',
          },
        ],
      },
    )
    expect(result.mismatches).toEqual([
      expect.objectContaining({
        receiptReference: 'Gas.pdf',
        receiptAmountCents: 120_000,
        bookedAmountCents: 60_000,
        partialPeriod: true,
        serviceFrom: '2024-07-01',
        serviceTo: '2025-06-30',
      }),
    ])
    expect(result.notBooked).toEqual([])
    expect(result.outsidePeriod).toEqual(['Alt.pdf'])
  })

  it('wirft bei unbekanntem Abrechnungszeitraum', () => {
    expect(() =>
      compareReceiptAmounts(validData(), {
        billingPeriodId: 'x',
        receipts: [],
      }),
    ).toThrow(/Abrechnungszeitraum/)
  })
})
