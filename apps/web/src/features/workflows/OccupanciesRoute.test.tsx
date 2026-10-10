import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OccupanciesRoute } from './OccupanciesRoute'

afterEach(cleanup)
function fixture(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      buildings: [
        { id: 'b', propertyId: 'p', name: 'Haus Nord', mandateRefPrefixes: [] },
      ],
      units: [
        {
          id: 'u',
          propertyId: 'p',
          buildingId: 'b',
          label: 'Wohnung 1',
          location: 'EG links',
          usableAreaSqm: { value: 61.5, unit: 'm2' },
        },
        { id: 'empty', propertyId: 'p', label: 'Wohnung 2' },
        { id: 'other', propertyId: 'other', label: 'Fremde Wohnung' },
      ],
      persons: [
        { id: 'a', organizationId: 'org', displayName: 'Fiktiv Alt' },
        { id: 'n', organizationId: 'org', displayName: 'Fiktiv Neu' },
      ],
      tenancies: [
        { id: 'ta', unitId: 'u', personIds: ['a'] },
        { id: 'tn', unitId: 'u', personIds: ['n'] },
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'y',
          propertyId: 'p',
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'DRAFT',
        },
      ],
      occupancyPeriods: [
        {
          id: 'new',
          unitId: 'u',
          billingPeriodId: 'y',
          kind: 'tenant',
          tenancyId: 'tn',
          from: '2026-09-01',
        },
        {
          id: 'old',
          unitId: 'u',
          billingPeriodId: 'y',
          kind: 'tenant',
          tenancyId: 'ta',
          to: '2026-06-30',
        },
        {
          id: 'vac',
          unitId: 'u',
          billingPeriodId: 'y',
          kind: 'vacancy',
          from: '2026-07-01',
          to: '2026-08-31',
        },
        {
          id: 'foreign',
          unitId: 'empty',
          billingPeriodId: 'other-year',
          kind: 'vacancy',
        },
      ],
    },
  }
}
function show(data = fixture()) {
  return render(
    <OccupanciesRoute
      data={data}
      selection={{
        ownerCompanyId: null,
        propertyId: 'p',
        billingPeriodId: 'y',
      }}
      onApply={vi.fn()}
      onSelectionChange={vi.fn()}
    />,
  )
}
describe('Wohnungsbezogene Belegungsübersicht', () => {
  it('zeigt alle Wohnungen vor der Erfassung und sortiert Zeiträume chronologisch', () => {
    show()
    const overview = screen.getByRole('region', {
      name: 'Wohnungen und Belegungen (2)',
    })
    const unit = within(overview).getByRole('region', { name: 'Wohnung 1' })
    expect(unit).toHaveTextContent('Haus Nord')
    expect(unit).toHaveTextContent('EG links')
    expect(unit).toHaveTextContent('61,5 m²')
    const rows = within(unit).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Fiktiv Alt')
    expect(rows[2]).toHaveTextContent('Leerstand')
    expect(rows[3]).toHaveTextContent('Fiktiv Neu')
    expect(
      within(overview).getByRole('region', { name: 'Wohnung 2' }),
    ).toHaveTextContent('Keine Belegung erfasst')
    expect(overview).not.toHaveTextContent('Fremde Wohnung')
    expect(
      overview.compareDocumentPosition(
        screen.getByRole('heading', { name: 'Neue Belegung erfassen' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
  it('sucht Wohnungen über Nutzer, Gebäude und Lage und bewahrt die gesamte Zeitleiste', () => {
    show()
    fireEvent.change(screen.getByLabelText('Wohnungen durchsuchen'), {
      target: { value: 'Fiktiv Neu' },
    })
    expect(screen.getByRole('status')).toHaveTextContent('1 Wohnung')
    expect(screen.getByRole('region', { name: 'Wohnung 1' })).toHaveTextContent(
      'Fiktiv Alt',
    )
    expect(screen.getByRole('region', { name: 'Wohnung 1' })).toHaveTextContent(
      'Leerstand',
    )
    for (const value of ['Haus Nord', 'EG links']) {
      fireEvent.change(screen.getByLabelText('Wohnungen durchsuchen'), {
        target: { value },
      })
      expect(screen.getByRole('status')).toHaveTextContent('1 Wohnung')
    }
    fireEvent.change(screen.getByLabelText('Wohnungen durchsuchen'), {
      target: { value: 'unbekannt' },
    })
    expect(
      screen.getByText('Für diese Suche wurden keine Wohnungen gefunden.'),
    ).toBeVisible()
  })
  it('weist beim Anlegen eines Einzugs oder Leerstands auf die Zwischenablesung hin', () => {
    const data = fixture()
    data.billingData.heatingCircuits = [
      {
        id: 'c',
        billingPeriodId: 'y',
        heatingSystemId: 'hs',
        buildingId: 'b',
        hasCentralHotWater: false,
      },
    ]
    show(data)
    expect(screen.queryByRole('note')).toBeNull()
    fireEvent.change(screen.getByLabelText('Einzug'), {
      target: { value: '2026-05-01' },
    })
    expect(screen.getByRole('note')).toHaveTextContent(
      'Zwischenablesung zum 01.05.2026 veranlassen (§ 9b Abs. 1 HeizKV)',
    )
    fireEvent.change(screen.getByLabelText('Einzug'), {
      target: { value: '2026-01-01' },
    })
    expect(screen.queryByRole('note')).toBeNull()
    fireEvent.change(screen.getByLabelText('Leerstand bis'), {
      target: { value: '2026-02-28' },
    })
    expect(screen.getByRole('note')).toHaveTextContent(
      'Zwischenablesung zum 28.02.2026',
    )
  })
  it('filtert nach erfasster Belegung und zählt Wohnungen statt Zeiträume', () => {
    show()
    fireEvent.change(screen.getByLabelText('Belegungsstatus'), {
      target: { value: 'vacancy' },
    })
    expect(screen.getByRole('status')).toHaveTextContent('1 Wohnung')
    expect(screen.getByRole('region', { name: 'Wohnung 1' })).toHaveTextContent(
      'Fiktiv Alt',
    )
    fireEvent.change(screen.getByLabelText('Belegungsstatus'), {
      target: { value: 'empty' },
    })
    expect(screen.getByRole('region', { name: 'Wohnung 2' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Wohnung 1' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Belegungsstatus'), {
      target: { value: 'tenant' },
    })
    expect(screen.getByRole('region', { name: 'Wohnung 1' })).toBeVisible()
  })
})
