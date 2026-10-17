import { describe, expect, it } from 'vitest'
import {
  checkReceiptFolder,
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
