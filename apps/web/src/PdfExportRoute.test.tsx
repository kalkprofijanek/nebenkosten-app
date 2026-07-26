import type { CalculationOutput } from '@nebenkosten/core'
import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PdfExportRoute } from './PdfExportRoute'

const renderPdfBlob = vi.fn()
const renderZipBlob = vi.fn()
const downloadBlob = vi.fn()
const sha256Hex = vi.fn<(...args: unknown[]) => Promise<string>>(async () =>
  'a'.repeat(64),
)
const blobBytes = vi.fn<(...args: unknown[]) => Promise<Uint8Array>>(
  async () => new Uint8Array([1, 2, 3]),
)

vi.mock('./features/pdf/render', () => ({
  renderPdfBlob: (...args: unknown[]) => renderPdfBlob(...args),
  renderZipBlob: (...args: unknown[]) => renderZipBlob(...args),
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
  sha256Hex: (...args: unknown[]) => sha256Hex(...args),
  blobBytes: (...args: unknown[]) => blobBytes(...args),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const PERIOD_ID = '50000000-0000-4000-8000-000000000001'
const PROPERTY_ID = '50000000-0000-4000-8000-000000000002'
const OWNER_ID = '50000000-0000-4000-8000-000000000003'
const UNIT_ID = '50000000-0000-4000-8000-000000000004'
const TENANCY_ID = '50000000-0000-4000-8000-000000000005'
const PERSON_ID = '50000000-0000-4000-8000-000000000006'
const OCCUPANCY_ID = '50000000-0000-4000-8000-000000000007'
const RUN_ID = '50000000-0000-4000-8000-000000000008'
const RESULT_ID = '50000000-0000-4000-8000-000000000009'

function calculationOutput(): CalculationOutput {
  return {
    snapshotFormatVersion: 3,
    periodDays: 365,
    totals: {
      recordedCostsCents: 1000,
      tenantTotalCents: 1000,
      landlordTotalCents: 0,
      unallocatedCents: 0,
      prepaymentsCents: 0,
      controlDifferenceCents: 0,
      directCostsCents: 0,
      internalCostsCents: 0,
    },
    heating: {
      totalCents: 0,
      baseCostsCents: 0,
      consumptionCostsCents: 0,
      fuelConsumptionCents: 0,
      unallocatedLandlordCents: 0,
      perCircuit: [],
      operatingElectricity: {
        sourceBudgetCents: 0,
        intendedCents: 0,
        movedCents: 0,
        uncoveredCents: 0,
        sources: [],
      },
      trace: {
        traceFormatVersion: 1,
        operatingElectricity: {
          sourceBudgetCents: 0,
          intendedCents: 0,
          movedCents: 0,
          uncoveredCents: 0,
          sources: [],
        },
        circuits: [],
      },
    },
    co2: { totalCostCents: 0, tenantCents: 0, landlordCents: 0 },
    vacancyLandlordCents: 0,
    tenants: [
      {
        id: OCCUPANCY_ID,
        isVacancy: false,
        shareCents: 1000,
        prepaymentCents: 800,
        balanceCents: 200,
        status: 'gruen',
        costBreakdown: {
          operatingByCategory: [],
          heatingBaseCents: 0,
          heatingConsumptionCents: 0,
          hotWaterCents: 0,
          heatingCo2Cents: 0,
        },
      },
    ],
    warnings: [],
  }
}

function fixtureAppData(
  overrides: {
    shippingAddress?: boolean
    status?: 'READY_FOR_PDF' | 'FINALIZED' | 'DRAFT'
    snapshotFormatVersion?: number
  } = {},
): AppDataFile {
  const empty = createEmptyAppDataFile()
  const withAddress = overrides.shippingAddress ?? true
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      ownerCompanies: [
        {
          id: OWNER_ID,
          organizationId: '50000000-0000-4000-8000-00000000000a',
          name: 'Beispiel GmbH',
          additionalNameLines: [],
          address: {
            street: 'Verwalterstraße',
            postalCodeAndCity: '00000 Musterstadt',
          },
        },
      ],
      properties: [
        {
          id: PROPERTY_ID,
          ownerCompanyId: OWNER_ID,
          address: {
            street: 'Objektweg',
            postalCodeAndCity: '00000 Musterstadt',
          },
        },
      ],
      units: [{ id: UNIT_ID, propertyId: PROPERTY_ID, label: 'WE 1' }],
      persons: [
        {
          id: PERSON_ID,
          organizationId: '50000000-0000-4000-8000-00000000000a',
          displayName: 'Anna Müller',
        },
      ],
      tenancies: [
        {
          id: TENANCY_ID,
          unitId: UNIT_ID,
          personIds: [PERSON_ID],
          ...(withAddress
            ? {
                shippingAddressStreet: 'Musterweg',
                shippingAddressPostalCodeAndCity: '00000 Musterstadt',
              }
            : {}),
        },
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: PERIOD_ID,
          propertyId: PROPERTY_ID,
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: overrides.status ?? 'READY_FOR_PDF',
        },
      ],
      occupancyPeriods: [
        {
          id: OCCUPANCY_ID,
          billingPeriodId: PERIOD_ID,
          unitId: UNIT_ID,
          tenancyId: TENANCY_ID,
          kind: 'tenant',
        },
      ],
      calculationRuns: [
        {
          id: RUN_ID,
          billingPeriodId: PERIOD_ID,
          startedAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      calculationResults: [
        {
          id: RESULT_ID,
          calculationRunId: RUN_ID,
          totals: {
            recordedCostsCents: 1000,
            tenantTotalCents: 1000,
            landlordTotalCents: 0,
            unallocatedCents: 0,
            prepaymentsCents: 0,
            controlDifferenceCents: 0,
          },
          warnings: [],
          snapshotFormatVersion: overrides.snapshotFormatVersion ?? 3,
          resultSnapshot: {
            ...calculationOutput(),
            snapshotFormatVersion: overrides.snapshotFormatVersion ?? 3,
          },
        },
      ],
    },
  }
}

describe('PdfExportRoute', () => {
  it('zeigt einen Hinweis ohne gewähltes Abrechnungsjahr', () => {
    render(
      <PdfExportRoute
        data={fixtureAppData()}
        billingPeriodId={null}
        onApply={() => true}
      />,
    )
    expect(screen.getByText(/Wähle zuerst ein Objekt/)).toBeVisible()
  })

  it('zeigt einen Sperrhinweis vor READY_FOR_PDF', () => {
    render(
      <PdfExportRoute
        data={fixtureAppData({ status: 'DRAFT' })}
        billingPeriodId={PERIOD_ID}
        onApply={() => true}
      />,
    )
    expect(screen.getByText(/Noch nicht bereit/)).toBeVisible()
  })

  it('meldet fehlende Berechnung', () => {
    const data = fixtureAppData()
    data.billingData.calculationRuns = []
    render(
      <PdfExportRoute
        data={data}
        billingPeriodId={PERIOD_ID}
        onApply={() => true}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/noch keine Berechnung/)
  })

  it('fordert bei einem alten Berechnungsstand eine Neuberechnung an', () => {
    render(
      <PdfExportRoute
        data={fixtureAppData({ snapshotFormatVersion: 2 })}
        billingPeriodId={PERIOD_ID}
        onApply={() => true}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/neu berechnen/i)
  })

  it('erzeugt eine Einzelabrechnung, löst den Download aus und speichert das Dokument', async () => {
    renderPdfBlob.mockResolvedValue(new Blob(['pdf']))
    const onApply = vi.fn((transform: (data: AppDataFile) => AppDataFile) => {
      transform(fixtureAppData())
      return true
    })
    render(
      <PdfExportRoute
        data={fixtureAppData()}
        billingPeriodId={PERIOD_ID}
        onApply={onApply}
      />,
    )

    const tenantItem = screen.getByText('WE 1').closest('li')!
    fireEvent.click(
      within(tenantItem).getByRole('button', { name: /Einzelabrechnung/ }),
    )

    await screen.findByText('WE 1')
    expect(renderPdfBlob).toHaveBeenCalled()
    expect(downloadBlob).toHaveBeenCalled()
    expect(onApply).toHaveBeenCalled()
    expect(onApply.mock.invocationCallOrder[0]).toBeLessThan(
      downloadBlob.mock.invocationCallOrder[0]!,
    )
    const transformed = onApply.mock.calls[0]![0](fixtureAppData())
    expect(transformed.billingData.documents.at(-1)).toMatchObject({
      kind: 'tenant_statement',
      calculationRunId: RUN_ID,
      occupancyPeriodId: OCCUPANCY_ID,
    })
  })

  it('zeigt einen Fehler bei fehlender Versandadresse', async () => {
    renderPdfBlob.mockResolvedValue(new Blob(['pdf']))
    const data = fixtureAppData({ shippingAddress: false })
    render(
      <PdfExportRoute
        data={data}
        billingPeriodId={PERIOD_ID}
        onApply={() => true}
      />,
    )

    const tenantItem = screen.getByText('WE 1').closest('li')!
    fireEvent.click(
      within(tenantItem).getByRole('button', { name: /Einzelabrechnung/ }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/Versandadresse/)
  })

  it('erzeugt die Gesamtabrechnung', async () => {
    renderPdfBlob.mockResolvedValue(new Blob(['pdf']))
    const onApply = vi.fn(
      (_transform: (data: AppDataFile) => AppDataFile) => true,
    )
    render(
      <PdfExportRoute
        data={fixtureAppData()}
        billingPeriodId={PERIOD_ID}
        onApply={onApply}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Gesamtabrechnung/ }))

    await vi.waitFor(() => expect(downloadBlob).toHaveBeenCalled())
    expect(onApply).toHaveBeenCalled()
    expect(onApply.mock.invocationCallOrder[0]).toBeLessThan(
      downloadBlob.mock.invocationCallOrder[0]!,
    )
    const transformed = onApply.mock.calls[0]![0](fixtureAppData())
    expect(transformed.billingData.documents.at(-1)).toMatchObject({
      kind: 'combined_statement',
      calculationRunId: RUN_ID,
    })
  })

  it('erzeugt das ZIP-Bündel aller Einzelabrechnungen', async () => {
    renderPdfBlob.mockResolvedValue(new Blob(['pdf']))
    renderZipBlob.mockResolvedValue(new Blob(['zip']))
    const onApply = vi.fn((transform: (data: AppDataFile) => AppDataFile) => {
      const transformed = transform(fixtureAppData())
      expect(transformed.billingData.documents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'tenant_statement',
            calculationRunId: RUN_ID,
            occupancyPeriodId: OCCUPANCY_ID,
          }),
          expect.objectContaining({
            kind: 'zip_bundle',
            calculationRunId: RUN_ID,
          }),
        ]),
      )
      return true
    })
    render(
      <PdfExportRoute
        data={fixtureAppData()}
        billingPeriodId={PERIOD_ID}
        onApply={onApply}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /ZIP/ }))

    await vi.waitFor(() => expect(renderZipBlob).toHaveBeenCalled())
    expect(downloadBlob).toHaveBeenCalled()
    expect(onApply).toHaveBeenCalled()
  })

  it('zeigt bereits erzeugte Dokumente an', () => {
    const data = fixtureAppData()
    data.billingData.documents = [
      {
        id: 'doc-1',
        billingPeriodId: PERIOD_ID,
        kind: 'combined_statement',
        createdAt: '2026-01-15T10:00:00.000Z',
        fileName: 'NK_2026_Kostenaufstellung.pdf',
      },
    ]
    render(
      <PdfExportRoute
        data={data}
        billingPeriodId={PERIOD_ID}
        onApply={() => true}
      />,
    )
    expect(screen.getByText('NK_2026_Kostenaufstellung.pdf')).toBeVisible()
  })

  it('meldet, wenn der Dokumenteneintrag nicht gespeichert werden kann', async () => {
    renderPdfBlob.mockResolvedValue(new Blob(['pdf']))
    render(
      <PdfExportRoute
        data={fixtureAppData()}
        billingPeriodId={PERIOD_ID}
        onApply={() => false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Gesamtabrechnung/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /nicht gespeichert/,
    )
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('meldet unbekannte Fehler generisch', async () => {
    renderPdfBlob.mockRejectedValue('kein Error-Objekt')
    render(
      <PdfExportRoute
        data={fixtureAppData()}
        billingPeriodId={PERIOD_ID}
        onApply={() => true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Gesamtabrechnung/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Das Dokument konnte nicht erzeugt werden/,
    )
  })
})
